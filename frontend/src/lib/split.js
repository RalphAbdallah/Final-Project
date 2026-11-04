/**
 * Split engine (PRD §8).
 *
 * Every amount is an integer in the currency's minor unit: cents for USD,
 * whole pounds for LBP. Members are passed in join order, which breaks
 * rounding ties. Tips never enter the split; they are added on top.
 */

/**
 * Distribute `total` units across `weights` with the largest remainder method:
 * floor every share, then hand the leftover units one each to the largest
 * fractional parts. Ties go to the earlier weight. BigInt keeps large LBP
 * amounts exact.
 */
export function allocate(total, weights) {
  const sum = weights.reduce((acc, w) => acc + w, 0);
  if (total === 0 || sum === 0) return weights.map(() => 0);

  const bigTotal = BigInt(total);
  const bigSum = BigInt(sum);
  const parts = weights.map((weight, index) => {
    const product = bigTotal * BigInt(weight);
    return { index, floor: Number(product / bigSum), remainder: product % bigSum };
  });

  const shares = parts.map((p) => p.floor);
  let left = total - shares.reduce((acc, s) => acc + s, 0);
  const byRemainder = [...parts].sort((a, b) => {
    if (a.remainder === b.remainder) return a.index - b.index;
    return a.remainder > b.remainder ? -1 : 1;
  });
  for (let i = 0; left > 0; i += 1, left -= 1) shares[byRemainder[i].index] += 1;
  return shares;
}

/**
 * @param {object} input
 * @param {{id: string, price: number, quantity: number}[]} input.items  price is the unit price
 * @param {{id: string, tip?: number}[]} input.members  in join order
 * @param {{itemId: string, memberId: string, units: number}[]} input.claims
 * @param {number} [input.tax]
 * @param {boolean} [input.taxIncluded]  tax already in the prices: shown, never added
 * @param {number} [input.service]
 */
export function computeSplit({ items, members, claims, tax = 0, taxIncluded = false, service = 0 }) {
  const position = new Map(members.map((m, i) => [m.id, i]));
  const n = members.length;
  const itemShares = new Array(n).fill(0);
  const perItem = {};
  let unclaimedItems = 0;

  for (const item of items) {
    const lineTotal = item.price * item.quantity;
    const units = new Array(n).fill(0);
    for (const claim of claims) {
      if (claim.itemId === item.id && position.has(claim.memberId)) {
        units[position.get(claim.memberId)] += claim.units;
      }
    }
    const claimedUnits = units.reduce((acc, u) => acc + u, 0);
    // Fewer claims than units: each unit costs the unit price and the rest is
    // unclaimed. More claims than units: people are sharing, split by units.
    const divisor = Math.max(claimedUnits, item.quantity);
    const parts = allocate(lineTotal, [...units, divisor - claimedUnits]);

    const shares = {};
    members.forEach((member, i) => {
      itemShares[i] += parts[i];
      if (units[i] > 0) shares[member.id] = parts[i];
    });
    unclaimedItems += parts[n];
    perItem[item.id] = { lineTotal, claimedUnits, shares, unclaimed: parts[n] };
  }

  const subtotal = itemShares.reduce((acc, s) => acc + s, 0) + unclaimedItems;
  const appliedTax = taxIncluded ? 0 : tax;
  const extras = appliedTax + service;
  const extraShares =
    subtotal === 0 ? [...new Array(n).fill(0), extras] : allocate(extras, [...itemShares, unclaimedItems]);

  const byMember = {};
  let tips = 0;
  members.forEach((member, i) => {
    const tip = member.tip ?? 0;
    const total = itemShares[i] + extraShares[i];
    tips += tip;
    byMember[member.id] = { items: itemShares[i], extras: extraShares[i], total, tip, due: total + tip };
  });

  const bill = subtotal + extras;
  return {
    members: byMember,
    items: perItem,
    unclaimed: { items: unclaimedItems, extras: extraShares[n], total: unclaimedItems + extraShares[n] },
    totals: { subtotal, tax: appliedTax, service, extras, bill, tips, card: bill + tips },
  };
}
