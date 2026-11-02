/**
 * A sample bill a payer can open to see the guest flow before the bill editor
 * exists (PLAN Phase 2). Amounts in cents. Claims are [item index, units].
 */
export const SAMPLE_BILL = {
  venue: 'Mar Mikhael Diner (sample)',
  currency: 'USD',
  tax: 1056,
  taxRate: 11,
  taxIncluded: false,
  service: 960,
  items: [
    { name: 'Pizza Margherita', price: 1000, quantity: 5 },
    { name: 'Fattoush', price: 750, quantity: 2 },
    { name: 'Fries', price: 400, quantity: 3 },
    { name: 'Fresh lemonade', price: 350, quantity: 4 },
    { name: 'Hummus', price: 500, quantity: 1 },
  ],
  payerClaims: [
    [0, 1],
    [1, 1],
  ],
  guests: [
    { name: 'Charbel', claims: [[0, 2], [2, 1], [3, 1]] },
    { name: 'Jason', claims: [[0, 1], [2, 1], [3, 1], [4, 1]] },
  ],
};
