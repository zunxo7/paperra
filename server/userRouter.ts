import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getTursoClient } from './db.js';

export const userRouter = Router();

const SECRET = process.env.JWT_SECRET || '';

export function createToken(payload: any) {
  if (!SECRET) {
    console.error("CRITICAL: JWT_SECRET environment variable is not set.");
  }
  const data = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = crypto.createHmac('sha256', SECRET).update(data).digest('hex');
  return `${data}.${signature}`;
}

function hashIp(ip: string) {
  return crypto.createHmac('sha256', SECRET).update(ip).digest('hex');
}

export function verifyToken(token: string) {
  try {
    const [data, signature] = token.split('.');
    if (!data || !signature) return null;
    const expected = crypto.createHmac('sha256', SECRET).update(data).digest('hex');
    if (signature === expected) {
      return JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
    }
  } catch {
    return null;
  }
  return null;
}

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

    // --- Anti-Abuse: IP Rate Limiting (1 per month) ---
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (ip) {
      const ipStr = Array.isArray(ip) ? ip[0] : (ip as string);
      const hashedIp = hashIp(ipStr);
      const trackingRs = await client.execute({
        sql: `SELECT last_registration_at FROM registration_tracking WHERE ip_address = ?`,
        args: [hashedIp]
      });

      if (trackingRs.rows.length > 0) {
        const lastReg = new Date(trackingRs.rows[0].last_registration_at as string).getTime();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        if (Date.now() - lastReg < thirtyDaysMs) {
          const daysLeft = Math.ceil((thirtyDaysMs - (Date.now() - lastReg)) / (24 * 60 * 60 * 1000));
          return res.status(429).json({ error: `Limited to one account per month per device. Please try again in ${daysLeft} days.` });
        }
      }
      
      // Upsert tracking (we'll do this after successful user creation to be fair)
      req.body.hashedIp = hashedIp; 
    }
    // ---------------------------------------------------

    const hash = await bcrypt.hash(password, 10);
    try {
      const now = new Date();
      const trialEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const sub = {
        tier: 'free',
        trial_ends_at: trialEndsAt,
        last_daily_reset_at: now.toISOString()
      };

      // --- Transfer Guest Tokens ---
      let welcomeTokens = 15;
      if (req.body.hashedIp) {
        const guestRs = await client.execute({
          sql: `SELECT guest_tokens FROM registration_tracking WHERE ip_address = ?`,
          args: [req.body.hashedIp]
        });
        if (guestRs.rows.length > 0) {
          const guestTokens = (guestRs.rows[0].guest_tokens ?? 0) as number;
          welcomeTokens += guestTokens;
        }
      }
      // -----------------------------

      await client.execute({
        sql: `INSERT INTO users (username, password_hash, tokens, subscription_json) VALUES (?, ?, ?, ?)`,
        args: [username, hash, welcomeTokens, JSON.stringify(sub)]
      });

      // Update IP tracking and CLEAR remaining guest tokens after registration
      if (req.body.hashedIp) {
        await client.execute({
          sql: `INSERT OR REPLACE INTO registration_tracking (ip_address, last_registration_at, guest_tokens) VALUES (?, ?, 0)`,
          args: [req.body.hashedIp, now.toISOString()]
        });
      }

      res.json({ success: true, tokens: welcomeTokens });
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
    if (!client) return res.status(500).json({ error: 'Database not configured' });

    // Handle Admin
    if (username === 'admin' && process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) {
      // Ensure admin exists in users table to satisfy FK constraint
      let adminId = 0;
      const adminCheck = await client.execute({
        sql: `SELECT id FROM users WHERE username = 'admin'`,
        args: []
      });

      if (adminCheck.rows.length > 0) {
        adminId = (adminCheck.rows[0] as any).id;
      } else {
        const dummyHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
        const createRes = await client.execute({
          sql: `INSERT INTO users (username, password_hash, tokens) VALUES ('admin', ?, 999999)`,
          args: [dummyHash]
        });
        adminId = Number(createRes.lastInsertRowid);
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await client.execute({
        sql: `INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, ?)`,
        args: [token, adminId, expiresAt]
      });
      return res.json({ token, username: 'admin', tokens: 999999, isAdmin: true });
    }

    const rs = await client.execute({
      sql: `SELECT id, password_hash, tokens, subscription_json FROM users WHERE username = ?`,
      args: [username]
    });

    if (rs.rows.length === 0) return res.status(401).json({ error: 'Invalid username or password' });

    const user = rs.rows[0] as unknown as { id: number; password_hash: string; tokens: number; subscription_json: string | null };
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

    // Create DB Session
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await client.execute({
      sql: `INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, ?)`,
      args: [token, user.id, expiresAt]
    });

    let tier = 'free';
    let sub = null;
    if (user.subscription_json) {
      try {
        sub = JSON.parse(user.subscription_json);
        tier = sub.tier || 'free';
      } catch {}
    }

    res.json({ token, username, tokens: user.tokens, isAdmin: username === 'admin', tier, subscription: sub });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const TIER_TOKENS: Record<string, number> = {
  free: 15,
  starter: 25,
  pro: 50,
};

userRouter.get('/me', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.split(' ')[1];

  const client = getTursoClient();
  if (!client) return res.status(500).json({ error: 'DB Error' });

  try {
    const rs = await client.execute({
      sql: `SELECT s.user_id, u.username, u.tokens, u.subscription_json, u.created_at
            FROM user_sessions s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP`,
      args: [token]
    });

    if (rs.rows.length === 0) return res.status(401).json({ error: 'Session expired or invalid' });

    const row = rs.rows[0];
    if ((row.user_id as number) === 0) {
      return res.json({ username: 'admin', tokens: 999999, isAdmin: true, tier: 'pro', subscription: null });
    }

    const userId = row.user_id as number;
    let tokens = row.tokens as number;
    let sub: any = null;
    let tier = 'free';

    if (row.subscription_json) {
      try { sub = JSON.parse(row.subscription_json as string); } catch {}
    }

    const now = new Date();
    let trialDaysLeft = 0;
    let nextResetSeconds = 0;

    // Default trial end date for free-tier display
    const createdAt = new Date(row.created_at as string);
    const trialEnd = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    trialDaysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (trialDaysLeft < 0) trialDaysLeft = 0;

    if (!sub) {
      sub = {
        tier: 'free',
        trial_ends_at: trialEnd.toISOString(),
        last_daily_reset_at: now.toISOString()
      };
    } else {
      tier = sub.tier || 'free';
    }

    const lastDailyReset = new Date(sub.last_daily_reset_at || row.created_at as string);
    const secondsSinceReset = (now.getTime() - lastDailyReset.getTime()) / 1000;
    
    if (secondsSinceReset >= 86400) {
      // Daily reset for everyone now
      const dailyAllowance = TIER_TOKENS[tier] ?? 15;
      tokens = dailyAllowance;
      sub.last_daily_reset_at = now.toISOString();
      await client.execute({
        sql: `UPDATE users SET tokens = ?, subscription_json = ? WHERE id = ?`,
        args: [dailyAllowance, JSON.stringify(sub), userId]
      });
      nextResetSeconds = 86400;
    } else {
      nextResetSeconds = Math.max(0, Math.floor(86400 - secondsSinceReset));
    }

    if (tier !== 'free') {
      const expiresAt = new Date(sub.expires_at);
      if (expiresAt <= now) {
        // Subscription expired — downgrade to free
        tokens = 15;
        sub = {
          tier: 'free',
          trial_ends_at: trialEnd.toISOString(),
          last_daily_reset_at: now.toISOString()
        };
        await client.execute({
          sql: `UPDATE users SET tokens = 15, subscription_json = ? WHERE id = ?`,
          args: [JSON.stringify(sub), userId]
        });
        tier = 'free';
      }
    }

    res.json({
      username: row.username,
      tokens,
      userId,
      isAdmin: row.username === 'admin',
      tier,
      subscription: sub,
      trialDaysLeft,
      nextResetSeconds
    });
  } catch (e) {
    console.error('/me error:', e);
    res.status(500).json({ error: 'Session check failed' });
  }
});

// Admin / Stripe webhook endpoint to grant a subscription
userRouter.post('/grant-subscription', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.split(' ')[1];

  const client = getTursoClient();
  if (!client) return res.status(500).json({ error: 'DB Error' });

  // Only admin can call this for now
  const sessionRs = await client.execute({
    sql: `SELECT u.username FROM user_sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP`,
    args: [token]
  });
  if (sessionRs.rows.length === 0 || (sessionRs.rows[0].username as string) !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const { userId, tier, billing } = req.body;
  if (!userId || !tier || !['free','starter','pro'].includes(tier)) {
    return res.status(400).json({ error: 'userId, tier (free|starter|pro) required' });
  }

  const cycleTokens = TIER_TOKENS[tier];
  const now = new Date();
  const months = billing === 'annual' ? 12 : 1;
  const expiresAt = new Date(now);
  expiresAt.setMonth(expiresAt.getMonth() + months);

  const sub = {
    tier,
    billing: billing || 'monthly',
    tokens_per_day: cycleTokens,
    started_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    last_daily_reset_at: now.toISOString()
  };

  await client.execute({
    sql: `UPDATE users SET tokens = ?, subscription_json = ? WHERE id = ?`,
    args: [cycleTokens, JSON.stringify(sub), userId]
  });

  res.json({ success: true, sub });
});

userRouter.post('/add-tokens', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.split(' ')[1];

  const client = getTursoClient();
  if (!client) return res.status(500).json({ error: 'DB error' });

  const sessionRs = await client.execute({
    sql: `SELECT user_id FROM user_sessions WHERE token = ? AND expires_at > CURRENT_TIMESTAMP`,
    args: [token]
  });
  if (sessionRs.rows.length === 0) return res.status(401).json({ error: 'Invalid session' });
  const userId = sessionRs.rows[0].user_id as number;

  const { amount } = req.body;
  if (typeof amount !== 'number' || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

  try {
    const rs = await client.execute({
      sql: `SELECT tokens FROM users WHERE id = ?`,
      args: [userId]
    });
    if (rs.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const currentTokens = rs.rows[0].tokens as number;

    await client.execute({
      sql: `UPDATE users SET tokens = tokens + ? WHERE id = ?`,
      args: [amount, userId]
    });
    res.json({ success: true, newTokens: currentTokens + amount });
  } catch (e) {
    res.status(500).json({ error: 'DB Error' });
  }
});

userRouter.post('/decrement-tokens', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.split(' ')[1];

  const client = getTursoClient();
  if (!client) return res.status(500).json({ error: 'DB error' });

  const sessionRs = await client.execute({
    sql: `SELECT user_id FROM user_sessions WHERE token = ? AND expires_at > CURRENT_TIMESTAMP`,
    args: [token]
  });
  if (sessionRs.rows.length === 0) return res.status(401).json({ error: 'Invalid session' });
  const userId = sessionRs.rows[0].user_id as number;

  const { amount } = req.body;
  if (typeof amount !== 'number' || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

  try {
    const rs = await client.execute({
      sql: `SELECT tokens FROM users WHERE id = ?`,
      args: [userId]
    });
    if (rs.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const currentTokens = rs.rows[0].tokens as number;
    if (currentTokens < amount) return res.status(403).json({ error: 'Insufficient tokens' });

    await client.execute({
      sql: `UPDATE users SET tokens = tokens - ? WHERE id = ?`,
      args: [amount, userId]
    });
    res.json({ success: true, newTokens: currentTokens - amount });
  } catch (e) {
    res.status(500).json({ error: 'DB Error' });
  }
});

userRouter.post('/history', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.split(' ')[1];

  const client = getTursoClient();
  if (!client) return res.status(500).json({ error: 'DB Error' });

  const sessionRs = await client.execute({
    sql: `SELECT s.user_id, u.subscription_json 
          FROM user_sessions s 
          JOIN users u ON s.user_id = u.id 
          WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP`,
    args: [token]
  });
  if (sessionRs.rows.length === 0) return res.status(401).json({ error: 'Invalid session' });
  const userId = sessionRs.rows[0].user_id as number;
  const subJson = sessionRs.rows[0].subscription_json as string;
  let tier = 'free';
  if (subJson) {
    try { tier = JSON.parse(subJson).tier || 'free'; } catch {}
  }

  // Allow all tiers to save history with tier-based limits applied later
  const { qualificationLevel, syllabusCode, startYear, endYear, selectedSessions, selectedVariants, didFilter } = req.body;
  if (!qualificationLevel || !syllabusCode) return res.status(400).json({ error: 'Missing fields' });

  try {
    // 1. Fetch current blob
    const rs = await client.execute({
      sql: `SELECT history_json FROM user_history_blob WHERE user_id = ?`,
      args: [userId]
    });

    let history: any[] = [];
    if (rs.rows.length > 0) {
      history = JSON.parse(rs.rows[0].history_json as string);
    }

    // 2. Add or update
    const newItem = {
      id: Date.now(),
      qualificationLevel, syllabusCode, startYear, endYear,
      selectedSessions: selectedSessions || [],
      selectedVariants: selectedVariants || [],
      didFilter: !!didFilter,
      createdAt: new Date().toISOString()
    };

    const sortedSessions = [...(selectedSessions || [])].sort();
    const sortedVariants = [...(selectedVariants || [])].sort();

    // Dedup: if same criteria exists, update it instead of adding
    const existingIdx = history.findIndex(h => 
      h.qualificationLevel === newItem.qualificationLevel &&
      h.syllabusCode === newItem.syllabusCode &&
      h.startYear === newItem.startYear &&
      h.endYear === newItem.endYear &&
      JSON.stringify([...(h.selectedSessions || [])].sort()) === JSON.stringify(sortedSessions) &&
      JSON.stringify([...(h.selectedVariants || [])].sort()) === JSON.stringify(sortedVariants)
    );

    if (existingIdx !== -1) {
      history[existingIdx].didFilter = history[existingIdx].didFilter || newItem.didFilter;
      history[existingIdx].createdAt = newItem.createdAt;
    } else {
      history.unshift(newItem);
    }

    // Cap based on tier
    const limit = (tier === 'pro') ? 50 : tier === 'starter' ? 10 : 3;
    const finalHistory = history.slice(0, limit);

    // 3. Save back
    await client.execute({
      sql: `INSERT INTO user_history_blob (user_id, history_json, last_updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET history_json = excluded.history_json, last_updated_at = CURRENT_TIMESTAMP`,
      args: [userId, JSON.stringify(finalHistory)]
    });

    return res.json({ success: true });
  } catch (e) {
    console.error('History error:', e);
    return res.status(500).json({ error: 'DB Error' });
  }
});

userRouter.get('/history', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.split(' ')[1];

  const client = getTursoClient();
  if (!client) return res.status(500).json({ error: 'DB Error' });

  try {
    const sessionRs = await client.execute({
      sql: `SELECT user_id FROM user_sessions WHERE token = ? AND expires_at > CURRENT_TIMESTAMP`,
      args: [token]
    });
    if (sessionRs.rows.length === 0) return res.json({ history: [] });
    const userId = sessionRs.rows[0].user_id as number;

    const rs = await client.execute({
      sql: `SELECT history_json FROM user_history_blob WHERE user_id = ?`,
      args: [userId]
    });
    if (rs.rows.length === 0) return res.json({ history: [] });

    return res.json({ history: JSON.parse(rs.rows[0].history_json as string) });
  } catch {
    res.json({ history: [] });
  }
});

userRouter.post('/request', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.split(' ')[1];

  const client = getTursoClient();
  if (!client) return res.status(500).json({ error: 'DB Error' });

  try {
    const sessionRes = await client.execute({
      sql: `SELECT s.user_id, u.tokens, u.subscription_json FROM user_sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP`,
      args: [token]
    });
    if (sessionRes.rows.length === 0) return res.status(401).json({ error: 'Invalid session' });
    const { user_id: userId, tokens: currentTokens, subscription_json: subJson } = sessionRes.rows[0] as any;

    let tier = 'free';
    if (subJson) {
      try { tier = JSON.parse(subJson).tier || 'free'; } catch {}
    }

    const { type, description, metadata } = req.body;
    if (!type || !description) return res.status(400).json({ error: 'Type and description are required' });

    if (tier === 'free' && type !== 'BUG_FIX') {
      return res.status(403).json({ error: 'Feature requests are available on Starter and Pro plans.' });
    }

    let cost = 5; // Standard price for all paid tiers
    if (type === 'BUG_FIX') {
      cost = 0;
    }

    if (currentTokens < cost) {
      return res.status(403).json({ error: `Insufficient tokens. This request costs ${cost} tokens.` });
    }

    // Atomic transaction: Insert request AND decrement tokens
    await client.batch([
      {
        sql: `INSERT INTO user_requests (user_id, type, description, metadata_json) VALUES (?, ?, ?, ?)`,
        args: [userId, type, description, JSON.stringify(metadata || {})]
      },
      {
        sql: `UPDATE users SET tokens = tokens - ? WHERE id = ?`,
        args: [cost, userId]
      }
    ], "write");

    res.json({ success: true, newTokens: currentTokens - cost });
  } catch (e) {
    console.error('Request submission error:', e);
    res.status(500).json({ error: 'Failed to submit request' });
  }
});

