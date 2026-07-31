/**
 * Indexability contracts — the pairing that keeps crawler signals coherent.
 *
 * Every page that renders `noindex` must also be excluded from the sitemap.
 * Submitting a URL while telling crawlers to drop it is a contradictory
 * signal, and the two facts live in different files, so nothing but a test
 * keeps them together.
 *
 * The filter is IMPORTED, not string-matched. `src/utils/` is inside
 * vitest.config.ts's coverage include at a 70% line threshold, so scanning it
 * as text would add an uncovered file while proving less. It also lets these
 * tests exercise the real absolute-URL contract rather than a paraphrase of it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { sitemapFilter, SITEMAP_EXCLUDED_PREFIXES } from '../../src/utils/sitemap-filter';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = 'https://globalstrategic.tech';

/** Pages that pass `noindex` to BaseLayout, and must therefore be excluded. */
const NOINDEX_PAGES = [
  { path: '/404', file: 'src/pages/404.astro' },
  { path: '/500', file: 'src/pages/500.astro' },
  { path: '/booking-confirmed', file: 'src/pages/booking-confirmed.astro' },
  { path: '/brand', file: 'src/pages/brand.astro' },
] as const;

const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf-8');

describe('sitemapFilter — absolute-URL contract', () => {
  it('receives absolute URLs and excludes by pathname, not substring', () => {
    expect(sitemapFilter(`${SITE}/brand/`)).toBe(false);
    expect(sitemapFilter(`${SITE}/`)).toBe(true);
    expect(sitemapFilter(`${SITE}/services/`)).toBe(true);
  });

  it('does not exclude a route that merely starts with an excluded prefix', () => {
    // The retired `page.includes('/brand')` implementation excluded this.
    expect(sitemapFilter(`${SITE}/brands-we-advise/`)).toBe(true);
    expect(sitemapFilter(`${SITE}/branding/`)).toBe(true);
  });

  it('treats the trailing slash as insignificant (site emits trailingSlash: true)', () => {
    for (const prefix of SITEMAP_EXCLUDED_PREFIXES) {
      expect(sitemapFilter(`${SITE}${prefix}`), `${prefix} without slash`).toBe(false);
      expect(sitemapFilter(`${SITE}${prefix}/`), `${prefix} with slash`).toBe(false);
    }
  });

  it('excludes nested paths under an excluded prefix', () => {
    expect(sitemapFilter(`${SITE}/brand/responsive-frame/`)).toBe(false);
  });

  it('fails open on a non-absolute value rather than emptying the sitemap', () => {
    // If the integration ever passes a bare path, an over-full sitemap is
    // recoverable; an empty one is an outage-shaped SEO regression.
    expect(sitemapFilter('/brand/')).toBe(true);
  });
});

describe('noindex ↔ sitemap pairing', () => {
  it.each(NOINDEX_PAGES)('$file renders noindex', ({ file }) => {
    const src = read(file);
    // Bare attribute or explicit `noindex={true}`; `noindex={false}` must not pass.
    expect(src).toMatch(/\bnoindex(\s|\/?>|=\{true\})/);
  });

  it.each(NOINDEX_PAGES)('$path is excluded from the sitemap', ({ path }) => {
    expect(sitemapFilter(`${SITE}${path}/`)).toBe(false);
  });

  it('SEO.astro emits noindex, follow — never noindex, nofollow', () => {
    const seo = read('src/components/SEO.astro');
    expect(seo).toContain("noindex ? 'noindex, follow' : 'index, follow'");
    expect(seo).not.toContain('noindex, nofollow');
  });

  it('BaseLayout forwards noindex to SEO', () => {
    // A prop declared but never forwarded is the silent failure this catches:
    // pages would set `noindex` and still emit `index, follow`.
    expect(read('src/layouts/BaseLayout.astro')).toContain('noindex={noindex}');
  });
});

describe('/colors — redirect, so exclusion is the only lever', () => {
  it('is a bare redirect with no layout to hang a noindex tag on', () => {
    const src = read('src/pages/colors.astro');
    expect(src).toContain('Astro.redirect');
    expect(src).not.toContain('BaseLayout');
  });

  it('is excluded from the sitemap', () => {
    expect(sitemapFilter(`${SITE}/colors/`)).toBe(false);
  });
});

describe('/hub/radar renders its feed inline', () => {
  const page = () => read('src/pages/hub/radar/index.astro');

  it('does not defer the feed to a server island', () => {
    // The indexability defect this branch exists to fix: under `server:defer`
    // the feed is absent from the initial HTML, and Googlebot judges the shell.
    // The behavioural guard is in tests/e2e/radar-page.test.ts; this is the
    // cheap source-level tripwire that fails the moment someone reinstates it.
    //
    // Match the DIRECTIVE ON THE COMPONENT, not the bare string: the page
    // docstring names `server:defer` in prose to explain why it must not come
    // back, and a naive `not.toContain('server:defer')` fails on that comment.
    expect(page()).not.toMatch(/<RadarFeed\b[^>]*\bserver:defer/);
  });

  it('still renders RadarFeed', () => {
    // Guards the other direction: `not.toContain('server:defer')` also passes
    // if the component is deleted outright.
    expect(page()).toContain('<RadarFeed');
  });
});

describe('critical-path fetch is bounded', () => {
  it('RadarFeed passes an AbortSignal timeout', () => {
    // Inlining put this on the critical path. undici defaults to 300s and the
    // function sets no maxDuration, so an unbounded call to a hung Worker
    // would 5xx the crawler this change exists to serve.
    expect(read('src/components/radar/RadarFeed.astro')).toMatch(
      /signal:\s*AbortSignal\.timeout\(\d+\)/
    );
  });
});
