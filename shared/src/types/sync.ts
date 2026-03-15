import type { Feature } from './feature';

export interface SyncPullRequest {
  last_sync_version: number;
  assignment_id: string;
}

export interface SyncPullResponse {
  features: Feature[];
  current_version: number;
  has_more: boolean;
}

export interface SyncPushRequest {
  assignment_id: string;
  features: Feature[];
  device_id: string;
}

export interface SyncPushResponse {
  synced_count: number;
  conflicts: SyncConflict[];
  new_version: number;
}

export interface SyncConflict {
  feature_id: string;
  local_version: number;
  server_version: number;
  resolution: 'server_wins';
  server_feature: Feature;
}

export interface SyncLog {
  id: string;
  user_id: string;
  device_id: string;
  sync_type: 'pull' | 'push';
  status: 'success' | 'partial' | 'failed';
  features_count: number;
  synced_at: string;
}
