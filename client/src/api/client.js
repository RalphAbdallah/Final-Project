// Every request to our API goes through apiFetch (Session 20): the base URL, the login
// token, JSON in and out, and errors. The `api` object below names each request.

// Empty in development: Vite forwards /api to the server (vite.config.js).
// In production it's the API's address (client/.env.production).
const API_URL = import.meta.env.VITE_API_URL || '';

// An Error with what the server said: err.status (0 = offline), err.code, err.data.
function apiError(status, code, data) {
  const err = new Error(code);
  err.status = status;
  err.code = code;
  err.data = data || {};
  return err;
}

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.guestToken) headers['X-Guest-Token'] = options.guestToken;

  let res;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw apiError(0, 'offline');
  }

  // The payer's token expired or the account is gone: log out (auth/AuthContext.jsx listens).
  if (res.status === 401 && token && path.startsWith('/me')) {
    window.dispatchEvent(new Event('auth:expired'));
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw apiError(res.status, data.error || 'request_failed', data);
  return data;
}

/*
 * Screens open on the last copy they saw, then refresh behind it, so coming back to a
 * screen is instant. The copies live in localStorage (Session 8): the payer's under
 * "splIT.payer.", cleared at log out; a guest's bill under "splIT.guest.".
 */
function cached(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // unreadable, or storage blocked
  }
}

function keep(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // full or blocked: the screen still works, it just won't open instantly next time
  }
  return value;
}

export const cachedProfile = () => cached('splIT.payer.profile');
export const cachedBill = (id) => cached(`splIT.payer.bill.${id}`);
export const cachedGuestBill = (share) => cached(`splIT.guest.bill.${share}`);

// At log out (or when another account logs in): none of this payer's data stays.
export function clearPayerCache() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      if (localStorage.key(i).startsWith('splIT.payer.')) keys.push(localStorage.key(i));
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // blocked: nothing stored
  }
}

const rememberProfile = (profile) => keep('splIT.payer.profile', profile);
const rememberBill = (id) => (view) => keep(`splIT.payer.bill.${id}`, view);
const rememberGuest = (share) => (view) => keep(`splIT.guest.bill.${share}`, view);

// Ids and tokens go into URLs safely encoded.
const at = encodeURIComponent;

// "data:image/jpeg;base64,AAAA" -> { type: 'image/jpeg', data: 'AAAA' }
function photoBody(dataUrl) {
  const [head, data] = dataUrl.split(',');
  return { type: head.slice(5, head.indexOf(';')), data };
}

export const api = {
  // Log in and sign up (no token yet)
  signup: (name, email, password) => apiFetch('/auth/signup', { method: 'POST', body: { name, email, password } }),
  login: (email, password) => apiFetch('/auth/login', { method: 'POST', body: { email, password } }),

  // Guest: every answer is the whole bill view, kept for an instant reopen.
  bill: (share, guestToken) => apiFetch(`/share/${at(share)}`, { guestToken }).then(rememberGuest(share)),
  join: (share, name) =>
    apiFetch(`/share/${at(share)}/join`, { method: 'POST', body: { name } }).then(rememberGuest(share)),
  setClaim: (share, guestToken, itemId, units) =>
    apiFetch(`/share/${at(share)}/claims/${at(itemId)}`, { method: 'PUT', body: { units }, guestToken }).then(
      rememberGuest(share),
    ),
  removeClaim: (share, guestToken, itemId) =>
    apiFetch(`/share/${at(share)}/claims/${at(itemId)}`, { method: 'DELETE', guestToken }).then(rememberGuest(share)),
  updateMe: (share, guestToken, changes) =>
    apiFetch(`/share/${at(share)}/me`, { method: 'PATCH', body: changes, guestToken }).then(rememberGuest(share)),

  // The payer's account
  profile: () => apiFetch('/me').then(rememberProfile),
  rename: (name) => apiFetch('/me', { method: 'PATCH', body: { name } }).then(rememberProfile),
  changeEmail: (email) => apiFetch('/me', { method: 'PATCH', body: { email } }).then(rememberProfile),
  changePassword: (currentPassword, newPassword) =>
    apiFetch('/me/password', { method: 'PATCH', body: { currentPassword, newPassword } }),
  deleteAccount: () => apiFetch('/me', { method: 'DELETE' }),
  savePayout: (wallet, payUrl) =>
    apiFetch(`/me/payouts/${at(wallet)}`, { method: 'PUT', body: { payUrl } }).then(rememberProfile),
  removePayout: (wallet) => apiFetch(`/me/payouts/${at(wallet)}`, { method: 'DELETE' }).then(rememberProfile),

  // Photos (data URLs, in order) in; { draft, photos } out.
  readReceipt: (dataUrls) =>
    apiFetch('/me/receipts/read', { method: 'POST', body: { photos: dataUrls.map(photoBody) } }),
  createBill: (draft) => apiFetch('/me/bills', { method: 'POST', body: draft }),

  // The payer's bill screen: each answer is the whole bill again, kept for the next open.
  payerBill: (id) => apiFetch(`/me/bills/${at(id)}`).then(rememberBill(id)),
  billPhotos: (id) => apiFetch(`/me/bills/${at(id)}/photos`),
  updateBill: (id, changes) => apiFetch(`/me/bills/${at(id)}`, { method: 'PATCH', body: changes }).then(rememberBill(id)),
  async deleteBill(id) {
    await apiFetch(`/me/bills/${at(id)}`, { method: 'DELETE' });
    localStorage.removeItem(`splIT.payer.bill.${id}`);
    // Off the dashboard at once, not after home's refresh.
    const profile = cachedProfile();
    if (profile) rememberProfile({ ...profile, bills: profile.bills.filter((b) => b.id !== id) });
  },
  setMemberStatus: (id, memberId, status) =>
    apiFetch(`/me/bills/${at(id)}/members/${at(memberId)}`, { method: 'PATCH', body: { status } }).then(rememberBill(id)),
  removeMember: (id, memberId) =>
    apiFetch(`/me/bills/${at(id)}/members/${at(memberId)}`, { method: 'DELETE' }).then(rememberBill(id)),
  setPayerClaim: (id, itemId, units) =>
    apiFetch(`/me/bills/${at(id)}/claims/${at(itemId)}`, { method: 'PUT', body: { units } }).then(rememberBill(id)),
  removePayerClaim: (id, itemId) =>
    apiFetch(`/me/bills/${at(id)}/claims/${at(itemId)}`, { method: 'DELETE' }).then(rememberBill(id)),
  setPayerTip: (id, tip) => apiFetch(`/me/bills/${at(id)}/tip`, { method: 'PUT', body: { tip } }).then(rememberBill(id)),
  setCardPaid: (id, paid) =>
    apiFetch(`/me/bills/${at(id)}/card-paid`, { method: 'PUT', body: { paid } }).then(rememberBill(id)),
};

// The browser remembers each guest per bill (PRD M5): one guest token per share link.
const guestKey = (share) => `splIT.guest.token.${share}`;

export const guestTokens = {
  get(share) {
    try {
      return localStorage.getItem(guestKey(share));
    } catch {
      return null;
    }
  },
  set(share, token) {
    try {
      localStorage.setItem(guestKey(share), token);
    } catch {
      // private mode: they stay joined until the tab closes
    }
  },
  clear(share) {
    try {
      localStorage.removeItem(guestKey(share));
    } catch {
      // nothing stored
    }
  },
};
