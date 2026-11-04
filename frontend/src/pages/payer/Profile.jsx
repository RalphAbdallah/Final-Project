import { useEffect, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import Sheet from '../../components/Sheet.jsx';
import { useToast } from '../../components/Toast.jsx';
import WalletLogo from '../../components/WalletLogo.jsx';
import { api, cachedProfile } from '../../lib/api.js';
import { hueFor, initials } from '../../lib/people.js';
import { supabase } from '../../lib/supabase.js';
import { walletName } from '../../lib/wallets.js';
import '../guest/guest.css';
import '../payer/newbill.css';
import './profile.css';

/** Supabase Auth's messages, in the app's words. */
function authMessage(error) {
  const text = error?.message ?? '';
  if (/same/i.test(text)) return "That's already your password. Pick a new one.";
  if (/weak|at least|characters/i.test(text)) return 'Use a password of at least 8 characters.';
  if (/registered|already/i.test(text)) return 'Another account already uses that email.';
  if (/invalid/i.test(text) && /email/i.test(text)) return "That email doesn't look right.";
  if (/reauth|recent/i.test(text)) return 'For your security, log out and back in, then try again.';
  return "Couldn't save that. Try again.";
}

/** The payer's account: who they are, how they get paid, their login, and leaving. */
export default function Profile() {
  const navigate = useNavigate();
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

  async function logOut() {
    setLeaving(true);
    // Leave this page first: it requires a login, so signing out here would send it to
    // the login screen instead of the landing page.
    navigate('/', { replace: true });
    await supabase.auth.signOut();
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
  if (!profile) return <main className="state on-night" aria-busy="true" aria-label="Loading" />;

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
        <button type="button" className="pill pill--day pill--block profile__logout" onClick={logOut} disabled={leaving}>
          {leaving ? 'Logging out…' : 'Log out'}
        </button>
      </div>
      {toast}

      <NameSheet
        open={editing === 'name'}
        current={profile.name}
        onClose={close}
        onSaved={(next) => {
          setProfile(next);
          close();
          showToast('Name saved.');
        }}
      />
      <EmailSheet
        open={editing === 'email'}
        current={profile.email}
        onClose={close}
        onSaved={(email) => {
          close();
          showToast(`Check ${email} for a link to confirm the change.`);
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
      <DeleteAccountSheet
        open={editing === 'delete'}
        onClose={close}
        onDeleted={async () => {
          navigate('/', { replace: true });
          await supabase.auth.signOut();
        }}
      />
    </div>
  );
}

/** One field in a sheet, saved by `save(value)`, which returns an error message or null. */
function FieldSheet({ open, title, description, label, type = 'text', initial = '', saveLabel, save, onClose, autoComplete }) {
  const id = useId();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValue(initial);
      setError(null);
      setBusy(false);
    }
  }

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

function NameSheet({ open, current, onClose, onSaved }) {
  return (
    <FieldSheet
      open={open}
      title="Your name"
      description="Guests see it on your bills."
      label="Name"
      initial={current}
      saveLabel="Save"
      autoComplete="name"
      onClose={onClose}
      save={async (value) => {
        const name = value.trim().replace(/\s+/g, ' ');
        if (name.length > 60) return 'Use a name of up to 60 characters.';
        try {
          onSaved(await api.rename(name));
          return null;
        } catch (err) {
          return err.code === 'offline' ? "You're offline. Try again." : "Couldn't save your name. Try again.";
        }
      }}
    />
  );
}

function EmailSheet({ open, current, onClose, onSaved }) {
  return (
    <FieldSheet
      open={open}
      title="Your email"
      description="We'll send a link to the new address. It changes once you open it."
      label="New email"
      type="email"
      initial=""
      saveLabel="Send the link"
      autoComplete="email"
      onClose={onClose}
      save={async (value) => {
        const email = value.trim();
        if (email.toLowerCase() === current.toLowerCase()) return "That's already your email.";
        const { error } = await supabase.auth.updateUser({ email });
        if (error) return authMessage(error);
        onSaved(email);
        return null;
      }}
    />
  );
}

function PasswordSheet({ open, onClose, onSaved }) {
  return (
    <FieldSheet
      open={open}
      title="New password"
      description="At least 8 characters."
      label="New password"
      type="password"
      saveLabel="Change password"
      autoComplete="new-password"
      onClose={onClose}
      save={async (password) => {
        if (password.length < 8) return 'Use a password of at least 8 characters.';
        const { error } = await supabase.auth.updateUser({ password });
        if (error) return authMessage(error);
        onSaved();
        return null;
      }}
    />
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
      await onDeleted();
    } catch (err) {
      setBusy(false);
      setError(err.code === 'offline' ? "You're offline. Try again." : "Couldn't delete your account. Try again.");
    }
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
