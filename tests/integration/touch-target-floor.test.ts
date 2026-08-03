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
 *   - `min-height`, `min-width`, `height` and `width` are all checked (BL-096 widened
 *     this). A fixed `height` is a ceiling as well as a floor, and it is how
 *     `.theme-toggle` sat at 13.6px and `.filter-button` at 38px, both invisible to the
 *     original min-only scan.
 *   - Selector matching is anchored to the LAST COMPOUND of each selector, split on
 *     top-level commas. Once `height`/`width` are guarded that distinction is
 *     load-bearing: `.filter-button svg { width: 20px }` sizes an icon, not a target.
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
 * sat at 33px. That gap belongs to the /brand geometry E2E, not here. Be honest about
 * the reach: of the ~30 sub-44 controls BL-096's audit found, this scan sees 5.
 *
 * Documented exceptions live in `FLOOR_EXCEPTIONS` below, each with a reason, and a
 * STALE entry fails the suite — an exception cannot outlive the control it excuses.
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
 * BL-096 settled the scope: 44px is GUARANTEED on the families listed here, and AA 2.5.8
 * (24x24) is the bar everywhere else — measurement showed the rest of the site already
 * meets it, so this set is a deliberate list, NOT a staging area that grows until it
 * covers everything. Matching is by CLASS NAME, so a bespoke class not listed here
 * (`.icg-back-link`, `.deploy-btn`) is outside the net even when it renders a button —
 * see BL-096 § Still owed.
 *
 * The trailing lookahead is load-bearing and was found by a fixture: without it
 * `.theme-toggle-icon` matches `.theme-toggle` by substring, so the ICON inside the
 * toggle reads as the toggle itself and gets flagged at 10px. `-(?!-)` is the whole
 * trick — a single hyphen continues into a different class name and must not match,
 * while a doubled one is a BEM modifier and must (`.brutal-btn--secondary`).
 */
const GUARDED_SELECTOR_RE =
  /\.(?:brutal-btn|brutal-choice-btn|brutal-map-control|brutal-quick-zoom|cta-button|filter-button|modal-close|theme-toggle)(?![\w]|-(?!-))/;

/**
 * Properties whose value sets a lower bound on the rendered box.
 *
 * `height`/`width` joined `min-*` in BL-096: `PortfolioHeader`'s `.filter-button`
 * carried `height: 38px` and `ThemeToggle` `height: 0.85rem`, both invisible to a
 * min-only scan. Note the asymmetry that buys — a fixed `height` is a CEILING as
 * well as a floor, so it fails here for a second reason.
 *
 * Fix a violation with **`min-height`, not `min-width`**, unless the control is a
 * fixed-size icon button. `.category-filter` pills must still wrap at 1920px and
 * scroll at 375px (`radar-page.test.ts:350-372`), and `.brutal-segmented` is
 * `max-width: 320px; overflow: hidden` (`form.css:195-200`) — a `min-width` sweep
 * would clip both.
 */
const GUARDED_PROPS = ['min-height', 'min-width', 'height', 'width'];

/**
 * Controls allowed below the floor, each with the reason BRAND_GUIDELINES carries.
 *
 * This is the enforcement half of BL-096's ruling. 2.5.5 is guaranteed on the guarded
 * families above; these are the members of those families that cannot meet it, and an
 * exception nobody can find is just a bug.
 * An entry that stops matching a real declaration FAILS the sweep (see the
 * unused-entry test), so raising a control cannot silently leave slack behind.
 */
interface FloorException {
  /** Repo-relative path, forward slashes. */
  file: string;
  /** Exact selector text as it appears in the source. */
  selector: string;
  /**
   * The EXACT value this exception tolerates — matched with `===`, not `<=`.
   * A control drifting further below the floor is a new regression, not a
   * continuation of the documented one, which is why this is not named `maxPx`.
   */
  px: number;
  reason: string;
}

const FLOOR_EXCEPTIONS: FloorException[] = [
  {
    file: 'src/styles/components/map.css',
    selector: '.brutal-quick-zoom',
    px: 32,
    reason:
      'Four region presets overlaying the map itself. 44px targets would either overlap ' +
      'each other or consume ~176px of vertical map on mobile. Still clears 2.5.8 AA (24px).',
  },
  {
    file: 'src/styles/components/map.css',
    selector: '.brutal-map-control',
    px: 32,
    reason:
      'Desktop-only +/-/reset cluster, hidden below 1024px. A documented DEVIATION, not a ' +
      'WCAG exception: 2.5.5 governs pointer inputs including the mouse, and scroll/drag ' +
      'are gestures rather than the equivalent CONTROL the Equivalent exception requires.',
  },
];

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

/** A size declaration below the floor, on a guarded selector. */
export interface FloorViolation {
  selector: string;
  prop: string;
  value: string;
  px: number;
}

/**
 * Split a selector list on TOP-LEVEL commas only, so `:not(a, b)` stays intact.
 */
