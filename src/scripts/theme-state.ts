/**
 * Four-state theme model (ADR-0038).
 *
 * Two orthogonal classes on <html> encode four states, so every light-dark()
 * pair keeps working: `dark-theme` picks the color-scheme, `theme-dim` swaps
 * the surfaces for the dim variant of that scheme.
 *
 *   0 light     —
 *   1 dim light theme-dim
 *   2 dim dark  dark-theme theme-dim
 *   3 dark      dark-theme
 *
 * localStorage.theme stores the name below. 'light' and 'dark' keep their
 * pre-ADR meaning, so no migration exists. The inline init script in
 * BaseLayout.astro cannot import this module and duplicates STORAGE_VALUES —
 * tests/unit/theme-state.test.ts pins the two together.
 */

export type ThemeState = 0 | 1 | 2 | 3;

export const DARK_CLASS = 'dark-theme';
export const DIM_CLASS = 'theme-dim';

export const STORAGE_VALUES = ['light', 'dim-light', 'dim-dark', 'dark'] as const;
export type ThemeStorageValue = (typeof STORAGE_VALUES)[number];

export const STATE_LABELS: Record<ThemeState, string> = {
  0: 'Light',
  1: 'Dim light',
  2: 'Dim dark',
  3: 'Dark',
};

export function readState(el: Element): ThemeState {
  const dark = el.classList.contains(DARK_CLASS);
  const dim = el.classList.contains(DIM_CLASS);
  if (dark) return dim ? 2 : 3;
  return dim ? 1 : 0;
}

export function applyState(el: Element, state: ThemeState): void {
  el.classList.toggle(DARK_CLASS, state >= 2);
  el.classList.toggle(DIM_CLASS, state === 1 || state === 2);
}

/** The panel's cycle: light → dim light → dim dark → dark → light. */
export function nextState(state: ThemeState): ThemeState {
  return ((state + 1) % 4) as ThemeState;
}

/** The footer's binary flip, which ignores the dim states: the light side
 *  (0, 1) goes to dark, the dark side (2, 3) goes to light. */
export function toggleBinary(state: ThemeState): ThemeState {
  return state <= 1 ? 3 : 0;
}

export function storageValue(state: ThemeState): ThemeStorageValue {
  return STORAGE_VALUES[state];
}

/** Unknown or missing values read as light — the pre-ADR default. */
export function stateFromStorage(value: string | null): ThemeState {
  const i = STORAGE_VALUES.indexOf(value as ThemeStorageValue);
  return (i < 0 ? 0 : i) as ThemeState;
}

/** Quarter turns between two states, always counter-clockwise (0–3). */
export function quarterTurns(from: ThemeState, to: ThemeState): number {
  return (to - from + 4) % 4;
}
