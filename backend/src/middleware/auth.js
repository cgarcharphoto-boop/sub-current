import jwt from 'jsonwebtoken';
import { env } from '../env.js';

export function sign(payload, opts = {}) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '30d', ...opts });
}

function requireAuth(kind) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });
    try {
      const payload = jwt.verify(token, env.jwtSecret);
      if (payload.kind !== kind) return res.status(403).json({ error: 'Wrong token type' });
      req.auth = payload;
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

export const requireFan = requireAuth('fan');
export const requireOwner = requireAuth('owner');

// Accepts either a fan or an owner token. With { optional: true }, a missing
// token is allowed (req.auth stays undefined) but a bad one is still rejected.
export function requireAny({ optional = false } = {}) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return optional ? next() : res.status(401).json({ error: 'Missing bearer token' });
    try {
      const payload = jwt.verify(token, env.jwtSecret);
      if (payload.kind !== 'fan' && payload.kind !== 'owner') return res.status(403).json({ error: 'Wrong token type' });
      req.auth = payload;
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}
