#!/usr/bin/env node
// Publish the site chrome to claude.ai/design by EXTRACTION, not by hand
// (BL-135 Slice 3).
//
// ~72% of the site's CSS is Astro-scoped (`[data-astro-cid-*]` rules) and never
// reaches the published styles.css, so the design agent cannot see Header,
// Hero, Footer, the home-page sections, CTA, StatsBar, Breadcrumb or the hub
// tools landing (TOC's classes are global; its card is a markup sample).
// Hand-writing React copies of those components is forbidden
// (CLAUDE_DESIGN_SYNC.md — they drift). This script instead slices the
// PRODUCTION BUILD: `npm run build` renders every real component into
// dist/client/**/index.html with its scoped CSS in the page's linked
// /_astro/*.css sheets AND its inline <style> blocks. Each slice becomes a
// static @dsCard under ds-bundle/components/chrome/<Name>/ — the markup IS
// production output, so nothing can drift.
//
// /brand is deliberately NOT a source: several of its families are documented
// replicas (STYLES_GUIDE § "How a specimen relates to what ships"), and its
// slices carry gallery scaffolding. Every real component the agent needs
// renders on a production route.
//
// ORDER MATTERS (see NOTES.md): run AFTER `resync.mjs` (package-build wipes
// ds-bundle/ and validate runs green on the specimens) and do NOT re-run
// package-validate afterwards — it compares the .html count under components/
// to componentCount and the chrome cards make that a (harmless, expected)
// mismatch. This script carries its own checks instead: marker first line,
// <link href> resolves, non-empty slice, ≥1 matched scoped rule for a slice
// that has cids, and — with --check — a Playwright render of every card with
// the validator's own floors (height ≥ 8px, screenshot ≥ 5000 bytes) plus the
// assertion that each dark twin resolves --bg-light to a value different from
// its own light sibling's (measured, not a literal copied from variables.css).
//
// Usage (repo root):  node .design-sync/extract-chrome.mjs [--check]
/* global document, getComputedStyle -- page.evaluate() callbacks run in the browser. */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { transform, browserslistToTargets } from 'lightningcss';
import browserslist from 'browserslist';
import { inlineRootUrls } from './lib/inline-urls.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const DIST = join(REPO, 'dist', 'client');
const OUT = join(REPO, 'ds-bundle');
const GROUP = 'chrome';
const CHECK = process.argv.includes('--check');

// The slice list. `page` is a route under dist/client/, `selector` a CSS
// selector that must match exactly one element on it. `dark: true` also emits
// a `<Name>Dark` twin with html.dark-theme. `source` is the .astro that owns
// the markup (goes into the prompt.md so the agent — and a reader — can trace
// it). tests/integration/design-sync-guards.test.ts asserts every entry still
// resolves to source (guard 4) so a rename fails CI before anyone re-syncs.
export const SLICES = [
  {
    name: 'SiteHeader',
    page: 'index.html',
    selector: 'header.site-header',
    source: 'src/components/Header.astro',
    dark: true,
    title: 'Site header',
    note: 'Sticky, full-width; nav links rewritten to "#". Theme toggle is a static button here (its script is not included).',
  },
  {
    name: 'Hero',
    page: 'index.html',
    selector: 'section.hero',
    source: 'src/components/Hero.astro',
    dark: true,
    title: 'Hero (home)',
    note: 'The signature headline band. Sizes/weights are scoped rules — copy the CSS block with the markup.',
  },
  {
    name: 'WhoWeSupport',
    page: 'index.html',
    selector: 'section.who-we-support',
    source: 'src/components/WhoWeSupport.astro',
    dark: true,
    title: 'Who we support (section)',
  },
  {
    name: 'WhatWeDo',
    page: 'index.html',
    selector: 'section.what-we-do',
    source: 'src/components/WhatWeDo.astro',
    dark: true,
    title: 'What we do (section)',
  },
  {
    name: 'WhyClientsTrustUs',
    page: 'index.html',
    selector: 'section.why-clients-trust-us',
    source: 'src/components/WhyClientsTrustUs.astro',
    dark: true,
    title: 'Why clients trust us (section)',
  },
  {
    name: 'CtaSection',
    page: 'index.html',
    selector: 'section.cta-section',
    source: 'src/components/CTASection.astro',
    dark: true,
    title: 'CTA section',
  },
  {
    name: 'SiteFooter',
    page: 'index.html',
    selector: 'footer[role="contentinfo"]',
    source: 'src/components/Footer.astro',
    dark: true,
    title: 'Site footer',
  },
  {
    name: 'Breadcrumb',
    page: 'about/index.html',
    selector: 'nav.breadcrumb',
    source: 'src/components/Breadcrumb.astro',
    title: 'Breadcrumb (real component)',
  },
  {
    name: 'StatsBar',
    page: 'ma-portfolio/index.html',
    selector: 'section.stats-bar',
    source: 'src/components/StatsBar.astro',
    title: 'Stats bar',
  },
  {
    name: 'EngagementFlow',
    page: 'services/index.html',
    selector: 'section.engagement-flow',
    source: 'src/components/EngagementFlow.astro',
    title: 'Engagement flow (section)',
  },
  {
    name: 'HubToolsLanding',
    page: 'hub/tools/index.html',
    selector: 'section.tools-section',
    // The page body moved to the shared locale template in BL-153; the route
    // file src/pages/hub/tools/index.astro is now a one-line wrapper.
    source: 'src/page-templates/HubToolsPage.astro',
    title: 'Hub tools landing (section)',
    note: 'The hub header + gateway grid as a page section — how the class-level gateway cards compose into a landing page.',
  },
  {
    name: 'TableOfContents',
    page: 'hub/library/vdr-structure/index.html',
    selector: 'nav.toc',
    source: 'src/components/TableOfContents.astro',
    title: 'Table of contents',
    note: 'Static render — the scroll-spy and collapse script are not included. Its classes are global (toc.css, already in styles.css); this card exists for the markup shape.',
  },
];

