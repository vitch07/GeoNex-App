import { Router, Response } from 'express';
import { query } from '../config/database';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/layers?project_id=xxx
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { project_id } = req.query;
    const whereClause = project_id ? 'WHERE project_id = $1' : '';
    const params = project_id ? [project_id] : [];

    const result = await query(
      `SELECT * FROM layers ${whereClause} ORDER BY created_at DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch layers' });
  }
});

// GET /api/layers/:id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('SELECT * FROM layers WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Layer not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch layer' });
  }
});

// POST /api/layers (admin only)
router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { project_id, name, geometry_type, schema } = req.body;
    const result = await query(
      `INSERT INTO layers (project_id, name, geometry_type, schema)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [project_id, name, geometry_type, JSON.stringify(schema || [])]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to create layer' });
  }
});

// PUT /api/layers/:id (admin only)
router.put('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, schema } = req.body;
    const result = await query(
      `UPDATE layers SET
        name = COALESCE($1, name),
        schema = COALESCE($2, schema)
       WHERE id = $3
       RETURNING *`,
      [name, schema ? JSON.stringify(schema) : null, req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Layer not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to update layer' });
  }
});

// DELETE /api/layers/:id (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('DELETE FROM layers WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Layer not found' });
      return;
    }
    res.json({ success: true, message: 'Layer deleted' });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to delete layer' });
  }
});

export default router;
