import express from 'express';
import mongoose from 'mongoose';
import { Bill } from '../models/Bill.js';
import { Photo } from '../models/Photo.js';
import { limit } from '../middleware/rateLimits.js';
import { cleanText, isIsoDate, newToken } from '../services/text.js';
import { applyClaim, changeBill, sendProblem } from '../services/bills.js';
import { billSummary, payerBillView, splitFor } from '../services/views.js';

// The payer's bills (PRD M2, M10). Mounted at /api/me/bills, after requireAuth.
// Every query includes userId: another payer's bill is a 404 (Session 19, authorization).
const billsRouter = express.Router();

const MAX_MONEY = 10000000000;
const MAX_TIP = 100000000;
const isMoney = (v) => Number.isInteger(v) && v >= 0 && v <= MAX_MONEY;

/**
 * Checks a bill sent by the payer (a reviewed draft, or an edit).
 * Returns { bill, items } or { error }.
 */
export function validateBill(body) {
  const venue = cleanText(body.venue);
  if (venue.length < 1 || venue.length > 80) return { error: 'invalid_venue' };
  if (!isIsoDate(body.date)) return { error: 'invalid_date' };
  if (!['USD', 'LBP'].includes(body.currency)) return { error: 'invalid_currency' };
  if (!isMoney(body.tax) || !isMoney(body.service)) return { error: 'invalid_extras' };
  const taxRate = body.taxRate === undefined ? null : body.taxRate;
  if (taxRate !== null && !(typeof taxRate === 'number' && taxRate >= 0 && taxRate <= 100)) {
    return { error: 'invalid_extras' };
  }
  const lbpRate = body.lbpRate === undefined ? null : body.lbpRate;
  if (lbpRate !== null && !(typeof lbpRate === 'number' && lbpRate > 0)) return { error: 'invalid_extras' };

  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 200) {
    return { error: 'invalid_items' };
  }
  const items = [];
  for (const item of body.items) {
    const name = cleanText(item && item.name);
    if (name.length < 1 || name.length > 80 || !isMoney(item.price)) return { error: 'invalid_items' };
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) {
      return { error: 'invalid_items' };
    }
    items.push({ id: item.id, name, price: item.price, quantity: item.quantity });
  }

  return {
    bill: {
      venue,
      date: body.date,
      currency: body.currency,
      tax: body.tax,
      taxRate,
      taxIncluded: Boolean(body.taxIncluded),
      service: body.service,
      lbpRate,
    },
    items,
  };
}

// Only this payer's bill. An id that can't exist is just "not found".
function ownBill(req) {
  if (!mongoose.isValidObjectId(req.params.id)) return null;
  return { _id: req.params.id, userId: req.user._id };
}

// The bill screen's view, or a 404.
function sendBill(res, result, payer) {
  if (result.error) return sendProblem(res, result);
  res.json(payerBillView(result.bill, payer));
}

// Read all: the payer's bills, newest first (the dashboard also gets them from GET /api/me).
billsRouter.get('/', async (req, res) => {
  const bills = await Bill.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50);
  res.json(bills.map(billSummary));
});

// Create: the reviewed draft becomes a bill, with the payer as its first member.
billsRouter.post('/', async (req, res) => {
  const result = validateBill(req.body);
  if (result.error) return res.status(400).json({ error: result.error });

  // Photo ids from /api/me/receipts/read: this payer's, and not on another bill yet.
  const photoIds = Array.isArray(req.body.photos) ? req.body.photos : [];
  if (photoIds.length > 6 || !photoIds.every((id) => mongoose.isValidObjectId(id))) {
    return res.status(400).json({ error: 'invalid_photos' });
  }
  const photos = await Photo.find({ _id: photoIds, userId: req.user._id, billId: null });
  if (photos.length !== photoIds.length) return res.status(400).json({ error: 'invalid_photos' });

  const bill = await Bill.create({
    userId: req.user._id,
    ...result.bill,
    shareToken: newToken(),
    items: result.items.map(({ name, price, quantity }) => ({ name, price, quantity })),
    members: [{ name: req.user.name, isPayer: true, status: 'confirmed' }],
    photos: photoIds,
  });
  for (const photo of photos) {
    photo.billId = bill._id;
    await photo.save();
  }
  res.status(201).json({ id: bill.id, shareToken: bill.shareToken });
});

// Read one: the bill screen (PRD M10) and the share screen.
billsRouter.get('/:id', async (req, res) => {
  const filter = ownBill(req);
  const bill = filter ? await Bill.findOne(filter) : null;
  if (!bill) return res.status(404).json({ error: 'bill_not_found' });
  res.json(payerBillView(bill, req.user));
});

// The receipt photos, as data URLs an <img> can show. Asked for once, not on every refresh.
billsRouter.get('/:id/photos', async (req, res) => {
  const filter = ownBill(req);
  const bill = filter ? await Bill.findOne(filter) : null;
  if (!bill) return res.status(404).json({ error: 'bill_not_found' });
  const photos = await Photo.find({ billId: bill._id });
  const inOrder = bill.photos.map((id) => photos.find((p) => p.id === id)).filter((p) => p);
  res.json(inOrder.map((p) => ({ id: p.id, src: `data:${p.type};base64,${p.data}` })));
});

