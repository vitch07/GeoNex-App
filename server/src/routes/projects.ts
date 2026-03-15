import { Router, Response } from 'express';
import { query } from '../config/database';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/projects
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT p.*, ST_AsGeoJSON(p.boundary)::jsonb as boundary, u.username as creator_name
       FROM projects p
       LEFT JOIN users u ON p.created_by = u.id
       ORDER BY p.created_at DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch projects' });
  }
});

// GET /api/projects/:id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT p.*, ST_AsGeoJSON(p.boundary)::jsonb as boundary
       FROM projects p WHERE p.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch project' });
  }
});

// POST /api/projects (admin only)
router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, boundary } = req.body;
    const boundarySQL = boundary ? `ST_GeomFromGeoJSON($4)` : 'NULL';

    const params: unknown[] = [name, description || '', req.user!.id];
    if (boundary) params.push(JSON.stringify(boundary));

    const result = await query(
      `INSERT INTO projects (name, description, created_by, boundary)
       VALUES ($1, $2, $3, ${boundarySQL})
       RETURNING id, name, description, created_by, created_at, ST_AsGeoJSON(boundary)::jsonb as boundary`,
      params
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to create project' });
  }
});

// PUT /api/projects/:id (admin only)
router.put('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, boundary } = req.body;
    const result = await query(
      `UPDATE projects SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        boundary = CASE WHEN $3::text IS NOT NULL THEN ST_GeomFromGeoJSON($3) ELSE boundary END
       WHERE id = $4
       RETURNING id, name, description, created_by, created_at, ST_AsGeoJSON(boundary)::jsonb as boundary`,
      [name, description, boundary ? JSON.stringify(boundary) : null, req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to update project' });
  }
});

// DELETE /api/projects/:id (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('DELETE FROM projects WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }
    res.json({ success: true, message: 'Project deleted' });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to delete project' });
  }
});

export default router;
