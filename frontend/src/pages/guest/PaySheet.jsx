import { useEffect, useRef, useState } from 'react';
import Amount from '../../components/Amount.jsx';
import Icon from '../../components/Icon.jsx';
import Sheet from '../../components/Sheet.jsx';
import WalletLogo from '../../components/WalletLogo.jsx';
import { copyText } from '../../lib/clipboard.js';
import { extrasLabel, formatMoney, plainAmount } from '../../lib/money.js';
import { walletName } from '../../lib/wallets.js';

/**
 * Pay the payer (PRD M8). A wallet opens the payer's own link from their QR
 * code; no link can carry the amount, so it is shown large and copied.
 */
export default function PaySheet({ open, onClose, me, bill, payerName, currency, onChooseMethod, onEditTip }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  const money = (minor) => formatMoney(minor, currency);
  const extras = extrasLabel(bill);
  // Cash first, and picked until they choose a wallet.
  const methods = ['cash', ...me.payouts.map((p) => p.wallet)];
  const selected = methods.includes(me.method) ? me.method : 'cash';
  const payout = me.payouts.find((p) => p.wallet === selected);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copyAmount() {
    const ok = await copyText(plainAmount(me.due, currency));
    setCopied(ok);
    clearTimeout(timer.current);
    if (ok) timer.current = setTimeout(() => setCopied(false), 2400);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Pay ${payerName}`}
    >
      <div className="pay-amount">
        <Amount minor={me.due} currency={currency} className="pay-amount__value" />
        <button type="button" className="pill pill--day pill--small" onClick={copyAmount}>
          <Icon name={copied ? 'check' : 'copy'} size={16} />
          {copied ? 'Copied' : 'Copy amount'}
        </button>
      </div>
      <p className="pay-breakdown num">
        Items {money(me.items)}
        {extras && ` · ${extras} ${money(me.extras)}`} · tip {money(me.tip)}
        {onEditTip && (
          <>
            {' '}
            <button type="button" className="text-button" onClick={onEditTip}>
              Change tip
            </button>
          </>
        )}
      </p>

      <fieldset className="methods">
        <legend className="methods__legend">How are you paying?</legend>
        {methods.map((id) => (
          <label key={id} className={`method${selected === id ? ' is-selected' : ''}`}>
            <input
              type="radio"
              name="method"
              className="visually-hidden"
              checked={selected === id}
              onChange={() => {
                // Picking a wallet copies the amount right away (still inside the tap),
                // ready to paste in the wallet app; the pill shows Copied.
                if (id !== 'cash') copyAmount();
                onChooseMethod(id);
              }}
            />
            <WalletLogo wallet={id} size={36} />
            <span className="method__name">{walletName(id)}</span>
            <span className="method__check" aria-hidden="true">
              <Icon name="check" size={16} />
            </span>
          </label>
        ))}
      </fieldset>

      {payout && (
        <div className="method-panel">
          <a
            className={`pill pill--block wallet-link wallet--${payout.wallet}`}
            href={payout.payUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={copyAmount}
          >
            Open {walletName(payout.wallet)}
            <Icon name="arrowUpRight" size={18} />
          </a>
        </div>
      )}
      {selected === 'cash' && (
        <div className="method-panel">
          <p className="method-panel__hint">
            Hand {payerName} <strong className="num">{money(me.due)}</strong> in cash.
          </p>
        </div>
      )}
    </Sheet>
  );
}
