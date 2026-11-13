import { Bill } from '../models/Bill.js';
import { newToken } from './text.js';
import { SAMPLE_BILL } from './sampleData.js';

/**
 * Changes a bill and saves it.
 *
 * Three phones can claim on the same bill at the same moment. The Bill schema has
 * optimisticConcurrency on, so when two saves collide, the second one fails with a
 * VersionError instead of erasing the first one's change. Then we read the bill again
 * and redo the change on the fresh copy (up to 3 tries).
 *
 * change(bill) edits the bill, or returns { status, error } to stop without saving.
 * Returns { bill } once saved, or the { status, error } to send back.
 */
export async function changeBill(filter, change) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const bill = await Bill.findOne(filter);
    if (!bill) return { status: 404, error: 'bill_not_found' };

    const problem = change(bill);
    if (problem) return problem;

    try {
      await bill.save();
      return { bill };
    } catch (err) {
      if (err.name !== 'VersionError' || attempt === 3) throw err;
    }
  }
}

// Sends { status, error, ...details } as the response: the status code, then the rest as JSON.
export function sendProblem(res, problem) {
  const { status, ...body } = problem;
  res.status(status).json(body);
}

/**
 * Sets a member's units on an item, or removes their claim (remove = true).
 * One person per unit (PRD M6): claims can never add up to more than the quantity.
 * Edits the bill; returns { status, error } if the claim isn't allowed.
 */
export function applyClaim(bill, itemId, memberId, units, remove) {
  const item = bill.items.find((i) => i.id === itemId);
  if (!item) return { status: 404, error: 'item_not_found' };

  if (remove) {
    bill.claims = bill.claims.filter((c) => !(c.itemId === itemId && c.memberId === memberId));
    return null;
  }

  if (!Number.isInteger(units) || units < 1 || units > item.quantity) {
    return { status: 400, error: 'invalid_units' };
  }
  // At most what nobody else has claimed.
  const othersUnits = bill.claims
    .filter((c) => c.itemId === itemId && c.memberId !== memberId)
    .reduce((sum, c) => sum + c.units, 0);
  if (units > item.quantity - othersUnits) return { status: 409, error: 'not_enough_left' };

  const mine = bill.claims.find((c) => c.itemId === itemId && c.memberId === memberId);
  if (mine) mine.units = units;
  else bill.claims.push({ itemId, memberId, units });
  return null;
}

// Is this name already used by someone else on the bill? (case doesn't matter)
export function nameTaken(bill, name, exceptMemberId) {
  return bill.members.some((m) => m.id !== exceptMemberId && m.name.toLowerCase() === name.toLowerCase());
}

/**
 * A sample bill to try the guest flow (used by the tests): a few items, the payer
 * and two guests who already claimed some of them.
 */
export async function createSampleBill(user) {
  const bill = new Bill({
    userId: user._id,
    venue: SAMPLE_BILL.venue,
    date: new Date().toLocaleDateString('en-CA'),
    currency: SAMPLE_BILL.currency,
    tax: SAMPLE_BILL.tax,
    taxRate: SAMPLE_BILL.taxRate,
    taxIncluded: SAMPLE_BILL.taxIncluded,
    service: SAMPLE_BILL.service,
    shareToken: newToken(),
    items: SAMPLE_BILL.items,
    members: [
      { name: user.name, isPayer: true, status: 'confirmed' },
      ...SAMPLE_BILL.guests.map((guest) => ({ name: guest.name, guestToken: newToken() })),
    ],
  });

  // Claims are [item index, units] for each person; ids exist once the bill is built.
  const addClaims = (member, claims) => {
    for (const [index, units] of claims) {
      bill.claims.push({ itemId: bill.items[index].id, memberId: member.id, units });
    }
  };
  addClaims(bill.members[0], SAMPLE_BILL.payerClaims);
  SAMPLE_BILL.guests.forEach((guest, i) => addClaims(bill.members[i + 1], guest.claims));

  await bill.save();
  return bill;
}
