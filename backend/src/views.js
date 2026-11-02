import { computeSplit } from './split/index.js';

/** The split for a bill's current claims. `state` comes from `repo.getBillState`. */
export function splitFor(bill, state) {
  return computeSplit({
    items: state.items,
    members: state.members,
    claims: state.claims,
    tax: bill.tax,
    taxIncluded: bill.taxIncluded,
    service: bill.service,
  });
}

/**
 * What a guest sees. Wallet links are only included once they have joined
 * (PRD §11); before that, only the wallet names.
 */
export function guestView(bill, state, me) {
  const split = splitFor(bill, state);
  const { items, members, claims, payer, payouts } = state;

  return {
    bill: {
      venue: bill.venue,
      date: bill.date,
      currency: bill.currency,
      subtotal: split.totals.subtotal,
      tax: bill.tax,
      taxRate: bill.taxRate,
      taxIncluded: bill.taxIncluded,
      service: bill.service,
      total: split.totals.bill,
      unclaimed: split.unclaimed.total,
      cardPaid: Boolean(bill.cardPaidAt),
    },
    payer: { name: payer?.name ?? 'The payer', wallets: payouts.map((p) => p.wallet) },
    members: members.map((m) => ({ id: m.id, name: m.name, isPayer: m.isPayer })),
    items: items.map((item) => {
      const itemSplit = split.items[item.id];
      return {
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        claimedUnits: itemSplit.claimedUnits,
        claims: claims.filter((c) => c.itemId === item.id).map(({ memberId, units }) => ({ memberId, units })),
        myUnits: me ? (claims.find((c) => c.itemId === item.id && c.memberId === me.id)?.units ?? 0) : 0,
        myShare: me ? (itemSplit.shares[me.id] ?? 0) : 0,
      };
    }),
    me: me
      ? {
          id: me.id,
          name: me.name,
          status: me.status,
          method: me.method,
          paidAmount: me.paidAmount,
          ...split.members[me.id],
          payouts,
        }
      : null,
  };
}
