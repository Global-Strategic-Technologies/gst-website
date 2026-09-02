/**
 * Spacing-token floor, repo-wide.
 *
 * WHAT THIS ASSERTS. In every `.css` and `.astro` file under `src/`, a rem value
 * in a spacing property that has an exact token on the scale must BE that token.
 * ADR-0028 established the property that makes this enforceable: no sheet, theme
 * or palette shadows a `--spacing-*`, so a `var()` substitution is
 * value-identical and cannot resolve differently anywhere. ADR-0029 widened this
 * guard from the six files ADR-0028 swept to all of `src/`, absorbing 217
 * literals in the same change.
 *
 * REACH, AND WHAT SITS OUTSIDE IT. This reads `<style>` blocks. It does NOT see
 * inline `style="…"` attributes — stylelint does, and the
 * `declaration-property-value-disallowed-list` rule added in ADR-0029 holds the
 * 41 on-scale literals swept out of the two /brand specimen files. Five
 * OFF-scale literals remain in `BrandUILibrary.astro`'s inline attributes and are
 * governed by neither instrument: that rule names on-scale values only, and this
 * guard cannot see them. Recorded rather than closed — the specimen replicas
 * carry inline styles deliberately, because Astro's scoping cannot reach them.
 *
 * WHAT IT DOES NOT DO. It reads SOURCE TEXT and does not resolve the cascade, so
 * it cannot tell you what a browser computes. It also does not descend into
 * `calc()` — see the residual ruling below.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  stripComments,
  extractAstroStyles,
  splitShorthand,
  parseRootTokens,
  walkStyleSources,
} from './helpers/css-parse';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC_DIR = join(REPO_ROOT, 'src');

/**
 * Spacing properties. `outline-offset` is in deliberately (it is spacing-adjacent
 * and `FooterLinks.astro` uses it on-scale); `font-size` is out by TYPE, and that
 * boundary belongs to BL-094's type-scale ruling, not here.
 */
const SPACING_PROPS =
  '(?:padding|padding-top|padding-right|padding-bottom|padding-left|padding-block|padding-inline|' +
  'margin|margin-top|margin-right|margin-bottom|margin-left|margin-block|margin-inline|' +
  'gap|row-gap|column-gap|inset|top|right|bottom|left|outline-offset)';

const DECL_RE = new RegExp(`(^|[;{])\\s*(${SPACING_PROPS})\\s*:\\s*([^;{}]+)`, 'g');

/**
 * Off-scale rem values the repo keeps, and why. Mirrors ADR-0029's table, which
 * is keyed by VALUE with a file list rather than one row per site — sixteen
 * reasons read better than forty near-duplicates.
 *
 * An entry that stops matching a real declaration FAILS rather than rotting —
 * the property `FLOOR_EXCEPTIONS` in touch-target-floor.test.ts established.
 *
 * A value appears more than once when its sites are kept for DIFFERENT reasons:
 * `0.375rem` carries three rulings, and flattening them into one sentence would
 * be exactly the stale-but-plausible entry the liveness case exists to catch.
 *
 * Values inside `calc()` are NOT here — `Footer.astro`'s `0.85rem` and
 * `CategoryFilter.astro`'s `1.6rem`. This guard does not descend into calc, by
 * ruling: a value inside one is a derived constant, and substituting a token
 * there would break an arithmetic derivation rather than move a pixel.
 */
