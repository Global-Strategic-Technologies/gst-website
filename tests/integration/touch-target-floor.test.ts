/**
 * Touch-target floor guard — no rule may resolve a button below `--touch-target-min`.
 *
 * `.brutal-btn` shipped for a long time with no `min-height` at all, computing to
 * 33px while `/brand` captioned the specimen "meets minimum" and BRAND_GUIDELINES
 * claimed every button met WCAG 2.5.5. Adding the floor to the base rule is not
 * enough on its own: a page-local rule with higher specificity silently wins, and
 * two already did — `.brutal-choice-btn--unsure` at 36px (the ICG wizard's live
 * "Not sure" answer) and `.tool-action-bar .brutal-btn--secondary` at 40px inside
 * techpar's mobile media query. Neither produced a lint error, a type error, or a
 * failing test.
 *
 * E2E cannot cover this: the tool pages' buttons only exist after multi-step wizard
 * interaction, and the techpar rule applies only under a mobile media query. So the
 * check is a source scan.
 *
 * Scope decisions:
 *   - Scans `src/styles/**\/*.css` plus `<style>` blocks extracted from `src/**\/*.astro`.
 *     The Astro half is load-bearing — the techpar regression this exists for lives in
 *     a scoped `<style>` block, so a CSS-only scan would miss it.
 *   - `src/docs/` is excluded: its markdown fences legitimately contain `.brutal-btn`
 *     example rules.
 *   - `var()` values are RESOLVED against the `:root` token map, not skipped. The
 *     floor token is conformant by construction, but a declaration pointed at some
 *     other token could resolve anywhere, and blanket-skipping `var(` would wave a
 *     32px one through in silence.
 *   - Only `min-height` / `min-width` are checked. A fixed `height` below the floor is
 *     a different (and rarer) shape; see BL-096.
 *   - `min-width: 0` IS flagged, even though it is a common flex-shrink idiom rather
 *     than a touch-target statement. On a guarded selector it is worth a look, and a
 *     deliberate one can say so in the same breath as widening this comment.
 *   - Native CSS nesting would defeat the innermost-brace match (an outer declaration
 *     gets absorbed into the nested rule's prelude). The repo uses none today; if that
 *     changes, this parser needs revisiting before it can be trusted.
 *
 * Structural limit worth knowing: this is a DECLARED-VALUE scan. It can only judge a
 * declaration that exists, so it catches an override that resolves too low — it can
 * never catch a component with no floor at all, which is exactly how `.brutal-btn`
 * sat at 33px. That gap belongs to the /brand geometry E2E, not here.
 *
 * No CSS parsing library is a dependency of this repo (by design — see
 * `docs-link-integrity.test.ts`), so the scanner is hand-rolled and proven against
 * red/green fixtures below.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SRC_DIR = resolve(REPO_ROOT, 'src');
const VARIABLES_CSS = resolve(REPO_ROOT, 'src/styles/variables.css');

/**
 * Selectors targeting a component BRAND_GUIDELINES claims meets the floor.
 *
 * Keep this in step with that claim — the failure this guard exists to prevent is a
 * doc asserting a floor no instrument enforces. `.cta-button` is here because the
 * docs name it, even though it currently clears 44px by padding at most widths and
 * only carries the token below 480px.
 *
 * Known coupling: matching is by CLASS NAME, so a bespoke class on a button element
 * (`.icg-back-link`, `.deploy-btn`, `.filter-button`) is outside the net even when it
 * renders a button. Those are BL-096's audit list, not this guard's.
 */
const GUARDED_SELECTOR_RE = /\.(?:brutal-(?:btn|choice-btn)|cta-button)/;
/** Properties whose value sets a lower bound on the rendered box. */
const GUARDED_PROPS = ['min-height', 'min-width'];

// --- Parsers ---------------------------------------------------------------

/** Strip `/* … *\/` comments so commented-out CSS can't trip the scan. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Extract the contents of every `<style>` block in an Astro file. */
export function extractAstroStyles(source: string): string[] {
  const blocks: string[] = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) blocks.push(m[1]);
  return blocks;
}

/** A `min-height`/`min-width` declaration below the floor, on a guarded selector. */
export interface FloorViolation {
  selector: string;
  prop: string;
  value: string;
  px: number;
}

/**
 * Resolve a CSS length to px, or null if it isn't a literal we can judge statically.
 *
 * Handles `!important` (the likeliest shape for the next page-local override, and
 * the one that silently slipped past the first version of this parser), unitless
 * `0`, and `rem` at the 16px root (no `html { font-size }` override exists in
 * `src/styles/`).
 *
 * `em` is deliberately NOT resolved. It is relative to the element's own font-size,
 * and `.brutal-btn` is `0.7rem` — so `3.5em` is 39.2px in the browser but would look
 * like 56px to a 16px-based resolver. That is a false PASS at almost exactly the
 * 33px failure this guard exists to prevent, so em joins calc/%/viewport units in
 * returning null: decline to judge rather than judge wrongly.
 */
