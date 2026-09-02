// Probe: does html.dark-theme actually flip the shipped bundle's tokens?
//
// Opens a real preview card, reads the computed values of the tokens that are
// supposed to switch, then adds the dark-theme class and reads them again.
// If light-dark() survived the lightningcss flattening, these differ.
//
// Needs a prior full package-build (ds-bundle/ is gitignored). Run from the
// repo root: node .design-sync/dark-probe.mjs
/* global document, getComputedStyle -- the page.evaluate() callbacks below are
   serialised and run inside the browser, where these are defined. */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const card = resolve('ds-bundle/components/specimens/DataSpecimen/DataSpecimen.html');
if (!existsSync(card)) {
  console.error(`[DARK_PROBE] ${card} not found — run a full package-build first (see NOTES.md).`);
  process.exit(1);
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
await page.goto(pathToFileURL(card).href, { waitUntil: 'networkidle' });

const TOKENS = [
  '--text-primary',
  '--bg-light',
  '--bg-light-alt',
  '--border-light',
  '--color-primary',
];

const read = () =>
  page.evaluate((tokens) => {
    const cs = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    const out = { _bodyBg: body.backgroundColor, _bodyColor: body.color };
    for (const t of tokens) out[t] = cs.getPropertyValue(t).trim();
    return out;
  }, TOKENS);

const light = await read();
await page.screenshot({ path: 'ds-bundle/_screenshots/_probe-light.png' });

await page.evaluate(() => document.documentElement.classList.add('dark-theme'));
await page.waitForTimeout(200);
const dark = await read();
await page.screenshot({ path: 'ds-bundle/_screenshots/_probe-dark.png' });

console.log('token'.padEnd(18), 'light'.padEnd(26), 'dark');
let changed = 0;
for (const k of Object.keys(light)) {
  const same = light[k] === dark[k];
  if (!same) changed++;
  console.log(
    k.padEnd(18),
    String(light[k]).padEnd(26),
    String(dark[k]),
    same ? '  (unchanged)' : '  <-- SWITCHED'
  );
}
console.log(`\n${changed}/${Object.keys(light).length} values switched under html.dark-theme`);

await browser.close();
