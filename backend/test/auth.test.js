import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('fan auth', () => {
  const email = `fan-${Date.now()}@example.com`;

  it('signs up and returns a usable token', async () => {
    const res = await request(app)
      .post('/auth/fan/signup')
      .send({ email, password: 'correcthorse', name: 'Test Fan' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
  });

  it('rejects duplicate signup', async () => {
    const res = await request(app)
      .post('/auth/fan/signup')
      .send({ email, password: 'correcthorse', name: 'Test Fan' });
    expect(res.status).toBe(409);
  });

  it('logs in with correct password, rejects wrong password', async () => {
    const ok = await request(app).post('/auth/fan/login').send({ email, password: 'correcthorse' });
    expect(ok.status).toBe(200);

    const bad = await request(app).post('/auth/fan/login').send({ email, password: 'nope' });
    expect(bad.status).toBe(401);
  });

  it('rejects requests to protected routes with no token', async () => {
    const res = await request(app).get('/tickets/mine');
    expect(res.status).toBe(401);
  });
});
