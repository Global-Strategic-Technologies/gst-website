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
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inlineRootUrls } from './lib/inline-urls.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const CACHE = join(HERE, '.cache');
const OUT = join(CACHE, 'gst-styles.css');
const FONTS_SRC = 'src/styles/fonts.css';
const FONTS_OUT = join(CACHE, 'gst-fonts.css');

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

// ---------------------------------------------------------------------------
// The pinned face (BL-144) ships through `cfg.extraFonts`, not through the
// sheet above — this file is that config entry's input.
//
// Why it cannot ride in gst-styles.css: `cfg.cssEntry` becomes `_ds_bundle.css`,
// and the converter REWRITES that file's @font-face blocks, dropping any whose
// `src` it judges unresolvable (lib/css.mjs `rewriteBundleFontFaces`) — a dead
// face declared after fonts/fonts.css would shadow the working one, so dropping
// it is correct in general. It drops ours either way: a bare `/fonts/…` url is
// genuinely unresolvable in the design environment, and the data URI that
// inlineRootUrls substitutes trips a quote-backtracking bug in the drop test
// (`url\(\s*['"]?(?!…data:…)` — the optional quote matches zero width, so the
// lookahead reads `"data:` and passes). Either way `GST Mono` reaches the bundle
// referenced but undeclared, and validate reports [FONT_MISSING] — measured on
// the 2026-08-29 run, where designs would have rendered in the fallbacks.
//
// So the face is handed to the converter's own font path instead: `extraFonts`
// runs extractFonts over this file, copies the woff2 into `fonts/`, rewrites the
// url to `./<name>`, and writes `fonts/fonts.css` — which styles.css imports
// BEFORE `_ds_bundle.css`, so it reaches designs and is never shadowed.
//
// Derived, never hand-authored: src/styles/fonts.css stays the single source of
// truth, so a re-cut (new filename, new unicode-range) needs no edit here.
// Only url()-bearing faces are emitted — extractFonts skips url-less ones, and
// the two `local()` metric-matched fallbacks are already carried by the sheet
// above (they survive the rewrite precisely because they have no url to drop).
const fontsSrc = readFileSync(join(REPO, FONTS_SRC), 'utf8');
const faces = [...fontsSrc.matchAll(/@font-face\s*\{[^}]*\}/g)]
  .map((m) => m[0])
  .filter((f) => /url\(/.test(f))
  // Root-absolute in production; extractFonts resolves url()s against THIS
  // file's directory, so re-point them at public/ from .design-sync/.cache/.
  .map((f) => f.replace(/url\((['"]?)\/([^'")]+)\1\)/g, `url($1../../public/$2$1)`));

if (!faces.length) {
  console.error(
    `[GST_CSS] no url()-bearing @font-face found in ${FONTS_SRC} — the pinned face would not ship`
  );
  process.exit(1);
}

writeFileSync(
  FONTS_OUT,
  `/* Generated by build-css.mjs from ${FONTS_SRC}. Do not edit. */\n${faces.join('\n\n')}\n`
);
console.error(`[GST_CSS] ${faces.length} @font-face → ${FONTS_OUT} (cfg.extraFonts)`);
