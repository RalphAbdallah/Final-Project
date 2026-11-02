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
if (!process.env.OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY is empty: reading receipt photos is off until you add it to backend/.env.');
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const app = createApp({
  repo: createPostgresRepo(createPool(process.env.DATABASE_URL)),
  verifyToken: supabaseVerifier({ url: SUPABASE_URL, serviceKey: SUPABASE_SERVICE_ROLE_KEY }),
  readReceipt: process.env.OPENAI_API_KEY
    ? openAiReceiptReader({ apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-5-mini' })
    : null,
  storage: supabaseStorage(supabaseAdmin),
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => console.log(`splIT API on http://localhost:${port}`));
