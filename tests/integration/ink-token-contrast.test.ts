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

/** The declarations inside the first block whose selector text matches exactly. */
function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no block for ${selector}`);
  return css.slice(start, css.indexOf('}', start));
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

describe.each([1, 2, 3, 4, 5])('ink tokens — palette-%i', (n) => {
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

describe('ink tokens — editors-pick is root-only', () => {
  it('no palette re-points --color-editors-pick or its ink', () => {
    // Mirrors the base: giving the ink a palette dependency its fill lacks would
    // make the ink shift per palette while the specimen annotating it does not.
    expect(palettes).not.toMatch(/editors-pick/);
  });
});
