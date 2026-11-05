import LoadingScreen from '../../components/Loading.jsx';
import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import WalletLogo from '../../components/WalletLogo.jsx';
import { api, cachedProfile } from '../../lib/api.js';
import { readQrFromFile } from '../../lib/qr.js';
import { displayLink, WALLET_ORDER, WALLETS } from '../../lib/wallets.js';
import './getpaid.css';

/** Get-paid setup (PRD M1): pick wallets, then upload each wallet's receive-money QR code. */
export default function GetPaid() {
  const navigate = useNavigate();
  // Start from the remembered profile (instant), then refresh it.
  const [profile, setProfile] = useState(cachedProfile);
  const [failed, setFailed] = useState(false);
  const [step, setStep] = useState('choose');
  const [picked, setPicked] = useState(() => cachedProfile()?.payouts.map((x) => x.wallet) ?? []);
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    // Ignore a response that lands after this effect was cleaned up, and never
    // reset choices the payer already made while it was loading.
    let active = true;
    api
      .profile()
      .then((p) => {
        if (!active) return;
        setProfile(p);
        if (!touched.current) setPicked(p.payouts.map((x) => x.wallet));
      })
      .catch(() => active && !cachedProfile() && setFailed(true));
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
  if (!profile) return <LoadingScreen />;

  const saved = new Map(profile.payouts.map((p) => [p.wallet, p.payUrl]));
  const savedIds = WALLET_ORDER.filter((id) => saved.has(id));
  const current = picked[index];

  function toggle(id) {
    touched.current = true;
    setPicked((list) => WALLET_ORDER.filter((w) => (w === id ? !list.includes(id) : list.includes(w))));
  }

  async function continueFromChoose() {
    setSaving(true);
    try {
      let next = profile;
      for (const id of savedIds.filter((w) => !picked.includes(w))) next = await api.removePayout(id);
      setProfile(next);
      setIndex(0);
      // Nothing to link (cash only): it's saved, back to the account.
      if (picked.length > 0) setStep('add');
      else navigate('/', { replace: true });
    } catch {
      // Stay on this step so they can try again.
    } finally {
      setSaving(false);
    }
  }

  // Each wallet's link is saved as soon as its QR code is read, so Finish just goes home.
  function next() {
    if (index + 1 < picked.length) setIndex(index + 1);
    else navigate('/', { replace: true });
  }

  function back() {
    if (step === 'add' && index > 0) setIndex(index - 1);
    else setStep('choose');
  }

  const headings = {
    choose: {
      title: 'How do you accept money?',
      lede: null,
    },
    add: current && {
      // "Link your / account" with the wallet's logo beside it; the name is still read aloud.
      title: (
        <>
          Link your<span className="visually-hidden"> {WALLETS[current].name}</span>
          <br />
          account
        </>
      ),
      logo: current,
      lede: null,
    },
  };
  const heading = (step === 'add' && current ? headings.add : headings.choose);

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
        <div className={`getpaid__heading${heading.logo ? ' getpaid__heading--logo' : ''}`}>
          <h1 className="getpaid__title">{heading.title}</h1>
          {heading.logo && <WalletLogo wallet={heading.logo} size={84} />}
          {heading.lede && <p className="getpaid__lede">{heading.lede}</p>}
        </div>
      </header>

      <main className={`surface on-day${step === 'add' ? ' getpaid__sheet--link' : ''}`}>
        {step === 'choose' && (
          <fieldset className="wallet-picks">
            <legend className="visually-hidden">Wallets you receive money on</legend>
            {WALLET_ORDER.map((id) => (
              <label key={id} className="wallet-pick">
                <input type="checkbox" className="visually-hidden" checked={picked.includes(id)} onChange={() => toggle(id)} />
                <WalletLogo wallet={id} />
                <span className="wallet-pick__text">
                  <span className="wallet-pick__name">{WALLETS[id].name}</span>
                  {saved.has(id) && <span className="wallet-pick__meta">QR code added</span>}
                </span>
                <span className="wallet-pick__check" aria-hidden="true">
                  <Icon name="check" size={16} />
                </span>
              </label>
            ))}
            <p className="cash-note">Cash is always an option</p>
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

      </main>

      <div className="dock on-day">
        {step === 'choose' && (
          <button type="button" className="pill pill--primary pill--block" onClick={continueFromChoose} disabled={saving}>
            Continue
          </button>
        )}
        {step === 'add' && current && (
          <button type="button" className="pill pill--primary pill--block" onClick={next} disabled={!saved.has(current)}>
            {index + 1 < picked.length ? `Next: ${WALLETS[picked[index + 1]].name}` : 'Finish'}
          </button>
        )}
      </div>
    </div>
  );
}

function QrUpload({ wallet, savedUrl, onSaved }) {
  const [phase, setPhase] = useState(savedUrl ? 'saved' : 'idle');
  const [offline, setOffline] = useState(false);
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
    setOffline(false);

    let text = null;
    try {
      text = await readQrFromFile(file);
    } catch {
      text = null;
    }
    if (!text) {
      setPhase('error');
      return;
    }
    try {
      onSaved(await api.savePayout(wallet, text));
      setPhase('saved');
    } catch (err) {
      setPhase('error');
      setOffline(err.code === 'offline');
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
        {phase === 'error' ? (
          <span className="upload__meta" role="alert">
            {offline
              ? "You're offline. Check your connection and try again."
              : `Only valid QR codes from the official ${name} app are accepted.`}
          </span>
        ) : (
          <span className="upload__meta">A screenshot or saved image from {WALLETS[wallet].app}</span>
        )}
      </label>
    </div>
  );
}
