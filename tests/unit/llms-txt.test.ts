/**
 * `public/llms.txt` — the agent-facing site index.
 *
 * It is a hand-written list of URLs, and a hand-written list of URLs rots.
 * Every website link in it is checked against the routes that actually exist
 * under `src/pages/`, the sitemap exclusion list (a page kept out of the
 * sitemap should not be advertised to agents either), and the one published
 * address rule for MCP documentation (ADR-0023).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

import { sitemapFilter } from '../../src/utils/sitemap-filter';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAGES_DIR = join(REPO_ROOT, 'src', 'pages');
const PUBLIC_DIR = join(REPO_ROOT, 'public');
const SITE = 'https://globalstrategic.tech';

const llms = readFileSync(join(PUBLIC_DIR, 'llms.txt'), 'utf-8');

/** Recursive .astro walk — no glob library is a dependency of this repo, by design. */
function walkAstro(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return walkAstro(full);
    return e.isFile() && e.name.endsWith('.astro') ? [full] : [];
  });
}

/** `src/pages/hub/mcp/index.astro` → `/hub/mcp/` ; `src/pages/about.astro` → `/about/` */
function routeOf(absFile: string): string {
  const rel = relative(PAGES_DIR, absFile)
    .split(sep)
    .join('/')
    .replace(/\.astro$/, '');
  return rel === 'index' ? '/' : `/${rel.replace(/\/index$/, '')}/`;
}

const ROUTES = new Set(walkAstro(PAGES_DIR).map(routeOf));

const urls = [...llms.matchAll(/https?:\/\/[^\s)]+/g)].map((m) => m[0]);
const siteUrls = urls.filter((u) => u.startsWith(`${SITE}/`));

describe('public/llms.txt', () => {
  it('opens with the H1 and blockquote summary the llms.txt convention expects', () => {
    const [first, , third] = llms.split('\n');
    expect(first).toMatch(/^# /);
    expect(third).toMatch(/^> /);
  });

  it('links the MCP landing page, the capability reference and the endpoint', () => {
    expect(siteUrls).toContain(`${SITE}/hub/mcp/`);
    expect(siteUrls).toContain(`${SITE}/hub/mcp/docs/`);
    expect(urls).toContain('https://mcp.globalstrategic.tech/mcp');
  });

  it('never names the docs subdomain (ADR-0023: one published address)', () => {
    expect(llms).not.toContain('docs.mcp.globalstrategic.tech');
  });

  it.each(siteUrls)('%s resolves to a page route or a public file', (url) => {
    const path = url.slice(SITE.length);
    // The generated sitemap index is the one URL that is neither a page nor a
    // checked-in public file.
    if (path === '/sitemap-index.xml') return;
    const asPublicFile = existsSync(join(PUBLIC_DIR, ...path.split('/').filter(Boolean)));
    expect(ROUTES.has(path) || asPublicFile, `${path} is not a route`).toBe(true);
  });

  it.each(siteUrls)('%s is a page the sitemap also publishes', (url) => {
    expect(sitemapFilter(url)).toBe(true);
  });

  it('uses trailing-slash page URLs (vercel.json canonicalization)', () => {
    const pages = siteUrls.filter((u) => !/\.[a-z]+$/.test(u));
    expect(pages.filter((u) => !u.endsWith('/'))).toEqual([]);
  });
});
