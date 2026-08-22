/**
 * Guard for the mcp-server ↔ website type-program boundary (BL-137, ADR-0020).
 *
 * `mcp-server/src/worker.ts:1` carries
 * `/// <reference types="@cloudflare/workers-types" />`. That directive pulls in
 * the package's `index.d.ts` — a GLOBAL SCRIPT which declares `Buffer`,
 * `process` and `global` at global scope, shadowing `@types/node`. Reference
 * directives are program-wide, so the moment any file reachable from the ROOT
 * tsconfig imports `worker.ts`, every `Buffer.byteLength(…)` and `process.env`
 * in the website program silently degrades to `any`.
 *
 * The website reaches mcp-server for real:
 *   tests/integration/techpar-mcp-wizard-roundtrip.test.ts
 *     → mcp-server/src/tools/techpar.ts → … (25 files today)
 *
 * BL-137 severed the one edge that reached `worker.ts` by moving the `Env`
 * interface to `mcp-server/src/env.ts`. This guard is what keeps it severed.
 *
 * WHY A GUARD AND NOT A ONE-SHOT CHECK: the regression is invisible to the type
 * checker. Re-adding `import type { Env } from '../worker'` anywhere in
 * `mcp-server/src` re-poisons the website program while `astro check` stays
 * GREEN — `any` never errors. Nothing else in CI would notice.
 *
 * Mechanism: ask `tsc` for the root program's actual file list. `--listFilesOnly`
 * resolves the full module graph (including reference directives) and prints it,
 * WITHOUT type-checking — so it exits 0 whether or not the program has type
 * errors. We therefore assert on the printed list, never on the exit status.
 */
import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const TSC_BIN = resolve(REPO_ROOT, 'node_modules/typescript/bin/tsc');

/**
 * The two files that must never enter the root program.
 *
 * `worker.ts` is the sole carrier of the reference directive; `index.d.ts` is
 * what the directive loads. Both are listed because either one arriving by a
 * route we have not foreseen is the same defect.
 *
 * NOTE the deliberate absence of `workers-types/index.ts` (no `.d`): that is the
 * MODULE form of the same package — 965 scoped exports, no `declare global`, no
 * reference directive — and it legitimately sits in the root program today via
 * `@sentry/cloudflare`. Scoped `import type { … } from '@cloudflare/workers-types'`
 * is the safe idiom; only the global script is banned.
 */
const BANNED = ['mcp-server/src/worker.ts', '@cloudflare/workers-types/index.d.ts'] as const;

/** Proves the list is a real program and not an empty/failed run. */
const SENTINEL = 'mcp-server/src/tools/techpar.ts';

describe('mcp-server files in the website root program', () => {
  // ~3s locally for ~2,200 files. Generous ceiling so a cold/loaded CI box does
  // not turn this into a flake — the assertion is about content, not speed.
  it('excludes worker.ts and the workers-types global script', () => {
    const result = spawnSync(
      process.execPath,
      [TSC_BIN, '-p', 'tsconfig.json', '--noEmit', '--listFilesOnly'],
      { cwd: REPO_ROOT, encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 }
    );

    // tsc prints absolute paths, forward-slashed on Windows but with a drive
    // letter; normalise separators so the substring checks below are portable.
    const files = `${result.stdout}`
      .split(/\r?\n/)
      .map((l) => l.trim().replace(/\\/g, '/'))
      .filter(Boolean);

    // Non-vacuity first: an empty or broken run must fail loudly here rather
    // than sail through the two `not.toContain` assertions below. (BL-124 and
    // BL-125 both shipped guards that asserted over an empty set.)
    expect(
      files.length,
      `tsc --listFilesOnly printed nothing; it exited ${result.status}.\n${result.stderr}`
    ).toBeGreaterThan(100);
    expect(
      files.some((f) => f.endsWith(SENTINEL)),
      `${SENTINEL} is absent, so this run is not exercising the website→mcp-server ` +
        `edge at all and the guard below would pass vacuously. If that edge was ` +
        `deliberately removed, retarget SENTINEL at whatever still reaches mcp-server.`
    ).toBe(true);

    for (const banned of BANNED) {
      const hits = files.filter((f) => f.endsWith(banned));
      expect(
        hits,
        `${banned} is in the website's root TypeScript program.\n\n` +
          `This re-poisons the whole program with workers-types' global ` +
          `Buffer/process/global declarations, and astro check will NOT catch it ` +
          `because those globals are typed 'any'.\n\n` +
          `Most likely cause: something under mcp-server/src imports from ` +
          `'./worker' or '../worker' again. Import Env from './env' instead — ` +
          `see mcp-server/src/env.ts and ADR-0020.`
      ).toEqual([]);
    }
  }, 120_000);
});
