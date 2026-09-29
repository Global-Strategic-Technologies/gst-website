#!/usr/bin/env node
// Browser globals: used only inside page.evaluate / addInitScript callbacks.
/* global Image, OffscreenCanvas, localStorage, document */
/**
 * Render the PWA install assets from their sources (STYLES_GUIDE § Browser
 * chrome).
 *
 *   npm run media:pwa-assets                    icons (and tab icons, below)
 *   npm run media:pwa-assets -- --screenshots   also the install screenshots
 *   npm run media:pwa-assets -- --check <png>   safe-zone check on one PNG
 *
 * Icons, from public/images/icon.svg (the static composite mark):
 *   - `any`: web-app-manifest-{192,512}.png — the mark as-is, frame and all.
 *   - `maskable`: web-app-maskable-{192,512}.png — full-bleed white, no frame,
 *     the whole mark scaled uniformly (never re-proportioned) into the centre,
 *     so Android's circle / squircle mask never cuts ink.
 *   - apple-touch-icon.png (180) — the maskable composition, so iOS's rounded
 *     corners never cut the frame.
 * Every padded icon is measured after rendering: the run fails if any ink
 * pixel lies beyond the maskable safe zone (40% of the width from the centre).
 * `--check` runs the same measurement on an existing PNG — the old icon fails
 * it, which is how the check was proven able to fail.
 *
 * Screenshots (only with --screenshots; needs a dev server, default
 * http://localhost:4321, override with --base <url>): the home page at a phone
 * and a desktop size, JPEG q85, pinned to palette 0 / light / motion off. They
 * are WRITE-ONCE, like the consent still: re-run when the home page changes
 * materially. Nothing guards their staleness.
 *
 * Rendering is Playwright chromium (already a devDependency) — no image
 * library is added.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const at = (p) => resolve(ROOT, p);
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

/** Maskable safe zone: a circle of 40% of the width (W3C manifest spec). */
const SAFE_RADIUS = 0.4;
/** Where the padded mark's farthest ink is placed — inside the safe zone. */
const TARGET_RADIUS = 0.38;
/** Ink = clearly not the white background (the old icon was measured so). */
const INK_SUM = 600;

const iconSvg = readFileSync(at('public/images/icon.svg'), 'utf8');
const FRAME = /\s*<rect [^>]*fill="none" stroke="#000000"[^>]*\/>/;
if (!FRAME.test(iconSvg)) throw new Error('icon.svg: the border rect was not found');
const unframedSvg = iconSvg.replace(FRAME, '');

const dataUrl = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

/** Render `svg` centred on a white `size` square at `scale` of the square. */
async function render(page, svg, size, scale = 1) {
  await page.setViewportSize({ width: size, height: size });
  const img = Math.round(size * scale);
  await page.setContent(
    `<body style="margin:0;background:#fff;width:${size}px;height:${size}px;display:grid;place-items:center">
       <img src="${dataUrl(svg)}" width="${img}" height="${img}" style="display:block">
     </body>`,
    { waitUntil: 'load' }
  );
  return page.screenshot({ type: 'png', omitBackground: false });
}

/** The farthest ink pixel from the centre, as a fraction of the width. */
async function inkRadius(page, png, inset = 0) {
  return page.evaluate(
    async ({ src, inset, inkSum }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const { width: w, height: h } = img;
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, w, h);
      let worst = 0;
      for (let y = inset; y < h - inset; y++) {
        for (let x = inset; x < w - inset; x++) {
          const i = (y * w + x) * 4;
          if (data[i + 3] > 0 && data[i] + data[i + 1] + data[i + 2] < inkSum) {
            worst = Math.max(worst, Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2));
          }
        }
      }
      return worst / w;
    },
    { src: `data:image/png;base64,${png.toString('base64')}`, inset, inkSum: INK_SUM }
  );
}

function assertSafe(name, radius) {
  const pct = (radius * 100).toFixed(1);
  if (radius > SAFE_RADIUS) {
    throw new Error(`${name}: ink reaches ${pct}% of the width from the centre (safe zone 40%)`);
  }
  console.log(`  ${name}: farthest ink ${pct}% of the width (safe zone 40%)`);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  if (flag('--check')) {
    const file = option('--check');
    // Inset 8px: skip an edge frame, measure the mark itself.
    const radius = await inkRadius(page, readFileSync(resolve(file)), 8);
    assertSafe(file, radius);
  } else {
    console.log('icons');
    for (const size of [192, 512]) {
      const out = `public/images/web-app-manifest-${size}.png`;
      writeFileSync(at(out), await render(page, iconSvg, size));
      console.log(`  wrote ${out}`);
    }

    // Measure the unframed mark once at full size, then scale it so its
    // farthest ink lands on TARGET_RADIUS. Scaling is about the centre, so
    // every distance scales by the same factor.
    const probe = await render(page, unframedSvg, 512);
    const scale = TARGET_RADIUS / (await inkRadius(page, probe));
    for (const [out, size] of [
      ['public/images/web-app-maskable-192.png', 192],
      ['public/images/web-app-maskable-512.png', 512],
      ['public/images/apple-touch-icon.png', 180],
    ]) {
      const png = await render(page, unframedSvg, size, scale);
      assertSafe(out, await inkRadius(page, png));
      writeFileSync(at(out), png);
      console.log(`  wrote ${out}`);
    }

    if (flag('--screenshots')) {
      const base = option('--base', 'http://localhost:4321');
      console.log(`screenshots from ${base}`);
      // The look is pinned as the E2E baseline pins it
      // (tests/e2e/helpers/storage-baseline.ts baselineStorageState — copied,
      // since Node cannot import the .ts): palette 0 and light, picked today,
      // ambient motion off.
      const pad = (n) => String(n).padStart(2, '0');
      const now = new Date();
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const look = {
        palette: '0',
        'palette-date': today,
        theme: 'light',
        'theme-date': today,
        'ambient-motion': '{"on":[]}',
      };
      mkdirSync(at('public/images/screenshots'), { recursive: true });
      for (const [out, viewport, deviceScaleFactor] of [
        ['public/images/screenshots/home-narrow.jpg', { width: 540, height: 1170 }, 2],
        ['public/images/screenshots/home-wide.jpg', { width: 1920, height: 1080 }, 1],
      ]) {
        const context = await browser.newContext({
          viewport,
          deviceScaleFactor,
          reducedMotion: 'reduce',
        });
        await context.addInitScript((entries) => {
          for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
        }, look);
        const shot = await context.newPage();
        await shot.goto(`${base}/`, { waitUntil: 'networkidle' });
        await shot.evaluate(() => document.fonts.ready);
        writeFileSync(at(out), await shot.screenshot({ type: 'jpeg', quality: 85 }));
        await context.close();
        console.log(`  wrote ${out}`);
      }
    }
  }
} finally {
  await browser.close();
}
