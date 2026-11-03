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
 * The payer's profile (name, wallets, bills), remembered between screens so going
 * back to home shows instantly; screens still refresh it in the background.
 */
let profileCache = null;
export const cachedProfile = () => profileCache;
export function clearProfileCache() {
  profileCache = null;
}
const remember = (profile) => {
  profileCache = profile;
  return profile;
};

export const api = {
  bill: (share, guestToken) => request(`/share/${at(share)}`, { guestToken }),
  join: (share, name) => request(`/share/${at(share)}/join`, { method: 'POST', body: { name } }),
  setClaim: (share, guestToken, itemId, units) =>
    request(`/share/${at(share)}/claims/${at(itemId)}`, { method: 'PUT', body: { units }, guestToken }),
  removeClaim: (share, guestToken, itemId) =>
    request(`/share/${at(share)}/claims/${at(itemId)}`, { method: 'DELETE', guestToken }),
  updateMe: (share, guestToken, changes) =>
    request(`/share/${at(share)}/me`, { method: 'PATCH', body: changes, guestToken }),

  profile: () => request('/me', { payer: true }).then(remember),
  savePayout: (wallet, payUrl) =>
    request(`/me/payouts/${at(wallet)}`, { method: 'PUT', body: { payUrl }, payer: true }).then(remember),
  removePayout: (wallet) => request(`/me/payouts/${at(wallet)}`, { method: 'DELETE', payer: true }).then(remember),
  createSampleBill: () =>
    request('/me/sample-bill', { method: 'POST', payer: true }).finally(clearProfileCache),

  /** Photos (Blobs, in order) in; `{ draft, photos }` out. */
  readReceipt: (blobs) => {
    const form = new FormData();
    blobs.forEach((blob, i) => form.append('photos', blob, `receipt-${i + 1}.jpg`));
    return request('/me/receipts/read', { method: 'POST', form, payer: true });
  },
  // A new bill changes the bills list: drop the remembered profile so home refetches it.
  createBill: (draft) => request('/me/bills', { method: 'POST', body: draft, payer: true }).finally(clearProfileCache),
  payerBill: (id) => request(`/me/bills/${at(id)}`, { payer: true }),
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
