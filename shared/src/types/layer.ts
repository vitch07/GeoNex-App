export type GeometryType = 'Point' | 'LineString' | 'Polygon';

export interface AttributeSchema {
  name: string;
  type: 'text' | 'number' | 'boolean' | 'date' | 'select';
  required: boolean;
  options?: string[]; // For 'select' type
  default_value?: string | number | boolean;
}

export interface Layer {
  id: string;
  project_id: string;
  name: string;
  geometry_type: GeometryType;
  schema: AttributeSchema[];
  created_at: string;
}

export interface CreateLayerRequest {
  project_id: string;
  name: string;
  geometry_type: GeometryType;
  schema: AttributeSchema[];
}
