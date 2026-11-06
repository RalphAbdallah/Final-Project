import LoadingScreen from '../components/Loading.jsx';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { api, cachedProfile } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';
import { formatDate } from '../lib/dates.js';
import { formatMoney } from '../lib/money.js';
import './Home.css';

/** What's still owed across bills, per currency: "$45.20", or "$45.20 · LBP 1,200,000". */
function owedText(bills) {
  const owed = {};
  for (const b of bills) owed[b.currency] = (owed[b.currency] ?? 0) + b.outstanding;
  const parts = Object.entries(owed)
    .filter(([, minor]) => minor > 0)
    .map(([currency, minor]) => formatMoney(minor, currency));
  return parts.length ? parts.join(' · ') : 'Nothing';
}

/** Landing for visitors; the payer's dashboard once logged in (PRD M10). */
export default function Home() {
  const { session } = useAuth();
  if (session === undefined) return <LoadingScreen />;
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

  // Fetch the bill screen's code now, so opening a bill doesn't wait for it.
  useEffect(() => {
    import('./payer/BillScreen.jsx');
  }, []);

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

  if (failed) {
    return (
      <main className="state on-night">
        <h1 className="state__title">Couldn't load your account</h1>
        <p className="state__text">Check your connection, then try again.</p>
        <div className="state__actions">
          <button type="button" className="pill pill--primary pill--block" onClick={() => window.location.reload()}>
            Try again
          </button>
          {/* A way out, so nobody is stuck here: back to the start, logged out. */}
          <button type="button" className="pill pill--night pill--block" onClick={() => supabase.auth.signOut()}>
            Log out
          </button>
        </div>
      </main>
    );
  }
  if (!profile) return <LoadingScreen />;

  return (
    <main className="home on-night">
      <div className="home__bar">
        <p className="wordmark">
          spl<span>IT</span>
        </p>
        <Link className="pill pill--night pill--icon" to="/profile" aria-label="Profile">
          <Icon name="person" />
        </Link>
      </div>
      <div className="home__body">
        <h1 className="home__title">Hi {profile.name.trim().split(/\s+/)[0]}.</h1>
      </div>
      {profile.bills.length > 0 && (
        <section className="home__bills" aria-labelledby="your-bills">
          {/* Across every bill (PRD M10), per currency: USD and LBP don't add up */}
          <div className="home__owed">
            <p className="home__owed-label">Still owed to you</p>
            <p className="home__owed-amount num">{owedText(profile.bills)}</p>
          </div>
          <h2 id="your-bills" className="home__bills-title">
            Your bills
          </h2>
          <ul>
            {profile.bills.map((bill) => (
              <li key={bill.id}>
                <Link className="home__bill" to={`/bills/${bill.id}`}>
                  <span className="home__bill-main">
                    <span className="home__bill-venue">{bill.venue}</span>
                    <span className="home__bill-date">
                      {formatDate(bill.date)} · {bill.guests === 1 ? '1 guest' : `${bill.guests} guests`}
                    </span>
                  </span>
                  <span className="home__bill-side">
                    <span className="home__bill-total num">{formatMoney(bill.total, bill.currency)}</span>
                    <span className={`home__bill-owed num${bill.outstanding > 0 ? ' is-owed' : ''}`}>
                      {bill.outstanding > 0
                        ? `${formatMoney(bill.outstanding, bill.currency)} owed`
                        : bill.guests > 0
                          ? 'All paid'
                          : 'Nobody yet'}
                    </span>
                  </span>
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
        {/* Payment methods live in Profile (Payment methods → Edit), not here (team choice). */}
      </div>
    </main>
  );
}
