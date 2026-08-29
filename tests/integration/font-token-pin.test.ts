/**
 * BL-144 — the guard that keeps the brand face pinned.
 *
 * `--font-family-mono` was the bare generic `monospace` for the life of the
 * repo, so the typeface a visitor saw was chosen by their OS. Advance widths
 * across the plausible resolutions differ by ~9%, and the site sizes fixed
 * geometry against that face: the sash's 45° chord clips rather than reflows,
 * grid floors are derived from a wire identifier's ink width, and a CTA label
 * fitted its button with 0.4px to spare. Pinning the token fixed all of it at
 * once — but a pin is a state, and this file is the rule that keeps it.
 *
 * Four failures, each one a way the pin has been undone before or could be:
 *
 *   1. A `--font-family*` token whose value is nothing but bare generics.
 *      That is the original defect; it must not come back under a new name.
 *   2. A literal family name outside the two files allowed to name one. Every
 *      other consumer goes through `var(--font-family*)`, which is what makes a
 *      future face change one `src` line instead of 449 declarations. This is
 *      how `CompositeLogo.astro` shipped `font-family="monospace"` on the SVG
 *      wordmark and nobody noticed for a year.
 *   3. A third-party font origin. The face is self-hosted; `font-src 'self'` in
 *      the CSP would reject anything else at runtime, and this fails it at build
 *      time instead, with a sentence explaining why.
 *   4. An mcp-server page whose mono stack starts with a generic. Worker-served
 *      HTML is on another origin and cannot fetch the site's font, so it inlines
 *      the `local()` metric-matched fallbacks instead — never a bare generic.
 *
 * Scope note: rule 2 covers the WEBSITE only. `mcp-server/` is a separate
 * workspace that cannot see `src/styles/variables.css`, so it names families
 * literally by necessity; rule 4 is what holds it to the same standard.
 *
 * Every rule asserts it actually probed something. A guard that walks an empty
 * file set passes forever and proves nothing.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');

/** The two files allowed to name a font family literally. */
const TOKEN_FILE = 'src/styles/variables.css';
const FONTS_FILE = 'src/styles/fonts.css';

/** Directories whose CSS is the website's own (rule 2's scope). */
const WEBSITE_DIRS = ['src'];
const SOURCE_EXT = new Set(['.css', '.astro', '.ts', '.tsx']);

/**
 * Sub-paths that are documentation, not shipped styling. `src/docs/` prose
 * quotes font stacks — including the pre-BL-144 ones, to say what changed — and
 * a doc is not a stylesheet.
 */
const IGNORED_SEGMENTS = ['src/docs/'];

interface SourceFile {
  rel: string;
  text: string;
}

/** Text assets under `public/` that can carry a font reference. */
const PUBLIC_EXT = new Set(['.svg', '.css', '.html', '.webmanifest']);

function walk(dir: string, out: SourceFile[] = [], exts: Set<string> = SOURCE_EXT): SourceFile[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).split(path.sep).join('/');
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.'))
        continue;
      walk(full, out, exts);
    } else if (exts.has(path.extname(entry.name))) {
      if (IGNORED_SEGMENTS.some((seg) => rel.startsWith(seg))) continue;
      out.push({ rel, text: fs.readFileSync(full, 'utf-8') });
    }
  }
  return out;
}

const websiteFiles = WEBSITE_DIRS.flatMap((d) => walk(path.join(ROOT, d)));

/**
 * Families that are generics, not faces: naming one of these is naming nothing
 * in particular. `ui-monospace` is included deliberately — it is a generic that
 * reads like a name.
 */
const GENERICS = new Set([
  'monospace',
  'sans-serif',
  'serif',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-monospace',
  'ui-sans-serif',
  'ui-serif',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
]);

/** Values that are references or keywords rather than a family list. */
const NON_FAMILY_VALUES = /^(inherit|initial|unset|revert|revert-layer)$/;