// Update: edit after creating (PRD P2.6). Currency and photos stay; claims stay on kept items.
billsRouter.patch('/:id', async (req, res) => {
  const filter = ownBill(req);
  if (!filter) return res.status(404).json({ error: 'bill_not_found' });

  const result = await changeBill(filter, (bill) => {
    const checked = validateBill({ ...req.body, currency: bill.currency });
    if (checked.error) return { status: 400, error: checked.error };

    const items = [];
    for (const item of checked.items) {
      if (!item.id) {
        items.push({ name: item.name, price: item.price, quantity: item.quantity });
        continue;
      }
      const existing = bill.items.find((i) => i.id === item.id);
      if (!existing) return { status: 400, error: 'invalid_items' };
      // One person per unit: a quantity can't drop below what people already claimed.
      const claimed = bill.claims.filter((c) => c.itemId === item.id).reduce((sum, c) => sum + c.units, 0);
      if (item.quantity < claimed) return { status: 409, error: 'below_claims', item: item.name, claimed };
      existing.name = item.name;
      existing.price = item.price;
      existing.quantity = item.quantity;
      items.push(existing);
    }

    const keptIds = checked.items.filter((i) => i.id).map((i) => i.id);
    bill.claims = bill.claims.filter((c) => keptIds.includes(c.itemId));
    bill.items = items;
    bill.venue = checked.bill.venue;
    bill.date = checked.bill.date;
    bill.tax = checked.bill.tax;
    bill.taxRate = checked.bill.taxRate;
    bill.taxIncluded = checked.bill.taxIncluded;
    bill.service = checked.bill.service;
  });
  sendBill(res, result, req.user);
});

// Delete: the bill with everything on it, and its photos.
billsRouter.delete('/:id', async (req, res) => {
  const filter = ownBill(req);
  const bill = filter ? await Bill.findOneAndDelete(filter) : null;
  if (!bill) return res.status(404).json({ error: 'bill_not_found' });
  await Photo.deleteMany({ billId: bill._id });
  res.status(204).end();
});

// Marks a guest paid or not (PRD §9: only the payer does).
billsRouter.patch('/:id/members/:memberId', async (req, res) => {
  const filter = ownBill(req);
  if (!filter) return res.status(404).json({ error: 'bill_not_found' });
  const { status } = req.body;
  if (!['confirmed', 'unpaid'].includes(status)) return res.status(400).json({ error: 'invalid_status' });

  const result = await changeBill(filter, (bill) => {
    const member = bill.members.find((m) => m.id === req.params.memberId);
    if (!member) return { status: 404, error: 'member_not_found' };
    if (member.isPayer) return { status: 400, error: 'payer_row' };

    member.status = status;
    if (status === 'confirmed') {
      // Snapshot of what they owed right now, so a later change shows (PRD Q7).
      member.paidAmount = splitFor(bill).members[member.id].due;
      member.confirmedAt = new Date();
    } else {
      member.paidAmount = null;
      member.confirmedAt = null;
    }
  });
  sendBill(res, result, req.user);
});

// Removes a guest who hasn't paid (PRD Q10); their claims go with them.
billsRouter.delete('/:id/members/:memberId', async (req, res) => {
  const filter = ownBill(req);
  if (!filter) return res.status(404).json({ error: 'bill_not_found' });

  const result = await changeBill(filter, (bill) => {
    const member = bill.members.find((m) => m.id === req.params.memberId);
    if (!member) return { status: 404, error: 'member_not_found' };
    if (member.isPayer) return { status: 400, error: 'payer_row' };
    if (member.status === 'confirmed') return { status: 409, error: 'member_paid' };
    bill.members = bill.members.filter((m) => m.id !== member.id);
    bill.claims = bill.claims.filter((c) => c.memberId !== member.id);
  });
  sendBill(res, result, req.user);
});

// The payer claims their own items (PRD Q4), with the guests' rules and rate limit.
async function payerClaim(req, res, units, remove) {
  const filter = ownBill(req);
  if (!filter) return res.status(404).json({ error: 'bill_not_found' });
  const result = await changeBill(filter, (bill) => {
    const payerRow = bill.members.find((m) => m.isPayer);
    return applyClaim(bill, req.params.itemId, payerRow.id, units, remove);
  });
  sendBill(res, result, req.user);
}
billsRouter.put('/:id/claims/:itemId', limit.payerClaim, (req, res) => payerClaim(req, res, req.body.units, false));
billsRouter.delete('/:id/claims/:itemId', limit.payerClaim, (req, res) => payerClaim(req, res, 0, true));

// Card paid (PRD M11, Q16): locks tips at what was charged. Can be undone.
billsRouter.put('/:id/card-paid', async (req, res) => {
  const filter = ownBill(req);
  if (!filter) return res.status(404).json({ error: 'bill_not_found' });
  if (typeof req.body.paid !== 'boolean') return res.status(400).json({ error: 'invalid_card_paid' });

  const result = await changeBill(filter, (bill) => {
    bill.cardPaidAt = req.body.paid ? new Date() : null;
  });
  sendBill(res, result, req.user);
});

// The payer's own tip (PRD M11): counts in the tips total, locked once the card is paid.
billsRouter.put('/:id/tip', async (req, res) => {
  const filter = ownBill(req);
  if (!filter) return res.status(404).json({ error: 'bill_not_found' });
  const { tip } = req.body;
  if (!Number.isInteger(tip) || tip < 0 || tip > MAX_TIP) return res.status(400).json({ error: 'invalid_tip' });

  const result = await changeBill(filter, (bill) => {
    if (bill.cardPaidAt) return { status: 409, error: 'tip_locked' };
    bill.members.find((m) => m.isPayer).tip = tip;
  });
  sendBill(res, result, req.user);
});

export default billsRouter;
