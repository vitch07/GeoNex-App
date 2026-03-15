export interface Photo {
  id: string;
  feature_id: string;
  file_path: string;
  is_360: boolean;
  metadata: {
    latitude?: number;
    longitude?: number;
    bearing?: number;
    width?: number;
    height?: number;
    [key: string]: unknown;
  };
  captured_at: string;
}

export interface UploadPhotoRequest {
  feature_id: string;
  is_360: boolean;
  metadata?: Record<string, unknown>;
}
