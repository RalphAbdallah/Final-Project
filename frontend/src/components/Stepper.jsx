import { AnimatePresence, motion } from 'motion/react';
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
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={value}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.25 }}
          >
            {value}
          </motion.span>
        </AnimatePresence>
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
