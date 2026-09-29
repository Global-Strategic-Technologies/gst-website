/**
 * Browser chrome colour (STYLES_GUIDE § Browser chrome).
 *
 * Mobile browsers that honour `<meta name="theme-color">` paint their status
 * bar with it, so it follows the site header's surface: one of the four theme
 * states (ADR-0038) or a swatch-editor edit of that surface's tokens. The
 * inline look block in BaseLayout.astro seeds the value for the restored theme
 * before first paint; this module takes over from the header's computed colour,
 * so the steady state cannot drift from variables.css.
 *
 * The first sync always rewrites once — the seed is hex, the computed value is
 * rgb(). A partly transparent editor value is passed through; browsers flatten
 * it. Only an empty or fully transparent value is skipped.
 */

import { parseAlpha } from '../utils/palette-utils';

const HEADER = '.site-header';
const META = 'meta[name="theme-color"]';

export function syncThemeColor(): void {
  const header = document.querySelector(HEADER);
  const meta = document.querySelector<HTMLMetaElement>(META);
  if (!header || !meta) return;
  const color = getComputedStyle(header).backgroundColor;
  if (!color || parseAlpha(color) === 0) return;
  if (meta.content !== color) meta.content = color;
}

// `class` is the theme cycle, palette switches, the /brand frames and tests
// seeding classes; `style` is the swatch editor's token edits on <html>. This
// module writes only the meta tag, never <html>, so it cannot loop.
new MutationObserver(syncThemeColor).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['class', 'style'],
});
syncThemeColor();
