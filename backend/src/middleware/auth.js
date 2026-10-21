import jwt from 'jsonwebtoken';
import { env } from '../env.js';
import { prisma } from '../db.js';

export function sign(payload, opts = {}) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '30d', ...opts });
}

function readToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function requireAuth(kind) {
  return (req, res, next) => {
    const token = readToken(req);
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

// Owner tokens are powerful (push to every fan, remove posts), so a valid
// signature isn't enough: the owner must still exist and the token's version
// must match. Changing the password bumps the version and signs out every
// existing session.
async function ownerIsCurrent(payload) {
  const owner = await prisma.owner.findUnique({ where: { id: payload.sub }, select: { tokenVersion: true } });
  return Boolean(owner && owner.tokenVersion === (payload.v ?? 0));
}

export const requireFan = requireAuth('fan');
export function requireOwner(req, res, next) {
  requireAuth('owner')(req, res, async () => {
    try {
      if (!(await ownerIsCurrent(req.auth))) return res.status(401).json({ error: 'Session ended. Sign in again.' });
      next();
    } catch (e) {
      next(e);
    }
  });
}

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
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    if (req.auth.kind !== 'owner') return next();
    ownerIsCurrent(req.auth)
      .then((ok) => (ok ? next() : res.status(401).json({ error: 'Session ended. Sign in again.' })))
      .catch(next);
  };
}
