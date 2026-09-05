/**
 * The translation lookup itself (BL-153, ADR-0030 decision 5): typed keys,
 * `{name}` interpolation, the loud missing-key failure for non-default
 * locales, the English static fallback, `tHtml` param escaping, and the
 * catalog discovery the parity guard relies on. `import.meta.glob` is Vite's,
 * and vitest runs under Vite, so the real catalogs load here.
 */
import { describe, it, expect } from 'vitest';

import { DEFAULT_LOCALE, LOCALES, findLocale, type Locale } from '../../src/i18n/locales';
import { EN, catalogFor, catalogLocaleCodes, interpolate, useTranslations } from '../../src/i18n/t';

const es = findLocale('es')!;

describe('interpolate', () => {
  it('substitutes named params and stringifies numbers', () => {
    expect(interpolate('Ver las {count} herramientas', { count: 16 })).toBe(
      'Ver las 16 herramientas'
    );
  });

  it('leaves unknown placeholders and braces alone, and is a no-op without params', () => {
    expect(interpolate('{a} and {b}', { a: 'x' })).toBe('x and {b}');
    expect(interpolate('{a}')).toBe('{a}');
  });
});

describe('catalog discovery', () => {
  it('finds every registry locale on disk and never a sidecar', () => {
    const codes = catalogLocaleCodes();
    for (const l of LOCALES) expect(codes).toContain(l.code);
    expect(codes.some((c) => c.includes('.source'))).toBe(false);
  });

  it('returns undefined for a locale or namespace that has no catalog', () => {
    expect(catalogFor('fr', 'common')).toBeUndefined();
    expect(catalogFor('es', 'no-such-namespace' as never)).toBeUndefined();
  });
});

describe('useTranslations', () => {
  it('reads the locale catalog, not English, for a non-default locale', () => {
    const { t } = useTranslations(es, 'common');
    expect(t('nav.services')).toBe('Servicios');
    expect(t('nav.services')).not.toBe(EN.common['nav.services']);
  });

  it('throws — never falls back to English — when a non-default locale lacks a key', () => {
    const { t } = useTranslations(es, 'common');
    expect(() => t('definitely.missing' as never)).toThrow(
      /missing "common\.definitely\.missing".*"es"/
    );
  });

  it('serves English from the static import when its glob catalog is missing', () => {
    // A locale whose code is English but whose catalog lookup misses: the
    // static EN import is the fallback, and ONLY for the default locale.
    const ghost: Locale = { ...DEFAULT_LOCALE, code: 'en' };
    const { t } = useTranslations(ghost, 'common');
    expect(t('nav.services')).toBe(EN.common['nav.services']);
    expect(() => t('definitely.missing' as never)).toThrow(/missing/);
  });

  it('tHtml escapes params but not the catalog markup', () => {
    const { tHtml } = useTranslations(DEFAULT_LOCALE, 'hub');
    const out = tHtml('faq.a2', { mcpHref: '/x/?a=1&b="<>\'' });
    expect(out).toContain('<a href="/x/?a=1&amp;b=&quot;&lt;&gt;&#39;">');
    expect(out).toMatch(/<\/a>/);
  });

  it('exposes the locale and namespace it was made for', () => {
    const tr = useTranslations(es, 'about');
    expect(tr.locale).toBe(es);
    expect(tr.namespace).toBe('about');
  });
});
