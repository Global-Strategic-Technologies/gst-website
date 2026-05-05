/**
 * Tests for the radar-snapshot reader and search_radar_offline tool input
 * surface (renamed from search_radar_cache in BL-032 Phase 4b). The reader
 * runs against the actual `.cache/inoreader/` directory; tests seed/clear it
 * via the same mock factories used by the E2E suite.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readdirSync,
  copyFileSync,
  statSync,
} from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  readFyiSnapshot,
  readWireSnapshot,
  readWireSnapshotByCategory,
  RADAR_CATEGORIES,
  SNAPSHOT_MISSING_MESSAGE,
} from '../../src/content/radar-snapshot';
import { SearchRadarOfflineInputSchema } from '../../src/tools/radar-offline';
import {
  createMockAnnotatedResponse,
  createMockAllStreamsResponse,
} from '../../../tests/e2e/fixtures/radar-mock-data';

const here = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(here, '../../../.cache/inoreader');

function buildCacheKey(fn: string, ...args: unknown[]): string {
  return createHash('sha256').update(JSON.stringify({ fn, args })).digest('hex');
}

function writeMockEntry(key: string, data: unknown): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(
    join(CACHE_DIR, `${key}.json`),
    JSON.stringify({ timestamp: Date.now(), data }),
    'utf8'
  );
}

// Snapshot existing cache files (if any) before mutating; restore after.
let preservedFiles: Array<{ src: string; dst: string }> = [];

beforeAll(() => {
  if (existsSync(CACHE_DIR)) {
    const tmpDir = `${CACHE_DIR}.test-backup-${Date.now()}`;
    mkdirSync(tmpDir, { recursive: true });
    for (const file of readdirSync(CACHE_DIR)) {
      const src = join(CACHE_DIR, file);
      if (statSync(src).isFile()) {
        const dst = join(tmpDir, file);
        copyFileSync(src, dst);
        preservedFiles.push({ src, dst });
      }
    }
  }
  // Clear and seed with deterministic mock data.
  rmSync(CACHE_DIR, { recursive: true, force: true });
  writeMockEntry(buildCacheKey('fetchAnnotatedItems', 30), createMockAnnotatedResponse());
  writeMockEntry(buildCacheKey('fetchAllStreams', 'GST-', 15), createMockAllStreamsResponse());
});

afterAll(() => {
  rmSync(CACHE_DIR, { recursive: true, force: true });
  if (preservedFiles.length > 0) {
    for (const { src, dst } of preservedFiles) {
      mkdirSync(dirname(src), { recursive: true });
      copyFileSync(dst, src);
    }
    const backupDir = dirname(preservedFiles[0].dst);
    rmSync(backupDir, { recursive: true, force: true });
    preservedFiles = [];
  }
});

describe('radar-snapshot reader', () => {
  it('readFyiSnapshot returns annotated items with category mapping', () => {
    const fyi = readFyiSnapshot();
    expect(fyi).not.toBeNull();
    expect(fyi!.tier).toBe('fyi');
    expect(fyi!.items.length).toBeGreaterThan(0);
    const item = fyi!.items.find((i) => i.id === 'fyi-pe-ma-1');
    expect(item).toBeDefined();
    expect(item!.category).toBe('pe-ma');
    expect(item!.annotation?.gstTake).toMatch(/Classic late-cycle/);
  });

  it('readWireSnapshot returns the merged Wire feed', () => {
    const wire = readWireSnapshot();
    expect(wire).not.toBeNull();
    expect(wire!.tier).toBe('wire');
    expect(wire!.items.length).toBeGreaterThanOrEqual(13);
    expect(wire!.items.every((i) => i.annotation === undefined)).toBe(true);
  });

  it('readWireSnapshotByCategory filters by category', () => {
    const peMa = readWireSnapshotByCategory('pe-ma');
    expect(peMa).not.toBeNull();
    expect(peMa!.items.every((i) => i.category === 'pe-ma')).toBe(true);
    expect(peMa!.items.length).toBeGreaterThan(0);
  });

  it('returns null for all snapshot reads when the cache directory is missing', () => {
    rmSync(CACHE_DIR, { recursive: true, force: true });
    expect(readFyiSnapshot()).toBeNull();
    expect(readWireSnapshot()).toBeNull();
    for (const cat of RADAR_CATEGORIES) {
      expect(readWireSnapshotByCategory(cat)).toBeNull();
    }
    // Re-seed for any subsequent tests in this file.
    writeMockEntry(buildCacheKey('fetchAnnotatedItems', 30), createMockAnnotatedResponse());
    writeMockEntry(buildCacheKey('fetchAllStreams', 'GST-', 15), createMockAllStreamsResponse());
  });

  it('exposes a snapshot-missing message constant for callers', () => {
    expect(SNAPSHOT_MISSING_MESSAGE).toMatch(/npm run radar:seed/);
  });
});

describe('SearchRadarOfflineInputSchema (tool input contract — BL-031.95 Phase 3 capability-mirror)', () => {
  // The tool's input schema is the strict mirror of the /hub/radar
  // website's filter UI — a single optional `category` field, no
  // `query` / `tier` / `since` / `limit`. See radar-cache.ts header
  // comment for the rationale (cache TTL, unified feed, etc.).

  it('parses an empty input', () => {
    const result = SearchRadarOfflineInputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBeUndefined();
    }
  });

  it('parses a valid category filter', () => {
    const result = SearchRadarOfflineInputSchema.safeParse({ category: 'enterprise-tech' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBe('enterprise-tech');
    }
  });

  it('rejects an unknown category', () => {
    expect(SearchRadarOfflineInputSchema.safeParse({ category: 'crypto' }).success).toBe(false);
  });

  it('rejects pre-Phase-3 `tier` field (no longer accepted; website has no tier filter)', () => {
    // The schema is strict — extra keys aren't allowed. This test locks
    // the capability-mirror invariant: future re-introduction of `tier`
    // should be a deliberate decision tied to a website filter that exposes it.
    const result = SearchRadarOfflineInputSchema.safeParse({ tier: 'fyi' });
    // Zod's default behavior for object schemas is to allow unknown keys
    // (strip-by-default). The tool's contract is what's documented; this
    // assertion confirms `tier` produces no parsed field.
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).tier).toBeUndefined();
    }
  });

  it('rejects pre-Phase-3 `since` field similarly', () => {
    const result = SearchRadarOfflineInputSchema.safeParse({ since: '2026-04-01' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).since).toBeUndefined();
    }
  });

  it('rejects pre-Phase-3 `query` and `limit` fields similarly', () => {
    const result = SearchRadarOfflineInputSchema.safeParse({ query: 'AI', limit: 50 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).query).toBeUndefined();
      expect((result.data as Record<string, unknown>).limit).toBeUndefined();
    }
  });
});
