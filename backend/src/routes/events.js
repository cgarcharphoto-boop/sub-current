import { Router } from 'express';
import { prisma } from '../db.js';
import { asyncRoute } from '../middleware/errors.js';

export const eventsRouter = Router();

const publicEvent = {
  include: {
    tiers: true,
    lineup: { include: { artist: true }, orderBy: { sortOrder: 'asc' } },
  },
};

eventsRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const events = await prisma.event.findMany({
      where: { status: { in: ['announced', 'on_sale', 'sold_out'] } },
      orderBy: { startAt: 'asc' },
      ...publicEvent,
    });
    res.json(events.map(shapeEvent));
  })
);

eventsRouter.get(
  '/:slug',
  asyncRoute(async (req, res) => {
    const event = await prisma.event.findUnique({ where: { slug: req.params.slug }, ...publicEvent });
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json(shapeEvent(event));
  })
);

// Never expose the real street address before checkout/drop time — that's
// the whole point of the location-drop mechanic.
function shapeEvent(e) {
  const locationReady = e.revealMode === 'checkout' || (e.dropAt && e.dropAt <= new Date());
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    status: e.status,
    startAt: e.startAt,
    doorsAt: e.doorsAt,
    venueName: locationReady ? e.venueName : null,
    venueAddr: locationReady ? e.venueAddr : null,
    dropAt: e.dropAt,
    tiers: e.tiers.map((t) => ({
      id: t.id,
      name: t.name,
      priceCents: t.priceCents,
      remaining: Math.max(0, t.capacity - t.soldCount),
      salesOpen: t.salesOpen,
    })),
    lineup: e.lineup.map((l) => ({ time: l.startTime, artist: l.artist.name, genre: l.artist.genre })),
  };
}
