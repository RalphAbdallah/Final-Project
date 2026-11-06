import { describe, expect, it } from 'vitest';
import { createCounter, rateLimitsFromEnv } from './rateLimits.js';

describe('rate limit counter', () => {
  it('allows up to the limit in a window, then says how long to wait, then resets', () => {
    let now = 0;
    const take = createCounter({ limit: 2, windowMs: 10_000 }, () => now);
    expect(take('a')).toBeNull();
    expect(take('a')).toBeNull();
    expect(take('a')).toBe(10);
    expect(take('b')).toBeNull(); // other keys are counted apart
    now = 4_000;
    expect(take('a')).toBe(6);
    now = 10_000;
    expect(take('a')).toBeNull();
  });

  it('reads limits from .env, and RATE_LIMITS=off turns them off', () => {
    expect(rateLimitsFromEnv({}).joinPerBill.limit).toBe(20);
    expect(rateLimitsFromEnv({ RATE_JOIN_PER_BILL: '5' }).joinPerBill.limit).toBe(5);
    expect(rateLimitsFromEnv({ RATE_LIMITS: 'off' })).toBeNull();
  });
});