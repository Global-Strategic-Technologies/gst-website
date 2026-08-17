// Inline root-absolute url() references in a stylesheet as data URIs.
//
// The design environment has no server: a `url(/deltas/foo.svg)` that resolves
// against `public/` in production 404s there, and a mask-image that 404s hides
// its element entirely rather than merely rendering unmasked. Used by
// build-css.mjs (assets under public/) and extract-chrome.mjs (assets under
// dist/client/, where Astro's hashed /_astro/* files live).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MIME = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

/**
 * @param {string} css
 * @param {string} assetRoot absolute dir that root-absolute urls resolve against
 * @param {(msg: string) => void} [warn]
 * @returns {{ css: string, inlined: number }}
 */
export function inlineRootUrls(css, assetRoot, warn = (m) => console.error(m)) {
  let inlined = 0;
  const out = css.replace(/url\((['"]?)(\/[^'")]+)\1\)/g, (whole, _q, urlPath) => {
    const clean = urlPath.split(/[?#]/)[0];
    const asset = join(assetRoot, clean);
    if (!existsSync(asset)) {
      warn(`[INLINE_URLS] ! url(${urlPath}) has no file under ${assetRoot} — left as-is`);
      return whole;
    }
    const ext = clean.slice(clean.lastIndexOf('.')).toLowerCase();
    const mime = MIME[ext] ?? 'application/octet-stream';
    inlined++;
    return `url("data:${mime};base64,${readFileSync(asset).toString('base64')}")`;
  });
  return { css: out, inlined };
}
