import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import WalletStack from '../../components/WalletStack.jsx';
import { api } from '../../lib/api.js';
import { readQrFromFile } from '../../lib/qr.js';
import { displayLink, WALLET_ORDER, WALLETS } from '../../lib/wallets.js';
import './getpaid.css';

/** Get-paid setup (PRD M1): pick wallets, then upload each wallet's receive-money QR code. */
export default function GetPaid() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [failed, setFailed] = useState(false);
  const [step, setStep] = useState('choose');
  const [picked, setPicked] = useState([]);
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Ignore a response that lands after this effect was cleaned up, so a slow
    // first load can't reset choices the payer already made.
    let active = true;
    api
      .profile()
      .then((p) => {
        if (!active) return;
        setProfile(p);
        setPicked(p.payouts.map((x) => x.wallet));
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);

  if (failed) {
    return (
      <main className="state on-night">
        <h1 className="state__title">Couldn't load your profile</h1>
        <p className="state__text">Check your connection, then try again.</p>
        <button type="button" className="pill pill--night" onClick={() => window.location.reload()}>
          Try again
        </button>
      </main>
    );
  }
  if (!profile) return <main className="state on-night" aria-busy="true" aria-label="Loading" />;

  const saved = new Map(profile.payouts.map((p) => [p.wallet, p.payUrl]));
  const savedIds = WALLET_ORDER.filter((id) => saved.has(id));
  const current = picked[index];

  function toggle(id) {
    setPicked((list) => WALLET_ORDER.filter((w) => (w === id ? !list.includes(id) : list.includes(w))));
  }

  async function continueFromChoose() {
    setSaving(true);
    try {
      let next = profile;
      for (const id of savedIds.filter((w) => !picked.includes(w))) next = await api.removePayout(id);
      setProfile(next);
      setIndex(0);
      setStep(picked.length > 0 ? 'add' : 'done');
    } catch {
      // Stay on this step; the dock hint explains.
    } finally {
      setSaving(false);
    }
  }

  function next() {
    if (index + 1 < picked.length) setIndex(index + 1);
    else setStep('done');
  }

  function back() {
    if (step === 'add' && index > 0) setIndex(index - 1);
    else setStep('choose');
  }

  /** Opens the payer's latest bill as a guest sees it, creating a sample bill if they have none yet. */
  async function openGuestView() {
    setSaving(true);
    try {
      const shareToken = profile.bills[0]?.shareToken ?? (await api.createSampleBill()).shareToken;
      navigate(`/b/${shareToken}`);
    } catch {
      setSaving(false);
    }
  }

  function skip() {
    setPicked((list) => list.filter((w) => w !== current));
    if (index + 1 >= picked.length) setStep('done');
  }

  const headings = {
    choose: {
      title: 'How do you receive money?',
      lede: 'Pick every wallet your friends can pay you with. Cash always works.',
    },
    add: current && {
      title: `Add your ${WALLETS[current].name} QR code`,
      lede: `${index + 1} of ${picked.length}. Guests tap it to open ${WALLETS[current].app} on paying you.`,
    },
    done: {
      title: savedIds.length ? "You're ready to get paid" : 'Guests will pay you in cash',
      lede: savedIds.length
        ? 'Guests see these options when they pay you.'
        : 'Add a wallet any time, so friends can pay you from their phone.',
    },
  };
  const heading = (step === 'add' && !current ? headings.done : headings[step]) ?? headings.choose;

  return (
    <div className="screen getpaid">
      <header className="top on-night">
        <div className="top__bar">
          <button
            type="button"
            className="pill pill--night pill--icon"
            onClick={() => (step === 'choose' ? navigate('/') : back())}
            aria-label={step === 'choose' ? 'Back to start' : 'Back'}
          >
            <Icon name="chevronLeft" />
          </button>
          <p className="wordmark">
            spl<span>IT</span>
          </p>
          <span className="getpaid__spacer" />
        </div>
        <div className="getpaid__heading">
          <h1 className="getpaid__title">{heading.title}</h1>
          <p className="getpaid__lede">{heading.lede}</p>
        </div>
        <WalletStack wallets={savedIds} />
      </header>

      <main className="surface on-day">
        {step === 'choose' && (
          <fieldset className="wallet-picks">
            <legend className="visually-hidden">Wallets you receive money on</legend>
            {WALLET_ORDER.map((id) => (
              <label key={id} className="wallet-pick">
                <input type="checkbox" className="visually-hidden" checked={picked.includes(id)} onChange={() => toggle(id)} />
                <span className={`wallet-pick__swatch wallet--${id}`} aria-hidden="true">
                  {WALLETS[id].name[0]}
                </span>
                <span className="wallet-pick__text">
                  <span className="wallet-pick__name">{WALLETS[id].name}</span>
                  <span className="wallet-pick__meta">{saved.has(id) ? 'QR code added' : WALLETS[id].app}</span>
                </span>
                <span className="wallet-pick__check" aria-hidden="true">
                  <Icon name="check" size={16} />
                </span>
              </label>
            ))}
            <p className="cash-note">
              <Icon name="cash" size={18} />
              Cash is always an option for your guests.
            </p>
          </fieldset>
        )}

        {step === 'add' && current && (
          <>
            <ol className="steps">
              {WALLETS[current].steps.map((text, i) => (
                <li key={text} className="steps__item">
                  <span className="steps__n num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
            <QrUpload key={current} wallet={current} savedUrl={saved.get(current)} onSaved={setProfile} />
          </>
        )}

        {step === 'done' && (
          <ul className="wallet-list">
            {savedIds.map((id) => (
              <li key={id} className="wallet-row">
                <span className={`wallet-pick__swatch wallet--${id}`} aria-hidden="true">
                  {WALLETS[id].name[0]}
                </span>
                <span className="wallet-row__text">
                  <span className="wallet-pick__name">{WALLETS[id].name}</span>
                  <span className="wallet-row__link">{displayLink(saved.get(id))}</span>
                </span>
                <button
                  type="button"
                  className="pill pill--day pill--small"
                  onClick={() => {
                    setPicked(savedIds);
                    setIndex(savedIds.indexOf(id));
                    setStep('add');
                  }}
                  aria-label={`Change ${WALLETS[id].name} QR code`}
                >
                  Change
                </button>
              </li>
            ))}
            <li className="wallet-row">
              <span className="wallet-pick__swatch wallet--cash" aria-hidden="true">
                <Icon name="cash" size={18} />
              </span>
              <span className="wallet-row__text">
                <span className="wallet-pick__name">Cash</span>
                <span className="wallet-row__link">Always available</span>
              </span>
            </li>
          </ul>
        )}
      </main>

      <div className="dock on-day">
        {step === 'choose' && (
          <button type="button" className="pill pill--primary pill--block" onClick={continueFromChoose} disabled={saving}>
            {picked.length === 0
              ? 'Continue with cash only'
              : `Continue with ${picked.length} wallet${picked.length > 1 ? 's' : ''}`}
          </button>
        )}
        {step === 'add' && current && (
          <>
            <button
              type="button"
              className="pill pill--primary pill--block"
              onClick={next}
              disabled={!saved.has(current)}
            >
              {index + 1 < picked.length ? `Next: ${WALLETS[picked[index + 1]].name}` : 'Finish'}
            </button>
            {!saved.has(current) && (
              <p className="dock__hint">
                <button type="button" className="text-button text-button--muted" onClick={skip}>
                  Skip {WALLETS[current].name} for now
                </button>
              </p>
            )}
          </>
        )}
        {step === 'done' && (
          <div className="dock__stack">
            <button type="button" className="pill pill--primary pill--block" onClick={openGuestView} disabled={saving}>
              {saving ? 'Opening…' : 'See what your guests see'}
            </button>
            <button type="button" className="pill pill--day pill--block" onClick={() => setStep('choose')}>
              Edit wallets
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const UPLOAD_ERRORS = {
  no_qr: () => "We couldn't find a QR code in that image. Use a screenshot where the whole code is visible.",
  not_a_link: (name) => `That QR code isn't a link. Make sure you saved your ${name} receive-money QR code.`,
  wrong_wallet: (name, host) => `That QR code opens ${host}, not ${name}. Upload your ${name} QR code.`,
  offline: () => "You're offline. Check your connection and try again.",
};

function QrUpload({ wallet, savedUrl, onSaved }) {
  const [phase, setPhase] = useState(savedUrl ? 'saved' : 'idle');
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const inputId = useId();
  const previewRef = useRef(null);
  const name = WALLETS[wallet].name;

  useEffect(() => () => previewRef.current && URL.revokeObjectURL(previewRef.current), []);

  async function onFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = URL.createObjectURL(file);
    setPreview(previewRef.current);
    setPhase('reading');
    setError(null);

    let text = null;
    try {
      text = await readQrFromFile(file);
    } catch {
      text = null;
    }
    if (!text) {
      setPhase('error');
      setError(UPLOAD_ERRORS.no_qr());
      return;
    }
    try {
      onSaved(await api.savePayout(wallet, text));
      setPhase('saved');
    } catch (err) {
      setPhase('error');
      setError((UPLOAD_ERRORS[err.code] ?? (() => "Couldn't save that QR code. Try again."))(name, err.data?.host));
    }
  }

  const input = (
    <input id={inputId} type="file" accept="image/*" className="visually-hidden" onChange={onFile} />
  );

  if (phase === 'saved') {
    return (
      <div className="qr-result" role="status">
        {preview ? <img className="qr-result__thumb" src={preview} alt="" /> : <span className="qr-result__icon"><Icon name="check" /></span>}
        <div className="qr-result__text">
          <p className="qr-result__title">Found your {name} link</p>
          <p className="qr-result__link">{displayLink(savedUrl)}</p>
        </div>
        <label htmlFor={inputId} className="pill pill--day pill--small qr-result__replace">
          Replace
          {input}
        </label>
      </div>
    );
  }

  return (
    <div className="qr-upload">
      <label htmlFor={inputId} className={`upload${phase === 'error' ? ' is-error' : ''}`} aria-busy={phase === 'reading'}>
        {input}
        <span className="upload__icon" aria-hidden="true">
          <Icon name={phase === 'error' ? 'alert' : 'upload'} size={22} />
        </span>
        <span className="upload__title">
          {phase === 'reading' ? 'Reading the QR code…' : phase === 'error' ? 'Try another image' : 'Upload QR image'}
        </span>
        <span className="upload__meta">A screenshot or saved image from {WALLETS[wallet].app}</span>
      </label>
      {error && (
        <p className="upload__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
