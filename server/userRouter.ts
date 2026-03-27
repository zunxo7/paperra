import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getTursoClient } from './db.js';

export const userRouter = Router();

// Store active sessions in memory, or we can use DB.
// Since Render is stateless-ish across deploys, using DB is better,
// but for simplicity we can use a Map if it's acceptable (like adminAuth),
// but we have Turso, so we can store sessions in the DB.
// For now, let's just use DB for sessions to be safe, or just memory since it's a small app.
// I'll use a simple in-memory map for now, just like adminAuth, to avoid complex DB session management if not strictly required,
// but since we want persistence, I'll provide an endpoint that returns the user info.
export const sessions = new Map<string, { userId: number; username: string; filterLimit: number }>();

userRouter.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const client = getTursoClient();
    if (!client) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const hash = await bcrypt.hash(password, 10);

    try {
      await client.execute({
        sql: `INSERT INTO users (username, password_hash, filter_limit) VALUES (?, ?, 10)`,
        args: [username, hash]
      });
      res.json({ success: true });
    } catch (e: any) {
      if (e.message?.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      throw e;
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

userRouter.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const client = getTursoClient();
    if (!client) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const rs = await client.execute({
      sql: `SELECT id, password_hash, filter_limit FROM users WHERE username = ?`,
      args: [username]
    });

    if (rs.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = rs.rows[0] as unknown as { id: number; password_hash: string; filter_limit: number };
    const valid = await bcrypt.compare(password, user.password_hash);
    
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { userId: user.id, username, filterLimit: user.filter_limit });

    res.json({ token, username, filterLimit: user.filter_limit });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

userRouter.get('/me', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = auth.split(' ')[1];
  const session = sessions.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  res.json({ username: session.username, filterLimit: session.filterLimit });
});

userRouter.post('/logout', (req, res) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.split(' ')[1];
    sessions.delete(token);
  }
  res.json({ success: true });
});
