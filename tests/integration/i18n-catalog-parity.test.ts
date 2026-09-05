/**
 * Translation catalog guard (BL-153). Runs in `npm run test:docs` because what
 * it protects is copy, and the commits that break it are copy-only.
 *
 * Four contracts, all against `src/i18n/<locale>/<namespace>.json`:
 *  1. Key parity — every locale has exactly the English key set per namespace,
 *     and every namespace English has, every locale has. A missing key would
 *     otherwise throw at build time from `useTranslations`; catching it here
 *     names the key and the locale in one line.
 *  2. Staleness — `<ns>.source.json` sidecars hold the hash of the English
 *     string each translation was made from. English moved on → this fails
 *     until a reviewer re-stamps (`node scripts/i18n-stamp-sources.mjs`).
 *  3. Markup allowlist — a string may carry only `<a> <strong> <em> <br> <code>`
 *     plus `<p>` for multi-paragraph answers (what `tHtml` is for), and
 *     placeholders must match English's.
 *  4. No empty strings, anywhere.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { LOCALES } from '../../src/i18n/locales';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const I18N = join(REPO_ROOT, 'src', 'i18n');
const DEFAULT = 'en';

type Catalog = Record<string, string>;

const readJson = (p: string): Catalog => JSON.parse(readFileSync(p, 'utf-8'));
const hash = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 8);

const namespaces = readdirSync(join(I18N, DEFAULT))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));

const otherLocales = LOCALES.filter((l) => l.code !== DEFAULT).map((l) => l.code);

// `p` is here for multi-paragraph FAQ answers (services.faq.a1 predates the
// catalogs with two <p>s); block-level structure beyond that stays in templates.
const ALLOWED_TAGS = new Set(['a', 'strong', 'em', 'br', 'code', 'p']);
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n catalogs — English is the schema', () => {
  it('has at least the common namespace', () => {
    expect(namespaces).toContain('common');
  });

  it('every registry locale has a catalog directory', () => {
    for (const code of otherLocales) {
      expect(existsSync(join(I18N, code)), `src/i18n/${code}/ missing`).toBe(true);
    }
  });

  it('English catalogs have no empty strings and unique keys', () => {
    for (const ns of namespaces) {
      const raw = readFileSync(join(I18N, DEFAULT, `${ns}.json`), 'utf-8');
      const keys = [...raw.matchAll(/^\s*"([^"]+)"\s*:/gm)].map((m) => m[1]);
      expect(new Set(keys).size, `${ns}: duplicate key`).toBe(keys.length);
      for (const [k, v] of Object.entries(readJson(join(I18N, DEFAULT, `${ns}.json`)))) {
        expect(v.trim().length, `en/${ns}.json ${k} is empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe.each(otherLocales)('i18n catalogs — %s', (code) => {
  it.each(namespaces)('%s.json has exactly the English key set', (ns) => {
    const enPath = join(I18N, DEFAULT, `${ns}.json`);
    const path = join(I18N, code, `${ns}.json`);
    expect(existsSync(path), `src/i18n/${code}/${ns}.json missing`).toBe(true);
    const en = readJson(enPath);
    const cat = readJson(path);
    const missing = Object.keys(en).filter((k) => !(k in cat));
    const extra = Object.keys(cat).filter((k) => !(k in en));
    expect(missing, `${code}/${ns}: missing keys`).toEqual([]);
    expect(extra, `${code}/${ns}: keys not in English`).toEqual([]);
  });

  it.each(namespaces)('%s.json has no empty strings', (ns) => {
    for (const [k, v] of Object.entries(readJson(join(I18N, code, `${ns}.json`)))) {
      expect(v.trim().length, `${code}/${ns}.json ${k} is empty`).toBeGreaterThan(0);
    }
  });

  it.each(namespaces)('%s.json keeps English placeholders and allowed markup only', (ns) => {
    const en = readJson(join(I18N, DEFAULT, `${ns}.json`));
    const cat = readJson(join(I18N, code, `${ns}.json`));
    for (const [k, v] of Object.entries(cat)) {
      if (!(k in en)) continue; // parity test reports it
      expect(placeholders(v), `${code}/${ns}.json ${k}: placeholders differ`).toEqual(
        placeholders(en[k])
      );
      for (const m of v.matchAll(/<\/?([a-zA-Z][\w-]*)/g)) {
        expect(ALLOWED_TAGS.has(m[1].toLowerCase()), `${code}/${ns}.json ${k}: <${m[1]}>`).toBe(
          true
        );
      }
    }
  });

  it.each(namespaces)('%s.source.json matches the current English (not stale)', (ns) => {
    const en = readJson(join(I18N, DEFAULT, `${ns}.json`));
    const sidecarPath = join(I18N, code, `${ns}.source.json`);
    expect(
      existsSync(sidecarPath),
      `${code}/${ns}.source.json missing — run: node scripts/i18n-stamp-sources.mjs ${code} ${ns}`
    ).toBe(true);
    const sidecar = readJson(sidecarPath);
    const stale = Object.keys(en).filter((k) => sidecar[k] !== hash(en[k]));
    expect(
      stale,
      `${code}/${ns}: English changed since translation — re-review, then re-stamp`
    ).toEqual([]);
    const orphans = Object.keys(sidecar).filter((k) => !(k in en));
    expect(orphans, `${code}/${ns}.source.json: keys no longer in English`).toEqual([]);
  });
});

describe('English catalogs also carry allowed markup only', () => {
  it.each(namespaces)('%s.json', (ns) => {
    for (const [k, v] of Object.entries(readJson(join(I18N, DEFAULT, `${ns}.json`)))) {
      for (const m of v.matchAll(/<\/?([a-zA-Z][\w-]*)/g)) {
        expect(ALLOWED_TAGS.has(m[1].toLowerCase()), `en/${ns}.json ${k}: <${m[1]}>`).toBe(true);
      }
    }
  });
});
