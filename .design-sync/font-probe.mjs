// Probe: does a DESIGN built with this bundle actually get the pinned face?
//
// BL-144 pinned `--font-family-mono` to a self-hosted `GST Mono`. Whether that
// survives the sync is not something the validator's [FONT_MISSING] line can
// settle on its own — it went quiet once `cfg.extraFonts` was wired, but the
// question it answers is "is a matching @font-face declared", not "does the
// face load and set text". So this measures the property instead.
//
// It deliberately loads ONLY `styles.css`, not a preview card: cards link
// `_ds_bundle.css` directly as well, and that second link masks exactly the
// failure this exists to catch. Rendered designs receive the styles.css import
// closure and nothing else — so that is what gets probed.
//
// The measurement is the face's own defining property: every glyph in Geist
// Mono has a 600/1000 advance, so N characters at 100px must set 60N px
// exactly. No system mono matches that (Menlo/DejaVu 602, Consolas 549.8), and
// the metric-matched fallbacks reach it only via `size-adjust` — which is why
// the probe also asserts document.fonts loaded the real file rather than
// trusting the width alone.
/* global document, getComputedStyle -- the page.evaluate() callbacks below are
   serialised and run inside the browser, where these are defined. */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve('ds-bundle');
if (!existsSync(resolve(OUT, 'styles.css'))) {
  console.error(
    '[FONT_PROBE] ds-bundle/styles.css is missing — run package-build.mjs first (see .design-sync/NOTES.md).'
  );
  process.exit(1);
}

const SAMPLE = 'ABCDEFGHIJ'; // 10 chars; at 100px the pinned face sets 600.00px
const EXPECTED = 600;

// Dot-prefixed: local telemetry, never uploaded (see NOTES.md § the upload set).
const probe = resolve(OUT, '.font-probe.html');
writeFileSync(
  probe,
  `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="./styles.css">
<style>
  span { font-size: 100px; line-height: normal; white-space: pre; }
  #pinned   { font-family: var(--font-family-mono); }
  #declared { font-family: 'GST Mono'; }
  #control  { font-family: monospace; }
</style>
<span id="pinned">${SAMPLE}</span><br>
<span id="declared">${SAMPLE}</span><br>
<span id="control">${SAMPLE}</span>
`
);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 500 } });
await page.goto(pathToFileURL(probe).href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

const result = await page.evaluate(() => {
  // The TEXT, not the box: the shipped global.css lays spans out wider than
  // their glyphs, so an element rect measures the layout and hides the face.
  const width = (id) => {
    const r = document.createRange();
    r.selectNodeContents(document.getElementById(id));
    return r.getBoundingClientRect().width;
  };
  return {
    stack: getComputedStyle(document.getElementById('pinned')).fontFamily,
    loaded: [...document.fonts].map((f) => `${f.family} ${f.status}`),
    checkPinned: document.fonts.check('100px "GST Mono"'),
    pinned: width('pinned'),
    declared: width('declared'),
    control: width('control'),
  };
});

await page.screenshot({ path: resolve(OUT, '_screenshots/_probe-font.png') });

// Second surface: the chrome cards ship the face through a DIFFERENT pipeline —
// extract-chrome.mjs inlines it as a data URI straight from dist/client/, never
// touching cfg.extraFonts — so a regression in one is invisible to the other.
// TableOfContents is the card that earns the check: it draws U+2500–257F box
// rules, the block whose omission from the subset range would misalign the tree.
const TOC = resolve(OUT, 'components/chrome/TableOfContents/TableOfContents.html');
let chrome = null;
if (existsSync(TOC)) {
  const cp = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  // Block the shared stylesheet. Chrome cards link ../../../styles.css AND
  // carry their own inlined @font-face blocks, so a card left to load both
  // resolves the face from the bundle even when its inlined copy is broken —
  // measured: corrupting the card's data URI still set 600.00px. Blocking the
  // link is what makes this arm test extract-chrome's pipeline rather than
  // re-testing the design surface above.
  await cp.route('**/styles.css', (route) => route.abort());
  await cp.goto(pathToFileURL(TOC).href, { waitUntil: 'networkidle' });
  await cp.evaluate(() => document.fonts.ready);
  // Measured, not `document.fonts.check()`: the card's CSS declares the faces
  // twice (the slice carries them and so does the inlined bundle), so one copy
  // is always lazily `unloaded` and check() reports false while text renders in
  // the face perfectly well. Width is the property that actually matters.
  chrome = await cp.evaluate(async (sample) => {
    const el = document.createElement('span');
    el.textContent = sample;
    // Names the face DIRECTLY, with no fallback behind it. Measuring through
    // var(--font-family-mono) would prove nothing: the fallbacks are
    // metric-matched, so Consolas at size-adjust 109.1% also sets 599.84px —
    // inside any sane tolerance for 600. With the stack removed, a face that
    // failed to load drops to the browser default and the width collapses.
    el.style.cssText = "font-family: 'GST Mono'; font-size: 100px; white-space: pre;";
    document.body.appendChild(el);
    await document.fonts.ready;
    const r = document.createRange();
    r.selectNodeContents(el);
    const width = r.getBoundingClientRect().width;
    el.remove();
    return { width, faces: [...document.fonts].map((f) => `${f.family} ${f.status}`) };
  }, SAMPLE);
  await cp.close();
}

await browser.close();

console.log('stack behind --font-family-mono:', result.stack);
console.log('faces the document loaded:      ', result.loaded.join(' | ') || '(none)');
console.log(`document.fonts.check('100px "GST Mono"'): ${result.checkPinned}`);
console.log('');
console.log(
  `${SAMPLE.length} chars @100px  via var(--font-family-mono): ${result.pinned.toFixed(2)}px`
);
console.log(
  `${SAMPLE.length} chars @100px  naming 'GST Mono' directly:  ${result.declared.toFixed(2)}px`
);
console.log(
  `${SAMPLE.length} chars @100px  generic monospace (control): ${result.control.toFixed(2)}px`
);

console.log('');
console.log(
  chrome === null
    ? 'chrome card: TableOfContents not built — run extract-chrome.mjs (see NOTES.md)'
    : `chrome card (TableOfContents, inlined by extract-chrome): ${SAMPLE.length} chars @100px = ${chrome.width.toFixed(2)}px`
);

// `declared` is the load-bearing number on the design surface for the same
// reason: it names 'GST Mono' with nothing behind it, so it can only measure
// 600 if the real file loaded. `pinned` (through the token) confirms the stack
// is wired; `control` confirms the probe can see a difference at all.
const off = Math.abs(result.declared - EXPECTED);
const chromeOff = chrome === null ? 0 : Math.abs(chrome.width - EXPECTED);
const designOk = result.checkPinned && off < 0.5 && Math.abs(result.pinned - EXPECTED) < 0.5;
const chromeOk = chrome === null || chromeOff < 0.5;
const ok = designOk && chromeOk;
console.log(
  `\n${ok ? 'PASS' : 'FAIL'} — the pinned face ${designOk ? 'sets' : 'does NOT set'} text in a design (expected ${EXPECTED}px, off by ${off.toFixed(2)}px)${chromeOk ? '' : ', and is missing from the chrome cards'}`
);
process.exit(ok ? 0 : 1);
