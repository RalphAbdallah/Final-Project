/**
 * Sets a member's units on an item, or removes their claim. Shared by guests and the
 * payer (PRD M6: one person per unit). `state` is a fresh `repo.getBillState` read; on
 * success the answer is that read with the change applied, instead of a second read.
 * Returns `{ state }`, or `{ status, error }` to send back.
 */
export async function applyClaim(repo, state, itemId, memberId, { units, remove = false }) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item) return { status: 404, error: 'item_not_found' };
  if (!remove && (!Number.isInteger(units) || units < 1 || units > item.quantity)) {
    return { status: 400, error: 'invalid_units' };
  }

  // At most what nobody else has claimed. setClaim checks again under a lock, for two
  // phones taking the last one at the same moment.
  const othersUnits = state.claims
    .filter((c) => c.itemId === item.id && c.memberId !== memberId)
    .reduce((acc, c) => acc + c.units, 0);
  if (!remove && units > item.quantity - othersUnits) return { status: 409, error: 'not_enough_left' };

  if (remove) await repo.removeClaim(item.id, memberId);
  else if (!(await repo.setClaim(item.id, memberId, units))) return { status: 409, error: 'not_enough_left' };

  const claims = state.claims.filter((c) => !(c.itemId === item.id && c.memberId === memberId));
  if (!remove) claims.push({ itemId: item.id, memberId, units });
  return { state: { ...state, claims } };
}