function familiesOf(value: string): string[] {
  return value
    .split(',')
    .map((f) => f.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

describe('BL-144: the pinned font token', () => {
  it('finds the source files it is supposed to be guarding', () => {
    // Vacuity guard: every rule below iterates this set.
    expect(websiteFiles.length).toBeGreaterThan(100);
    expect(websiteFiles.some((f) => f.rel === TOKEN_FILE)).toBe(true);
    expect(websiteFiles.some((f) => f.rel === FONTS_FILE)).toBe(true);
  });

  it('rule 1: no --font-family* token resolves to bare generics alone', () => {
    const declarations: { rel: string; name: string; value: string }[] = [];
    for (const file of websiteFiles) {
      for (const m of file.text.matchAll(/(--font-family[\w-]*)\s*:\s*([^;{}]+);/g)) {
        declarations.push({ rel: file.rel, name: m[1], value: m[2].trim() });
      }
    }
    // Both tokens exist and were seen — if a rename ever empties this, fail.
    expect(declarations.length).toBeGreaterThan(0);
    expect(declarations.some((d) => d.name === '--font-family-mono')).toBe(true);

    const offenders = declarations.filter((d) => {
      if (d.value.includes('var(')) return false;
      if (NON_FAMILY_VALUES.test(d.value)) return false;
      return familiesOf(d.value).every((f) => GENERICS.has(f.toLowerCase()));
    });
    expect(
      offenders.map((o) => `${o.rel}: ${o.name}: ${o.value}`),
      'a --font-family* token names no real face, so the visitor’s OS picks it — the BL-144 defect'
    ).toEqual([]);
  });

  it('rule 2: only the token and fonts files name a family literally', () => {
    // A family can be named four ways, and the first version of this rule knew
    // only one of them. Each of the others hid a real literal: the `=` form is
    // an SVG presentation attribute (the wordmark shipped `font-family="monospace"`);
    // `family:` is Chart.js's key, which carried `'Helvetica Neue', Arial,
    // sans-serif` as a fallback long after that stopped being the site's sans;
    // and the `font:` shorthand is how the Worker shell set its body face. A
    // rule that reads only `font-family:` reports a clean sweep it did not do.
    const PATTERNS: [string, RegExp][] = [
      ['font-family', /font-family\s*[:=]\s*"?([^;"}\n]+)"?/g],
      // `(?<!-)` matters: a bare \b would match inside `font-family:` (the
      // hyphen is a word boundary) and report every CSS declaration twice.
      ['family (Chart.js)', /(?<!-)\bfamily\s*:\s*([^,\n]*"[^"]+"|'[^']+'|[^,\n]+),?\s*$/gm],
      [
        'font (shorthand)',
        /(?<!-)\bfont\s*:\s*[^;{}\n]*?((?:["'][^"']+["']|[A-Za-z][\w-]*)(?:\s*,\s*(?:["'][^"']+["']|[A-Za-z][\w-]*))*)\s*[;}]/g,
      ],
    ];

    const offenders: string[] = [];
    let probed = 0;
    for (const file of websiteFiles) {
      if (file.rel === TOKEN_FILE || file.rel === FONTS_FILE) continue;
      for (const [kind, pattern] of PATTERNS) {
        for (const m of file.text.matchAll(pattern)) {
          const value = m[1].trim().replace(/^["']|["']$/g, '');
          if (!value) continue;
          probed++;
          if (value.includes('var(')) continue;
          if (NON_FAMILY_VALUES.test(value)) continue;
          if (
            value.includes('${') ||
            /\b(getStyle|chartFontFamily|CHART_FONT_FALLBACK)\b/.test(value)
          ) {
            continue; // resolved from the token at runtime, or the named fallback
          }
          // The `font:` shorthand's tail is the family list; a shorthand with a
          // size but no family (`font: inherit`) has nothing to check.
          if (kind === 'font (shorthand)' && /^\d/.test(value)) continue;
          offenders.push(`${file.rel}: ${kind}: ${value}`);
        }
      }
    }
    expect(probed, 'the patterns above must actually match something').toBeGreaterThan(50);
    expect(
      offenders,
      'a font family is named directly instead of going through var(--font-family*)'
    ).toEqual([]);
  });

  it('rule 3: the face is self-hosted — no third-party font origin', () => {
    // `public/` is in scope, and not as an afterthought: the violation this rule
    // was written against was an `@import url(…)` of Google's font CDN inside
    // `public/images/icon.svg`, the PWA/favicon mark. A `src/`-only sweep walked
    // straight past it.
    const scanned = [...websiteFiles, ...walk(path.join(ROOT, 'public'), [], PUBLIC_EXT)];
    expect(scanned.length).toBeGreaterThan(websiteFiles.length);

    const offenders: string[] = [];
    for (const file of scanned) {
      for (const m of file.text.matchAll(
        /(fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net|cdn\.jsdelivr\.net\/fontsource|@fontsource)/g
      )) {
        offenders.push(`${file.rel}: ${m[1]}`);
      }
    }
    expect(
      offenders,
      'fonts are served from our own origin; the CSP sends font-src "self"'
    ).toEqual([]);
  });

  it('rule 3b: the pinned face is declared, shipped, and preloaded exactly once', () => {
    const fonts = fs.readFileSync(path.join(ROOT, FONTS_FILE), 'utf-8');
    const url = fonts.match(/src:\s*url\('([^']+)'\)/);
    expect(url, 'fonts.css declares the pinned face with a url() src').not.toBeNull();

    const file = path.join(ROOT, 'public', url![1].replace(/^\//, ''));
    expect(fs.existsSync(file), `${url![1]} is missing from public/`).toBe(true);
    // A variable woff2 subset — big enough to be real, small enough to be a subset.
    const bytes = fs.statSync(file).size;
    expect(bytes).toBeGreaterThan(5_000);
    expect(bytes).toBeLessThan(60_000);

    expect(
      fs.existsSync(path.join(ROOT, 'public/fonts/GEIST-MONO-OFL.txt')),
      'OFL 1.1 attribution ships with the font'
    ).toBe(true);

    const layout = fs.readFileSync(path.join(ROOT, 'src/layouts/BaseLayout.astro'), 'utf-8');
    const preloads = [...layout.matchAll(/rel="preload"[^>]*as="font"/g)];
    expect(
      preloads.length,
      'exactly one font preload — the fallbacks are local() and have nothing to fetch'
    ).toBe(1);
    expect(layout).toContain(url![1]);
    expect(
      layout,
      'a font preload is CORS-mode even same-origin; without crossorigin it is fetched twice'
    ).toMatch(/rel="preload"[^>]*as="font"[^>]*crossorigin/);
  });

  it('rule 4: mcp-server pages resolve a real face before any generic', () => {
    const shells = [
      'mcp-server/src/lib/html-shell.ts',
      'mcp-server/src/observability/status-page.ts',
    ];
    let probed = 0;
    for (const rel of shells) {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
      for (const m of text.matchAll(/font-family:\s*([^;}\n]+)[;}]/g)) {
        const value = m[1].trim();
        if (value.includes('${')) continue; // shared constant, checked below
        probed++;
        const first = familiesOf(value)[0] ?? '';
        expect(GENERICS.has(first.toLowerCase()), `${rel}: "${value}" leads with a generic`).toBe(
          false
        );
      }
      // Either the file declares the faces or it pulls in the shared constant
      // that does — status-page.ts builds its own <head> and imports them.
      expect(
        text.includes('GST Mono Fallback') || text.includes('MONO_FALLBACK_FACES'),
        `${rel} neither declares the metric-matched fallback faces nor imports them`
      ).toBe(true);
    }
    // The shells share one stack constant; prove it exists and leads with a face.
    const shared = fs.readFileSync(path.join(ROOT, shells[0]), 'utf-8');
    const stack = shared.match(/MONO_STACK\s*=\s*`([^`]+)`/);
    expect(stack).not.toBeNull();
    expect(GENERICS.has(familiesOf(stack![1])[0].toLowerCase())).toBe(false);
    // `probed` itself, not `probed + 1`: the original wrote the latter, which is
    // true for every possible value and therefore asserted nothing — the exact
    // shape of vacuity the rest of this file is careful about.
    expect(probed, 'the shells must actually declare font families to check').toBeGreaterThan(0);
  });

  it('the metric-matched fallbacks agree across the workspace boundary', () => {
    // fonts.css and the Worker shell each declare the same two faces, because
    // mcp-server cannot import the website's CSS. Nothing structural keeps the
    // percentages equal, so this does: a size-adjust that drifts on one side
    // means Worker-served HTML lays out at different metrics from the site it
    // belongs to, which is silent and would never be noticed by eye.
    const parse = (text: string) =>
      [
        ...text.matchAll(
          /font-family:\s*'(GST Mono Fallback[^']*)'[\s\S]{0,400}?size-adjust:\s*([\d.]+%)/g
        ),
      ].map((m) => `${m[1]} = ${m[2]}`);

    const site = parse(fs.readFileSync(path.join(ROOT, FONTS_FILE), 'utf-8'));
    const worker = parse(
      fs.readFileSync(path.join(ROOT, 'mcp-server/src/lib/html-shell.ts'), 'utf-8')
    );

    expect(site, 'fonts.css declares both fallback faces with a size-adjust').toHaveLength(2);
    expect(worker, 'the Worker shell declares both fallback faces with a size-adjust').toHaveLength(
      2
    );
    expect(worker, 'the Worker shell must use the same size-adjust values as fonts.css').toEqual(
      site
    );
  });
});
