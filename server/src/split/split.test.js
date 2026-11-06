import { describe, expect, it } from 'vitest';
import { allocate, computeSplit } from './index.js';

const member = (id, tip = 0) => ({ id, tip });
const claim = (itemId, memberId, units = 1) => ({ itemId, memberId, units });

function conserved(result) {
  const members = Object.values(result.members).reduce((acc, m) => acc + m.total, 0);
  return members + result.unclaimed.total === result.totals.bill;
}

describe('allocate', () => {
  it('floors, then gives leftovers to the largest remainders', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(10, [3, 7])).toEqual([3, 7]);
  });

  it('breaks ties by position', () => {
    expect(allocate(2, [1, 1, 1])).toEqual([1, 1, 0]);
  });

  it('returns zeros when there is nothing to share', () => {
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
    expect(allocate(50, [0, 0])).toEqual([0, 0]);
  });
});

describe('computeSplit', () => {
  it('matches the PRD §8 worked example', () => {
    const result = computeSplit({
      items: [
        { id: 'pizza', price: 2000, quantity: 1 },
        { id: 'burger', price: 1200, quantity: 1 },
        { id: 'lemonade', price: 400, quantity: 1 },
      ],
      members: [member('A'), member('B'), member('C')],
      claims: [claim('pizza', 'A'), claim('pizza', 'B'), claim('pizza', 'C'), claim('burger', 'A')],
      service: 360,
    });

    expect(result.members.A.total).toBe(2054);
    expect(result.members.B.total).toBe(734);
    expect(result.members.C.total).toBe(732);
    expect(result.unclaimed.total).toBe(440);
    expect(result.totals.bill).toBe(3960);
    expect(result.items.pizza.shares).toEqual({ A: 667, B: 667, C: 666 });
  });

  it('charges the unit price while fewer units are claimed than exist', () => {
    const items = [{ id: 'pizza', price: 1000, quantity: 5 }];
    const members = [member('ralph'), member('charbel')];
    const result = computeSplit({ items, members, claims: [claim('pizza', 'ralph', 1), claim('pizza', 'charbel', 2)] });

    expect(result.members.ralph.items).toBe(1000);
    expect(result.members.charbel.items).toBe(2000);
    expect(result.unclaimed.items).toBe(2000);
  });

  it('splits by units claimed when more are claimed than exist (PRD units example)', () => {
    const items = [{ id: 'pizza', price: 1000, quantity: 5 }];
    const members = ['ralph', 'charbel', 'a', 'b', 'c', 'd'].map((id) => member(id));
    const claims = [
      claim('pizza', 'ralph', 1),
      claim('pizza', 'charbel', 2),
      ...['a', 'b', 'c', 'd'].map((id) => claim('pizza', id, 1)),
    ];
    const result = computeSplit({ items, members, claims });

    expect(result.members.ralph.items).toBe(715);
    expect(result.members.charbel.items).toBe(1429);
    for (const id of ['a', 'b', 'c', 'd']) expect(result.members[id].items).toBe(714);
    expect(result.unclaimed.items).toBe(0);
  });

  it('re-splits a shared item when someone unclaims (M6)', () => {
    const items = [{ id: 'platter', price: 3000, quantity: 1 }];
    const members = [member('a'), member('b'), member('c')];
    const three = computeSplit({ items, members, claims: ['a', 'b', 'c'].map((id) => claim('platter', id)) });
    const two = computeSplit({ items, members, claims: ['a', 'b'].map((id) => claim('platter', id)) });

    expect([three.members.a.total, three.members.b.total, three.members.c.total]).toEqual([1000, 1000, 1000]);
    expect([two.members.a.total, two.members.b.total, two.members.c.total]).toEqual([1500, 1500, 0]);
  });

  it('spreads tax and service by item subtotal (M7)', () => {
    const result = computeSplit({
      items: [
        { id: 'mine', price: 2500, quantity: 1 },
        { id: 'rest', price: 7500, quantity: 1 },
      ],
      members: [member('me'), member('you')],
      claims: [claim('mine', 'me'), claim('rest', 'you')],
      tax: 1100,
      service: 900,
    });

    expect(result.members.me.total).toBe(3000);
    expect(result.members.you.total).toBe(9000);
  });

  it('never adds tax that is already included in the prices (Q15)', () => {
    const result = computeSplit({
      items: [{ id: 'meal', price: 10000, quantity: 1 }],
      members: [member('me')],
      claims: [claim('meal', 'me')],
      tax: 1100,
      taxIncluded: true,
      service: 1000,
    });

    expect(result.totals.tax).toBe(0);
    expect(result.members.me.total).toBe(11000);
    expect(result.totals.bill).toBe(11000);
  });

  it('keeps tips out of the split and adds them to the card total (M11)', () => {
    const result = computeSplit({
      items: [{ id: 'meal', price: 1700, quantity: 2 }],
      members: [member('ralph', 300), member('jason', 0)],
      claims: [claim('meal', 'ralph'), claim('meal', 'jason')],
    });

    expect(result.members.ralph).toMatchObject({ total: 1700, tip: 300, due: 2000 });
    expect(result.members.jason).toMatchObject({ total: 1700, tip: 0, due: 1700 });
    expect(result.totals).toMatchObject({ bill: 3400, tips: 300, card: 3700 });
  });

  it('leaves everything unclaimed when nobody has claimed', () => {
    const result = computeSplit({
      items: [{ id: 'meal', price: 5000, quantity: 1 }],
      members: [member('a')],
      claims: [],
      tax: 550,
    });

    expect(result.members.a.total).toBe(0);
    expect(result.unclaimed.total).toBe(5550);
  });

  it('puts extras in the unclaimed bucket when every item is free', () => {
    const result = computeSplit({
      items: [{ id: 'water', price: 0, quantity: 2 }],
      members: [member('a')],
      claims: [claim('water', 'a', 2)],
      service: 300,
    });

    expect(result.members.a.total).toBe(0);
    expect(result.unclaimed.extras).toBe(300);
    expect(conserved(result)).toBe(true);
  });

  it('stays exact with large LBP amounts', () => {
    const result = computeSplit({
      items: [{ id: 'mezze', price: 2_350_000, quantity: 3 }],
      members: [member('a'), member('b'), member('c'), member('d')],
      claims: ['a', 'b', 'c', 'd'].map((id) => claim('mezze', id)),
      tax: 775_500,
      service: 705_000,
    });

    expect(result.totals.bill).toBe(2_350_000 * 3 + 775_500 + 705_000);
    expect(conserved(result)).toBe(true);
  });

  it('always adds up to the bill total (conservation)', () => {
    let seed = 42;
    const random = (max) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % max;
    };

    for (let run = 0; run < 500; run += 1) {
      const members = Array.from({ length: 1 + random(8) }, (_, i) => member(`m${i}`, random(3) * 100));
      const items = Array.from({ length: 1 + random(10) }, (_, i) => ({
        id: `i${i}`,
        price: random(5000),
        quantity: 1 + random(6),
      }));
      const claims = [];
      for (const item of items) {
        for (const m of members) if (random(3) === 0) claims.push(claim(item.id, m.id, 1 + random(item.quantity)));
      }
      const result = computeSplit({ items, members, claims, tax: random(2000), service: random(1500), taxIncluded: random(4) === 0 });

      expect(conserved(result)).toBe(true);
      const tips = members.reduce((acc, m) => acc + m.tip, 0);
      expect(result.totals.card).toBe(result.totals.bill + tips);
    }
  });
});
