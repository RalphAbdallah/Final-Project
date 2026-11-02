import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Amount from '../../components/Amount.jsx';
import Icon from '../../components/Icon.jsx';
import Sheet from '../../components/Sheet.jsx';
import Stepper from '../../components/Stepper.jsx';
import { useToast } from '../../components/Toast.jsx';
import { api } from '../../lib/api.js';
import { prepareReceiptPhoto } from '../../lib/images.js';
import { formatMoney, parseMoney, plainAmount } from '../../lib/money.js';
import './newbill.css';

const MAX_PHOTOS = 4;

const READ_ERRORS = {
  not_a_receipt: "That doesn't look like a receipt. Retake the photo with the whole receipt in view.",
  no_items: "We couldn't find any items. Try a sharper photo, in good light, flat on the table.",
  ai_not_configured: 'Receipt reading is off: add the OpenAI key to backend/.env and restart the backend.',
  offline: "You're offline. Check your connection and try again.",
  photo_too_large: 'One of the photos is too large. Retake it and try again.',
};

let nextKey = 0;
const withKey = (item) => ({ key: `item-${nextKey++}`, ...item });

/** What the app calculates from the reviewed draft: items plus extras added on top. */
function totals(draft) {
  const subtotal = draft.items.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const total = subtotal + (draft.taxIncluded ? 0 : draft.tax) + draft.service;
  return { subtotal, total };
}

