import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Lazily loaded CSS must be imported with `?inline` (BL-035, ADR-0039;
 * STYLES_GUIDE § lazily loaded stylesheets).
 *
 * Astro attaches a plainly imported CSS module to every page that owns the
 * importing script, walking dynamic importers too (astro's
 * core/build/graph.js + plugin-css.js). palette-manager.ts runs on every page,
 * so `import './ambient.css'` anywhere under it would ship the sheet to every
 * visitor, and the E2E suite (which runs on the dev server, where Vite only
 * injects CSS when the module runs) could not see it. `?inline` yields a
 * string the module inserts itself, only when it runs.
 */
const root = resolve(__dirname, '../..');
const ambientDir = resolve(root, 'src/scripts/ambient');
const paletteManager = resolve(root, 'src/scripts/palette-manager.ts');

const CSS_IMPORT = /import\s+(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+\.css(?:\?[^'"]*)?)['"]/g;
const DYNAMIC_IMPORT = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveModule(from: string, spec: string): string {
  const base = resolve(dirname(from), spec);
  return /\.[cm]?[jt]s$/.test(base) ? base : `${base}.ts`;
}

describe('lazily loaded ambient CSS is imported as a string (BL-035)', () => {
  const lazyModules = [
    ...readdirSync(ambientDir)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => resolve(ambientDir, f)),
    ...[...readFileSync(paletteManager, 'utf8').matchAll(DYNAMIC_IMPORT)].map((m) =>
      resolveModule(paletteManager, m[1])
    ),
  ];

  it('finds the modules it guards', () => {
    // Non-vacuity: the runtime and the controls each import a sheet.
    const names = lazyModules.map((m) => m.replace(/\\/g, '/'));
    expect(names.some((n) => n.endsWith('/ambient/runtime.ts'))).toBe(true);
    expect(names.some((n) => n.endsWith('/ambient/controls.ts'))).toBe(true);
    const cssImports = lazyModules.flatMap((m) => [
      ...readFileSync(m, 'utf8').matchAll(CSS_IMPORT),
    ]);
    expect(cssImports.length).toBeGreaterThanOrEqual(2);
  });

  it('every CSS import in them ends in ?inline', () => {
    for (const mod of new Set(lazyModules)) {
      for (const m of readFileSync(mod, 'utf8').matchAll(CSS_IMPORT))
        expect(m[1], `${mod}: ${m[1]}`).toMatch(/\?inline$/);
    }
  });
});
