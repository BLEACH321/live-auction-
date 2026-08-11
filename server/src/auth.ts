import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from './db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'circuit_arena_secret_key_123!@#';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: 'admin' | 'team' | 'viewer';
    teamId?: number; // Attached if the user is a team
  };
}

// Authentication Middleware
export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = decoded;
    next();
  });
}

// Auth Role Middlewares
export function requireRole(role: 'admin' | 'team' | 'viewer') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: `Requires role: ${role}` });
    }
    next();
  };
}

// Login API
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const userRes = await query('SELECT * FROM users WHERE username = $1', [username]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = userRes.rows[0];
    const passwordMatch = bcrypt.compareSync(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // If it's a team, get the team info
    let teamId: number | undefined = undefined;
    let teamName: string | undefined = undefined;
    if (user.role === 'team') {
      const teamRes = await query('SELECT id, name FROM teams WHERE user_id = $1', [user.id]);
      if (teamRes.rows.length > 0) {
        teamId = teamRes.rows[0].id;
        teamName = teamRes.rows[0].name;
      }
    }

    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      teamId,
      teamName,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        teamId,
        teamName,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Me API
router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  return res.json({ user: req.user });
});

export default router;