/** New bill (PRD M2): photos in, AI reads, payer reviews and fixes, bill out. No blank form. */
export default function NewBill() {
  const navigate = useNavigate();
  const [photos, setPhotos] = useState([]);
  const [phase, setPhase] = useState('photos');
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(null);
  const [photoPaths, setPhotoPaths] = useState([]);
  const [editing, setEditing] = useState(null);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [toast, showToast] = useToast();
  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  async function addFiles(fileList) {
    const files = [...fileList].slice(0, MAX_PHOTOS - photos.length);
    if (fileList.length > files.length) showToast(`Up to ${MAX_PHOTOS} photos per receipt.`);
    setPreparing(true);
    setError(null);
    const added = [];
    for (const file of files) {
      try {
        const blob = await prepareReceiptPhoto(file);
        added.push({ id: `photo-${nextKey++}`, blob, url: URL.createObjectURL(blob) });
      } catch {
        showToast("One photo couldn't be opened. Try taking it again.");
      }
    }
    setPhotos((list) => [...list, ...added]);
    setPreparing(false);
  }

  function removePhoto(id) {
    setPhotos((list) => {
      const photo = list.find((p) => p.id === id);
      if (photo) URL.revokeObjectURL(photo.url);
      return list.filter((p) => p.id !== id);
    });
  }

  async function read() {
    setPhase('reading');
    setError(null);
    try {
      const result = await api.readReceipt(photos.map((p) => p.blob));
      setDraft({ ...result.draft, items: result.draft.items.map(withKey) });
      setPhotoPaths(result.photos);
      setPhase('review');
    } catch (err) {
      setPhase('photos');
      setError(READ_ERRORS[err.code] ?? "Couldn't read the receipt right now. Try again in a moment.");
    }
  }

  async function create() {
    setCreating(true);
    try {
      const { printedTotal, items, ...fields } = draft;
      const { id } = await api.createBill({
        ...fields,
        venue: fields.venue.trim(),
        items: items.map(({ name, quantity, price }) => ({ name: name.trim(), quantity, price })),
        photos: photoPaths,
      });
      navigate(`/bills/${id}/share`, { replace: true });
    } catch (err) {
      setCreating(false);
      showToast(err.code === 'offline' ? "You're offline. Try again." : "Couldn't create the bill. Check the details and try again.");
    }
  }

  const update = (changes) => setDraft((d) => ({ ...d, ...changes }));

  function switchCurrency(currency) {
    if (currency === draft.currency) return;
    // Keep the digits as printed: $7.50 (750 cents) becomes LBP 7.50 → 8, and back.
    const convert = (minor) => (currency === 'LBP' ? Math.round(minor / 100) : minor * 100);
    update({
      currency,
      tax: convert(draft.tax),
      service: convert(draft.service),
      printedTotal: draft.printedTotal == null ? null : convert(draft.printedTotal),
      items: draft.items.map((item) => ({ ...item, price: convert(item.price) })),
    });
  }

  if (phase !== 'review') {
    return (
      <PhotoStep
        photos={photos}
        reading={phase === 'reading'}
        preparing={preparing}
        error={error}
        onAdd={addFiles}
        onRemove={removePhoto}
        onRead={read}
        onBack={() => navigate('/')}
        toast={toast}
      />
    );
  }

  const { total } = totals(draft);
  const money = (minor) => formatMoney(minor, draft.currency);
  const matches = draft.printedTotal == null ? null : draft.printedTotal === total;
  const canCreate = draft.venue.trim() && draft.items.length > 0 && draft.items.every((i) => i.name.trim());
  const editingItem = editing === 'new' ? null : draft.items.find((i) => i.key === editing);

  return (
    <div className="screen newbill">
      <header className="top on-night">
        <div className="top__bar">
          <button type="button" className="pill pill--night pill--icon" onClick={() => setPhase('photos')} aria-label="Back to photos">
            <Icon name="chevronLeft" />
          </button>
          <p className="newbill__step">Check the bill</p>
          <span className="newbill__spacer" />
        </div>
        <div className="newbill__summary">
          <p className="newbill__label">Bill total</p>
          <Amount minor={total} currency={draft.currency} className="amount--hero" />
          {matches === true && (
            <p className="check check--ok">
              <Icon name="check" size={16} /> Matches the receipt
            </p>
          )}
          {matches === false && (
            <p className="check check--off num">
              <Icon name="alert" size={16} /> Receipt says {money(draft.printedTotal)}. Check the items below.
            </p>
          )}
          {matches === null && <p className="check num">No total printed on the receipt to compare with.</p>}
        </div>
      </header>

      <main className="surface on-day">
        <div className="newbill__photos" aria-label="Receipt photos">
          {photos.map((photo, i) => (
            <button key={photo.id} type="button" className="thumb" onClick={() => setViewing(i)} aria-label={`View photo ${i + 1}`}>
              <img src={photo.url} alt="" />
            </button>
          ))}
        </div>

        <section className="review-section" aria-labelledby="details-title">
          <h2 id="details-title" className="surface__title">
            Details
          </h2>
          <Field label="Place" value={draft.venue} onChange={(venue) => update({ venue })} maxLength={80} />
          <div className="review-row">
            <Field label="Date" type="date" value={draft.date} onChange={(date) => date && update({ date })} />
            <div className="field">
              <span className="field__label" id="currency-label">
                Currency
              </span>
              <div className="segmented" role="radiogroup" aria-labelledby="currency-label">
                {['USD', 'LBP'].map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={draft.currency === c} onClick={() => switchCurrency(c)}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {draft.lbpRate && (
            <p className="field__hint num">Rate on the receipt: $1 = LBP {draft.lbpRate.toLocaleString('en-US')}</p>
          )}
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
              <span>
                Tax{draft.taxRate != null ? ` (${draft.taxRate}%)` : ''}
                {draft.taxIncluded ? ', included in prices' : ''}
              </span>
              <span>{money(draft.tax)}</span>
            </span>
            <span className="review-extras__row num">
              <span>Service</span>
              <span>{money(draft.service)}</span>
            </span>
            <span className="review-extras__edit">Edit tax and service</span>
          </button>
        </section>
      </main>

      <div className="dock on-day">
        <button
          type="button"
          className="pill pill--primary pill--block pill--split"
          onClick={create}
          disabled={!canCreate || creating}
        >
          <span>{creating ? 'Creating…' : 'Create bill'}</span>
          <span className="num">{money(total)}</span>
        </button>
      </div>
      {toast}

      <ItemSheet
        open={editing !== null}
        item={editingItem}
        currency={draft.currency}
        onClose={() => setEditing(null)}
        onSave={(saved) => {
          update({
            items: editingItem
              ? draft.items.map((i) => (i.key === editingItem.key ? { ...i, ...saved } : i))
              : [...draft.items, withKey(saved)],
          });
          setEditing(null);
        }}
        onDelete={() => {
          update({ items: draft.items.filter((i) => i.key !== editingItem.key) });
          setEditing(null);
        }}
      />
      <ExtrasSheet open={extrasOpen} draft={draft} onClose={() => setExtrasOpen(false)} onSave={(changes) => { update(changes); setExtrasOpen(false); }} />
      <Sheet open={viewing !== null} onClose={() => setViewing(null)} title={`Photo ${(viewing ?? 0) + 1} of ${photos.length}`}>
        {viewing !== null && <img className="photo-full" src={photos[viewing]?.url} alt={`Receipt photo ${viewing + 1}`} />}
      </Sheet>
    </div>
  );
}

function PhotoStep({ photos, reading, preparing, error, onAdd, onRemove, onRead, onBack, toast }) {
  const inputId = useId();
  return (
    <div className="screen newbill">
      <header className="top on-night">
        <div className="top__bar">
          <button type="button" className="pill pill--night pill--icon" onClick={onBack} aria-label="Back" disabled={reading}>
            <Icon name="chevronLeft" />
          </button>
          <p className="wordmark">
            spl<span>IT</span>
          </p>
          <span className="newbill__spacer" />
        </div>
        <div className="newbill__heading">
          <h1 className="newbill__title">{reading ? 'Reading the receipt…' : 'Photograph the receipt'}</h1>
          <p className="newbill__lede">
            {reading
              ? 'This takes a few seconds. You can fix anything on the next screen.'
              : 'Lay it flat in good light. Long receipt? Take one photo per part, top to bottom.'}
          </p>
        </div>
      </header>

      <main className="surface on-day">
        <ol className={`photo-grid${reading ? ' is-reading' : ''}`} aria-label="Photos, in order">
          {photos.map((photo, i) => (
            <li key={photo.id} className="photo-tile">
              <img src={photo.url} alt={`Receipt photo ${i + 1}`} />
              <span className="photo-tile__n num" aria-hidden="true">
                {i + 1}
              </span>
              {!reading && (
                <button type="button" className="photo-tile__remove" onClick={() => onRemove(photo.id)} aria-label={`Remove photo ${i + 1}`}>
                  <Icon name="close" size={16} />
                </button>
              )}
              {reading && <span className="photo-tile__scan" aria-hidden="true" />}
            </li>
          ))}
          {!reading && photos.length < MAX_PHOTOS && (
            <li>
              <label htmlFor={inputId} className={`photo-add${photos.length === 0 ? ' is-first' : ''}`} aria-busy={preparing}>
                <input
                  id={inputId}
                  type="file"
                  accept="image/*"
                  multiple
                  className="visually-hidden"
                  onChange={(e) => {
                    onAdd(e.target.files);
                    e.target.value = '';
                  }}
                />
                <span className="photo-add__icon" aria-hidden="true">
                  <Icon name="plus" size={22} />
                </span>
                <span className="photo-add__title">
                  {preparing ? 'Adding…' : photos.length === 0 ? 'Take or choose a photo' : 'Add the next part'}
                </span>
              </label>
            </li>
          )}
        </ol>
        {error && (
          <p className="form-error newbill__error" role="alert">
            {error}
          </p>
        )}
      </main>

      <div className="dock on-day">
        <button type="button" className="pill pill--primary pill--block" onClick={onRead} disabled={photos.length === 0 || reading || preparing}>
          {reading ? 'Reading…' : photos.length > 1 ? `Read receipt (${photos.length} photos)` : 'Read receipt'}
        </button>
        <p className="dock__hint">Up to {MAX_PHOTOS} photos. Nothing is shared until you create the bill.</p>
      </div>
      {toast}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', ...rest }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <input id={id} className="field-input" type={type} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </div>
  );
}

function MoneyField({ label, currency, value, onChange, invalid }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <div className="money-input">
        <span aria-hidden="true">{currency === 'USD' ? '$' : 'LBP'}</span>
        <input
          id={id}
          className="num"
          inputMode={currency === 'USD' ? 'decimal' : 'numeric'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
        />
      </div>
    </div>
  );
}

function ItemSheet({ open, item, currency, onClose, onSave, onDelete }) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState('');
  const [wasOpen, setWasOpen] = useState(false);
  const nameId = useId();

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(item?.name ?? '');
      setQuantity(item?.quantity ?? 1);
      setPrice(item ? plainAmount(item.price, currency) : '');
    }
  }

  const parsed = parseMoney(price, currency);
  const valid = name.trim() && parsed !== null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={item ? 'Edit item' : 'Add a missed item'}
      footer={
        <>
          <button type="button" className="pill pill--primary pill--block" disabled={!valid} onClick={() => onSave({ name: name.trim(), quantity, price: parsed })}>
            {item ? 'Save item' : 'Add item'}
            {valid && <span className="num"> · {formatMoney(parsed * quantity, currency)}</span>}
          </button>
          {item && (
            <button type="button" className="pill pill--day pill--block danger-text" onClick={onDelete}>
              Remove item
            </button>
          )}
        </>
      }
    >
      <div className="sheet-form">
        <div className="field">
          <label htmlFor={nameId} className="field__label">
            Name
          </label>
          <input id={nameId} className="field-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </div>
        <div className="review-row">
          <div className="field">
            <span className="field__label">Quantity</span>
            <Stepper value={quantity} min={1} max={999} label="quantity" onChange={(q) => setQuantity(Math.max(1, q))} />
          </div>
          <MoneyField label="Price each" currency={currency} value={price} onChange={setPrice} invalid={price !== '' && parsed === null} />
        </div>
      </div>
    </Sheet>
  );
}

