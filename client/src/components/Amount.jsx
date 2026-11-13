import { amountParts, formatMoney } from '../utils/money.js';

/**
 * Big money display with small cents, like a wallet balance: "$ 17 .40".
 * Long LBP amounts ("LBP 107,249,893") get smaller so they fit the screen's width:
 * --chars tells the CSS how many characters there are (components.css, .amount__fit).
 */
export default function Amount({ minor, currency, className = '' }) {
  const { symbol, whole, fraction } = amountParts(minor, currency);
  const chars = symbol.length + whole.length + fraction.length;

  return (
    <span className={`amount ${className}`} style={{ '--chars': chars }}>
      <span className="visually-hidden">{formatMoney(minor, currency)}</span>
      <span className="amount__fit" aria-hidden="true">
        <span className={`amount__symbol${symbol.length > 1 ? ' amount__symbol--word' : ''}`}>{symbol}</span>
        <span className="amount__whole">{whole}</span>
        {fraction && <span className="amount__fraction">{fraction}</span>}
      </span>
    </span>
  );
}
