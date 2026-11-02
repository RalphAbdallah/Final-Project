import { createClient } from '@supabase/supabase-js';

/**
 * Turns a Supabase access token into `{ id, email, name }`, or null if it's
 * invalid or expired. `getClaims` verifies the token's signature locally when
 * the project uses asymmetric signing keys, and asks Supabase otherwise.
 */
export function supabaseVerifier({ url, serviceKey }) {
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return async (token) => {
    const { data, error } = await supabase.auth.getClaims(token);
    const claims = data?.claims;
    if (error || !claims?.sub) return null;
    return { id: claims.sub, email: claims.email, name: claims.user_metadata?.name };
  };
}

/**
 * Payer routes (PRD M1): requires `Authorization: Bearer <access token>`.
 * Creates the payer's `users` row the first time they call the API.
 */
export function requirePayer({ verifyToken, repo }) {
  return async (req, res, next) => {
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) return res.status(401).json({ error: 'auth_required' });

    const identity = await verifyToken(token);
    if (!identity) return res.status(401).json({ error: 'invalid_token' });

    req.user =
      (await repo.getUser(identity.id)) ??
      (await repo.createUser({
        id: identity.id,
        email: identity.email,
        name: (identity.name || identity.email?.split('@')[0] || 'Payer').trim().slice(0, 60),
      }));
    next();
  };
}
