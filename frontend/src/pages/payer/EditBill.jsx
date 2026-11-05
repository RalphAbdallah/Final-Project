import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { StackLink, useStackNavigate } from '../../lib/stack.jsx';
import Amount from '../../components/Amount.jsx';
import Icon from '../../components/Icon.jsx';
import Sheet from '../../components/Sheet.jsx';
import { useToast } from '../../components/Toast.jsx';
import { api, cachedBill, cachedProfile } from '../../lib/api.js';
import { formatMoney } from '../../lib/money.js';
import { ExtrasSheet, Field, ItemSheet, totals } from './NewBill.jsx';
import './newbill.css';

let nextKey = 0;

/** The bill screen's view → what this screen edits (null when there's no view yet). */
function draftFrom(view) {
  if (!view) return null;
  const { bill, items } = view;
  return {
    venue: bill.venue,
    date: bill.date,
    currency: bill.currency,
    tax: bill.tax,
    taxRate: bill.taxRate,
    taxIncluded: bill.taxIncluded,
    service: bill.service,
    items: items.map((i) => ({ key: i.id, id: i.id, name: i.name, price: i.price, quantity: i.quantity, claimed: i.claimedUnits })),
  };
}

/**
 * Edit a bill after creating it (PRD P2.6, Q7): the Check the bill screen again, saved
 * in place. Currency stays (people may have paid in it); an item can't drop below the
 * units already claimed. Paid guests whose total changes are flagged on the bill screen.
 */