if (!existsSync(DIST)) {
  console.error(`[CHROME] ${DIST} not found — run \`npm run build\` first.`);
  process.exit(1);
}
if (!existsSync(join(OUT, 'styles.css'))) {
  console.error(`[CHROME] ${OUT}/styles.css not found — run the resync (package-build) first.`);
  process.exit(1);
}

const targets = browserslistToTargets(browserslist(undefined, { path: REPO }));
const pageCache = new Map();
function loadPage(page) {
  if (pageCache.has(page)) return pageCache.get(page);
  const file = join(DIST, page);
  if (!existsSync(file)) {
    console.error(`[CHROME] page missing from the build: ${page}`);
    process.exit(1);
  }
  const html = readFileSync(file, 'utf8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  // Page CSS = linked /_astro sheets ∪ inline <style> blocks (Hero and CTA
  // rules live ONLY inline — verified on the built home page).
  const linked = [...doc.querySelectorAll('link[rel="stylesheet"][href^="/"]')].map((l) => {
    const p = join(DIST, l.getAttribute('href'));
    if (!existsSync(p)) {
      console.error(
        `[CHROME] ${page}: linked stylesheet missing from the build: ${l.getAttribute('href')}`
      );
      process.exit(1);
    }
    return readFileSync(p, 'utf8');
  });
  const inline = [...doc.querySelectorAll('style')].map((s) => s.textContent ?? '');
  const entry = { doc, css: [...linked, ...inline].join('\n') };
  pageCache.set(page, entry);
  return entry;
}

// Keep only style rules whose selector list mentions one of the slice's cids.
// Nested @media rules are visited too; emptied at-rules are dropped by
// lightningcss. targets = the repo browserslist so `max-width` media queries
// are not rewritten to range syntax.
function scopedCssFor(css, cids) {
  let kept = 0;
  const out = transform({
    filename: 'page.css',
    code: Buffer.from(css),
    minify: false,
    targets,
    visitor: {
      Rule: {
        style(rule) {
          // Structural walk: any attribute component named after one of the
          // slice's cids (no string-includes false positives).
          const hit = rule.value.selectors.some((sel) =>
            sel.some((c) => c.type === 'attribute' && cids.includes(c.name))
          );
          if (hit) kept++;
          // undefined = keep unchanged (returning the rule object itself
          // round-trips through a deserializer that rejects some selectors).
          return hit ? undefined : [];
        },
      },
    },
  });
  return { css: tidy(out.code.toString()), kept };
}

// lightningcss (minify:false) leaves the shells of at-rules whose every child
// was filtered out, and passes @keyframes through untouched. Drop empty
// at-rule blocks (repeat — they nest) and any @keyframes no kept rule animates.
function tidy(css) {
  let prev;
  do {
    prev = css;
    css = css.replace(/@[a-z-]+[^{}]*\{\s*\}\s*/g, '');
  } while (css !== prev);
  const animated = new Set(
    [...css.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)].flatMap((m) => m[1].split(/[\s,]+/))
  );
  css = css.replace(/@keyframes\s+([\w-]+)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}\s*/g, (whole, name) =>
    animated.has(name) ? whole : ''
  );
  return css.trim() + '\n';
}

