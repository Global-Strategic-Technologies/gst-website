/**
 * Radar snapshot reader — local-only, never makes Inoreader API calls.
 *
 * Reads from the cache produced by `npm run radar:seed`
 * (tests/e2e/fixtures/seed-radar-cache.ts). The cache directory lives at
 * `<repo>/.cache/inoreader/` and stores SHA256-keyed JSON files matching
 * the format in `src/lib/inoreader/cache.ts` (v0.1.0):
 *
 *   <repo>/.cache/inoreader/<sha256(fn,args)>.json
 *   { "timestamp": <ms>, "data": <InoreaderStreamResponse> }
 *
 * IMPORTANT — Inoreader budget protection: this module MUST NOT import
 * `src/lib/inoreader/client` (which makes live API calls). The ESLint
 * `no-restricted-imports` override on `mcp-server/src/**` enforces this.
 * We replicate the minimal cache-key + JSON-read logic locally rather
 * than reusing the website's `cache.ts` to keep the dependency surface
 * small (no Sentry import) and the budget-protection invariant explicit.
 *
 * FYI freshness gate is INTENTIONALLY NOT applied here. The live path
 * (`radar-live-store.ts` `readFyiLive`) runs `filterFreshFyi` to age curated
 * items out after 30 days. This offline reader deliberately does NOT — the
 * seeded snapshot uses static fixture timestamps for deterministic, budget-
 * free CI/dev, and age-filtering would make `search_radar_offline` and the
 * embedded brief spontaneously empty once a committed fixture ages past the
 * cutoff. The offline tier is a stand-in, not the source of truth; retention
 * is enforced Worker-side only. See RADAR.md § FYI Content Retention.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import type { InoreaderStreamResponse } from '../../../src/lib/inoreader/types';
import {
  RADAR_CATEGORIES,
  toSnapshotItem,
  type RadarCategory,
  type SnapshotItem,
  type SnapshotTier,
} from './radar-transform';

// Re-export from radar-transform so callers that previously imported from
// here continue to work. The actual definitions moved to radar-transform.ts
// (BL-032 Phase 4c) so the Worker code path can share the transform logic
// without pulling node:fs / node:crypto into the Worker bundle.
export { RADAR_CATEGORIES };
export type { RadarCategory, SnapshotItem, SnapshotTier };

/**
 * Resolve the repo's `.cache/inoreader/` directory from the bundled binary's
 * location. esbuild preserves `import.meta.url` so the path resolution works
 * at runtime regardless of the spawning process's `cwd`.
 *
 * Bundled location: <repo>/mcp-server/dist/index.js
 * Cache location:   <repo>/.cache/inoreader/
 *
 * For tests (running un-bundled from `mcp-server/src/...`), the relative
 * path from the source file resolves identically: <repo>/mcp-server/src/content/
 * → ../../../.cache/inoreader/.
 */
function resolveCacheDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // Try bundled-binary location first (dist/), then source location.
  const candidates = [
    resolve(here, '../../.cache/inoreader'), // from dist/
    resolve(here, '../../../.cache/inoreader'), // from src/content/
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  // Fall back to first candidate so error messages name a real expected path.
  return candidates[0];
}

function buildCacheKey(fn: string, ...args: unknown[]): string {
  const raw = JSON.stringify({ fn, args });
  return createHash('sha256').update(raw).digest('hex');
}

// `categorizeItem`, `toIsoDate`, `toSnapshotItem` extracted to
// `./radar-transform.ts` (BL-032 Phase 4c) so the Worker code path can
// share them. Imported above; used below in the snapshot-building helpers.

function readCacheFile(key: string): {
  entry: { timestamp: number; data: unknown } | null;
  lastModified: string | null;
} {
  const cacheDir = resolveCacheDir();
  const filePath = resolve(cacheDir, `${key}.json`);
  if (!existsSync(filePath)) return { entry: null, lastModified: null };
  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as { timestamp: number; data: unknown };
    const stat = statSync(filePath);
    return { entry: parsed, lastModified: stat.mtime.toISOString() };
  } catch {
    return { entry: null, lastModified: null };
  }
}

function readTier(tier: 'fyi' | 'wire', key: string): SnapshotTier | null {
  const { entry, lastModified } = readCacheFile(key);
  if (!entry) return null;
  const data = entry.data as InoreaderStreamResponse;
  if (!data || !Array.isArray(data.items)) return null;
  return {
    tier,
    items: data.items.map((item) => toSnapshotItem(item, tier)),
    lastSeededAt: lastModified ?? new Date(entry.timestamp).toISOString(),
  };
}

/** Read the FYI (annotated) tier from the seeded snapshot, or null if missing. */
export function readFyiSnapshot(): SnapshotTier | null {
  return readTier('fyi', buildCacheKey('fetchAnnotatedItems', 30));
}

/** Read the Wire (all-streams merged) tier from the seeded snapshot, or null if missing. */
export function readWireSnapshot(): SnapshotTier | null {
  return readTier('wire', buildCacheKey('fetchAllStreams', 'GST-', 15));
}

/** Filter Wire items to a single category. Returns an empty array if the snapshot is missing. */
export function readWireSnapshotByCategory(category: RadarCategory): SnapshotTier | null {
  const wire = readWireSnapshot();
  if (!wire) return null;
  return {
    tier: 'wire',
    items: wire.items.filter((item) => item.category === category),
    lastSeededAt: wire.lastSeededAt,
  };
}

export const SNAPSHOT_MISSING_MESSAGE =
  'Radar snapshot not found. Run `npm run radar:seed` from the gst-website repo root to populate the local cache.';
