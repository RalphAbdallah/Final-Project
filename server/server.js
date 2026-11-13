import 'dotenv/config'; // first line: loads .env before anything reads it (Session 18)
import mongoose from 'mongoose';
import app from './app.js';

// Missing secret? Crash at startup, not later (Session 21).
for (const key of ['MONGODB_URI', 'JWT_SECRET']) {
  if (!process.env[key]) {
    console.error(`Missing ${key} in server/.env (see .env.example).`);
    process.exit(1);
  }
}
if (!process.env.OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY is empty: reading receipt photos is off until you add it to server/.env.');
}

const port = Number(process.env.PORT) || 3000;

// Connect first, then listen.
try {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('connected to MongoDB');
  app.listen(port, () => console.log(`splIT API on http://localhost:${port}`));
} catch (err) {
  console.error('DB connection failed:', err.message);
  process.exit(1);
}
