import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Amount from '../../components/Amount.jsx';
import Icon from '../../components/Icon.jsx';
import ItemRow, { myMax } from '../../components/ItemRow.jsx';
import Sheet from '../../components/Sheet.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import { useToast } from '../../components/Toast.jsx';
import { api, cachedBill, cachedProfile } from '../../lib/api.js';
import { formatDate } from '../../lib/dates.js';
import { extrasLabel, formatMoney } from '../../lib/money.js';
import { hueFor, initials } from '../../lib/people.js';
import { previewClaim } from '../../lib/preview.js';
import { walletName } from '../../lib/wallets.js';
import '../guest/guest.css';
import './newbill.css';
import './bill.css';

const POLL_MS = 5000;

const ERRORS = {
  not_enough_left: 'Someone just claimed that one.',
  member_paid: 'Mark them as not paid first.',
  offline: "You're offline. Check your connection and try again.",
};

/**
 * The payer's bill (PRD M10, M11): the card total to charge, everyone's share, tip,
 * method and status, marking people paid, the payer's own claims, and Card paid.
 */
export default function BillScreen() {
  const { id } = useParams();
  // Opens on the last copy of this bill (lib/api.js cache), refreshed right behind it.
  const [view, setView] = useState(() => cachedBill(id));
  const [phase, setPhase] = useState(() => (cachedBill(id) ? 'ready' : 'loading'));
  const [openMember, setOpenMember] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [toast, showToast] = useToast();
  const latest = useRef(0);
  const inflight = useRef(0);

  const load = useCallback(async () => {
    const call = ++latest.current;
    try {
      const next = await api.payerBill(id);
      if (call !== latest.current) return;
      setView(next);
      setPhase('ready');
    } catch (err) {
      if (call !== latest.current) return;
      if (err.status === 404) setPhase('missing');
      else setPhase((p) => (p === 'ready' ? p : 'error'));
    }
  }, [id]);

  // Fetch the edit and share screens' code now, so Edit and Share don't open on a wait.
  useEffect(() => {
    import('./EditBill.jsx');
    import('./ShareBill.jsx');
  }, []);

  // Guests claim and choose how they pay while the payer watches: refresh while visible.
  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && inflight.current === 0) load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  /** Shows `optimistic` right away, keeps only the newest answer. Returns null on failure. */
  const mutate = useCallback(
    async (request, optimistic) => {
      const call = ++latest.current;
      if (optimistic) setView(optimistic);
      inflight.current += 1;
      try {
        const next = await request();
        if (call === latest.current) setView(next);
        return next;
      } catch (err) {
        showToast(ERRORS[err.code] ?? "Couldn't save that. Try again.");
        load();
        return null;
      } finally {
        inflight.current -= 1;
      }
    },
    [load, showToast],
  );

  if (phase === 'loading') return <LoadingBill id={id} summary={cachedProfile()?.bills?.find((b) => b.id === id)} />;
  if (phase === 'missing' || phase === 'error') {
    return (
      <main className="state on-night">
        <h1 className="state__title">{phase === 'missing' ? "Couldn't find this bill" : "Couldn't load the bill"}</h1>
        <p className="state__text">
          {phase === 'missing' ? 'It may belong to another account.' : 'Check your connection, then try again.'}
        </p>
        {phase === 'missing' ? (
          <Link className="pill pill--night" to="/">
            Go home
          </Link>
        ) : (
          <button type="button" className="pill pill--night" onClick={load}>
            Try again
          </button>
        )}
      </main>
    );
  }

  const { bill, items, members, me, photos } = view;
  const currency = bill.currency;
  const money = (minor) => formatMoney(minor, currency);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const guests = members.filter((m) => !m.isPayer);
  const paid = guests.filter((m) => m.status === 'confirmed').length;
  const selected = members.find((m) => m.id === openMember);

  function changeUnits(item, next) {
    const units = Math.max(0, Math.min(next, myMax(item)));
    mutate(
      () => (units > 0 ? api.setPayerClaim(id, item.id, units) : api.removePayerClaim(id, item.id)),
      // My total and "You:" change on the tap, as for a guest (lib/preview.js).
      (v) => previewClaim(v, item.id, units),
    );
  }

  async function setStatus(member, status) {
    setOpenMember(null);
    const ok = await mutate(
      () => api.setMemberStatus(id, member.id, status),
      (v) => ({ ...v, members: v.members.map((m) => (m.id === member.id ? { ...m, status } : m)) }),
    );
    if (ok) showToast(status === 'confirmed' ? `${member.name} marked as paid.` : `${member.name} marked as not paid.`);
  }

  async function removeMember(member) {
    setOpenMember(null);
    const ok = await mutate(
      () => api.removeMember(id, member.id),
      (v) => ({ ...v, members: v.members.filter((m) => m.id !== member.id) }),
    );
    if (ok) showToast(`${member.name} removed, with what they claimed.`);
  }

  function setCardPaid(cardPaid) {
    mutate(() => api.setCardPaid(id, cardPaid), (v) => ({ ...v, bill: { ...v.bill, cardPaid } }));
  }

  return (
    <div className="screen bill-screen">
      <header className="top on-night">
        <div className="top__bar">
          <Link to="/" className="pill pill--night pill--icon" aria-label="Home">
            <Icon name="chevronLeft" />
          </Link>
          <div className="bill-screen__links">
            <Link className="pill pill--night pill--small" to={`/bills/${id}/edit`}>
              Edit
            </Link>
            <Link className="pill pill--night pill--small" to={`/bills/${id}/share`}>
              Share
            </Link>
          </div>
        </div>

        <div className="bill-screen__heading">
          <h1 className="bill-screen__venue">{bill.venue}</h1>
          <p className="venue__meta">
            {formatDate(bill.date)} · {guests.length === 1 ? '1 guest' : `${guests.length} guests`}
          </p>
        </div>

        <div className="share">
          <div className="share__label">
            <span>Card total</span>
            {bill.cardPaid && (
              <span className="chip chip--confirmed">
                <span className="chip__dot" aria-hidden="true" />
                Card paid
              </span>
            )}
          </div>
          <Amount minor={bill.card} currency={currency} className="amount--hero share__amount" />
          <p className="share__detail num">
            Bill {money(bill.total)}
            {` + tips ${money(bill.tips)}`}
          </p>
        </div>
      </header>

      <main className="surface on-day">
        <section aria-labelledby="people-title">
          <div className="surface__head">
            <h2 id="people-title" className="surface__title">
              People
            </h2>
            <p className="surface__meta num">
              {paid} of {guests.length} paid
            </p>
          </div>
          <ul className="people">
            {members.map((member) => (
              <PersonRow key={member.id} member={member} currency={currency} onOpen={() => setOpenMember(member.id)} />
            ))}
          </ul>
          {guests.length === 0 && <p className="bill-screen__empty">Nobody has joined yet. Share the link with the table.</p>}
          <dl className="breakdown num">
            <div>
              <dt>Collected</dt>
              <dd>{money(bill.collected)}</dd>
            </div>
            <div>
              <dt>Still owed</dt>
              <dd>{money(bill.outstanding)}</dd>
            </div>
            {bill.unclaimed > 0 && (
              <div className="breakdown__unclaimed">
                <dt>
                  <span className="chip__dot" aria-hidden="true" />
                  Not claimed yet
                </dt>
                <dd>{money(bill.unclaimed)}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="bill-screen__section" aria-labelledby="mine-title">
          <div className="surface__head">
            <h2 id="mine-title" className="surface__title">
              Your items
            </h2>
            <p className="surface__meta num">You: {money(me.total)}</p>
          </div>
          <ul className="items">
            {items.map((item) => (
              <ItemRow key={item.id} item={item} currency={currency} memberById={memberById} meId={me.id} onChange={changeUnits} />
            ))}
          </ul>
        </section>

        {photos.length > 0 && (
          <section className="bill-screen__section" aria-labelledby="receipt-title">
            <h2 id="receipt-title" className="surface__title">
              Receipt
            </h2>
            <div className="newbill__photos">
              {photos.map((url, i) => (
                <button key={url} type="button" className="thumb" onClick={() => setViewing(i)} aria-label={`View photo ${i + 1}`}>
                  <img src={url} alt="" />
                </button>
              ))}
            </div>
          </section>
        )}

        <dl className="breakdown num">
          <div>
            <dt>Items</dt>
            <dd>{money(bill.subtotal)}</dd>
          </div>
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
          <div>
            <dt>Tips</dt>
            <dd>{money(bill.tips)}</dd>
          </div>
          <div className="breakdown__total">
            <dt>Card total</dt>
            <dd>{money(bill.card)}</dd>
          </div>
        </dl>
      </main>

      <div className="dock on-day">
        {bill.cardPaid ? (
          <div className="paid">
            <span className="paid__icon paid__icon--confirmed" aria-hidden="true">
              <Icon name="check" size={18} />
            </span>
            <div className="paid__text">
              <p className="paid__title num">Card paid · {money(bill.card)}</p>
              <p className="paid__sub">Tips are locked at what you charged.</p>
            </div>
            <button type="button" className="pill pill--day" onClick={() => setCardPaid(false)}>
              Undo
            </button>
          </div>
        ) : (
          // After charging the card at the table: locks tips at what was charged (PRD Q16).
          <button type="button" className="pill pill--primary pill--block pill--split" onClick={() => setCardPaid(true)}>
            <span>Card paid</span>
            <span className="num">{money(bill.card)}</span>
          </button>
        )}
      </div>
      {toast}

      <PersonSheet
        member={selected}
        bill={bill}
        currency={currency}
        onClose={() => setOpenMember(null)}
        onStatus={setStatus}
        onRemove={removeMember}
      />
      <Sheet open={viewing !== null} onClose={() => setViewing(null)} title={`Photo ${(viewing ?? 0) + 1} of ${photos.length}`}>
        {viewing !== null && <img className="photo-full" src={photos[viewing]} alt={`Receipt photo ${viewing + 1}`} />}
      </Sheet>
    </div>
  );
}

/**
 * While the bill loads: the screen's own layout, not a blank page. The name and date
 * show at once from the dashboard (when coming from it); the rest holds its place.
 */
function LoadingBill({ id, summary }) {
  return (
    <div className="screen bill-screen" aria-busy="true" aria-label="Loading the bill">
      <header className="top on-night">
        <div className="top__bar">
          <Link to="/" className="pill pill--night pill--icon" aria-label="Home">
            <Icon name="chevronLeft" />
          </Link>
          <div className="bill-screen__links">
            <Link className="pill pill--night pill--small" to={`/bills/${id}/edit`}>
              Edit
            </Link>
            <Link className="pill pill--night pill--small" to={`/bills/${id}/share`}>
              Share
            </Link>
          </div>
        </div>
        <div className="bill-screen__heading">
          {summary ? (
            <>
              <h1 className="bill-screen__venue">{summary.venue}</h1>
              <p className="venue__meta">
                {formatDate(summary.date)} · {summary.guests === 1 ? '1 guest' : `${summary.guests} guests`}
              </p>
            </>
          ) : (
            <div className="skeleton" style={{ width: '70%', height: 34 }} />
          )}
        </div>
        <div className="share">
          <div className="share__label">
            <span>Card total</span>
          </div>
          <div className="skeleton" style={{ width: '58%', height: 56, marginTop: 8 }} />
        </div>
      </header>
      <main className="surface on-day">
        <div className="surface__head">
          <h2 className="surface__title">People</h2>
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton" style={{ height: 52, marginTop: i === 0 ? 8 : 18 }} />
        ))}
      </main>
    </div>
  );
}