const ACCEPTED_RESIDUALS = [
  // --- Above the ramp: the scale stops at 48px, so there is nothing to snap to.
  {
    value: '5rem',
    files: [
      'src/pages/about.astro',
      'src/styles/global.css',
      'src/pages/hub/library/business-architectures/index.astro',
      'src/pages/hub/library/information-request-list/index.astro',
      'src/pages/hub/library/vdr-structure/index.astro',
      'src/pages/hub/tools/information-request-list-generator/index.astro',
    ],
    reason: 'Ruled by ADR-0028: 80px is ABOVE the ramp top (48px), so snapping moves pixels.',
  },
  {
    value: '4rem',
    files: [
      'src/components/CTABox.astro',
      'src/components/CTASection.astro',
      'src/components/portfolio/PortfolioGrid.astro',
      'src/styles/global.css',
    ],
    reason: 'Inherits the 5rem ruling: 64px is likewise above the ramp top.',
  },

  // --- Below the ramp: the floor is 4px (--spacing-xs).
  {
    value: '0.125rem',
    files: ['src/styles/components/cards.css'],
    reason:
      'Ruled by ADR-0028: the STYLES_GUIDE micro-spacing badge case, in rem where ' +
      'the exception is written in px.',
  },
  {
    value: '0.0625rem',
    files: ['src/styles/components/sash.css'],
    reason:
      'The 1px half of the same exception, on the sash badge. Partner of 0.3125rem ' +
      'in one declaration — rule them together.',
  },
  {
    value: '0.15rem',
    files: ['src/pages/brand.astro'],
    reason:
      'Does NOT shelter under the micro-spacing exception, which authorises "1px or ' +
      '2px directly" — 2.4px is neither. Kept because the ramp floor is 4px, so no ' +
      'token is below it. Partner of 0.45rem.',
  },

  // --- Between steps: moving them moves pixels (ADR-0028's standing rule).
  {
    value: '0.3125rem',
    files: ['src/styles/components/sash.css'],
    reason: '5px, between xs (4) and sm (8). Partner of 0.0625rem.',
  },
  {
    value: '0.35rem',
    files: [
      'src/components/portfolio/PortfolioGrid.astro',
      'src/components/portfolio/ProjectModal.astro',
      'src/pages/brand.astro',
    ],
    reason: '5.6px, between xs and sm. The vertical half of a badge padding family.',
  },
  {
    value: '0.375rem',
    files: ['src/components/Footer.astro'],
    reason:
      'Ruled by ADR-0028: 6px sits between xs (4) and sm (8). The STYLES_GUIDE ' +
      'skeleton exception names 0.375rem but is about text height, and ADR-0028 ' +
      'says explicitly that it does not cover this site.',
  },
  {
    value: '0.375rem',
    files: ['src/components/radar/RadarFeedSkeleton.astro'],
    reason:
      'ADR-0029 boundary call: the STYLES_GUIDE skeleton-placeholder exception DOES ' +
      'cover this one — it is the component that exception was written about.',
  },
  {
    value: '0.375rem',
    files: [
      'src/components/radar/WireItem.astro',
      'src/styles/components/filter.css',
      'src/styles/components/sash.css',
    ],
    reason:
      'Neither the skeleton exception nor ADR-0028 covers these; kept on the ' +
      'between-steps reason alone (6px, between xs and sm).',
  },
  {
    value: '0.4375rem',
    files: ['src/styles/components/sash.css'],
    reason: '7px, between xs and sm — one px below sm.',
  },
  {
    value: '0.45rem',
    files: ['src/pages/brand.astro'],
    reason: '7.2px, between xs and sm. Partner of 0.15rem in one declaration.',
  },
  {
    value: '0.625rem',
    files: [
      'src/components/portfolio/FilterDrawer.astro',
      'src/components/portfolio/PortfolioHeader.astro',
      'src/components/portfolio/StickyControls.astro',
      'src/styles/components/filter.css',
    ],
    reason: '10px, between sm (8) and md (12). The vertical half of the search-input padding.',
  },
  {
    value: '0.65rem',
    files: [
      'src/components/portfolio/PortfolioHeader.astro',
      'src/components/portfolio/ProjectModal.astro',
      'src/pages/brand.astro',
    ],
    reason:
      '10.4px, between sm and md — and 0.4px from 0.625rem, which is a DIFFERENT ' +
      'value. Snapping either would silently merge two families.',
  },
  {
    value: '0.875rem',
    files: [
      'src/components/portfolio/PortfolioHeader.astro',
      'src/components/portfolio/StickyControls.astro',
      'src/styles/components/filter.css',
      'src/styles/components/portfolio.css',
      'src/styles/components/sash.css',
    ],
    reason:
      '14px, between md (12) and lg (16). A DERIVED CONSTANT where it positions the ' +
      'search icon: left 14px + width 18px = a 32px right edge, cleared by the ' +
      "input's 36px padding-left. Snapping puts text under the icon.",
  },
  {
    value: '1.275rem',
    files: ['src/components/Header.astro'],
    reason:
      '20.4px, 0.4px above --spacing-1_25. MEASURED, not assumed: the sticky header ' +
      'renders 74.78px tall, so the tempting "this makes the header exactly 80px" ' +
      'derivation (from mcp-guide.css scroll-margin-top: 80px) is FALSE. Do not ' +
      're-derive it. Kept because it moves the most-visible element for no gain.',
  },
  {
    value: '1.65rem',
    files: ['src/pages/hub/tools/information-request-list-generator/index.astro'],
    reason:
      '26.4px, between xl (24) and 1_75 (28). An indent aligning a column against the ' +
      'question rows above it — snapping misaligns, it does not resize.',
  },
  {
    value: '2.25rem',
    files: ['src/components/portfolio/StickyControls.astro', 'src/styles/components/filter.css'],
    reason:
      "36px, between 2xl (32) and 2_5xl (40). A DERIVED CONSTANT: the search input's " +
      'padding-left, clearing a 32px icon right edge by 4px.',
  },
] as const;

