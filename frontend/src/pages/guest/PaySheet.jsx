import { useEffect, useRef, useState } from 'react';
import Amount from '../../components/Amount.jsx';
import Icon from '../../components/Icon.jsx';
import Sheet from '../../components/Sheet.jsx';
import WalletLogo from '../../components/WalletLogo.jsx';
import { formatMoney, plainAmount } from '../../lib/money.js';
import { walletName } from '../../lib/wallets.js';

/**
 * Pay the payer (PRD M8). A wallet opens the payer's own link from their QR
 * code; no link can carry the amount, so it is shown large and copied.
 */
export default function PaySheet({ open, onClose, me, payerName, currency, busy, onChooseMethod, onMarkPaid, onEditTip }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  const money = (minor) => formatMoney(minor, currency);
  const methods = [...me.payouts.map((p) => p.wallet), 'cash'];
  const selected = methods.includes(me.method) ? me.method : null;
  const payout = me.payouts.find((p) => p.wallet === selected);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copyAmount() {
    try {
      await navigator.clipboard.writeText(plainAmount(me.due, currency));
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Pay ${payerName}`}
      footer={
        <button
          type="button"
          className="pill pill--primary pill--block"
          disabled={!selected || busy}
          onClick={onMarkPaid}
        >
          {busy ? 'Saving…' : selected ? 'Mark as paid' : 'Choose how you paid'}
        </button>
      }
    >
      <div className="pay-amount">
        <Amount minor={me.due} currency={currency} className="pay-amount__value" />
        <button type="button" className="pill pill--day pill--small" onClick={copyAmount}>
          <Icon name={copied ? 'check' : 'copy'} size={16} />
          {copied ? 'Copied' : 'Copy amount'}
        </button>
      </div>
      <p className="pay-breakdown num">
        Items {money(me.items)} · tax and service {money(me.extras)} · tip {money(me.tip)}
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
              onChange={() => onChooseMethod(id)}
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
          <p className="method-panel__hint">
            {walletName(payout.wallet)} opens on paying {payerName}. The amount is copied: paste{' '}
            <strong className="num">{money(me.due)}</strong>, send, then come back and tap Mark as paid.
          </p>
        </div>
      )}
      {selected === 'cash' && (
        <div className="method-panel">
          <p className="method-panel__hint">
            Hand {payerName} <strong className="num">{money(me.due)}</strong> in cash, then tap Mark as paid.
          </p>
        </div>
      )}
    </Sheet>
  );
}
