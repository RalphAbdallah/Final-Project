import LoadingScreen from '../../components/Loading.jsx';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import Sheet from '../../components/Sheet.jsx';
import PasswordInput from '../../components/PasswordInput.jsx';
import { useToast } from '../../components/Toast.jsx';
import WalletLogo from '../../components/WalletLogo.jsx';
import { api, cachedProfile } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { hueFor, initials } from '../../utils/people.js';
import { walletName } from '../../utils/wallets.js';
import '../guest/guest.css';
import '../payer/newbill.css';
import './profile.css';

const offlineOr = (err, message) => (err.code === 'offline' ? "You're offline. Try again." : message);

/** The payer's account: who they are, how they get paid, their login, and leaving. */
export default function Profile() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [profile, setProfile] = useState(cachedProfile);
  const [failed, setFailed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toast, showToast] = useToast();

  useEffect(() => {
    let active = true;
    api
      .profile()
      .then((p) => active && setProfile(p))
      .catch(() => active && !cachedProfile() && setFailed(true));
    return () => {
      active = false;
    };
  }, []);

  // Leave this page first: it needs a login, so logging out here would show the
  // log-in form instead of the landing page.
  function leave() {
    navigate('/', { replace: true });
    logout();
  }

  if (failed) {
    return (
      <main className="state on-night">
        <h1 className="state__title">Couldn't load your account</h1>
        <p className="state__text">Check your connection, then try again.</p>
        <Link className="pill pill--night" to="/">
          Go home
        </Link>
      </main>
    );
  }
  if (!profile) return <LoadingScreen />;

  const wallets = profile.payouts.map((p) => p.wallet);
  const close = () => setEditing(null);

  return (
    <div className="screen profile">
      <header className="top on-night">
        <div className="top__bar">
          <Link to="/" className="pill pill--night pill--icon" aria-label="Home">
            <Icon name="chevronLeft" />
          </Link>
          <p className="wordmark">
            spl<span>IT</span>
          </p>
          <span className="profile__spacer" />
        </div>
        <div className="profile__who">
          <span className="venue__avatar profile__avatar" style={{ '--hue': hueFor(profile.email) }} aria-hidden="true">
            {initials(profile.name)}
          </span>
          <h1 className="profile__name">{profile.name}</h1>
          <p className="profile__email">{profile.email}</p>
        </div>
      </header>

      <main className="surface on-day profile__surface">
        <section aria-labelledby="methods-title">
          <div className="surface__head">
            <h2 id="methods-title" className="surface__title">
              Payment methods
            </h2>
            <Link className="text-button profile__edit" to="/get-paid">
              Edit
            </Link>
          </div>
          <ul className="profile__list">
            {[...wallets, 'cash'].map((id) => (
              <li key={id} className="profile__row">
                <WalletLogo wallet={id} size={36} />
                <span className="profile__row-label">{walletName(id)}</span>
              </li>
            ))}
          </ul>
          {wallets.length === 0 && <p className="profile__hint">Guests can only pay you in cash until you add a wallet.</p>}
        </section>

        <section className="profile__section" aria-labelledby="account-title">
          <div className="surface__head">
            <h2 id="account-title" className="surface__title">
              Account
            </h2>
          </div>
          <ul className="profile__list">
            {[
              ['name', 'Name', profile.name],
              ['email', 'Email', profile.email],
              ['password', 'Password', '••••••••'],
            ].map(([key, label, value]) => (
              <li key={key}>
                <button type="button" className="profile__row profile__row--button" onClick={() => setEditing(key)}>
                  <span className="profile__row-label">{label}</span>
                  <span className="profile__row-value">{value}</span>
                  <Icon name="chevronRight" size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <button type="button" className="pill pill--day pill--block danger-text profile__delete" onClick={() => setEditing('delete')}>
          Delete account
        </button>
      </main>

      <div className="dock on-day">
        <button
          type="button"
          className="pill pill--day pill--block profile__logout"
          onClick={() => {
            setLeaving(true);
            leave();
          }}
          disabled={leaving}
        >
          {leaving ? 'Logging out…' : 'Log out'}
        </button>
      </div>
      {toast}

      <FieldSheet
        id="profile-name"
        open={editing === 'name'}
        title="Your name"
        description="Guests see it on your bills."
        label="Name"
        initial={profile.name}
        saveLabel="Save"
        autoComplete="name"
        onClose={close}
        save={async (value) => {
          const name = value.split(' ').filter((word) => word !== '').join(' ');
          if (name.length > 60) return 'Use a name of up to 60 characters.';
          try {
            setProfile(await api.rename(name));
          } catch (err) {
            return offlineOr(err, "Couldn't save your name. Try again.");
          }
          close();
          showToast('Name saved.');
          return null;
        }}
      />
      <FieldSheet
        id="profile-email"
        open={editing === 'email'}
        title="Your email"
        description="You'll use it to log in."
        label="New email"
        type="email"
        initial=""
        saveLabel="Save"
        autoComplete="email"
        onClose={close}
        save={async (value) => {
          const email = value.trim();
          if (email.toLowerCase() === profile.email) return "That's already your email.";
          try {
            setProfile(await api.changeEmail(email));
          } catch (err) {
            if (err.code === 'email_taken') return 'Another account already uses that email.';
            if (err.code === 'invalid_email') return "That email doesn't look right.";
            return offlineOr(err, "Couldn't save that. Try again.");
          }
          close();
          showToast('Email saved.');
          return null;
        }}
      />
      <PasswordSheet
        open={editing === 'password'}
        onClose={close}
        onSaved={() => {
          close();
          showToast('Password changed.');
        }}
      />
      <DeleteAccountSheet open={editing === 'delete'} onClose={close} onDeleted={leave} />
    </div>
  );
}

/** One field in a sheet, saved by `save(value)`, which returns an error message or null. */
function FieldSheet({ id, open, title, description, label, type = 'text', initial = '', saveLabel, save, onClose, autoComplete }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Each time the sheet opens, start from the current value.
  useEffect(() => {
    if (!open) return;
    setValue(initial);
    setError(null);
    setBusy(false);
  }, [open, initial]);

  async function submit() {
    setBusy(true);
    const message = await save(value);
    setBusy(false);
    setError(message);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <button type="button" className="pill pill--primary pill--block" onClick={submit} disabled={busy || !value.trim()}>
          {busy ? 'Saving…' : saveLabel}
        </button>
      }
    >
      <div className="field">
        <label htmlFor={id} className="field__label">
          {label}
        </label>
        <input
          id={id}
          className="field-input"
          type={type}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
        />
      </div>
      {error && (
        <p className="form-error profile__error" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}

/** Current password, then the new one. The server checks the current one first; if it's wrong, nothing changes. */
function PasswordSheet({ open, onClose, onSaved }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState(null); // { field: 'current' | 'next' | null, message }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCurrent('');
    setNext('');
    setError(null);
    setBusy(false);
  }, [open]);

  async function submit() {
    if (next.length < 8) return setError({ field: 'next', message: 'New password must be at least 8 characters.' });
    if (next === current) return setError({ field: 'next', message: "That's already your password. Pick a new one." });
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(current, next);
    } catch (err) {
      setBusy(false);
      if (err.code === 'wrong_password') return setError({ field: 'current', message: 'Incorrect password.' });
      return setError({ field: null, message: "Couldn't change your password. Check your connection and try again." });
    }
    onSaved();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Change password"
      footer={
        <button type="button" className="pill pill--primary pill--block" onClick={submit} disabled={busy || !current || !next}>
          {busy ? 'Checking…' : 'Change password'}
        </button>
      }
    >
      <div className="profile__fields">
        <div className="field">
          <label htmlFor="password-current" className="field__label">
            Current password
          </label>
          <PasswordInput
            id="password-current"
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              setError(null);
            }}
            aria-invalid={error?.field === 'current'}
            autoComplete="current-password"
          />
        </div>
        <div className="field">
          <label htmlFor="password-next" className="field__label">
            New password
          </label>
          <PasswordInput
            id="password-next"
            value={next}
            onChange={(e) => {
              setNext(e.target.value);
              setError(null);
            }}
            aria-invalid={error?.field === 'next'}
            autoComplete="new-password"
            placeholder="At least 8 characters"
          />
        </div>
      </div>
      {error && (
        <p className="form-error profile__error" role="alert">
          {error.message}
        </p>
      )}
    </Sheet>
  );
}

/** Can't be undone: asked once more, like deleting a bill. */
function DeleteAccountSheet({ open, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount();
    } catch (err) {
      setBusy(false);
      return setError(offlineOr(err, "Couldn't delete your account. Try again."));
    }
    onDeleted();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Delete your account?"
      description="All your bills go too, with everyone's claims and payments, and their links stop working. This can't be undone."
      footer={
        <>
          <button type="button" className="pill pill--danger pill--block" onClick={remove} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete my account'}
          </button>
          <button type="button" className="pill pill--day pill--block" onClick={onClose} disabled={busy}>
            Keep my account
          </button>
        </>
      }
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}
