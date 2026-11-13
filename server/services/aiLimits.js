import { AiUsage } from '../models/AiUsage.js';

/**
 * Limits on reading receipts with the AI, so one account (or many fake ones) can't
 * drain the OpenAI credit. Counted from the AiUsage collection, so they hold across
 * restarts. Each can be changed in .env; AI_LIMITS=off turns them off (local use only).
 * One receipt photo costs about 1,500 to 4,000 tokens.
 */
export function aiLimitsFromEnv(env = process.env) {
  if (String(env.AI_LIMITS).toLowerCase() === 'off') return null;
  const num = (key, fallback) => (Number(env[key]) > 0 ? Number(env[key]) : fallback);
  return {
    readsPerHour: num('AI_READS_PER_HOUR', 3),
    readsPerDay: num('AI_READS_PER_DAY', 10),
    userTokensPerDay: num('AI_USER_TOKENS_PER_DAY', 150000),
    // Everyone together: the backstop against many sign-ups.
    globalTokensPerDay: num('AI_GLOBAL_TOKENS_PER_DAY', 250000),
  };
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Reads (and tokens) since a time, for one payer, or everyone when userId is null.
async function usageSince(userId, since) {
  const filter = { createdAt: { $gte: since } };
  if (userId) filter.userId = userId;
  const rows = await AiUsage.find(filter);
  return {
    reads: rows.length,
    tokens: rows.reduce((sum, row) => sum + row.totalTokens, 0),
    oldest: rows.length ? Math.min(...rows.map((row) => row.createdAt.getTime())) : null,
  };
}

// Seconds until the oldest counted read leaves the window (at least a minute).
function secondsUntil(oldest, windowMs, now) {
  return Math.max(60, Math.ceil((oldest + windowMs - now) / 1000));
}

// null when the payer may read a receipt now, or { error, retryAfter } (seconds).
export async function checkAiLimits(userId, limits) {
  if (!limits) return null;
  const now = Date.now();
  const hour = await usageSince(userId, new Date(now - HOUR));
  const day = await usageSince(userId, new Date(now - DAY));
  const everyone = await usageSince(null, new Date(now - DAY));

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

// Records one read and its tokens (failed reads count too: they still cost).
export async function recordAiUsage(userId, photos, usage, ms, ok) {
  await AiUsage.create({ userId, photos, totalTokens: usage ? usage.total : 0, ms, ok });
}
