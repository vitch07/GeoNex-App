import { Router, Response } from 'express';
import { query } from '../config/database';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/assignments
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.user!.role === 'admin';
    const whereClause = isAdmin ? '' : 'WHERE wa.assigned_to = $1';
    const params = isAdmin ? [] : [req.user!.id];

    const result = await query(
      `SELECT wa.*, ST_AsGeoJSON(wa.area)::jsonb as area,
              p.name as project_name, u.username as assigned_user
       FROM work_assignments wa
       JOIN projects p ON wa.project_id = p.id
       JOIN users u ON wa.assigned_to = u.id
       ${whereClause}
       ORDER BY wa.created_at DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch assignments' });
  }
});

// GET /api/assignments/:id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT wa.*, ST_AsGeoJSON(wa.area)::jsonb as area,
              p.name as project_name, u.username as assigned_user
       FROM work_assignments wa
       JOIN projects p ON wa.project_id = p.id
       JOIN users u ON wa.assigned_to = u.id
       WHERE wa.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Assignment not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch assignment' });
  }
});

// POST /api/assignments (admin only)
router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { project_id, assigned_to, area, due_date } = req.body;

    // Check if assignment area is within project boundary (if boundary exists)
    const projectResult = await query(
      `SELECT boundary IS NOT NULL as has_boundary,
              CASE WHEN boundary IS NOT NULL
                THEN ST_Contains(boundary, ST_GeomFromGeoJSON($2))
                ELSE true
              END as within_boundary
       FROM projects WHERE id = $1`,
      [project_id, JSON.stringify(area)]
    );
    if (projectResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }
    if (!projectResult.rows[0].within_boundary) {
      res.status(400).json({ success: false, error: 'Assignment area must be within the project boundary' });
      return;
    }

    const result = await query(
      `INSERT INTO work_assignments (project_id, assigned_to, area, due_date)
       VALUES ($1, $2, ST_GeomFromGeoJSON($3), $4)
       RETURNING id, project_id, assigned_to, status, due_date, created_at,
                 ST_AsGeoJSON(area)::jsonb as area`,
      [project_id, assigned_to, JSON.stringify(area), due_date || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to create assignment' });
  }
});

// PUT /api/assignments/:id
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { status, area, due_date, assigned_to } = req.body;
    const result = await query(
      `UPDATE work_assignments SET
        status = COALESCE($1, status),
        area = CASE WHEN $2::text IS NOT NULL THEN ST_GeomFromGeoJSON($2) ELSE area END,
        due_date = COALESCE($3, due_date),
        assigned_to = COALESCE($4, assigned_to)
       WHERE id = $5
       RETURNING id, project_id, assigned_to, status, due_date, created_at,
                 ST_AsGeoJSON(area)::jsonb as area`,
      [status, area ? JSON.stringify(area) : null, due_date, assigned_to || null, req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Assignment not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to update assignment' });
  }
});

// DELETE /api/assignments/:id (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('DELETE FROM work_assignments WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Assignment not found' });
      return;
    }
    res.json({ success: true, message: 'Assignment deleted' });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to delete assignment' });
  }
});

export default router;
