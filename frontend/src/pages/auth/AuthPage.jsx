import { useId, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { StackLink, useStackNavigate } from '../../lib/stack.jsx';
import PasswordInput from '../../components/PasswordInput.jsx';
import { authErrorMessage, useAuth } from '../../lib/auth.jsx';
import { supabase } from '../../lib/supabase.js';
import './auth.css';

const MIN_PASSWORD = 8;

/** Log in and sign up share one screen: dark top with the title, form on the white sheet. */
export default function AuthPage({ mode }) {
  const isSignup = mode === 'signup';
  const { session } = useAuth();
  const navigate = useStackNavigate();
  const location = useLocation();
  const [fields, setFields] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [checkInbox, setCheckInbox] = useState(false);
  const ids = { name: useId(), email: useId(), password: useId(), error: useId() };

  if (session) return <Navigate to={isSignup ? '/get-paid' : (location.state?.from ?? '/')} replace />;

  const set = (key) => (event) => {
    setFields((f) => ({ ...f, [key]: event.target.value }));
    if (error) setError(null);
  };

  async function submit(event) {
    event.preventDefault();
    const name = fields.name.trim();
    const email = fields.email.trim();
    if (isSignup && !name) return setError('Type your name, so guests know who paid.');
    if (!email) return setError('Type your email address.');
    if (fields.password.length < (isSignup ? MIN_PASSWORD : 1)) {
      return setError(isSignup ? `Choose a password of at least ${MIN_PASSWORD} characters.` : 'Type your password.');
    }

    setBusy(true);
    const result = isSignup
      ? await supabase.auth.signUp({
          email,
          password: fields.password,
          options: { data: { name }, emailRedirectTo: `${window.location.origin}/get-paid` },
        })
      : await supabase.auth.signInWithPassword({ email, password: fields.password });
    setBusy(false);

    if (result.error) return setError(authErrorMessage(result.error));
    if (isSignup && !result.data.session) return setCheckInbox(true);
    navigate(isSignup ? '/get-paid' : (location.state?.from ?? '/'), { replace: true });
  }

  if (checkInbox) {
    return (
      <main className="state on-night">
        <h1 className="state__title">Check your inbox</h1>
        <p className="state__text">
          We sent a link to <strong>{fields.email.trim()}</strong>. Open it on this device to finish creating your
          account.
        </p>
        <StackLink back className="pill pill--night" to="/login">
          Back to log in
        </StackLink>
      </main>
    );
  }

  return (
    <div className="screen auth">
      <header className="top on-night">
        <div className="top__bar">
          <StackLink back to="/" className="wordmark" aria-label="splIT home">
            spl<span>IT</span>
          </StackLink>
        </div>
        <div className="auth__heading">
          <h1 className="auth__title">{isSignup ? 'Sign up' : 'Log in'}</h1>
        </div>
      </header>

      <main className="surface on-day">
        <form className="auth-form" onSubmit={submit} noValidate aria-describedby={error ? ids.error : undefined}>
          {isSignup && (
            <div className="field">
              <label htmlFor={ids.name} className="field__label">
                Your name
              </label>
              <input
                id={ids.name}
                className="field-input"
                value={fields.name}
                onChange={set('name')}
                autoComplete="name"
                autoCapitalize="words"
                maxLength={60}
              />
            </div>
          )}
          <div className="field">
            <label htmlFor={ids.email} className="field__label">
              Email
            </label>
            <input
              id={ids.email}
              className="field-input"
              type="email"
              inputMode="email"
              value={fields.email}
              onChange={set('email')}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>
          <div className="field">
            <label htmlFor={ids.password} className="field__label">
              Password
            </label>
            <PasswordInput
              id={ids.password}
              value={fields.password}
              onChange={set('password')}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
            />
          </div>

          {error && (
            <p id={ids.error} className="form-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="pill pill--primary pill--block" disabled={busy}>
            {busy ? (isSignup ? 'Creating your account…' : 'Logging in…') : isSignup ? 'Create account' : 'Log in'}
          </button>
        </form>

        <p className="auth__switch">
          {isSignup ? 'Already have an account? ' : 'New to splIT? '}
          <Link to={isSignup ? '/login' : '/signup'} state={location.state}>
            {isSignup ? 'Log in' : 'Create an account'}
          </Link>
        </p>
      </main>
    </div>
  );
}
