// Creates the private "receipts" storage bucket if it doesn't exist. Run once: npm run storage:setup
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: existing } = await supabase.storage.getBucket('receipts');
if (existing) {
  console.log(`Bucket "receipts" already exists (public: ${existing.public}).`);
} else {
  const { error } = await supabase.storage.createBucket('receipts', {
    public: false,
    fileSizeLimit: '10MB',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  });
  if (error) {
    console.error(`Could not create the bucket: ${error.message}`);
    process.exitCode = 1;
  } else {
    console.log('Created private bucket "receipts".');
  }
}
