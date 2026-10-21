import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAny, requireFan } from '../middleware/auth.js';
import { asyncRoute } from '../middleware/errors.js';
import { notifyAllFans } from '../services/push.js';

export const feedRouter = Router();

const TEAM_NAME = 'Subcurrent';
const PAGE = 30;

// Resolves who is writing. Fans must still exist: the demo database resets on
// cold start, which leaves old tokens pointing at nobody.
async function author(req) {
  if (req.auth.kind === 'owner') return { ownerId: req.auth.sub, authorName: TEAM_NAME, fromTeam: true };
  const fan = await prisma.fan.findUnique({ where: { id: req.auth.sub } });
  if (!fan) throw Object.assign(new Error('Account not found. Sign in again.'), { status: 401 });
  return { fanId: fan.id, authorName: fan.name, fromTeam: false };
}

function shapePost(p, viewerFanId) {
  return {
    id: p.id,
    author: p.authorName,
    fromTeam: p.fromTeam,
    text: p.text,
    eventSlug: p.eventSlug,
    pinned: p.pinned,
    createdAt: p.createdAt,
    likes: p._count.likes,
    comments: p._count.comments,
    liked: viewerFanId ? p.likes.some((l) => l.fanId === viewerFanId) : false,
    mine: Boolean(viewerFanId && p.fanId === viewerFanId),
  };
}

function postInclude(viewerFanId) {
  return {
    _count: { select: { likes: true, comments: true } },
    likes: viewerFanId ? { where: { fanId: viewerFanId }, select: { fanId: true } } : { take: 0, select: { fanId: true } },
  };
}

// Public read; a fan token adds "liked" and "mine".
feedRouter.get(
  '/',
  requireAny({ optional: true }),
  asyncRoute(async (req, res) => {
    const viewer = req.auth?.kind === 'fan' ? req.auth.sub : null;
    const before = req.query.before ? new Date(String(req.query.before)) : null;
    const where = { status: 'visible', ...(before && !isNaN(before) ? { createdAt: { lt: before } } : {}) };
    const [pinned, posts] = await Promise.all([
      before ? [] : prisma.post.findMany({ where: { status: 'visible', pinned: true }, orderBy: { createdAt: 'desc' }, include: postInclude(viewer) }),
      prisma.post.findMany({ where: { ...where, pinned: false }, orderBy: { createdAt: 'desc' }, take: PAGE, include: postInclude(viewer) }),
    ]);
    res.json({
      posts: [...pinned, ...posts].map((p) => shapePost(p, viewer)),
      nextBefore: posts.length === PAGE ? posts[posts.length - 1].createdAt : null,
    });
  })
);

const postSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  eventSlug: z.string().max(80).optional(),
  pinned: z.boolean().optional(),
  notify: z.boolean().optional(),
});

feedRouter.post(
  '/',
  requireAny(),
  asyncRoute(async (req, res) => {
    const body = postSchema.parse(req.body);
    const who = await author(req);
    const isTeam = who.fromTeam;
    const pinned = isTeam && Boolean(body.pinned);
    const post = await prisma.$transaction(async (tx) => {
      // One pinned team post at a time, matching the app's behavior.
      if (pinned) await tx.post.updateMany({ where: { fromTeam: true, pinned: true }, data: { pinned: false } });
      return tx.post.create({
        data: { ...who, text: body.text, eventSlug: body.eventSlug, pinned },
        include: postInclude(who.fanId),
      });
    });
    let push = null;
    if (isTeam && body.notify) {
      push = await notifyAllFans({ title: TEAM_NAME, body: body.text.slice(0, 140), url: './' });
    }
    res.status(201).json({ post: shapePost(post, who.fanId), push });
  })
);

feedRouter.post(
  '/:id/like',
  requireFan,
  asyncRoute(async (req, res) => {
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post || post.status !== 'visible') return res.status(404).json({ error: 'Post not found' });
    const fan = await prisma.fan.findUnique({ where: { id: req.auth.sub } });
    if (!fan) return res.status(401).json({ error: 'Account not found. Sign in again.' });
    const key = { postId_fanId: { postId: post.id, fanId: fan.id } };
    const existing = await prisma.postLike.findUnique({ where: key });
    if (existing) await prisma.postLike.delete({ where: key });
    else await prisma.postLike.create({ data: { postId: post.id, fanId: fan.id } });
    const likes = await prisma.postLike.count({ where: { postId: post.id } });
    res.json({ liked: !existing, likes });
  })
);

feedRouter.get(
  '/:id/comments',
  asyncRoute(async (req, res) => {
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post || post.status !== 'visible') return res.status(404).json({ error: 'Post not found' });
    const comments = await prisma.comment.findMany({ where: { postId: post.id }, orderBy: { createdAt: 'asc' }, take: 200 });
    res.json(comments.map((c) => ({ id: c.id, author: c.authorName, fromTeam: c.fromTeam, text: c.text, createdAt: c.createdAt })));
  })
);

const commentSchema = z.object({ text: z.string().trim().min(1).max(500) });

feedRouter.post(
  '/:id/comments',
  requireAny(),
  asyncRoute(async (req, res) => {
    const body = commentSchema.parse(req.body);
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post || post.status !== 'visible') return res.status(404).json({ error: 'Post not found' });
    const who = await author(req);
    const c = await prisma.comment.create({ data: { ...who, postId: post.id, text: body.text } });
    res.status(201).json({ id: c.id, author: c.authorName, fromTeam: c.fromTeam, text: c.text, createdAt: c.createdAt });
  })
);

// Fans can remove their own posts; the team can remove any post.
feedRouter.delete(
  '/:id',
  requireAny(),
  asyncRoute(async (req, res) => {
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post || post.status !== 'visible') return res.status(404).json({ error: 'Post not found' });
    const allowed = req.auth.kind === 'owner' || post.fanId === req.auth.sub;
    if (!allowed) return res.status(403).json({ error: 'You can only remove your own posts' });
    await prisma.post.update({ where: { id: post.id }, data: { status: 'removed', pinned: false } });
    res.json({ ok: true });
  })
);