/** One person on the bill: what they owe, how they're paying, and whether they've paid. */
function PersonRow({ member, currency, onOpen }) {
  const money = (minor) => formatMoney(minor, currency);
  const detail = [
    member.items === 0 ? 'No items yet' : null,
    member.method ? walletName(member.method) : null,
    member.tip > 0 ? `tip ${money(member.tip)}` : null,
  ].filter(Boolean);

  const body = (
    <>
      <span className="venue__avatar" style={{ '--hue': hueFor(member.id) }} aria-hidden="true">
        {initials(member.name)}
      </span>
      <span className="person__main">
        <span className="person__name">
          {member.name}
          {member.isPayer && <span className="person__you"> · You</span>}
        </span>
        {member.changed ? (
          <span className="person__meta person__meta--changed num">
            Paid {money(member.paidAmount)}, now owes {money(member.due)}
          </span>
        ) : (
          detail.length > 0 && <span className="person__meta num">{detail.join(' · ')}</span>
        )}
      </span>
      <span className="person__side">
        <span className="person__amount num">{money(member.due)}</span>
        {!member.isPayer && <StatusChip status={member.status} />}
      </span>
    </>
  );

  // The payer's own row has nothing to act on.
  if (member.isPayer) return <li className="person">{body}</li>;
  return (
    <li>
      <button type="button" className="person person--button" onClick={onOpen} aria-label={`${member.name}: ${money(member.due)}`}>
        {body}
        <Icon name="chevronRight" size={18} />
      </button>
    </li>
  );
}