export function splitSelectorList(prelude: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of prelude) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(buf);
      buf = '';
    } else buf += ch;
  }
  if (buf.trim()) out.push(buf);
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * The last compound of one selector — i.e. the element the rule actually sizes.
 *
 * Load-bearing once `height`/`width` are guarded: `.filter-button svg { width: 20px }`
 * sizes the ICON, not the button, and matching the prelude as a substring would report
 * it as a 20px touch target. Three such rules exist today.
 *
 * `:global(...)` is stripped rather than descended into — it is Astro's escape hatch
 * into another component's DOM, so its contents are never this selector's target.
 * `.theme-toggle :global(.theme-toggle-icon)` (ThemeToggle.astro) is exactly that
 * shape, and today it escapes only because `em` declines to resolve.
 */
export function lastCompound(selector: string): string {
  // UNWRAPPED, not deleted and not replaced by a sentinel. All three were tried:
  //   - Deleting leaves the guarded ancestor as the last compound, so
  //     `.theme-toggle :global(.icon)` reads as sizing `.theme-toggle` — false positive.
  //   - A sentinel fixes that but makes a TOP-LEVEL `:global(.modal-close)` read as
  //     unguarded — a silent skip, and that shape is common in this repo
  //     (SwatchControlStyles, PrintReportHeader, CompliancePanel all use it).
  //   - Unwrapping handles both: `.theme-toggle .theme-toggle-icon` still ends on the
  //     icon, and `:global(.modal-close)` still ends on the guarded class.
  const withoutGlobal = selector.replace(/:global\(([^)]*)\)/g, ' $1');
  const parts = withoutGlobal.split(/[\s>+~]+/).filter(Boolean);
  if (parts.length === 0) return '';
  const last = parts[parts.length - 1];
  // A ::pseudo-element compound is DISQUALIFIED, not reduced to its base class. Its box
  // is never the pointer target, so `.swatch-slider::-webkit-slider-thumb { height:14px }`
  // sizes the thumb, not the slider — stripping the pseudo instead would report that
  // 14px AS the slider's size, which is the inverse of the truth and would fire the
  // moment BL-103 guards `.swatch-slider`.
  return /::[\w-]+/.test(last) ? '' : last;
}

/**
 * Is any selector in the list one whose OWN box this rule sizes?
 *
 * Checked per selector, not against the whole prelude: anchoring the prelude's last
 * compound would let `.filter-button, .icon svg { height: 20px }` pass silently, even
 * though `.filter-button` genuinely receives that height.
 */
