import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { palettes } from '@/data/palettes';

describe('palette CSS/TS sync', () => {
  const paletteCss = readFileSync(join(process.cwd(), 'src/styles/palettes.css'), 'utf-8');

  it('every palette ID in palettes.ts has a matching CSS class in palettes.css', () => {
    for (const palette of palettes) {
      const className = `html.palette-${palette.id}`;
      expect(paletteCss, `Missing CSS class for palette ${palette.id} (${palette.name})`).toContain(
        className
      );
    }
  });

  it('no CSS palette class exists without a matching TS entry', () => {
    const cssIds = [...paletteCss.matchAll(/html\.palette-(\d+)/g)].map((m) => Number(m[1]));
    const uniqueCssIds = [...new Set(cssIds)];
    const tsIds = palettes.map((p) => p.id);

    for (const cssId of uniqueCssIds) {
      expect(tsIds, `CSS defines palette-${cssId} but palettes.ts has no entry for it`).toContain(
        cssId
      );
    }
  });

  it('palette count matches between CSS and TS', () => {
    const cssIds = [...new Set([...paletteCss.matchAll(/html\.palette-(\d+)/g)].map((m) => m[1]))];
    expect(cssIds.length).toBe(palettes.length);
  });
});
