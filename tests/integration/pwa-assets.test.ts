/**
 * The PWA install assets (STYLES_GUIDE § Browser chrome) — the files the
 * manifest names exist, are the size it claims, and keep the jobs apart.
 *
 * The icons are rendered by `npm run media:pwa-assets`. This guard reads the
 * committed files, not the renderer, so a hand-edited manifest or a missed
 * re-render fails here. The maskable safe zone itself is measured by the
 * renderer, which fails the run when ink crosses it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
