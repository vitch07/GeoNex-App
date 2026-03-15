import { Router, Response } from 'express';
import { query } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/features?layer_id=xxx
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { layer_id, bbox } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (layer_id) {
      conditions.push(`f.layer_id = $${paramIdx++}`);
      params.push(layer_id);
    }

    if (bbox) {
      // bbox format: minLng,minLat,maxLng,maxLat
      const [minLng, minLat, maxLng, maxLat] = (bbox as string).split(',').map(Number);
      conditions.push(`ST_Intersects(f.geometry, ST_MakeEnvelope($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, 4326))`);
      params.push(minLng, minLat, maxLng, maxLat);
      paramIdx += 4;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT f.id, f.layer_id, ST_AsGeoJSON(f.geometry)::jsonb as geometry,
              f.properties, f.created_by, f.created_at, f.updated_at, f.sync_version
       FROM features f
       ${whereClause}
       ORDER BY f.updated_at DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to fetch features' });
  }
});

// GET /api/features/:id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT f.id, f.layer_id, ST_AsGeoJSON(f.geometry)::jsonb as geometry,
              f.properties, f.created_by, f.created_at, f.updated_at, f.sync_version
       FROM features f WHERE f.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Feature not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch feature' });
  }
});

// POST /api/features
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { layer_id, geometry, properties } = req.body;

    // For field users, check that feature is within their assigned area
    if (req.user!.role === 'field_user') {
      const layerResult = await query('SELECT project_id FROM layers WHERE id = $1', [layer_id]);
      if (layerResult.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Layer not found' });
        return;
      }
      const projectId = layerResult.rows[0].project_id;
      const boundaryCheck = await query(
        `SELECT EXISTS(
          SELECT 1 FROM work_assignments
          WHERE assigned_to = $1 AND project_id = $2
            AND ST_Contains(area, ST_GeomFromGeoJSON($3))
        ) as within_boundary`,
        [req.user!.id, projectId, JSON.stringify(geometry)]
      );
      if (!boundaryCheck.rows[0].within_boundary) {
        res.status(400).json({ success: false, error: 'Feature must be within your assigned area boundary' });
        return;
      }
    }

    const result = await query(
      `INSERT INTO features (layer_id, geometry, properties, created_by)
       VALUES ($1, ST_GeomFromGeoJSON($2), $3, $4)
       RETURNING id, layer_id, ST_AsGeoJSON(geometry)::jsonb as geometry,
                 properties, created_by, created_at, updated_at, sync_version`,
      [layer_id, JSON.stringify(geometry), JSON.stringify(properties || {}), req.user!.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to create feature' });
  }
});

// PUT /api/features/:id
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { geometry, properties } = req.body;
    const result = await query(
      `UPDATE features SET
        geometry = CASE WHEN $1::text IS NOT NULL THEN ST_GeomFromGeoJSON($1) ELSE geometry END,
        properties = COALESCE($2::jsonb, properties),
        updated_at = NOW(),
        sync_version = sync_version + 1
       WHERE id = $3
       RETURNING id, layer_id, ST_AsGeoJSON(geometry)::jsonb as geometry,
                 properties, created_by, created_at, updated_at, sync_version`,
      [geometry ? JSON.stringify(geometry) : null, properties ? JSON.stringify(properties) : null, req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Feature not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to update feature' });
  }
});

// DELETE /api/features/:id
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('DELETE FROM features WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Feature not found' });
      return;
    }
    res.json({ success: true, message: 'Feature deleted' });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to delete feature' });
  }
});

// GET /api/features/geojson/:layer_id — returns GeoJSON FeatureCollection
router.get('/geojson/:layer_id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(
          json_build_object(
            'type', 'Feature',
            'id', f.id,
            'geometry', ST_AsGeoJSON(f.geometry)::jsonb,
            'properties', f.properties || jsonb_build_object(
              'layer_id', f.layer_id,
              'created_by', f.created_by,
              'sync_version', f.sync_version
            )
          )
        ) FILTER (WHERE f.id IS NOT NULL), '[]'::json)
      ) as geojson
      FROM features f
      WHERE f.layer_id = $1`,
      [req.params.layer_id]
    );
    res.json(result.rows[0].geojson);
  } catch {
    res.status(500).json({ success: false, error: 'Failed to generate GeoJSON' });
  }
});

export default router;
