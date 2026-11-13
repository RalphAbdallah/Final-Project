import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTestDatabase } from './db.js';

process.env.JWT_SECRET = 'test-secret';

// Stands in for the OpenAI reader: returns what a model would copy off the Castle receipt.
// Special photo contents make it fail the ways the real one can.
vi.mock('../services/openai.js', () => {
  const FAKE_USAGE = { input: 1000, output: 500, total: 1500 };
  const fail = (code, photos) => Object.assign(new Error(code), { code, photos, usage: FAKE_USAGE });
  const text = (base64) => Buffer.from(base64, 'base64').toString();
  return {
    readReceipt: async (images) => {
      if (text(images[0].base64) === 'not a receipt') throw fail('not_a_receipt');
      if (text(images[0].base64) === 'two receipts') throw fail('several_receipts');
      if (text(images[0].base64) === 'blurry') throw fail('unclear_photos', [1]);
      return {
        usage: FAKE_USAGE,
        raw: {
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
        },
      };
    },
  };
});

const { default: app } = await import('../app.js');

useTestDatabase();

let token; // Ralph, the payer
let otherToken; // Charbel, another payer
let bill; // the sample bill's guest URL

const asPayer = (req) => req.set('Authorization', `Bearer ${token}`);
const asOther = (req) => req.set('Authorization', `Bearer ${otherToken}`);

async function signup(name, email) {
  const res = await request(app).post('/api/auth/signup').send({ name, email, password: 'password123' });
  return res.body.token;
}

beforeEach(async () => {
  token = await signup('Ralph', 'ralph@example.com');
  otherToken = await signup('Charbel', 'charbel@example.com');
  const res = await asPayer(request(app).post('/api/me/sample-bill'));
  bill = `/api/share/${res.body.shareToken}`;
});

async function join(name = 'Maya') {
  const res = await request(app).post(`${bill}/join`).send({ name });
  return { token: res.body.guestToken, view: res.body, res };
}

const photoBody = (content = 'jpeg bytes') => ({
  photos: [{ type: 'image/jpeg', data: Buffer.from(content).toString('base64') }],
});
const readPhotos = (content) => asPayer(request(app).post('/api/me/receipts/read')).send(photoBody(content));

describe('sign up and log in', () => {
  it('signs up once per email, and stores a hash, not the password', async () => {
    const again = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Ralph', email: 'RALPH@example.com', password: 'password123' });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('email_taken');

    const { User } = await import('../models/User.js');
    const user = await User.findOne({ email: 'ralph@example.com' });
    expect(user.passwordHash).not.toBe('password123');
    expect(user.passwordHash.startsWith('$2b$')).toBe(true);
  });

  it('refuses a short password or a bad email', async () => {
    const short = await request(app).post('/api/auth/signup').send({ email: 'a@b.com', password: 'short' });
    expect(short.body.error).toBe('weak_password');
    const bad = await request(app).post('/api/auth/signup').send({ email: 'nope', password: 'password123' });
    expect(bad.body.error).toBe('invalid_email');
  });

  it('logs in with the right password only, with one message for both mistakes', async () => {
    const ok = await request(app).post('/api/auth/login').send({ email: 'ralph@example.com', password: 'password123' });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toEqual({ id: expect.any(String), name: 'Ralph', email: 'ralph@example.com' });

    const wrong = await request(app).post('/api/auth/login').send({ email: 'ralph@example.com', password: 'nope1234' });
    const nobody = await request(app).post('/api/auth/login').send({ email: 'who@example.com', password: 'nope1234' });
    expect(wrong.status).toBe(401);
    expect(nobody.body).toEqual(wrong.body);
  });

  it('changes the password only with the current one', async () => {
    const change = (body) => asPayer(request(app).patch('/api/me/password')).send(body);
    expect((await change({ currentPassword: 'wrong', newPassword: 'newpassword1' })).body.error).toBe('wrong_password');
    expect((await change({ currentPassword: 'password123', newPassword: 'short' })).body.error).toBe('weak_password');
    expect((await change({ currentPassword: 'password123', newPassword: 'newpassword1' })).status).toBe(204);
    const login = await request(app).post('/api/auth/login').send({ email: 'ralph@example.com', password: 'newpassword1' });
    expect(login.status).toBe(200);
  });
});

