/* Amounts arrive as integers in minor units: cents for USD, whole pounds for LBP. */
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const grouped = new Intl.NumberFormat('en-US');

export function formatMoney(minor, currency = 'USD') {
  return currency === 'USD' ? usd.format(minor / 100) : `LBP ${grouped.format(minor)}`;
}

/** Pieces for the big amount display: "$", "17", ".40". */
export function amountParts(minor, currency = 'USD') {
  if (currency === 'USD') {
    return {
      symbol: '$',
      whole: grouped.format(Math.floor(minor / 100)),
      fraction: `.${String(minor % 100).padStart(2, '0')}`,
    };
  }
  return { symbol: 'LBP', whole: grouped.format(minor), fraction: '' };
}

/** Plain number for pasting into a wallet app's amount field: "17.40". */
export function plainAmount(minor, currency = 'USD') {
  return currency === 'USD' ? (minor / 100).toFixed(2) : String(minor);
}

/** Parses what a guest types ("3", "3.5", "2,000") into minor units, or null. */
export function parseMoney(text, currency = 'USD') {
  const clean = String(text).replace(/[\s,$]/g, '');
  if (currency === 'USD') {
    const match = /^(\d{1,7})(?:\.(\d{0,2}))?$/.exec(clean);
    if (!match) return null;
    return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  }
  return /^\d{1,10}$/.test(clean) ? Number(clean) : null;
}

/**
 * What a share's extras are made of, for "Items $10 + tax (11%) and service $2.10":
 * "tax (11%) and service", "tax (11%)", "service", or null when there are none.
 * Tax counts only when it's added (not already in the prices); a $0 charge is left out.
 */
export function extrasLabel({ tax, taxRate, taxIncluded, service }) {
  const parts = [];
  if (tax > 0 && !taxIncluded) parts.push(taxRate ? `tax (${taxRate}%)` : 'tax');
  if (service > 0) parts.push('service');
  return parts.length ? parts.join(' and ') : null;
}

/** Totals to round a share up to: the next whole unit, then the next two round steps. $17.40 → $18, $20, $25. */
export function roundUpTargets(minor, currency = 'USD') {
  const [unit, step] = currency === 'USD' ? [100, 500] : [10_000, 50_000];
  const first = (Math.floor(minor / unit) + 1) * unit;
  const second = (Math.floor(first / step) + 1) * step;
  return [first, second, second + step];
}
