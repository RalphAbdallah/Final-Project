import { computeSplit } from './split.js';

// What the API sends back about a bill. Each view is built from the bill document
// (items, members and claims inside it) and its payer (the User).

// The split for a bill's current claims (PRD §8).
export function splitFor(bill) {
  return computeSplit({
    items: bill.items,
    members: bill.members,
    claims: bill.claims,
    tax: bill.tax,
    taxIncluded: bill.taxIncluded,
    service: bill.service,
  });
}

// The payer's wallet links: [{ wallet, payUrl }]
export function payoutsOf(user) {
  if (!user) return [];
  return user.payouts.map((p) => ({ wallet: p.wallet, payUrl: p.payUrl }));
}

// What the payer has collected (guests marked paid, at what they paid), and what's still owed.
// The payer's own row never owes.
function money(split, members) {
  let collected = 0;
  let outstanding = 0;
  let unpaid = 0;
  for (const m of members) {
    if (m.isPayer) continue;
    if (m.status === 'confirmed') {
      collected += m.paidAmount === null ? split.members[m.id].due : m.paidAmount;
    } else {
      outstanding += split.members[m.id].due;
      unpaid += 1;
    }
  }
  return { collected, outstanding, unpaid };
}

// One bill on the payer's dashboard (PRD M10).
export function billSummary(bill) {
  const split = splitFor(bill);
  return {
    id: bill.id,
    venue: bill.venue,
    date: bill.date,
    currency: bill.currency,
    shareToken: bill.shareToken,
    total: split.totals.bill,
    guests: bill.members.filter((m) => !m.isPayer).length,
    ...money(split, bill.members),
  };
}

// What a guest sees. Wallet links are only included once they have joined (PRD §11).
export function guestView(bill, payer, me) {
  const split = splitFor(bill);

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
    payer: {
      name: payer ? payer.name : 'The payer',
      wallets: payoutsOf(payer).map((p) => p.wallet),
    },
    members: bill.members.map((m) => ({ id: m.id, name: m.name, isPayer: m.isPayer })),
    items: bill.items.map((item) => {
      const itemSplit = split.items[item.id];
      const claims = bill.claims.filter((c) => c.itemId === item.id);
      const mine = me ? claims.find((c) => c.memberId === me.id) : null;
      return {
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        claimedUnits: itemSplit.claimedUnits,
        claims: claims.map((c) => ({ memberId: c.memberId, units: c.units })),
        myUnits: mine ? mine.units : 0,
        myShare: me ? itemSplit.shares[me.id] || 0 : 0,
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
          payouts: payoutsOf(payer),
        }
      : null,
  };
}

/**
 * The payer's bill screen (PRD M10, M11): the guest view for the payer's own claims,
 * plus every member's share, tip, method and status, the card total, and the photo ids.
 */
export function payerBillView(bill, payer) {
  const split = splitFor(bill);
  const payerRow = bill.members.find((m) => m.isPayer);
  const view = guestView(bill, payer, payerRow);
  const members = bill.members.map((m) => {
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
      changed: !m.isPayer && m.status === 'confirmed' && m.paidAmount !== null && m.paidAmount !== share.due,
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
      ...money(split, bill.members),
    },
    members,
    photos: bill.photos,
  };
}
