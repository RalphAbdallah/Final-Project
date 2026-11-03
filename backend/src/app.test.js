import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createMemoryRepo } from './repo/memory.js';

const PAYER_TOKEN = 'payer-token';
const verifyToken = async (token) => {
  if (token === PAYER_TOKEN) return { id: 'payer-1', email: 'ralph@example.com', name: 'Ralph' };
  if (token === 'payer-2-token') return { id: 'payer-2', email: 'charbel@example.com', name: 'Charbel' };
  return null;
};
const FAKE_USAGE = { input: 1000, output: 500, reasoning: 200, total: 1500 };

let app;
let bill;
let uploaded;
const asPayer = (req) => req.set('Authorization', `Bearer ${PAYER_TOKEN}`);

// Stands in for the OpenAI reader: returns what a model would copy off the Castle receipt.
const fakeReader = async (images) => {
  if (images[0].base64 === Buffer.from('not a receipt').toString('base64')) {
    throw Object.assign(new Error('not_a_receipt'), { code: 'not_a_receipt', usage: FAKE_USAGE });
  }
  return { usage: FAKE_USAGE, raw: {
    is_receipt: true,
    venue: 'Castle Rooftop',
    date: '2026-07-15',
    currency: 'USD',
    lines: [
      { quantity: 2, name: 'Pepsi Diet', amount: 7.5, unit_price: null },
      { quantity: 1, name: 'Combo Plate', amount: 19, unit_price: null },
    ],
    subtotal: null,
    tax_amount: null,
    tax_rate: null,
    tax_included: false,
    service_amount: null,
    service_rate: null,
    total: 26.5,
    lbp_rate: 90000,
  } };
};
const fakeStorage = {
  upload: async (path) => uploaded.push(path),
  remove: async (paths) => {
    uploaded = uploaded.filter((p) => !paths.includes(p));
  },
};

beforeEach(async () => {
  uploaded = [];
  app = createApp({ repo: createMemoryRepo(), verifyToken, readReceipt: fakeReader, storage: fakeStorage });
  const res = await asPayer(request(app).post('/api/me/sample-bill'));
  bill = `/api/share/${res.body.shareToken}`;
});

async function join(name = 'Maya') {
  const res = await request(app).post(`${bill}/join`).send({ name });
  return { token: res.body.guestToken, view: res.body, res };
}

