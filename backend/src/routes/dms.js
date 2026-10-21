import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireFan } from '../middleware/auth.js';
import { asyncRoute } from '../middleware/errors.js';
import { notifyFan } from '../services/push.js';

// Fan <-> fan direct messages. Fans find each other by handle; a fan without
// a handle can't be found or messaged, and must pick one before sending.
export const dmRouter = Router();
dmRouter.use(requireFan);

const sendLimit = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
const textSchema = z.object({ text: z.string().trim().min(1).max(2000) });

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function me(req) {
  const fan = await prisma.fan.findUnique({ where: { id: req.auth.sub } });
  if (!fan) throw httpError(401, 'Account not found. Sign in again.');
  return fan;
}

async function byHandle(handle) {
  const fan = await prisma.fan.findUnique({ where: { handle: String(handle || '').toLowerCase() } });
  if (!fan) throw httpError(404, 'No fan with that handle');
  return fan;
}

function pair(a, b) {
  return a < b ? { aId: a, bId: b } : { aId: b, bId: a };
}

async function blockedEitherWay(x, y) {
  const n = await prisma.block.count({
    where: { OR: [{ blockerId: x, blockedId: y }, { blockerId: y, blockedId: x }] },
  });
  return n > 0;
}

function shapeMsg(m, myId) {
  return { id: m.id, mine: m.senderId === myId, text: m.text, createdAt: m.createdAt };
}

// Find fans by handle prefix or name. Hides you, anyone you blocked, and
// anyone who blocked you.
dmRouter.get(
  '/search',
  asyncRoute(async (req, res) => {
    const self = await me(req);
    const q = String(req.query.q || '').trim().toLowerCase().replace(/^@/, '');
    if (q.length < 2) return res.json([]);
    const blocks = await prisma.block.findMany({
      where: { OR: [{ blockerId: self.id }, { blockedId: self.id }] },
      select: { blockerId: true, blockedId: true },
    });
    const hidden = new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]));
    hidden.add(self.id);
    const found = await prisma.fan.findMany({
      where: { handle: { not: null }, OR: [{ handle: { startsWith: q } }, { name: { contains: q } }] },
      select: { id: true, handle: true, name: true },
      take: 20,
    });
    res.json(found.filter((f) => !hidden.has(f.id)).slice(0, 10).map((f) => ({ handle: f.handle, name: f.name })));
  })
);

dmRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const self = await me(req);
    const threads = await prisma.directThread.findMany({
      where: { OR: [{ aId: self.id }, { bId: self.id }] },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const otherIds = threads.map((t) => (t.aId === self.id ? t.bId : t.aId));
    const others = await prisma.fan.findMany({ where: { id: { in: otherIds } }, select: { id: true, handle: true, name: true } });
    const byId = Object.fromEntries(others.map((o) => [o.id, o]));
    res.json(
      threads
        .filter((t) => t.messages.length)
        .map((t) => {
          const otherId = t.aId === self.id ? t.bId : t.aId;
          const o = byId[otherId] || { handle: null, name: 'Former member' };
          return {
            handle: o.handle,
            name: o.name,
            unread: t.aId === self.id ? t.aUnread : t.bUnread,
            last: shapeMsg(t.messages[0], self.id),
            updatedAt: t.updatedAt,
          };
        })
    );
  })
);

dmRouter.get(
  '/unread',
  asyncRoute(async (req, res) => {
    const id = req.auth.sub;
    const [a, b] = await Promise.all([
      prisma.directThread.aggregate({ where: { aId: id }, _sum: { aUnread: true } }),
      prisma.directThread.aggregate({ where: { bId: id }, _sum: { bUnread: true } }),
    ]);
    res.json({ unread: (a._sum.aUnread || 0) + (b._sum.bUnread || 0) });
  })
);

dmRouter.get(
  '/with/:handle',
  asyncRoute(async (req, res) => {
    const self = await me(req);
    const other = await byHandle(req.params.handle);
    const key = pair(self.id, other.id);
    const thread = await prisma.directThread.findUnique({
      where: { aId_bId: key },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 500 } },
    });
    const iBlocked = (await prisma.block.count({ where: { blockerId: self.id, blockedId: other.id } })) > 0;
    const blocked = iBlocked || (await blockedEitherWay(self.id, other.id));
    if (thread) {
      const field = thread.aId === self.id ? 'aUnread' : 'bUnread';
      if (thread[field]) await prisma.directThread.update({ where: { id: thread.id }, data: { [field]: 0 } });
    }
    res.json({
      with: { handle: other.handle, name: other.name },
      blocked,
      iBlocked,
      messages: thread ? thread.messages.map((m) => shapeMsg(m, self.id)) : [],
    });
  })
);

dmRouter.post(
  '/with/:handle',
  sendLimit,
  asyncRoute(async (req, res) => {
    const { text } = textSchema.parse(req.body);
    const self = await me(req);
    if (!self.handle) throw httpError(409, 'Pick a handle first so they can see who you are');
    const other = await byHandle(req.params.handle);
    if (other.id === self.id) throw httpError(400, 'You cannot message yourself');
    if (await blockedEitherWay(self.id, other.id)) throw httpError(403, 'You cannot message this fan');
    const key = pair(self.id, other.id);
    const otherUnread = other.id === key.aId ? 'aUnread' : 'bUnread';
    const thread = await prisma.directThread.upsert({
      where: { aId_bId: key },
      create: { ...key, [otherUnread]: 1 },
      update: { [otherUnread]: { increment: 1 } },
    });
    const m = await prisma.directMessage.create({ data: { threadId: thread.id, senderId: self.id, text } });
    const push = await notifyFan(other.id, { title: `${self.name} (@${self.handle})`, body: text.slice(0, 140), url: './' });
    res.status(201).json({ message: shapeMsg(m, self.id), push });
  })
);

dmRouter.get(
  '/blocks',
  asyncRoute(async (req, res) => {
    const rows = await prisma.block.findMany({ where: { blockerId: req.auth.sub }, include: { blocked: { select: { handle: true, name: true } } } });
    res.json(rows.map((r) => ({ handle: r.blocked.handle, name: r.blocked.name })));
  })
);

dmRouter.post(
  '/block/:handle',
  asyncRoute(async (req, res) => {
    const self = await me(req);
    const other = await byHandle(req.params.handle);
    if (other.id === self.id) throw httpError(400, 'You cannot block yourself');
    await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: self.id, blockedId: other.id } },
      create: { blockerId: self.id, blockedId: other.id },
      update: {},
    });
    res.json({ ok: true });
  })
);

dmRouter.delete(
  '/block/:handle',
  asyncRoute(async (req, res) => {
    const self = await me(req);
    const other = await byHandle(req.params.handle);
    await prisma.block.deleteMany({ where: { blockerId: self.id, blockedId: other.id } });
    res.json({ ok: true });
  })
);
