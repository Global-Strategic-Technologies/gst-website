#!/usr/bin/env node
// Flattens the GST stylesheet graph into one self-contained file for design-sync.
//
// Why this exists: `cfg.cssEntry` is copied verbatim to `_ds_bundle.css` at the
// bundle root, so any `@import './variables.css'` inside it would dangle (the
// design environment only receives `styles.css`'s transitive import closure).
// Flattening up front makes that closure real.
//
// It uses the repo's OWN lightningcss + browserslist targets — the same pair
// astro.config.mjs passes to Vite — so the design system renders with the CSS
// production actually ships, prefixes included.
//
// Run from the repo root: node .design-sync/build-css.mjs
import { bundle, browserslistToTargets } from 'lightningcss';
import browserslist from 'browserslist';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inlineRootUrls } from './lib/inline-urls.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const CACHE = join(HERE, '.cache');
const OUT = join(CACHE, 'gst-styles.css');

// Site-wide sheet first (it @imports variables/typography/interactions/palettes
// plus the globally-loaded component modules), then the code-split sheets
// that global.css deliberately does NOT import — see the comment block at the
// top of src/styles/global.css. The Design agent has no page-level code
// splitting, so it gets the full class vocabulary in one file.
const ROOTS = [
  'src/styles/global.css',
  'src/styles/components/filter.css',
  'src/styles/components/portfolio.css',
  'src/styles/components/map.css',
  'src/styles/components/progress.css',
  'src/styles/components/mcp-guide.css',
  'src/styles/toc.css',
];

mkdirSync(CACHE, { recursive: true });

const missing = ROOTS.filter((r) => !existsSync(join(REPO, r)));
if (missing.length) {
  console.error(`[GST_CSS] missing stylesheet(s): ${missing.join(', ')}`);
  process.exit(1);
}

const entry = join(CACHE, '_css-entry.css');
writeFileSync(entry, ROOTS.map((r) => `@import '../../${r}';`).join('\n') + '\n');

const { code } = bundle({
  filename: entry,
  minify: false,
  // Matches astro.config.mjs. Load-bearing: without targets LightningCSS
  // strips -webkit-backdrop-filter and the frosted-glass aesthetic breaks.
  targets: browserslistToTargets(browserslist(undefined, { path: REPO })),
});

let css = code.toString();

// Root-absolute url() refs point at public/, which does not exist in the design
// environment. Inline them so the sheet is self-contained (shared helper —
// extract-chrome.mjs uses the same one against dist/client/).
const { css: inlinedCss, inlined } = inlineRootUrls(css, join(REPO, 'public'));
css = inlinedCss;

writeFileSync(OUT, css);
console.error(
  `[GST_CSS] ${ROOTS.length} roots → ${OUT} (${(css.length / 1024).toFixed(0)} KB, ${inlined} asset(s) inlined)`
);
