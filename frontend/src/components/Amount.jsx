import { useLayoutEffect, useRef } from 'react';
import { amountParts, formatMoney } from '../lib/money.js';

/** Big money display with small cents, like a wallet balance: "$ 17 .40". */
export default function Amount({ minor, currency, className = '' }) {
  const ref = useRef(null);
  const { symbol, whole, fraction } = amountParts(minor, currency);

  // LBP amounts run long ("LBP 107,249,893"): when one is wider than its box, shrink
  // the type just enough to fit. Runs before paint, so it never shows overflowing.
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!box) return undefined;
    const fit = () => {
      el.style.fontSize = '';
      const style = getComputedStyle(box);
      const room = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const width = el.offsetWidth;
      if (room > 0 && width > room) {
        el.style.fontSize = `${Math.floor((parseFloat(getComputedStyle(el).fontSize) * room) / width)}px`;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [minor, currency]);

  return (
    <span ref={ref} className={`amount ${className}`}>
      <span className="visually-hidden">{formatMoney(minor, currency)}</span>
      <span className={`amount__symbol${symbol.length > 1 ? ' amount__symbol--word' : ''}`} aria-hidden="true">
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