function cidsIn(el) {
  const set = new Set();
  for (const node of [el, ...el.querySelectorAll('*')]) {
    for (const a of node.attributes) if (a.name.startsWith('data-astro-cid-')) set.add(a.name);
  }
  return [...set];
}

// Links go to "#" and inline on* handlers (analytics hooks like
// onclick="trackCTA(...)") are dropped — a design must never emit a real
// tracking event (the same rule /brand's specimens follow).
function neutralise(el) {
  for (const a of el.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') ?? '';
    if (!href.startsWith('#')) a.setAttribute('href', '#');
  }
  for (const node of [el, ...el.querySelectorAll('*')]) {
    for (const attr of [...node.attributes])
      if (/^on[a-z]+$/i.test(attr.name)) node.removeAttribute(attr.name);
  }
  // Astro emits hydration <script type="module" src="/_astro/…"> tags inline
  // next to island components (Footer carries ThemeToggle's). They 404 in the
  // design environment and contradict "hydrated behaviour is not included".
  // Same for stray <link>/<style> — the card supplies its own.
  for (const node of el.querySelectorAll('script, link, style')) node.remove();
}

function card({ dark, title, cssText, markup }) {
  return `<!-- @dsCard group="${GROUP}" -->
<!doctype html>
<html${dark ? ' class="dark-theme"' : ''}><head><meta charset="utf-8">
  <title>${title}${dark ? ' — dark' : ''}</title>
  <link rel="stylesheet" href="../../../styles.css">
  <style>
    /* GST chrome card — rendered production markup + the scoped rules it needs. */
    /* A gutter like the specimen cards have (Stack padding). Note it does NOT
       lift a small slice above the blank-png floor — white space compresses to
       nothing (measured: +9 bytes); the floor is met by content, not padding. */
    body{margin:0;padding:var(--spacing-lg);background:var(--bg-light);color:var(--text-primary)}
${cssText}
  </style>
</head><body>
  <div id="root">
${markup}
  </div>
</body></html>
`;
}

function promptMd(s, markup, cssText) {
  return `**Rendered production markup — ${s.title}.** Extracted from the built \`/${s.page.replace(/index\.html$/, '')}\` page; owned by \`${s.source}\`.${s.note ? ` ${s.note}` : ''}

Copy the markup **and** the CSS block below. Keep the \`data-astro-cid-*\` attributes — the rules key on them (that is how Astro scopes a component's styles). Everything else it needs comes from \`styles.css\` (tokens, \`.brutal-*\` classes). Hydrated behaviour is not included. This is how a GST **page** is built; the specimen galleries show the class-level pieces.

\`\`\`html
${markup}
\`\`\`

\`\`\`css
${cssText}
\`\`\`
`;
}

const chromeDir = join(OUT, 'components', GROUP);
rmSync(chromeDir, { recursive: true, force: true });
mkdirSync(chromeDir, { recursive: true });

const emitted = [];
for (const s of SLICES) {
  const { doc, css } = loadPage(s.page);
  const matches = doc.querySelectorAll(s.selector);
  if (matches.length !== 1) {
    console.error(
      `[CHROME] ${s.name}: selector "${s.selector}" matched ${matches.length} element(s) on ${s.page} (want exactly 1)`
    );
    process.exit(1);
  }
  const el = matches[0].cloneNode(true);
  neutralise(el);
  const cids = cidsIn(el);
  const { css: scoped, kept } = scopedCssFor(css, cids);
  const { css: cssText, inlined } = inlineRootUrls(scoped, DIST, (m) =>
    console.error(`  ${s.name}: ${m}`)
  );
  if (cids.length && kept === 0) {
    console.error(
      `[CHROME] ${s.name}: has ${cids.length} cid(s) but zero scoped rules matched — would ship unstyled`
    );
    process.exit(1);
  }
  const markup = el.outerHTML.trim();
  if (markup.length < 40) {
    console.error(`[CHROME] ${s.name}: slice is empty`);
    process.exit(1);
  }
  const variants = [
    { name: s.name, dark: false },
    ...(s.dark ? [{ name: `${s.name}Dark`, dark: true }] : []),
  ];
  for (const v of variants) {
    const dir = join(chromeDir, v.name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `${v.name}.html`),
      card({ dark: v.dark, title: s.title, cssText, markup })
    );
    writeFileSync(join(dir, `${v.name}.prompt.md`), promptMd(s, markup, cssText));
    emitted.push({ ...v, dir, kept, cids: cids.length, inlined });
  }
}

