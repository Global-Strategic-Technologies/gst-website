// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  animatedCounts,
  ARROW_VOLLEYS,
  DELTAS,
  GRID_CELLS,
  RAILS,
} from '../../src/data/ambient-effects';
import { buildLayers, buildTile, deltaSvg } from '../../src/scripts/ambient/build';

/**
 * The effect is built in the browser (BL-035, ADR-0039: loaded only when a
 * visitor opted in). This counts what the builder renders against the tables
 * the budget test sums, and pins its delta to the brand DeltaIcon.
 */
describe('ambient effect builder (BL-035)', () => {
  const layers = buildLayers();
  const byId = (id: string) => layers.find((l) => l.classList.contains(`ambient__layer--${id}`))!;
  const counts = animatedCounts();

  it('builds the six layers in order', () => {
    expect(layers.map((l) => l.className)).toEqual(
      ['grid', 'glow', 'scan', 'rails', 'deltas', 'arrows'].map(
        (id) => `ambient__layer ambient__layer--${id}`
      )
    );
  });

  it('builds one animated element per table row, solo exactly where the table says', () => {
    const cases: Array<[string, string, ReadonlyArray<{ solo: boolean }>]> = [
      ['grid', '.ambient__cell', GRID_CELLS],
      ['rails', '.ambient__rail', RAILS],
      ['deltas', '.ambient__delta', DELTAS],
      ['arrows', '.ambient__volley', ARROW_VOLLEYS],
    ];
    for (const [id, sel, table] of cases) {
      const els = [...byId(id).querySelectorAll(sel)];
      expect(els, id).toHaveLength(table.length);
      els.forEach((el, i) =>
        expect(el.classList.contains('ambient__el--solo'), `${id}[${i}]`).toBe(table[i].solo)
      );
    }
    expect(byId('glow').querySelectorAll('.ambient__glow')).toHaveLength(counts.glow.all);
    expect(byId('scan').querySelectorAll('.ambient__scan')).toHaveLength(counts.scan.all);
    expect(byId('rails').querySelectorAll('.ambient__mark')).toHaveLength(counts.rails.all);
  });

  it('marks each volley’s first arrow as its lead', () => {
    const volleys = [...byId('arrows').querySelectorAll('.ambient__volley')];
    volleys.forEach((v, i) => {
      const arrows = [...v.querySelectorAll('.ambient__arrow')];
      expect(arrows).toHaveLength(ARROW_VOLLEYS[i].arrows.length);
      expect(arrows.map((a) => a.hasAttribute('data-lead'))).toEqual(arrows.map((_, j) => j === 0));
    });
  });

  it('builds a tile in tile mode, already ready (no fade on scroll)', () => {
    const tile = buildTile();
    expect(tile.className).toBe('ambient ambient--tile');
    expect(tile.hasAttribute('data-ambient-ready')).toBe(true);
    expect(tile.getAttribute('aria-hidden')).toBe('true');
    expect(tile.children).toHaveLength(6);
  });

  it('draws the brand delta exactly as DeltaIcon.astro does', () => {
    const src = readFileSync(resolve(__dirname, '../../src/components/DeltaIcon.astro'), 'utf8');
    const attr = (name: string) => src.match(new RegExp(`${name}="([^"]+)"`))?.[1];
    const svg = deltaSvg(20);
    const path = svg.querySelector('path')!;
    expect(svg.getAttribute('viewBox')).toBe(attr('viewBox'));
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect([svg.getAttribute('width'), svg.getAttribute('height')]).toEqual(['20', '20']);
    expect(svg.getAttribute('fill')).toBe('none');
    expect(path.getAttribute('d')).toBe(attr('d'));
    expect(path.getAttribute('stroke-linejoin')).toBe(attr('stroke-linejoin'));
    // DeltaIcon's outline (not `filled`) branch: stroke currentColor, width 6.
    expect(src).toContain(`stroke={filled ? undefined : '${path.getAttribute('stroke')}'}`);
    expect(src).toContain(
      `stroke-width={filled ? undefined : '${path.getAttribute('stroke-width')}'}`
    );
    expect(path.getAttribute('fill')).toBe('none');
  });
});
