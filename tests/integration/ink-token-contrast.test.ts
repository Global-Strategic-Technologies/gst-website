/**
 * Ink tokens clear AA in every palette and theme (ADR-0035).
 *
 * WHY THIS EXISTS. Brand and status colours are FILL and BORDER colours; used as
 * text they fail AA on light surfaces (--color-primary 2.06:1, --color-warning
 * 2.96:1). The `-ink` counterparts carry text. axe cannot police this for most of
 * the site — `body` paints a checkerboard background-image, and axe returns
 * INCOMPLETE rather than a violation when no opaque backdrop resolves — so the
 * token VALUES are guarded here, where no browser is needed.
 *
 * WHAT IT RESOLVES. Parsing `:root` literals alone would pass over a palette that
 * forgot to re-point an ink (it would silently inherit the default palette's
 * value). So each palette is resolved through its own alias chain:
 *   html.palette-N { --color-X-ink: var(--altN-color-X-ink) }
 *     → :root / html.dark-theme { --altN-color-X-ink: … }
 *
 * THE BARS. Light ink: >= 4.75:1 on #f5f5f5 (the darker light surface, plus
 * margin) and >= 4.5:1 on its own 12% tint (the chip case). A third criterion —
 * ">= 3:1 against the base token" — was considered and rejected: an ink never
 * sits on its base, only on a tint of it, which the second bar already covers.
 * Dark: every ink equals its base, so the swap is a no-op; that is asserted as
 * equality, not re-measured.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from './helpers/css-parse';

const ROOT = process.cwd();
const variables = stripComments(readFileSync(join(ROOT, 'src/styles/variables.css'), 'utf-8'));
const palettes = stripComments(readFileSync(join(ROOT, 'src/styles/palettes.css'), 'utf-8'));

const PALETTE_SCOPED = [
  'secondary',
  'success',
  'warning',
  'error',
  'authority',
  'distinguish',
  'subdued',
] as const;
const ALL_INKS = [...PALETTE_SCOPED, 'editors-pick'] as const;
const EXPANDED = ['authority', 'distinguish', 'subdued'] as const;
/** Every alternative palette (palette 0 is the default and is tested separately). */
const ALT_PALETTES = [1, 2, 3, 4, 5, 6];

/** The declarations inside the first block whose selector matches, ignoring the
 *  whitespace Prettier inserts when it wraps a long `:not(…)` list over lines. */
function block(css: string, selector: string): string {
  const pattern = [...selector]
    .map((ch) => {
      if (ch === ' ') return '\\s+';
      const lit = ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (ch === '(' || ch === ',') return `${lit}\\s*`;
      if (ch === ')') return `\\s*${lit}`;
      return lit;
    })
    .join('');
  const match = new RegExp(`(?:^|[\\s}])${pattern}\\s*\\{`).exec(css);
  if (!match) throw new Error(`no block for ${selector}`);
  return css.slice(match.index, css.indexOf('}', match.index + match[0].length));
}
function decl(body: string, name: string): string | undefined {
  return new RegExp(`${name}:\\s*([^;]+);`).exec(body)?.[1].trim();
}

