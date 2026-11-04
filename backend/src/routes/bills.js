import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { buildDraft } from '../receipts/draft.js';
import { aiLimitsFromEnv, checkAiLimits } from '../receipts/limits.js';
import { applyClaim } from '../claims.js';
import { payerBillView, splitFor } from '../views.js';

const MAX_PHOTOS = 6;
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_MONEY = 10_000_000_000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: MAX_PHOTOS },
  fileFilter: (req, file, done) => done(null, PHOTO_TYPES.has(file.mimetype)),
});

const isMoney = (v) => Number.isInteger(v) && v >= 0 && v <= MAX_MONEY;

/** Checks a reviewed draft from the payer. Returns `{ bill, items, photos }` or `{ error }`. */
export function validateBill(body, userId) {
  const venue = typeof body?.venue === 'string' ? body.venue.trim() : '';
  if (venue.length < 1 || venue.length > 80) return { error: 'invalid_venue' };
  if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) || Number.isNaN(Date.parse(body.date))) {
    return { error: 'invalid_date' };
  }
  if (!['USD', 'LBP'].includes(body.currency)) return { error: 'invalid_currency' };
  if (!isMoney(body.tax) || !isMoney(body.service)) return { error: 'invalid_extras' };
  if (body.taxRate != null && !(typeof body.taxRate === 'number' && body.taxRate >= 0 && body.taxRate <= 100)) {
    return { error: 'invalid_extras' };
  }
  if (body.lbpRate != null && !(typeof body.lbpRate === 'number' && body.lbpRate > 0)) return { error: 'invalid_extras' };

  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 200) return { error: 'invalid_items' };
  const items = [];
  for (const item of body.items) {
    const name = typeof item?.name === 'string' ? item.name.trim().replace(/\s+/g, ' ') : '';
    const quantity = item?.quantity;
    if (name.length < 1 || name.length > 80 || !isMoney(item.price)) return { error: 'invalid_items' };
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return { error: 'invalid_items' };
    items.push({ name, price: item.price, quantity });
  }

  const photos = Array.isArray(body.photos) ? body.photos : [];
  if (photos.length > MAX_PHOTOS || photos.some((p) => typeof p !== 'string' || !p.startsWith(`${userId}/`))) {
    return { error: 'invalid_photos' };
  }

  return {
    bill: {
      venue,
      date: body.date,
      currency: body.currency,
      tax: body.tax,
      taxRate: body.taxRate ?? null,
      taxIncluded: Boolean(body.taxIncluded),
      service: body.service,
      lbpRate: body.lbpRate ?? null,
    },
    items,
    photos,
  };
}

