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
 *   - Declarations whose value IS `var(--touch-target-min)` are conformant by
 *     construction and skipped. After the token migration that is most of the corpus,
 *     so this guard's real job is catching the next raw literal.
 *   - Only `min-height` / `min-width` are checked. A fixed `height` below the floor is
 *     a different (and rarer) shape; see BL-096.
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

/** Selectors targeting a component that must honour the floor. */
const GUARDED_SELECTOR_RE = /\.brutal-(?:btn|choice-btn)/;
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

/** Resolve a CSS length to px, or null if it isn't a plain px/rem literal. */
export function lengthToPx(value: string): number | null {
  const m = /^(-?[0-9]*\.?[0-9]+)(px|rem)$/.exec(value.trim());
  if (!m) return null;
  return m[2] === 'rem' ? parseFloat(m[1]) * 16 : parseFloat(m[1]);
}

/**
 * Find guarded declarations resolving below `floorPx`.
 *
 * Matches innermost `{ … }` blocks, so a rule nested in `@media` yields its own
 * selector as the prelude rather than the at-rule's.
 */
export function findFloorViolations(css: string, floorPx: number): FloorViolation[] {
  const out: FloorViolation[] = [];
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let rule: RegExpExecArray | null;

  while ((rule = ruleRe.exec(stripComments(css))) !== null) {
    const selector = rule[1].trim().replace(/\s+/g, ' ');
    if (!GUARDED_SELECTOR_RE.test(selector)) continue;

    for (const decl of rule[2].split(';')) {
      const idx = decl.indexOf(':');
      if (idx === -1) continue;
      const prop = decl.slice(0, idx).trim();
      const value = decl.slice(idx + 1).trim();
      if (!GUARDED_PROPS.includes(prop)) continue;
      if (value.includes('var(')) continue; // token-driven — conformant by construction

      const px = lengthToPx(value);
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
    expect(findFloorViolations(css, 44)).toEqual([]);
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
  const floorRaw = /--touch-target-min:\s*([^;]+);/.exec(readFileSync(VARIABLES_CSS, 'utf-8'))?.[1];

  it('defines --touch-target-min in variables.css', () => {
    expect(floorRaw, '--touch-target-min must exist in src/styles/variables.css').toBeDefined();
    expect(lengthToPx(floorRaw!), `--touch-target-min must be a px/rem literal`).not.toBeNull();
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
        for (const v of findFloorViolations(chunk, floorPx)) {
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
