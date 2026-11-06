import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in frontend/.env');
}

/** Used for payer sign-in only. All data goes through our Express API. */
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/**
 * Checks a password by signing in with it on a separate, throwaway client, so the app's
 * own session (and its sign-in events, which clear cached data) isn't touched. Supabase's
 * password change doesn't ask for the old one, so the profile checks it with this first.
 * Returns true, false (wrong password), or throws on a network or service error.
 */
export async function checkPassword(email, password) {
  const probe = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'splIT-password-check' },
  });
  const { error } = await probe.auth.signInWithPassword({ email, password });
  if (!error) {
    // End only this check's session; the app's own session stays signed in.
    await probe.auth.signOut({ scope: 'local' });
    return true;
  }
  if (error.status === 400 || /invalid login credentials/i.test(error.message)) return false;
  throw error;
}
