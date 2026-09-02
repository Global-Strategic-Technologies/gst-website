/**
 * The spacing lint rule fires, in both config blocks, and stays bound to the scale.
 *
 * WHY THIS EXISTS AS A TEST. BL-148's first acceptance criterion demands the rule
 * be "proven to fail by mutation, not by observing a green run" — because the
 * obvious way to add spacing enforcement is a silent no-op. Appending
 * `padding`/`margin`/`gap` to `scale-unlimited/declaration-strict-value` looks
 * right and does nothing: its `ignoreValues` carries
 * `/^-?[0-9.]+(px|rem|em|%)?,?$/`, which matches any bare number-plus-unit. The
 * rule under test here is a DIFFERENT one — `declaration-property-value-disallowed-list`,
 * which has no `ignoreValues` of its own — and that is what evades the trap
 * rather than fighting it (ADR-0029).
 *
 * WHY BOTH FILE TYPES. The rule is declared in the base block and again in the
 * `**\/*.astro` override. Base rules do reach `.astro`, so the duplication is
 * belt-and-braces rather than load-bearing in that direction — but an
 * override-only declaration would miss plain `.css` entirely, so both are linted
 * here. The `.astro` case includes an inline `style=` attribute, which stylelint
 * parses under `postcss-html` and the sibling vitest guard cannot see at all.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import stylelint from 'stylelint';
import { parseRootTokens } from './helpers/css-parse';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CONFIG = join(REPO_ROOT, '.stylelintrc.json');
const RULE = 'declaration-property-value-disallowed-list';

async function lint(code: string, filename: string): Promise<string[]> {
  const { results } = await stylelint.lint({ code, codeFilename: filename, configFile: CONFIG });
  return results[0].warnings.filter((w) => w.rule === RULE).map((w) => w.text);
}

describe('spacing lint rule (ADR-0029)', () => {
  describe('it fires — proven by mutation, in both file types', () => {
    it.each([
      ['css', 'x.css', '.x { padding: 1.5rem; }'],
      ['astro <style>', 'x.astro', '<style>.x { padding: 1.5rem; }</style>'],
      ['astro inline style attribute', 'x.astro', '<div style="padding:1.5rem"></div>'],
    ])('flags a hardcoded on-scale literal in %s', async (_label, file, code) => {
      const warnings = await lint(code, file);
      expect(warnings.length, `expected ${RULE} to fire on: ${code}`).toBeGreaterThan(0);
    });

    it.each([
      ['0.25rem', '--spacing-xs'],
      ['0.5rem', '--spacing-sm'],
      ['0.75rem', '--spacing-md'],
      ['1rem', '--spacing-lg'],
      ['1.25rem', '--spacing-1_25'],
      ['1.5rem', '--spacing-xl'],
      ['1.75rem', '--spacing-1_75'],
      ['2rem', '--spacing-2xl'],
      ['2.5rem', '--spacing-2_5xl'],
      ['3rem', '--spacing-3xl'],
    ])('flags %s, which is %s', async (literal) => {
      expect(await lint(`.x { margin: ${literal}; }`, 'x.css')).not.toEqual([]);
    });
  });

  describe('it does not fire where it must not', () => {
    it.each([
      ['the token itself', '.x { padding: var(--spacing-xl); }'],
      ['a value inside calc()', '.x { padding: calc(1.5rem + 2px); }'],
      ['an off-scale residual', '.x { padding: 0.875rem; }'],
      ['a value above the ramp', '.x { padding: 4rem; }'],
      ['a longer number ending in an on-scale one', '.x { padding: 21rem; }'],
      ['a decimal whose tail looks on-scale', '.x { padding: 12.5rem; }'],
      ['a negative', '.x { margin-top: -0.25rem; }'],
      ['px micro-spacing, which is a separate ruling', '.x { padding: 2px; }'],
      ['a font-size, which belongs to BL-094', '.x { font-size: 1.5rem; }'],
    ])('leaves %s alone', async (_label, code) => {
      expect(await lint(code, 'x.css')).toEqual([]);
    });

    it('leaves a whole-value calc alone even in a shorthand', async () => {
      // The vitest guard judges calc-ness PER PART and would flag the 1.25rem
      // here; this rule exempts the whole declaration. That divergence is
      // deliberate (ADR-0029): it can only ever be a false negative, and the
      // guard is the referee. If this ever starts failing, the rule got
      // stricter than the ruling — re-read the ADR before "fixing" it.
      expect(await lint('.x { padding: 1.25rem calc(100% - 44px); }', 'x.css')).toEqual([]);
    });
  });

  it('covers exactly the properties the vitest guard scans', () => {
    // Without this, the two instruments drift apart silently and `top: 1rem`
    // fails one while passing the other. Until now the lists were compared by
    // HAND during review — which held right up until both were edited by hand
    // in the same change, at which point nothing was checking the thing the
    // reviewer had checked. Read as TEXT rather than imported: importing a
    // `*.test.ts` re-registers its describe blocks (see css-parse.ts's header).
    const guardSrc = readFileSync(
      join(REPO_ROOT, 'tests/integration/spacing-token-floor.test.ts'),
      'utf-8'
    );
    const decl = /const SPACING_PROPS =([\s\S]*?);\n/.exec(guardSrc);
    expect(decl, 'could not find SPACING_PROPS in the guard').toBeTruthy();
    const guardList = [...decl![1].matchAll(/'([^']*)'/g)]
      .map((m) => m[1])
      .join('')
      .replace(/^\(\?:/, '')
      .replace(/\)$/, '')
      .split('|');
    expect(guardList.length).toBeGreaterThan(20);
    expect(guardList).toContain('outline-offset');

    const config = JSON.parse(readFileSync(CONFIG, 'utf-8'));
    for (const [i, block] of [config.rules[RULE], config.overrides[0].rules[RULE]].entries()) {
      const key = Object.keys(block[0] as Record<string, unknown>)[0];
      const ruleList = /^\/\^\((.*)\)\$\/$/.exec(key)?.[1].split('|');
      expect(ruleList, `could not read the property key out of: ${key}`).toBeTruthy();
      expect(
        ruleList,
        `${i === 0 ? 'base' : '.astro override'} block diverges from SPACING_PROPS`
      ).toEqual(guardList);
    }
  });

  it('stays bound to the scale in variables.css', () => {
    // The rule hardcodes ten values; variables.css owns them. Without this, the
    // rule silently stops covering a token the next time the ramp grows — which
    // is exactly how 20px and 28px went untokenized for as long as they did.
    const config = JSON.parse(readFileSync(CONFIG, 'utf-8'));
    const blocks = [config.rules[RULE], config.overrides[0].rules[RULE]];

    const tokens = parseRootTokens(
      readFileSync(join(REPO_ROOT, 'src/styles/variables.css'), 'utf-8')
    );
    const scale = new Set(
      Object.entries(tokens)
        .filter(([name]) => name.startsWith('--spacing-'))
        .map(([, value]) => value.trim())
        .filter((v) => /^[0-9]*\.?[0-9]+rem$/.test(v))
    );
    expect(scale.size).toBeGreaterThanOrEqual(10);

    for (const [i, block] of blocks.entries()) {
      expect(
        block,
        `${RULE} missing from ${i === 0 ? 'the base' : 'the .astro override'} block`
      ).toBeTruthy();
      const pattern = Object.values(block[0] as Record<string, string[]>)[0][0];
      const alternation = /\(([^)]*?)\)rem/.exec(pattern);
      expect(alternation, `could not read the value list out of: ${pattern}`).toBeTruthy();
      const listed = new Set(
        alternation![1].split('|').map((v) => `${v.split('\\.').join('.')}rem`)
      );
      expect([...listed].sort()).toEqual([...scale].sort());
      expect(block[1]).toEqual({ severity: 'error' });
    }
  });
});
