/**
 * Wallets a payer can receive money on (PRD M1). `hosts` lists the domains a
 * wallet's receive-money link may point to. `null` means not confirmed yet
 * (PRD Q19), so any https link is accepted and shown to the payer to check.
 */
export const WALLETS = {
  whish: { name: 'Whish', hosts: ['whish.money'] },
  omt: { name: 'OMT', hosts: ['omt.com.lb'] },
  neo: { name: 'Neo', hosts: null },
  suyool: { name: 'Suyool', hosts: null },
};

const MAX_LINK_LENGTH = 2048;

/** Validates the text read from a payer's QR code. Returns `{ url }` or `{ error, host? }`. */
export function checkPayUrl(wallet, raw) {
  const rules = WALLETS[wallet];
  if (!rules) return { error: 'unknown_wallet' };
  if (typeof raw !== 'string' || raw.length > MAX_LINK_LENGTH) return { error: 'not_a_link' };

  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return { error: 'not_a_link' };
  }
  if (url.protocol !== 'https:') return { error: 'not_a_link' };

  const host = url.hostname.toLowerCase();
  if (rules.hosts && !rules.hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
    return { error: 'wrong_wallet', host };
  }
  return { url: url.href };
}
