// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { localDateKey } from '../../src/scripts/daily-look';

/**
 * The tab icon follows the day's palette (STYLES_GUIDE § Browser chrome).
 * favicon.ts observes <html> and syncs on import, so each test builds the DOM
 * first and then imports a fresh copy — the theme-buttons.test.ts harness.
 */

const html = document.documentElement;
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
const icon = () => document.querySelector<HTMLLinkElement>('link[rel="icon"]');

async function load() {
  vi.stubGlobal('MutationObserver', TrackedObserver);
  vi.resetModules();
  return import('../../src/scripts/favicon');
}

beforeEach(() => {
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  link.setAttribute('href', '/favicon.svg');
  document.head.appendChild(link);
  html.className = '';
});

afterEach(() => {
  observers.splice(0).forEach((o) => o.disconnect());
  vi.unstubAllGlobals();
  document.head.querySelectorAll('link[rel="icon"]').forEach((l) => l.remove());
  html.className = '';
  localStorage.clear();
});

describe('favicon (STYLES_GUIDE § Browser chrome)', () => {
  it('maps a palette class to its tab icon; palette 0 and no class keep /favicon.svg', async () => {
    const { faviconFor } = await load();
    expect(faviconFor('palette-3')).toBe('/favicons/palette-3.svg');
    expect(faviconFor('dark-theme palette-6 theme-dim')).toBe('/favicons/palette-6.svg');
    expect(faviconFor('palette-0')).toBe('/favicon.svg');
    expect(faviconFor('')).toBe('/favicon.svg');
  });

  it('ignores palette-popped-out, which also starts with palette-', async () => {
    const { faviconFor } = await load();
    expect(faviconFor('palette-popped-out')).toBe('/favicon.svg');
    expect(faviconFor('palette-popped-out palette-2')).toBe('/favicons/palette-2.svg');
  });

  it('syncs on import and follows a palette switch', async () => {
    html.classList.add('palette-4');
    await load();
    expect(icon()!.getAttribute('href')).toBe('/favicons/palette-4.svg');

    html.classList.replace('palette-4', 'palette-1');
    await flush();
    expect(icon()!.getAttribute('href')).toBe('/favicons/palette-1.svg');

    html.classList.remove('palette-1');
    await flush();
    expect(icon()!.getAttribute('href')).toBe('/favicon.svg');
  });

  it('never rewrites an unchanged href', async () => {
    html.classList.add('palette-2');
    await load();
    const spy = vi.spyOn(icon()!, 'setAttribute');
    html.classList.add('dark-theme'); // a theme change, same palette
    await flush();
    expect(spy).not.toHaveBeenCalled();
  });

  it('is a no-op without an icon link', async () => {
    icon()!.remove();
    const { syncFavicon } = await load();
    expect(() => syncFavicon()).not.toThrow();
  });
});

/**
 * BaseLayout's inline look block sets the restored palette's icon before
 * first paint. Sliced as tests/unit/daily-look.test.ts slices it.
 */
describe("the inline look block sets the restored palette's tab icon", () => {
  const layout = readFileSync(resolve(__dirname, '../../src/layouts/BaseLayout.astro'), 'utf8');
  const start = layout.indexOf('const dayToPalette = [');
  const tryStart = layout.lastIndexOf('try {', layout.lastIndexOf('const now = new Date()', start));
  const endMarker = '// Never block the page';
  const block = layout.slice(tryStart, layout.indexOf('}', layout.indexOf(endMarker)) + 1);

  // A fixed clock, so the pick's stamp and the block's "today" always agree.
  const now = new Date(2026, 8, 29, 12);
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());

  it('the block carries the tab-icon seed', () => {
    expect(block).toContain('document.querySelector(\'link[rel="icon"]\')');
  });

  for (const palette of ['1', '2', '3', '4', '5', '6']) {
    it(`palette ${palette} → /favicons/palette-${palette}.svg`, () => {
      localStorage.setItem('palette', palette);
      localStorage.setItem('palette-date', localDateKey(now));
      new Function(block)();
      expect(icon()!.getAttribute('href')).toBe(`/favicons/palette-${palette}.svg`);
    });
  }

  it('palette 0 leaves /favicon.svg alone', () => {
    localStorage.setItem('palette', '0');
    localStorage.setItem('palette-date', localDateKey(now));
    new Function(block)();
    expect(icon()!.getAttribute('href')).toBe('/favicon.svg');
  });
});
