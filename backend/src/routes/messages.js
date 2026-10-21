import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireFan, requireOwner } from '../middleware/auth.js';
import { asyncRoute } from '../middleware/errors.js';
import { notifyFan } from '../services/push.js';

// Fan <-> Subcurrent team conversations. One thread per fan.
export const messagesRouter = Router();
export const inboxRouter = Router();

const TEAM_NAME = 'Subcurrent';
const textSchema = z.object({ text: z.string().trim().min(1).max(2000) });

function shapeMsg(m) {
  return { id: m.id, fromTeam: m.fromTeam, author: m.authorName, text: m.text, createdAt: m.createdAt };
}

async function currentFan(req) {
  const fan = await prisma.fan.findUnique({ where: { id: req.auth.sub } });
  if (!fan) throw Object.assign(new Error('Account not found. Sign in again.'), { status: 401 });
  return fan;
}

// ---- fan side ----
messagesRouter.get(
  '/',
  requireFan,
  asyncRoute(async (req, res) => {
    const fan = await currentFan(req);
    const thread = await prisma.thread.findUnique({
      where: { fanId: fan.id },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 500 } },
    });
    if (!thread) return res.json({ messages: [], unread: 0 });
    const unread = thread.fanUnread;
    if (unread) await prisma.thread.update({ where: { id: thread.id }, data: { fanUnread: 0 } });
    res.json({ messages: thread.messages.map(shapeMsg), unread });
  })
);

// Cheap poll for a badge without marking anything read.
messagesRouter.get(
  '/unread',
  requireFan,
  asyncRoute(async (req, res) => {
    const thread = await prisma.thread.findUnique({ where: { fanId: req.auth.sub } });
    res.json({ unread: thread ? thread.fanUnread : 0 });
  })
);

messagesRouter.post(
  '/',
  requireFan,
  asyncRoute(async (req, res) => {
    const body = textSchema.parse(req.body);
    const fan = await currentFan(req);
    const thread = await prisma.thread.upsert({
      where: { fanId: fan.id },
      create: { fanId: fan.id, teamUnread: 1 },
      update: { teamUnread: { increment: 1 } },
    });
    const m = await prisma.message.create({
      data: { threadId: thread.id, fromTeam: false, authorName: fan.name, text: body.text },
    });
    res.status(201).json(shapeMsg(m));
  })
);

// ---- team side (owner/staff) ----
inboxRouter.get(
  '/',
  requireOwner,
  asyncRoute(async (req, res) => {
    const threads = await prisma.thread.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: { fan: { select: { name: true, email: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    res.json(
      threads.map((t) => ({
        id: t.id,
        fan: t.fan.name,
        email: t.fan.email,
        unread: t.teamUnread,
        updatedAt: t.updatedAt,
        last: t.messages[0] ? shapeMsg(t.messages[0]) : null,
      }))
    );
  })
);

inboxRouter.get(
  '/:id',
  requireOwner,
  asyncRoute(async (req, res) => {
    const thread = await prisma.thread.findUnique({
      where: { id: req.params.id },
      include: { fan: { select: { name: true } }, messages: { orderBy: { createdAt: 'asc' }, take: 500 } },
    });
    if (!thread) return res.status(404).json({ error: 'Conversation not found' });
    if (thread.teamUnread) await prisma.thread.update({ where: { id: thread.id }, data: { teamUnread: 0 } });
    res.json({ id: thread.id, fan: thread.fan.name, messages: thread.messages.map(shapeMsg) });
  })
);

inboxRouter.post(
  '/:id',
  requireOwner,
  asyncRoute(async (req, res) => {
    const body = textSchema.parse(req.body);
    const thread = await prisma.thread.findUnique({ where: { id: req.params.id } });
    if (!thread) return res.status(404).json({ error: 'Conversation not found' });
    const [m] = await prisma.$transaction([
      prisma.message.create({ data: { threadId: thread.id, fromTeam: true, authorName: TEAM_NAME, text: body.text } }),
      prisma.thread.update({ where: { id: thread.id }, data: { fanUnread: { increment: 1 }, teamUnread: 0 } }),
    ]);
    // Real push to the fan's devices, if they turned it on.
    const push = await notifyFan(thread.fanId, { title: TEAM_NAME, body: body.text.slice(0, 140), url: './' });
    res.status(201).json({ message: shapeMsg(m), push });
  })
);
