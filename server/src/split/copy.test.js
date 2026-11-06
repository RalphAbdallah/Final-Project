import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * The guest page previews a claim on the phone (instant totals, PRD §11) with a copy of
 * this engine: frontend/src/lib/split.js. The server's answer always replaces the
 * preview, but the two must compute the same numbers, so the copy must stay identical.
 * After changing index.js, copy it over: cp backend/src/split/index.js frontend/src/lib/split.js
 */
describe('frontend copy of the split engine', () => {
  it('is identical to index.js', () => {
    const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    expect(read('../../../frontend/src/lib/split.js')).toBe(read('./index.js'));
  });
});
