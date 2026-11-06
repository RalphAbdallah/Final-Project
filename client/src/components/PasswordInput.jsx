import { useState } from 'react';
import Icon from './Icon.jsx';

/**
 * A password field with an eye button to show or hide what's typed (sign in, sign up,
 * change password). Takes the same props as an <input>. Hidden again on every visit.
 */
export default function PasswordInput({ className = 'field-input', ...props }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="password-input">
      <input {...props} className={className} type={shown ? 'text' : 'password'} autoCapitalize="none" spellCheck={false} />
      <button
        type="button"
        className="password-input__toggle"
        // Keep the keyboard up and the cursor where it was: don't take focus on tap.
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
      >
        <Icon name={shown ? 'eyeOff' : 'eye'} size={22} />
      </button>
    </div>
  );
}