/** Flattened (file, value) pairs — the unit the guard actually compares. */
const RESIDUAL_PAIRS = ACCEPTED_RESIDUALS.flatMap((r) => r.files.map((f) => `${f} ${r.value}`));

/**
 * Obtained by RUNNING the guard, not by counting the table above — deliberately.
 * A count derived from ACCEPTED_RESIDUALS would be a tautology beside the
 * set-equality assertion and would still pass if an entry and its violation were
 * deleted together. Sixteen values across forty sites; two review passes
 * hand-counted this as 41 and 40 and disagreed, which is why it is measured.
 */
const RESIDUAL_PAIR_COUNT = 40;

/** px -> token, built from variables.css so the guard cannot drift from the scale. */
function spacingScale(): Map<number, string> {
  const tokens = parseRootTokens(
    readFileSync(join(REPO_ROOT, 'src/styles/variables.css'), 'utf-8')
  );
  const scale = new Map<number, string>();
  for (const [name, value] of Object.entries(tokens)) {
    if (!name.startsWith('--spacing-')) continue;
    const m = /^([0-9]*\.?[0-9]+)rem$/.exec(value.trim());
    if (m) scale.set(parseFloat(m[1]) * 16, name);
  }
  return scale;
}

interface RemUse {
  file: string;
  prop: string;
  value: string;
  literal: string;
  inCalc: boolean;
}