function ExtrasSheet({ open, draft, onClose, onSave }) {
  const [tax, setTax] = useState('');
  const [rate, setRate] = useState('');
  const [included, setIncluded] = useState(false);
  const [service, setService] = useState('');
  const [wasOpen, setWasOpen] = useState(false);
  const rateId = useId();
  const includedId = useId();

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTax(plainAmount(draft.tax, draft.currency));
      setRate(draft.taxRate == null ? '' : String(draft.taxRate));
      setIncluded(draft.taxIncluded);
      setService(plainAmount(draft.service, draft.currency));
    }
  }

  const taxValue = tax.trim() === '' ? 0 : parseMoney(tax, draft.currency);
  const serviceValue = service.trim() === '' ? 0 : parseMoney(service, draft.currency);
  const rateValue = rate.trim() === '' ? null : Number(rate);
  const rateValid = rateValue === null || (Number.isFinite(rateValue) && rateValue >= 0 && rateValue <= 100);
  const valid = taxValue !== null && serviceValue !== null && rateValid;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Tax and service"
      description="As printed on the receipt."
      footer={
        <button
          type="button"
          className="pill pill--primary pill--block"
          disabled={!valid}
          onClick={() => onSave({ tax: taxValue, taxRate: rateValue, taxIncluded: included, service: serviceValue })}
        >
          Save
        </button>
      }
    >
      <div className="sheet-form">
        <div className="review-row">
          <MoneyField label="Tax" currency={draft.currency} value={tax} onChange={setTax} invalid={taxValue === null} />
          <div className="field">
            <label htmlFor={rateId} className="field__label">
              Rate (%)
            </label>
            <input id={rateId} className="field-input num" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={!rateValid} />
          </div>
        </div>
        <label htmlFor={includedId} className="switch-row">
          <span>
            <span className="switch-row__title">Tax included in prices</span>
            <span className="field__hint">Shown on the bill, not added again.</span>
          </span>
          <input id={includedId} type="checkbox" role="switch" className="switch" checked={included} onChange={(e) => setIncluded(e.target.checked)} />
        </label>
        <MoneyField label="Service" currency={draft.currency} value={service} onChange={setService} invalid={serviceValue === null} />
      </div>
    </Sheet>
  );
}
