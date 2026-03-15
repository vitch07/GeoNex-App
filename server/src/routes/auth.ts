import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/database';
import { generateToken, authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req: AuthRequest, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email and password required' });
      return;
    }

    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    const { password_hash, ...userWithoutPassword } = user;
    const token = generateToken(userWithoutPassword);
    res.json({ success: true, data: { token, user: userWithoutPassword } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// POST /api/auth/register (admin only creates users)
router.post('/register', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }

    const { username, email, password, role } = req.body;
    const password_hash = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING id, username, email, role, created_at`,
      [username, email, password_hash, role || 'field_user']
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(409).json({ success: false, error: 'Email already exists' });
      return;
    }
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      'SELECT id, username, email, role, created_at FROM users WHERE id = $1',
      [req.user!.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to get user' });
  }
});

// GET /api/auth/users (admin only)
router.get('/users', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }
    const result = await query('SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to get users' });
  }
});

export default router;
