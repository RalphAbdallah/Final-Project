import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * The guest page previews a claim on the phone with a copy of the split engine:
 * client/src/utils/split.js. The server's answer always replaces the preview, but both
 * must compute the same numbers, so the copy must stay identical.
 * After changing server/services/split.js, copy it over to the client.
 */
describe('client copy of the split engine', () => {
  it('is identical to services/split.js', () => {
    const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
    expect(read('../../client/src/utils/split.js')).toBe(read('../services/split.js'));
  });
});
