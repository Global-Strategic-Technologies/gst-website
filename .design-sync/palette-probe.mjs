// Probe: do html.palette-0 … html.palette-5 actually re-point the shipped
// bundle's brand tokens — and does that reach a rendered element?
//
// Same pattern as dark-probe.mjs (read before re-syncing): opens a real preview
// card, reads computed token values and one painted element, then applies each
// palette class to <html> and reads again. Palette 0 is the default palette
// (it overrides only --color-authority/-distinguish/-subdued), so --color-primary
// is expected to stay put there and move under 1–5.
//
// Needs a prior full package-build (ds-bundle/ is gitignored). Run from the
// repo root: node .design-sync/palette-probe.mjs
/* global document, getComputedStyle -- the page.evaluate() callbacks below are
   serialised and run inside the browser, where these are defined. */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const card = resolve('ds-bundle/components/specimens/DataSpecimen/DataSpecimen.html');
if (!existsSync(card)) {
  console.error(
    `[PALETTE_PROBE] ${card} not found — run a full package-build first (see NOTES.md).`
  );
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
await page.goto(pathToFileURL(card).href, { waitUntil: 'networkidle' });

const TOKENS = ['--color-primary', '--color-secondary', '--color-authority', '--color-subdued'];
const PALETTES = [0, 1, 2, 3, 4, 5];

const read = () =>
  page.evaluate((tokens) => {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    for (const t of tokens) out[t] = cs.getPropertyValue(t).trim();
    // A painted element that uses the primary: the progress-bar fill.
    const fill = document.querySelector('.brutal-progress-bar__fill');
    out._fillBg = fill
      ? getComputedStyle(fill).backgroundColor
      : '(no .brutal-progress-bar__fill on card)';
    return out;
  }, TOKENS);

const base = await read();
const results = {};
for (const n of PALETTES) {
  await page.evaluate((cls) => {
    document.documentElement.classList.remove(
      ...[...document.documentElement.classList].filter((c) => c.startsWith('palette-'))
    );
    document.documentElement.classList.add(cls);
  }, `palette-${n}`);
  await page.waitForTimeout(100);
  results[n] = await read();
  await page.screenshot({ path: `ds-bundle/_screenshots/_probe-palette-${n}.png` });
}
await browser.close();

const keys = Object.keys(base);
console.log('key'.padEnd(20), 'base'.padEnd(22), ...PALETTES.map((n) => `palette-${n}`.padEnd(22)));
for (const k of keys) {
  console.log(
    k.padEnd(20),
    String(base[k]).padEnd(22),
    ...PALETTES.map((n) => String(results[n][k]).padEnd(22))
  );
}

// Verdict: palettes 1–5 must move --color-primary AND the painted fill; palette-0 must not.
let ok = true;
for (const n of PALETTES) {
  const movedPrimary = results[n]['--color-primary'] !== base['--color-primary'];
  const movedFill = results[n]._fillBg !== base._fillBg;
  const expectMove = n !== 0;
  const pass = movedPrimary === expectMove && movedFill === expectMove;
  if (!pass) ok = false;
  console.log(
    `palette-${n}: --color-primary ${movedPrimary ? 'moved' : 'unchanged'}, painted fill ${movedFill ? 'moved' : 'unchanged'} — ${pass ? 'as expected' : 'UNEXPECTED'}`
  );
}
console.log(
  ok ? '\nAll six palettes behave as expected against this bundle.' : '\nPALETTE PROBE FAILED'
);
process.exit(ok ? 0 : 1);