export function lengthToPx(value: string): number | null {
  const bare = value.replace(/!\s*important\s*$/i, '').trim();
  if (/^0$/.test(bare)) return 0;
  const m = /^(-?[0-9]*\.?[0-9]+)(px|rem)$/.exec(bare);
  if (!m) return null;
  return m[2] === 'px' ? parseFloat(m[1]) : parseFloat(m[1]) * 16;
}

/** Parse `:root` custom properties from variables.css into a name -> value map. */
export function parseRootTokens(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  const root = /:root\s*\{([\s\S]*?)\}/.exec(stripComments(css));
  if (!root) return out;
  for (const m of root[1].matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

/**
 * Resolve a declaration value to px, following a single `var(--token)` indirection
 * through the supplied token map. One hop is enough for this codebase and keeps the
 * resolver honest — anything deeper returns null rather than guessing.
 */
function resolveToPx(value: string, tokens: Record<string, string>): number | null {
  const direct = lengthToPx(value);
  if (direct !== null) return direct;
  const ref = /^var\(\s*(--[A-Za-z0-9_-]+)\s*\)$/.exec(
    value.replace(/!\s*important\s*$/i, '').trim()
  );
  if (!ref) return null;
  const target = tokens[ref[1]];
  return target === undefined ? null : lengthToPx(target);
}

/**
 * Find guarded declarations resolving below `floorPx`.
 *
 * Matches innermost `{ … }` blocks, so a rule nested in `@media` yields its own
 * selector as the prelude rather than the at-rule's.
 */
export function findFloorViolations(
  css: string,
  floorPx: number,
  tokens: Record<string, string> = {}
): FloorViolation[] {
  const out: FloorViolation[] = [];
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  const source = stripComments(css);
  let rule: RegExpExecArray | null;

  while ((rule = ruleRe.exec(source)) !== null) {
    const selector = rule[1].trim().replace(/\s+/g, ' ');
    if (!GUARDED_SELECTOR_RE.test(selector)) continue;

    for (const decl of rule[2].split(';')) {
      const idx = decl.indexOf(':');
      if (idx === -1) continue;
      const prop = decl.slice(0, idx).trim().toLowerCase();
      const value = decl.slice(idx + 1).trim();
      if (!GUARDED_PROPS.includes(prop)) continue;

      // Resolve rather than skip every `var()`. The floor token is conformant by
      // construction, but a DIFFERENT token could resolve to anything — blanket-
      // skipping `var(` would wave through a min-height pointed at a 32px token.
      const px = resolveToPx(value, tokens);
      if (px !== null && px < floorPx) out.push({ selector, prop, value, px });
    }
  }
  return out;
}

// --- File walking ----------------------------------------------------------

function walkStyleSources(absDir: string, acc: string[]): void {
  if (!existsSync(absDir)) return;
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const abs = join(absDir, entry.name);
    if (entry.isDirectory()) {
      // `src/docs` markdown fences legitimately contain example `.brutal-btn` rules.
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'docs') continue;
      walkStyleSources(abs, acc);
    } else if (entry.isFile() && (entry.name.endsWith('.css') || entry.name.endsWith('.astro'))) {
      acc.push(abs);
    }
  }
}

// --- Fixtures (prove the parser before trusting the sweep) ------------------

