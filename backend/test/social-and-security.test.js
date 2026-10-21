import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../src/app.js';
import { prisma } from '../src/db.js';
import { holdReason } from '../src/services/moderation.js';

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
// 1x1 transparent PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function newFan(name, handle) {
  const r = await request(app).post('/auth/fan/signup').send({ email: `f${uniq()}@example.com`, password: 'correcthorse', name });
  if (!r.body.token) throw new Error('signup failed ' + JSON.stringify(r.body));
  if (handle) await request(app).patch('/auth/fan/me').set(auth(r.body.token)).send({ handle }).expect(200);
  return r.body.token;
}

async function ownerLogin(email, password) {
  return request(app).post('/auth/owner/login').send({ email, password });
}

describe('owner sessions', () => {
  const email = `sec-${uniq()}@subcurrent.test`;
  let token;

  beforeAll(async () => {
    await prisma.owner.create({ data: { email, name: 'Sec Owner', passwordHash: await bcrypt.hash('first-password-123', 4) } });
    token = (await ownerLogin(email, 'first-password-123')).body.token;
  });

  it('changing the password signs out old sessions and returns a working new one', async () => {
    expect((await request(app).get('/owner/dashboard').set(auth(token))).status).toBe(200);
    expect((await request(app).post('/auth/owner/password').set(auth(token)).send({ current: 'wrong', next: 'second-password-456' })).status).toBe(400);
    expect((await request(app).post('/auth/owner/password').set(auth(token)).send({ current: 'first-password-123', next: 'short' })).status).toBe(400);
    const r = await request(app).post('/auth/owner/password').set(auth(token)).send({ current: 'first-password-123', next: 'second-password-456' });
    expect(r.status).toBe(200);
    expect((await request(app).get('/owner/dashboard').set(auth(token))).status).toBe(401);
    expect((await request(app).get('/owner/dashboard').set(auth(r.body.token))).status).toBe(200);
    expect((await ownerLogin(email, 'first-password-123')).status).toBe(401);
    expect((await ownerLogin(email, 'second-password-456')).status).toBe(200);
  });

  it('rejects owner tokens for owners that no longer exist, on every owner route style', async () => {
    const o = await prisma.owner.create({ data: { email: `gone-${uniq()}@subcurrent.test`, name: 'Gone', passwordHash: await bcrypt.hash('x-password-123', 4) } });
    const t = (await ownerLogin(o.email, 'x-password-123')).body.token;
    await prisma.owner.delete({ where: { id: o.id } });
    expect((await request(app).get('/owner/dashboard').set(auth(t))).status).toBe(401);
    expect((await request(app).post('/feed').set(auth(t)).send({ text: 'hi' })).status).toBe(401);
  });
});

