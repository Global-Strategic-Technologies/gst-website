/**
 * Seeds (or clears) the local stdio MCP server's offline Radar snapshot cache
 * at `<repo>/.cache/inoreader/` with deterministic mock fixture data.
 *
 * Invoked from the repo root as:
 *   npm run radar:seed      → write the two snapshot files
 *   npm run radar:unseed    → remove the cache directory
 *
 * Consumers of the seeded cache (all local-stdio only — the Worker path uses
 * its own Upstash cache and never reads this):
 *   - `search_radar_offline` tool (src/tools/radar-offline.ts)
 *   - `gst://radar/*` Resources on the stdio transport (src/resources/radar.ts)
 *   - the `gst_radar_brief_today` prompt's FYI embed (src/prompts/embed.ts)
 *
 * The data is MOCK fixture content (tests/fixtures/radar-mock-data.mjs — the
 * same single source of truth the unit suite asserts against). No live
 * Inoreader API calls are ever made; the shared 200 req/day budget is
 * untouched. `lastSeededAt` reported by the reader is this file-write's mtime.
 *
 * Format contract (must match src/content/radar-snapshot.ts, which reads
 * `{ timestamp, data }` JSON at SHA256-keyed paths): verified end-to-end by
 * tests/integration/radar-seed-roundtrip.test.ts — if the reader's key
 * formula or shape ever changes, that test fails, not a silent dev-time 404.
 *
 * No shebang, run as `node scripts/seed-radar-cache.mjs` (house style — see
 * extract-irl-markdown.mjs header for why).
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import {
  createMockAnnotatedResponse,
  createMockAllStreamsResponse,
} from '../tests/fixtures/radar-mock-data.mjs';

const here = dirname(fileURLToPath(import.meta.url));
// Location-derived (NOT process.cwd()): matches how the reader resolves the
// cache dir, so seeding works no matter where the command is run from.
const CACHE_DIR = resolve(here, '..', '..', '.cache', 'inoreader');

// Deliberately duplicated 5-line key formula (same precedent as
// tests/unit/radar-offline.test.ts): importing it from the TS reader would
// drag a TS loader into this plain-Node script. The round-trip integration
// test guards against drift.
function buildCacheKey(fn, ...args) {
  return createHash('sha256').update(JSON.stringify({ fn, args })).digest('hex');
}

function writeCacheEntry(cacheKey, data) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(
    join(CACHE_DIR, `${cacheKey}.json`),
    JSON.stringify({ timestamp: Date.now(), data }),
    'utf-8'
  );
}

if (process.argv.includes('--unseed')) {
  if (existsSync(CACHE_DIR)) {
    rmSync(CACHE_DIR, { recursive: true, force: true });
    console.log(`[radar:unseed] Cleared ${CACHE_DIR}`);
  } else {
    console.log(`[radar:unseed] Nothing to clear (${CACHE_DIR} does not exist)`);
  }
} else {
  const fyi = createMockAnnotatedResponse();
  const wire = createMockAllStreamsResponse();
  writeCacheEntry(buildCacheKey('fetchAnnotatedItems', 30), fyi);
  writeCacheEntry(buildCacheKey('fetchAllStreams', 'GST-', 15), wire);
  console.log(
    `[radar:seed] Seeded ${CACHE_DIR} (${fyi.items.length} FYI + ${wire.items.length} Wire mock items). ` +
      'Local stdio radar surfaces (search_radar_offline, gst://radar/*, gst_radar_brief_today) are now populated.'
  );
}
