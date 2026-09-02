/**
 * The guard that keeps the frosted treatment visible.
 *
 * Four component families were given the frost in one change, and the first
 * draft of that change would have shipped an INVISIBLE one: it reached for
 * `.brutal-frosted`, whose `--surface-faint-bg` is `rgba(0,0,0,0.005)`. Over
 * this site's flat checkerboard that is nothing — the design system says so in
 * its own published words ("a frosted pane on a flat background is
 * indistinguishable from an unfrosted one"), and BACKLOG.md records the same
 * mistake costing a branch before. The shape that reads is the control triple:
 * a 2% tint, a 2px blur, and an inset highlight plus hairline edge. The
 * highlight and the edge are what carry it on a flat page; the blur only pays
 * off over content.
 *
 * What went wrong was NUMERIC, not aesthetic, and that is the half a test can
 * hold. "Reads as frosted" is a taste judgement no assertion reaches; "the
 * alpha is too low to see" is arithmetic.
 *
 * Three failures, each a way the treatment can silently vanish:
 *
 *   1. A family loses one of the three declarations. Deleting the box-shadow
 *      removes exactly what makes the treatment visible, and every runtime
 *      check for `backdrop-filter` stays green.
 *   2. A family is re-pointed at a fainter token. This never touches
 *      variables.css, so a token-only guard would not see it — which is why
 *      this file reads BOTH ends of the indirection: the token each family
 *      names, and that token's value.
 *   3. A token's alpha is lowered. Each floor sits exactly at its token's
 *      current value, so a lowering fails by exactly the amount lowered and the
 *      message names the regression as precisely as an equality assertion
 *      would — while a deliberate raise stays green.
 *
 * FLOOR, not pin, and the distinction is deliberate: an alpha is an ordinal
 * value and the failure is directional (too low is invisible), where
 * `font-token-pin.test.ts` pins a font family, which is a nominal value whose
 * every change is a change of identity. Raising an alpha is safe in the
 * direction this guard cares about — not unconditionally, since
 * `--frost-highlight` is white in light theme and both frost tokens are shared
 * by ten families, so a raise to suit one surface moves all of them.
 *
 * Every rule asserts it actually probed something. A guard that walks an empty
 * file set passes forever and proves nothing.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const VARIABLES = path.join(ROOT, 'src/styles/variables.css');

/** The families carrying the control triple that this change added. */
const FROSTED_FAMILIES: { selector: string; file: string }[] = [
  { selector: '.brutal-trust-card', file: 'src/styles/components/cards.css' },
  { selector: '.brutal-faq__item', file: 'src/styles/components/cards.css' },
  { selector: '.brutal-stat-tile', file: 'src/styles/components/tiles.css' },
  { selector: '.brutal-callout', file: 'src/styles/components/tiles.css' },
];

/**
 * Each token's floor, in `light-dark(light, dark)` order, set at the value it
 * carries today. Lowering either arm fails; raising does not.
 */
const ALPHA_FLOORS: Record<string, [number, number]> = {
  '--surface-subtle-bg': [0.02, 0.03],
  '--frost-edge': [0.04, 0.05],
  '--frost-highlight': [0.12, 0.1],
};

// --- Parsers ----------------------------------------------------------------

/**
 * `:root` custom properties as a name -> value map.
 *
 * Same shape as the reader in `docs-variables-sync.test.ts`: comments stripped
 * first, and a value accumulated across lines until its `;`, because
 * `light-dark(...)` values wrap.
 */
function parseRootTokens(css: string): Map<string, string> {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const braceOpen = noComments.indexOf('{', noComments.indexOf(':root'));
  const block = noComments.slice(braceOpen + 1, noComments.indexOf('}', braceOpen));

  const tokens = new Map<string, string>();
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const decl = lines[i].match(/^\s*(--[a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
    if (!decl) continue;
    let rest = decl[2];
    while (!rest.includes(';') && i + 1 < lines.length) rest += ` ${lines[++i]}`;
    const semi = rest.indexOf(';');
    tokens.set(decl[1], (semi === -1 ? rest : rest.slice(0, semi)).replace(/\s+/g, ' ').trim());
  }
  return tokens;
}

/** The declaration block of the first rule whose prelude is exactly `selector`. */
function ruleBody(css: string, selector: string): string | null {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = new RegExp(`(^|\\})\\s*${selector.replace(/[.[\]]/g, '\\$&')}\\s*\\{([^{}]*)\\}`, 'm');
  const m = re.exec(noComments);
  return m ? m[2] : null;
}

/**
 * Alpha of an `rgba()` literal, following at most one `var()` hop through the
 * token map — `--frost-highlight`'s dark arm is `var(--border-dark-subtle)`
 * rather than a literal, and a resolver that quietly skipped it would floor
 * nothing for that arm.
 */
function alphaOf(value: string, tokens: Map<string, string>): number | null {
  const hop = /^var\(\s*(--[a-zA-Z0-9_-]+)\s*\)$/.exec(value.trim());
  const resolved = hop ? (tokens.get(hop[1]) ?? '') : value;
  const rgba = /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+)\s*)?\)/.exec(resolved);
  if (!rgba) return null;
  return rgba[1] === undefined ? 1 : parseFloat(rgba[1]);
}

