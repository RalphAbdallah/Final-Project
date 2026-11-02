import cors from 'cors';
import express from 'express';
import { meRoutes } from './routes/me.js';
import { shareRoutes } from './routes/share.js';

/**
 * @param {object} deps
 * @param {object} deps.repo  data access (repo/postgres.js, or repo/memory.js in tests)
 * @param {(token: string) => Promise<{id: string, email: string, name?: string} | null>} deps.verifyToken
 * @param {(images: {mime: string, base64: string}[]) => Promise<object>} [deps.readReceipt]  AI reader (receipts/openai.js)
 * @param {{ upload: Function }} deps.storage  receipt photo storage (storage.js)
 */
export function createApp({ repo, verifyToken, readReceipt, storage }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : true }));
  // Reviewed bills can carry up to 200 items; photos arrive as multipart and skip this.
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/share', shareRoutes(repo));
  app.use('/api/me', meRoutes({ repo, verifyToken, readReceipt, storage }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
    if (err.name === 'MulterError') {
      return res.status(413).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'photo_too_large' : 'too_many_photos' });
    }
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  });
  return app;
}
