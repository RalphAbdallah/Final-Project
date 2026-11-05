import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Amount from '../../components/Amount.jsx';
import Icon from '../../components/Icon.jsx';
import Sheet from '../../components/Sheet.jsx';
import WalletLogo from '../../components/WalletLogo.jsx';
import { copyText } from '../../lib/clipboard.js';
import { formatMoney, parseMoney, plainAmount, roundUpTargets } from '../../lib/money.js';
import { walletName } from '../../lib/wallets.js';

// Quick out, slightly slower in: the step change reads as instant.
const FADE_IN = { duration: 0.16, ease: [0.22, 1, 0.36, 1] };
const FADE_OUT = { duration: 0.07, ease: 'easeOut' };
const GROW = { duration: 0.34, ease: [0.16, 1, 0.3, 1] };

/**
 * After Done: the tip (PRD M11), then paying the payer (M8), in one sheet. Going from
 * the tip to paying changes what's inside; the sheet stays up. `step` is 'tip', 'pay'
 * or null (closed).
 */
export default function PayFlow({ step, onClose, me, payerName, currency, cardPaid, onSaveTip, onChooseMethod }) {
  // Keep the last step on screen while the sheet slides away.
  const [shown, setShown] = useState(step);
  if (step && step !== shown) setShown(step);
  const current = step ?? shown;

  const tip = useTip({ open: step === 'tip', total: me.total, currentTip: me.tip, currency, onSaveTip });

  return (
    <Sheet open={Boolean(step)} onClose={onClose} title={current === 'tip' ? 'Tip' : `Pay ${payerName}`}>
      <AutoHeight>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={current} initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: FADE_IN }}
            exit={{ opacity: 0, transition: FADE_OUT }}
          >
            {current === 'tip' && !cardPaid ? (
              <>
                {tip.body}
                <div className="pay-flow__actions">{tip.footer}</div>
              </>
            ) : (
              <PayStep me={me} payerName={payerName} currency={currency} onChooseMethod={onChooseMethod} />
            )}
          </motion.div>
        </AnimatePresence>
      </AutoHeight>
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
 * Grows or shrinks with its content (ease-out, no bounce), so the sheet's top edge
 * glides when the tip makes way for the taller pay step instead of jumping.
 */
function AutoHeight({ children }) {
  const inner = useRef(null);
  const [height, setHeight] = useState('auto');
  const reduce = useReducedMotion();

  useLayoutEffect(() => {
    const el = inner.current;
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div className="pay-flow" initial={false} animate={{ height }} transition={reduce ? { duration: 0 } : GROW}>
      <div ref={inner} className="pay-flow__inner">
        {children}
      </div>
    </motion.div>
  );
}

/**
 * The tip step: the person types how much they want, or taps one of the two smallest
 * round-ups of their share (a $35 share: $36 or $40), which fills the field.
 */
function useTip({ open, total, currentTip, currency, onSaveTip }) {
  const quick = useMemo(() => roundUpTargets(total, currency).slice(0, 2), [total, currency]);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const fieldId = useId();
  const money = (minor) => formatMoney(minor, currency);

  // Start fresh each time the step opens, keeping a tip they already set.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setText(currentTip > 0 ? plainAmount(currentTip, currency) : '');
  }

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
      <label htmlFor={fieldId} className="visually-hidden">
        Tip amount
      </label>
      <div className="money-input">
        <span aria-hidden="true">{currency === 'USD' ? '$' : 'LBP'}</span>
        <input
          id={fieldId}
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
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  const money = (minor) => formatMoney(minor, currency);
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
