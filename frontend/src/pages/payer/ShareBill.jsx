import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Amount from '../../components/Amount.jsx';
import Icon from '../../components/Icon.jsx';
import { api } from '../../lib/api.js';
import './share.css';

/** Share screen (PRD M4): a big QR code on the payer's phone, plus Copy link and the share sheet. */
export default function ShareBill() {
  const { id } = useParams();
  const [bill, setBill] = useState(null);
  const [failed, setFailed] = useState(false);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    let active = true;
    api
      .payerBill(id)
      .then((b) => active && setBill(b))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
      clearTimeout(timer.current);
    };
  }, [id]);

  const link = bill ? `${window.location.origin}/b/${bill.shareToken}` : '';

  useEffect(() => {
    if (!link) return;
    QRCode.toString(link, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [link]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2400);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    try {
      await navigator.share({ title: `${bill.venue} on splIT`, text: 'Tap what you had and pay me back:', url: link });
    } catch {
      // Closed the share sheet: nothing to do.
    }
  }

  if (failed) {
    return (
      <main className="state on-night">
        <h1 className="state__title">Couldn't find this bill</h1>
        <p className="state__text">It may belong to another account.</p>
        <Link className="pill pill--night" to="/">
          Go home
        </Link>
      </main>
    );
  }
  if (!bill) return <main className="state on-night" aria-busy="true" aria-label="Loading" />;

  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);

  return (
    <main className="share-screen on-night">
      <div className="top__bar">
        <Link to="/" className="pill pill--night pill--icon" aria-label="Home">
          <Icon name="chevronLeft" />
        </Link>
        <p className="wordmark">
          spl<span>IT</span>
        </p>
        <span className="share-screen__spacer" />
      </div>

      <div className="share-screen__head">
        <h1 className="share-screen__venue">{bill.venue}</h1>
        <Amount minor={bill.total} currency={bill.currency} className="share-screen__total" />
      </div>

      <figure className="qr-card">
        <div className="qr-card__code" role="img" aria-label="QR code with the link to this bill" dangerouslySetInnerHTML={{ __html: qr }} />
        <figcaption className="qr-card__caption">Friends scan this with their phone camera to claim what they had.</figcaption>
      </figure>

      {local && (
        <p className="share-screen__note">
          This link uses localhost, which other phones can't open. To test with friends, open splIT on this computer's
          network address instead (shown when the frontend starts).
        </p>
      )}

      <div className="share-screen__actions">
        <button type="button" className="pill pill--primary pill--block" onClick={copyLink}>
          <Icon name={copied ? 'check' : 'copy'} size={18} />
          {copied ? 'Link copied' : 'Copy link'}
        </button>
        {typeof navigator.share === 'function' && (
          <button type="button" className="pill pill--night pill--block" onClick={share}>
            <Icon name="arrowUpRight" size={18} /> Share
          </button>
        )}
        <Link className="pill pill--night pill--block" to={`/b/${bill.shareToken}`}>
          Preview what guests see
        </Link>
      </div>
    </main>
  );
}
