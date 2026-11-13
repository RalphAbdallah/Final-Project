import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from './db.js';

// Tight limits for this file only, set before the app (and its counters) is loaded.
process.env.JWT_SECRET = 'test-secret';
process.env.RATE_JOIN_PER_BILL = '3';
process.env.RATE_JOIN_PER_ADDRESS = '100';
process.env.RATE_CLAIM_PER_PERSON = '5';
process.env.RATE_CLAIM_PER_ADDRESS = '100';
const { createCounter, rateLimitsFromEnv } = await import('../middleware/rateLimits.js');
const { default: app } = await import('../app.js');

useTestDatabase();

describe('rate limit counter', () => {
  it('allows up to the limit in a window, then says how long to wait, then resets', () => {
    let now = 0;
    const take = createCounter({ limit: 2, windowMs: 10000 }, () => now);
    expect(take('a')).toBeNull();
    expect(take('a')).toBeNull();
    expect(take('a')).toBe(10);
    expect(take('b')).toBeNull(); // other keys are counted apart
    now = 4000;
    expect(take('a')).toBe(6);
    now = 10000;
    expect(take('a')).toBeNull();
  });

  it('reads limits from .env, and RATE_LIMITS=off turns them off', () => {
    expect(rateLimitsFromEnv({}).joinPerBill.limit).toBe(20);
    expect(rateLimitsFromEnv({ RATE_JOIN_PER_BILL: '5' }).joinPerBill.limit).toBe(5);
    expect(rateLimitsFromEnv({ RATE_LIMITS: 'off' })).toBeNull();
  });
});

describe('rate limits on joining and claiming (PRD §11)', () => {
  let token;
  let billId;
  let bill;

  beforeEach(async () => {
    const signup = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Ralph', email: 'ralph@example.com', password: 'password123' });
    token = signup.body.token;
    const res = await request(app).post('/api/me/sample-bill').set('Authorization', `Bearer ${token}`);
    billId = res.body.id;
    bill = `/api/share/${res.body.shareToken}`;
  });

  const join = async (name) => {
    const res = await request(app).post(`${bill}/join`).send({ name });
    return { token: res.body.guestToken, view: res.body, res };
  };

  it('stops joins past the per-bill limit, with how long to wait', async () => {
    for (const name of ['A', 'B', 'C']) expect((await join(name)).res.status).toBe(201);
    const { res } = await join('D');
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('too_many_requests');
    expect(res.body.retryAfter).toBeGreaterThan(0);
    expect(Number(res.headers['retry-after'])).toBe(res.body.retryAfter);
  });

  it('counts claims per guest, so one fast tapper does not block the others', async () => {
    const maya = await join('Maya');
    const nour = await join('Nour');
    const fries = maya.view.items.find((i) => i.name === 'Fries');
    const tap = (guest) => request(app).put(`${bill}/claims/${fries.id}`).set('X-Guest-Token', guest).send({ units: 1 });
    for (let i = 0; i < 5; i += 1) expect((await tap(maya.token)).status).toBe(200);
    expect((await tap(maya.token)).status).toBe(429);
    expect((await request(app).delete(`${bill}/claims/${fries.id}`).set('X-Guest-Token', maya.token)).status).toBe(429);
    // Nour isn't held back by Maya's taps.
    expect((await request(app).delete(`${bill}/claims/${fries.id}`).set('X-Guest-Token', nour.token)).status).toBe(200);
  });

  it("limits the payer's own claims the same way", async () => {
    const asPayer = (req) => req.set('Authorization', `Bearer ${token}`);
    const view = (await asPayer(request(app).get(`/api/me/bills/${billId}`))).body;
    const pizza = view.items.find((i) => i.name === 'Pizza Margherita');
    const claim = () => asPayer(request(app).put(`/api/me/bills/${billId}/claims/${pizza.id}`)).send({ units: 1 });
    for (let i = 0; i < 5; i += 1) expect((await claim()).status).toBe(200);
    expect((await claim()).status).toBe(429);
  });
});
