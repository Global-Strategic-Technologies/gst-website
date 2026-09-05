#!/usr/bin/env node
/**
 * Stamp translation catalogs with the English source they were translated from.
 *
 * For every `src/i18n/<locale>/<ns>.json` other than English, writes
 * `src/i18n/<locale>/<ns>.source.json`: key → first 8 hex chars of the SHA-256
 * of the English string at stamping time. The catalog-parity guard
 * (`tests/integration/i18n-catalog-parity.test.ts`, run by `npm run test:docs`)
 * recomputes those hashes and fails when English has moved on without the
 * translation — the staleness signal BL-153 asks for.
 *
 * Usage:
 *   node scripts/i18n-stamp-sources.mjs              # stamp every locale/namespace
 *   node scripts/i18n-stamp-sources.mjs es           # one locale
 *   node scripts/i18n-stamp-sources.mjs es about     # one file
 *   node scripts/i18n-stamp-sources.mjs --check      # exit 1 if any sidecar is stale
 *
 * Run it AFTER reviewing a translation against the current English — stamping
 * asserts "this translation reflects this English", so it is a reviewer's act,
 * not a build step. Never run it to silence the guard.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const I18N = join(ROOT, 'src', 'i18n');
const DEFAULT = 'en';

export function sourceHash(english) {
  return createHash('sha256').update(english, 'utf8').digest('hex').slice(0, 8);
}

export function sidecarFor(englishCatalog) {
  const out = {};
  for (const key of Object.keys(englishCatalog).sort()) {
    out[key] = sourceHash(englishCatalog[key]);
  }
  return out;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function localeDirs() {
  return readdirSync(I18N, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== DEFAULT)
    .map((e) => e.name);
}

function namespacesFor(locale) {
  return readdirSync(join(I18N, locale))
    .filter((f) => f.endsWith('.json') && !f.endsWith('.source.json'))
    .map((f) => f.replace(/\.json$/, ''));
}

function main(argv) {
  const check = argv.includes('--check');
  const positional = argv.filter((a) => !a.startsWith('--'));
  const [onlyLocale, onlyNs] = positional;

  let stale = 0;
  for (const locale of localeDirs()) {
    if (onlyLocale && locale !== onlyLocale) continue;
    for (const ns of namespacesFor(locale)) {
      if (onlyNs && ns !== onlyNs) continue;
      const enPath = join(I18N, DEFAULT, `${ns}.json`);
      if (!existsSync(enPath)) {
        console.error(`✗ ${locale}/${ns}.json has no English counterpart`);
        stale++;
        continue;
      }
      const expected = sidecarFor(readJson(enPath));
      const sidecarPath = join(I18N, locale, `${ns}.source.json`);
      const serialized = `${JSON.stringify(expected, null, 2)}\n`;
      if (check) {
        const current = existsSync(sidecarPath) ? readFileSync(sidecarPath, 'utf8') : '';
        if (current !== serialized) {
          console.error(
            `✗ ${locale}/${ns}.source.json is stale (run: node scripts/i18n-stamp-sources.mjs ${locale} ${ns})`
          );
          stale++;
        }
      } else {
        writeFileSync(sidecarPath, serialized);
        console.log(`✓ stamped ${locale}/${ns}.source.json (${Object.keys(expected).length} keys)`);
      }
    }
  }
  if (check && stale > 0) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}