describe('payer auth', () => {
  it('rejects payer routes without a token', async () => {
    expect((await request(app).get('/api/me')).status).toBe(401);
  });

  it('rejects an invalid token', async () => {
    const res = await request(app).get('/api/me').set('Authorization', 'Bearer nope');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_token');
  });

  it('creates the payer on first use and lists their bills', async () => {
    const res = await asPayer(request(app).get('/api/me'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Ralph', email: 'ralph@example.com', payouts: [] });
    expect(res.body.bills).toHaveLength(1);
  });
});

describe('guest flow', () => {
  it('shows the bill without wallet links before joining', async () => {
    await asPayer(request(app).put('/api/me/payouts/whish')).send({ payUrl: 'https://whish.money/x' });
    const res = await request(app).get(bill);
    expect(res.status).toBe(200);
    expect(res.body.me).toBeNull();
    expect(res.body.payer).toEqual({ name: 'Ralph', wallets: ['whish'] });
    expect(JSON.stringify(res.body)).not.toContain('whish.money/x');
  });

  it('includes the payer as a member who claimed their own items', async () => {
    const res = await request(app).get(bill);
    const payer = res.body.members.find((m) => m.isPayer);
    expect(payer.name).toBe('Ralph');
    expect(res.body.items[0].claims.some((c) => c.memberId === payer.id)).toBe(true);
  });

  it('returns 404 for an unknown share token', async () => {
    expect((await request(app).get('/api/share/nope')).status).toBe(404);
  });

  it('joins once per name', async () => {
    const { res } = await join('Maya');
    expect(res.status).toBe(201);
    expect(res.body.guestToken).toMatch(/^[\w-]{22}$/);
    expect(res.body.me.name).toBe('Maya');
    expect((await join(' maya ')).res.status).toBe(409);
  });

  it('claims units and recomputes the share', async () => {
    const { token, view } = await join();
    const pizza = view.items.find((i) => i.name === 'Pizza Margherita');

    const res = await request(app).put(`${bill}/claims/${pizza.id}`).set('X-Guest-Token', token).send({ units: 1 });
    expect(res.status).toBe(200);
    expect(res.body.me.items).toBe(1000);
    expect(res.body.items.find((i) => i.id === pizza.id).myUnits).toBe(1);

    const tooMany = await request(app).put(`${bill}/claims/${pizza.id}`).set('X-Guest-Token', token).send({ units: 6 });
    expect(tooMany.status).toBe(400);
  });

  it('rejects claims without a guest token', async () => {
    const { view } = await join();
    const res = await request(app).put(`${bill}/claims/${view.items[0].id}`).send({ units: 1 });
    expect(res.status).toBe(401);
  });

  it('marks paid, locks claims, and undoes', async () => {
    const { token, view } = await join();
    const item = view.items[0];
    const guest = (req) => req.set('X-Guest-Token', token);
    await guest(request(app).put(`${bill}/claims/${item.id}`)).send({ units: 1 });

    expect((await guest(request(app).patch(`${bill}/me`)).send({ status: 'marked_paid' })).body.error).toBe(
      'method_required',
    );

    const paid = await guest(request(app).patch(`${bill}/me`)).send({ tip: 100, method: 'cash', status: 'marked_paid' });
    expect(paid.body.me).toMatchObject({ status: 'marked_paid', tip: 100, paidAmount: paid.body.me.due });

    expect((await guest(request(app).delete(`${bill}/claims/${item.id}`))).status).toBe(409);
    expect((await guest(request(app).patch(`${bill}/me`)).send({ tip: 200 })).status).toBe(409);

    const undone = await guest(request(app).patch(`${bill}/me`)).send({ status: 'unpaid' });
    expect(undone.body.me).toMatchObject({ status: 'unpaid', paidAmount: null });
    expect((await guest(request(app).patch(`${bill}/me`)).send({ status: 'confirmed' })).status).toBe(409);
  });

  it('only accepts payment methods the payer set up', async () => {
    const { token } = await join();
    const res = await request(app).patch(`${bill}/me`).set('X-Guest-Token', token).send({ method: 'whish' });
    expect(res.status).toBe(400);
  });
});

describe('bills from photos', () => {
  const photo = (req, content = 'jpeg bytes') =>
    req.attach('photos', Buffer.from(content), { filename: 'receipt.jpg', contentType: 'image/jpeg' });

  it('reads photos into a draft the app calculated, and stores the photos', async () => {
    const res = await photo(asPayer(request(app).post('/api/me/receipts/read')));
    expect(res.status).toBe(200);
    expect(res.body.draft.items).toEqual([
      { name: 'Pepsi Diet', quantity: 2, price: 375 },
      { name: 'Combo Plate', quantity: 1, price: 1900 },
    ]);
    expect(res.body.draft).toMatchObject({ venue: 'Castle Rooftop', printedTotal: 2650, lbpRate: 90000 });
    expect(res.body.photos).toHaveLength(1);
    expect(res.body.photos[0]).toMatch(/^payer-1\/[0-9a-f-]+\.jpg$/);
    expect(uploaded).toEqual(res.body.photos);
  });

  it('says so when the photo is not a receipt, and stores nothing', async () => {
    const res = await photo(asPayer(request(app).post('/api/me/receipts/read')), 'not a receipt');
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('not_a_receipt');
    expect(uploaded).toEqual([]);
  });

  it('needs photos and a login', async () => {
    expect((await asPayer(request(app).post('/api/me/receipts/read'))).body.error).toBe('no_photos');
    expect((await photo(request(app).post('/api/me/receipts/read'))).status).toBe(401);
  });

  it('creates the reviewed bill, with the payer as a member, ready to share', async () => {
    const read = await photo(asPayer(request(app).post('/api/me/receipts/read')));
    const { printedTotal, ...draft } = read.body.draft;
    const created = await asPayer(request(app).post('/api/me/bills')).send({ ...draft, photos: read.body.photos });
    expect(created.status).toBe(201);

    const summary = await asPayer(request(app).get(`/api/me/bills/${created.body.id}`));
    expect(summary.body).toMatchObject({ venue: 'Castle Rooftop', total: 2650, items: 2, guests: 0 });

    const guestView = await request(app).get(`/api/share/${created.body.shareToken}`);
    expect(guestView.body.members).toEqual([expect.objectContaining({ name: 'Ralph', isPayer: true })]);
    expect(guestView.body.bill.total).toBe(2650);
  });

  it('rejects bad drafts and photos that belong to someone else', async () => {
    const good = { venue: 'X', date: '2026-11-03', currency: 'USD', tax: 0, service: 0, items: [{ name: 'Tea', price: 300, quantity: 1 }] };
    const send = (body) => asPayer(request(app).post('/api/me/bills')).send(body);
    expect((await send({ ...good, items: [] })).body.error).toBe('invalid_items');
    expect((await send({ ...good, items: [{ name: 'Tea', price: 3.5, quantity: 1 }] })).body.error).toBe('invalid_items');
    expect((await send({ ...good, photos: ['someone-else/x.jpg'] })).body.error).toBe('invalid_photos');
    expect((await send(good)).status).toBe(201);
  });

  it("doesn't show another payer's bill", async () => {
    const res = await asPayer(request(app).get('/api/me/bills/00000000-0000-0000-0000-000000000000'));
    expect(res.status).toBe(404);
  });
});

describe('AI reading limits', () => {
  const photo = (req, content = 'jpeg bytes') =>
    req.attach('photos', Buffer.from(content), { filename: 'receipt.jpg', contentType: 'image/jpeg' });
  const limited = (limits) =>
    createApp({
      repo: createMemoryRepo(),
      verifyToken,
      readReceipt: fakeReader,
      storage: fakeStorage,
      aiLimits: { readsPerHour: 100, readsPerDay: 100, userTokensPerDay: 1e9, globalTokensPerDay: 1e9, ...limits },
    });

  it('stops a payer after the hourly limit, and says when to try again', async () => {
    const app = limited({ readsPerHour: 2 });
    expect((await photo(asPayer(request(app).post('/api/me/receipts/read')))).status).toBe(200);
    expect((await photo(asPayer(request(app).post('/api/me/receipts/read')))).status).toBe(200);
    const third = await photo(asPayer(request(app).post('/api/me/receipts/read')));
    expect(third.status).toBe(429);
    expect(third.body.error).toBe('ai_hourly_limit');
    expect(third.body.retryAfter).toBeGreaterThan(3000);
    expect(third.headers['retry-after']).toBe(String(third.body.retryAfter));
  });

  it('counts failed reads too, since they still cost tokens', async () => {
    const app = limited({ readsPerHour: 1 });
    expect((await photo(asPayer(request(app).post('/api/me/receipts/read')), 'not a receipt')).status).toBe(422);
    expect((await photo(asPayer(request(app).post('/api/me/receipts/read')))).body.error).toBe('ai_hourly_limit');
  });

  it("enforces each payer's daily token budget", async () => {
    const app = limited({ userTokensPerDay: 3000 });
    await photo(asPayer(request(app).post('/api/me/receipts/read')));
    await photo(asPayer(request(app).post('/api/me/receipts/read')));
    expect((await photo(asPayer(request(app).post('/api/me/receipts/read')))).body.error).toBe('ai_daily_limit');
  });

  it('pauses reading for everyone once the shared daily budget is spent', async () => {
    const app = limited({ globalTokensPerDay: 1500 });
    await photo(asPayer(request(app).post('/api/me/receipts/read')));
    const other = await photo(request(app).post('/api/me/receipts/read').set('Authorization', 'Bearer payer-2-token'));
    expect(other.status).toBe(429);
    expect(other.body.error).toBe('ai_busy');
  });
});

describe('get-paid setup', () => {
  it('saves a wallet link on the right domain', async () => {
    const res = await asPayer(request(app).put('/api/me/payouts/whish')).send({
      payUrl: 'https://whish.money/app/pay/abc',
    });
    expect(res.status).toBe(200);
    expect(res.body.payouts).toEqual([{ wallet: 'whish', payUrl: 'https://whish.money/app/pay/abc' }]);
  });

  it('rejects links for another site or without https', async () => {
    const wrong = await asPayer(request(app).put('/api/me/payouts/whish')).send({ payUrl: 'https://evil.example/pay' });
    expect(wrong.status).toBe(422);
    expect(wrong.body).toEqual({ error: 'wrong_wallet', host: 'evil.example' });

    const plain = await asPayer(request(app).put('/api/me/payouts/omt')).send({ payUrl: 'http://omt.com.lb/send-money' });
    expect(plain.body.error).toBe('not_a_link');

    const text = await asPayer(request(app).put('/api/me/payouts/omt')).send({ payUrl: '0012345678' });
    expect(text.body.error).toBe('not_a_link');
  });

  it('removes a wallet', async () => {
    await asPayer(request(app).put('/api/me/payouts/whish')).send({ payUrl: 'https://whish.money/x' });
    const res = await asPayer(request(app).delete('/api/me/payouts/whish'));
    expect(res.body.payouts).toEqual([]);
  });
});
