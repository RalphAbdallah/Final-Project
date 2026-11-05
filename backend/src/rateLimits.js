/**
 * Rate limits on joining a bill and claiming items (PRD §11, P9.1), so nobody with a
 * bill's link can flood it with fake guests or hammer the claim endpoints.
 *
 * Counted in memory, per window: the API runs as one process on Render, and a restart
 * only resets the counts. Most limits are per bill or per guest, not per network
 * address, because a whole table is often on the same restaurant Wi-Fi. The per-address
 * limits are a generous backstop on top.
 *
 * Every number can be changed in backend/.env; RATE_LIMITS=off turns them all off.
 */
export function rateLimitsFromEnv(env = process.env) {
  if (String(env.RATE_LIMITS).toLowerCase() === 'off') return null;
  const num = (key, fallback) => (Number(env[key]) > 0 ? Number(env[key]) : fallback);
  const MIN = 60 * 1000;
  return {
    // Joining: a table doesn't add 20 people in 10 minutes.
    joinPerBill: { limit: num('RATE_JOIN_PER_BILL', 20), windowMs: 10 * MIN },
    joinPerAddress: { limit: num('RATE_JOIN_PER_ADDRESS', 30), windowMs: 10 * MIN },
    // Claiming: + and − taps come in bursts; one a second for a minute is plenty.
    claimPerPerson: { limit: num('RATE_CLAIM_PER_PERSON', 60), windowMs: MIN },
    claimPerAddress: { limit: num('RATE_CLAIM_PER_ADDRESS', 300), windowMs: MIN },
  };
}

/** A fixed-window counter: `take(key)` returns null if allowed, else seconds to wait. */
export function createCounter({ limit, windowMs }, now = () => Date.now()) {
  const windows = new Map(); // key → { count, resetAt }
  return function take(key) {
    const t = now();
    // Drop finished windows now and then, so the map can't grow without bound.
    if (windows.size > 10_000) {
      for (const [k, w] of windows) if (w.resetAt <= t) windows.delete(k);
    }
    let w = windows.get(key);
    if (!w || w.resetAt <= t) {
      w = { count: 0, resetAt: t + windowMs };
      windows.set(key, w);
    }
    if (w.count >= limit) return Math.max(1, Math.ceil((w.resetAt - t) / 1000));
    w.count += 1;
    return null;
  };
}

/**
 * Express middleware from `[counter, req => key]` pairs. The request passes only if every
 * counter allows it; otherwise 429 `too_many_requests` with `retryAfter` (seconds) and a
 * Retry-After header. Pairs whose key is null are skipped.
 */
export function limitBy(...checks) {
  return (req, res, next) => {
    for (const [take, keyOf] of checks) {
      const key = keyOf(req);
      if (key == null) continue;
      const wait = take(key);
      if (wait != null) {
        res.set('Retry-After', String(wait));
        return res.status(429).json({ error: 'too_many_requests', retryAfter: wait });
      }
    }
    next();
  };
}

/**
 * The middleware: `join` and `claim` for guests (after the share token and guest token
 * are looked up), `payerClaim` for the payer's own claims. Pass-through when limits are off.
 */
export function createLimiters(limits, now) {
  if (!limits) {
    const pass = (req, res, next) => next();
    return { join: pass, claim: pass, payerClaim: pass };
  }
  const c = Object.fromEntries(Object.entries(limits).map(([name, rule]) => [name, createCounter(rule, now)]));
  return {
    join: limitBy([c.joinPerBill, (req) => req.bill.id], [c.joinPerAddress, (req) => req.ip]),
    claim: limitBy([c.claimPerPerson, (req) => `guest:${req.member.id}`], [c.claimPerAddress, (req) => req.ip]),
    payerClaim: limitBy([c.claimPerPerson, (req) => `payer:${req.user.id}`], [c.claimPerAddress, (req) => req.ip]),
  };
}
