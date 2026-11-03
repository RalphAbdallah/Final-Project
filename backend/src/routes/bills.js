import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { buildDraft } from '../receipts/draft.js';
import { aiLimitsFromEnv, checkAiLimits } from '../receipts/limits.js';
import { splitFor } from '../views.js';

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
    if (reading.has(req.user.id)) return res.status(429).json({ error: 'read_in_progress' });
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
      const status = { not_a_receipt: 422, ai_key_invalid: 503, ai_timeout: 504 }[err.code] ?? 502;
      if (status !== 422) console.error('Receipt read failed:', err.code, err.detail ?? err.message);
      return res.status(status).json({ error: err.code ?? 'ai_unavailable' });
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

  // 3. One of the payer's bills, for the share screen.
  router.get('/bills/:id', async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: 'bill_not_found' });
    const bill = await repo.getPayerBill(req.user.id, req.params.id);
    if (!bill) return res.status(404).json({ error: 'bill_not_found' });
    const state = await repo.getBillState(bill);
    const split = splitFor(bill, state);
    res.json({
      id: bill.id,
      venue: bill.venue,
      date: bill.date,
      currency: bill.currency,
      shareToken: bill.shareToken,
      total: split.totals.bill,
      items: state.items.length,
      guests: state.members.filter((m) => !m.isPayer).length,
    });
  });

  return router;
}