/** Every rem value in a spacing property within one stylesheet's text. */
export function scanSheet(sheet: string, file: string): RemUse[] {
  const uses: RemUse[] = [];
  // Comments first: FooterLinks.astro carries a `font-size: 5rem` INSIDE a
  // comment inside a rule body, which a naive declaration split misreads.
  const css = stripComments(sheet);
  for (const m of css.matchAll(DECL_RE)) {
    const [prop, value] = [m[2], m[3].trim()];
    // Shorthands are the common case, and feeding one to a single-length
    // resolver returns null — which reads as "nothing to judge" and passes
    // silently. Split first.
    for (const part of splitShorthand(value)) {
      // calc-ness is judged PER PART, not per declaration: in
      // `padding: 1.25rem calc(…)` only the second component is derived, and
      // a per-declaration flag would silently exempt the first.
      const inCalc = /calc\(/.test(part);
      for (const lit of part.matchAll(/(?<![\w.-])([0-9]*\.?[0-9]+)rem\b/g)) {
        uses.push({ file, prop, value, literal: `${lit[1]}rem`, inCalc });
      }
    }
  }
  return uses;
}

/** Every rem value in a spacing property across every stylesheet under src/. */
function collectRemUses(): { uses: RemUse[]; fileCount: number } {
  const files: string[] = [];
  walkStyleSources(SRC_DIR, files);
  const uses: RemUse[] = [];
  for (const abs of files) {
    // The shared walker returns absolute paths; this guard's messages and its
    // residual keys are repo-relative.
    const file = relative(REPO_ROOT, abs).split(sep).join('/');
    const source = readFileSync(abs, 'utf-8');
    const sheets = file.endsWith('.astro') ? extractAstroStyles(source) : [source];
    for (const sheet of sheets) uses.push(...scanSheet(sheet, file));
  }
  return { uses, fileCount: files.length };
}

describe('spacing-token floor (ADR-0028, widened repo-wide by ADR-0029)', () => {
  const scale = spacingScale();
  const { uses, fileCount } = collectRemUses();

  it('the instrument found the scale and a populated corpus (it probes something)', () => {
    // Non-empty is not correctness, but empty is definitely not a pass. Both
    // BL-124 and BL-125 shipped guards that asserted over nothing.
    expect(scale.size).toBeGreaterThanOrEqual(10);
    expect(scale.get(20)).toBe('--spacing-1_25');
    expect(scale.get(28)).toBe('--spacing-1_75');
    expect(uses.length).toBeGreaterThan(0);
  });

  it('no rem spacing value that has an exact token is written as a literal', () => {
    const violations = uses
      .filter((u) => !u.inCalc)
      .filter((u) => scale.has(parseFloat(u.literal) * 16))
      .map(
        (u) =>
          `  ${u.file}: ${u.prop}: ${u.value}  ->  ${u.literal} is ` +
          `${scale.get(parseFloat(u.literal) * 16)}`
      );

    expect(
      violations,
      violations.length
        ? `${violations.length} spacing literal(s) have an exact token and must use it ` +
            `(all substitutions are value-identical):\n${violations.join('\n')}`
        : ''
    ).toEqual([]);
  });

  it('the off-scale residuals are exactly the set ADR-0029 accepts', () => {
    const found = uses
      .filter((u) => !u.inCalc)
      .filter((u) => !scale.has(parseFloat(u.literal) * 16))
      .map((u) => `${u.file} ${u.literal}`);

    // Cardinality asserted as a NUMBER as well as a set: a parser regression that
    // collected fewer would satisfy a subset check while silently seeing less.
    // The number is a measurement, not a count of the table — see its docblock.
    expect(new Set(found).size).toBe(RESIDUAL_PAIR_COUNT);
    expect([...new Set(found)].sort()).toEqual([...RESIDUAL_PAIRS].sort());
  });

  it('the residual table itself carries no duplicate (file, value) pair', () => {
    // Keyed by value with a file list, the same site could be listed under two
    // entries — which would make the set comparison above pass while the
    // cardinality assertion silently disagreed with the table.
    expect(new Set(RESIDUAL_PAIRS).size).toBe(RESIDUAL_PAIRS.length);
  });

  it('scans the whole of src/, not a subset (the widening actually happened)', () => {
    // ADR-0029 widened this from six files. A walker that silently returned a
    // handful would make every assertion above vacuously true.
    expect(fileCount).toBeGreaterThan(90);
  });

  it('every accepted residual still matches a real declaration', () => {
    // A stale exception is worse than none — it reads as a considered ruling
    // while guarding nothing.
    for (const residual of ACCEPTED_RESIDUALS) {
      for (const file of residual.files) {
        const live = uses.some((u) => u.file === file && u.literal === residual.value && !u.inCalc);
        expect(
          live,
          `Accepted residual ${residual.value} in ${file} no longer matches any ` +
            `declaration. If it was tokenized, remove that file from the entry (and ` +
            `the entry itself if it was the last one) plus ADR-0029's table row.`
        ).toBe(true);
      }
    }
  });

  it('judges calc-ness per component, so a literal beside a calc is still seen', () => {
    // Synthetic rather than a mutation of a real file: the per-part property was
    // introduced BECAUSE a per-declaration flag exempted a whole shorthand, and a
    // mutation test proves that only for as long as the mutation exists. There is
    // no such declaration in the six files today, so nothing else pins this.
    const uses = scanSheet(
      `.x { padding: 1.25rem calc(100% - var(--touch-target-min)); }`,
      'synthetic.css'
    );
    expect(uses.map((u) => [u.literal, u.inCalc])).toEqual([['1.25rem', false]]);

    // …and a pure-calc value stays wholly exempt, so the ruling is not weakened.
    const pure = scanSheet(`.y { margin-block: calc((0.85rem - 44px) / 2); }`, 'synthetic.css');
    expect(pure.map((u) => [u.literal, u.inCalc])).toEqual([['0.85rem', true]]);
  });

  it('does not descend into calc(), by ruling', () => {
    // Two calc expressions carry off-scale rem values that are derived constants,
    // not chosen steps: Footer.astro's margin-block and CategoryFilter.astro's
    // margin. Both must be invisible to the residual set above — if this stops
    // finding them, the parser started reading calc contents and that set will
    // start failing for the wrong reason.
    const calcUses = uses.filter((u) => u.inCalc);
    expect(calcUses.length).toBeGreaterThan(0);
    expect([...new Set(calcUses.map((u) => `${u.file} ${u.literal}`))].sort()).toEqual([
      'src/components/Footer.astro 0.85rem',
      'src/components/radar/CategoryFilter.astro 1.6rem',
    ]);
  });
});
