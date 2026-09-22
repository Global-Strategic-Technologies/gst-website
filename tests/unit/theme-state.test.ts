// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyState,
  nextState,
  quarterTurns,
  readState,
  stateFromStorage,
  storageValue,
  STORAGE_VALUES,
  toggleBinary,
  type ThemeState,
} from '../../src/scripts/theme-state';

const STATES: ThemeState[] = [0, 1, 2, 3];

function el(...classes: string[]): Element {
  const div = document.createElement('div');
  div.classList.add(...classes);
  return div;
}

describe('theme-state (ADR-0038)', () => {
  it('reads the four class combinations', () => {
    expect(readState(el())).toBe(0);
    expect(readState(el('theme-dim'))).toBe(1);
    expect(readState(el('dark-theme', 'theme-dim'))).toBe(2);
    expect(readState(el('dark-theme'))).toBe(3);
  });

  it('applyState round-trips through readState and leaves other classes alone', () => {
    for (const s of STATES) {
      const e = el('palette-3', 'dark-theme', 'theme-dim');
      applyState(e, s);
      expect(readState(e)).toBe(s);
      expect(e.classList.contains('palette-3')).toBe(true);
    }
  });

  it('the panel cycles light → dim light → dim dark → dark → light', () => {
    expect(STATES.map(nextState)).toEqual([1, 2, 3, 0]);
  });

  it('the footer flip ignores the dim states', () => {
    expect(STATES.map(toggleBinary)).toEqual([3, 3, 0, 0]);
  });

  it('storage round-trips, and unknown values read as light', () => {
    for (const s of STATES) expect(stateFromStorage(storageValue(s))).toBe(s);
    expect(stateFromStorage(null)).toBe(0);
    expect(stateFromStorage('sepia')).toBe(0);
    // Pre-ADR values keep their meaning — no migration exists.
    expect(stateFromStorage('light')).toBe(0);
    expect(stateFromStorage('dark')).toBe(3);
  });

  it('quarter turns are always counter-clockwise, 0–3', () => {
    expect(quarterTurns(0, 1)).toBe(1);
    expect(quarterTurns(3, 0)).toBe(1);
    expect(quarterTurns(0, 3)).toBe(3);
    expect(quarterTurns(2, 2)).toBe(0);
  });

  it("BaseLayout's inline init script uses exactly the module's storage values", () => {
    const src = readFileSync(resolve(__dirname, '../../src/layouts/BaseLayout.astro'), 'utf8');
    const start = src.indexOf("localStorage.getItem('theme')");
    expect(start, 'init script located').toBeGreaterThan(-1);
    const block = src.slice(start, src.indexOf('} catch', start));
    const literals = new Set([...block.matchAll(/theme === '([a-z-]+)'/g)].map((m) => m[1]));
    // Every non-default value must be checked; 'light' is the fall-through.
    expect([...literals].sort()).toEqual(STORAGE_VALUES.filter((v) => v !== 'light').sort());
    expect(block).toContain("add('dark-theme')");
    expect(block).toContain("add('theme-dim')");
  });
});
