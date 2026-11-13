/*
 * The bill being made on /bills/new, kept across a reload: the photos (data URLs) and
 * the review (read draft, the payer's fixes, which screen). Kept in localStorage
 * (Session 8), in two parts, so typing a fix doesn't rewrite the photos.
 * localStorage holds about 5 MB: if the photos don't fit, only the review is kept.
 * Cleared on create, cancel and log out.
 */
const KEY = 'splIT.newBill.';

// { photos, review }, each undefined when nothing was saved.
export function loadNewBill() {
  const read = (part) => {
    try {
      const raw = localStorage.getItem(KEY + part);
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  };
  return { photos: read('photos'), review: read('review') };
}

export function saveNewBill(part, value) {
  try {
    localStorage.setItem(KEY + part, JSON.stringify(value));
  } catch {
    // too big for localStorage (several photos) or blocked: keep going without it
    localStorage.removeItem(KEY + part);
  }
}

export function clearNewBill() {
  localStorage.removeItem(`${KEY}photos`);
  localStorage.removeItem(`${KEY}review`);
}
