// Checks that DATABASE_URL in .env reaches the Supabase database. Run: npm run db:check
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is empty. Fill it in backend/.env (see .env.example).');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  const { rows } = await client.query('select current_database() as db, version() as version');
  const tables = await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
  );
  console.log(`Connected to "${rows[0].db}" (${rows[0].version.split(',')[0]})`);
  console.log(`Tables: ${tables.rows.map((t) => t.table_name).join(', ') || 'none yet'}`);
} catch (err) {
  // Never print the connection string: it contains the password.
  console.error(`Could not connect: ${err.code ?? ''} ${err.message.replace(/postgres(ql)?:\/\/\S+/g, '<url>')}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
