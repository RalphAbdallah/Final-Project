import { Router } from 'express';
import { requirePayer } from '../auth.js';
import { checkPayUrl, WALLETS } from '../lib/wallets.js';
import { billRoutes } from './bills.js';

/** The logged-in payer: profile, get-paid setup (PRD M1), and their bills (M2). */
export function meRoutes({ repo, verifyToken, readReceipt, storage, aiLimits }) {
  const router = Router();
  router.use(requirePayer({ verifyToken, repo }));
  router.use(billRoutes({ repo, readReceipt, storage, aiLimits }));

  async function sendProfile(req, res) {
    const [payouts, bills] = await Promise.all([repo.listPayouts(req.user.id), repo.listBills(req.user.id)]);
    res.json({ name: req.user.name, email: req.user.email, payouts, bills });
  }

  router.get('/', sendProfile);

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
