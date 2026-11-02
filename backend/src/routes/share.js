import { Router } from 'express';
import { newToken } from '../lib/tokens.js';
import { guestView, splitFor } from '../views.js';

const MAX_TIP = 100_000_000;

/** Guest routes: the share token picks the bill, `X-Guest-Token` picks the member (PRD §10). */
export function shareRoutes(repo) {
  const router = Router();

  router.param('shareToken', async (req, res, next, shareToken) => {
    const bill = await repo.getBillByShareToken(shareToken);
    if (!bill) return res.status(404).json({ error: 'bill_not_found' });
    req.bill = bill;
    const guestToken = req.get('x-guest-token');
    req.member = guestToken ? await repo.findGuest(bill.id, guestToken) : null;
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

  async function findClaimableItem(req, res) {
    const item = await repo.getItem(req.bill.id, req.params.itemId);
    if (!item) res.status(404).json({ error: 'item_not_found' });
    else if (req.member.status !== 'unpaid') res.status(409).json({ error: 'claims_locked' });
    else return item;
    return null;
  }

  router.put('/:shareToken/claims/:itemId', requireMember, async (req, res) => {
    const item = await findClaimableItem(req, res);
    if (!item) return;
    const units = req.body?.units;
    if (!Number.isInteger(units) || units < 1 || units > item.quantity) {
      return res.status(400).json({ error: 'invalid_units' });
    }
    await repo.setClaim(item.id, req.member.id, units);
    await sendView(req, res);
  });

  router.delete('/:shareToken/claims/:itemId', requireMember, async (req, res) => {
    const item = await findClaimableItem(req, res);
    if (!item) return;
    await repo.removeClaim(item.id, req.member.id);
    await sendView(req, res);
  });

  router.patch('/:shareToken/me', requireMember, async (req, res) => {
    const { tip, method, status } = req.body ?? {};
    const me = req.member;

    if (tip !== undefined) {
      if (!Number.isInteger(tip) || tip < 0 || tip > MAX_TIP) return res.status(400).json({ error: 'invalid_tip' });
      if (me.status !== 'unpaid' || req.bill.cardPaidAt) return res.status(409).json({ error: 'tip_locked' });
    }
    if (method !== undefined) {
      const wallets = (await repo.listPayouts(req.bill.payerId)).map((p) => p.wallet);
      if (method !== 'cash' && !wallets.includes(method)) return res.status(400).json({ error: 'invalid_method' });
    }
    if (status !== undefined) {
      const allowed =
        (me.status === 'unpaid' && status === 'marked_paid') || (me.status === 'marked_paid' && status === 'unpaid');
      if (!allowed) return res.status(409).json({ error: 'invalid_transition' });
      if (status === 'marked_paid' && !(method ?? me.method)) return res.status(400).json({ error: 'method_required' });
    }

    const patch = {};
    if (tip !== undefined) patch.tip = tip;
    if (method !== undefined) patch.method = method;
    if (status === 'marked_paid') {
      const state = await repo.getBillState(req.bill);
      const current = state.members.find((m) => m.id === me.id);
      const split = splitFor(req.bill, { ...state, members: state.members.map((m) => (m.id === me.id ? { ...current, ...patch } : m)) });
      Object.assign(patch, { status, markedPaidAt: new Date(), paidAmount: split.members[me.id].due });
    } else if (status === 'unpaid') {
      Object.assign(patch, { status, markedPaidAt: null, paidAmount: null });
    }
    await repo.updateMember(me.id, patch);
    await sendView(req, res);
  });

  return router;
}
