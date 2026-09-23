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
import { EFFECT_IDS } from '../../src/scripts/ambient-motion';

/**
 * The ceiling: at most 16 animated elements on screen. BL-035 set 15; the
 * operator raised it to 16 on 2026-09-23 so Delta Arrows keeps two volleys
 * when layered. AmbientEffect.astro renders these tables, so counting them
 * counts what animates — one effect alone shows everything, and with two or
 * more on (or at ≤768px) only the non-`solo` elements. A Delta Arrows volley
 * is one animated element however many deltas it carries.
 */
const BUDGET = 16;

describe('ambient-motion element budget (BL-035)', () => {
  const counts = animatedCounts();

  it('counts every effect, and the tables are not empty', () => {
    expect(Object.keys(counts).sort()).toEqual([...EFFECT_IDS].sort());
    for (const table of [GRID_CELLS, RAILS, DELTAS, ARROW_VOLLEYS])
      expect(table.length).toBeGreaterThan(0);
    for (const id of EFFECT_IDS) expect(counts[id].thinned, id).toBeGreaterThan(0);
  });

  it('any single effect stays within the budget', () => {
    for (const id of EFFECT_IDS) expect(counts[id].all, id).toBeLessThanOrEqual(BUDGET);
  });

  it('all six layered stay within the budget', () => {
    const total = EFFECT_IDS.reduce((n, id) => n + counts[id].thinned, 0);
    expect(total).toBeLessThanOrEqual(BUDGET);
  });

  it('a page-background tile always carries only the thinned set', () => {
    // AmbientPage clones AmbientEffect with `tile`, which hides every `solo`
    // element — so a tile is the layered total, whatever is selected.
    const src = readFileSync(
      resolve(__dirname, '../../src/components/AmbientEffect.astro'),
      'utf8'
    );
    expect(src).toMatch(/\.ambient--tile \.ambient__el--solo/);
    const tile = EFFECT_IDS.reduce((n, id) => n + counts[id].thinned, 0);
    expect(tile).toBeLessThanOrEqual(BUDGET);
  });

  it('rails run in all four directions, even thinned', () => {
    const dirs = (xs: typeof RAILS) => new Set(xs.map((r) => r.dir));
    expect(dirs(RAILS)).toEqual(new Set(['up', 'down', 'left', 'right']));
    expect(dirs(RAILS.filter((r) => !r.solo))).toEqual(new Set(['up', 'down', 'left', 'right']));
  });

  it('AmbientEffect renders these tables, and one element per glow and scan count', () => {
    const src = readFileSync(
      resolve(__dirname, '../../src/components/AmbientEffect.astro'),
      'utf8'
    );
    expect(src).toMatch(/from '\.\.\/data\/ambient-effects'/);
    for (const name of ['GRID_CELLS.map', 'RAILS.map', 'DELTAS.map', 'ARROW_VOLLEYS.map'])
      expect(src).toContain(name);
    expect(src.match(/class="ambient__glow /g)?.length).toBe(counts.glow.all);
    expect(src.match(/class="ambient__scan"/g)?.length).toBe(counts.scan.all);
  });

  it('Delta Arrows: clusters of 2–4, two of them kept when layered', () => {
    for (const v of ARROW_VOLLEYS) {
      expect(v.arrows.length).toBeGreaterThanOrEqual(2);
      expect(v.arrows.length).toBeLessThanOrEqual(4);
      // The lead sits at the volley's origin; the tests find it there.
      expect(v.arrows[0]).toMatchObject({ ax: 0, ay: 0 });
      // A trip runs lane−15 → lane+115 (container %) over the first 66% of
      // the cycle, with pulse peaks at 16% and 42%: both stay on screen only
      // for lanes of about −12…18 (AmbientEffect.astro § 06).
      expect(v.lane, `lane ${v.lane}`).toBeGreaterThanOrEqual(-12);
      expect(v.lane, `lane ${v.lane}`).toBeLessThanOrEqual(18);
    }
    expect(counts.arrows.thinned).toBe(2);
  });
});
