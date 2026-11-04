/**
 * Turns what the AI read off a receipt into a bill draft (PRD M2).
 * The AI only copies printed values; every calculation happens here:
 * minor units, unit prices, uneven splits, tax from a rate, and the total check.
 */

const toMinor = (value, currency) => (value == null ? null : Math.round(Number(value) * (currency === 'USD' ? 100 : 1)));
const isIsoDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
/** Receipts often print in capitals: "CAESAR SALAD" reads better as "Caesar Salad". Mixed case is kept. */
function tidyCase(text) {
  if (!/\p{Lu}/u.test(text) || /\p{Ll}/u.test(text)) return text;
  return text.toLowerCase().replace(/(^|[\s(/&-])(\p{L})/gu, (_, before, letter) => before + letter.toUpperCase());
}

const cleanName = (name) => tidyCase(String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80));

/**
 * Splits a line total into items whose unit prices are whole minor units and
 * still add up exactly: $10.00 for 3 becomes 2 × 3.33 and 1 × 3.34.
 */
export function splitLine(name, quantity, lineTotal) {
  const base = Math.floor(lineTotal / quantity);
  const extra = lineTotal - base * quantity;
  if (extra === 0) return [{ name, quantity, price: base }];
  return [
    { name, quantity: quantity - extra, price: base },
    { name, quantity: extra, price: base + 1 },
  ];
}

/** Sum of items plus the extras that are added on top. */
export function draftTotal({ items, tax, taxIncluded, service }) {
  const subtotal = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
  return subtotal + (taxIncluded ? 0 : tax) + service;
}

/**
 * @param {object} raw  the AI's reading (see receipts/openai.js for the schema)
 * @param {string} today  YYYY-MM-DD, used when no date is printed
 */
export function buildDraft(raw, today) {
  // LBP is never printed with cents: amounts like 7.50 mean dollars, whatever the
  // AI said (read as pounds they would round to 8).
  const printed = [raw.subtotal, raw.tax_amount, raw.service_amount, raw.total];
  for (const line of raw.lines ?? []) printed.push(line.amount, line.unit_price);
  const hasCents = printed.some((value) => value != null && !Number.isInteger(Number(value)));
  const currency = raw.currency === 'LBP' && !hasCents ? 'LBP' : 'USD';
  const minor = (value) => toMinor(value, currency);

  const lines = (raw.lines ?? [])
    .map((line) => ({
      name: cleanName(line.name),
      quantity: Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= 999 ? line.quantity : 1,
      amount: minor(line.amount),
      unitPrice: minor(line.unit_price),
    }))
    .filter((line) => line.name && (line.amount != null || line.unitPrice != null));

  const tax = minor(raw.tax_amount);
  const service = minor(raw.service_amount);
  const printedSubtotal = minor(raw.subtotal);
  const printedTotal = minor(raw.total);

  // A printed amount is usually the line total, but some receipts print the unit
  // price. Pick the reading that matches the printed subtotal (or total minus extras).
  const asLineTotals = lines.map((l) => (l.unitPrice != null && l.amount == null ? l.unitPrice * l.quantity : l.amount));
  const asUnitPrices = lines.map((l) => (l.unitPrice != null ? l.unitPrice : l.amount) * l.quantity);
  const sum = (values) => values.reduce((acc, v) => acc + v, 0);
  const target =
    printedSubtotal ??
    (printedTotal != null ? printedTotal - (raw.tax_included ? 0 : (tax ?? 0)) - (service ?? 0) : null);
  const useUnitPrices = target != null && sum(asLineTotals) !== target && sum(asUnitPrices) === target;
  const lineTotals = useUnitPrices ? asUnitPrices : asLineTotals;

  const items = lines.flatMap((line, i) => splitLine(line.name, line.quantity, Math.max(0, lineTotals[i])));
  const subtotal = sum(items.map((item) => item.price * item.quantity));

  const taxRate = raw.tax_rate != null && raw.tax_rate >= 0 && raw.tax_rate <= 100 ? Number(raw.tax_rate) : null;
  const serviceRate = raw.service_rate != null && raw.service_rate >= 0 && raw.service_rate <= 100 ? Number(raw.service_rate) : null;
  const draft = {
    venue: cleanName(raw.venue) || 'Receipt',
    date: isIsoDate(raw.date) ? raw.date : today,
    currency,
    items,
    tax: tax ?? (taxRate != null ? Math.round((subtotal * taxRate) / 100) : 0),
    taxRate,
    taxIncluded: Boolean(raw.tax_included),
    service: service ?? (serviceRate != null ? Math.round((subtotal * serviceRate) / 100) : 0),
    lbpRate: raw.lbp_rate != null && raw.lbp_rate > 0 ? Number(raw.lbp_rate) : null,
    printedTotal,
  };
  return draft;
}
