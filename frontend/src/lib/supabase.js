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
