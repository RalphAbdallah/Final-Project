import express from 'express';
import cors from 'cors';
import { logger } from './middleware/logger.js';
import { requireAuth } from './middleware/requireAuth.js';
import authRouter from './routes/auth.js';
import meRouter from './routes/me.js';
import billsRouter from './routes/bills.js';
import receiptsRouter from './routes/receipts.js';
import shareRouter from './routes/share.js';

// The Express app: middleware and routes, no port and no database (Session 22).
// server.js connects to MongoDB and starts it; the tests use it directly.
const app = express();

// On Render, requests come through its proxy: trust one hop so req.ip is the phone's address.
if (process.env.RENDER) app.set('trust proxy', 1);

// Only our front end may call the API from a browser (Session 17, 20).
// CLIENT_ORIGIN can list several, separated by commas. Not set: any origin (local dev only).
const origins = process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : true;
app.use(cors({ origin: origins }));

if (process.env.NODE_ENV !== 'test') app.use(logger);

// Receipt photos arrive as text inside JSON, so that route gets a bigger size limit.
// Everything else stays small.
app.use('/api/me/receipts', express.json({ limit: '12mb' }));
app.use(express.json({ limit: '100kb' }));
// A request with no JSON body gets an empty one, so routes can always read req.body.
app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Public
app.use('/api/auth', authRouter);
app.use('/api/share', shareRouter);

// Locked: everything under /api/me needs a payer's token
app.use('/api/me', requireAuth);
app.use('/api/me/receipts', receiptsRouter);
app.use('/api/me/bills', billsRouter);
app.use('/api/me', meRouter);

// After all routes: nothing matched
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

// Errors: bad JSON is the client's fault (400); anything else is ours (500).
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'too_large' });
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

export default app;