export default function EditBill() {
  const { id } = useParams();
  const navigate = useStackNavigate();
  // Opens filled in from the last copy of the bill; the fresh one replaces it only until
  // the payer starts editing (never over their changes). The server re-checks on save.
  const [draft, setDraft] = useState(() => draftFrom(cachedBill(id)));
  const edited = useRef(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, showToast] = useToast();

  useEffect(() => {
    let active = true;
    api
      .payerBill(id)
      .then((view) => active && !edited.current && setDraft(draftFrom(view)))
      .catch(() => active && !cachedBill(id) && setFailed(true));
    return () => {
      active = false;
    };
  }, [id]);

  if (failed) {
    return (
      <main className="state on-night">
        <h1 className="state__title">Couldn't load the bill</h1>
        <p className="state__text">Check your connection, then try again.</p>
        <StackLink back className="pill pill--night" to={`/bills/${id}`}>
          Back to the bill
        </StackLink>
      </main>
    );
  }
  if (!draft) return <LoadingEdit id={id} summary={cachedProfile()?.bills?.find((b) => b.id === id)} />;

  const update = (changes) => {
    edited.current = true;
    setDraft((d) => ({ ...d, ...changes }));
  };
  const { subtotal, total } = totals(draft);
  const money = (minor) => formatMoney(minor, draft.currency);
  const canSave = draft.venue.trim() && draft.items.length > 0 && draft.items.every((i) => i.name.trim());
  const editingItem = editing === 'new' ? null : draft.items.find((i) => i.key === editing);

  async function deleteBill() {
    setDeleting(true);
    try {
      await api.deleteBill(id);
      navigate('/', { replace: true, back: true });
    } catch (err) {
      setDeleting(false);
      setConfirmDelete(false);
      showToast(err.code === 'offline' ? "You're offline. Try again." : "Couldn't delete the bill. Try again.");
    }
  }

  async function save() {
    setSaving(true);
    try {
      await api.updateBill(id, {
        venue: draft.venue.trim(),
        date: draft.date,
        tax: draft.tax,
        taxRate: draft.taxRate,
        taxIncluded: draft.taxIncluded,
        service: draft.service,
        items: draft.items.map(({ id: itemId, name, price, quantity }) => ({ id: itemId, name: name.trim(), price, quantity })),
      });
      navigate(`/bills/${id}`, { replace: true, back: true });
    } catch (err) {
      setSaving(false);
      showToast(
        err.code === 'below_claims'
          ? `${err.data.item}: ${err.data.claimed} already claimed. Keep at least that many.`
          : err.code === 'offline'
            ? "You're offline. Try again."
            : "Couldn't save the changes. Check them and try again.",
      );
    }
  }

  return (
    <div className="screen newbill">
      <header className="top on-night">
        <div className="top__bar">
          <StackLink back to={`/bills/${id}`} className="pill pill--night pill--icon" aria-label="Back to the bill">
            <Icon name="chevronLeft" />
          </StackLink>
          <p className="newbill__step">Edit bill</p>
          <span className="newbill__spacer" />
        </div>
        <div className="newbill__summary">
          <p className="newbill__label">Bill total</p>
          <Amount minor={total} currency={draft.currency} className="amount--hero" />
        </div>
      </header>

      <main className="surface on-day edit-bill__surface">
        <section className="review-section" aria-labelledby="details-title">
          <h2 id="details-title" className="surface__title">
            Details
          </h2>
          <Field label="Place" value={draft.venue} onChange={(venue) => update({ venue })} maxLength={80} />
          <Field label="Date" type="date" value={draft.date} onChange={(date) => date && update({ date })} />
        </section>

        <section className="review-section" aria-labelledby="items-title">
          <div className="surface__head">
            <h2 id="items-title" className="surface__title">
              Items
            </h2>
            <p className="surface__meta num">{draft.items.reduce((a, i) => a + i.quantity, 0)} in total</p>
          </div>
          <ul className="review-items">
            {draft.items.map((item) => (
              <li key={item.key}>
                <button type="button" className="review-item" onClick={() => setEditing(item.key)}>
                  <span className="review-item__main">
                    <span className="review-item__name">{item.name || 'Unnamed item'}</span>
                    <span className="review-item__meta num">
                      {item.quantity} × {money(item.price)}
                      {item.claimed > 0 ? ` · ${Math.min(item.claimed, item.quantity)} claimed` : ''}
                    </span>
                  </span>
                  <span className="review-item__total num">{money(item.price * item.quantity)}</span>
                  <Icon name="chevronRight" size={18} />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="pill pill--day pill--block add-item" onClick={() => setEditing('new')}>
            <Icon name="plus" size={18} /> Add a missed item
          </button>
        </section>

        <section className="review-section" aria-labelledby="extras-title">
          <h2 id="extras-title" className="visually-hidden">
            Tax and service
          </h2>
          <button type="button" className="review-extras" onClick={() => setExtrasOpen(true)}>
            <span className="review-extras__row num">
              <span>Subtotal</span>
              <span>{money(subtotal)}</span>
            </span>
            {draft.tax > 0 && (
              <span className="review-extras__row num">
                <span>
                  Tax{draft.taxRate != null ? ` (${draft.taxRate}%)` : ''}
                  {draft.taxIncluded ? ', included in prices' : ''}
                </span>
                <span>{money(draft.tax)}</span>
              </span>
            )}
            {draft.service > 0 && (
              <span className="review-extras__row num">
                <span>Service</span>
                <span>{money(draft.service)}</span>
              </span>
            )}
            <span className="review-extras__edit">Edit tax and service</span>
          </button>
        </section>

        <button type="button" className="pill pill--day pill--block danger-text edit-bill__delete" onClick={() => setConfirmDelete(true)}>
          Delete
        </button>
      </main>

      <div className="dock on-day">
        <button type="button" className="pill pill--primary pill--block pill--split" onClick={save} disabled={!canSave || saving}>
          <span>{saving ? 'Saving…' : 'Save changes'}</span>
          <span className="num">{money(total)}</span>
        </button>
      </div>
      {toast}

      <ItemSheet
        open={editing !== null}
        item={editingItem}
        currency={draft.currency}
        minQuantity={editingItem?.claimed ?? 1}
        onClose={() => setEditing(null)}
        onSave={(saved) => {
          update({
            items: editingItem
              ? draft.items.map((i) => (i.key === editingItem.key ? { ...i, ...saved } : i))
              : [...draft.items, { key: `new-${nextKey++}`, id: null, claimed: 0, ...saved }],
          });
          setEditing(null);
        }}
        onDelete={() => {
          update({ items: draft.items.filter((i) => i.key !== editingItem.key) });
          setEditing(null);
        }}
      />
      {/* Can't be undone, and guests lose the bill too: asked once more, in a sheet */}
      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this bill?"
        description="Everyone's claims and payments on it go too, and the link stops working. This can't be undone."
        footer={
          <>
            <button type="button" className="pill pill--danger pill--block" onClick={deleteBill} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            <button type="button" className="pill pill--day pill--block" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Keep the bill
            </button>
          </>
        }
      />
      <ExtrasSheet
        open={extrasOpen}
        draft={draft}
        onClose={() => setExtrasOpen(false)}
        onSave={(changes) => {
          update(changes);
          setExtrasOpen(false);
        }}
      />
    </div>
  );
}

/** While the bill loads: this screen's own layout, not a blank page. The total shows at once from the dashboard. */
function LoadingEdit({ id, summary }) {
  return (
    <div className="screen newbill" aria-busy="true" aria-label="Loading the bill">
      <header className="top on-night">
        <div className="top__bar">
          <StackLink back to={`/bills/${id}`} className="pill pill--night pill--icon" aria-label="Back to the bill">
            <Icon name="chevronLeft" />
          </StackLink>
          <p className="newbill__step">Edit bill</p>
          <span className="newbill__spacer" />
        </div>
        <div className="newbill__summary">
          <p className="newbill__label">Bill total</p>
          {summary ? (
            <Amount minor={summary.total} currency={summary.currency} className="amount--hero" />
          ) : (
            <div className="skeleton" style={{ width: '58%', height: 56, marginTop: 8 }} />
          )}
        </div>
      </header>
      <main className="surface on-day">
        <section className="review-section">
          <h2 className="surface__title">Details</h2>
          {[0, 1].map((i) => (
            <div key={i} className="skeleton" style={{ height: 52 }} />
          ))}
        </section>
      </main>
    </div>
  );
}
