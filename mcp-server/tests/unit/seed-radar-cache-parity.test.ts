/**
 * `scripts/seed-radar-cache.mjs` writes the stdio FYI snapshot under the key
 * `readFyiSnapshot()` reads, `buildCacheKey('fetchAnnotatedItems', FYI_FETCH_COUNT)`.
 * The script is plain .mjs and cannot import the constant, so it hard-codes the
 * number. If the two drift, the stdio radar surfaces silently report the
 * snapshot as missing; this pins them together.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FYI_FETCH_COUNT } from '../../src/content/radar-transform';

describe('seed-radar-cache.mjs ↔ FYI_FETCH_COUNT', () => {
  it('seeds the FYI snapshot under the fetch count the reader keys on', () => {
    const script = readFileSync(
      fileURLToPath(new URL('../../scripts/seed-radar-cache.mjs', import.meta.url)),
      'utf-8'
    );
    const seeded = script.match(/buildCacheKey\('fetchAnnotatedItems',\s*(\d+)\)/);
    expect(seeded, 'the seed script must key the FYI entry with a literal count').not.toBeNull();
    expect(Number(seeded![1])).toBe(FYI_FETCH_COUNT);
  });
});
