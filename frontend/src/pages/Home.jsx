import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, cachedProfile } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';
import './Home.css';

/** Landing for visitors; the payer's start screen once logged in (dashboard comes in Phase 7). */
export default function Home() {
  const { session } = useAuth();
  if (session === undefined) return <main className="state on-night" aria-busy="true" aria-label="Loading" />;
  return session ? <PayerHome /> : <Landing />;
}

function Landing() {
  return (
    <main className="landing on-night">
      <div className="landing__inner">
        <p className="wordmark landing__logo">
          spl<span>IT</span>
        </p>
        <h1 className="landing__title">
          <span>Split your receipt.</span>
          <span>Get your money back.</span>
          <span>Hassle free, in real time.</span>
        </h1>
        <p className="landing__text">
          Share the QR code with your friends, let them choose their share of the receipt, and they pay you back with
          Whish Money, OMT, Neo Bank Audi, Suyool or cash.
        </p>
      </div>
      <div className="landing__actions">
          <Link className="pill pill--primary pill--block" to="/login">
            Log in
          </Link>
          <Link className="pill pill--night pill--block" to="/signup">
            Create an account
          </Link>
      </div>
    </main>
  );
}

function PayerHome() {
  const navigate = useNavigate();
  const cameraId = useId();
  const cameraInput = useRef(null);
  // Start from the remembered profile (instant when coming back), then refresh it.
  const [profile, setProfile] = useState(cachedProfile);
  const [failed, setFailed] = useState(false);
  const [opening, setOpening] = useState(false);

  // Closing the camera without a photo opens the new-bill screen anyway, where
  // "Choose from photos" picks existing ones. (`cancel` doesn't bubble, so React's
  // props can't catch it: listen on the input itself. Re-attached once the
  // profile has loaded and the button exists.)
  useEffect(() => {
    const input = cameraInput.current;
    if (!input) return undefined;
    const onCancel = () => navigate('/bills/new');
    input.addEventListener('cancel', onCancel);
    return () => input.removeEventListener('cancel', onCancel);
  }, [navigate, profile]);

  useEffect(() => {
    let active = true;
    api
      .profile()
      .then((p) => active && setProfile(p))
      // Keep showing the remembered profile if the refresh fails.
      .catch(() => active && !cachedProfile() && setFailed(true));
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
        {/* Opens the camera right away; the photo is handed to the new-bill screen.
            Closing the camera instead also goes there (see the cancel listener above). */}
        <label className="pill pill--primary pill--block" htmlFor={cameraId}>
          New bill
          <input
            ref={cameraInput}
            id={cameraId}
            type="file"
            accept="image/*"
            capture="environment"
            className="visually-hidden"
            onChange={(event) => {
              const photos = [...(event.target.files ?? [])];
              event.target.value = '';
              if (photos.length) navigate('/bills/new', { state: { photos } });
            }}
          />
        </label>
        <Link className="pill pill--night pill--block" to="/get-paid">
          {wallets.length ? 'Edit payment methods' : 'Set up payment methods'}
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
