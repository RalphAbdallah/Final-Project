import { createClient } from '@supabase/supabase-js';
import { createApp } from './app.js';
import { supabaseVerifier } from './auth.js';
import { openAiReceiptReader } from './receipts/openai.js';
import { createPool, createPostgresRepo } from './repo/postgres.js';
import { supabaseStorage } from './storage.js';

const missing = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing ${missing.join(', ')} in backend/.env (see .env.example).`);
  process.exit(1);
}
if (String(process.env.AI_LIMITS).toLowerCase() === 'off') {
  console.warn('AI_LIMITS=off: receipt-reading limits are disabled. Never set this on Render.');
}
if (!process.env.OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY is empty: reading receipt photos is off until you add it to backend/.env.');
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

/**
 * Receipt reader settings. Measured 2026-11-03 on Receipts/ (2 rounds each):
 * gpt-4.1-mini read all three exactly in 2-7 s, about twice as fast as gpt-5-mini
 * (5-13 s at low effort) for the same tokens. Reasoning effort is only sent to
 * reasoning models (gpt-5 family, o-series); others reject it.
 */
function readerOptions() {
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const reasons = /^(gpt-5|o\d)/.test(model);
  return {
    apiKey: process.env.OPENAI_API_KEY,
    model,
    reasoningEffort: reasons ? process.env.OPENAI_REASONING_EFFORT || 'low' : undefined,
    // Copying numbers must not vary between tries of the same photo: no randomness.
    // (Reasoning models don't accept temperature.)
    temperature: reasons ? undefined : 0,
  };
}
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const pool = createPool(process.env.DATABASE_URL);
const app = createApp({
  repo: createPostgresRepo(pool),
  verifyToken: supabaseVerifier({ url: SUPABASE_URL, serviceKey: SUPABASE_SERVICE_ROLE_KEY }),
  readReceipt: process.env.OPENAI_API_KEY ? openAiReceiptReader(readerOptions()) : null,
  storage: supabaseStorage(supabaseAdmin),
  async deleteAuthUser(userId) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(`Could not delete the login: ${error.message}`);
  },
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`splIT API on http://localhost:${port}`);
  // Open the database connection now (TLS to Supabase takes ~1-2 s), so the first
  // request after a start or a Render wake-up doesn't pay for it.
  pool.query('select 1').catch((err) => console.error('Database warm-up failed:', err.message));
});
