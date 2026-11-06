import { formatMoney } from '../lib/money.js';
import { joinNames } from '../lib/people.js';
import Avatars from './Avatars.jsx';
import Stepper from './Stepper.jsx';

/**
 * One person per unit: what I can have is what nobody else has claimed. Never below 0:
 * bills from before the rule can hold more claims than units ("3 of 2").
 */
export const myMax = (item) => Math.max(0, item.quantity - (item.claimedUnits - item.myUnits));

/**
 * An item to claim, for a guest or the payer (PRD M6): name, price, who claimed it,
 * and Claim, or my − count + once it's mine. Before a guest has joined (`joined`
 * false), Claim is a label for the name field (#join-name).
 */
export default function ItemRow({ item, currency, memberById, meId, joined = true, locked, onChange }) {
  const claimants = item.claims.map((c) => memberById.get(c.memberId)).filter(Boolean);
  const others = claimants.filter((m) => m.id !== meId);
  const mine = item.myUnits > 0;
  const taken = !mine && myMax(item) === 0;

  return (
    <li className={`item${mine ? ' is-mine' : ''}`}>
      <div className="item__main">
        <p className="item__name">{item.name}</p>
        <p className="item__meta">
          <span className="num">
            {formatMoney(item.price, currency)}
            {item.quantity > 1 ? ' each' : ''}
          </span>
          {/* Who has it, as avatars only (no "2 of 5 claimed"); the + stops at what's left */}
          {claimants.length > 0 && <Avatars people={claimants} />}
          {others.length > 0 && <span className="visually-hidden">by {joinNames(others.map((m) => m.name))}</span>}
        </p>
        {mine && <p className="item__mine num">You: {formatMoney(item.myShare, currency)}</p>}
      </div>
      <div className="item__side">
        {mine ? (
          <Stepper
            value={item.myUnits}
            max={myMax(item)}
            label={item.name}
            disabled={locked}
            onChange={(next) => onChange(item, next)}
          />
        ) : taken ? (
          // Every unit has an owner: Claim stays in place, greyed out.
          <button type="button" className="pill pill--day pill--small" disabled aria-label={`${item.name}: all claimed`}>
            Claim
          </button>
        ) : joined ? (
          <button
            type="button"
            className="pill pill--day pill--small"
            onClick={() => onChange(item, 1)}
            disabled={locked}
            aria-label={`Claim ${item.name}`}
          >
            Claim
          </button>
        ) : (
          // Not joined yet: Claim is a label for the name field, so the tap itself puts
          // the cursor there and iPhone opens the keyboard (a focus from code may not).
          <label
            htmlFor="join-name"
            className="pill pill--day pill--small"
            role="button"
            tabIndex={0}
            aria-label={`Claim ${item.name}`}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              document.getElementById('join-name')?.focus();
            }}
          >
            Claim
          </label>
        )}
      </div>
    </li>
  );
}
