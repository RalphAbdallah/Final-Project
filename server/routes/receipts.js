import express from 'express';
import { Photo } from '../models/Photo.js';
import { readReceipt } from '../services/openai.js';
import { buildDraft } from '../services/draft.js';
import { aiLimitsFromEnv, checkAiLimits, recordAiUsage } from '../services/aiLimits.js';
import { today } from '../services/text.js';

// Receipt photos in, a bill draft out (PRD M2). Mounted at /api/me/receipts, after requireAuth.
// The photos arrive as base64 text inside the JSON body: { photos: [{ type, data }] }.
const receiptsRouter = express.Router();

const MAX_PHOTOS = 6;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_CHARS = 11000000; // about an 8 MB photo, as base64 text

// Each error from the AI reader, and the status code it becomes.
const STATUS_FOR = {
  not_a_receipt: 422,
  several_receipts: 422,
  unclear_photos: 422,
  ai_not_configured: 503,
  ai_key_invalid: 503,
  ai_timeout: 504,
};

// Payers with a read running right now: one at a time each.
const reading = [];

receiptsRouter.post('/read', async (req, res) => {
  const userId = req.user.id;
  const limits = aiLimitsFromEnv();
  if (limits && reading.includes(userId)) return res.status(429).json({ error: 'read_in_progress' });

  const blocked = await checkAiLimits(userId, limits);
  if (blocked) {
    res.set('Retry-After', String(blocked.retryAfter));
    return res.status(429).json(blocked);
  }

  const photos = Array.isArray(req.body.photos) ? req.body.photos : [];
  if (photos.length === 0) return res.status(400).json({ error: 'no_photos' });
  if (photos.length > MAX_PHOTOS) return res.status(413).json({ error: 'too_many_photos' });
  for (const photo of photos) {
    if (!photo || !PHOTO_TYPES.includes(photo.type) || typeof photo.data !== 'string' || photo.data === '') {
      return res.status(400).json({ error: 'invalid_photos' });
    }
    if (photo.data.length > MAX_PHOTO_CHARS) return res.status(413).json({ error: 'photo_too_large' });
  }

  // 1. The AI copies what's printed.
  reading.push(userId);
  const started = Date.now();
  let raw;
  try {
    const result = await readReceipt(photos.map((p) => ({ mime: p.type, base64: p.data })));
    raw = result.raw;
    await recordAiUsage(userId, photos.length, result.usage, Date.now() - started, true);
  } catch (err) {
    await recordAiUsage(userId, photos.length, err.usage, Date.now() - started, false);
    const status = STATUS_FOR[err.code] || 502;
    if (status !== 422) console.error('Receipt read failed:', err.code, err.detail || err.message);
    const body = { error: err.code || 'ai_unavailable' };
    if (err.photos) body.photos = err.photos;
    return res.status(status).json(body);
  } finally {
    reading.splice(reading.indexOf(userId), 1);
  }

  // 2. The app does the math.
  const draft = buildDraft(raw, today());
  if (draft.items.length === 0) return res.status(422).json({ error: 'no_items' });

  // 3. Keep the photos; the bill picks them up when it's created (routes/bills.js).
  const saved = [];
  for (const photo of photos) {
    saved.push(await Photo.create({ userId, type: photo.type, data: photo.data }));
  }
  res.json({ draft, photos: saved.map((p) => p.id) });
});

export default receiptsRouter;
