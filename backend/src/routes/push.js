import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireFan } from '../middleware/auth.js';
import { asyncRoute } from '../middleware/errors.js';
import { env } from '../env.js';
import { notifyFan } from '../services/push.js';

export const pushRouter = Router();

pushRouter.get('/vapid-public-key', (req, res) => res.json({ key: env.vapidPublicKey }));

const subSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

pushRouter.post(
  '/subscribe',
  requireFan,
  asyncRoute(async (req, res) => {
    const body = subSchema.parse(req.body);
    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: { fanId: req.auth.sub, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth },
      update: { fanId: req.auth.sub, p256dh: body.keys.p256dh, auth: body.keys.auth },
    });
    res.status(201).json({ ok: true });
  })
);

// Sends a real push to the caller's own subscriptions — used by the front-end
// demo so tapping "Publish" as the owner can trigger an actual notification
// on the fan's device, not a simulated one.
const notifySchema = z.object({ title: z.string().max(80), body: z.string().max(200), url: z.string().optional() });

pushRouter.post(
  '/demo-notify',
  requireFan,
  asyncRoute(async (req, res) => {
    const body = notifySchema.parse(req.body);
    const result = await notifyFan(req.auth.sub, body);
    res.json(result);
  })
);
