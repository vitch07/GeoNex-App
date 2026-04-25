import api, { getBaseUrl } from '../config/api';
import NetInfo from '@react-native-community/netinfo';
import {
  getUnsyncedFeatures,
  markFeaturesSynced,
  saveFeatureLocally,
  getSyncVersion,
  updateSyncVersion,
  cacheAssignments,
  cacheLayers,
  getDatabase,
  getCachedAssignments,
} from '../database/LocalDatabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SyncResult {
  pulled: number;
  pushed: number;
  conflicts: number;
  photosUploaded: number;
  success: boolean;
  error?: string;
}

let autoSyncUnsubscribe: (() => void) | null = null;
let isSyncing = false;

// Helper: extract data from API response which wraps in { success, data }
function extractData(response: any): any {
  if (response && response.data !== undefined) return response.data;
  return response;
}

export async function syncAssignment(assignmentId: string): Promise<SyncResult> {
  const result: SyncResult = { pulled: 0, pushed: 0, conflicts: 0, photosUploaded: 0, success: false };

  try {
    // Step 1: Push local changes
    const unsyncedFeatures = await getUnsyncedFeatures();
    if (unsyncedFeatures.length > 0) {
      const pushResponse = await api.post<any>('/sync/push', {
        assignment_id: assignmentId,
        features: unsyncedFeatures,
        device_id: 'expo-mobile',
      });
      const pushData = extractData(pushResponse);

      result.pushed = pushData.synced_count || 0;
      result.conflicts = pushData.conflicts?.length || 0;

      const syncedIds = unsyncedFeatures
        .filter((f) => !pushData.conflicts?.find((c: any) => c.feature_id === f.id))
        .map((f) => f.id);
      await markFeaturesSynced(syncedIds);

      for (const conflict of (pushData.conflicts || [])) {
        if (conflict.server_feature) {
          await saveFeatureLocally({
            ...conflict.server_feature,
            sync_status: 'synced',
          });
        }
      }
    }

    // Step 2: Pull server changes
    const lastVersion = await getSyncVersion(assignmentId);
    const pullResponse = await api.get<any>(
      `/sync/pull?assignment_id=${assignmentId}&last_sync_version=${lastVersion}`
    );
    const pullData = extractData(pullResponse);

    for (const feature of (pullData.features || [])) {
      await saveFeatureLocally({
        ...feature,
        sync_status: 'synced',
      });
    }

    result.pulled = pullData.features?.length || 0;
    if (pullData.current_version) {
      await updateSyncVersion(assignmentId, pullData.current_version);
    }

    result.success = true;
  } catch (error: any) {
    result.error = error.message || 'Sync failed';
  }

  return result;
}

export async function syncPhotos(): Promise<number> {
  const database = await getDatabase();
  const rows = await database.getAllAsync(
    'SELECT * FROM local_photos WHERE uploaded = 0'
  );

  let uploadedCount = 0;
  const token = await AsyncStorage.getItem('geonex_token');
  const baseUrl = getBaseUrl();

  for (const photo of rows as any[]) {
    try {
      const formData = new FormData();
      formData.append('photo', {
        uri: photo.file_path,
        type: 'image/jpeg',
        name: `photo_${photo.id}.jpg`,
      } as any);
      formData.append('feature_id', photo.feature_id);
      formData.append('is_360', photo.is_360 ? 'true' : 'false');
      formData.append('metadata', photo.metadata_json || '{}');

      const response = await fetch(`${baseUrl}/api/photos/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (response.ok) {
        await database.runAsync(
          'UPDATE local_photos SET uploaded = 1 WHERE id = ?',
          photo.id
        );
        uploadedCount++;
      }
    } catch (error) {
      console.error(`Failed to upload photo ${photo.id}:`, error);
    }
  }

  return uploadedCount;
}

export async function syncAllData(): Promise<void> {
  try {
    const assignmentsResponse = await api.get<any>('/assignments');
    const assignmentsData = extractData(assignmentsResponse);
    const assignments = Array.isArray(assignmentsData) ? assignmentsData : [];
    await cacheAssignments(assignments);

    const layersResponse = await api.get<any>('/layers');
    const layersData = extractData(layersResponse);
    const layers = Array.isArray(layersData) ? layersData : [];
    await cacheLayers(layers);
  } catch (error) {
    console.error('Failed to sync base data:', error);
  }
}

export async function isOnline(): Promise<boolean> {
  try {
    const baseUrl = getBaseUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await fetch(`${baseUrl}/api/health`, { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

// Auto-sync: performs a full sync cycle when connectivity is available
async function performAutoSync(): Promise<void> {
  if (isSyncing) return;

  const token = await AsyncStorage.getItem('geonex_token');
  if (!token) return; // Not logged in

  const online = await isOnline();
  if (!online) return;

  isSyncing = true;
  try {
    // Sync base data
    await syncAllData();

    // Sync each assignment
    const assignments = await getCachedAssignments();
    for (const assignment of assignments) {
      await syncAssignment(assignment.id);
    }

    // Upload pending photos
    await syncPhotos();

    console.log('[AutoSync] Sync completed successfully');
  } catch (error) {
    console.error('[AutoSync] Sync failed:', error);
  } finally {
    isSyncing = false;
  }
}

// Start automatic sync: listens for network changes and syncs when device comes online
export function startAutoSync(): () => void {
  if (autoSyncUnsubscribe) {
    autoSyncUnsubscribe();
  }

  let wasOffline = false;

  const unsubscribe = NetInfo.addEventListener((state) => {
    const isConnected = state.isConnected && state.isInternetReachable !== false;

    if (isConnected && wasOffline) {
      console.log('[AutoSync] Network restored, triggering sync...');
      performAutoSync();
    }

    wasOffline = !isConnected;
  });

  // Periodic sync every 5 minutes when online and has pending changes
  const intervalId = setInterval(async () => {
    const state = await NetInfo.fetch();
    if (state.isConnected && state.isInternetReachable !== false) {
      const unsynced = await getUnsyncedFeatures();
      if (unsynced.length > 0) {
        console.log(`[AutoSync] Periodic sync: ${unsynced.length} pending changes`);
        performAutoSync();
      }
    }
  }, 5 * 60 * 1000);

  autoSyncUnsubscribe = () => {
    unsubscribe();
    clearInterval(intervalId);
  };

  // Initial sync attempt
  performAutoSync();

  return autoSyncUnsubscribe;
}

export function stopAutoSync(): void {
  if (autoSyncUnsubscribe) {
    autoSyncUnsubscribe();
    autoSyncUnsubscribe = null;
  }
}
