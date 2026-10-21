import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../src/app.js';
import { prisma } from '../src/db.js';
import { sign } from '../src/middleware/auth.js';

let owner, fanA, fanB;
const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function newFan(name) {
  const r = await request(app).post('/auth/fan/signup').send({ email: `${name.replace(/\W/g, "")}-${Date.now()}-${Math.random()}@example.com`, password: 'correcthorse', name });
  if (!r.body.token) throw new Error("signup failed: " + r.status + " " + JSON.stringify(r.body));
  return r.body.token;
}

beforeAll(async () => {
  const o = await prisma.owner.create({ data: { email: `fm-owner-${Date.now()}@subcurrent.test`, name: 'FM Owner', passwordHash: await bcrypt.hash('x', 4) } });
  owner = sign({ sub: o.id, kind: 'owner', role: 'admin' });
  fanA = await newFan('Fan A');
  fanB = await newFan('Fan B');
});

describe('feed', () => {
  let postId;

  it('requires sign-in to post, and validates text', async () => {
    expect((await request(app).post('/feed').send({ text: 'hi' })).status).toBe(401);
    expect((await request(app).post('/feed').set(auth(fanA)).send({ text: '   ' })).status).toBe(400);
  });

  it('a fan posts and everyone can read it', async () => {
    const r = await request(app).post('/feed').set(auth(fanA)).send({ text: 'Who is going to Night Two?', eventSlug: 'ReturnalNights-Oct24' });
    expect(r.status).toBe(201);
    expect(r.body.post).toMatchObject({ author: 'Fan A', fromTeam: false, mine: true, likes: 0 });
    postId = r.body.post.id;
    const feed = await request(app).get('/feed');
    expect(feed.body.posts.find((p) => p.id === postId).text).toBe('Who is going to Night Two?');
  });

  it('likes toggle per fan', async () => {
    expect((await request(app).post(`/feed/${postId}/like`).set(auth(fanB))).body).toEqual({ liked: true, likes: 1 });
    const feed = await request(app).get('/feed').set(auth(fanB));
    expect(feed.body.posts.find((p) => p.id === postId)).toMatchObject({ liked: true, likes: 1, mine: false });
    expect((await request(app).post(`/feed/${postId}/like`).set(auth(fanB))).body).toEqual({ liked: false, likes: 0 });
  });

  it('fans and the team comment', async () => {
    await request(app).post(`/feed/${postId}/comments`).set(auth(fanB)).send({ text: 'Me!' }).expect(201);
    await request(app).post(`/feed/${postId}/comments`).set(auth(owner)).send({ text: 'See you there' }).expect(201);
    const c = await request(app).get(`/feed/${postId}/comments`);
    expect(c.body.map((x) => [x.author, x.fromTeam])).toEqual([['Fan B', false], ['Subcurrent', true]]);
  });

  it('team posts can pin (one at a time); fan pin requests are ignored', async () => {
    const p1 = await request(app).post('/feed').set(auth(owner)).send({ text: 'Pinned one', pinned: true });
    const p2 = await request(app).post('/feed').set(auth(owner)).send({ text: 'Pinned two', pinned: true, notify: true });
    expect(p2.body.post).toMatchObject({ author: 'Subcurrent', fromTeam: true, pinned: true });
    expect(p2.body.push).toMatchObject({ ok: false }); // no VAPID keys in tests
    const fanPin = await request(app).post('/feed').set(auth(fanA)).send({ text: 'Fan pin', pinned: true });
    expect(fanPin.body.post.pinned).toBe(false);
    const feed = await request(app).get('/feed');
    const pinned = feed.body.posts.filter((p) => p.pinned);
    expect(pinned.map((p) => p.id)).toEqual([p2.body.post.id]);
    expect(feed.body.posts[0].id).toBe(p2.body.post.id);
    expect(feed.body.posts.find((p) => p.id === p1.body.post.id).pinned).toBe(false);
  });

  it('only the author or the team can remove a post', async () => {
    expect((await request(app).delete(`/feed/${postId}`).set(auth(fanB))).status).toBe(403);
    expect((await request(app).delete(`/feed/${postId}`).set(auth(fanA))).status).toBe(200);
    const feed = await request(app).get('/feed');
    expect(feed.body.posts.find((p) => p.id === postId)).toBeUndefined();
    expect((await request(app).post(`/feed/${postId}/comments`).set(auth(fanB)).send({ text: 'x' })).status).toBe(404);
  });

  it('rejects a token for a fan that no longer exists', async () => {
    const ghost = sign({ sub: 'gone', kind: 'fan' });
    expect((await request(app).post('/feed').set(auth(ghost)).send({ text: 'hi' })).status).toBe(401);
  });
});

describe('messages with the Subcurrent team', () => {
  let threadId;

  it('fan writes, team sees it unread in the inbox', async () => {
    expect((await request(app).get('/messages').set(auth(fanA))).body).toEqual({ messages: [], unread: 0 });
    await request(app).post('/messages').set(auth(fanA)).send({ text: 'Is there coat check?' }).expect(201);
    await request(app).post('/messages').set(auth(fanA)).send({ text: 'And re-entry?' }).expect(201);
    const inbox = await request(app).get('/owner/inbox').set(auth(owner));
    const t = inbox.body.find((x) => x.fan === 'Fan A');
    expect(t).toMatchObject({ unread: 2, last: { text: 'And re-entry?', fromTeam: false } });
    threadId = t.id;
  });

  it('opening the thread clears team unread; reply shows up unread for the fan', async () => {
    const th = await request(app).get(`/owner/inbox/${threadId}`).set(auth(owner));
    expect(th.body.messages).toHaveLength(2);
    expect((await request(app).get('/owner/inbox').set(auth(owner))).body.find((x) => x.id === threadId).unread).toBe(0);
    const reply = await request(app).post(`/owner/inbox/${threadId}`).set(auth(owner)).send({ text: 'Yes, $5 by the side door.' });
    expect(reply.status).toBe(201);
    expect(reply.body.message).toMatchObject({ fromTeam: true, author: 'Subcurrent' });
    expect((await request(app).get('/messages/unread').set(auth(fanA))).body.unread).toBe(1);
    const mine = await request(app).get('/messages').set(auth(fanA));
    expect(mine.body.unread).toBe(1);
    expect(mine.body.messages.map((m) => m.fromTeam)).toEqual([false, false, true]);
    expect((await request(app).get('/messages/unread').set(auth(fanA))).body.unread).toBe(0);
  });

  it('keeps conversations private', async () => {
    expect((await request(app).get('/messages').set(auth(fanB))).body.messages).toEqual([]);
    expect((await request(app).get('/owner/inbox').set(auth(fanA))).status).toBe(403);
    expect((await request(app).get(`/owner/inbox/${threadId}`).set(auth(fanA))).status).toBe(403);
    expect((await request(app).post(`/owner/inbox/${threadId}`).set(auth(fanB)).send({ text: 'x' })).status).toBe(403);
  });
});
