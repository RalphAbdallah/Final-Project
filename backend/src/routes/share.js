import { Router } from 'express';
import { newToken } from '../lib/tokens.js';
import { applyClaim } from '../claims.js';
import { guestView } from '../views.js';

const MAX_TIP = 100_000_000;

/** Guest routes: the share token picks the bill, `X-Guest-Token` picks the member (PRD §10). */
export function shareRoutes(repo) {
  const router = Router();

  router.param('shareToken', async (req, res, next, shareToken) => {
    const guestToken = req.get('x-guest-token');
    // Both at once: each database round trip is ~80 ms from Lebanon to the database.
    const [bill, member] = await Promise.all([
      repo.getBillByShareToken(shareToken),
      guestToken ? repo.findGuestByShareToken(shareToken, guestToken) : null,
    ]);
    if (!bill) return res.status(404).json({ error: 'bill_not_found' });
    req.bill = bill;
    req.member = member;
    next();
  });

  const requireMember = (req, res, next) => {
    if (!req.member) return res.status(401).json({ error: 'not_joined' });
    next();
  };

  /** Re-reads the bill (and the member, which may have just changed) and sends the guest view. */
  async function sendView(req, res, { status = 200, extra = {} } = {}) {
    const state = await repo.getBillState(req.bill);
    const me = req.member ? state.members.find((m) => m.id === req.member.id) : null;
    res.status(status).json({ ...extra, ...guestView(req.bill, state, me) });
  }

  router.get('/:shareToken', (req, res) => sendView(req, res));

  router.post('/:shareToken/join', async (req, res) => {
    const raw = req.body?.name;
    const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
    if (name.length < 1 || name.length > 40) return res.status(400).json({ error: 'invalid_name' });

    const guestToken = newToken();
    try {
      req.member = await repo.addGuest(req.bill.id, name, guestToken);
    } catch (err) {
      if (err.code === 'name_taken') return res.status(409).json({ error: 'name_taken' });
      throw err;
    }
    await sendView(req, res, { status: 201, extra: { guestToken } });
  });

  /**
   * Sets my units on an item, or removes my claim (`remove`). Claims are the most frequent
   * tap, so the bill is read once (3 round trips, was 5); see applyClaim. Someone else's
   * claim landing in between shows on the next poll. Locked once the payer marks me paid.
   */
  async function changeClaim(req, res, change) {
    if (req.member.status !== 'unpaid') return res.status(409).json({ error: 'claims_locked' });
    const state = await repo.getBillState(req.bill);
    const result = await applyClaim(repo, state, req.params.itemId, req.member.id, change);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(guestView(req.bill, result.state, result.state.members.find((m) => m.id === req.member.id)));
  }

  router.put('/:shareToken/claims/:itemId', requireMember, (req, res) => changeClaim(req, res, { units: req.body?.units }));
  router.delete('/:shareToken/claims/:itemId', requireMember, (req, res) => changeClaim(req, res, { remove: true }));

  router.patch('/:shareToken/me', requireMember, async (req, res) => {
    const { tip, method, status } = req.body ?? {};
    const me = req.member;

    // Only the payer marks people as paid (team decision, 3 November 2026), from the dashboard.
    if (status !== undefined) return res.status(403).json({ error: 'payer_only' });

    if (tip !== undefined) {
      if (!Number.isInteger(tip) || tip < 0 || tip > MAX_TIP) return res.status(400).json({ error: 'invalid_tip' });
      if (me.status !== 'unpaid' || req.bill.cardPaidAt) return res.status(409).json({ error: 'tip_locked' });
    }
    if (method !== undefined) {
      const wallets = (await repo.listPayouts(req.bill.payerId)).map((p) => p.wallet);
      if (method !== 'cash' && !wallets.includes(method)) return res.status(400).json({ error: 'invalid_method' });
    }

    const patch = {};
    if (tip !== undefined) patch.tip = tip;
    if (method !== undefined) patch.method = method;
    await repo.updateMember(me.id, patch);
    await sendView(req, res);
  });

  return router;
}
