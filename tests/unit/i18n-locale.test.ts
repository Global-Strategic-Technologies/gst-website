/**
 * Locale model contracts (BL-153, ADR-0030): the resolver, path parsing, the
 * link helper's prefixing rule, and the alternates/draft behaviour that SEO.astro
 * and the switcher both consume. `.astro` files cannot be evaluated here, so
 * rendered-page assertions (hreflang tags, `<html lang>`) live in
 * `tests/e2e/localization.test.ts`; these tests pin the functions those pages
 * call.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  DEFAULT_LOCALE,
  LOCALES,
  findLocale,
  liveLocales,
  localeFromPath,
  nonDefaultLocales,
  resolveLocale,
  toAstroLocales,
  toSitemapI18n,
} from '../../src/i18n/locales';
import {
  TIER_A_ROUTES,
  alternatesFor,
  localeHome,
  localizedHref,
  routeParam,
} from '../../src/i18n/routes';
import { sitemapFilter } from '../../src/utils/sitemap-filter';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf-8');

const en = findLocale('en')!;
const es = findLocale('es')!;
const ptBR = findLocale('pt-BR')!;

describe('registry shape', () => {
  it('has English as the unprefixed default with a non-empty path', () => {
    // An empty `path` breaks Astro's computeCurrentLocale (Phase 0 spike).
    expect(DEFAULT_LOCALE.code).toBe('en');
    expect(DEFAULT_LOCALE.path).not.toBe('');
    expect(DEFAULT_LOCALE.status).toBe('live');
  });

  it('uses lowercase URL segments and BCP 47 codes', () => {
    for (const l of LOCALES) {
      expect(l.path).toBe(l.path.toLowerCase());
      expect(l.code.split('-')[0]).toBe(l.language);
      expect(l.htmlLang).toBe(l.code);
    }
  });

  it('exposes es and pt-BR as non-default locales', () => {
    expect(nonDefaultLocales().map((l) => l.code)).toEqual(['es', 'pt-BR']);
  });

  it('short codes are two letters, never the region', () => {
    for (const l of LOCALES) expect(l.short).toMatch(/^[A-Z]{2}$/);
  });
});

describe('resolveLocale — exact → language → default', () => {
  it('matches exact codes case-insensitively', () => {
    expect(resolveLocale('pt-BR')).toBe(ptBR);
    expect(resolveLocale('PT-br')).toBe(ptBR);
    expect(resolveLocale('es')).toBe(es);
  });

  it('falls back to the language when the region is unknown', () => {
    expect(resolveLocale('pt-PT')).toBe(ptBR);
    expect(resolveLocale('es-MX')).toBe(es);
    expect(resolveLocale('en-GB')).toBe(en);
  });

  it('defaults for unknown languages, undefined and empty', () => {
    expect(resolveLocale('fr')).toBe(en);
    expect(resolveLocale(undefined)).toBe(en);
    expect(resolveLocale(null)).toBe(en);
    expect(resolveLocale('')).toBe(en);
    expect(resolveLocale([])).toBe(en);
  });

  it('walks a navigator.languages list applying both steps per candidate', () => {
    // pt-PT matches pt-BR by language BEFORE the exact `es` further down.
    expect(resolveLocale(['pt-PT', 'es'])).toBe(ptBR);
    expect(resolveLocale(['fr', 'de', 'es-AR'])).toBe(es);
    expect(resolveLocale(['fr', 'de'])).toBe(en);
  });
});

describe('localeFromPath', () => {
  it('splits a prefixed path into locale and route', () => {
    expect(localeFromPath('/pt/about/')).toEqual({ locale: ptBR, routePath: '/about/' });
    expect(localeFromPath('/es/')).toEqual({ locale: es, routePath: '/' });
    expect(localeFromPath('/es')).toEqual({ locale: es, routePath: '/' });
    expect(localeFromPath('/PT/hub/tools/')).toEqual({
      locale: ptBR,
      routePath: '/hub/tools/',
    });
  });

  it('treats unprefixed paths as English, and /en/ as NOT a locale prefix', () => {
    expect(localeFromPath('/about/')).toEqual({ locale: en, routePath: '/about/' });
    expect(localeFromPath('/')).toEqual({ locale: en, routePath: '/' });
    // English is unprefixed; `/en/about/` is not a route on this site.
    expect(localeFromPath('/en/about/')).toEqual({ locale: en, routePath: '/en/about/' });
  });

  it('does not mistake a route that starts like a locale segment', () => {
    expect(localeFromPath('/estimates/').locale).toBe(en);
  });
});

describe('localizedHref — prefixes registry routes only', () => {
  it('prefixes Tier A routes for non-default locales', () => {
    expect(localizedHref('/about/', es)).toBe('/es/about/');
    expect(localizedHref('/hub/tools/', ptBR)).toBe('/pt/hub/tools/');
    expect(localizedHref('/', ptBR)).toBe('/pt/');
    expect(localizedHref('/about', es)).toBe('/es/about/');
  });

  it('leaves the default locale unprefixed', () => {
    expect(localizedHref('/about/', en)).toBe('/about/');
    expect(localizedHref('/es/about/', en)).toBe('/about/');
  });

  it('returns English-only routes unchanged (Tier B/C stay English)', () => {
    expect(localizedHref('/ma-portfolio/', es)).toBe('/ma-portfolio/');
    expect(localizedHref('/hub/tools/techpar/', ptBR)).toBe('/hub/tools/techpar/');
    expect(localizedHref('/hub/mcp/get-started/', es)).toBe('/hub/mcp/get-started/');
    expect(localizedHref('/brand/', es)).toBe('/brand/');
  });

  it('never double-prefixes an already localized path', () => {
    expect(localizedHref('/es/about/', es)).toBe('/es/about/');
    expect(localizedHref('/es/about/', ptBR)).toBe('/pt/about/');
  });

  it('passes external, mailto, tel, hash and protocol-relative hrefs through', () => {
    for (const href of [
      'https://example.com/x',
      'mailto:contact@globalstrategic.tech',
      'tel:+15555555555',
      '#contact',
      '//cdn.example.com/a.js',
    ]) {
      expect(localizedHref(href, es)).toBe(href);
    }
  });

  it('localeHome is / for English and /<path>/ otherwise', () => {
    expect(localeHome(en)).toBe('/');
    expect(localeHome(es)).toBe('/es/');
    expect(localeHome(ptBR)).toBe('/pt/');
  });
});

describe('alternatesFor — live-only, draft emits nothing', () => {
  it('returns a single entry for routes outside the registry', () => {
    expect(alternatesFor('/hub/tools/techpar/', en)).toEqual([en]);
    expect(alternatesFor('/ma-portfolio/', es)).toEqual([es]);
  });

  it('returns only the current locale for a draft page', () => {
    if (es.status !== 'draft') return; // liveness override active — covered below
    expect(alternatesFor('/about/', es)).toEqual([es]);
    expect(alternatesFor('/pt/about/', ptBR)).toEqual([ptBR]);
  });

  it('returns the live locales, in registry order, for a live page', () => {
    const live = liveLocales();
    expect(alternatesFor('/about/', en)).toEqual(live);
    // With only English live there is exactly one entry → no hreflang cluster.
    if (live.length === 1) expect(alternatesFor('/about/', en)).toEqual([en]);
  });

  it('strips a locale prefix from routePath before looking the route up', () => {
    expect(alternatesFor('/es/about/', en)).toEqual(alternatesFor('/about/', en));
  });
});

describe('sitemapFilter under locale prefixes', () => {
  const SITE = 'https://globalstrategic.tech';

  it('applies the exclusion list beneath a prefix', () => {
    expect(sitemapFilter(`${SITE}/es/brand/`)).toBe(false);
    expect(sitemapFilter(`${SITE}/pt/hub/radar/`)).toBe(false);
  });

  it('drops every URL of a draft locale', () => {
    for (const l of nonDefaultLocales()) {
      const expected = l.status === 'live';
      expect(sitemapFilter(`${SITE}/${l.path}/about/`), l.code).toBe(expected);
      expect(sitemapFilter(`${SITE}/${l.path}/`), l.code).toBe(expected);
    }
  });

  it('still includes English pages', () => {
    expect(sitemapFilter(`${SITE}/about/`)).toBe(true);
  });
});

describe('config adapters', () => {
  it('toAstroLocales maps every locale to { path, codes: [code] }', () => {
    expect(toAstroLocales()).toEqual(LOCALES.map((l) => ({ path: l.path, codes: [l.code] })));
  });

  it('toSitemapI18n lists live locales keyed by URL segment, default by path', () => {
    const { defaultLocale, locales } = toSitemapI18n();
    expect(defaultLocale).toBe(DEFAULT_LOCALE.path);
    expect(Object.keys(locales)).toEqual(liveLocales().map((l) => l.path));
    expect(locales[DEFAULT_LOCALE.path]).toBe('en');
  });
});

describe('route registry ↔ template map', () => {
  it('every route has a stable trailing-slash path and a param', () => {
    for (const r of TIER_A_ROUTES) {
      expect(r.path.startsWith('/')).toBe(true);
      expect(r.path.endsWith('/')).toBe(true);
      const param = routeParam(r);
      if (r.path === '/') expect(param).toBeUndefined();
      else expect(param).toBe(r.path.slice(1, -1));
    }
  });

  it('page-templates/registry.ts has exactly one template per Tier A route', () => {
    // `.astro` imports keep registry.ts out of vitest, so match the source.
    // Equality, not subset: a route without a template is a locale that
    // silently lacks a page (the catch-all filters it out), and a template
    // without a route is dead code.
    const src = read('src/page-templates/registry.ts');
    const block = /export const TEMPLATES = \{([\s\S]*?)\} as const;/.exec(src);
    expect(block, 'TEMPLATES block not found').toBeTruthy();
    const ids = [...block![1].matchAll(/^\s*'?([\w-]+)'?\s*:/gm)].map((m) => m[1]).sort();
    expect(ids).toEqual(TIER_A_ROUTES.map((r) => r.id).sort());
  });
});
