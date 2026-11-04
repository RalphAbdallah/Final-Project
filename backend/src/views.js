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
 * Who has paid the payer back: collected (guests marked paid, at what they paid) and
 * still owed (everyone else's share plus tip). The payer's own row never owes.
 */
function money(split, members) {
  let collected = 0;
  let outstanding = 0;
  let unpaid = 0;
  for (const m of members) {
    if (m.isPayer) continue;
    if (m.status === 'confirmed') collected += m.paidAmount ?? split.members[m.id].due;
    else {
      outstanding += split.members[m.id].due;
      unpaid += 1;
    }
  }
  return { collected, outstanding, unpaid };
}

/** One bill on the payer's dashboard (PRD M10). `state` needs items, members, claims. */
export function billSummary(bill, state) {
  const split = splitFor(bill, state);
  return {
    id: bill.id,
    venue: bill.venue,
    date: bill.date,
    currency: bill.currency,
    shareToken: bill.shareToken,
    total: split.totals.bill,
    guests: state.members.filter((m) => !m.isPayer).length,
    ...money(split, state.members),
  };
}

/**
 * The payer's bill screen (PRD M10, M11): the guest view's shape for the payer's own
 * claims (so the phone can preview them like a guest's), plus every member's share,
 * tip, method and status, the card total, and the receipt photos.
 */
export function payerBillView(bill, state, photos = []) {
  const split = splitFor(bill, state);
  const payerRow = state.members.find((m) => m.isPayer);
  const view = guestView(bill, state, payerRow);
  const members = state.members.map((m) => {
    const share = split.members[m.id];
    return {
      id: m.id,
      name: m.name,
      isPayer: m.isPayer,
      status: m.status,
      method: m.method,
      ...share,
      paidAmount: m.paidAmount,
      // Marked paid, then the bill or their claims changed (PRD Q7): what they paid no longer matches.
      changed: !m.isPayer && m.status === 'confirmed' && m.paidAmount != null && m.paidAmount !== share.due,
    };
  });
  return {
    ...view,
    bill: {
      ...view.bill,
      id: bill.id,
      shareToken: bill.shareToken,
      lbpRate: bill.lbpRate,
      tips: split.totals.tips,
      card: split.totals.card,
      ...money(split, state.members),
    },
    members,
    photos,
  };
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
