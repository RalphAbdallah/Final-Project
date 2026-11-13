import { cleanText, isIsoDate } from './text.js';

/**
 * Turns what the AI read off a receipt into a bill draft (PRD M2).
 * The AI only copies printed values; every calculation happens here:
 * minor units, unit prices, uneven splits, and tax or service from a rate.
 */

const missing = (value) => value === null || value === undefined;

// 7.5 dollars -> 750 cents. LBP has no cents: 90000 stays 90000.
function toMinor(value, currency) {
  if (missing(value)) return null;
  return Math.round(Number(value) * (currency === 'USD' ? 100 : 1));
}

// Receipts often print in capitals: "CAESAR SALAD" reads better as "Caesar Salad". Mixed case is kept.
function tidyCase(text) {
  const allCaps = text === text.toUpperCase() && text !== text.toLowerCase();
  if (!allCaps) return text;
  const lower = text.toLowerCase();
  let result = '';
  for (let i = 0; i < lower.length; i += 1) {
    const before = i === 0 ? ' ' : lower[i - 1];
    // A capital after a space or ( / & - , so "COMBO (LARGE)" -> "Combo (Large)"
    result += ' (/&-'.includes(before) ? lower[i].toUpperCase() : lower[i];
  }
  return result;
}

const cleanName = (name) => tidyCase(cleanText(String(missing(name) ? '' : name)).slice(0, 80));

/**
 * Splits a line total into items whose unit prices are whole minor units and
 * still add up exactly: $10.00 for 3 becomes 2 x 3.33 and 1 x 3.34.
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

// Sum of items plus the extras that are added on top.
export function draftTotal({ items, tax, taxIncluded, service }) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return subtotal + (taxIncluded ? 0 : tax) + service;
}

// A rate like 11 (for 11%) if it makes sense, else null.
function percent(value) {
  if (missing(value) || value < 0 || value > 100) return null;
  return Number(value);
}

/**
 * raw: the AI's reading (see RECEIPT_SCHEMA in services/openai.js)
 * todayDate: "YYYY-MM-DD", used when no date is printed
 */
export function buildDraft(raw, todayDate) {
  const rawLines = raw.lines || [];

  // LBP is never printed with cents: amounts like 7.50 mean dollars, whatever the AI said.
  const printed = [raw.subtotal, raw.tax_amount, raw.service_amount, raw.total];
  for (const line of rawLines) printed.push(line.amount, line.unit_price);
  const hasCents = printed.some((value) => !missing(value) && !Number.isInteger(Number(value)));
  const currency = raw.currency === 'LBP' && !hasCents ? 'LBP' : 'USD';
  const minor = (value) => toMinor(value, currency);

  const lines = rawLines
    .map((line) => ({
      name: cleanName(line.name),
      quantity: Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= 999 ? line.quantity : 1,
      amount: minor(line.amount),
      unitPrice: minor(line.unit_price),
    }))
    .filter((line) => line.name !== '' && !(missing(line.amount) && missing(line.unitPrice)));

  const tax = minor(raw.tax_amount);
  const service = minor(raw.service_amount);
  const printedSubtotal = minor(raw.subtotal);
  const printedTotal = minor(raw.total);

  // A printed amount is usually the line total, but some receipts print the unit price.
  // Pick the reading that matches the printed subtotal (or the total minus the extras).
  const asLineTotals = lines.map((l) => (!missing(l.unitPrice) && missing(l.amount) ? l.unitPrice * l.quantity : l.amount));
  const asUnitPrices = lines.map((l) => (missing(l.unitPrice) ? l.amount : l.unitPrice) * l.quantity);
  const sum = (values) => values.reduce((total, v) => total + v, 0);

  let target = printedSubtotal;
  if (missing(target) && !missing(printedTotal)) {
    const addedTax = raw.tax_included || missing(tax) ? 0 : tax;
    target = printedTotal - addedTax - (missing(service) ? 0 : service);
  }
  const useUnitPrices = !missing(target) && sum(asLineTotals) !== target && sum(asUnitPrices) === target;
  const lineTotals = useUnitPrices ? asUnitPrices : asLineTotals;

  const items = [];
  lines.forEach((line, i) => items.push(...splitLine(line.name, line.quantity, Math.max(0, lineTotals[i]))));
  const subtotal = sum(items.map((item) => item.price * item.quantity));

  const taxRate = percent(raw.tax_rate);
  const serviceRate = percent(raw.service_rate);
  let draftTax = tax;
  if (missing(draftTax)) draftTax = taxRate === null ? 0 : Math.round((subtotal * taxRate) / 100);
  let draftService = service;
  if (missing(draftService)) draftService = serviceRate === null ? 0 : Math.round((subtotal * serviceRate) / 100);

  return {
    venue: cleanName(raw.venue) || 'Receipt',
    date: isIsoDate(raw.date) ? raw.date : todayDate,
    currency,
    items,
    tax: draftTax,
    taxRate,
    taxIncluded: Boolean(raw.tax_included),
    service: draftService,
    lbpRate: !missing(raw.lbp_rate) && raw.lbp_rate > 0 ? Number(raw.lbp_rate) : null,
    printedTotal,
  };
}
