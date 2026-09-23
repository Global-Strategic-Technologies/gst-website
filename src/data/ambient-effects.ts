/**
 * Element tables for the hero ambient-motion layer (BL-035, ADR-0039).
 *
 * Ported from prototypes/bl-035-hero-ambient-motion/generate.cjs, which drew
 * on a fixed 1280×720 stage. Positions here are percentages of the layer
 * (x of its width, y of its height) so one component serves the fluid
 * homepage hero and the /brand preview alike. Sizes that read as texture —
 * grid cells, rail and mark thickness, deltas — stay in px.
 *
 * `solo: true` marks elements shown only when their effect runs alone on a
 * wide screen. With two or more effects on, at ≤768px, or in a page-wide tile
 * (AmbientPage.astro), they hide, and what remains is the prototype's
 * Combined subset. AmbientEffect.astro renders
 * these tables and tests/unit/ambient-effect-budget.test.ts counts them
 * against BL-035's 15-animated-element ceiling.
 *
 * Intensities are drawn at twice the prototype's, so a strength of 50 in the
 * panel reproduces the prototype at 100 and the slider has headroom above it.
 */

/** A 50px accent cell that pulses on the grid. */
export interface GridCell {
  x: number;
  y: number;
  /** Delay, seconds. */
  delay: number;
  solo: boolean;
}

export const GRID_CELLS: readonly GridCell[] = [
  { x: 5.86, y: 17.36, delay: 0, solo: true },
  { x: 13.67, y: 10.42, delay: 1.2, solo: false },
  { x: 21.48, y: 31.25, delay: 2.4, solo: true },
  { x: 33.2, y: 17.36, delay: 3.1, solo: true },
  { x: 41.02, y: 45.14, delay: 0.6, solo: false },
  { x: 48.83, y: 24.31, delay: 4.2, solo: true },
  { x: 56.64, y: 59.03, delay: 1.8, solo: true },
  { x: 68.36, y: 10.42, delay: 5.1, solo: true },
  { x: 76.17, y: 38.19, delay: 2.9, solo: false },
  { x: 83.98, y: 72.92, delay: 6.3, solo: true },
  { x: 91.8, y: 24.31, delay: 3.7, solo: true },
  { x: 25.39, y: 79.86, delay: 7.2, solo: false },
  { x: 60.55, y: 86.81, delay: 4.8, solo: true },
  { x: 9.77, y: 65.97, delay: 5.8, solo: true },
];
export const GRID_DURATION = 9;

/** Glow Shift and Scan Sweep are fixed shapes; they never thin. */
export const GLOW_COUNT = 2;
export const SCAN_COUNT = 1;

export type RailDir = 'up' | 'down' | 'right' | 'left';

/** A rail line with one mark that fires along it, then goes dark for the rest of its cycle. */
export interface Rail {
  dir: RailDir;
  /** Across the layer: x% for vertical rails, y% for horizontal ones. */
  pos: number;
  /** Rail line thickness, px. */
  rail: number;
  /** Rail line tint, % of the accent. */
  tint: number;
  /** Mark length along the rail, px. */
  len: number;
  /** Mark thickness, px. */
  thick: number;
  /** Mark peak opacity, 0–1. */
  peak: number;
  /** Cycle length, seconds. */
  duration: number;
  /** How far into its cycle the mark starts, seconds. */
  offset: number;
  solo: boolean;
}