userRouter.post('/delete-history', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.split(' ')[1];

  const client = getTursoClient();
  if (!client) return res.status(500).json({ error: 'DB Error' });

  const { historyId } = req.body;
  if (!historyId) return res.status(400).json({ error: 'History ID required' });

  try {
    const sessionRs = await client.execute({
      sql: `SELECT user_id FROM user_sessions WHERE token = ? AND expires_at > CURRENT_TIMESTAMP`,
      args: [token]
    });
    if (sessionRs.rows.length === 0) return res.status(401).json({ error: 'Invalid session' });
    const userId = sessionRs.rows[0].user_id as number;

    const rs = await client.execute({
      sql: `SELECT history_json FROM user_history_blob WHERE user_id = ?`,
      args: [userId]
    });

    if (rs.rows.length > 0) {
      const history = JSON.parse(rs.rows[0].history_json as string);
      const filtered = history.filter((h: any) => h.id !== historyId);
      
      await client.execute({
        sql: `UPDATE user_history_blob SET history_json = ?, last_updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
        args: [JSON.stringify(filtered), userId]
      });
    }

    return res.json({ success: true });
  } catch (e) {
    console.error('Delete history error:', e);
    return res.status(500).json({ error: 'Failed to delete' });
  }
});

userRouter.post('/logout', async (req, res) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.split(' ')[1];
    const client = getTursoClient();
    if (client) {
      await client.execute({
        sql: `DELETE FROM user_sessions WHERE token = ?`,
        args: [token]
      });
    }
  }
  res.json({ success: true });
});
userRouter.get('/guest-tokens', async (req, res) => {
  try {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const ipStr = Array.isArray(ip) ? ip[0] : (ip as string);
    const hashedIp = hashIp(ipStr || 'unknown');
    
    const client = getTursoClient();
    if (!client) return res.status(500).json({ error: 'DB error' });

    const rs = await client.execute({
      sql: `SELECT guest_tokens FROM registration_tracking WHERE ip_address = ?`,
      args: [hashedIp]
    });

    if (rs.rows.length === 0) {
      // Initialize if new visitor
      await client.execute({
        sql: `INSERT INTO registration_tracking (ip_address, guest_tokens) VALUES (?, 3)`,
        args: [hashedIp]
      });
      return res.json({ tokens: 3 });
    }

    res.json({ tokens: (rs.rows[0].guest_tokens ?? 3) as number });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

userRouter.post('/guest-tokens/deduct', async (req, res) => {
  try {
    const { cost } = req.body;
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const ipStr = Array.isArray(ip) ? ip[0] : (ip as string);
    const hashedIp = hashIp(ipStr || 'unknown');

    const client = getTursoClient();
    if (!client) return res.status(500).json({ error: 'DB error' });

    const rs = await client.execute({
      sql: `SELECT guest_tokens FROM registration_tracking WHERE ip_address = ?`,
      args: [hashedIp]
    });

    let current = 3;
    if (rs.rows.length > 0) {
      current = (rs.rows[0].guest_tokens ?? 3) as number;
    } else {
      await client.execute({
        sql: `INSERT INTO registration_tracking (ip_address, guest_tokens) VALUES (?, 3)`,
        args: [hashedIp]
      });
    }

    if (current < cost) {
      return res.status(403).json({ error: 'Insufficient guest tokens' });
    }

    const newTokens = current - cost;
    await client.execute({
      sql: `UPDATE registration_tracking SET guest_tokens = ?, last_activity_at = (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) WHERE ip_address = ?`,
      args: [newTokens, hashedIp]
    });

    res.json({ tokens: newTokens });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
