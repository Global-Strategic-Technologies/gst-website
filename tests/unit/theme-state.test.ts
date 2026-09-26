// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  applyState,
  nextState,
  quarterTurns,
  readState,
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

  it('storage values are the four states, lightest first', () => {
    expect(STATES.map(storageValue)).toEqual(['light', 'dim-light', 'dim-dark', 'dark']);
    expect([...STORAGE_VALUES]).toEqual(STATES.map(storageValue));
  });

  it('quarter turns are always counter-clockwise, 0–3', () => {
    expect(quarterTurns(0, 1)).toBe(1);
    expect(quarterTurns(3, 0)).toBe(1);
    expect(quarterTurns(0, 3)).toBe(3);
    expect(quarterTurns(2, 2)).toBe(0);
  });
});
