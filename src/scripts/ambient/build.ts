/**
 * Builds the ambient-motion effect layer (BL-035, ADR-0039) in the browser.
 *
 * Loaded only by browsers that draw motion (src/scripts/ambient/loader.ts):
 * motion is on by default, but a browser that switched it off, or prefers
 * reduced motion, downloads none of it. It renders
 * the tables in src/data/ambient-effects.ts; tests/unit/ambient-build.test.ts
 * counts what it builds against them, and pins deltaSvg() to DeltaIcon.astro.
 *
 * Inline custom properties are written with LITERAL names (`--x: …`, never
 * `--${k}`): tests/unit/undefined-css-custom-properties.test.ts only sees a
 * definition it can read as text.
 */
import {
  ARROW_VOLLEYS,
  DELTAS,
  GRID_CELLS,
  GRID_DURATION,
  RAILS,
} from '../../data/ambient-effects';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The brand delta, as DeltaIcon.astro renders it (outline, stroke 6 in a 64 box). */
export function deltaSvg(size: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('style', 'flex-shrink:0;');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M32 12 L52 52 L12 52 Z');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '6');
  path.setAttribute('stroke-linejoin', 'miter');
  svg.append(path);
  return svg;
}

function el(className: string, style?: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = className;
  if (style) span.setAttribute('style', style);
  return span;
}

function layer(id: string): HTMLDivElement {
  const div = document.createElement('div');
  div.className = `ambient__layer ambient__layer--${id}`;
  return div;
}

const solo = (isSolo: boolean) => (isSolo ? ' ambient__el--solo' : '');
const vertical = (dir: string) => dir === 'up' || dir === 'down';

/** The six effect layers, in the order AmbientEffect.astro rendered them. */
export function buildLayers(): HTMLDivElement[] {
  const grid = layer('grid');
  for (const c of GRID_CELLS)
    grid.append(
      el(
        `ambient__cell${solo(c.solo)}`,
        `--x: ${c.x}%; --y: ${c.y}%; --d: ${GRID_DURATION}; --o: ${c.delay};`
      )
    );

  const glow = layer('glow');
  glow.append(el('ambient__glow ambient__glow--a'), el('ambient__glow ambient__glow--b'));

  const scan = layer('scan');
  scan.append(el('ambient__scan'));

  const rails = layer('rails');
  for (const r of RAILS) {
    const rail = el(
      `ambient__rail ambient__rail--${vertical(r.dir) ? 'v' : 'h'}${solo(r.solo)}`,
      `--pos: ${r.pos}%; --w: ${r.rail}px; --tint: ${r.tint};`
    );
    rail.append(
      el(
        `ambient__mark ambient__mark--${r.dir}`,
        `--len: ${r.len}px; --thick: ${r.thick}px; --pk: ${r.peak}; --d: ${r.duration}; --o: ${r.offset};`
      )
    );
    rails.append(rail);
  }

  const deltas = layer('deltas');
  for (const d of DELTAS) {
    const delta = el(
      `ambient__delta${solo(d.solo)}`,
      `--x: ${d.x}%; --y: ${d.y}%; --s: ${d.size}px; --d: ${d.duration}; --o: ${d.offset};`
    );
    delta.append(deltaSvg(d.size));
    deltas.append(delta);
  }

  const arrows = layer('arrows');
  for (const v of ARROW_VOLLEYS) {
    const volley = el(
      `ambient__volley${solo(v.solo)}`,
      `--lane: ${v.lane}; --pk: ${v.peak}; --d: ${v.duration}; --o: ${v.offset};`
    );
    const aim = el('ambient__volley-aim');
    v.arrows.forEach((a, i) => {
      const arrow = el(
        'ambient__arrow',
        `--ax: ${a.ax}px; --ay: ${a.ay}px; --s: ${a.size}px; --ao: ${a.alpha};`
      );
      if (i === 0) arrow.setAttribute('data-lead', '');
      arrow.append(deltaSvg(a.size));
      aim.append(arrow);
    });
    volley.append(aim);
    arrows.append(volley);
  }

  return [grid, glow, scan, rails, deltas, arrows];
}

/**
 * A page-background tile (AmbientPage.astro's spacers): a whole `.ambient`
 * in tile mode — always the thinned set, glows kept inside the tile. Built
 * already marked ready, so a tile cloned in later appears at once rather than
 * waiting on the first mount's fade.
 */
export function buildTile(): HTMLDivElement {
  const tile = document.createElement('div');
  tile.className = 'ambient ambient--tile';
  tile.setAttribute('aria-hidden', 'true');
  tile.setAttribute('data-ambient-ready', '');
  tile.append(...buildLayers());
  return tile;
}
