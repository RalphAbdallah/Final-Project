/**
 * Limits on joining a bill and claiming items (PRD §11), so nobody with a bill's link can
 * flood it with fake guests or hammer the claim buttons, and on logging in and signing up,
 * so nobody can guess a password by trying thousands. Past a limit: 429 with how many
 * seconds to wait.
 *
 * Counted in memory: the API runs as one process, and a restart only resets the counts.
 * Most limits are per bill or per guest, not per address, because a whole table is often
 * on the same restaurant Wi-Fi. Every number can be changed in .env; RATE_LIMITS=off
 * turns them all off (local use only).
 */
export function rateLimitsFromEnv(env = process.env) {
  if (String(env.RATE_LIMITS).toLowerCase() === 'off') return null;
  const num = (key, fallback) => (Number(env[key]) > 0 ? Number(env[key]) : fallback);
  const MINUTE = 60 * 1000;
  return {
    joinPerBill: { limit: num('RATE_JOIN_PER_BILL', 20), windowMs: 10 * MINUTE },
    joinPerAddress: { limit: num('RATE_JOIN_PER_ADDRESS', 30), windowMs: 10 * MINUTE },
    claimPerPerson: { limit: num('RATE_CLAIM_PER_PERSON', 60), windowMs: MINUTE },
    claimPerAddress: { limit: num('RATE_CLAIM_PER_ADDRESS', 300), windowMs: MINUTE },
    loginPerEmail: { limit: num('RATE_LOGIN_PER_EMAIL', 10), windowMs: 15 * MINUTE },
    authPerAddress: { limit: num('RATE_AUTH_PER_ADDRESS', 30), windowMs: 15 * MINUTE },
  };
}

/**
 * A counter per key (a bill, a person, an address) that resets every window.
 * take(key) returns null if allowed, or the seconds left to wait.
 */
export function createCounter({ limit, windowMs }, now = () => Date.now()) {
  const windows = new Map(); // key -> { count, resetAt }
  return function take(key) {
    const t = now();
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

// Middleware from [counter, req => key] pairs: the request passes only if every counter allows it.
function limitBy(checks) {
  return (req, res, next) => {
    for (const [take, keyOf] of checks) {
      const wait = take(keyOf(req));
      if (wait !== null) {
        res.set('Retry-After', String(wait));
        return res.status(429).json({ error: 'too_many_requests', retryAfter: wait });
      }
    }
    next();
  };
}

function createLimiters(limits) {
  if (!limits) {
    const pass = (req, res, next) => next();
    return { join: pass, claim: pass, payerClaim: pass, login: pass, signup: pass };
  }
  const joinPerBill = createCounter(limits.joinPerBill);
  const joinPerAddress = createCounter(limits.joinPerAddress);
  const claimPerPerson = createCounter(limits.claimPerPerson);
  const claimPerAddress = createCounter(limits.claimPerAddress);
  const loginPerEmail = createCounter(limits.loginPerEmail);
  const authPerAddress = createCounter(limits.authPerAddress);
  return {
    // Logging in: per email (one account can't be guessed at) and per address (one
    // computer can't try many accounts). Signing up shares the address limit.
    login: limitBy([
      [loginPerEmail, (req) => String(req.body.email).trim().toLowerCase()],
      [authPerAddress, (req) => req.ip],
    ]),
    signup: limitBy([[authPerAddress, (req) => req.ip]]),
    // Guests, after loadBill (routes/share.js) has found the bill and the member.
    join: limitBy([
      [joinPerBill, (req) => req.bill.id],
      [joinPerAddress, (req) => req.ip],
    ]),
    claim: limitBy([
      [claimPerPerson, (req) => `guest:${req.member.id}`],
      [claimPerAddress, (req) => req.ip],
    ]),
    // The payer's own claims, after requireAuth.
    payerClaim: limitBy([
      [claimPerPerson, (req) => `payer:${req.user.id}`],
      [claimPerAddress, (req) => req.ip],
    ]),
  };
}

// Made once when the server starts (after .env is loaded), shared by every route.
export const limit = createLimiters(rateLimitsFromEnv());
