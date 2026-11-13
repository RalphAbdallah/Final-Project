import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PasswordInput from '../../components/PasswordInput.jsx';
import { authErrorMessage, useAuth } from '../../auth/AuthContext.jsx';
import './auth.css';

const MIN_PASSWORD = 8;

/**
 * Log in and sign up share one screen: dark top with the title, form on the white sheet.
 * `stay`: shown in place of a locked page (RequireAuth); after logging in, that page appears.
 */
export default function AuthPage({ mode, stay = false }) {
  const isSignup = mode === 'signup';
  const { token, login, signup } = useAuth();
  const navigate = useNavigate();
  // One state object for every field (Session 15, controlled forms).
  const [fields, setFields] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Already logged in and on /login or /signup: go home. (Not while submitting:
  // handleSubmit decides where to go after a successful sign up or log in.)
  useEffect(() => {
    if (token && !stay && !busy) navigate('/', { replace: true });
  }, [token, stay, busy, navigate]);

  function handleChange(event) {
    const { name, value } = event.target;
    setFields({ ...fields, [name]: value });
    if (error) setError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const name = fields.name.trim();
    const email = fields.email.trim();
    if (isSignup && !name) return setError('Type your name, so guests know who paid.');
    if (!email) return setError('Type your email address.');
    if (fields.password.length < (isSignup ? MIN_PASSWORD : 1)) {
      return setError(isSignup ? `Choose a password of at least ${MIN_PASSWORD} characters.` : 'Type your password.');
    }

    setBusy(true);
    try {
      if (isSignup) await signup(name, email, fields.password);
      else await login(email, fields.password);
    } catch (err) {
      setBusy(false);
      return setError(authErrorMessage(err));
    }
    // New payers set up how they get paid first. Shown in place of a page: that page appears by itself.
    if (isSignup) navigate('/get-paid', { replace: true });
    else if (!stay) navigate('/', { replace: true });
  }

  return (
    <div className="screen auth">
      <header className="top on-night">
        <div className="top__bar">
          <Link to="/" className="wordmark" aria-label="splIT home">
            spl<span>IT</span>
          </Link>
        </div>
        <div className="auth__heading">
          <h1 className="auth__title">{isSignup ? 'Sign up' : 'Log in'}</h1>
        </div>
      </header>

      <main className="surface on-day">
        <form className="auth-form" onSubmit={handleSubmit} noValidate aria-describedby={error ? 'auth-error' : undefined}>
          {isSignup && (
            <div className="field">
              <label htmlFor="auth-name" className="field__label">
                Your name
              </label>
              <input
                id="auth-name"
                name="name"
                className="field-input"
                value={fields.name}
                onChange={handleChange}
                autoComplete="name"
                autoCapitalize="words"
                maxLength={60}
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="auth-email" className="field__label">
              Email
            </label>
            <input
              id="auth-email"
              name="email"
              className="field-input"
              type="email"
              inputMode="email"
              value={fields.email}
              onChange={handleChange}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>
          <div className="field">
            <label htmlFor="auth-password" className="field__label">
              Password
            </label>
            <PasswordInput
              id="auth-password"
              name="password"
              value={fields.password}
              onChange={handleChange}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
            />
          </div>

          {error && (
            <p id="auth-error" className="form-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="pill pill--primary pill--block" disabled={busy}>
            {busy ? (isSignup ? 'Creating your account…' : 'Logging in…') : isSignup ? 'Create account' : 'Log in'}
          </button>
        </form>

        <p className="auth__switch">
          {isSignup ? 'Already have an account? ' : 'New to splIT? '}
          <Link to={isSignup ? '/login' : '/signup'}>{isSignup ? 'Log in' : 'Create an account'}</Link>
        </p>
      </main>
    </div>
  );
}
