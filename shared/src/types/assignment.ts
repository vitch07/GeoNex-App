import type { GeoJSONGeometry } from './feature';

export type AssignmentStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface WorkAssignment {
  id: string;
  project_id: string;
  assigned_to: string;
  area: GeoJSONGeometry;
  status: AssignmentStatus;
  due_date: string | null;
  created_at: string;
  // Populated fields
  project_name?: string;
  assigned_user?: string;
}

export interface CreateAssignmentRequest {
  project_id: string;
  assigned_to: string;
  area: GeoJSONGeometry;
  due_date?: string;
}

export interface UpdateAssignmentRequest {
  status?: AssignmentStatus;
  area?: GeoJSONGeometry;
  due_date?: string;
}
