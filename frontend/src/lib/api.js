const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api`;

export class ApiError extends Error {
  constructor(status, code, data = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

/**
 * Payer pages register where the access token comes from (lib/auth.jsx), so
 * guest pages never load the Supabase client.
 */
let tokenSource = async () => null;
export function setTokenSource(source) {
  tokenSource = source;
}

async function request(path, { method = 'GET', body, form, guestToken, payer = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (guestToken) headers['X-Guest-Token'] = guestToken;
  if (payer) {
    const token = await tokenSource();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      // FormData sets its own multipart Content-Type.
      body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
  } catch {
    throw new ApiError(0, 'offline');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'request_failed', data);
  return data;
}

const at = encodeURIComponent;

/*
 * What screens load, remembered so they open on what was last seen and refresh behind
 * it (stale-while-revalidate). Every answer from the server replaces the copy. The
 * payer's data lasts for the tab (sessionStorage, cleared on sign-out); a guest's bill
 * stays on the phone (localStorage), so reopening the link at the table is instant.
 * Storage can be blocked (private mode): then it's memory only, as before.
 */
const memory = new Map();
const PREFIX = 'splIT.cache.';
const storeFor = (key) => (key.startsWith('guest:') ? localStorage : sessionStorage);

export function cached(key) {
  if (memory.has(key)) return memory.get(key);
  try {
    const raw = storeFor(key).getItem(PREFIX + key);
    if (raw) {
      const value = JSON.parse(raw);
      memory.set(key, value);
      return value;
    }
  } catch {
    // Unreadable or blocked: nothing cached.
  }
  return null;
}

function keep(key, value) {
  memory.set(key, value);
  try {
    storeFor(key).setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Full or blocked: memory still has it.
  }
  return value;
}

/** Drops every cached entry whose key starts with `prefix`. */
function forget(prefix) {
  for (const key of [...memory.keys()]) if (key.startsWith(prefix)) memory.delete(key);
  try {
    for (const store of [sessionStorage, localStorage]) {
      const keys = [];
      for (let i = 0; i < store.length; i += 1) if (store.key(i).startsWith(PREFIX + prefix)) keys.push(store.key(i));
      keys.forEach((k) => store.removeItem(k));
    }
  } catch {
    // Blocked: nothing stored to drop.
  }
}

export const cachedProfile = () => cached('profile');
export const cachedBill = (id) => cached(`bill:${id}`);
export const cachedGuestBill = (share) => cached(`guest:${share}`);
/** On sign-out (or another account): none of this payer's data stays in the tab. */
export function clearPayerCache() {
  forget('profile');
  forget('bill:');
}
const remember = (profile) => keep('profile', profile);
const rememberBill = (id) => (view) => keep(`bill:${id}`, view);
const rememberGuest = (share) => (view) => keep(`guest:${share}`, view);

export const api = {
  // Guest: every answer is the whole bill view, kept for an instant reopen.
  bill: (share, guestToken) => request(`/share/${at(share)}`, { guestToken }).then(rememberGuest(share)),
  join: (share, name) =>
    request(`/share/${at(share)}/join`, { method: 'POST', body: { name } }).then(rememberGuest(share)),
  setClaim: (share, guestToken, itemId, units) =>
    request(`/share/${at(share)}/claims/${at(itemId)}`, { method: 'PUT', body: { units }, guestToken }).then(
      rememberGuest(share),
    ),
  removeClaim: (share, guestToken, itemId) =>
    request(`/share/${at(share)}/claims/${at(itemId)}`, { method: 'DELETE', guestToken }).then(rememberGuest(share)),
  updateMe: (share, guestToken, changes) =>
    request(`/share/${at(share)}/me`, { method: 'PATCH', body: changes, guestToken }).then(rememberGuest(share)),

  profile: () => request('/me', { payer: true }).then(remember),
  rename: (name) => request('/me', { method: 'PATCH', body: { name }, payer: true }).then(remember),
  deleteAccount: () => request('/me', { method: 'DELETE', payer: true }),
  savePayout: (wallet, payUrl) =>
    request(`/me/payouts/${at(wallet)}`, { method: 'PUT', body: { payUrl }, payer: true }).then(remember),
  removePayout: (wallet) => request(`/me/payouts/${at(wallet)}`, { method: 'DELETE', payer: true }).then(remember),

  /** Photos (Blobs, in order) in; `{ draft, photos }` out. */
  readReceipt: (blobs) => {
    const form = new FormData();
    blobs.forEach((blob, i) => form.append('photos', blob, `receipt-${i + 1}.jpg`));
    return request('/me/receipts/read', { method: 'POST', form, payer: true });
  },
  // Home refetches the profile whenever it opens, so it shows the new bill a moment later.
  createBill: (draft) => request('/me/bills', { method: 'POST', body: draft, payer: true }),
  payerBill: (id) => request(`/me/bills/${at(id)}`, { payer: true }).then(rememberBill(id)),

  // The payer's bill screen: each answer is the whole bill again, kept for the next open.
  updateBill: (id, changes) =>
    request(`/me/bills/${at(id)}`, { method: 'PATCH', body: changes, payer: true }).then(rememberBill(id)),
  async deleteBill(id) {
    await request(`/me/bills/${at(id)}`, { method: 'DELETE', payer: true });
    forget(`bill:${id}`);
    // Off the dashboard at once, not after home's refresh.
    const profile = cachedProfile();
    if (profile) remember({ ...profile, bills: profile.bills.filter((b) => b.id !== id) });
  },
  setMemberStatus: (id, memberId, status) =>
    request(`/me/bills/${at(id)}/members/${at(memberId)}`, { method: 'PATCH', body: { status }, payer: true }).then(
      rememberBill(id),
    ),
  removeMember: (id, memberId) =>
    request(`/me/bills/${at(id)}/members/${at(memberId)}`, { method: 'DELETE', payer: true }).then(rememberBill(id)),
  setPayerClaim: (id, itemId, units) =>
    request(`/me/bills/${at(id)}/claims/${at(itemId)}`, { method: 'PUT', body: { units }, payer: true }).then(
      rememberBill(id),
    ),
  removePayerClaim: (id, itemId) =>
    request(`/me/bills/${at(id)}/claims/${at(itemId)}`, { method: 'DELETE', payer: true }).then(rememberBill(id)),
  setPayerTip: (id, tip) =>
    request(`/me/bills/${at(id)}/tip`, { method: 'PUT', body: { tip }, payer: true }).then(rememberBill(id)),
  setCardPaid: (id, paid) =>
    request(`/me/bills/${at(id)}/card-paid`, { method: 'PUT', body: { paid }, payer: true }).then(rememberBill(id)),
};

/** The browser remembers each guest per bill (PRD M5). */
const key = (share) => `splIT.guest.${share}`;

export const guestTokens = {
  get(share) {
    try {
      return localStorage.getItem(key(share));
    } catch {
      return null;
    }
  },
  set(share, token) {
    try {
      localStorage.setItem(key(share), token);
    } catch {
      // Private mode: they stay joined until the tab closes.
    }
  },
  clear(share) {
    try {
      localStorage.removeItem(key(share));
    } catch {
      // Nothing stored.
    }
  },
};