describe('touch-target floor — parser fixtures', () => {
  it('flags a raw literal below the floor', () => {
    const css = `.brutal-choice-btn--unsure { border-style: dashed; min-height: 36px; }`;
    expect(findFloorViolations(css, 44)).toEqual([
      { selector: '.brutal-choice-btn--unsure', prop: 'min-height', value: '36px', px: 36 },
    ]);
  });

  it('flags a rule nested inside a media query, reporting its own selector', () => {
    const css = `@media (max-width: 480px) {
      .tool-action-bar .brutal-btn--secondary { min-height: 40px; }
    }`;
    const found = findFloorViolations(css, 44);
    expect(found).toHaveLength(1);
    expect(found[0].selector).toBe('.tool-action-bar .brutal-btn--secondary');
  });

  it('accepts the token, a literal at the floor, and one above it', () => {
    const css = `
      .brutal-btn { min-height: var(--touch-target-min); }
      .brutal-btn--a { min-height: 44px; }
      .icg-wizard-nav .brutal-btn { min-height: 48px; }
      .brutal-choice-btn { min-height: 2.75rem; }
    `;
    expect(findFloorViolations(css, 44, { '--touch-target-min': '44px' })).toEqual([]);
  });

  it('flags a value carrying !important — the likeliest override shape', () => {
    const css = `.brutal-btn { min-height: 36px !important; }`;
    expect(findFloorViolations(css, 44)[0]).toMatchObject({ px: 36 });
  });

  it('flags a unitless 0', () => {
    expect(findFloorViolations(`.brutal-btn { min-width: 0; }`, 44)[0]).toMatchObject({ px: 0 });
  });

  it('declines to judge em, which is relative to the button own font-size', () => {
    // .brutal-btn is 0.7rem, so 3.5em is 39.2px in the browser — a 16px-based
    // resolver would call it 56px and wave a real violation through.
    expect(findFloorViolations(`.brutal-btn { min-height: 3.5em; }`, 44)).toEqual([]);
  });

  it('follows a var() to a DIFFERENT token that resolves below the floor', () => {
    const css = `.brutal-btn { min-height: var(--some-small-thing); }`;
    const tokens = { '--touch-target-min': '44px', '--some-small-thing': '32px' };
    expect(findFloorViolations(css, 44, tokens)[0]).toMatchObject({ px: 32 });
  });

  it('does not guess at values it cannot resolve statically', () => {
    const css = `
      .brutal-btn { min-height: calc(100% - 4px); }
      .brutal-btn--b { min-height: var(--unknown-token); }
      .brutal-btn--c { min-height: 10%; }
    `;
    expect(findFloorViolations(css, 44, {})).toEqual([]);
  });

  it('parses :root tokens from variables.css shape', () => {
    const css = `/* c */\n:root {\n  --a: 44px;\n  --b: light-dark(#fff, #000);\n}\n`;
    expect(parseRootTokens(css)).toEqual({ '--a': '44px', '--b': 'light-dark(#fff, #000)' });
  });

  it('ignores unguarded selectors and unguarded properties', () => {
    const css = `
      .brutal-quick-zoom { min-height: 32px; }
      .brutal-btn { padding: 8px; font-size: 11px; }
    `;
    expect(findFloorViolations(css, 44)).toEqual([]);
  });

  it('ignores commented-out declarations', () => {
    const css = `.brutal-btn { /* min-height: 20px; */ min-height: 44px; }`;
    expect(findFloorViolations(css, 44)).toEqual([]);
  });

  it('converts rem below the floor', () => {
    const css = `.brutal-btn { min-height: 2rem; }`;
    expect(findFloorViolations(css, 44)[0]).toMatchObject({ px: 32 });
  });

  it('extracts every Astro <style> block, including attributed ones', () => {
    const astro = `---\nconst x = 1;\n---\n<div />\n<style>.a { color: red; }</style>\n<style is:global>.b { color: blue; }</style>`;
    expect(extractAstroStyles(astro)).toEqual(['.a { color: red; }', '.b { color: blue; }']);
  });
});

// --- The sweep --------------------------------------------------------------

describe('touch-target floor — source sweep', () => {
  const TOKENS = parseRootTokens(readFileSync(VARIABLES_CSS, 'utf-8'));
  const floorRaw = TOKENS['--touch-target-min'];

  it('defines --touch-target-min in variables.css', () => {
    expect(floorRaw, '--touch-target-min must exist in src/styles/variables.css').toBeDefined();
    expect(lengthToPx(floorRaw!), `--touch-target-min must be a px/rem literal`).not.toBeNull();
    // If :root is ever split or reshaped past the parser, resolution degrades to
    // "resolve nothing" and the sweep quietly loses its teeth. Fail loudly instead.
    expect(
      Object.keys(TOKENS).length,
      'parsed :root tokens — a sharp drop means the parser stopped matching variables.css'
    ).toBeGreaterThan(150);
  });

  it('has no button rule resolving below the floor', () => {
    const floorPx = lengthToPx(floorRaw!)!;
    const files: string[] = [];
    walkStyleSources(SRC_DIR, files);
    expect(files.length, 'style sources found').toBeGreaterThan(0);

    const failures: string[] = [];
    for (const abs of files) {
      const source = readFileSync(abs, 'utf-8');
      const chunks = abs.endsWith('.astro') ? extractAstroStyles(source) : [source];
      for (const chunk of chunks) {
        for (const v of findFloorViolations(chunk, floorPx, TOKENS)) {
          failures.push(
            `${relative(REPO_ROOT, abs).replace(/\\/g, '/')}: ` +
              `${v.selector} { ${v.prop}: ${v.value} } resolves to ${v.px}px, below the ${floorPx}px floor`
          );
        }
      }
    }

    expect(
      failures,
      `Rules below the touch-target floor (use var(--touch-target-min); see ` +
        `STYLES_GUIDE.md § Touch Targets):\n  ${failures.join('\n  ')}`
    ).toEqual([]);
  });
});
