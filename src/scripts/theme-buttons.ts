/**
 * The two theme buttons — the footer delta (ThemeToggle.astro) and the palette
 * panel's delta (PalettePanel.astro) — cycle the same four states (ADR-0038)
 * and always point the same way.
 *
 * One turn counter lives here, and its rotation is written once, to
 * `--theme-rotation` on <html>; both icons inherit it. The inline head script
 * in BaseLayout.astro sets the same property for the restored state before
 * first paint, so neither delta spins on load.
 *
 * The delta turns 90° counter-clockwise per state. `themeTurns` only ever
 * grows, so 3 → 0 keeps turning the same way instead of spinning back, and an
 * outside jump (e.g. the /brand frames or a test seeding classes) advances by
 * the quarter turns between the two states.
 */

import * as Sentry from '@sentry/browser';
import {
  applyState,
  nextState,
  quarterTurns,
  readState,
  storageValue,
  STATE_LABELS,
  type ThemeState,
} from './theme-state';
import { rememberChoice } from './daily-look';

const BUTTONS = '.palette-panel__theme-toggle, #themeToggle';

let lastThemeState: ThemeState = readState(document.documentElement);
let themeTurns: number = lastThemeState;

/** The panel's label (an English-only dev tool). The footer carries its own
 *  translated sentences in `data-theme-labels`, indexed by state. */
function englishLabel(state: ThemeState): string {
  return `Theme: ${STATE_LABELS[state]}. Switch to ${STATE_LABELS[nextState(state)].toLowerCase()}`;
}

function labelFor(btn: HTMLElement, state: ThemeState): string {
  const raw = btn.dataset.themeLabels;
  if (raw) {
    try {
      const labels: unknown = JSON.parse(raw);
      if (Array.isArray(labels) && typeof labels[state] === 'string') return labels[state];
    } catch {
      // Malformed labels — fall back to English
    }
  }
  return englishLabel(state);
}

/** Refresh every theme button from the <html> classes — the real state, not
 *  any button's click history. */
export function syncThemeButtons(): void {
  const state = readState(document.documentElement);
  themeTurns += quarterTurns(lastThemeState, state);
  lastThemeState = state;
  document.documentElement.style.setProperty('--theme-rotation', `${themeTurns * -90}deg`);
  document.querySelectorAll<HTMLElement>(BUTTONS).forEach((btn) => {
    const label = labelFor(btn, state);
    btn.dataset.themeState = String(state);
    btn.dataset.themeTurns = String(themeTurns);
    btn.setAttribute('aria-label', label);
    btn.title = label;
  });
}

/** Advance to the next state — the one action both buttons perform. Stores it
 *  as today's pick, which holds until local midnight (ADR-0040). */
export function cycleTheme(breadcrumbCategory: string): ThemeState {
  const state = nextState(readState(document.documentElement));
  applyState(document.documentElement, state);
  try {
    rememberChoice('theme', storageValue(state));
  } catch {
    Sentry.addBreadcrumb({
      category: breadcrumbCategory,
      message: 'localStorage write failed',
      level: 'warning',
    });
  }
  return state;
}

// Runs for EVERY class change — either button, the /brand responsive frames and
// the head script's restore alike — so both buttons always agree.
new MutationObserver(syncThemeButtons).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['class'],
});
syncThemeButtons();
