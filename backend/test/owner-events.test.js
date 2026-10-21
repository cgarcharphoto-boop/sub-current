import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../src/app.js';
import { prisma } from '../src/db.js';
import { sign } from '../src/middleware/auth.js';

let ownerToken;
let fanToken;
let draftSlug;

beforeAll(async () => {
  const owner = await prisma.owner.create({
    data: { email: `owner-ev-${Date.now()}@subcurrent.test`, name: 'Ev Owner', passwordHash: await bcrypt.hash('x', 4) },
  });
  ownerToken = sign({ sub: owner.id, kind: 'owner', role: 'admin' });
  fanToken = sign({ sub: 'nobody', kind: 'fan' });
  draftSlug = `draft-${Date.now()}`;
  await request(app)
    .post('/owner/events')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({
      title: 'Draft Show',
      slug: draftSlug,
      startAt: new Date(Date.now() + 86400000).toISOString(),
      doorsAt: new Date(Date.now() + 86400000).toISOString(),
      tiers: [{ name: 'GA', priceCents: 1000, capacity: 5 }],
    });
});

describe('GET /owner/events', () => {
  it('lists drafts the public feed hides', async () => {
    const pub = await request(app).get('/events');
    expect(pub.body.find((e) => e.slug === draftSlug)).toBeUndefined();

    const res = await request(app).get('/owner/events').set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    const draft = res.body.find((e) => e.slug === draftSlug);
    expect(draft.status).toBe('draft');
    expect(draft.tiers[0]).toMatchObject({ name: 'GA', sold: 0, capacity: 5 });
  });

  it('rejects fan tokens and missing tokens', async () => {
    expect((await request(app).get('/owner/events').set('Authorization', `Bearer ${fanToken}`)).status).toBe(403);
    expect((await request(app).get('/owner/events')).status).toBe(401);
  });
});
