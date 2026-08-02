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
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

import { sitemapFilter, SITEMAP_EXCLUDED_PREFIXES } from '../../src/utils/sitemap-filter';
// Imported, not hardcoded: the drift guard below is only meaningful if it
// tracks the same category list the page renders pills from.
import { CATEGORIES } from '../../src/lib/inoreader/transform';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAGES_DIR = join(REPO_ROOT, 'src', 'pages');
const SITE = 'https://globalstrategic.tech';

const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf-8');

/** Recursive .astro walk — no glob library is a dependency of this repo, by design. */
function walkAstro(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return walkAstro(full);
    return e.isFile() && e.name.endsWith('.astro') ? [full] : [];
  });
}

/** `src/pages/hub/radar/index.astro` → `/hub/radar` ; `src/pages/404.astro` → `/404` */
function routeOf(absFile: string): string {
  const rel = relative(PAGES_DIR, absFile)
    .split(sep)
    .join('/')
    .replace(/\.astro$/, '');
  const route = rel === 'index' ? '/' : `/${rel.replace(/\/index$/, '')}`;
  return route;
}

/**
 * Every page that passes `noindex` to BaseLayout, DISCOVERED rather than
 * hardcoded. A hardcoded list only re-checks pages someone remembered to add,
 * so a fifth noindex page shipped without a sitemap entry would pass the whole
 * suite — which is the exact contradictory signal this file exists to prevent.
 */
const NOINDEX_PAGES = walkAstro(PAGES_DIR)
  .filter((f) => /<BaseLayout[^>]*\bnoindex(\s|\/?>|=\{true\})/s.test(readFileSync(f, 'utf-8')))
  .map((f) => ({ path: routeOf(f), file: relative(REPO_ROOT, f).split(sep).join('/') }));

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
    // BL-097 moved the frame partials a level deeper; still noindex, still out.
    expect(sitemapFilter(`${SITE}/brand/responsive-frame/cards/`)).toBe(false);
  });

  it('also handles a bare pathname, so a contract drift is a no-op', () => {
    // Resolved against a dummy base, so the integration switching from
    // absolute URLs to pathnames keeps working rather than silently disabling
    // every exclusion — no fail-open branch to reason about.
    expect(sitemapFilter('/brand/')).toBe(false);
    expect(sitemapFilter('/services/')).toBe(true);
  });
});

describe('noindex ↔ sitemap pairing', () => {
  it('discovers the noindex pages rather than trusting a hardcoded list', () => {
    // Guards the discovery itself: a regex that silently stopped matching
    // would make every pairing assertion below vacuous.
    expect(NOINDEX_PAGES.map((p) => p.path).sort()).toEqual([
      '/404',
      '/500',
      '/booking-confirmed',
      '/brand',
      '/hub/radar',
    ]);
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

describe('/hub/radar defers its feed to a server island', () => {
  const page = () => read('src/pages/hub/radar/index.astro');

  it('renders RadarFeed with server:defer', () => {
    // Deferring primary content is normally an indexability defect — it is
    // acceptable HERE, and only here, because the page is `noindex` (ADR-0012).
    // The island buys self-healing: `/_server-islands/*` routes to the uncached
    // function, so a failed fetch does not persist in an ISR entry.
    //
    // Match the DIRECTIVE ON THE COMPONENT, not the bare string: the page
    // docstring names `server:defer` in prose, so a bare `toContain` would
    // pass on the comment alone.
    expect(page()).toMatch(/<RadarFeed\b[^>]*\bserver:defer/);
  });

  it('supplies the skeleton as the island fallback', () => {
    // Guards the other direction: an island with no fallback renders nothing
    // at all while it loads.
    expect(page()).toMatch(/<RadarFeedSkeleton\b[^>]*\bslot="fallback"/);
  });

  it('is paired with noindex, since the island defers primary content', () => {
    // The coupling ADR-0012 records: `server:defer` here is only defensible
    // while this page stays out of the index. If someone removes `noindex`,
    // this fails and sends them to the ADR rather than letting the page
    // silently go back to being judged on its shell.
    expect(page()).toMatch(/<BaseLayout[^>]*\bnoindex(\s|\/?>|=\{true\})/s);
  });
});

describe('category filter survives island timing', () => {
  const page = () => read('src/pages/hub/radar/index.astro');

  it('has one CSS rule per category, driven by an ancestor attribute', () => {
    // Drift guard. The rules are literal (CSS cannot compare two elements'
    // attribute values, and generating them would forfeit Astro scoping), so
    // a fifth category could ship with no rule and simply never filter. This
    // is the single failure mode literal rules have.
    const src = page();
    for (const key of Object.keys(CATEGORIES)) {
      expect(
        src,
        `no [data-active-category='${key}'] rule — a category was added without a filter rule`
      ).toContain(`[data-active-category='${key}']`);
    }
  });

  it('scopes the item selector with :global()', () => {
    // Astro scopes every compound it compiles, and no element carries two
    // scope ids — so an unscoped [data-category] here would be rewritten to
    // match only elements declared in this file, never the <article>s that
    // FyiItem/WireItem render. The rule would compile to dead CSS and the
    // filter would silently stop working.
    expect(page()).toMatch(/:global\(\[data-category\]:not\(\[data-category='[\w-]+'\]\)\)/);
  });

  it('CategoryFilter sets the attribute rather than reaching for items', () => {
    // The bug this design exists to prevent: hydration runs at
    // DOMContentLoaded, before the island's items exist, so anything that
    // queries [data-category] on load activates the pill and filters nothing.
    const filter = read('src/components/radar/CategoryFilter.astro');
    expect(filter).toContain('dataset.activeCategory');
    expect(filter).not.toContain("querySelectorAll('[data-category]')");
  });
});

describe('island fetch is bounded', () => {
  it('RadarFeed passes an AbortSignal timeout', () => {
    // undici defaults to 300s and the island function sets no maxDuration, so
    // an unbounded call to a hung Worker holds a serverless invocation open
    // for the full default. True of the island exactly as of the inline render.
    expect(read('src/components/radar/RadarFeed.astro')).toMatch(
      /signal:\s*AbortSignal\.timeout\(\d+\)/
    );
  });
});
