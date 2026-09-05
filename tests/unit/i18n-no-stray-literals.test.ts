/**
 * Locale identifiers live in ONE place: `src/i18n/locales.ts`. A `'pt-BR'`
 * or `/es/` typed anywhere else in `src/` is a second registry that will drift
 * when a dialect is added. This guard greps for the literals the registry owns.
 *
 * Deliberately narrow: it does not police translated copy or English words,
 * only the codes/segments/og tags that a future `es-MX` or `pt-PT` would need
 * to appear in a second place.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(REPO_ROOT, 'src');

const SKIP_DIRS = new Set(['i18n', 'design_handoff_localization', 'docs']);
const EXTENSIONS = /\.(astro|ts|mjs|js|css)$/;

// Quoted string literals only (single/double quotes — prettier's output for
// code). Backticked mentions in comments (`pt-BR`) are prose and are not matched.
const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "locale code 'pt-BR' / 'pt-br'", re: /['"]pt-br['"]/i },
  { name: "og locale 'es_CO' / 'es_ES' / 'pt_BR'", re: /['"](es_CO|es_ES|pt_BR)['"]/ },
  { name: "URL '/es/…' or '/pt-br/…'", re: /['"]\/(es|pt-br)\//i },
  { name: "Intl tag 'es-CO' / 'es-ES'", re: /['"]es-(CO|ES)['"]/ },
];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) {
      return SKIP_DIRS.has(e.name) ? [] : walk(join(dir, e.name));
    }
    return EXTENSIONS.test(e.name) ? [join(dir, e.name)] : [];
  });
}

describe('no locale literals outside src/i18n', () => {
  const files = walk(SRC);

  it('scans a realistic number of source files', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(PATTERNS)('$name appears only in the registry', ({ re }) => {
    const offenders = files
      .filter((f) => re.test(readFileSync(f, 'utf-8')))
      .map((f) => relative(REPO_ROOT, f).split(sep).join('/'));
    expect(offenders).toEqual([]);
  });
});
