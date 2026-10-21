import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireOwner } from '../middleware/auth.js';
import { asyncRoute } from '../middleware/errors.js';
import { verifyCode } from '../services/tickets.js';
import { readFlyer } from '../services/flyerAI.js';
import { notifyAllFans } from '../services/push.js';

export const ownerRouter = Router();

// ---- scan a ticket at the door ----
const scanSchema = z.object({ ticketId: z.string(), code: z.string().length(8), eventId: z.string() });

ownerRouter.post(
  '/scan',
  requireOwner,
  asyncRoute(async (req, res) => {
    const body = scanSchema.parse(req.body);
    const ticket = await prisma.ticket.findUnique({ where: { id: body.ticketId } });

    const log = async (result) => {
      await prisma.scanLog.create({
        data: { ticketId: body.ticketId, result, scannedBy: req.auth.sub },
      });
      return result;
    };

    if (!ticket) return res.status(404).json({ result: 'invalid_code' });
    if (ticket.eventId !== body.eventId) return res.json({ result: await log('wrong_event') });
    if (!verifyCode(ticket.qrSecret, body.code)) return res.json({ result: await log('invalid_code') });
    if (ticket.checkedInAt) return res.json({ result: await log('already_used'), checkedInAt: ticket.checkedInAt });

    await prisma.ticket.update({ where: { id: ticket.id }, data: { checkedInAt: new Date() } });
    res.json({ result: await log('valid'), holderName: ticket.holderName, tierName: ticket.tierName });
  })
);

// ---- AI flyer read ----
const flyerSchema = z.object({ imageBase64: z.string(), mediaType: z.string().optional() });

ownerRouter.post(
  '/flyer-read',
  requireOwner,
  asyncRoute(async (req, res) => {
    const body = flyerSchema.parse(req.body);
    const result = await readFlyer(body);
    res.json(result);
  })
);

// ---- create + publish a show ----
const createEventSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  startAt: z.coerce.date(),
  doorsAt: z.coerce.date(),
  venueName: z.string().optional(),
  venueAddr: z.string().optional(),
  revealMode: z.enum(['checkout', 'timed']).default('checkout'),
  dropAt: z.coerce.date().optional(),
  tiers: z.array(z.object({ name: z.string(), priceCents: z.number().int().min(0), capacity: z.number().int().min(1) })),
});

ownerRouter.post(
  '/events',
  requireOwner,
  asyncRoute(async (req, res) => {
    const body = createEventSchema.parse(req.body);
    const event = await prisma.event.create({
      data: {
        title: body.title,
        slug: body.slug,
        startAt: body.startAt,
        doorsAt: body.doorsAt,
        venueName: body.venueName,
        venueAddr: body.venueAddr,
        revealMode: body.revealMode,
        dropAt: body.dropAt,
        status: 'draft',
        tiers: { create: body.tiers },
      },
      include: { tiers: true },
    });
    res.status(201).json(event);
  })
);

ownerRouter.post(
  '/events/:id/publish',
  requireOwner,
  asyncRoute(async (req, res) => {
    const event = await prisma.event.update({ where: { id: req.params.id }, data: { status: 'on_sale' } });
    const push = await notifyAllFans({
      title: 'New show announced',
      body: `${event.title} just went on sale.`,
      url: `/events/${event.slug}`,
    });
    res.json({ event, push });
  })
);

// ---- dashboard ----
ownerRouter.get(
  '/dashboard',
  requireOwner,
  asyncRoute(async (req, res) => {
    const [fanCount, upcoming, checkIns] = await Promise.all([
      prisma.fan.count(),
      prisma.event.count({ where: { status: { in: ['announced', 'on_sale'] } } }),
      prisma.ticket.count({ where: { checkedInAt: { not: null } } }),
    ]);
    res.json({ fanCount, upcomingEvents: upcoming, totalCheckIns: checkIns });
  })
);
