/**
 * Wallets a payer can receive money on (PRD M1).
 * The Whish steps come from the team. OMT, Neo and Suyool use generic steps
 * until the team sends the real ones (PRD Q19).
 */
export const WALLETS = {
  whish: {
    name: 'Whish',
    app: 'Whish Money',
    steps: ['Open the Whish app.', 'Tap Add.', 'Tap Whish Me.', 'Tap Share QR, then Save image.', 'Upload that image here.'],
  },
  omt: {
    name: 'OMT',
    app: 'OMT Pay',
    steps: ['Open the OMT Pay app.', 'Open your receive-money QR code.', 'Save it as an image.', 'Upload that image here.'],
  },
  neo: {
    name: 'Neo',
    app: 'Neo',
    steps: ['Open the Neo app.', 'Open your receive-money QR code.', 'Save it as an image.', 'Upload that image here.'],
  },
  suyool: {
    name: 'Suyool',
    app: 'Suyool',
    steps: ['Open the Suyool app.', 'Open your receive-money QR code.', 'Save it as an image.', 'Upload that image here.'],
  },
};

export const WALLET_ORDER = ['whish', 'omt', 'neo', 'suyool'];

export const walletName = (id) => (id === 'cash' ? 'Cash' : (WALLETS[id]?.name ?? id));

/** "Whish, OMT or cash" */
export function listWallets(ids) {
  const names = [...ids.map(walletName), 'cash'];
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`;
}

/** Short, readable form of a pay link: "whish.money/app/pay/ab12…" */
export function displayLink(url) {
  try {
    const { host, pathname } = new URL(url);
    const text = `${host}${pathname === '/' ? '' : pathname}`;
    return text.length > 34 ? `${text.slice(0, 33)}…` : text;
  } catch {
    return url;
  }
}
