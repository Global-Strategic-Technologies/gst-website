/**
 * Spacing-token floor for the six files ADR-0028 swept.
 *
 * WHAT THIS ASSERTS. In these six files, a rem value in a spacing property that
 * has an exact token on the scale must BE that token. ADR-0028 replaced 90 such
 * literals with `var(--spacing-*)`, all value-identical; this keeps them that
 * way. A one-shot grep proved the sweep complete on the day it ran and expired
 * immediately — that is the whole reason this file exists.
 *
 * WHY ONLY SIX FILES. Nothing lints spacing repo-wide: `.stylelintrc.json`'s
 * strict-value rule covers the color families and `font-size` only, and its
 * `ignoreValues` carries a bare-number-plus-unit pattern that would swallow a
 * naively-added `padding`/`margin`/`gap` rule. ~450 literals remain in ~58 other
 * files. Widening this guard to reach them is BL-148, and it is a different
 * review: those are not all value-identical substitutions.
 *
 * WHAT IT DOES NOT DO. It reads SOURCE TEXT and does not resolve the cascade, so
 * it cannot tell you what a browser computes. It also does not descend into
 * `calc()` — see the residual ruling below.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  stripComments,
  extractAstroStyles,
  splitShorthand,
  parseRootTokens,
} from './helpers/css-parse';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The files ADR-0028 swept. Adding one here means sweeping it first. */
const SWEPT_FILES = [
  'src/pages/about.astro',
  'src/pages/services.astro',
  'src/components/Footer.astro',
  'src/components/FooterLinks.astro',
  'src/components/StatsBar.astro',
  'src/styles/components/cards.css',
] as const;

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
 * Off-scale rem values these files keep, and why. Mirrors ADR-0028's table.
 *
 * An entry that stops matching a real declaration FAILS rather than rotting —
 * the property `FLOOR_EXCEPTIONS` in touch-target-floor.test.ts established.
 *
 * `Footer.astro:42`'s `0.85rem` is NOT here: it sits inside
 * `calc((0.85rem - var(--touch-target-min)) / 2)`, and this guard does not descend
 * into calc. That is a ruling, not an oversight — a value inside a calc expression
 * is a derived constant (that one computes a 13.6px margin box), and substituting
 * a token there would break an arithmetic derivation rather than move a pixel.
 * ADR-0028 records all four residuals; this guard governs the three it can see.
 */
const ACCEPTED_RESIDUALS = [
  {
    file: 'src/pages/about.astro',
    value: '5rem',
    reason:
      '80px is ABOVE the ramp top (48px), so the scale does not reach it. Six source ' +
      'files use 5rem un-tokenized; snapping 80px->48px would move pixels.',
  },
  {
    file: 'src/styles/components/cards.css',
    value: '0.125rem',
    reason:
      'The STYLES_GUIDE micro-spacing exception (badge padding). That exception is ' +
      'written in px; this is rem, and converting would break value-identity under a ' +
      'non-16px root.',
  },
  {
    file: 'src/components/Footer.astro',
    value: '0.375rem',
    reason:
      '6px sits between --spacing-xs (4px) and --spacing-sm (8px); moving it moves ' +
      'pixels. The skeleton exception also names 0.375rem but is about text height.',
  },
] as const;

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

/** Every rem value appearing in a spacing property across the swept files. */
function collectRemUses(): RemUse[] {
  const uses: RemUse[] = [];
  for (const file of SWEPT_FILES) {
    const source = readFileSync(join(REPO_ROOT, file), 'utf-8');
    const sheets = file.endsWith('.astro') ? extractAstroStyles(source) : [source];
    for (const sheet of sheets) {
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
    }
  }
  return uses;
}

describe('spacing-token floor (ADR-0028)', () => {
  const scale = spacingScale();
  const uses = collectRemUses();

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

  it('the off-scale residuals are exactly the three ADR-0028 accepts', () => {
    const found = uses
      .filter((u) => !u.inCalc)
      .filter((u) => !scale.has(parseFloat(u.literal) * 16))
      .map((u) => `${u.file} ${u.literal}`);

    const expected = ACCEPTED_RESIDUALS.map((r) => `${r.file} ${r.value}`);

    // Cardinality asserted as a NUMBER as well as a set: a parser regression that
    // collected two would satisfy a subset check while silently seeing less.
    expect(new Set(found).size).toBe(3);
    expect([...new Set(found)].sort()).toEqual([...expected].sort());
  });

  it('every accepted residual still matches a real declaration', () => {
    // A stale exception is worse than none — it reads as a considered ruling
    // while guarding nothing.
    for (const residual of ACCEPTED_RESIDUALS) {
      const live = uses.some(
        (u) => u.file === residual.file && u.literal === residual.value && !u.inCalc
      );
      expect(
        live,
        `Accepted residual ${residual.value} in ${residual.file} no longer matches any ` +
          `declaration. If it was tokenized, delete this entry and ADR-0028's table row.`
      ).toBe(true);
    }
  });

  it('does not descend into calc(), by ruling', () => {
    // Footer.astro's margin-block calc carries an off-scale 0.85rem that is a
    // derived constant, not a chosen step. It must be invisible here — if this
    // stops finding it, the parser started reading calc contents and the residual
    // set above will start failing for the wrong reason.
    const calcUses = uses.filter((u) => u.inCalc);
    expect(calcUses.length).toBeGreaterThan(0);
    expect(calcUses.every((u) => u.file === 'src/components/Footer.astro')).toBe(true);
  });
});