// Own checks (the validator must not run after this — see header comment).
for (const e of emitted) {
  const html = readFileSync(join(e.dir, `${e.name}.html`), 'utf8');
  if (!/^<!--\s*@dsCard\s+group="[^"]*"[^>]*-->/.test(html.split('\n', 1)[0]))
    throw new Error(`${e.name}: bad @dsCard first line`);
  for (const m of html.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g)) {
    if (!existsSync(resolve(e.dir, m[1])))
      throw new Error(`${e.name}: <link href="${m[1]}"> does not resolve`);
  }
  const prompt = readFileSync(join(e.dir, `${e.name}.prompt.md`), 'utf8');
  if (!prompt.split('\n', 1)[0].trim()) throw new Error(`${e.name}: empty prompt first line`);
}
console.error(`[CHROME] ${emitted.length} card(s) → ${chromeDir}`);
for (const e of emitted)
  console.error(
    `  ${e.name.padEnd(24)} rules=${String(e.kept).padStart(3)} cids=${e.cids} inlined=${e.inlined}${e.dark ? '  (dark)' : ''}`
  );

if (CHECK) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  // Like package-validate: a card that throws or logs an error (a dead
  // <script src>, a 404'd asset) is not a clean render even if it paints.
  let errs = [];
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(`console: ${m.text()}`);
  });
  page.on('requestfailed', (r) => errs.push(`requestfailed: ${r.url()}`));
  mkdirSync(join(OUT, '_screenshots'), { recursive: true });
  let bad = 0;
  // --bg-light as each light card resolved it, keyed by name. A dark twin
  // (`<Name>Dark`, always emitted after `<Name>`) passes when its value differs
  // from its own light sibling's — no dark literal duplicated from variables.css.
  const lightBg = new Map();
  for (const e of emitted) {
    errs = [];
    await page.goto(pathToFileURL(join(e.dir, `${e.name}.html`)).href, {
      waitUntil: 'networkidle',
    });
    const r = await page.evaluate(() => {
      const root = document.getElementById('root');
      const cs = getComputedStyle(document.documentElement);
      return {
        h: root ? root.getBoundingClientRect().height : 0,
        bg: cs.getPropertyValue('--bg-light').trim(),
        bodyBg: getComputedStyle(document.body).backgroundColor,
      };
    });
    const shot = join(OUT, '_screenshots', `chrome__${e.name}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    // Same floors as package-validate.mjs: collapsed < 8px, blank png < 5000 bytes.
    const bytes = readFileSync(shot).length;
    if (!e.dark) lightBg.set(e.name, r.bg);
    const sibling = e.dark ? lightBg.get(e.name.replace(/Dark$/, '')) : undefined;
    const darkOk = !e.dark || (Boolean(r.bg) && sibling !== undefined && r.bg !== sibling);
    const ok = r.h >= 8 && bytes >= 5000 && errs.length === 0 && darkOk;
    if (!ok) bad++;
    console.error(
      `  ${ok ? '✓' : '✗'} ${e.name.padEnd(24)} height=${Math.round(r.h)} png=${bytes}B --bg-light=${r.bg} body=${r.bodyBg}${errs.length ? `  ERRORS: ${errs.join(' | ')}` : ''}`
    );
  }
  await browser.close();
  console.error(
    bad
      ? `[CHROME] CHECK FAILED: ${bad} card(s)`
      : `[CHROME] check: ${emitted.length}/${emitted.length} cards render; dark twins resolve dark`
  );
  process.exit(bad ? 1 : 0);
}
