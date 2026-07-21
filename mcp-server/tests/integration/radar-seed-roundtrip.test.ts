/**
 * Round-trip drift guard for the `npm run radar:seed` seeder (BL-034 defect
 * closure — the offline snapshot's populate path).
 *
 * Runs the REAL seeder script as a subprocess and reads the result back
 * through the REAL reader (src/content/radar-snapshot.ts). This is the
 * contract test that keeps the seeder's deliberately-duplicated cache-key
 * formula and `{timestamp, data}` file shape in lockstep with the reader:
 * if either side drifts, this fails loudly instead of devs getting a silent
 * "snapshot missing" at runtime.
 *
 * Mutates the real `<repo>/.cache/inoreader/` (the reader has no env
 * override by design — it resolves the path from its own module location).
 * Safe because: (a) any pre-existing cache files are backed up in beforeAll
 * and restored in afterAll (same pattern as tests/unit/radar-offline.test.ts),
 * and (b) mcp vitest runs test FILES serially (`fileParallelism: false` in
 * vitest.config.ts), so the two suites touching this directory cannot
 * interleave.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readFyiSnapshot, readWireSnapshot } from '../../src/content/radar-snapshot';

const here = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(here, '../../../.cache/inoreader');
const SEEDER = resolve(here, '../../scripts/seed-radar-cache.mjs');

// Snapshot existing cache files (if any) before mutating; restore after.
let preservedFiles: Array<{ src: string; dst: string }> = [];

beforeAll(() => {
  if (existsSync(CACHE_DIR)) {
    const tmpDir = `${CACHE_DIR}.seed-test-backup-${Date.now()}`;
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
  rmSync(CACHE_DIR, { recursive: true, force: true });
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

function runSeeder(...args: string[]): string {
  return execFileSync(process.execPath, [SEEDER, ...args], { encoding: 'utf-8' });
}

describe('radar:seed → reader round-trip', () => {
  it('starts from the snapshot-missing state', () => {
    expect(readFyiSnapshot()).toBeNull();
    expect(readWireSnapshot()).toBeNull();
  });

  it('seeding populates both tiers readable by the real reader', () => {
    const out = runSeeder();
    expect(out).toContain('[radar:seed] Seeded');
    expect(out).toContain('7 FYI + 13 Wire');

    const fyi = readFyiSnapshot();
    expect(fyi).not.toBeNull();
    expect(fyi!.tier).toBe('fyi');
    expect(fyi!.items).toHaveLength(7);
    expect(fyi!.lastSeededAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO from file mtime

    // Field mapping survives the trip: category + annotation → gstTake.
    const peItem = fyi!.items.find((i) => i.id === 'fyi-pe-ma-1');
    expect(peItem?.category).toBe('pe-ma');
    expect(peItem?.annotation?.gstTake).toMatch(/Classic late-cycle/);

    const wire = readWireSnapshot();
    expect(wire).not.toBeNull();
    expect(wire!.tier).toBe('wire');
    expect(wire!.items).toHaveLength(13);
  });

  it('seeded file names match the reader’s SHA256 key formula exactly', () => {
    const files = readdirSync(CACHE_DIR).sort();
    expect(files).toHaveLength(2);
    // 64-hex-char names — any drift in the key formula changes these and the
    // reader assertions above would already have failed; this pins the shape.
    for (const f of files) {
      expect(f).toMatch(/^[0-9a-f]{64}\.json$/);
    }
  });

  it('unseeding returns both tiers to the snapshot-missing state', () => {
    const out = runSeeder('--unseed');
    expect(out).toContain('[radar:unseed] Cleared');
    expect(existsSync(CACHE_DIR)).toBe(false);
    expect(readFyiSnapshot()).toBeNull();
    expect(readWireSnapshot()).toBeNull();
  });

  it('unseeding when already clear is a friendly no-op', () => {
    const out = runSeeder('--unseed');
    expect(out).toContain('[radar:unseed] Nothing to clear');
  });
});