describe('handles and direct messages', () => {
  let a, b, c;
  const ha = `ana${uniq()}`.slice(0, 20), hb = `ben${uniq()}`.slice(0, 20), hc = `cy${uniq()}`.slice(0, 20);

  beforeAll(async () => {
    a = await newFan('Ana', ha);
    b = await newFan('Ben', hb);
    c = await newFan('Cy', hc);
  });

  it('validates and reserves handles', async () => {
    expect((await request(app).patch('/auth/fan/me').set(auth(c)).send({ handle: 'no spaces' })).status).toBe(400);
    expect((await request(app).patch('/auth/fan/me').set(auth(c)).send({ handle: ha })).status).toBe(409);
    expect((await request(app).get('/auth/fan/me').set(auth(a))).body.handle).toBe(ha);
  });

  it('finds fans by handle and requires a handle to send', async () => {
    const s = await request(app).get(`/dms/search?q=${hb.slice(0, 6)}`).set(auth(a));
    expect(s.body.map((x) => x.handle)).toContain(hb);
    const noHandle = await newFan('Nohandle');
    expect((await request(app).post(`/dms/with/${ha}`).set(auth(noHandle)).send({ text: 'hi' })).status).toBe(409);
    expect((await request(app).post(`/dms/with/nobody-here`).set(auth(a)).send({ text: 'hi' })).status).toBe(404);
  });

  it('delivers messages with unread counts and keeps them private', async () => {
    await request(app).post(`/dms/with/${hb}`).set(auth(a)).send({ text: 'rail at 4:30?' }).expect(201);
    await request(app).post(`/dms/with/${hb}`).set(auth(a)).send({ text: 'by the laser booth' }).expect(201);
    expect((await request(app).get('/dms/unread').set(auth(b))).body.unread).toBe(2);
    const list = await request(app).get('/dms').set(auth(b));
    expect(list.body[0]).toMatchObject({ handle: ha, name: 'Ana', unread: 2, last: { text: 'by the laser booth', mine: false } });
    const th = await request(app).get(`/dms/with/${ha}`).set(auth(b));
    expect(th.body.messages.map((m) => m.mine)).toEqual([false, false]);
    expect((await request(app).get('/dms/unread').set(auth(b))).body.unread).toBe(0);
    await request(app).post(`/dms/with/${ha}`).set(auth(b)).send({ text: 'deal' }).expect(201);
    expect((await request(app).get(`/dms/with/${hb}`).set(auth(a))).body.messages.map((m) => [m.text, m.mine])).toEqual([
      ['rail at 4:30?', true], ['by the laser booth', true], ['deal', false],
    ]);
    // Cy is not part of it
    expect((await request(app).get(`/dms/with/${ha}`).set(auth(c))).body.messages).toEqual([]);
  });

  it('blocking stops messages both ways and hides from search', async () => {
    await request(app).post(`/dms/block/${hc}`).set(auth(a)).expect(200);
    expect((await request(app).post(`/dms/with/${ha}`).set(auth(c)).send({ text: 'hey' })).status).toBe(403);
    expect((await request(app).post(`/dms/with/${hc}`).set(auth(a)).send({ text: 'hey' })).status).toBe(403);
    expect((await request(app).get(`/dms/search?q=${ha.slice(0, 6)}`).set(auth(c))).body.map((x) => x.handle)).not.toContain(ha);
    expect((await request(app).get('/dms/blocks').set(auth(a))).body.map((x) => x.handle)).toEqual([hc]);
    await request(app).delete(`/dms/block/${hc}`).set(auth(a)).expect(200);
    await request(app).post(`/dms/with/${ha}`).set(auth(c)).send({ text: 'hey' }).expect(201);
  });
});

