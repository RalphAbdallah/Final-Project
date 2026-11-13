import express from 'express';
import { Bill } from '../models/Bill.js';
import { User } from '../models/User.js';
import { limit } from '../middleware/rateLimits.js';
import { cleanText, newToken } from '../services/text.js';
import { applyClaim, changeBill, nameTaken, sendProblem } from '../services/bills.js';
import { guestView, payoutsOf } from '../services/views.js';

// Guest routes (PRD M5-M8). No account: the share token in the link picks the bill,
// and the X-Guest-Token header (saved in the guest's browser) picks who they are.
const shareRouter = express.Router();

const MAX_TIP = 100000000;

// Middleware: finds the bill (404 if none) and the guest, if the header matches one.
async function loadBill(req, res, next) {
  req.bill = await Bill.findOne({ shareToken: req.params.shareToken });
  if (!req.bill) return res.status(404).json({ error: 'bill_not_found' });
  const guestToken = req.headers['x-guest-token'];
  req.member = guestToken ? req.bill.members.find((m) => m.guestToken === guestToken) : null;
  next();
}

// Middleware: the routes below need someone who has joined.
function requireMember(req, res, next) {
  if (!req.member) return res.status(401).json({ error: 'not_joined' });
  next();
}

// The guest view of a bill, as `memberId` sees it.
async function sendView(res, bill, memberId, status = 200, extra = {}) {
  const payer = await User.findById(bill.userId);
  const me = bill.members.find((m) => m.id === memberId) || null;
  res.status(status).json({ ...extra, ...guestView(bill, payer, me) });
}

shareRouter.get('/:shareToken', loadBill, async (req, res) => {
  await sendView(res, req.bill, req.member ? req.member.id : null);
});

// Join with a name; the answer includes the guest token to keep (PRD M5).
shareRouter.post('/:shareToken/join', loadBill, limit.join, async (req, res) => {
  const name = cleanText(req.body.name);
  if (name.length < 1 || name.length > 40) return res.status(400).json({ error: 'invalid_name' });

  const guestToken = newToken();
  const result = await changeBill({ _id: req.bill._id }, (bill) => {
    if (nameTaken(bill, name)) return { status: 409, error: 'name_taken' };
    bill.members.push({ name, guestToken });
  });
  if (result.error) return sendProblem(res, result);

  const me = result.bill.members.find((m) => m.guestToken === guestToken);
  await sendView(res, result.bill, me.id, 201, { guestToken });
});

// Sets my units on an item, or removes my claim. Locked once the payer marks me paid.
async function changeClaim(req, res, units, remove) {
  const memberId = req.member.id;
  const result = await changeBill({ _id: req.bill._id }, (bill) => {
    const me = bill.members.find((m) => m.id === memberId);
    if (!me) return { status: 401, error: 'not_joined' };
    if (me.status !== 'unpaid') return { status: 409, error: 'claims_locked' };
    return applyClaim(bill, req.params.itemId, memberId, units, remove);
  });
  if (result.error) return sendProblem(res, result);
  await sendView(res, result.bill, memberId);
}

shareRouter.put('/:shareToken/claims/:itemId', loadBill, requireMember, limit.claim, (req, res) =>
  changeClaim(req, res, req.body.units, false),
);
shareRouter.delete('/:shareToken/claims/:itemId', loadBill, requireMember, limit.claim, (req, res) =>
  changeClaim(req, res, 0, true),
);

// My tip and payment method. Only the payer marks people as paid (team decision, 3 November 2026).
shareRouter.patch('/:shareToken/me', loadBill, requireMember, async (req, res) => {
  const { tip, method, status } = req.body;
  if (status !== undefined) return res.status(403).json({ error: 'payer_only' });

  if (tip !== undefined && (!Number.isInteger(tip) || tip < 0 || tip > MAX_TIP)) {
    return res.status(400).json({ error: 'invalid_tip' });
  }
  if (method !== undefined) {
    const payer = await User.findById(req.bill.userId);
    const wallets = payoutsOf(payer).map((p) => p.wallet);
    if (method !== 'cash' && !wallets.includes(method)) return res.status(400).json({ error: 'invalid_method' });
  }

  const memberId = req.member.id;
  const result = await changeBill({ _id: req.bill._id }, (bill) => {
    const me = bill.members.find((m) => m.id === memberId);
    if (!me) return { status: 401, error: 'not_joined' };
    if (tip !== undefined) {
      if (me.status !== 'unpaid' || bill.cardPaidAt) return { status: 409, error: 'tip_locked' };
      me.tip = tip;
    }
    if (method !== undefined) me.method = method;
  });
  if (result.error) return sendProblem(res, result);
  await sendView(res, result.bill, memberId);
});

export default shareRouter;