function hexToRgb(hex: string): number[] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}
function luminance(rgb: number[]): number {
  return rgb
    .map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** A 12% tint of `base` composited over white — the chip backdrop. */
function tint(base: number[]): number[] {
  return base.map((v) => v * 0.12 + 255 * 0.88);
}

function lightDark(value: string | undefined): [string, string] {
  const m = /^light-dark\(\s*(#[0-9a-f]{3,6})\s*,\s*(#[0-9a-f]{3,6})\s*\)$/i.exec(value ?? '');
  if (!m) throw new Error(`expected light-dark(#hex, #hex), got: ${value}`);
  return [m[1].toLowerCase(), m[2].toLowerCase()];
}

function assertLightInk(label: string, ink: string, base: string) {
  const i = hexToRgb(ink);
  const onSurface = contrast(i, hexToRgb('#f5f5f5'));
  const onTint = contrast(i, tint(hexToRgb(base)));
  expect(onSurface, `${label}: ${ink} on #f5f5f5`).toBeGreaterThanOrEqual(4.75);
  expect(onTint, `${label}: ${ink} on its own 12% tint of ${base}`).toBeGreaterThanOrEqual(4.5);
}

const rootBlock = block(palettes, ':root');
const darkBlock = block(palettes, 'html.dark-theme');

describe('ink tokens — default palette (variables.css)', () => {
  it.each(ALL_INKS)('--color-%s-ink clears the light bars', (x) => {
    const [inkLight] = lightDark(decl(variables, `--color-${x}-ink`));
    const [baseLight] = lightDark(decl(variables, `--color-${x}`));
    assertLightInk(`default ${x}`, inkLight, baseLight);
  });

  it.each(ALL_INKS)("--color-%s-ink's dark half is its base's dark literal", (x) => {
    const [, inkDark] = lightDark(decl(variables, `--color-${x}-ink`));
    const [, baseDark] = lightDark(decl(variables, `--color-${x}`));
    // The copy is a drift hazard: a dark-palette edit to the base would silently
    // leave the ink behind. Equality makes the dark swap a guaranteed no-op.
    expect(inkDark).toBe(baseDark);
  });

  it('primary has no -ink token — brand teal text stays --color-primary', () => {
    expect(decl(variables, '--color-primary-ink')).toBeUndefined();
  });
});

describe.each(ALT_PALETTES)('ink tokens — palette-%i', (n) => {
  const paletteBlock = block(palettes, `html.palette-${n}`);

  it.each(PALETTE_SCOPED)('maps --color-%s-ink to its own palette value', (x) => {
    expect(decl(paletteBlock, `--color-${x}-ink`)).toBe(`var(--alt${n}-color-${x}-ink)`);
  });

  it.each(PALETTE_SCOPED)(`--alt${n}-color-%s-ink clears the light bars`, (x) => {
    const ink = decl(rootBlock, `--alt${n}-color-${x}-ink`);
    const base = decl(rootBlock, `--alt${n}-color-${x}`);
    expect(ink, `--alt${n}-color-${x}-ink missing from :root`).toMatch(/^#[0-9a-f]{6}$/i);
    assertLightInk(`palette-${n} ${x}`, ink!, base!);
  });

  it.each(PALETTE_SCOPED)(`--alt${n}-color-%s-ink is its base in dark`, (x) => {
    expect(decl(darkBlock, `--alt${n}-color-${x}-ink`)).toBe(`var(--alt${n}-color-${x})`);
  });
});

describe('ink tokens — palette-0 (expanded tokens only)', () => {
  const paletteBlock = block(palettes, 'html.palette-0');

  it.each(EXPANDED)('maps and clears --color-%s-ink', (x) => {
    expect(decl(paletteBlock, `--color-${x}-ink`)).toBe(`var(--alt0-color-${x}-ink)`);
    assertLightInk(
      `palette-0 ${x}`,
      decl(rootBlock, `--alt0-color-${x}-ink`)!,
      decl(rootBlock, `--alt0-color-${x}`)!
    );
    expect(decl(darkBlock, `--alt0-color-${x}-ink`)).toBe(`var(--alt0-color-${x})`);
  });
});

const DIM_SURFACES = ['#ebebeb', '#e6e6e6', '#dcdcdc']; // page, the measured floor, alt
const DIM_DARK_SURFACES = ['#1c1c1c', '#202020', '#262626'];

function assertDim(label: string, ink: string) {
  const i = hexToRgb(ink);
  for (const s of DIM_SURFACES) {
    const bg = hexToRgb(s);
    expect(contrast(i, bg), `${label}: ${ink} on ${s}`).toBeGreaterThanOrEqual(4.5);
    const chip = i.map((v, k) => v * 0.12 + bg[k] * 0.88);
    expect(contrast(i, chip), `${label}: ${ink} on its 12% tint over ${s}`).toBeGreaterThanOrEqual(
      4.5
    );
  }
}

function assertDimDark(label: string, ink: string) {
  for (const s of DIM_DARK_SURFACES) {
    expect(contrast(hexToRgb(ink), hexToRgb(s)), `${label}: ${ink} on ${s}`).toBeGreaterThanOrEqual(
      4.5
    );
  }
}

/* Dim light (ADR-0038): the page turns gray, so each ink is re-measured against
 * BOTH dim-light surfaces and against its 12% tint composited over each — the
 * chip case on a gray page. An ink with no dim override must pass on its own. */
describe('ink tokens — dim light', () => {
  const dimAlt = block(palettes, 'html.theme-dim:not(.dark-theme)');
  const dimP0 = block(
    palettes,
    'html.theme-dim:not(.dark-theme, .palette-1, .palette-2, .palette-3, .palette-4, .palette-5, .palette-6)'
  );
  const dimVars = block(variables, 'html.theme-dim');

  it.each(ALT_PALETTES)('palette-%i inks clear the dim-light bars', (n) => {
    for (const x of PALETTE_SCOPED) {
      const ink =
        decl(dimAlt, `--alt${n}-color-${x}-ink`) ?? decl(rootBlock, `--alt${n}-color-${x}-ink`);
      assertDim(`dim palette-${n} ${x}`, ink!);
    }
  });

  it('palette-0 inks clear the dim-light bars', () => {
    for (const x of PALETTE_SCOPED) {
      const own =
        decl(dimP0, `--color-${x}-ink`) ?? lightDark(decl(variables, `--color-${x}-ink`))[0];
      assertDim(`dim palette-0 ${x}`, own);
    }
    for (const x of EXPANDED) {
      const alt0 =
        decl(dimAlt, `--alt0-color-${x}-ink`) ?? decl(rootBlock, `--alt0-color-${x}-ink`);
      assertDim(`dim palette-0 expanded ${x}`, alt0!);
    }
    assertDim('dim editors-pick', lightDark(decl(dimVars, '--color-editors-pick-ink'))[0]);
  });
});

/* Dim dark (ADR-0038): surfaces lift to #1c1c1c / #202020 / #262626, and stop at
 * #262626 because every palette's dark inks still clear 4.5:1 there. The bar is
 * the plain surface — dark chips are not re-measured (ADR-0035). Palette 0's dark
 * error is the one ink that needed its own dim-dark value. */
describe('ink tokens — dim dark', () => {
  it.each(ALT_PALETTES)('palette-%i dark inks clear the dim-dark bar', (n) => {
    for (const x of PALETTE_SCOPED) {
      // Dark inks are var(--altN-color-X); the literal is the dark-block base.
      const base = decl(darkBlock, `--alt${n}-color-${x}`);
      expect(base, `--alt${n}-color-${x} missing from html.dark-theme`).toMatch(/^#[0-9a-f]{6}$/i);
      assertDimDark(`dim-dark palette-${n} ${x}`, base!);
    }
  });

  it('palette-0 dark inks clear the dim-dark bar', () => {
    const dimDarkP0 = block(
      palettes,
      'html.theme-dim.dark-theme:not(.palette-1, .palette-2, .palette-3, .palette-4, .palette-5, .palette-6)'
    );
    // Its own inks are each light-dark()'s dark half, unless dim dark re-points
    // one (only error needs to).
    for (const x of ALL_INKS) {
      const ink =
        decl(dimDarkP0, `--color-${x}-ink`) ?? lightDark(decl(variables, `--color-${x}-ink`))[1];
      assertDimDark(`dim-dark palette-0 ${x}`, ink);
    }
    // The expanded tokens come from the alt0 dark literals.
    for (const x of EXPANDED) {
      const base = decl(darkBlock, `--alt0-color-${x}`);
      expect(base, `--alt0-color-${x} missing from html.dark-theme`).toMatch(/^#[0-9a-f]{6}$/i);
      assertDimDark(`dim-dark palette-0 expanded ${x}`, base!);
    }
  });
});

/* Palette 6 has two greens (ADR-0040). Its neon cannot carry text (1.94:1 on
 * white) and a text-safe green cannot carry the dark ink that sits on primary
 * fills, so --color-primary is the text-safe green and --color-primary-bright
 * the neon. Brand teal's ADR-0035 exemption does not extend to it: its primary
 * is held to the ink bars, plus the primary button's hover backdrop (a 25% tint
 * of the neon, buttons.css), the worst surface its text meets. */
describe('primary — palette 6 two greens (ADR-0040)', () => {
  const p6 = block(palettes, 'html.palette-6');
  const dimAlt = block(palettes, 'html.theme-dim:not(.dark-theme)');
  const hex = (body: string, name: string): string => {
    const v = decl(body, name);
    expect(v, name).toMatch(/^#[0-9a-f]{6}$/i);
    return v!;
  };
  const bright = hex(rootBlock, '--alt6-color-primary-bright');
  const brightDark = hex(rootBlock, '--alt6-color-primary-bright-dark');
  const tintOver = (pct: number, surface: string) =>
    hexToRgb(bright).map((v, k) => v * pct + hexToRgb(surface)[k] * (1 - pct));

  it('maps primary, primary-dark and both bright tokens', () => {
    expect(decl(p6, '--color-primary')).toBe('var(--alt6-color-primary)');
    expect(decl(p6, '--color-primary-dark')).toBe('var(--alt6-color-primary-dark)');
    expect(decl(p6, '--color-primary-bright')).toBe('var(--alt6-color-primary-bright)');
    expect(decl(p6, '--color-primary-bright-dark')).toBe('var(--alt6-color-primary-bright-dark)');
  });

  it.each(['--alt6-color-primary', '--alt6-color-primary-dark'])(
    'light %s clears the ink bars and the primary-button hover backdrop',
    (name) => {
      const ink = hex(rootBlock, name);
      assertLightInk(`palette-6 ${name}`, ink, ink);
      for (const s of ['#ffffff', '#f5f5f5']) {
        expect(
          contrast(hexToRgb(ink), tintOver(0.25, s)),
          `${name} ${ink} on a 25% ${bright} tint over ${s}`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  );

  it.each(['--alt6-color-primary', '--alt6-color-primary-dark'])(
    'dim light re-points %s to a value that clears the dim bars',
    (name) => {
      const ink = hex(dimAlt, name);
      assertDim(`dim palette-6 ${name}`, ink);
      expect(
        contrast(hexToRgb(ink), tintOver(0.25, '#dcdcdc')),
        `dim ${name} ${ink} on a 25% ${bright} tint over #dcdcdc`
      ).toBeGreaterThanOrEqual(4.5);
    }
  );

  it('the dark ink reads on both bright fills, including its dim-dark lift', () => {
    for (const fill of [bright, brightDark]) {
      for (const ink of ['#0a0a0a', '#1c1c1c']) {
        expect(contrast(hexToRgb(ink), hexToRgb(fill)), `${ink} on ${fill}`).toBeGreaterThanOrEqual(
          4.5
        );
      }
    }
  });

  it('dark theme keeps one neon for both jobs', () => {
    expect(decl(darkBlock, '--alt6-color-primary-bright')).toBe('var(--alt6-color-primary)');
    expect(decl(darkBlock, '--alt6-color-primary-bright-dark')).toBe(
      'var(--alt6-color-primary-dark)'
    );
    const dark = hex(darkBlock, '--alt6-color-primary');
    for (const s of ['#0a0a0a', '#141414', ...DIM_DARK_SURFACES]) {
      expect(contrast(hexToRgb(dark), hexToRgb(s)), `${dark} on ${s}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('primary-bright defaults to primary (ADR-0040)', () => {
  it('equals primary in variables.css, so palettes 0-5 are unchanged', () => {
    expect(decl(variables, '--color-primary-bright')).toBe('var(--color-primary)');
    expect(decl(variables, '--color-primary-bright-dark')).toBe('var(--color-primary-dark)');
  });

  it('only palette 6 re-points it', () => {
    for (const n of ALT_PALETTES) {
      const mapped = decl(block(palettes, `html.palette-${n}`), '--color-primary-bright');
      if (n === 6) expect(mapped).toBe('var(--alt6-color-primary-bright)');
      else expect(mapped, `palette-${n} re-points --color-primary-bright`).toBeUndefined();
    }
  });
});

describe('ink tokens — editors-pick is root-only', () => {
  it('no palette re-points --color-editors-pick or its ink', () => {
    // Mirrors the base: giving the ink a palette dependency its fill lacks would
    // make the ink shift per palette while the specimen annotating it does not.
    expect(palettes).not.toMatch(/editors-pick/);
  });
});
