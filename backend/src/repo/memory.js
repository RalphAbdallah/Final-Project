import { newId, newToken } from '../lib/tokens.js';
import { SAMPLE_BILL } from '../sample.js';

export class NameTakenError extends Error {
  code = 'name_taken';
}

/**
 * In-memory repo with the same methods as the Postgres one. Used by the tests,
 * so they run without a database. Returns copies, like a real database would.
 */
export function createMemoryRepo() {
  const db = { users: [], bills: [], items: [], members: [], claims: [], payouts: [], aiUsage: [] };
  let seq = 0;
  const copy = (value) => (value == null ? null : structuredClone(value));

  function insertMember(billId, fields) {
    const taken = db.members.some((m) => m.billId === billId && m.name.toLowerCase() === fields.name.toLowerCase());
    if (taken) throw new NameTakenError();
    const member = {
      id: newId(),
      billId,
      isPayer: false,
      guestToken: null,
      status: 'unpaid',
      method: null,
      tip: 0,
      paidAmount: null,
      markedPaidAt: null,
      confirmedAt: null,
      seq: seq++,
      ...fields,
    };
    db.members.push(member);
    return member;
  }

  return {
    async getUser(id) {
      return copy(db.users.find((u) => u.id === id));
    },

    async createUser({ id, email, name }) {
      let user = db.users.find((u) => u.id === id);
      if (!user) {
        user = { id, email, name };
        db.users.push(user);
      }
      return copy(user);
    },

    async updateUser(id, { name, email }) {
      const user = db.users.find((u) => u.id === id);
      if (email !== undefined) user.email = email;
      if (name === undefined) return;
      user.name = name;
      for (const bill of db.bills.filter((b) => b.payerId === id)) {
        const others = db.members.filter((m) => m.billId === bill.id && !m.isPayer);
        if (others.some((m) => m.name.toLowerCase() === name.toLowerCase())) continue;
        const row = db.members.find((m) => m.billId === bill.id && m.isPayer);
        if (row) row.name = name;
      }
    },

    async deleteUser(id) {
      for (const bill of db.bills.filter((b) => b.payerId === id)) await this.deleteBill(bill.id);
      db.users = db.users.filter((u) => u.id !== id);
      db.payouts = db.payouts.filter((p) => p.userId !== id);
    },

    async listPayouts(userId) {
      return db.payouts.filter((p) => p.userId === userId).map(({ wallet, payUrl }) => ({ wallet, payUrl }));
    },

    async savePayout(userId, wallet, payUrl) {
      const existing = db.payouts.find((p) => p.userId === userId && p.wallet === wallet);
      if (existing) existing.payUrl = payUrl;
      else db.payouts.push({ userId, wallet, payUrl });
    },

    async deletePayout(userId, wallet) {
      db.payouts = db.payouts.filter((p) => !(p.userId === userId && p.wallet === wallet));
    },

    async listBillStates(userId) {
      const bills = db.bills.filter((b) => b.payerId === userId).reverse();
      return Promise.all(
        bills.map(async (bill) => {
          const { items, members, claims } = await this.getBillState(bill);
          return { bill: copy(bill), state: { items, members, claims } };
        }),
      );
    },

    async listPhotos(billId) {
      return copy(db.bills.find((b) => b.id === billId)?.photoPaths ?? []);
    },

    async updateBill(billId, fields, items) {
      Object.assign(db.bills.find((b) => b.id === billId), fields);
      const kept = new Set(items.filter((i) => i.id).map((i) => i.id));
      const removed = new Set(db.items.filter((i) => i.billId === billId && !kept.has(i.id)).map((i) => i.id));
      db.items = db.items.filter((i) => !removed.has(i.id));
      db.claims = db.claims.filter((c) => !removed.has(c.itemId));
      items.forEach((item, position) => {
        const existing = item.id && db.items.find((i) => i.id === item.id && i.billId === billId);
        if (existing) Object.assign(existing, { name: item.name, price: item.price, quantity: item.quantity, position });
        else db.items.push({ id: newId(), billId, position, name: item.name, price: item.price, quantity: item.quantity });
      });
    },

    async deleteBill(billId) {
      const itemIds = new Set(db.items.filter((i) => i.billId === billId).map((i) => i.id));
      db.bills = db.bills.filter((b) => b.id !== billId);
      db.items = db.items.filter((i) => i.billId !== billId);
      db.members = db.members.filter((m) => m.billId !== billId);
      db.claims = db.claims.filter((c) => !itemIds.has(c.itemId));
    },

    async setCardPaid(billId, at) {
      db.bills.find((b) => b.id === billId).cardPaidAt = at;
    },

    async deleteMember(memberId) {
      db.members = db.members.filter((m) => !(m.id === memberId && !m.isPayer));
      db.claims = db.claims.filter((c) => c.memberId !== memberId);
    },

    async createSampleBill(user) {
      const bill = {
        id: newId(),
        payerId: user.id,
        venue: SAMPLE_BILL.venue,
        date: new Date().toLocaleDateString('en-CA'),
        currency: SAMPLE_BILL.currency,
        tax: SAMPLE_BILL.tax,
        taxRate: SAMPLE_BILL.taxRate,
        taxIncluded: SAMPLE_BILL.taxIncluded,
        service: SAMPLE_BILL.service,
        shareToken: newToken(),
        cardPaidAt: null,
      };
      db.bills.push(bill);
      const items = SAMPLE_BILL.items.map((item, position) => ({ id: newId(), billId: bill.id, position, ...item }));
      db.items.push(...items);

      const claim = (member, claims) =>
        claims.forEach(([index, units]) => db.claims.push({ itemId: items[index].id, memberId: member.id, units }));
      claim(insertMember(bill.id, { name: user.name, isPayer: true, status: 'confirmed' }), SAMPLE_BILL.payerClaims);
      for (const guest of SAMPLE_BILL.guests) {
        claim(insertMember(bill.id, { name: guest.name, guestToken: newToken() }), guest.claims);
      }
      return copy(bill);
    },

    async createBill(user, fields, items, photoPaths) {
      const bill = { id: newId(), payerId: user.id, shareToken: newToken(), cardPaidAt: null, ...fields, photoPaths };
      db.bills.push(bill);
      db.items.push(...items.map((item, position) => ({ id: newId(), billId: bill.id, position, ...item })));
      insertMember(bill.id, { name: user.name, isPayer: true, status: 'confirmed' });
      return copy(bill);
    },

    async aiUsageSince({ userId, since }) {
      const rows = db.aiUsage.filter((r) => r.createdAt >= since && (!userId || r.userId === userId));
      return {
        reads: rows.length,
        tokens: rows.reduce((acc, r) => acc + r.totalTokens, 0),
        oldest: rows.length ? new Date(Math.min(...rows.map((r) => r.createdAt.getTime()))) : null,
      };
    },

    async recordAiUsage({ userId, photos, usage, ms, ok, createdAt = new Date() }) {
      db.aiUsage.push({ userId, photos, totalTokens: usage?.total ?? 0, ms, ok, createdAt });
    },

    async getPayerBill(userId, billId) {
      return copy(db.bills.find((b) => b.id === billId && b.payerId === userId));
    },

    async getBillByShareToken(shareToken) {
      return copy(db.bills.find((b) => b.shareToken === shareToken));
    },

    async getBillState(bill) {
      const items = db.items.filter((i) => i.billId === bill.id).sort((a, b) => a.position - b.position);
      const members = db.members.filter((m) => m.billId === bill.id).sort((a, b) => a.seq - b.seq);
      const itemIds = new Set(items.map((i) => i.id));
      const claims = db.claims.filter((c) => itemIds.has(c.itemId));
      const payer = db.users.find((u) => u.id === bill.payerId);
      return copy({
        items,
        members,
        claims,
        payer: { id: payer.id, name: payer.name },
        payouts: await this.listPayouts(bill.payerId),
      });
    },

    async findGuestByShareToken(shareToken, guestToken) {
      const bill = db.bills.find((b) => b.shareToken === shareToken);
      return copy(bill && db.members.find((m) => m.billId === bill.id && m.guestToken === guestToken));
    },

    async addGuest(billId, name, guestToken) {
      return copy(insertMember(billId, { name, guestToken }));
    },

    async setClaim(itemId, memberId, units) {
      const item = db.items.find((i) => i.id === itemId);
      const others = db.claims.filter((c) => c.itemId === itemId && c.memberId !== memberId);
      if (!item || units > item.quantity - others.reduce((acc, c) => acc + c.units, 0)) return false;
      const existing = db.claims.find((c) => c.itemId === itemId && c.memberId === memberId);
      if (existing) existing.units = units;
      else db.claims.push({ itemId, memberId, units });
      return true;
    },

    async removeClaim(itemId, memberId) {
      db.claims = db.claims.filter((c) => !(c.itemId === itemId && c.memberId === memberId));
    },

    async updateMember(memberId, patch) {
      Object.assign(db.members.find((m) => m.id === memberId), patch);
    },
  };
}
