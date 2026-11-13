import { verifyToken } from '../auth/token.js';
import { User } from '../models/User.js';

// No valid token, no entry (Session 19). Sets req.userId and req.user for every route after.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'auth_required' });
  }

  try {
    req.userId = verifyToken(token).sub;
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }

  // The account may have been deleted since the token was made.
  req.user = await User.findById(req.userId);
  if (!req.user) return res.status(401).json({ error: 'invalid_token' });
  next();
}
