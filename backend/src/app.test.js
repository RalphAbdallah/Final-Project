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
  if (images[0].base64 === Buffer.from('two receipts').toString('base64')) {
    throw Object.assign(new Error('several_receipts'), { code: 'several_receipts', usage: FAKE_USAGE });
  }
  if (images[0].base64 === Buffer.from('blurry').toString('base64')) {
    throw Object.assign(new Error('unclear_photos'), { code: 'unclear_photos', photos: [1], usage: FAKE_USAGE });
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
  signedUrls: async (paths) => paths.map((path) => `https://signed.example/${path}`),
  removeFolder: async (folder) => {
    uploaded = uploaded.filter((p) => !p.startsWith(`${folder}/`));
  },
};
let deletedLogins = [];

beforeEach(async () => {
  uploaded = [];
  deletedLogins = [];
  app = createApp({
    repo: createMemoryRepo(),
    verifyToken,
    readReceipt: fakeReader,
    storage: fakeStorage,
    deleteAuthUser: async (id) => deletedLogins.push(id),
  });
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

  it('renames the payer, on their bills too', async () => {
    const res = await asPayer(request(app).patch('/api/me')).send({ name: '  Ralph   Abdallah ' });
    expect(res.body.name).toBe('Ralph Abdallah');
    const view = await request(app).get(bill);
    expect(view.body.payer.name).toBe('Ralph Abdallah');
    expect(view.body.members.find((m) => m.isPayer).name).toBe('Ralph Abdallah');
    expect((await asPayer(request(app).patch('/api/me')).send({ name: '' })).status).toBe(400);
  });

  it('deletes the account with all its bills and its login', async () => {
    expect((await asPayer(request(app).delete('/api/me'))).status).toBe(204);
    expect(deletedLogins).toEqual(['payer-1']);
    expect((await request(app).get(bill)).status).toBe(404);
  });
});

