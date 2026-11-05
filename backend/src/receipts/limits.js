/**
 * Limits on reading receipts with the AI, so one account (or many fake ones)
 * can't drain the OpenAI credit. Counted from the ai_usage table, so they hold
 * across restarts. Each can be changed in backend/.env.
 *
 * Measured 2026-11-03: one receipt photo costs about 1,500 to 4,000 tokens.
 */
export function aiLimitsFromEnv(env = process.env) {
  // AI_LIMITS=off turns every limit off (meant for local development only).
  if (String(env.AI_LIMITS).toLowerCase() === 'off') return null;
  const num = (key, fallback) => (Number(env[key]) > 0 ? Number(env[key]) : fallback);
  return {
    // Lowered 2026-11-05 (team): 3 an hour, 10 a day, 250k tokens a day for everyone.
    readsPerHour: num('AI_READS_PER_HOUR', 3),
    readsPerDay: num('AI_READS_PER_DAY', 10),
    userTokensPerDay: num('AI_USER_TOKENS_PER_DAY', 150_000),
    // Everyone together: the backstop against many sign-ups.
    globalTokensPerDay: num('AI_GLOBAL_TOKENS_PER_DAY', 250_000),
  };
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Seconds until the oldest counted read leaves a rolling window. */
const secondsUntil = (oldest, windowMs, now) => Math.max(60, Math.ceil((new Date(oldest).getTime() + windowMs - now) / 1000));

/**
 * Returns null when the payer may read a receipt now, or `{ error, retryAfter }`
 * (seconds) when a limit is reached.
 */
export async function checkAiLimits(repo, userId, limits, now = Date.now()) {
  if (!limits) return null; // limits turned off
  const [hour, day, everyone] = await Promise.all([
    repo.aiUsageSince({ userId, since: new Date(now - HOUR) }),
    repo.aiUsageSince({ userId, since: new Date(now - DAY) }),
    repo.aiUsageSince({ since: new Date(now - DAY) }),
  ]);

  if (everyone.tokens >= limits.globalTokensPerDay) {
    return { error: 'ai_busy', retryAfter: secondsUntil(everyone.oldest, DAY, now) };
  }
  if (day.reads >= limits.readsPerDay || day.tokens >= limits.userTokensPerDay) {
    return { error: 'ai_daily_limit', retryAfter: secondsUntil(day.oldest, DAY, now) };
  }
  if (hour.reads >= limits.readsPerHour) {
    return { error: 'ai_hourly_limit', retryAfter: secondsUntil(hour.oldest, HOUR, now) };
  }
  return null;
}
