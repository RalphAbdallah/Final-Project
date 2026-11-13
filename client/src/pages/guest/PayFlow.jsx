import { useEffect, useState } from 'react';
import Amount from '../../components/Amount.jsx';
import Icon from '../../components/Icon.jsx';
import Sheet from '../../components/Sheet.jsx';
import WalletLogo from '../../components/WalletLogo.jsx';
import { copyText } from '../../utils/clipboard.js';
import { formatMoney, parseMoney, plainAmount, roundUpTargets } from '../../utils/money.js';
import { walletName } from '../../utils/wallets.js';

/**
 * After Done: the tip (PRD M11), then paying the payer (M8), in one sheet. Going from
 * the tip to paying changes what's inside (a quick fade); the sheet stays up.
 * `step` is 'tip', 'pay' or null (closed).
 */
export default function PayFlow({ step, onClose, me, payerName, currency, cardPaid, onSaveTip, onChooseMethod }) {
  // Keep the last step on screen while the sheet slides away.
  const [shown, setShown] = useState(step);
  useEffect(() => {
    if (step) setShown(step);
  }, [step]);
  const current = step || shown;

  const tip = useTip({ open: step === 'tip', total: me.total, currentTip: me.tip, currency, onSaveTip });

  return (
    <Sheet open={Boolean(step)} onClose={onClose} title={current === 'tip' ? 'Tip' : `Pay ${payerName}`}>
      <div className="pay-flow">
        <div className="pay-flow__inner">
          {/* A new key for each step replays the fade-in (guest.css) */}
          <div key={current} className="pay-flow__step">
            {current === 'tip' && !cardPaid ? (
              <>
                {tip.body}
                <div className="pay-flow__actions">{tip.footer}</div>
              </>
            ) : (
              <PayStep me={me} payerName={payerName} currency={currency} onChooseMethod={onChooseMethod} />
            )}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/** The tip step on its own, for the payer's tip on their bill screen (PRD M11). */
export function TipSheet({ open, onClose, total, currentTip, currency, onSaveTip }) {
  const tip = useTip({ open, total, currentTip, currency, onSaveTip });
  return (
    <Sheet open={open} onClose={onClose} title="Tip">
      <div className="pay-flow__alone">
        {tip.body}
        <div className="pay-flow__actions">{tip.footer}</div>
      </div>
    </Sheet>
  );
}

/**
 * The tip step: the person types how much they want, or taps one of the two smallest
 * round-ups of their share (a $35 share: $36 or $40), which fills the field.
 * A custom hook (Session 20): it returns the step's body and buttons.
 */
function useTip({ open, total, currentTip, currency, onSaveTip }) {
  const quick = roundUpTargets(total, currency).slice(0, 2);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const money = (minor) => formatMoney(minor, currency);

  // Start fresh each time the step opens, keeping a tip they already set.
  useEffect(() => {
    if (open) setText(currentTip > 0 ? plainAmount(currentTip, currency) : '');
  }, [open, currentTip, currency]);

  const tip = text.trim() === '' ? null : parseMoney(text, currency);
  const invalid = text.trim() !== '' && tip === null;
  const canAdd = tip !== null && tip > 0;

  async function save(value) {
    setSaving(true);
    await onSaveTip(value);
    setSaving(false);
  }

  const footer = (
    <>
      <button type="button" className="pill pill--primary pill--block" disabled={!canAdd || saving} onClick={() => save(tip)}>
        Add
      </button>
      <button type="button" className="pill pill--day pill--block" disabled={saving} onClick={() => save(0)}>
        No tip
      </button>
    </>
  );

  const body = (
    <>
      <label htmlFor="tip-amount" className="visually-hidden">
        Tip amount
      </label>
      <div className="money-input">
        <span aria-hidden="true">{currency === 'USD' ? '$' : 'LBP'}</span>
        <input
          id="tip-amount"
          className="num"
          inputMode={currency === 'USD' ? 'decimal' : 'numeric'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tip amount"
          aria-invalid={invalid}
        />
      </div>
      {invalid && <p className="field-error">Enter an amount like {currency === 'USD' ? '3 or 2.50' : '50000'}.</p>}

      {/* The two smallest round-ups of the share; tapping one fills the field */}
      <div className="tip-options tip-quick" role="radiogroup" aria-label="Round your share up">
        {quick.map((target) => (
          <label key={target} className="tip-option">
            <input
              type="radio"
              name="tip"
              className="visually-hidden"
              checked={tip === target - total}
              onChange={() => setText(plainAmount(target - total, currency))}
            />
            <span className="tip-option__total num">{money(target)}</span>
            <span className="tip-option__tip num">+{money(target - total)}</span>
          </label>
        ))}
      </div>
    </>
  );

  return { footer, body };
}

/**
 * The pay step (PRD M8). A wallet opens the payer's own link from their QR code; no
 * link can carry the amount, so it is shown large and copied.
 */
function PayStep({ me, payerName, currency, onChooseMethod }) {
  // When the amount was last copied (a time), or false. "Copied" shows for 2.4 s.
  const [copied, setCopied] = useState(false);
  const money = (minor) => formatMoney(minor, currency);
  // Cash first, and picked until they choose a wallet.
  const methods = ['cash', ...me.payouts.map((p) => p.wallet)];
  const selected = methods.includes(me.method) ? me.method : 'cash';
  const payout = me.payouts.find((p) => p.wallet === selected);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2400);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copyAmount() {
    const ok = await copyText(plainAmount(me.due, currency));
    setCopied(ok ? Date.now() : false);
  }

  return (
    <>
      <div className="pay-amount">
        <Amount minor={me.due} currency={currency} className="pay-amount__value" />
        <button type="button" className="pill pill--day pill--small" onClick={copyAmount}>
          <Icon name={copied ? 'check' : 'copy'} size={16} />
          {copied ? 'Copied' : 'Copy amount'}
        </button>
      </div>

      <fieldset className="methods">
        <legend className="methods__legend">Payment method</legend>
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
    </>
  );
}