/** The two arms of a `light-dark(a, b)` value, split at the top-level comma. */
function lightDarkArms(value: string): [string, string] | null {
  const inner = /^light-dark\((.*)\)$/.exec(value.trim());
  if (!inner) return null;
  let depth = 0;
  for (let i = 0; i < inner[1].length; i++) {
    const ch = inner[1][i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      return [inner[1].slice(0, i).trim(), inner[1].slice(i + 1).trim()];
    }
  }
  return null;
}

// --- Parser fixtures (prove the readers before trusting the sweep) ----------

describe('frost guard — parsers', () => {
  it('splits light-dark arms at the top-level comma only', () => {
    expect(lightDarkArms('light-dark(rgba(0, 0, 0, 0.02), rgba(200, 220, 255, 0.03))')).toEqual([
      'rgba(0, 0, 0, 0.02)',
      'rgba(200, 220, 255, 0.03)',
    ]);
  });

  it('follows one var() hop, which is how the dark highlight resolves', () => {
    const tokens = new Map([['--border-dark-subtle', 'rgba(255, 255, 255, 0.1)']]);
    expect(alphaOf('var(--border-dark-subtle)', tokens)).toBe(0.1);
  });

  it('declines to guess at a value it cannot resolve', () => {
    expect(alphaOf('var(--nope)', new Map())).toBeNull();
    expect(alphaOf('transparent', new Map())).toBeNull();
  });

  it('reads a rule body by exact selector, not by substring', () => {
    const css = `.a-longer { color: red; }\n.a { color: blue; }`;
    expect(ruleBody(css, '.a')?.trim()).toBe('color: blue;');
  });
});

// --- The sweep ---------------------------------------------------------------

describe('frost guard — every frosted family carries the whole triple', () => {
  const tokens = parseRootTokens(fs.readFileSync(VARIABLES, 'utf-8'));

  it('parsed a plausible token map', () => {
    expect(tokens.size).toBeGreaterThan(150);
  });

  const named = new Map<string, string>();

  for (const { selector, file } of FROSTED_FAMILIES) {
    it(`${selector} sets a background token, a backdrop-filter and the frost box-shadow`, () => {
      const body = ruleBody(fs.readFileSync(path.join(ROOT, file), 'utf-8'), selector);
      expect(body, `${selector} not found in ${file}`).not.toBeNull();

      const bg = /background:\s*var\((--[a-zA-Z0-9_-]+)\)/.exec(body!);
      expect(bg, `${selector} must take its frost background from a token`).not.toBeNull();
      named.set(`${selector} background`, bg![1]);

      expect(body, `${selector} lost its backdrop-filter`).toMatch(/backdrop-filter:\s*blur\(/);

      // The declaration that actually carries the treatment on a flat ground.
      expect(body, `${selector} lost the inset highlight`).toContain('var(--frost-highlight)');
      expect(body, `${selector} lost the hairline edge`).toContain('var(--frost-edge)');
    });
  }

  it('probed all four families and found a background token on each', () => {
    // Without this the loop above could shrink to nothing and stay green.
    expect(FROSTED_FAMILIES).toHaveLength(4);
    expect(named.size).toBe(4);
  });

  for (const [token, [lightFloor, darkFloor]] of Object.entries(ALPHA_FLOORS)) {
    it(`${token} stays at or above ${lightFloor} / ${darkFloor}`, () => {
      const value = tokens.get(token);
      expect(value, `${token} missing from variables.css`).toBeDefined();
      const arms = lightDarkArms(value!);
      expect(arms, `${token} is no longer a light-dark() pair`).not.toBeNull();

      const [light, dark] = arms!.map((arm) => alphaOf(arm, tokens));
      expect(light, `${token} light arm did not resolve to an rgba alpha`).not.toBeNull();
      expect(dark, `${token} dark arm did not resolve to an rgba alpha`).not.toBeNull();

      // Floors sit AT today's values: a lowering fails by exactly the amount
      // lowered, which is the whole diagnostic value of the choice.
      expect(light!).toBeGreaterThanOrEqual(lightFloor);
      expect(dark!).toBeGreaterThanOrEqual(darkFloor);
    });
  }

  it('every family points at a token this file actually floors', () => {
    // Closes the second failure mode: re-pointing a family at a fainter token
    // never edits variables.css, so a token-only guard would stay green.
    const floored = new Set(Object.keys(ALPHA_FLOORS));
    const unfloored = [...named].filter(([, token]) => !floored.has(token));
    expect(unfloored).toEqual([]);
    expect(named.size).toBeGreaterThan(0);
  });
});
