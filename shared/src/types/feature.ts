export type GeoJSONGeometry = {
  type: 'Point';
  coordinates: [number, number];
} | {
  type: 'LineString';
  coordinates: [number, number][];
} | {
  type: 'Polygon';
  coordinates: [number, number][][];
} | {
  type: 'MultiPoint';
  coordinates: [number, number][];
} | {
  type: 'MultiLineString';
  coordinates: [number, number][][];
} | {
  type: 'MultiPolygon';
  coordinates: [number, number][][][];
};

export type SyncStatus = 'synced' | 'new' | 'modified' | 'deleted';

export interface Feature {
  id: string;
  layer_id: string;
  geometry: GeoJSONGeometry;
  properties: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
  sync_version: number;
  sync_status?: SyncStatus; // Used on mobile only
}

export interface GeoJSONFeature {
  type: 'Feature';
  id: string;
  geometry: GeoJSONGeometry;
  properties: Record<string, unknown> & {
    layer_id: string;
    created_by: string;
    sync_version: number;
  };
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

export interface CreateFeatureRequest {
  layer_id: string;
  geometry: GeoJSONGeometry;
  properties: Record<string, unknown>;
}

export interface UpdateFeatureRequest {
  geometry?: GeoJSONGeometry;
  properties?: Record<string, unknown>;
}