export const RAILS: readonly Rail[] = [
  {
    dir: 'up',
    pos: 5.86,
    rail: 1,
    tint: 10,
    len: 48,
    thick: 3,
    peak: 1,
    duration: 11,
    offset: 0,
    solo: true,
  },
  {
    dir: 'down',
    pos: 17.58,
    rail: 2,
    tint: 6,
    len: 96,
    thick: 2,
    peak: 0.56,
    duration: 19,
    offset: 7,
    solo: true,
  },
  {
    dir: 'up',
    pos: 29.3,
    rail: 1,
    tint: 14,
    len: 34,
    thick: 5,
    peak: 1,
    duration: 8.5,
    offset: 3,
    solo: false,
  },
  {
    dir: 'down',
    pos: 41.02,
    rail: 1,
    tint: 4,
    len: 140,
    thick: 1,
    peak: 0.4,
    duration: 26,
    offset: 12,
    solo: true,
  },
  {
    dir: 'up',
    pos: 52.73,
    rail: 3,
    tint: 9,
    len: 62,
    thick: 4,
    peak: 0.88,
    duration: 13.5,
    offset: 5.5,
    solo: true,
  },
  {
    dir: 'down',
    pos: 72.27,
    rail: 2,
    tint: 12,
    len: 110,
    thick: 6,
    peak: 0.48,
    duration: 22,
    offset: 2,
    solo: false,
  },
  {
    dir: 'up',
    pos: 83.98,
    rail: 1,
    tint: 5,
    len: 44,
    thick: 3,
    peak: 0.76,
    duration: 15.5,
    offset: 9,
    solo: true,
  },
  {
    dir: 'down',
    pos: 95.7,
    rail: 2,
    tint: 16,
    len: 72,
    thick: 2,
    peak: 1,
    duration: 7.5,
    offset: 13,
    solo: true,
  },
  {
    dir: 'right',
    pos: 17.36,
    rail: 1,
    tint: 8,
    len: 120,
    thick: 3,
    peak: 0.84,
    duration: 14,
    offset: 4,
    solo: false,
  },
  {
    dir: 'left',
    pos: 38.19,
    rail: 2,
    tint: 5,
    len: 220,
    thick: 2,
    peak: 0.44,
    duration: 24,
    offset: 11,
    solo: true,
  },
  {
    dir: 'right',
    pos: 59.03,
    rail: 1,
    tint: 12,
    len: 70,
    thick: 4,
    peak: 1,
    duration: 9,
    offset: 17,
    solo: true,
  },
  {
    dir: 'left',
    pos: 79.86,
    rail: 1,
    tint: 6,
    len: 160,
    thick: 1,
    peak: 0.6,
    duration: 20,
    offset: 6,
    solo: false,
  },
  {
    dir: 'right',
    pos: 86.81,
    rail: 2,
    tint: 9,
    len: 95,
    thick: 5,
    peak: 0.7,
    duration: 12,
    offset: 21,
    solo: true,
  },
  {
    dir: 'left',
    pos: 93.75,
    rail: 1,
    tint: 14,
    len: 55,
    thick: 2,
    peak: 1,
    duration: 8,
    offset: 2,
    solo: true,
  },
];

/** A brand delta drifting slowly (DeltaIcon geometry). */
export interface Delta {
  x: number;
  y: number;
  /** Edge length, px. */
  size: number;
  duration: number;
  offset: number;
  solo: boolean;
}

export const DELTAS: readonly Delta[] = [
  { x: 67.19, y: 9.72, size: 120, duration: 19, offset: 0, solo: false },
  { x: 84.38, y: 41.67, size: 64, duration: 23, offset: 3, solo: false },
  { x: 76.56, y: 72.22, size: 90, duration: 27, offset: 6, solo: true },
  { x: 50, y: 5.56, size: 40, duration: 17, offset: 2, solo: true },
  { x: 92.19, y: 12.5, size: 48, duration: 21, offset: 8, solo: true },
  { x: 59.38, y: 77.78, size: 56, duration: 25, offset: 4, solo: false },
];

/** Animated elements per effect: [all, thinned]. */
export function animatedCounts(): Record<
  'grid' | 'glow' | 'scan' | 'rails' | 'deltas',
  { all: number; thinned: number }
> {
  const thin = <T extends { solo: boolean }>(xs: readonly T[]) => xs.filter((x) => !x.solo).length;
  return {
    grid: { all: GRID_CELLS.length, thinned: thin(GRID_CELLS) },
    glow: { all: GLOW_COUNT, thinned: GLOW_COUNT },
    scan: { all: SCAN_COUNT, thinned: SCAN_COUNT },
    rails: { all: RAILS.length, thinned: thin(RAILS) },
    deltas: { all: DELTAS.length, thinned: thin(DELTAS) },
  };
}