describe('photos, polls, moderation', () => {
  let fan, fan2, fan3, fan4, owner;

  beforeAll(async () => {
    fan = await newFan('Poster');
    fan2 = await newFan('Voter Two');
    fan3 = await newFan('Voter Three');
    fan4 = await newFan('Voter Four');
    const email = `mod-${uniq()}@subcurrent.test`;
    await prisma.owner.create({ data: { email, name: 'Mod', passwordHash: await bcrypt.hash('mod-password-123', 4) } });
    owner = (await ownerLogin(email, 'mod-password-123')).body.token;
  });

  it('stores a photo and serves it without bloating the feed', async () => {
    const r = await request(app).post('/feed').set(auth(fan)).send({ text: '', image: PNG });
    expect(r.status).toBe(201);
    expect(r.body.post.image).toBe(`/feed/${r.body.post.id}/image`);
    const img = await request(app).get(r.body.post.image);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.body.length).toBeGreaterThan(50);
    const feed = await request(app).get('/feed');
    expect(JSON.stringify(feed.body)).not.toContain('base64');
    expect((await request(app).post('/feed').set(auth(fan)).send({ text: 'x', image: 'data:text/html;base64,PGI+' })).status).toBe(400);
    expect((await request(app).post('/feed').set(auth(fan)).send({ text: '' })).status).toBe(400);
  });

  it('runs a poll with one changeable vote per fan', async () => {
    const r = await request(app).post('/feed').set(auth(fan)).send({ text: 'Which night?', poll: ['One', 'Two'] });
    const id = r.body.post.id;
    expect(r.body.post.poll).toEqual({ options: ['One', 'Two'], votes: [0, 0], mine: null });
    await request(app).post(`/feed/${id}/vote`).set(auth(fan2)).send({ option: 0 }).expect(200);
    await request(app).post(`/feed/${id}/vote`).set(auth(fan3)).send({ option: 1 }).expect(200);
    const changed = await request(app).post(`/feed/${id}/vote`).set(auth(fan2)).send({ option: 1 });
    expect(changed.body).toEqual({ options: ['One', 'Two'], votes: [0, 2], mine: 1 });
    expect((await request(app).post(`/feed/${id}/vote`).set(auth(fan2)).send({ option: 3 })).status).toBe(400);
    const feed = await request(app).get('/feed').set(auth(fan3));
    expect(feed.body.posts.find((p) => p.id === id).poll).toEqual({ options: ['One', 'Two'], votes: [0, 2], mine: 1 });
    expect((await request(app).post('/feed').set(auth(fan)).send({ text: 'bad', poll: ['only one'] })).status).toBe(400);
  });

  it('holds likely ticket resale for review, visible only to its author until approved', async () => {
    expect(holdReason('Selling 2 GA for Re:Turnal, $60 each, venmo me')).toMatch(/resale/);
    expect(holdReason('Who is going to Night Two?')).toBeNull();
    expect(holdReason('Selling vibes only tonight')).toBeNull();
    const r = await request(app).post('/feed').set(auth(fan)).send({ text: 'selling my VIP ticket $120' });
    expect(r.body.post).toMatchObject({ status: 'held', heldReason: 'Possible ticket resale with a price' });
    const id = r.body.post.id;
    expect((await request(app).get('/feed')).body.posts.find((p) => p.id === id)).toBeUndefined();
    expect((await request(app).get('/feed').set(auth(fan))).body.posts.find((p) => p.id === id).status).toBe('held');
    expect((await request(app).post(`/feed/${id}/like`).set(auth(fan2))).status).toBe(404);
    const queue = await request(app).get('/owner/moderation').set(auth(owner));
    expect(queue.body.find((p) => p.id === id)).toBeTruthy();
    expect((await request(app).get('/owner/moderation').set(auth(fan))).status).toBe(403);
    await request(app).post(`/owner/moderation/${id}`).set(auth(owner)).send({ action: 'approve' }).expect(200);
    expect((await request(app).get('/feed')).body.posts.find((p) => p.id === id).status).toBe('visible');
  });

  it('team posts are never auto-held', async () => {
    const r = await request(app).post('/feed').set(auth(owner)).send({ text: 'Selling out fast: last 20 GA tickets at $35' });
    expect(r.body.post.status).toBe('visible');
  });

  it('three reports hide a post until the team decides', async () => {
    const r = await request(app).post('/feed').set(auth(fan)).send({ text: 'something people dislike' });
    const id = r.body.post.id;
    expect((await request(app).post(`/feed/${id}/report`).set(auth(fan)).send({ reason: 'spam' })).status).toBe(400);
    await request(app).post(`/feed/${id}/report`).set(auth(fan2)).send({ reason: 'spam' }).expect(201);
    expect((await request(app).post(`/feed/${id}/report`).set(auth(fan2)).send({ reason: 'spam' })).body.already).toBe(true);
    await request(app).post(`/feed/${id}/report`).set(auth(fan3)).send({ reason: 'rude' }).expect(201);
    expect((await request(app).get('/feed')).body.posts.find((p) => p.id === id)).toBeTruthy();
    await request(app).post(`/feed/${id}/report`).set(auth(fan4)).send({ reason: 'rude' }).expect(201);
    expect((await request(app).get('/feed')).body.posts.find((p) => p.id === id)).toBeUndefined();
    const q = (await request(app).get('/owner/moderation').set(auth(owner))).body.find((p) => p.id === id);
    expect(q).toMatchObject({ heldReason: 'Reported by 3 fans', reportCount: 3 });
    await request(app).post(`/owner/moderation/${id}`).set(auth(owner)).send({ action: 'remove' }).expect(200);
    expect((await request(app).get('/owner/moderation').set(auth(owner))).body.find((p) => p.id === id)).toBeUndefined();
  });

  it('maps the prototype post ids to server posts', async () => {
    const created = await prisma.post.create({ data: { appKey: `pk${uniq()}`, authorName: 'Demo', text: 'demo post' } });
    const r = await request(app).get(`/feed/by-app-keys?keys=${created.appKey},nope`).set(auth(fan));
    expect(Object.keys(r.body)).toEqual([created.appKey]);
    expect(r.body[created.appKey]).toMatchObject({ id: created.id, likes: 0, liked: false });
  });
});
