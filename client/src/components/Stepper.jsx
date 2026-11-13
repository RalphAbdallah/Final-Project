import Icon from './Icon.jsx';

/**
 * − count +. With `min` 0 (claiming), minus at 1 unclaims; with `min` 1
 * (a quantity), minus stops at 1.
 */
export default function Stepper({ value, min = 0, max, label, onChange, disabled = false }) {
  const unclaims = min === 0 && value === 1;
  return (
    <div className="stepper" role="group" aria-label={`${label}: ${value}`}>
      <button
        type="button"
        className="stepper__button"
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= min}
        aria-label={unclaims ? `Unclaim ${label}` : `One less ${label}`}
      >
        <Icon name="minus" size={18} />
      </button>
      <span className="stepper__count num" aria-live="polite">
        {/* A new key for each number replays the little pop animation (components.css) */}
        <span key={value} className="stepper__value">
          {value}
        </span>
      </span>
      <button
        type="button"
        className="stepper__button"
        onClick={() => onChange(value + 1)}
        disabled={disabled || value >= max}
        aria-label={`One more ${label}`}
      >
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}
