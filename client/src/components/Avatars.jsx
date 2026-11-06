import { hueFor, initials } from '../lib/people.js';

/** Overlapping initials, with "+n" past `max`. Decorative: callers give the names in text. */
export default function Avatars({ people, max = 3 }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="avatars" aria-hidden="true">
      {shown.map((person) => (
        <span key={person.id} className="avatar" style={{ '--hue': hueFor(person.id) }}>
          {initials(person.name)}
        </span>
      ))}
      {extra > 0 && <span className="avatar avatar--more">+{extra}</span>}
    </span>
  );
}
