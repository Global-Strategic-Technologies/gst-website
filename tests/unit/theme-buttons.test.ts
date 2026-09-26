// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThemeState } from '../../src/scripts/theme-state';

vi.mock('@sentry/browser', () => ({ addBreadcrumb: vi.fn() }));

/**
 * The footer toggle and the palette panel's theme button share one turn
 * counter and one rotation on <html> (theme-buttons.ts, ADR-0038). The module
 * observes <html> and syncs on import, so each test builds the DOM first and
 * then imports a fresh copy.
 */

const html = document.documentElement;
const FOOTER_LABELS = ['L0', 'L1', 'L2', 'L3'];
const CLASSES: Record<ThemeState, string[]> = {
  0: [],
  1: ['theme-dim'],
  2: ['dark-theme', 'theme-dim'],
  3: ['dark-theme'],
};

function setState(state: ThemeState): void {
  html.classList.remove('dark-theme', 'theme-dim');
  html.classList.add(...CLASSES[state]);
}

const footer = () => document.getElementById('themeToggle')!;
const panel = () => document.querySelector<HTMLElement>('.palette-panel__theme-toggle')!;
const rotation = () => html.style.getPropertyValue('--theme-rotation');
/** Each fresh import installs an observer; the previous test's must not keep
 *  writing its own counter into the shared DOM. */
const observers: MutationObserver[] = [];
const RealObserver = globalThis.MutationObserver;
class TrackedObserver extends RealObserver {
  constructor(cb: MutationCallback) {
    super(cb);
    observers.push(this);
  }
}
/** MutationObserver callbacks run as microtasks. */
const flush = () => new Promise((r) => setTimeout(r, 0));

async function load(initial: ThemeState = 0) {
  setState(initial);
  vi.stubGlobal('MutationObserver', TrackedObserver);
  vi.resetModules();
  return import('../../src/scripts/theme-buttons');
}

beforeEach(() => {
  document.body.innerHTML = `
    <button id="themeToggle" data-theme-labels='${JSON.stringify(FOOTER_LABELS)}'></button>
    <button class="palette-panel__theme-toggle"></button>`;
  html.className = '';
  html.removeAttribute('style');
  localStorage.clear();
});

afterEach(() => {
  observers.splice(0).forEach((o) => o.disconnect());
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  html.className = '';
  html.removeAttribute('style');
});

describe('theme-buttons (ADR-0038)', () => {
  it('syncs both buttons for the restored state on import', async () => {
    await load(2);
    for (const btn of [footer(), panel()]) {
      expect(btn.dataset.themeState).toBe('2');
      expect(btn.dataset.themeTurns).toBe('2');
    }
    // Matches the head script's pre-paint value (state × 90), so no load spin.
    expect(rotation()).toBe('180deg');
  });

  it('both buttons agree after every step of the cycle, and the turns only grow', async () => {
    const { cycleTheme } = await load(0);
    const seen: Array<[string, string, string]> = [];
    for (let i = 1; i <= 8; i++) {
      // Alternate which button acts — the counter is shared, not per button.
      cycleTheme(i % 2 ? 'theme-toggle' : 'palette-manager');
      await flush();
      const state = String(i % 4);
      expect(footer().dataset.themeState).toBe(state);
      expect(panel().dataset.themeState).toBe(state);
      expect(footer().dataset.themeTurns).toBe(String(i));
      expect(panel().dataset.themeTurns).toBe(String(i));
      expect(rotation()).toBe(`${i * 90}deg`);
      seen.push([footer().dataset.themeTurns!, panel().dataset.themeTurns!, rotation()]);
    }
    // 3 → 0 kept turning clockwise instead of spinning back.
    expect(seen[3]).toEqual(['4', '4', '360deg']);
  });

  it('an outside class change advances by the quarter turns between the states', async () => {
    await load(0);
    setState(2);
    await flush();
    expect(panel().dataset.themeTurns).toBe('2');
    setState(1); // backwards jump: 1 → still clockwise, 3 quarter turns
    await flush();
    expect(panel().dataset.themeTurns).toBe('5');
    expect(rotation()).toBe('450deg');
  });

  it('the footer uses its translated labels; the panel keeps the English one', async () => {
    const { cycleTheme } = await load(0);
    expect(footer().getAttribute('aria-label')).toBe('L0');
    expect(panel().getAttribute('aria-label')).toBe('Theme: Light. Switch to dim light');
    cycleTheme('theme-toggle');
    await flush();
    expect(footer().getAttribute('aria-label')).toBe('L1');
    expect(footer().title).toBe('L1');
    expect(panel().getAttribute('aria-label')).toBe('Theme: Dim light. Switch to dim dark');
  });

  it("cycleTheme stores today's pick", async () => {
    const { cycleTheme } = await load(3);
    expect(cycleTheme('theme-toggle')).toBe(0);
    expect(localStorage.getItem('theme')).toBe('light');
    expect(localStorage.getItem('theme-date')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('cycleTheme still switches when storage throws, and leaves a breadcrumb', async () => {
    const { cycleTheme } = await load(0);
    const Sentry = await import('@sentry/browser');
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('denied');
    };
    try {
      expect(cycleTheme('theme-toggle')).toBe(1);
    } finally {
      Storage.prototype.setItem = original;
    }
    expect(html.classList.contains('theme-dim')).toBe(true);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'theme-toggle' })
    );
  });
});
