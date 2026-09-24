// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The ambient loader decides whether a browser loads ambient motion at all
 * (BL-035, ADR-0039). Its `off` and `skipped` states are final until <html>'s
 * settings change: the E2E suite's absence checks are gated on them.
 */
const start = vi.fn();
const captureException = vi.fn();
vi.mock('@sentry/browser', () => ({ captureException }));

let reduced = false;
let stop: (() => void) | undefined;
const root = document.documentElement;
const state = () => root.getAttribute('data-ambient-loader');

async function init(runtime: () => object = () => ({ start })): Promise<void> {
  vi.resetModules();
  vi.doMock('../../src/scripts/ambient/runtime', runtime);
  const { initAmbientLoader } = await import('../../src/scripts/ambient/loader');
  stop = initAmbientLoader();
}

describe('ambient loader (BL-035)', () => {
  beforeEach(() => {
    reduced = false;
    start.mockReset();
    captureException.mockReset();
    for (const a of ['data-ambient', 'data-ambient-scope', 'data-ambient-loader'])
      root.removeAttribute(a);
    document.body.innerHTML = '<div class="ambient" data-ambient-mount></div>';
    window.matchMedia = ((query: string) => ({
      matches: reduced && query.includes('reduce'),
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    stop?.(); // each test's loader stops watching <html> before the next one
    vi.doUnmock('../../src/scripts/ambient/runtime');
  });

  it('stays off, and fetches nothing, when nothing is on', async () => {
    await init();
    expect(state()).toBe('off');
    await new Promise((r) => setTimeout(r, 20));
    expect(start).not.toHaveBeenCalled();
  });

  it('defers a stored choice, then loads and starts the runtime', async () => {
    root.setAttribute('data-ambient', 'glow');
    root.setAttribute('data-ambient-scope', 'hero');
    await init();
    expect(state()).toBe('deferred');
    await vi.waitFor(() => expect(state()).toBe('loaded'));
    expect(start).toHaveBeenCalledOnce();
  });

  it('skips a page the chosen scope does not draw on', async () => {
    document.body.innerHTML = '<div id="ambient-page"></div>'; // no hero, not the homepage
    root.setAttribute('data-ambient', 'glow');
    root.setAttribute('data-ambient-scope', 'page');
    await init();
    expect(state()).toBe('skipped');
  });

  it('skips under reduced motion', async () => {
    reduced = true;
    root.setAttribute('data-ambient', 'glow');
    await init();
    expect(state()).toBe('skipped');
  });

  it('does not load when motion is switched off during the deferral', async () => {
    root.setAttribute('data-ambient', 'glow');
    await init();
    expect(state()).toBe('deferred');
    root.removeAttribute('data-ambient');
    await vi.waitFor(() => expect(state()).toBe('off'));
    await new Promise((r) => setTimeout(r, 20));
    expect(state()).toBe('off');
    expect(start).not.toHaveBeenCalled();
  });

  it('loads at once when switched on live', async () => {
    await init();
    expect(state()).toBe('off');
    root.setAttribute('data-ambient', 'rails');
    await vi.waitFor(() => expect(state()).toBe('loaded'));
    expect(start).toHaveBeenCalledOnce();
  });

  it('reports a failed import and builds nothing', async () => {
    root.setAttribute('data-ambient', 'glow');
    await init(() => {
      throw new Error('chunk failed');
    });
    await vi.waitFor(() => expect(state()).toBe('skipped'));
    expect(captureException).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  });
});
