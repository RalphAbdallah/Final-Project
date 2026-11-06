/*
 * The bill being made on /bills/new, kept across a reload: the photos, and the review
 * (read draft, the payer's fixes, which screen). IndexedDB, because the photos are
 * Blobs: too big for localStorage. Two records, so typing a fix doesn't rewrite the
 * photos. Cleared on create, cancel and sign-in/out. Every call fails quietly (private
 * browsing can block IndexedDB): the screen then works as before, minus the reload.
 */
const STORE = 'newBill';

let opening = null;
function db() {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('splIT', 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opening;
}

async function run(mode, action) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
  });
}

/** `{ photos, review }`, each undefined when nothing was saved. */
export async function loadNewBill() {
  try {
    const [photos, review] = await Promise.all(['photos', 'review'].map((part) => run('readonly', (store) => store.get(part))));
    return { photos, review };
  } catch {
    return {};
  }
}

export const saveNewBill = (part, value) => run('readwrite', (store) => store.put(value, part)).catch(() => {});
export const clearNewBill = () => run('readwrite', (store) => store.clear()).catch(() => {});
