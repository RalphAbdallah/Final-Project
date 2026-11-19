import express from 'express';
import bcrypt from 'bcrypt';
import { User } from '../models/User.js';
import { Bill } from '../models/Bill.js';
import { Photo } from '../models/Photo.js';
import { AiUsage } from '../models/AiUsage.js';
import { validEmail } from './auth.js';
import { cleanText } from '../services/text.js';
import { checkPayUrl, WALLETS } from '../services/wallets.js';
import { billSummary, payoutsOf } from '../services/views.js';
import { changeBill, createSampleBill, nameTaken } from '../services/bills.js';

// The logged-in payer: profile, password, get-paid setup (PRD M1).
// Mounted at /api/me after requireAuth, so req.user is always set.
const meRouter = express.Router();

// The profile doubles as the dashboard (PRD M10): each bill with what's collected and still owed.
async function sendProfile(req, res) {
  const bills = await Bill.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50);
  res.json({
    name: req.user.name,
    email: req.user.email,
    payouts: payoutsOf(req.user),
    bills: bills.map(billSummary),
    // No OpenAI key: photos can't be read, so the app offers a sample bill instead.
    readingOn: Boolean(process.env.OPENAI_API_KEY),
  });
}

meRouter.get('/', sendProfile);

// Change name and/or email.
meRouter.patch('/', async (req, res) => {
  const { name, email } = req.body;

  if (name !== undefined) {
    const clean = cleanText(name);
    if (clean.length < 1 || clean.length > 60) return res.status(400).json({ error: 'invalid_name' });
    req.user.name = clean;
  }
  if (email !== undefined) {
    const clean = cleanText(email).toLowerCase();
    if (!validEmail(clean)) return res.status(400).json({ error: 'invalid_email' });
    const other = await User.findOne({ email: clean });
    if (other && other.id !== req.user.id) return res.status(409).json({ error: 'email_taken' });
    req.user.email = clean;
  }
  await req.user.save();

  // A new name also goes on the payer's own row in each bill, unless a guest there already has it.
  if (name !== undefined) {
    const bills = await Bill.find({ userId: req.user._id });
    for (const bill of bills) {
      await changeBill({ _id: bill._id }, (fresh) => {
        const payerRow = fresh.members.find((m) => m.isPayer);
        if (!nameTaken(fresh, req.user.name, payerRow.id)) payerRow.name = req.user.name;
      });
    }
  }
  await sendProfile(req, res);
});

// Change password: the current one is checked first.
meRouter.patch('/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const ok = typeof currentPassword === 'string' && (await bcrypt.compare(currentPassword, req.user.passwordHash));
  if (!ok) return res.status(400).json({ error: 'wrong_password' });
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'weak_password' });
  }
  if (newPassword === currentPassword) return res.status(400).json({ error: 'same_password' });
  req.user.passwordHash = await bcrypt.hash(newPassword, 12);
  await req.user.save();
  res.status(204).end();
});

// Deletes the account and everything stored for it.
meRouter.delete('/', async (req, res) => {
  await Bill.deleteMany({ userId: req.user._id });
  await Photo.deleteMany({ userId: req.user._id });
  await AiUsage.deleteMany({ userId: req.user._id });
  await User.findByIdAndDelete(req.user._id);
  res.status(204).end();
});

// Get-paid setup: save the link read from a wallet's QR code.
meRouter.put('/payouts/:wallet', async (req, res) => {
  const { wallet } = req.params;
  const result = checkPayUrl(wallet, req.body.payUrl);
  if (result.error === 'unknown_wallet') return res.status(404).json({ error: result.error });
  if (result.error) return res.status(422).json({ error: result.error, host: result.host });

  const existing = req.user.payouts.find((p) => p.wallet === wallet);
  if (existing) existing.payUrl = result.url;
  else req.user.payouts.push({ wallet, payUrl: result.url });
  await req.user.save();
  await sendProfile(req, res);
});

meRouter.delete('/payouts/:wallet', async (req, res) => {
  if (!WALLETS[req.params.wallet]) return res.status(404).json({ error: 'unknown_wallet' });
  req.user.payouts = req.user.payouts.filter((p) => p.wallet !== req.params.wallet);
  await req.user.save();
  await sendProfile(req, res);
});

// A sample bill with a few guests, to try the app without an OpenAI key (Home's
// "Try a sample bill" button), and for the tests.
meRouter.post('/sample-bill', async (req, res) => {
  const bill = await createSampleBill(req.user);
  res.status(201).json({ id: bill.id, shareToken: bill.shareToken });
});

export default meRouter;
