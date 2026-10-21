import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('demo fan identity + push', () => {
  it('get-or-creates the same demo fan on repeat calls', async () => {
    const a = await request(app).post('/auth/fan/demo');
    const b = await request(app).post('/auth/fan/demo');
    expect(a.status).toBe(200);
    expect(a.body.fan.id).toBe(b.body.fan.id);
  });

  it('demo-notify fails gracefully (not a crash) when VAPID is not configured', async () => {
    const auth = await request(app).post('/auth/fan/demo');
    const res = await request(app)
      .post('/push/demo-notify')
      .set('Authorization', `Bearer ${auth.body.token}`)
      .send({ title: 'Hi', body: 'test' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
  });

  it('rejects demo-notify with no auth', async () => {
    const res = await request(app).post('/push/demo-notify').send({ title: 'Hi', body: 'test' });
    expect(res.status).toBe(401);
  });
});