describe('payer bill screen and dashboard', () => {
  // The sample bill: Ralph (payer) and guests Charbel and Jason, all with claims.
  async function sampleBill() {
    const { body } = await asPayer(request(app).get('/api/me'));
    const id = body.bills[0].id;
    const view = (await asPayer(request(app).get(`/api/me/bills/${id}`))).body;
    const member = (name) => view.members.find((m) => m.name === name);
    return { id, view, member, summary: body.bills[0] };
  }
  const setStatus = (id, memberId, status) =>
    asPayer(request(app).patch(`/api/me/bills/${id}/members/${memberId}`)).send({ status });

  it('lists each bill with what is collected and still owed', async () => {
    const { summary, view } = await sampleBill();
    const owed = view.members.filter((m) => !m.isPayer).reduce((acc, m) => acc + m.due, 0);
    expect(summary).toMatchObject({ venue: 'Mar Mikhael Diner (sample)', guests: 2, collected: 0, outstanding: owed, unpaid: 2 });
    expect(summary.total).toBe(view.bill.total);
  });

  it('shows bill total, tips and card total, and every member', async () => {
    const { view } = await sampleBill();
    expect(view.bill.card).toBe(view.bill.total + view.bill.tips);
    expect(view.members.map((m) => m.name)).toEqual(['Ralph', 'Charbel', 'Jason']);
    expect(view.me.name).toBe('Ralph');
  });

  it('lets only the payer mark guests paid, snapshots what they paid, and undoes', async () => {
    const { id, member } = await sampleBill();
    const charbel = member('Charbel');
    const paid = await setStatus(id, charbel.id, 'confirmed');
    const after = paid.body.members.find((m) => m.id === charbel.id);
    expect(after).toMatchObject({ status: 'confirmed', paidAmount: charbel.due, changed: false });
    expect(paid.body.bill).toMatchObject({ collected: charbel.due, unpaid: 1 });

    const undone = await setStatus(id, charbel.id, 'unpaid');
    expect(undone.body.members.find((m) => m.id === charbel.id)).toMatchObject({ status: 'unpaid', paidAmount: null });
    expect((await setStatus(id, member('Ralph').id, 'unpaid')).body.error).toBe('payer_row');
    expect((await setStatus(id, charbel.id, 'marked_paid')).status).toBe(400);
  });

  it('flags a paid guest whose total changed afterwards', async () => {
    const { id, view, member } = await sampleBill();
    const jason = member('Jason');
    await setStatus(id, jason.id, 'confirmed');
    // The payer adds a service charge, so Jason's share goes up.
    const items = view.items.map(({ id: itemId, name, price, quantity }) => ({ id: itemId, name, price, quantity }));
    const edited = await asPayer(request(app).patch(`/api/me/bills/${id}`)).send({
      venue: view.bill.venue, date: view.bill.date, tax: view.bill.tax, taxRate: view.bill.taxRate,
      taxIncluded: view.bill.taxIncluded, service: view.bill.service + 1000, items,
    });
    expect(edited.status).toBe(200);
    expect(edited.body.members.find((m) => m.id === jason.id).changed).toBe(true);
  });

  it('edits items, keeps claims on kept items, and refuses a quantity below what is claimed', async () => {
    const { id, view } = await sampleBill();
    const body = (items) => ({
      venue: 'Renamed', date: view.bill.date, tax: view.bill.tax, taxRate: view.bill.taxRate,
      taxIncluded: view.bill.taxIncluded, service: view.bill.service, items,
    });
    const items = view.items.map(({ id: itemId, name, price, quantity }) => ({ id: itemId, name, price, quantity }));
    // Pizza: 4 of 5 claimed. Going down to 3 would take a claimed one away.
    const tooFew = items.map((i) => (i.name === 'Pizza Margherita' ? { ...i, quantity: 3 } : i));
    const refused = await asPayer(request(app).patch(`/api/me/bills/${id}`)).send(body(tooFew));
    expect(refused.body).toMatchObject({ error: 'below_claims', item: 'Pizza Margherita', claimed: 4 });

    const ok = await asPayer(request(app).patch(`/api/me/bills/${id}`)).send(
      body([...items.filter((i) => i.name !== 'Hummus'), { name: 'Water', price: 200, quantity: 2 }]),
    );
    expect(ok.body.bill.venue).toBe('Renamed');
    expect(ok.body.items.map((i) => i.name)).toEqual(['Pizza Margherita', 'Fattoush', 'Fries', 'Fresh lemonade', 'Water']);
    expect(ok.body.items[0].claimedUnits).toBe(4);
  });

  it('lets the payer claim their own items, one person per unit', async () => {
    const { id, view } = await sampleBill();
    const pizza = view.items.find((i) => i.name === 'Pizza Margherita');
    const claim = (units) => asPayer(request(app).put(`/api/me/bills/${id}/claims/${pizza.id}`)).send({ units });
    // Ralph has 1 of the pizzas; 1 more is free, so 3 is too many.
    expect((await claim(3)).body.error).toBe('not_enough_left');
    const res = await claim(2);
    expect(res.body.items.find((i) => i.id === pizza.id)).toMatchObject({ myUnits: 2, claimedUnits: 5 });
  });

  it('removes an unpaid guest with their claims, but not a paid one', async () => {
    const { id, member } = await sampleBill();
    const removed = await asPayer(request(app).delete(`/api/me/bills/${id}/members/${member('Jason').id}`));
    expect(removed.body.members.map((m) => m.name)).toEqual(['Ralph', 'Charbel']);
    expect(removed.body.items.find((i) => i.name === 'Hummus').claimedUnits).toBe(0);

    await setStatus(id, member('Charbel').id, 'confirmed');
    expect((await asPayer(request(app).delete(`/api/me/bills/${id}/members/${member('Charbel').id}`))).body.error).toBe(
      'member_paid',
    );
  });

  it('locks tips once the card is paid', async () => {
    const { id } = await sampleBill();
    const { token } = await join('Maya');
    const res = await asPayer(request(app).put(`/api/me/bills/${id}/card-paid`)).send({ paid: true });
    expect(res.body.bill.cardPaid).toBe(true);
    expect((await request(app).patch(`${bill}/me`).set('X-Guest-Token', token).send({ tip: 100 })).body.error).toBe('tip_locked');
  });

  it('deletes a bill with everything on it, and only your own', async () => {
    const { id } = await sampleBill();
    const other = await request(app).delete(`/api/me/bills/${id}`).set('Authorization', 'Bearer payer-2-token');
    expect(other.status).toBe(404);
    expect((await asPayer(request(app).delete(`/api/me/bills/${id}`))).status).toBe(204);
    expect((await asPayer(request(app).get(`/api/me/bills/${id}`))).status).toBe(404);
    expect((await request(app).get(bill)).status).toBe(404);
    expect((await asPayer(request(app).get('/api/me'))).body.bills).toEqual([]);
  });

  it("hides another payer's bill", async () => {
    const { id } = await sampleBill();
    const res = await request(app).get(`/api/me/bills/${id}`).set('Authorization', 'Bearer payer-2-token');
    expect(res.status).toBe(404);
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

  it('gives each unit to one person only: no claiming past what is left', async () => {
    // Sample bill: 4 of the 5 pizzas are already claimed, and the one hummus is taken.
    const maya = await join('Maya');
    const pizza = maya.view.items.find((i) => i.name === 'Pizza Margherita');
    const hummus = maya.view.items.find((i) => i.name === 'Hummus');
    const claim = (who, item, units) =>
      request(app).put(`${bill}/claims/${item.id}`).set('X-Guest-Token', who.token).send({ units });

    expect((await claim(maya, pizza, 2)).body.error).toBe('not_enough_left');
    expect((await claim(maya, hummus, 1)).status).toBe(409);
    expect((await claim(maya, pizza, 1)).status).toBe(200);

    const omar = await join('Omar');
    expect((await claim(omar, pizza, 1)).body.error).toBe('not_enough_left');
    // Maya lets hers go: now Omar can have it.
    await request(app).delete(`${bill}/claims/${pizza.id}`).set('X-Guest-Token', maya.token);
    expect((await claim(omar, pizza, 1)).status).toBe(200);
  });

  it('rejects claims without a guest token', async () => {
    const { view } = await join();
    const res = await request(app).put(`${bill}/claims/${view.items[0].id}`).send({ units: 1 });
    expect(res.status).toBe(401);
  });

  it("doesn't let guests change their own payment status: only the payer marks people paid", async () => {
    const { token } = await join();
    const guest = (req) => req.set('X-Guest-Token', token);
    for (const status of ['marked_paid', 'confirmed', 'unpaid']) {
      const res = await guest(request(app).patch(`${bill}/me`)).send({ method: 'cash', status });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('payer_only');
    }
    // Tip and method still save, and the guest stays unpaid.
    const res = await guest(request(app).patch(`${bill}/me`)).send({ tip: 100, method: 'cash' });
    expect(res.body.me).toMatchObject({ status: 'unpaid', tip: 100, method: 'cash' });
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

  it('refuses photos of more than one receipt, and stores nothing', async () => {
    const res = await photo(asPayer(request(app).post('/api/me/receipts/read')), 'two receipts');
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('several_receipts');
    expect(uploaded).toEqual([]);
  });

  it('says which photos are too unclear to read, and stores nothing', async () => {
    const res = await photo(asPayer(request(app).post('/api/me/receipts/read')), 'blurry');
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'unclear_photos', photos: [1] });
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
    expect(summary.body.bill).toMatchObject({ venue: 'Castle Rooftop', total: 2650 });
    expect(summary.body.items).toHaveLength(2);
    expect(summary.body.members).toEqual([expect.objectContaining({ name: 'Ralph', isPayer: true })]);
    expect(summary.body.photos).toEqual(read.body.photos.map((p) => `https://signed.example/${p}`));

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
