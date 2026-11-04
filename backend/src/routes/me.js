import { Router } from 'express';
import { requirePayer } from '../auth.js';
import { checkPayUrl, WALLETS } from '../lib/wallets.js';
import { billSummary } from '../views.js';
import { billRoutes } from './bills.js';

/** The logged-in payer: profile, get-paid setup (PRD M1), and their bills (M2). */
export function meRoutes({ repo, verifyToken, readReceipt, storage, aiLimits, deleteAuthUser }) {
  const router = Router();
  router.use(requirePayer({ verifyToken, repo }));
  router.use(billRoutes({ repo, readReceipt, storage, aiLimits }));

  // The profile doubles as the dashboard (PRD M10): each bill with collected and still owed.
  async function sendProfile(req, res) {
    const [payouts, bills] = await Promise.all([repo.listPayouts(req.user.id), repo.listBillStates(req.user.id)]);
    res.json({
      name: req.user.name,
      email: req.user.email,
      payouts,
      bills: bills.map(({ bill, state }) => billSummary(bill, state)),
    });
  }

  router.get('/', sendProfile);

  // Rename. Email and password change in Supabase Auth, from the browser.
  router.patch('/', async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
    if (name.length < 1 || name.length > 60) return res.status(400).json({ error: 'invalid_name' });
    await repo.updateUser(req.user.id, { name });
    req.forgetUser();
    req.user = { ...req.user, name };
    await sendProfile(req, res);
  });

  // Deletes the account: the login, everything stored for it, and the receipt photos.
  router.delete('/', async (req, res) => {
    if (!deleteAuthUser) return res.status(503).json({ error: 'not_configured' });
    await storage.removeFolder(req.user.id).catch((err) => console.error('Could not remove photos:', err.message));
    await repo.deleteUser(req.user.id);
    await deleteAuthUser(req.user.id);
    req.forgetUser();
    res.status(204).end();
  });

  router.put('/payouts/:wallet', async (req, res) => {
    const { wallet } = req.params;
    const result = checkPayUrl(wallet, req.body?.payUrl);
    if (result.error === 'unknown_wallet') return res.status(404).json({ error: result.error });
    if (result.error) return res.status(422).json({ error: result.error, host: result.host });
    await repo.savePayout(req.user.id, wallet, result.url);
    await sendProfile(req, res);
  });

  router.delete('/payouts/:wallet', async (req, res) => {
    if (!WALLETS[req.params.wallet]) return res.status(404).json({ error: 'unknown_wallet' });
    await repo.deletePayout(req.user.id, req.params.wallet);
    await sendProfile(req, res);
  });

  // A sample bill to try the guest flow, until the bill editor exists (PLAN Phase 2).
  router.post('/sample-bill', async (req, res) => {
    const bill = await repo.createSampleBill(req.user);
    res.status(201).json({ shareToken: bill.shareToken });
  });

  return router;
}
