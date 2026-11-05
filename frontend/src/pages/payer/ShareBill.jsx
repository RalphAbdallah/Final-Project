import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Amount from '../../components/Amount.jsx';
import Icon from '../../components/Icon.jsx';
import { api, cachedBill, cachedProfile } from '../../lib/api.js';
import { copyText } from '../../lib/clipboard.js';
import './share.css';

/** Share screen (PRD M4): a big QR code on the payer's phone, plus Copy link and the share sheet. */
export default function ShareBill() {
  const { id } = useParams();
  // The bill (or the dashboard) already has the name, total and link: the QR code shows at once, then refreshes.
  const [bill, setBill] = useState(() => cachedBill(id)?.bill ?? cachedProfile()?.bills?.find((b) => b.id === id) ?? null);
  const [failed, setFailed] = useState(false);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    let active = true;
    api
      .payerBill(id)
      .then((view) => active && setBill(view.bill))
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
    const ok = await copyText(link);
    setCopied(ok);
    clearTimeout(timer.current);
    if (ok) timer.current = setTimeout(() => setCopied(false), 2400);
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
  // Straight after creating a bill nothing is cached yet: the screen's own layout while it loads.
  if (!bill) {
    return (
      <main className="share-screen on-night" aria-busy="true" aria-label="Loading">
        <div className="top__bar">
          <Link to={`/bills/${id}`} className="pill pill--night pill--icon" aria-label="Back to the bill">
            <Icon name="chevronLeft" />
          </Link>
          <p className="wordmark">
            spl<span>IT</span>
          </p>
          <span className="share-screen__spacer" />
        </div>
        <div className="share-screen__head">
          <div className="skeleton" style={{ width: '55%', height: 24, marginInline: 'auto' }} />
          <div className="skeleton" style={{ width: '40%', height: 44, margin: '12px auto 0' }} />
        </div>
        <figure className="qr-card">
          <div className="qr-card__code" />
        </figure>
      </main>
    );
  }

  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  // Browsers without a share sheet (and plain http, like a laptop's network address) show Copy link only.
  const canShare = typeof navigator.share === 'function';

  return (
    <main className="share-screen on-night">
      <div className="top__bar">
        <Link to={`/bills/${id}`} className="pill pill--night pill--icon" aria-label="Back to the bill">
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
        {canShare && (
          <button type="button" className="pill pill--night pill--block" onClick={share}>
            <Icon name="arrowUpRight" size={18} /> Share
          </button>
        )}
      </div>
    </main>
  );
}
