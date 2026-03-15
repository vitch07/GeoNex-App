import api, { getBaseUrl } from '../config/api';
import {
  getUnsyncedFeatures,
  markFeaturesSynced,
  saveFeatureLocally,
  getSyncVersion,
  updateSyncVersion,
  cacheAssignments,
  cacheLayers,
  getDatabase,
} from '../database/LocalDatabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SyncResult {
  pulled: number;
  pushed: number;
  conflicts: number;
  success: boolean;
  error?: string;
}

export async function syncAssignment(assignmentId: string): Promise<SyncResult> {
  const result: SyncResult = { pulled: 0, pushed: 0, conflicts: 0, success: false };

  try {
    // Step 1: Push local changes
    const unsyncedFeatures = await getUnsyncedFeatures();
    if (unsyncedFeatures.length > 0) {
      const pushData = await api.post<any>('/sync/push', {
        assignment_id: assignmentId,
        features: unsyncedFeatures,
        device_id: 'expo-mobile',
      });

      result.pushed = pushData.synced_count || 0;
      result.conflicts = pushData.conflicts?.length || 0;

      const syncedIds = unsyncedFeatures
        .filter((f) => !pushData.conflicts?.find((c: any) => c.feature_id === f.id))
        .map((f) => f.id);
      await markFeaturesSynced(syncedIds);

      for (const conflict of (pushData.conflicts || [])) {
        await saveFeatureLocally({
          ...conflict.server_feature,
          sync_status: 'synced',
        });
      }
    }

    // Step 2: Pull server changes
    const lastVersion = await getSyncVersion(assignmentId);
    const pullData = await api.get<any>(
      `/sync/pull?assignment_id=${assignmentId}&last_sync_version=${lastVersion}`
    );

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
    const assignments = await api.get<any>('/assignments');
    await cacheAssignments(Array.isArray(assignments) ? assignments : (assignments.data || []));

    const layers = await api.get<any>('/layers');
    await cacheLayers(Array.isArray(layers) ? layers : (layers.data || []));
  } catch (error) {
    console.error('Failed to sync base data:', error);
  }
}

export async function isOnline(): Promise<boolean> {
  try {
    const baseUrl = getBaseUrl();
    await fetch(`${baseUrl}/api/health`, { method: 'GET' });
    return true;
  } catch {
    return false;
  }
}
