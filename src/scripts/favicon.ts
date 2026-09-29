/**
 * Tab icon (STYLES_GUIDE § Browser chrome).
 *
 * The browser-tab icon follows the day's palette (ADR-0040): palette 0 keeps
 * /favicon.svg, every other palette uses /favicons/palette-N.svg — the same
 * delta, only its stroke recoloured to the palette's light-theme primary
 * (rendered by `npm run media:pwa-assets`). It does not follow the site's
 * theme: the tab strip is the browser's, not the page's.
 *
 * The inline look block in BaseLayout.astro sets the restored palette's icon
 * before first paint; this module keeps it in step when a palette is picked.
 */

const ICON = 'link[rel="icon"]';
/** Same match as BaseLayout's look block and palette-manager — never
 *  `palette-popped-out`. */
const PALETTE = /\bpalette-(\d)\b/;

export function faviconFor(className: string): string {
  const id = PALETTE.exec(className)?.[1] ?? '0';
  return id === '0' ? '/favicon.svg' : `/favicons/palette-${id}.svg`;
}

export function syncFavicon(): void {
  const icon = document.querySelector(ICON);
  if (!icon) return;
  const href = faviconFor(document.documentElement.className);
  // getAttribute, not .href — the property is resolved to an absolute URL.
  if (icon.getAttribute('href') !== href) icon.setAttribute('href', href);
}

new MutationObserver(syncFavicon).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['class'],
});
syncFavicon();
