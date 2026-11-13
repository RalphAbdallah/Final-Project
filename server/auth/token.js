import jwt from 'jsonwebtoken';

// Sign once at login, verify on every request (Session 19).
// The secret is read when used, so .env (or a test) has set it by then.

export function signToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// throws if tampered with or expired
export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}
