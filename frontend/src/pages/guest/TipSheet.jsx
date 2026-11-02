import { useId, useMemo, useState } from 'react';
import Sheet from '../../components/Sheet.jsx';
import { formatMoney, parseMoney, plainAmount, roundUpTargets } from '../../lib/money.js';

/** "Add a tip?" after Done (PRD M11). Tips are kept apart from the split. */
export default function TipSheet({ open, onClose, total, currentTip, currency, payerName, onSubmit }) {
  const targets = useMemo(() => roundUpTargets(total, currency), [total, currency]);
  const [choice, setChoice] = useState(null);
  const [other, setOther] = useState('');
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const otherId = useId();
  const money = (minor) => formatMoney(minor, currency);

  // Start fresh each time the sheet opens, keeping a tip they already set.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setChoice(currentTip > 0 ? 'other' : null);
      setOther(currentTip > 0 ? plainAmount(currentTip, currency) : '');
    }
  }

  const tip = choice === 'other' ? parseMoney(other, currency) : choice !== null ? choice - total : null;
  const canAdd = tip !== null && tip > 0;

  async function submit(value) {
    setSaving(true);
    await onSubmit(value);
    setSaving(false);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a tip?"
      description={`Your share is ${money(total)}. Tips go on ${payerName}'s card for the staff.`}
      footer={
        <>
          <button
            type="button"
            className="pill pill--primary pill--block"
            disabled={!canAdd || saving}
            onClick={() => submit(tip)}
          >
            {canAdd ? `Add ${money(tip)} tip` : 'Add tip'}
          </button>
          <button type="button" className="pill pill--day pill--block" disabled={saving} onClick={() => submit(0)}>
            No tip
          </button>
        </>
      }
    >
      <fieldset className="tip-options">
        <legend className="tip-options__legend">Round your share up to</legend>
        {targets.map((target) => (
          <label key={target} className="tip-option">
            <input
              type="radio"
              name="tip"
              className="visually-hidden"
              checked={choice === target}
              onChange={() => setChoice(target)}
            />
            <span className="tip-option__total num">{money(target)}</span>
            <span className="tip-option__tip num">+{money(target - total)}</span>
          </label>
        ))}
        <label className="tip-option">
          <input
            type="radio"
            name="tip"
            className="visually-hidden"
            checked={choice === 'other'}
            onChange={() => setChoice('other')}
          />
          <span className="tip-option__total">Other</span>
          <span className="tip-option__tip">Type a tip</span>
        </label>
      </fieldset>

      {choice === 'other' && (
        <div className="tip-other">
          <label htmlFor={otherId} className="tip-other__label">
            Tip amount
          </label>
          <div className="money-input">
            <span aria-hidden="true">{currency === 'USD' ? '$' : 'LBP'}</span>
            <input
              id={otherId}
              className="num"
              inputMode={currency === 'USD' ? 'decimal' : 'numeric'}
              value={other}
              onChange={(e) => setOther(e.target.value)}
              placeholder={currency === 'USD' ? '3.00' : '50,000'}
              autoFocus
              aria-invalid={other !== '' && tip === null}
            />
          </div>
          {other !== '' && tip === null && (
            <p className="field-error">Enter an amount like {currency === 'USD' ? '3 or 2.50' : '50000'}.</p>
          )}
        </div>
      )}
    </Sheet>
  );
}