export function isGuardedPrelude(prelude: string): boolean {
  return splitSelectorList(prelude).some((sel) => GUARDED_SELECTOR_RE.test(lastCompound(sel)));
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
    if (!isGuardedPrelude(selector)) continue;

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

describe('touch-target floor — selector anchoring', () => {
  // These four exist because widening GUARDED_PROPS to height/width made the
  // difference between "sizes the control" and "sizes something inside it" load-bearing.
  it('ignores a rule sizing a DESCENDANT of a guarded control', () => {
    // Real shape: PortfolioHeader.astro:334. A 20px icon is not a 20px touch target.
    expect(findFloorViolations(`.filter-button svg { width: 20px; height: 20px; }`, 44)).toEqual(
      []
    );
  });

  it('ignores an Astro :global() descendant', () => {
    // Real shape: ThemeToggle.astro:54 — another component's DOM, never this rule's target.
    expect(
      findFloorViolations(`.theme-toggle :global(.theme-toggle-icon) { height: 10px; }`, 44)
    ).toEqual([]);
  });

  it('flags a guarded selector that shares a rule with an unguarded descendant', () => {
    // The hole that anchoring the PRELUDE's last compound would open: `.filter-button`
    // genuinely receives this height, even though the list ends on something unguarded.
    const found = findFloorViolations(`.filter-button, .card svg { height: 20px; }`, 44);
    expect(found).toHaveLength(1);
    expect(found[0].px).toBe(20);
  });

  it('still flags the guarded control itself, through pseudo-classes', () => {
    expect(findFloorViolations(`.modal-close:hover { min-height: 40px; }`, 44)).toHaveLength(1);
  });

  it('flags a TOP-LEVEL :global() wrapping a guarded class', () => {
    // The hole a sentinel substitution opened: this shape is used throughout the repo
    // (SwatchControlStyles, PrintReportHeader, CompliancePanel), so skipping it would
    // silently exempt whole stylesheets.
    const found = findFloorViolations(`:global(.modal-close) { min-height: 20px; }`, 44);
    expect(found).toHaveLength(1);
    expect(found[0].px).toBe(20);
  });

  it('still ignores a guarded ancestor with a :global() descendant', () => {
    // The other direction, which unwrapping must not break.
    expect(
      findFloorViolations(`.theme-toggle :global(.theme-toggle-icon) { height: 10px; }`, 44)
    ).toEqual([]);
  });

  it('does not split inside :not(), so a comma there is not a selector boundary', () => {
    expect(splitSelectorList('.a:not(.b, .c), .d')).toEqual(['.a:not(.b, .c)', '.d']);
  });

  it('distinguishes a BEM modifier from a different class with the same prefix', () => {
    // Found by fixture: `.theme-toggle-icon` matched `.theme-toggle` by substring, so
    // the 10px icon INSIDE the toggle read as the toggle itself.
    expect(findFloorViolations(`.theme-toggle-icon { height: 10px; }`, 44)).toEqual([]);
    expect(findFloorViolations(`.filter-button-x { height: 10px; }`, 44)).toEqual([]);
    // …while real modifiers stay guarded.
    expect(
      findFloorViolations(`.brutal-choice-btn--unsure { min-height: 36px; }`, 44)
    ).toHaveLength(1);
  });

  it('ignores a ::pseudo-element on a guarded control', () => {
    // A pseudo-element box is never the pointer target. Aimed at BL-103: the swatch
    // slider's 14px thumb is a ::-webkit-slider-thumb on a 6px track.
    expect(findFloorViolations(`.modal-close::-webkit-slider-thumb { height: 14px; }`, 44)).toEqual(
      []
    );
  });

  it('reads the last compound past combinators', () => {
    expect(lastCompound('.a > .b + .theme-toggle')).toBe('.theme-toggle');
    expect(lastCompound('.theme-toggle > svg')).toBe('svg');
  });
});

describe('touch-target floor — parser fixtures', () => {
  it('flags a fixed height below the floor, not just min-height', () => {
    // ThemeToggle carried `height: 0.85rem` for years; a min-only scan never saw it.
    expect(findFloorViolations(`.theme-toggle { height: 0.85rem; }`, 44)).toEqual([
      { selector: '.theme-toggle', prop: 'height', value: '0.85rem', px: 13.6 },
    ]);
  });

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
    // `.brutal-quick-zoom` used to be this fixture's unguarded example. BL-096 guarded
    // it deliberately — an exception the scan cannot see is not an exception — so it
    // now lives in FLOOR_EXCEPTIONS instead. Padding is still unguarded: it contributes
    // to the box but does not bound it.
    const css = `
      .hub-card-icon { min-height: 32px; }
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

  /** Every sub-floor declaration in `src/`, paired with its repo-relative file. */
  function sweep(floorPx: number): { file: string; v: FloorViolation }[] {
    const files: string[] = [];
    walkStyleSources(SRC_DIR, files);
    expect(files.length, 'style sources found').toBeGreaterThan(0);

    const hits: { file: string; v: FloorViolation }[] = [];
    for (const abs of files) {
      const file = relative(REPO_ROOT, abs).replace(/\\/g, '/');
      const source = readFileSync(abs, 'utf-8');
      const chunks = abs.endsWith('.astro') ? extractAstroStyles(source) : [source];
      for (const chunk of chunks) {
        for (const v of findFloorViolations(chunk, floorPx, TOKENS)) hits.push({ file, v });
      }
    }
    return hits;
  }

  // Strict equality on the value, not `<=`. With `<=`, an entry documenting a 32px
  // control excused ANY smaller value — a regression dropping `.brutal-quick-zoom` to
  // 12px would have passed both the sweep and the stale-entry check. The field records
  // the value this exception tolerates, so it is pinned to exactly that.
  const matchesException = (e: FloorException, file: string, v: FloorViolation) =>
    e.file === file && e.selector === v.selector && v.px === e.px;

  it('has no guarded rule resolving below the floor', () => {
    const floorPx = lengthToPx(floorRaw!)!;

    const failures = sweep(floorPx)
      .filter(({ file, v }) => !FLOOR_EXCEPTIONS.some((e) => matchesException(e, file, v)))
      .map(
        ({ file, v }) =>
          `${file}: ${v.selector} { ${v.prop}: ${v.value} } resolves to ${v.px}px, ` +
          `below the ${floorPx}px floor`
      );

    expect(
      failures,
      `Rules below the touch-target floor. Fix with min-height: var(--touch-target-min) — ` +
        `or, if the control genuinely cannot clear it, add a FLOOR_EXCEPTIONS entry WITH a ` +
        `reason and record it in BRAND_GUIDELINES.md § Accessibility:\n  ${failures.join('\n  ')}`
    ).toEqual([]);
  });

  it('has no stale exception', () => {
    // The half that keeps the allowlist honest. Without it, raising a control leaves its
    // entry behind as permanent slack — the exception list quietly becomes a budget.
    const floorPx = lengthToPx(floorRaw!)!;
    const hits = sweep(floorPx);

    const stale = FLOOR_EXCEPTIONS.filter(
      (e) => !hits.some(({ file, v }) => matchesException(e, file, v))
    ).map((e) => `${e.file}: ${e.selector} (px ${e.px})`);

    expect(
      stale,
      `FLOOR_EXCEPTIONS entries matching nothing. The control was raised or renamed — ` +
        `delete the entry and the matching prose in BRAND_GUIDELINES.md:\n  ${stale.join('\n  ')}`
    ).toEqual([]);
  });

  it('documents a reason for every exception', () => {
    for (const e of FLOOR_EXCEPTIONS) {
      expect(e.reason.length, `${e.selector} needs a reason, not just an entry`).toBeGreaterThan(
        40
      );
    }
  });
});
