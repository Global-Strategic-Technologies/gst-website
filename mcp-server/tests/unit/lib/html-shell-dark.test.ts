/**
 * The Worker-served HTML shell's dark mode.
 *
 * These pages (OAuth consent, admin forms) are the first thing a client sees
 * when connecting to the remote server, and they shipped once with a light-only
 * palette under `color-scheme: light dark` — so the browser painted a dark
 * canvas while every colour stayed light-mode, giving white-on-white scope
 * descriptions and an unreadable page.
 *
 * The fix is a `prefers-color-scheme` block rather than `light-dark()`: this CSS
 * is a template literal in TS source with no build step to down-level it, so
 * `light-dark()` would silently drop the whole declaration on an older browser
 * while a media query merely degrades to the (perfectly fine) light page.
 *
 * Asserted as a PAIRING, not a snapshot: every selector the light palette gives
 * a foreground or background colour must have a dark counterpart. A new
 * light-only rule is the exact defect this file exists to catch, so listing the
 * current selectors by hand would not catch it.
 */

import { describe, it, expect } from 'vitest';
import { htmlShell } from '../../../src/lib/html-shell.js';

const html = htmlShell('Test', '<p>body</p>');
const styleBlock = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
const darkAt = styleBlock.indexOf('@media (prefers-color-scheme: dark)');
const lightCss = styleBlock.slice(0, darkAt);
// The INSIDE of the media block: leaving the `@media … {` wrapper on would let
// the first rule inside it be parsed as the wrapper's own body.
const darkBlock = styleBlock.slice(darkAt);
const darkCss = darkBlock.slice(darkBlock.indexOf('{') + 1, darkBlock.lastIndexOf('}'));

/** Selectors carrying a `color` or `background` declaration, in source order. */
const selectorsWithColour = (css: string): string[] => {
  const found: string[] = [];
  for (const [, selector, body] of css.matchAll(/([^{}@]+)\{([^}]*)\}/g)) {
    if (!/(^|[;\s])(color|background)\s*:/.test(body)) continue;
    const name = selector.trim().split('\n').pop()!.trim();
    if (name && name !== ':root') found.push(name);
  }
  return found;
};

describe('htmlShell dark mode', () => {
  it('opts into both schemes and ships a dark block', () => {
    expect(styleBlock).toContain('color-scheme: light dark');
    expect(darkAt, 'a prefers-color-scheme:dark block is present').toBeGreaterThan(-1);
  });

  it('prefers a media query over light-dark(), which has no build step here', () => {
    expect(styleBlock).not.toContain('light-dark(');
  });

  it('gives every colour-bearing selector a dark counterpart', () => {
    const light = selectorsWithColour(lightCss);
    const dark = new Set(selectorsWithColour(darkCss));

    // Vacuity guard: the extraction must actually find rules, or this passes
    // over an empty set — the failure mode that has bitten guards in this repo.
    expect(light.length, 'light palette rules were extracted').toBeGreaterThan(4);
    expect(dark.size, 'dark palette rules were extracted').toBeGreaterThan(4);

    // `input` and `body` inherit the canvas and are deliberately not re-stated.
    const inheritsCanvas = new Set(['body', 'input[type=password]']);
    const missing = light.filter((sel) => !inheritsCanvas.has(sel) && !dark.has(sel));
    expect(
      missing,
      `light-only rules would render on a dark canvas: ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('inverts the button rather than leaving it dark-on-dark', () => {
    expect(lightCss).toMatch(/button\s*\{[^}]*background:\s*#1a1a1a/);
    expect(darkCss).toMatch(/button\s*\{[^}]*background:\s*#f4f4f4/);
    expect(darkCss).toMatch(/button\s*\{[^}]*color:\s*#1a1a1a/);
  });

  it('keeps the hover state paired with its base in both schemes', () => {
    for (const css of [lightCss, darkCss]) {
      const base = selectorsWithColour(css);
      for (const hover of base.filter((s) => s.endsWith(':hover'))) {
        expect(base, `${hover} has a base rule in the same scheme`).toContain(
          hover.replace(':hover', '')
        );
      }
    }
  });
});