/** Payer bill routes, mounted under /api/me (already authenticated). */
export function billRoutes({ repo, readReceipt, storage, aiLimits = aiLimitsFromEnv() }) {
  const router = Router();
  const reading = new Set();

  /**
   * Runs before the photos are even accepted: one read at a time per payer, and the
   * hourly / daily / everyone limits from receipts/limits.js.
   */
  async function aiGuard(req, res, next) {
    if (!readReceipt) return res.status(503).json({ error: 'ai_not_configured' });
    if (aiLimits && reading.has(req.user.id)) return res.status(429).json({ error: 'read_in_progress' });
    req.timing = { start: Date.now() };
    const blocked = await checkAiLimits(repo, req.user.id, aiLimits);
    req.timing.limits = Date.now();
    if (blocked) {
      res.set('Retry-After', String(blocked.retryAfter));
      return res.status(429).json(blocked);
    }
    reading.add(req.user.id);
    res.on('close', () => reading.delete(req.user.id));
    next();
  }

  // 1. Photos in, draft out. The AI reads; buildDraft calculates (PRD M2).
  router.post('/receipts/read', aiGuard, upload.array('photos', MAX_PHOTOS), async (req, res) => {
    const files = req.files ?? [];
    if (files.length === 0) return res.status(400).json({ error: 'no_photos' });

    let raw;
    const timing = req.timing;
    timing.received = Date.now();
    // Records the read's tokens for the limits without making the payer wait for it
    // (~0.1-0.7 s saved). Trade-off: a read started in the ~0.1 s before this write
    // lands could slip past a limit, so a burst can overshoot by at most one read.
    const record = (usage, ok) => {
      timing.ai = Date.now();
      const ms = timing.ai - timing.received;
      if (!usage) return;
      console.log(
        `AI read: ${files.length} photo(s), ${usage.input} in + ${usage.output} out (${usage.reasoning} thinking) = ${usage.total} tokens, ${(ms / 1000).toFixed(1)}s, ${ok ? 'ok' : 'failed'}`,
      );
      repo
        .recordAiUsage({ userId: req.user.id, photos: files.length, usage, ms, ok })
        .catch((err) => console.error('Could not record AI usage:', err.message));
    };

    // Store the photos while the AI reads them (saves ~1 s); removed again below if the read fails.
    const photos = files.map(
      (f) => `${req.user.id}/${randomUUID()}.${f.mimetype.split('/')[1].replace('jpeg', 'jpg')}`,
    );
    const stored = Promise.allSettled(files.map((f, i) => storage.upload(photos[i], f.buffer, f.mimetype)));
    const discardPhotos = async () => {
      const results = await stored;
      const kept = photos.filter((_, i) => results[i].status === 'fulfilled');
      await storage.remove(kept).catch((err) => console.error('Could not remove photos:', err.message));
    };

    try {
      const result = await readReceipt(files.map((f) => ({ mime: f.mimetype, base64: f.buffer.toString('base64') })));
      raw = result.raw;
      record(result.usage, true);
    } catch (err) {
      record(err.usage, false);
      await discardPhotos();
      const status =
        { not_a_receipt: 422, several_receipts: 422, unclear_photos: 422, ai_key_invalid: 503, ai_timeout: 504 }[err.code] ?? 502;
      if (status !== 422) console.error('Receipt read failed:', err.code, err.detail ?? err.message);
      return res.status(status).json({ error: err.code ?? 'ai_unavailable', ...(err.photos ? { photos: err.photos } : {}) });
    }

    const draft = buildDraft(raw, new Date().toLocaleDateString('en-CA'));
    if (draft.items.length === 0) {
      await discardPhotos();
      return res.status(422).json({ error: 'no_items' });
    }

    const results = await stored;
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) {
      await discardPhotos();
      throw failed.reason;
    }
    const done = Date.now();
    const s = (a, b) => `${((b - a) / 1000).toFixed(1)}s`;
    console.log(
      `  timing: limits ${s(timing.start, timing.limits)}, receive photos ${s(timing.limits, timing.received)}, AI ${s(timing.received, timing.ai)}, photos stored ${s(timing.ai, done)} after`,
    );
    res.json({ draft, photos });
  });

  // 2. The reviewed draft becomes a bill.
  router.post('/bills', async (req, res) => {
    const result = validateBill(req.body, req.user.id);
    if (result.error) return res.status(400).json({ error: result.error });
    const bill = await repo.createBill(req.user, result.bill, result.items, result.photos);
    res.status(201).json({ id: bill.id, shareToken: bill.shareToken });
  });

  /** The payer's own bill and its state, or a 404 (another payer's bill doesn't exist for you). */
  async function ownBill(req, res) {
    const bill = /^[0-9a-f-]{36}$/i.test(req.params.id) ? await repo.getPayerBill(req.user.id, req.params.id) : null;
    if (!bill) {
      res.status(404).json({ error: 'bill_not_found' });
      return null;
    }
    return { bill, state: await repo.getBillState(bill) };
  }

  /** The bill screen's view. Photos come as short-lived signed links (PRD M3). */
  async function sendBill(res, bill, state) {
    const paths = await repo.listPhotos(bill.id);
    // One request for all of them; the bill still shows if Storage fails.
    const photos = await storage.signedUrls(paths).catch(() => []);
    res.json(payerBillView(bill, state, photos.filter(Boolean)));
  }

  // 3. One of the payer's bills: the bill screen (PRD M10) and the share screen.
  router.get('/bills/:id', async (req, res) => {
    const own = await ownBill(req, res);
    if (own) await sendBill(res, own.bill, own.state);
  });

  // 4. Edit after creating (PRD P2.6). Currency and photos stay; claims stay on kept items.
  router.patch('/bills/:id', async (req, res) => {
    const own = await ownBill(req, res);
    if (!own) return;
    const { bill, state } = own;
    const result = validateBill({ ...req.body, currency: bill.currency, photos: [] }, req.user.id);
    if (result.error) return res.status(400).json({ error: result.error });

    const sent = Array.isArray(req.body.items) ? req.body.items : [];
    const items = result.items.map((item, i) => ({ ...item, id: sent[i]?.id ?? null }));
    for (const item of items) {
      if (!item.id) continue;
      if (!state.items.some((i) => i.id === item.id)) return res.status(400).json({ error: 'invalid_items' });
      // One person per unit: a quantity can't drop below what people already claimed.
      const claimed = state.claims.filter((c) => c.itemId === item.id).reduce((acc, c) => acc + c.units, 0);
      if (item.quantity < claimed) return res.status(409).json({ error: 'below_claims', item: item.name, claimed });
    }

    await repo.updateBill(bill.id, result.bill, items);
    const updated = await repo.getPayerBill(req.user.id, bill.id);
    await sendBill(res, updated, await repo.getBillState(updated));
  });

  // 4b. Deletes the bill, with everything on it and its receipt photos.
  router.delete('/bills/:id', async (req, res) => {
    const own = await ownBill(req, res);
    if (!own) return;
    const paths = await repo.listPhotos(own.bill.id);
    await repo.deleteBill(own.bill.id);
    // The bill is gone either way; a photo left behind is only storage.
    await storage.remove(paths).catch((err) => console.error('Could not remove photos:', err.message));
    res.status(204).end();
  });

  // 5. Marks a guest paid or not (PRD §9: only the payer does; guests can't).
  router.patch('/bills/:id/members/:memberId', async (req, res) => {
    const own = await ownBill(req, res);
    if (!own) return;
    const { bill, state } = own;
    const { status } = req.body ?? {};
    if (!['confirmed', 'unpaid'].includes(status)) return res.status(400).json({ error: 'invalid_status' });
    const member = state.members.find((m) => m.id === req.params.memberId);
    if (!member) return res.status(404).json({ error: 'member_not_found' });
    if (member.isPayer) return res.status(400).json({ error: 'payer_row' });

    // Paid snapshots what they owed at that moment, so a later change shows (PRD Q7).
    const due = splitFor(bill, state).members[member.id].due;
    const patch =
      status === 'confirmed'
        ? { status, confirmedAt: new Date(), paidAmount: due }
        : { status, confirmedAt: null, markedPaidAt: null, paidAmount: null };
    await repo.updateMember(member.id, patch);
    const members = state.members.map((m) => (m.id === member.id ? { ...m, ...patch } : m));
    await sendBill(res, bill, { ...state, members });
  });

  // 6. Removes a guest who isn't paid (PRD Q10); their claims go with them.
  router.delete('/bills/:id/members/:memberId', async (req, res) => {
    const own = await ownBill(req, res);
    if (!own) return;
    const { bill, state } = own;
    const member = state.members.find((m) => m.id === req.params.memberId);
    if (!member) return res.status(404).json({ error: 'member_not_found' });
    if (member.isPayer) return res.status(400).json({ error: 'payer_row' });
    if (member.status === 'confirmed') return res.status(409).json({ error: 'member_paid' });
    await repo.deleteMember(member.id);
    await sendBill(res, bill, {
      ...state,
      members: state.members.filter((m) => m.id !== member.id),
      claims: state.claims.filter((c) => c.memberId !== member.id),
    });
  });

  // 7. The payer claims their own items (PRD Q4), with the guests' rules.
  async function payerClaim(req, res, change) {
    const own = await ownBill(req, res);
    if (!own) return;
    const payerRow = own.state.members.find((m) => m.isPayer);
    const result = await applyClaim(repo, own.state, req.params.itemId, payerRow.id, change);
    if (result.error) return res.status(result.status).json({ error: result.error });
    await sendBill(res, own.bill, result.state);
  }
  router.put('/bills/:id/claims/:itemId', (req, res) => payerClaim(req, res, { units: req.body?.units }));
  router.delete('/bills/:id/claims/:itemId', (req, res) => payerClaim(req, res, { remove: true }));

  // 8. Card paid (PRD M11, Q16): locks tips at what was charged. Can be undone.
  router.put('/bills/:id/card-paid', async (req, res) => {
    const own = await ownBill(req, res);
    if (!own) return;
    if (typeof req.body?.paid !== 'boolean') return res.status(400).json({ error: 'invalid_card_paid' });
    const at = req.body.paid ? new Date() : null;
    await repo.setCardPaid(own.bill.id, at);
    await sendBill(res, { ...own.bill, cardPaidAt: at }, own.state);
  });

  return router;
}
