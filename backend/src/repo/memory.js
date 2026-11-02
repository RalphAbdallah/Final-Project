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
  const db = { users: [], bills: [], items: [], members: [], claims: [], payouts: [] };
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

    async listBills(userId) {
      return db.bills
        .filter((b) => b.payerId === userId)
        .reverse()
        .map(({ id, venue, date, shareToken }) => ({ id, venue, date, shareToken }));
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

    async findGuest(billId, guestToken) {
      return copy(db.members.find((m) => m.billId === billId && m.guestToken === guestToken));
    },

    async addGuest(billId, name, guestToken) {
      return copy(insertMember(billId, { name, guestToken }));
    },

    async getItem(billId, itemId) {
      return copy(db.items.find((i) => i.id === itemId && i.billId === billId));
    },

    async setClaim(itemId, memberId, units) {
      const existing = db.claims.find((c) => c.itemId === itemId && c.memberId === memberId);
      if (existing) existing.units = units;
      else db.claims.push({ itemId, memberId, units });
    },

    async removeClaim(itemId, memberId) {
      db.claims = db.claims.filter((c) => !(c.itemId === itemId && c.memberId === memberId));
    },

    async updateMember(memberId, patch) {
      Object.assign(db.members.find((m) => m.id === memberId), patch);
    },
  };
}
