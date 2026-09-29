/**
 * The PWA install assets (STYLES_GUIDE § Browser chrome) — the files the
 * manifest names exist, are the size it claims, and keep the jobs apart.
 *
 * The tab icons and install icons are rendered by `npm run media:pwa-assets`. This guard reads the
 * committed files, not the renderer, so a hand-edited manifest or a missed
 * re-render fails here. The maskable safe zone itself is measured by the
 * renderer, which fails the run when ink crosses it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRootTokens } from './helpers/css-parse';
import { palettes } from '../../src/data/palettes';

const ROOT = resolve(__dirname, '../..');
const RERUN = 'regenerate with `npm run media:pwa-assets`';

interface ManifestImage {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
  form_factor?: string;
  label?: string;
}
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'public/site.webmanifest'), 'utf8')) as {
  icons: ManifestImage[];
  screenshots: ManifestImage[];
};
const file = (src: string) => resolve(ROOT, 'public', src.replace(/^\//, ''));

/** Real pixel size from the PNG IHDR chunk. */
function pngSize(buf: Buffer): [number, number] {
  expect(buf.subarray(1, 4).toString('latin1'), 'PNG signature').toBe('PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

/** Real pixel size from a JPEG's first start-of-frame marker (SOF0–SOF3). */
function jpegSize(buf: Buffer): [number, number] {
  expect(buf.readUInt16BE(0), 'JPEG SOI marker').toBe(0xffd8);
  let at = 2;
  while (at < buf.length) {
    const marker = buf.readUInt16BE(at);
    const length = buf.readUInt16BE(at + 2);
    if (marker >= 0xffc0 && marker <= 0xffc3) {
      return [buf.readUInt16BE(at + 7), buf.readUInt16BE(at + 5)];
    }
    at += 2 + length;
  }
  throw new Error('no JPEG start-of-frame marker');
}

describe('manifest icons', () => {
  it('every icon exists and is the size the manifest declares', () => {
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) {
      expect(existsSync(file(icon.src)), `${icon.src} exists — ${RERUN}`).toBe(true);
      expect(icon.type).toBe('image/png');
      const [w, h] = pngSize(readFileSync(file(icon.src)));
      expect(`${w}x${h}`, `${icon.src} real size`).toBe(icon.sizes);
    }
  });

  it('maskable icons are their own padded files, not the `any` ones', () => {
    const srcs = (purpose: string) =>
      manifest.icons.filter((i) => i.purpose === purpose).map((i) => i.src);
    const any = srcs('any');
    const maskable = srcs('maskable');
    expect(any.length, '`any` icons declared').toBeGreaterThan(0);
    expect(maskable.length, '`maskable` icons declared').toBeGreaterThan(0);
    for (const src of maskable) expect(any, `${src} is not an \`any\` icon`).not.toContain(src);
  });

  it('the apple-touch-icon BaseLayout links is 180×180', () => {
    const layout = readFileSync(resolve(ROOT, 'src/layouts/BaseLayout.astro'), 'utf8');
    const href = /<link rel="apple-touch-icon" href="([^"]+)"/.exec(layout)?.[1];
    expect(href, 'apple-touch-icon link located').toBeTruthy();
    expect(pngSize(readFileSync(file(href!)))).toEqual([180, 180]);
  });
});

describe('manifest screenshots', () => {
  const iconSrcs = new Set(manifest.icons.map((i) => i.src));

  it('one narrow and one wide, labelled, and none of them an icon file', () => {
    expect(manifest.screenshots.map((s) => s.form_factor).sort()).toEqual(['narrow', 'wide']);
    for (const shot of manifest.screenshots) {
      expect(iconSrcs.has(shot.src), `${shot.src} is not an icon`).toBe(false);
      expect(shot.label, `${shot.src} has a label`).toBeTruthy();
    }
  });

  it('each exists, is the size declared, and is oriented for its form factor', () => {
    for (const shot of manifest.screenshots) {
      expect(existsSync(file(shot.src)), `${shot.src} exists — ${RERUN} -- --screenshots`).toBe(
        true
      );
      expect(shot.type).toBe('image/jpeg');
      const [w, h] = jpegSize(readFileSync(file(shot.src)));
      expect(`${w}x${h}`, `${shot.src} real size`).toBe(shot.sizes);
      // Chrome: 320–3840px a side, and the long side at most 2.3× the short.
      expect(Math.min(w, h)).toBeGreaterThanOrEqual(320);
      expect(Math.max(w, h)).toBeLessThanOrEqual(3840);
      expect(Math.max(w, h) / Math.min(w, h)).toBeLessThanOrEqual(2.3);
      if (shot.form_factor === 'narrow') expect(h, `${shot.src} is portrait`).toBeGreaterThan(w);
      else expect(w, `${shot.src} is landscape`).toBeGreaterThan(h);
    }
  });
});

/**
 * Tab icons: palette 0 keeps public/favicon.svg; every other palette has
 * public/favicons/palette-N.svg — favicon.svg with ONLY the stroke recoloured
 * to the palette's light-theme primary. The delta's geometry is the brand's
 * and must never drift in a variant.
 */
describe('palette tab icons', () => {
  const favicon = readFileSync(resolve(ROOT, 'public/favicon.svg'), 'utf8');
  const tokens = parseRootTokens(readFileSync(resolve(ROOT, 'src/styles/palettes.css'), 'utf8'));
  const cssIds = Object.keys(tokens)
    .map((name) => /^--alt(\d+)-color-primary$/.exec(name)?.[1])
    .filter((id): id is string => id !== undefined)
    .map(Number)
    .sort((a, b) => a - b);
  const variant = (id: number) => resolve(ROOT, `public/favicons/palette-${id}.svg`);

  it('reads the light-theme primaries (known-present values)', () => {
    // First, so a drifting extractor cannot make the checks below vacuous.
    expect(tokens['--alt1-color-primary']).toBe('#8e8e8e');
    expect(tokens['--alt5-color-primary']).toBe('#c145ff');
    expect(favicon).toContain('stroke="#05cd99"');
  });

  it('every palette but 0 has a tab icon', () => {
    const dataIds = palettes
      .map((p) => p.id)
      .filter((id) => id !== 0)
      .sort((a, b) => a - b);
    expect(cssIds, 'palettes.css primaries match src/data/palettes.ts').toEqual(dataIds);
    for (const id of dataIds) {
      expect(existsSync(variant(id)), `favicons/palette-${id}.svg exists — ${RERUN}`).toBe(true);
    }
  });

  it('each tab icon is favicon.svg with only the stroke recoloured to its primary', () => {
    for (const id of cssIds) {
      const primary = tokens[`--alt${id}-color-primary`].toLowerCase();
      expect(
        readFileSync(variant(id), 'utf8'),
        `favicons/palette-${id}.svg is favicon.svg in ${primary} — ${RERUN}`
      ).toBe(favicon.replace('stroke="#05cd99"', `stroke="${primary}"`));
    }
  });
});
