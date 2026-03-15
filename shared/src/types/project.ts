import type { GeoJSONGeometry } from './feature';

export interface Project {
  id: string;
  name: string;
  description: string;
  boundary: GeoJSONGeometry | null;
  created_by: string;
  created_at: string;
}

export interface CreateProjectRequest {
  name: string;
  description: string;
  boundary?: GeoJSONGeometry;
}
