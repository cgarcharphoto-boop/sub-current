import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../src/app.js';
import { prisma } from '../src/db.js';
import { sign } from '../src/middleware/auth.js';

let ownerToken;
let fanToken;
let eventId;
let tierId;

beforeAll(async () => {
  const owner = await prisma.owner.create({
    data: { email: `owner-${Date.now()}@subcurrent.test`, name: 'Test Owner', passwordHash: await bcrypt.hash('x', 4) },
  });
  ownerToken = sign({ sub: owner.id, kind: 'owner', role: 'admin' });

  const fanRes = await request(app)
    .post('/auth/fan/signup')
    .send({ email: `fan2-${Date.now()}@example.com`, password: 'correcthorse', name: 'Scan Test Fan' });
  fanToken = fanRes.body.token;

  const created = await request(app)
    .post('/owner/events')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({
      title: 'Test Show',
      slug: `test-show-${Date.now()}`,
      startAt: new Date(Date.now() + 86400000).toISOString(),
      doorsAt: new Date(Date.now() + 86400000).toISOString(),
      tiers: [{ name: 'GA', priceCents: 2000, capacity: 3 }],
    });
  eventId = created.body.id;
  tierId = created.body.tiers[0].id;
});

describe('ticket purchase + door scan, end to end', () => {
  let ticketId;

  it('purchases a ticket with mock payment (no Stripe key configured)', async () => {
    const res = await request(app)
      .post('/tickets/purchase')
      .set('Authorization', `Bearer ${fanToken}`)
      .send({ eventId, tierId, qty: 1, holderName: 'Scan Test Fan' });
    expect(res.status).toBe(201);
    expect(res.body.mockPayment).toBe(true);
    ticketId = res.body.tickets[0].id;
  });

  it('rejects an over-the-limit quantity as a bad request, not a crash', async () => {
    const res = await request(app)
      .post('/tickets/purchase')
      .set('Authorization', `Bearer ${fanToken}`)
      .send({ eventId, tierId, qty: 50, holderName: 'Scan Test Fan' });
    expect(res.status).toBe(400);
  });

  it('refuses to oversell a tier (capacity 3, 1 already sold, 3 more would exceed it)', async () => {
    const res = await request(app)
      .post('/tickets/purchase')
      .set('Authorization', `Bearer ${fanToken}`)
      .send({ eventId, tierId, qty: 3, holderName: 'Scan Test Fan' });
    expect(res.status).toBe(409);
  });

  it('issues a live rotating code the fan can read', async () => {
    const res = await request(app).get(`/tickets/${ticketId}/code`).set('Authorization', `Bearer ${fanToken}`);
    expect(res.status).toBe(200);
    expect(res.body.code).toMatch(/^[a-f0-9]{8}$/);
  });

  it('rejects a scan with the wrong code', async () => {
    const res = await request(app)
      .post('/owner/scan')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ticketId, code: 'deadbeef', eventId });
    expect(res.body.result).toBe('invalid_code');
  });

  it('accepts a scan with the correct live code', async () => {
    const codeRes = await request(app).get(`/tickets/${ticketId}/code`).set('Authorization', `Bearer ${fanToken}`);
    const res = await request(app)
      .post('/owner/scan')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ticketId, code: codeRes.body.code, eventId });
    expect(res.body.result).toBe('valid');
  });

  it('flags a second scan of the same ticket as already used', async () => {
    const codeRes = await request(app).get(`/tickets/${ticketId}/code`).set('Authorization', `Bearer ${fanToken}`);
    const res = await request(app)
      .post('/owner/scan')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ticketId, code: codeRes.body.code, eventId });
    expect(res.body.result).toBe('already_used');
  });

  it('hides the venue address until checkout/drop time on a timed-reveal event', async () => {
    const timed = await prisma.event.create({
      data: {
        title: 'Hidden Venue Show',
        slug: `hidden-${Date.now()}`,
        startAt: new Date(Date.now() + 86400000),
        doorsAt: new Date(Date.now() + 86400000),
        venueName: 'Secret Spot',
        venueAddr: '123 Not Yet St',
        revealMode: 'timed',
        dropAt: new Date(Date.now() + 80000000),
        status: 'on_sale',
      },
    });
    const res = await request(app).get(`/events/${timed.slug}`);
    expect(res.body.venueAddr).toBeNull();
  });
});
