import express from 'express';
import bcrypt from 'bcrypt';
import { User } from '../models/User.js';
import { signToken } from '../auth/token.js';
import { cleanText } from '../services/text.js';

// Sign up and log in (Session 19). Both end by handing back a token.
const authRouter = express.Router();

export function validEmail(email) {
  return typeof email === 'string' && email.length <= 254 && email.includes('@') && !email.includes(' ');
}

// What the client keeps about the logged-in payer. Never the hash.
export function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

// Signup: validate, hash, save, sign.
authRouter.post('/signup', async (req, res) => {
  const email = cleanText(req.body.email).toLowerCase();
  const password = req.body.password;
  if (!validEmail(email)) return res.status(400).json({ error: 'invalid_email' });
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'weak_password' });
  }
  if (await User.findOne({ email })) {
    return res.status(409).json({ error: 'email_taken' });
  }

  // No name typed? Use the start of the email until they set one.   ralphsaidabdallah@gmail.com
  const name = cleanText(req.body.name).slice(0, 60) || email.split('@')[0].slice(0, 60);
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ name, email, passwordHash });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

// Login: find, compare, sign. One message for both mistakes, so nobody learns which emails exist.
authRouter.post('/login', async (req, res) => {
  const email = cleanText(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const user = await User.findOne({ email });
  const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
  res.json({ token: signToken(user), user: publicUser(user) });
});

export default authRouter;
