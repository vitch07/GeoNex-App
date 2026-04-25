import { Router, Response } from 'express';
import { query } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/sync/pull?assignment_id=xxx&last_sync_version=0
router.get('/pull', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { assignment_id, last_sync_version } = req.query;
    const syncVersion = parseInt(last_sync_version as string) || 0;

    if (!assignment_id) {
      res.status(400).json({ success: false, error: 'assignment_id required' });
      return;
    }

    // Get assignment area to filter features
    // Admins can pull any assignment; field users only their own
    const assignmentQuery = req.user!.role === 'admin'
      ? 'SELECT area FROM work_assignments WHERE id = $1'
      : 'SELECT area FROM work_assignments WHERE id = $1 AND assigned_to = $2';
    const assignmentParams = req.user!.role === 'admin'
      ? [assignment_id]
      : [assignment_id, req.user!.id];
    const assignmentResult = await query(assignmentQuery, assignmentParams);
    if (assignmentResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Assignment not found' });
      return;
    }

    // Get features within assignment area that changed since last sync
    const result = await query(
      `SELECT f.id, f.layer_id, ST_AsGeoJSON(f.geometry)::jsonb as geometry,
              f.properties, f.created_by, f.created_at, f.updated_at, f.sync_version
       FROM features f
       JOIN layers l ON f.layer_id = l.id
       JOIN work_assignments wa ON l.project_id = wa.project_id
       WHERE wa.id = $1
         AND f.sync_version > $2
         AND ST_Intersects(f.geometry, wa.area)
       ORDER BY f.sync_version ASC
       LIMIT 1000`,
      [assignment_id, syncVersion]
    );

    // Get current max version
    const versionResult = await query('SELECT COALESCE(MAX(sync_version), 0) as max_version FROM features');

    res.json({
      success: true,
      data: {
        features: result.rows,
        current_version: versionResult.rows[0].max_version,
        has_more: result.rows.length === 1000,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Sync pull failed' });
  }
});

// POST /api/sync/push
router.post('/push', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { assignment_id, features, device_id } = req.body;

    if (!assignment_id || !features || !device_id) {
      res.status(400).json({ success: false, error: 'assignment_id, features, and device_id required' });
      return;
    }

    const conflicts = [];
    let syncedCount = 0;

    for (const feature of features) {
      const syncStatus = feature.sync_status;

      if (syncStatus === 'new') {
        // Insert new feature
        await query(
          `INSERT INTO features (id, layer_id, geometry, properties, created_by)
           VALUES ($1, $2, ST_GeomFromGeoJSON($3), $4, $5)
           ON CONFLICT (id) DO NOTHING`,
          [feature.id, feature.layer_id, JSON.stringify(feature.geometry), JSON.stringify(feature.properties), req.user!.id]
        );
        syncedCount++;
      } else if (syncStatus === 'modified') {
        // Check for conflicts
        const existing = await query(
          'SELECT sync_version FROM features WHERE id = $1',
          [feature.id]
        );

        if (existing.rows.length > 0 && existing.rows[0].sync_version > feature.sync_version) {
          // Conflict — server wins
          const serverFeature = await query(
            `SELECT id, layer_id, ST_AsGeoJSON(geometry)::jsonb as geometry,
                    properties, created_by, created_at, updated_at, sync_version
             FROM features WHERE id = $1`,
            [feature.id]
          );
          conflicts.push({
            feature_id: feature.id,
            local_version: feature.sync_version,
            server_version: existing.rows[0].sync_version,
            resolution: 'server_wins',
            server_feature: serverFeature.rows[0],
          });
        } else {
          // No conflict — apply update
          await query(
            `UPDATE features SET
              geometry = ST_GeomFromGeoJSON($1),
              properties = $2,
              updated_at = NOW(),
              sync_version = sync_version + 1
             WHERE id = $3`,
            [JSON.stringify(feature.geometry), JSON.stringify(feature.properties), feature.id]
          );
          syncedCount++;
        }
      } else if (syncStatus === 'deleted') {
        await query('DELETE FROM features WHERE id = $1', [feature.id]);
        syncedCount++;
      }
    }

    // Log sync
    await query(
      `INSERT INTO sync_log (user_id, device_id, sync_type, status, features_count)
       VALUES ($1, $2, 'push', $3, $4)`,
      [req.user!.id, device_id, conflicts.length > 0 ? 'partial' : 'success', syncedCount]
    );

    const versionResult = await query('SELECT COALESCE(MAX(sync_version), 0) as max_version FROM features');

    res.json({
      success: true,
      data: {
        synced_count: syncedCount,
        conflicts,
        new_version: versionResult.rows[0].max_version,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Sync push failed' });
  }
});

export default router;
