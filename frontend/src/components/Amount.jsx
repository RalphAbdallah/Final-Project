import { amountParts, formatMoney } from '../lib/money.js';

/** Big money display with small cents, like a wallet balance: "$ 17 .40". */
export default function Amount({ minor, currency, className = '' }) {
  const { symbol, whole, fraction } = amountParts(minor, currency);
  return (
    <span className={`amount ${className}`}>
      <span className="visually-hidden">{formatMoney(minor, currency)}</span>
      <span className="amount__symbol" aria-hidden="true">
        {symbol}
      </span>
      <span className="amount__whole" aria-hidden="true">
        {whole}
      </span>
      {fraction && (
        <span className="amount__fraction" aria-hidden="true">
          {fraction}
        </span>
      )}
    </span>
  );
}
