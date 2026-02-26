/**
 * Seeds the dev cache with mock Inoreader API responses for E2E tests.
 *
 * Uses the same buildCacheKey / setCachedResponse functions from the dev
 * cache module, ensuring cache keys stay in sync with client.ts.
 *
 * Called from Playwright global setup (tests/e2e/global-setup.ts).
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createMockAnnotatedResponse, createMockAllStreamsResponse } from './radar-mock-data';

const CACHE_DIR = join(process.cwd(), '.cache', 'inoreader');

/**
 * Build a cache key matching src/lib/inoreader/cache.ts::buildCacheKey.
 * Duplicated here to avoid importing from src/ which may trigger Astro
 * module resolution issues in Playwright's Node.js context.
 */
function buildCacheKey(fn: string, ...args: unknown[]): string {
  const raw = JSON.stringify({ fn, args });
  return createHash('sha256').update(raw).digest('hex');
}

function writeCacheEntry(cacheKey: string, data: unknown): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  const entry = { timestamp: Date.now(), data };
  writeFileSync(
    join(CACHE_DIR, `${cacheKey}.json`),
    JSON.stringify(entry),
    'utf-8',
  );
}

/** Populate the dev cache with mock data for both FYI and Wire tiers. */
export function seedRadarCache(): void {
  // fetchAnnotatedItems(30) — FYI tier
  const annotatedKey = buildCacheKey('fetchAnnotatedItems', 30);
  writeCacheEntry(annotatedKey, createMockAnnotatedResponse());

  // fetchAllStreams('GST-', 15) — Wire tier (merged result)
  const allStreamsKey = buildCacheKey('fetchAllStreams', 'GST-', 15);
  writeCacheEntry(allStreamsKey, createMockAllStreamsResponse());

  console.log('[E2E Setup] Radar mock cache seeded');
}

/** Remove all seeded cache entries. */
export function clearRadarCache(): void {
  if (existsSync(CACHE_DIR)) {
    rmSync(CACHE_DIR, { recursive: true, force: true });
    console.log('[E2E Teardown] Radar mock cache cleared');
  }
}
