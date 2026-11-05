import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import Amount from '../../components/Amount.jsx';
import Icon from '../../components/Icon.jsx';
import ItemRow, { myMax } from '../../components/ItemRow.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import { useToast } from '../../components/Toast.jsx';
import { api, cachedGuestBill, guestTokens } from '../../lib/api.js';
import { formatDate } from '../../lib/dates.js';
import { extrasLabel, formatMoney } from '../../lib/money.js';
import { hueFor, initials } from '../../lib/people.js';
import { previewClaim } from '../../lib/preview.js';
import PayFlow from './PayFlow.jsx';
import './guest.css';

const POLL_MS = 5000;

export default function GuestBill() {
  const { shareToken } = useParams();
  const [token, setToken] = useState(() => guestTokens.get(shareToken));
  // Reopening the link shows the last copy at once (lib/api.js cache), refreshed right
  // behind it. Without a guest token on this phone, it's the not-joined view.
  const [view, setView] = useState(() => {
    const last = cachedGuestBill(shareToken);
    return last && !guestTokens.get(shareToken) ? { ...last, me: null } : last;
  });
  const [phase, setPhase] = useState(() => (cachedGuestBill(shareToken) ? 'ready' : 'loading'));
  const [sheet, setSheet] = useState(null);
  const [toast, showToast] = useToast();
  const joinInput = useRef(null);
  const latest = useRef(0);
  const inflight = useRef(0);

  const load = useCallback(async () => {
    const id = ++latest.current;
    try {
      const next = await api.bill(shareToken, token);
      if (id !== latest.current) return;
      if (token && !next.me) {
        guestTokens.clear(shareToken);
        setToken(null);
      }
      setView(next);
      setPhase('ready');
    } catch (err) {
      if (id !== latest.current) return;
      if (err.status === 404) setPhase('missing');
      else setPhase((p) => (p === 'ready' ? p : 'error'));
    }
  }, [shareToken, token]);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && inflight.current === 0) load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  /** Runs a change, shows `optimistic` right away, keeps only the newest answer. Returns null on failure. */
  const mutate = useCallback(
    async (request, optimistic) => {
      const id = ++latest.current;
      if (optimistic) setView(optimistic);
      inflight.current += 1;
      try {
        const next = await request();
        if (id === latest.current) setView(next);
        return next;
      } catch (err) {
        if (err.code === 'not_joined') {
          guestTokens.clear(shareToken);
          setToken(null);
          showToast('You were removed from this bill. Join again to keep going.');
        } else if (err.code === 'not_enough_left') {
          showToast('Someone just claimed that one.');
        } else if (err.code === 'too_many_requests') {
          showToast(`That's a lot of taps. Try again in ${waitText(err.data?.retryAfter)}.`);
        } else if (err.code === 'offline') {
          showToast("You're offline. Check your connection and try again.");
        } else {
          showToast("Couldn't save that. Try again.");
        }
        load();
        return null;
      } finally {
        inflight.current -= 1;
      }
    },
    [load, shareToken, showToast],
  );

  if (phase === 'loading') return <LoadingBill />;
  if (phase === 'missing') {
    return (
      <main className="state on-night">
        <h1 className="state__title">This bill doesn't exist</h1>
        <p className="state__text">Ask the person who paid to show you the QR code again.</p>
      </main>
    );
  }
  if (phase === 'error') {
    return (
      <main className="state on-night">
        <h1 className="state__title">Couldn't load the bill</h1>
        <p className="state__text">Check your connection, then try again.</p>
        <button type="button" className="pill pill--night" onClick={load}>
          Try again
        </button>
      </main>
    );
  }

  const { bill, payer, items, members, me } = view;
  const currency = bill.currency;
  const money = (minor) => formatMoney(minor, currency);
  const extras = extrasLabel(bill);
  // "Pay Ralph", not "Pay Ralph Abdallah"
  const payerFirst = payer.name.trim().split(/\s+/)[0];
  const memberById = new Map(members.map((m) => [m.id, m]));
  const payerMember = members.find((m) => m.isPayer);
  const claimed = items.reduce((acc, i) => acc + Math.min(i.claimedUnits, i.quantity), 0);
  const units = items.reduce((acc, i) => acc + i.quantity, 0);
  const locked = me ? me.status !== 'unpaid' : false;

  async function join(name) {
    try {
      const res = await api.join(shareToken, name);
      guestTokens.set(shareToken, res.guestToken);
      latest.current += 1;
      setView(res);
      setToken(res.guestToken);
      return null;
    } catch (err) {
      return err.code;
    }
  }

  function leave() {
    guestTokens.clear(shareToken);
    latest.current += 1;
    setView((v) => ({ ...v, me: null, items: v.items.map((i) => ({ ...i, myUnits: 0, myShare: 0 })) }));
    setToken(null);
  }

  function changeUnits(item, next) {
    // Before joining, Claim is a label for the name field (ItemRow), so this needs a member.
    if (!me) return;
    const clamped = Math.max(0, Math.min(next, myMax(item)));
    mutate(
      () =>
        clamped > 0
          ? api.setClaim(shareToken, token, item.id, clamped)
          : api.removeClaim(shareToken, token, item.id),
      // Totals and "You:" change on the tap; the server's answer replaces this preview.
      (v) => previewClaim(v, item.id, clamped),
    );
  }

  // On to paying on the tap, with the new amount; the save runs behind it. If it fails,
  // the toast says so and the sheet goes back to the tip.
  async function saveTip(tip) {
    setSheet('pay');
    const ok = await mutate(
      () => api.updateMe(shareToken, token, { tip }),
      (v) => ({ ...v, me: { ...v.me, tip, due: v.me.total + tip } }),
    );
    if (!ok) setSheet((s) => (s === 'pay' ? 'tip' : s));
  }

  function chooseMethod(method) {
    mutate(
      () => api.updateMe(shareToken, token, { method }),
      (v) => ({ ...v, me: { ...v.me, method } }),
    );
  }

  // Done: the tip first (their current tip filled in), then the pay sheet. Once the card
  // is paid, tips are locked, so straight to paying.
  function openPay() {
    if (!me) return;
    setSheet(bill.cardPaid ? 'pay' : 'tip');
  }

  return (
    <div className="screen guest">
      <header className="top on-night">
        <div className="top__bar">
          <div className="venue">
            <span className="venue__avatar" style={{ '--hue': hueFor(payerMember?.id ?? payer.name) }} aria-hidden="true">
              {initials(payer.name)}
            </span>
            <div className="venue__text">
              <h1 className="venue__name">{bill.venue}</h1>
              <p className="venue__meta">
                {payer.name} paid · {formatDate(bill.date)}
              </p>
            </div>
          </div>
          {me && (
            <button type="button" className="pill pill--night pill--small" onClick={leave}>
              Not {me.name}?
            </button>
          )}
        </div>

        <div className="share">
          <div className="share__label">
            <span>{me ? 'Your share' : 'Bill total'}</span>
            {me && <StatusChip status={me.status} />}
          </div>
          <Amount minor={me ? me.total : bill.total} currency={currency} className="amount--hero share__amount" />
          {me && (
            <p className="share__detail num">
              Items {money(me.items)}
              {extras && ` + ${extras} ${money(me.extras)}`}
              {me.tip ? ` · tip ${money(me.tip)}` : ''}
            </p>
          )}
        </div>
      </header>

      <main className="surface on-day">
        {!me && <JoinForm inputRef={joinInput} onJoin={join} />}

        <div className="surface__head">
          <h2 className="surface__title">Items</h2>
          <p className="surface__meta num">
            {claimed} of {units} claimed
          </p>
        </div>

        <ul className="items">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              currency={currency}
              memberById={memberById}
              meId={me?.id}
              joined={Boolean(me)}
              locked={locked}
              onChange={changeUnits}
            />
          ))}
        </ul>

        <dl className="breakdown num">
          <div>
            <dt>Items</dt>
            <dd>{money(bill.subtotal)}</dd>
          </div>
          {/* Tax and service only when the receipt has them */}
          {bill.tax > 0 && (
            <div>
              <dt>
                Tax{bill.taxRate ? ` (${bill.taxRate}%)` : ''}
                {bill.taxIncluded ? ', included in prices' : ''}
              </dt>
              <dd>{money(bill.tax)}</dd>
            </div>
          )}
          {bill.service > 0 && (
            <div>
              <dt>Service</dt>
              <dd>{money(bill.service)}</dd>
            </div>
          )}
          <div className="breakdown__total">
            <dt>Bill total</dt>
            <dd>{money(bill.total)}</dd>
          </div>
          {bill.unclaimed > 0 && (
            <div className="breakdown__unclaimed is-danger">
              <dt>Unpaid</dt>
              <dd>{money(bill.unclaimed)}</dd>
            </div>
          )}
        </dl>
      </main>

      {/* Joined: the dock carries Done / Pay, then the paid state. Before joining, the name is at the top. */}
      {!me && <div className="dock dock--empty" aria-hidden="true" />}
      {me && (
        <div className="dock on-day">
          {me.status === 'unpaid' && (
            // Always just Done: it starts the tip, then the pay sheet. Closing either one
            // comes back here, to Done.
            <button type="button" className="pill pill--primary pill--block" onClick={openPay} disabled={me.total === 0}>
              Done
            </button>
          )}

          {me.status !== 'unpaid' && (
            <div className="paid">
              <span className={`paid__icon paid__icon--${me.status}`} aria-hidden="true">
                <Icon name="check" size={18} />
              </span>
              <div className="paid__text">
                <p className="paid__title num">
                  {me.status === 'confirmed' ? 'Paid' : 'Marked as paid'} · {money(me.paidAmount ?? me.due)}
                </p>
                {/* Paid: just "Paid · $X" (team choice). The older marked-paid state still explains itself. */}
                {me.status !== 'confirmed' && <p className="paid__sub">Waiting for {payerFirst} to confirm.</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {toast}

      {me && (
        <PayFlow
          // One sheet: the tip, then paying, swapped in place. Closing (×, drag, Escape)
          // isn't an answer: back to Done, which asks again. Add or No tip saves it
          // (saveTip) and moves the same sheet on to paying.
          step={sheet}
          onClose={() => setSheet(null)}
          me={me}
          payerName={payerFirst}
          currency={currency}
          cardPaid={bill.cardPaid}
          onSaveTip={saveTip}
          onChooseMethod={chooseMethod}
        />
      )}
    </div>
  );
}


/** "30 seconds", "2 minutes": how long a rate limit asks to wait. */
function waitText(seconds) {
  if (!(seconds > 0)) return 'a moment';
  if (seconds < 60) return `${seconds} seconds`;
  const min = Math.ceil(seconds / 60);
  return min === 1 ? '1 minute' : `${min} minutes`;
}

const JOIN_ERRORS = {
  empty: 'Type your name to join.',
  invalid_name: 'Use a name of up to 40 characters.',
  offline: "You're offline. Check your connection and try again.",
};

function JoinForm({ inputRef, onJoin }) {
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) {
      setError('empty');
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    const code = await onJoin(clean);
    setBusy(false);
    setError(code);
  }

  const message =
    error === 'name_taken'
      ? `Someone called ${name.trim()} already joined. Add your last initial.`
      : error === 'too_many_requests'
        ? 'A lot of people just joined this bill. Try again in a few minutes.'
        : error
        ? (JOIN_ERRORS[error] ?? "Couldn't join. Try again.")
        : null;

  return (
    <form className="join" onSubmit={submit} noValidate>
      <div className="join__row">
        <label htmlFor="join-name" className="visually-hidden">
          Your name
        </label>
        <input
          ref={inputRef}
          id="join-name"
          className="field-input"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Your name"
          // Its own name: the Claim labels that point here must not become part of it.
          aria-label="Your name"
          autoComplete="given-name"
          autoCapitalize="words"
          enterKeyHint="go"
          maxLength={40}
          aria-invalid={Boolean(message)}
          aria-describedby="join-help"
        />
        <button type="submit" className="pill pill--primary" disabled={busy}>
          {busy ? 'Joining…' : 'Join'}
        </button>
      </div>
      <p id="join-help" className="join__error" aria-live="polite">
        {message}
      </p>
    </form>
  );
}

function LoadingBill() {
  return (
    <div className="screen guest" aria-busy="true" aria-label="Loading the bill">
      <header className="top on-night">
        <div className="top__bar">
          <div className="skeleton" style={{ width: '58%', height: 40 }} />
        </div>
        <div className="share">
          <div className="skeleton" style={{ width: 90, height: 16 }} />
          <div className="skeleton" style={{ width: '62%', height: 56, marginTop: 12 }} />
        </div>
      </header>
      <main className="surface">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 52, marginTop: i === 0 ? 24 : 18 }} />
        ))}
      </main>
    </div>
  );
}
