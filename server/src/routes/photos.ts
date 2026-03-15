import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { query } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';

const uploadDir = process.env.UPLOAD_DIR || './uploads';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|tiff/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype.split('/')[1]);
    cb(null, ext || mime);
  },
});

const router = Router();

// GET /api/photos?feature_id=xxx
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { feature_id } = req.query;
    const whereClause = feature_id ? 'WHERE feature_id = $1' : '';
    const params = feature_id ? [feature_id] : [];
    const result = await query(`SELECT * FROM photos ${whereClause} ORDER BY captured_at DESC`, params);
    res.json({ success: true, data: result.rows });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch photos' });
  }
});

// POST /api/photos/upload
router.post('/upload', authenticate, upload.single('photo'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }

    const { feature_id, is_360, metadata } = req.body;
    const result = await query(
      `INSERT INTO photos (feature_id, file_path, is_360, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [feature_id, req.file.path, is_360 === 'true', metadata ? JSON.parse(metadata) : {}]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to upload photo' });
  }
});

// DELETE /api/photos/:id
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('DELETE FROM photos WHERE id = $1 RETURNING id, file_path', [req.params.id]);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Photo not found' });
      return;
    }
    // Delete file from disk
    const filePath = result.rows[0].file_path;
    if (filePath) {
      fs.unlink(filePath, () => {}); // Best-effort deletion
    }
    res.json({ success: true, message: 'Photo deleted' });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to delete photo' });
  }
});

export default router;
