import { computeSplit } from './split.js';

/*
 * The guest view with my units on one item changed, worked out on the phone so the
 * totals change on the tap (PRD §11: claims update optimistically, then reconcile).
 * split.js is an exact copy of the server's engine (a backend test keeps it identical),
 * so the preview shows the numbers the server will send; its answer replaces this one.
 */
export function previewClaim(view, itemId, units) {
  const meId = view.me.id;
  const claims = view.items.flatMap((item) =>
    item.claims
      .filter((c) => !(item.id === itemId && c.memberId === meId))
      .map((c) => ({ itemId: item.id, memberId: c.memberId, units: c.units })),
  );
  if (units > 0) claims.push({ itemId, memberId: meId, units });

  const split = computeSplit({
    items: view.items,
    members: view.members, // in join order, which breaks rounding ties
    claims,
    tax: view.bill.tax,
    taxIncluded: view.bill.taxIncluded,
    service: view.bill.service,
  });
  const mine = split.members[meId];

  return {
    ...view,
    bill: { ...view.bill, unclaimed: split.unclaimed.total },
    items: view.items.map((item) => {
      const itemSplit = split.items[item.id];
      const itemClaims = claims.filter((c) => c.itemId === item.id).map(({ memberId, units: u }) => ({ memberId, units: u }));
      return {
        ...item,
        claims: itemClaims,
        claimedUnits: itemSplit.claimedUnits,
        myUnits: itemClaims.find((c) => c.memberId === meId)?.units ?? 0,
        myShare: itemSplit.shares[meId] ?? 0,
      };
    }),
    // Tips stay out of the split: mine is added on top, as on the server.
    me: { ...view.me, items: mine.items, extras: mine.extras, total: mine.total, due: mine.total + view.me.tip },
  };
}