describe('payer auth', () => {
  it('rejects payer routes without a token', async () => {
    expect((await request(app).get('/api/me')).status).toBe(401);
  });

  it('rejects an invalid token', async () => {
    const res = await request(app).get('/api/me').set('Authorization', 'Bearer nope');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_token');
  });

  it('returns the profile and their bills', async () => {
    const res = await asPayer(request(app).get('/api/me'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Ralph', email: 'ralph@example.com', payouts: [] });
    expect(res.body.bills).toHaveLength(1);
    expect((await asPayer(request(app).get('/api/me/bills'))).body).toEqual(res.body.bills);
  });

  it('renames the payer, on their bills too', async () => {
    const res = await asPayer(request(app).patch('/api/me')).send({ name: '  Ralph   Abdallah ' });
    expect(res.body.name).toBe('Ralph Abdallah');
    const view = await request(app).get(bill);
    expect(view.body.payer.name).toBe('Ralph Abdallah');
    expect(view.body.members.find((m) => m.isPayer).name).toBe('Ralph Abdallah');
    expect((await asPayer(request(app).patch('/api/me')).send({ name: '' })).status).toBe(400);
  });

  it('changes the email, unless another account has it', async () => {
    const taken = await asPayer(request(app).patch('/api/me')).send({ email: 'charbel@example.com' });
    expect(taken.status).toBe(409);
    const res = await asPayer(request(app).patch('/api/me')).send({ email: 'New@Example.com' });
    expect(res.body.email).toBe('new@example.com');
  });

  it('deletes the account with all its bills', async () => {
    expect((await asPayer(request(app).delete('/api/me'))).status).toBe(204);
    expect((await request(app).get(bill)).status).toBe(404);
    expect((await asPayer(request(app).get('/api/me'))).status).toBe(401);
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
    const paid = await asPayer(request(app).delete(`/api/me/bills/${id}/members/${member('Charbel').id}`));
    expect(paid.body.error).toBe('member_paid');
  });

  it('locks tips once the card is paid', async () => {
    const { id } = await sampleBill();
    const { token: guest } = await join('Maya');
    const res = await asPayer(request(app).put(`/api/me/bills/${id}/card-paid`)).send({ paid: true });
    expect(res.body.bill.cardPaid).toBe(true);
    const tip = await request(app).patch(`${bill}/me`).set('X-Guest-Token', guest).send({ tip: 100 });
    expect(tip.body.error).toBe('tip_locked');
  });

  it('lets the payer add their own tip, counted in the card total, until the card is paid', async () => {
    const { id } = await sampleBill();
    const before = (await asPayer(request(app).get(`/api/me/bills/${id}`))).body.bill;
    const res = await asPayer(request(app).put(`/api/me/bills/${id}/tip`)).send({ tip: 500 });
    expect(res.status).toBe(200);
    expect(res.body.bill.tips).toBe(before.tips + 500);
    expect(res.body.bill.card).toBe(before.card + 500);
    expect(res.body.members.find((m) => m.isPayer).tip).toBe(500);
    expect((await asPayer(request(app).put(`/api/me/bills/${id}/tip`)).send({ tip: -1 })).body.error).toBe('invalid_tip');
    await asPayer(request(app).put(`/api/me/bills/${id}/card-paid`)).send({ paid: true });
    expect((await asPayer(request(app).put(`/api/me/bills/${id}/tip`)).send({ tip: 100 })).body.error).toBe('tip_locked');
    expect((await asOther(request(app).put(`/api/me/bills/${id}/tip`)).send({ tip: 100 })).status).toBe(404);
  });

  it('deletes a bill with everything on it, and only your own', async () => {
    const { id } = await sampleBill();
    expect((await asOther(request(app).delete(`/api/me/bills/${id}`))).status).toBe(404);
    expect((await asPayer(request(app).delete(`/api/me/bills/${id}`))).status).toBe(204);
    expect((await asPayer(request(app).get(`/api/me/bills/${id}`))).status).toBe(404);
    expect((await request(app).get(bill)).status).toBe(404);
    expect((await asPayer(request(app).get('/api/me'))).body.bills).toEqual([]);
  });

  it("hides another payer's bill", async () => {
    const { id } = await sampleBill();
    expect((await asOther(request(app).get(`/api/me/bills/${id}`))).status).toBe(404);
    expect((await asPayer(request(app).get('/api/me/bills/not-an-id'))).status).toBe(404);
  });

  it('keeps every claim when two guests claim at the same moment', async () => {
    const maya = await join('Maya');
    const omar = await join('Omar');
    const fries = maya.view.items.find((i) => i.name === 'Fries');
    const lemonade = maya.view.items.find((i) => i.name === 'Fresh lemonade');
    const [a, b] = await Promise.all([
      request(app).put(`${bill}/claims/${fries.id}`).set('X-Guest-Token', maya.token).send({ units: 1 }),
      request(app).put(`${bill}/claims/${lemonade.id}`).set('X-Guest-Token', omar.token).send({ units: 1 }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const view = (await request(app).get(bill)).body;
    const mayaId = view.members.find((m) => m.name === 'Maya').id;
    const omarId = view.members.find((m) => m.name === 'Omar').id;
    expect(view.items.find((i) => i.id === fries.id).claims).toContainEqual({ memberId: mayaId, units: 1 });
    expect(view.items.find((i) => i.id === lemonade.id).claims).toContainEqual({ memberId: omarId, units: 1 });
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
    expect(res.body.guestToken).toMatch(/^[0-9a-f]{32}$/);
    expect(res.body.me.name).toBe('Maya');
    expect((await join(' maya ')).res.status).toBe(409);
  });

  it('claims units and recomputes the share', async () => {
    const { token: guest, view } = await join();
    const pizza = view.items.find((i) => i.name === 'Pizza Margherita');

    const res = await request(app).put(`${bill}/claims/${pizza.id}`).set('X-Guest-Token', guest).send({ units: 1 });
    expect(res.status).toBe(200);
    expect(res.body.me.items).toBe(1000);
    expect(res.body.items.find((i) => i.id === pizza.id).myUnits).toBe(1);

    const tooMany = await request(app).put(`${bill}/claims/${pizza.id}`).set('X-Guest-Token', guest).send({ units: 6 });
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
    const { token: guestToken } = await join();
    const guest = (req) => req.set('X-Guest-Token', guestToken);
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
    const { token: guest } = await join();
    const res = await request(app).patch(`${bill}/me`).set('X-Guest-Token', guest).send({ method: 'whish' });
    expect(res.status).toBe(400);
  });
});

describe('bills from photos', () => {
  it('reads photos into a draft the app calculated, and keeps the photos', async () => {
    const res = await readPhotos();
    expect(res.status).toBe(200);
    expect(res.body.draft.items).toEqual([
      { name: 'Pepsi Diet', quantity: 2, price: 375 },
      { name: 'Combo Plate', quantity: 1, price: 1900 },
    ]);
    expect(res.body.draft).toMatchObject({ venue: 'Castle Rooftop', printedTotal: 2650, lbpRate: 90000 });
    expect(res.body.photos).toHaveLength(1);
  });

  it('says so when the photo is not a receipt, or shows two receipts, and keeps nothing', async () => {
    const notReceipt = await readPhotos('not a receipt');
    expect(notReceipt.status).toBe(422);
    expect(notReceipt.body.error).toBe('not_a_receipt');
    const two = await readPhotos('two receipts');
    expect(two.body.error).toBe('several_receipts');
    const { Photo } = await import('../models/Photo.js');
    expect(await Photo.countDocuments()).toBe(0);
  });

  it('says which photos are too unclear to read', async () => {
    const res = await readPhotos('blurry');
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'unclear_photos', photos: [1] });
  });

  it('needs photos and a login', async () => {
    expect((await asPayer(request(app).post('/api/me/receipts/read')).send({})).body.error).toBe('no_photos');
    expect((await request(app).post('/api/me/receipts/read').send(photoBody())).status).toBe(401);
  });

  it('creates the reviewed bill, with the payer as a member, ready to share', async () => {
    const read = await readPhotos();
    const { printedTotal, ...draft } = read.body.draft;
    const created = await asPayer(request(app).post('/api/me/bills')).send({ ...draft, photos: read.body.photos });
    expect(created.status).toBe(201);

    const view = await asPayer(request(app).get(`/api/me/bills/${created.body.id}`));
    expect(view.body.bill).toMatchObject({ venue: 'Castle Rooftop', total: 2650 });
    expect(view.body.items).toHaveLength(2);
    expect(view.body.members).toEqual([expect.objectContaining({ name: 'Ralph', isPayer: true })]);
    expect(view.body.photos).toEqual(read.body.photos);

    const photos = await asPayer(request(app).get(`/api/me/bills/${created.body.id}/photos`));
    expect(photos.body).toEqual([
      { id: read.body.photos[0], src: `data:image/jpeg;base64,${Buffer.from('jpeg bytes').toString('base64')}` },
    ]);

    const guestView = await request(app).get(`/api/share/${created.body.shareToken}`);
    expect(guestView.body.members).toEqual([expect.objectContaining({ name: 'Ralph', isPayer: true })]);
    expect(guestView.body.bill.total).toBe(2650);
  });

  it('rejects bad drafts and photos that belong to someone else', async () => {
    const good = { venue: 'X', date: '2026-11-03', currency: 'USD', tax: 0, service: 0, items: [{ name: 'Tea', price: 300, quantity: 1 }] };
    const send = (body) => asPayer(request(app).post('/api/me/bills')).send(body);
    expect((await send({ ...good, items: [] })).body.error).toBe('invalid_items');
    expect((await send({ ...good, items: [{ name: 'Tea', price: 3.5, quantity: 1 }] })).body.error).toBe('invalid_items');
    expect((await send({ ...good, photos: ['someone-else'] })).body.error).toBe('invalid_photos');

    const charbels = await asOther(request(app).post('/api/me/receipts/read')).send(photoBody());
    expect((await send({ ...good, photos: charbels.body.photos })).body.error).toBe('invalid_photos');
    expect((await send(good)).status).toBe(201);
  });
});

describe('AI reading limits', () => {
  const limits = (values) => {
    process.env.AI_READS_PER_HOUR = String(values.readsPerHour || 100);
    process.env.AI_READS_PER_DAY = '100';
    process.env.AI_USER_TOKENS_PER_DAY = String(values.userTokensPerDay || 1e9);
    process.env.AI_GLOBAL_TOKENS_PER_DAY = String(values.globalTokensPerDay || 1e9);
  };

  it('stops a payer after the hourly limit, and says when to try again', async () => {
    limits({ readsPerHour: 2 });
    expect((await readPhotos()).status).toBe(200);
    expect((await readPhotos()).status).toBe(200);
    const third = await readPhotos();
    expect(third.status).toBe(429);
    expect(third.body.error).toBe('ai_hourly_limit');
    expect(third.body.retryAfter).toBeGreaterThan(3000);
    expect(third.headers['retry-after']).toBe(String(third.body.retryAfter));
  });

  it('counts failed reads too, since they still cost tokens', async () => {
    limits({ readsPerHour: 1 });
    expect((await readPhotos('not a receipt')).status).toBe(422);
    expect((await readPhotos()).body.error).toBe('ai_hourly_limit');
  });

  it("enforces each payer's daily token budget", async () => {
    limits({ userTokensPerDay: 3000 });
    await readPhotos();
    await readPhotos();
    expect((await readPhotos()).body.error).toBe('ai_daily_limit');
  });

  it('pauses reading for everyone once the shared daily budget is spent', async () => {
    limits({ globalTokensPerDay: 1500 });
    await readPhotos();
    const other = await asOther(request(app).post('/api/me/receipts/read')).send(photoBody());
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
