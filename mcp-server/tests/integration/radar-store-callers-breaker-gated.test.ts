/**
 * BL-091 — structural guard: every consumer of the live radar store must be
 * circuit-breaker aware.
 *
 * **Why this test exists.** The defect BL-091 fixed was not "one handler had a
 * bug" — it was "a call site was added without a breaker check", and it had
 * already happened TWICE independently (the `gst://radar/*` Resources reader
 * and the `/radar/snapshot` SSR endpoint both fetched Inoreader live during an
 * open breaker window, leaking the exact budget the breaker exists to
 * protect). Guarding the known call sites by hand invites a fifth one.
 *
 * So this freezes the *class* of regression rather than the instances: any
 * module that imports `readWireLive` / `readFyiLive` (the fetch-capable
 * readers) must also import `isCircuitOpen`, proving it made a deliberate
 * decision about breaker state. A new file that pulls the live readers without
 * that import fails here, at the point of introduction.
 *
 * Mechanism follows the repo's source-scanning precedent in
 * `contract-parity.test.ts` (readdir + readFile over `src/`), not the
 * live-server frozen-list precedent in `resource-uri-stability.test.ts`.
 *
 * Deliberately matches on the IMPORT statement, not bare text: several modules
 * mention these functions in prose comments without importing them. Aliased
 * specifiers (`readWireLive as x`) and explicit `.js`/`.ts` extensions are
 * both handled.
 *
 * **What this proves and what it doesn't**: it proves the *import* — i.e. that
 * the module was written with breaker state in hand. A static scan cannot
 * prove the state is actually consulted on every branch; the behavioral tests
 * (`radar-live.test.ts`, `radar-snapshot-reader-worker-breaker.test.ts`,
 * `radar-snapshot-endpoint.test.ts`) cover that. This guard's job is to make a
 * NEW unguarded call site impossible to add silently. Namespace imports
 * (`import * as store`) and dynamic `import()` would evade it — neither is used
 * in this codebase, and both would be visible in review.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC_ROOT = join(__dirname, '..', '..', 'src');
const STORE_MODULE = 'radar-live-store';

/** The fetch-capable readers. Importing either implies possible Inoreader egress. */
const LIVE_READERS = ['readWireLive', 'readFyiLive'];

/**
 * The module that DEFINES the readers is not a consumer — it owns both the
 * live and cache-only families and is where the breaker-free primitives
 * legitimately live.
 */
const DEFINING_MODULE = join('content', 'radar-live-store.ts');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Extract the specifier list of any import statement pulling from the store module. */
function storeImportSpecifiers(source: string): string[] {
  // Matches single-line and multi-line `import { ... } from '...radar-live-store'`,
  // tolerating an explicit file extension (`.js`/`.ts`) on the specifier.
  const re = new RegExp(
    `import\\s*\\{([^}]*)\\}\\s*from\\s*['"][^'"]*${STORE_MODULE}(?:\\.[jt]s)?['"]`,
    'gs'
  );
  const specs: string[] = [];
  for (const match of source.matchAll(re)) {
    specs.push(
      ...(match[1] ?? '')
        .split(',')
        // Strip an inline `type` modifier, then take the ORIGINAL name from an
        // `x as y` alias — otherwise `readWireLive as read` would evade the check.
        .map((s) =>
          s
            .replace(/\btype\b/, '')
            .split(/\bas\b/)[0]!
            .trim()
        )
        .filter(Boolean)
    );
  }
  return specs;
}

describe('radar live-store consumers are circuit-breaker aware (BL-091)', () => {
  const files = walk(SRC_ROOT);

  const liveReaderImporters = files.filter((file) => {
    const rel = relative(SRC_ROOT, file);
    if (rel === DEFINING_MODULE || rel.split(sep).join('/') === 'content/radar-live-store.ts') {
      return false;
    }
    const specs = storeImportSpecifiers(readFileSync(file, 'utf8'));
    return specs.some((s) => LIVE_READERS.includes(s));
  });

  it('finds the expected live-reader consumers (sanity: the scan actually works)', () => {
    const rels = liveReaderImporters.map((f) => relative(SRC_ROOT, f).split(sep).join('/')).sort();
    // If this list changes, that is FINE — but the assertion below must still
    // hold for every entry. This one only proves the scanner isn't silently
    // matching nothing (which would make the real assertion vacuous).
    expect(rels.length).toBeGreaterThanOrEqual(4);
    expect(rels).toContain('tools/radar-live.ts');
    expect(rels).toContain('pipeline/handle-authenticated.ts');
    expect(rels).toContain('content/radar-snapshot-reader-worker.ts');
    expect(rels).toContain('cron/radar-refresh.ts');
  });

  it.each(
    // Build the case list eagerly so a new unguarded file shows up as its own
    // failing case with its own name.
    (() => {
      const rels = liveReaderImporters.map((f) => relative(SRC_ROOT, f).split(sep).join('/'));
      return rels.map((rel) => [rel] as const);
    })()
  )('%s also imports isCircuitOpen', (rel) => {
    const file = join(SRC_ROOT, ...rel.split('/'));
    const source = readFileSync(file, 'utf8');
    expect(
      /import\s*\{[^}]*\bisCircuitOpen\b[^}]*\}\s*from\s*['"][^'"]*circuit-breaker['"]/s.test(
        source
      ),
      `${rel} imports a fetch-capable radar reader (readWireLive/readFyiLive) but does not import ` +
        `isCircuitOpen. Every consumer must decide what to do while the Inoreader circuit breaker ` +
        `is open — either skip (cron) or switch to readWireCached/readFyiCached (read surfaces). ` +
        `See ADR-0006 / BL-115.`
    ).toBe(true);
  });
});
