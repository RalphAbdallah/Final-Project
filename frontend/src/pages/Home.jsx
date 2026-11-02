import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';
import { listWallets } from '../lib/wallets.js';
import './Home.css';

/** Landing for visitors; the payer's start screen once logged in (dashboard comes in Phase 7). */
export default function Home() {
  const { session } = useAuth();
  if (session === undefined) return <main className="state on-night" aria-busy="true" aria-label="Loading" />;
  return session ? <PayerHome /> : <Landing />;
}

function Landing() {
  return (
    <main className="home on-night">
      <p className="wordmark">
        spl<span>IT</span>
      </p>
      <div className="home__body">
        <h1 className="home__title">Split the receipt at the table. Get paid back in your wallet app.</h1>
        <p className="home__text">
          Your friends scan a code, tap what they had, and pay you with Whish, OMT, Neo, Suyool or cash. No accounts for
          them.
        </p>
      </div>
      <div className="home__actions">
        <Link className="pill pill--primary pill--block" to="/signup">
          Create an account
        </Link>
        <Link className="pill pill--night pill--block" to="/login">
          Log in
        </Link>
      </div>
    </main>
  );
}

function PayerHome() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [failed, setFailed] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .profile()
      .then((p) => active && setProfile(p))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);

  async function openSample() {
    const latest = profile.bills[0];
    if (latest) return navigate(`/b/${latest.shareToken}`);
    setOpening(true);
    try {
      const { shareToken } = await api.createSampleBill();
      navigate(`/b/${shareToken}`);
    } catch {
      setOpening(false);
      setFailed(true);
    }
  }

  async function logOut() {
    await supabase.auth.signOut();
    navigate('/', { replace: true });
  }

  if (failed) {
    return (
      <main className="state on-night">
        <h1 className="state__title">Couldn't load your account</h1>
        <p className="state__text">Check your connection, then try again.</p>
        <button type="button" className="pill pill--night" onClick={() => window.location.reload()}>
          Try again
        </button>
      </main>
    );
  }
  if (!profile) return <main className="state on-night" aria-busy="true" aria-label="Loading" />;

  const wallets = profile.payouts.map((p) => p.wallet);

  return (
    <main className="home on-night">
      <div className="home__bar">
        <p className="wordmark">
          spl<span>IT</span>
        </p>
        <button type="button" className="pill pill--night pill--small" onClick={logOut}>
          Log out
        </button>
      </div>
      <div className="home__body">
        <h1 className="home__title">Hi {profile.name}.</h1>
        <p className="home__text">
          {wallets.length
            ? `Guests can pay you with ${listWallets(wallets)}.`
            : 'Set up how your friends pay you back: Whish, OMT, Neo, Suyool or cash.'}
        </p>
      </div>
      {profile.bills.length > 0 && (
        <section className="home__bills" aria-labelledby="recent-bills">
          <h2 id="recent-bills" className="home__bills-title">
            Recent bills
          </h2>
          <ul>
            {profile.bills.slice(0, 3).map((bill) => (
              <li key={bill.id}>
                <Link className="home__bill" to={`/bills/${bill.id}/share`}>
                  <span>{bill.venue}</span>
                  <span className="home__bill-date">{bill.date}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="home__actions">
        <Link className="pill pill--primary pill--block" to="/bills/new">
          New bill
        </Link>
        <Link className="pill pill--night pill--block" to="/get-paid">
          {wallets.length ? 'Edit how you get paid' : 'Set up how you get paid'}
        </Link>
        {profile.bills.length === 0 && (
          <button type="button" className="pill pill--night pill--block" onClick={openSample} disabled={opening}>
            {opening ? 'Creating a sample bill…' : 'Try a sample bill'}
          </button>
        )}
      </div>
    </main>
  );
}