/** A guest's details and the payer's actions: mark paid or not, remove. */
function PersonSheet({ member, bill, currency, onClose, onStatus, onRemove }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [shown, setShown] = useState(member);
  // Keep the last member on screen while the sheet slides away.
  if (member && member !== shown) setShown(member);
  if (!member && confirmRemove) setConfirmRemove(false);

  const m = member ?? shown;
  const money = (minor) => formatMoney(minor, currency);
  const extras = extrasLabel(bill);
  const isPaid = m?.status === 'confirmed';

  return (
    <Sheet
      open={Boolean(member)}
      onClose={onClose}
      title={m?.name ?? ''}
      footer={
        m && (
          <>
            {isPaid ? (
              <button type="button" className="pill pill--day pill--block" onClick={() => onStatus(m, 'unpaid')}>
                Mark as not paid
              </button>
            ) : (
              <button type="button" className="pill pill--primary pill--block pill--split" onClick={() => onStatus(m, 'confirmed')}>
                <span>Mark as paid</span>
                <span className="num">{money(m.due)}</span>
              </button>
            )}
            {!isPaid &&
              (confirmRemove ? (
                <button type="button" className="pill pill--day pill--block danger-text" onClick={() => onRemove(m)}>
                  Remove {m.name} and what they claimed
                </button>
              ) : (
                <button type="button" className="pill pill--day pill--block danger-text" onClick={() => setConfirmRemove(true)}>
                  Remove from bill
                </button>
              ))}
          </>
        )
      }
    >
      {m && (
        <>
          <div className="pay-amount">
            <Amount minor={m.due} currency={currency} className="pay-amount__value" />
            <StatusChip status={m.status} />
          </div>
          <p className="pay-breakdown num">
            Items {money(m.items)}
            {extras && ` · ${extras} ${money(m.extras)}`} · tip {money(m.tip)}
          </p>
          <p className="person-sheet__method">
            {m.method ? `Paying with ${walletName(m.method)}` : "Hasn't chosen how to pay yet"}
          </p>
          {m.changed && (
            <p className="person-sheet__changed num">
              Paid {money(m.paidAmount)}, but the bill changed since: now {money(m.due)}.
            </p>
          )}
        </>
      )}
    </Sheet>
  );
}
