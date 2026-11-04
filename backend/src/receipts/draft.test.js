import { describe, expect, it } from 'vitest';
import { buildDraft, draftTotal, splitLine } from './draft.js';

const TODAY = '2026-11-03';
const base = {
  is_receipt: true,
  venue: null,
  date: null,
  currency: 'USD',
  lines: [],
  subtotal: null,
  tax_amount: null,
  tax_rate: null,
  tax_included: false,
  service_amount: null,
  service_rate: null,
  total: null,
  lbp_rate: null,
};
const line = (quantity, name, amount, unit_price = null) => ({ quantity, name, amount, unit_price });

describe('splitLine', () => {
  it('keeps one line when it divides evenly', () => {
    expect(splitLine('Pepsi', 2, 750)).toEqual([{ name: 'Pepsi', quantity: 2, price: 375 }]);
  });

  it('splits an uneven line so it still adds up exactly', () => {
    const parts = splitLine('Shots', 3, 1000);
    expect(parts).toEqual([
      { name: 'Shots', quantity: 2, price: 333 },
      { name: 'Shots', quantity: 1, price: 334 },
    ]);
    expect(parts.reduce((acc, p) => acc + p.price * p.quantity, 0)).toBe(1000);
  });
});

describe('buildDraft with the receipts in Receipts/', () => {
  it('receipt 1, The Bistro: "2 x SOFT DRINK @ $2.99", tax 8%', () => {
    const draft = buildDraft(
      {
        ...base,
        venue: 'The Bistro',
        date: '2026-03-18',
        lines: [
          line(1, 'Burger Deluxe', 14.99),
          line(1, 'Caesar Salad', 9.99),
          line(2, 'Soft Drink', 5.98, 2.99),
          line(1, 'Cheesecake', 7.99),
        ],
        subtotal: 38.95,
        tax_amount: 3.12,
        tax_rate: 8,
        total: 42.07,
      },
      TODAY,
    );
    expect(draft.items[2]).toEqual({ name: 'Soft Drink', quantity: 2, price: 299 });
    expect(draft).toMatchObject({ venue: 'The Bistro', date: '2026-03-18', tax: 312, taxRate: 8, service: 0 });
    expect(draftTotal(draft)).toBe(draft.printedTotal);
  });

  // This receipt is inconsistent on paper: its lines add up to $59.50 but it
  // prints a $47.50 subtotal. The app must keep the lines and flag the mismatch.
  it('receipt 2, Dinefine: "2X CAESAR SALAD $24.00" is a line total, and the mismatch shows', () => {
    const draft = buildDraft(
      {
        ...base,
        venue: 'Dinefine Restaurant',
        date: '2025-09-30',
        lines: [
          line(2, 'Caesar Salad', 24.0),
          line(1, 'Grilled Salmon', 22.0),
          line(1, 'Cheesecake', 7.5),
          line(2, 'Sparkling Water', 6.0),
        ],
        subtotal: 47.5,
        tax_amount: 3.8,
        total: 51.3,
      },
      TODAY,
    );
    expect(draft.items[0]).toEqual({ name: 'Caesar Salad', quantity: 2, price: 1200 });
    expect(draft.items[3]).toEqual({ name: 'Sparkling Water', quantity: 2, price: 300 });
    expect(draft.taxRate).toBeNull();
    expect(draftTotal(draft)).toBe(5950 + 380);
    expect(draft.printedTotal).toBe(5130);
  });

  it('receipt 3, Castle Rooftop: quantity column with line amounts, USD and LBP', () => {
    const draft = buildDraft(
      {
        ...base,
        venue: 'Castle Rooftop',
        date: '2026-07-15',
        lines: [
          line(1, 'Water (big)', 3.5),
          line(2, 'Pepsi Diet', 7.5),
          line(1, '7up', 3.75),
          line(1, 'Perrier', 4.0),
          line(1, 'Combo Plate', 19.0),
          line(1, 'Chicken Avocado Sandwich', 14.5),
          line(2, 'Truffle Burger', 32.0),
          line(1, 'Swiss Bliss Burger', 15.0),
          line(1, 'Shisha Hamod Naanaa', 8.0),
        ],
        total: 107.25,
        lbp_rate: 90000,
      },
      TODAY,
    );
    expect(draft.items.find((i) => i.name === 'Pepsi Diet')).toEqual({ name: 'Pepsi Diet', quantity: 2, price: 375 });
    expect(draft.items.find((i) => i.name === 'Truffle Burger')).toEqual({
      name: 'Truffle Burger',
      quantity: 2,
      price: 1600,
    });
    expect(draft).toMatchObject({ currency: 'USD', tax: 0, lbpRate: 90000 });
    expect(draftTotal(draft)).toBe(10725);
  });
});

describe('buildDraft calculations', () => {
  it('reads amounts as unit prices when only that matches the printed subtotal', () => {
    const draft = buildDraft({ ...base, lines: [line(3, 'Beer', 5), line(1, 'Fries', 4)], subtotal: 19 }, TODAY);
    expect(draft.items).toEqual([
      { name: 'Beer', quantity: 3, price: 500 },
      { name: 'Fries', quantity: 1, price: 400 },
    ]);
  });

  it('works out the tax amount when only the rate is printed', () => {
    const draft = buildDraft({ ...base, lines: [line(1, 'Meal', 50)], tax_rate: 11 }, TODAY);
    expect(draft.tax).toBe(550);
  });

  it('does not add tax that is included in the prices', () => {
    const draft = buildDraft(
      { ...base, lines: [line(1, 'Meal', 50)], tax_amount: 4.95, tax_rate: 11, tax_included: true, total: 50 },
      TODAY,
    );
    expect(draft.taxIncluded).toBe(true);
    expect(draftTotal(draft)).toBe(5000);
  });

  it('handles LBP without decimals', () => {
    const draft = buildDraft(
      { ...base, currency: 'LBP', lines: [line(2, 'Manakish', 400000)], total: 400000 },
      TODAY,
    );
    expect(draft.items).toEqual([{ name: 'Manakish', quantity: 2, price: 200000 }]);
  });

  it('keeps the cents when the AI calls a dollar receipt LBP', () => {
    const draft = buildDraft(
      { ...base, currency: 'LBP', lines: [line(2, 'Pepsi Diet', 7.5), line(1, 'Perrier', 4)], total: 11.5 },
      TODAY,
    );
    expect(draft.currency).toBe('USD');
    expect(draft.items).toEqual([
      { name: 'Pepsi Diet', quantity: 2, price: 375 },
      { name: 'Perrier', quantity: 1, price: 400 },
    ]);
    expect(draft.printedTotal).toBe(1150);
  });

  it('turns all-caps names into normal capitalization, keeps mixed case', () => {
    const draft = buildDraft(
      { ...base, venue: 'DINEFINE RESTAURANT', lines: [line(1, 'CAESAR SALAD', 9), line(1, 'Swiss Bliss Burger', 15), line(1, '7UP', 3)] },
      TODAY,
    );
    expect(draft.venue).toBe('Dinefine Restaurant');
    expect(draft.items.map((i) => i.name)).toEqual(['Caesar Salad', 'Swiss Bliss Burger', '7up']);
  });

  it('falls back to today and drops unreadable lines', () => {
    const draft = buildDraft({ ...base, date: '18/03/2026', lines: [line(1, '', 5), line(1, 'Tea', null)] }, TODAY);
    expect(draft.date).toBe(TODAY);
    expect(draft.items).toEqual([]);
  });
});
