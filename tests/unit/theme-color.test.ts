// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STORAGE_VALUES } from '../../src/scripts/theme-state';
import { localDateKey } from '../../src/scripts/daily-look';

/**
 * The status bar follows the site header's surface (STYLES_GUIDE § Browser
 * chrome). theme-color.ts observes <html> and syncs on import, so each test
 * builds the DOM first and then imports a fresh copy — the same harness as
 * theme-buttons.test.ts.
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

/** jsdom resolves no light-dark(), so the header's colour is stubbed. */
let headerColor = '';
const meta = () => document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

async function load() {
  vi.stubGlobal('MutationObserver', TrackedObserver);
  vi.stubGlobal('getComputedStyle', () => ({ backgroundColor: headerColor }));
  vi.resetModules();
  return import('../../src/scripts/theme-color');
}

function addMeta() {
  const m = document.createElement('meta');
  m.name = 'theme-color';
  m.content = '#05cd99';
  document.head.appendChild(m);
}

beforeEach(() => {
  document.body.innerHTML = '<header class="site-header"></header>';
  addMeta();
  headerColor = 'rgb(245, 245, 245)';
  html.className = '';
  html.removeAttribute('style');
});

afterEach(() => {
  observers.splice(0).forEach((o) => o.disconnect());
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  html.className = '';
  html.removeAttribute('style');
});

describe('theme-color (STYLES_GUIDE § Browser chrome)', () => {
  it("writes the header's computed surface on import", async () => {
    await load();
    expect(meta()!.content).toBe('rgb(245, 245, 245)');
  });

  it('re-syncs on a class change on <html> (theme cycle, palette switch)', async () => {
    await load();
    headerColor = 'rgb(10, 10, 10)';
    html.classList.add('dark-theme');
    await flush();
    expect(meta()!.content).toBe('rgb(10, 10, 10)');
  });

  it('re-syncs on a style change on <html> (swatch-editor token edits)', async () => {
    await load();
    headerColor = 'rgb(1, 2, 3)';
    html.style.setProperty('--bg-light-alt', '#010203');
    await flush();
    expect(meta()!.content).toBe('rgb(1, 2, 3)');
  });

  it('skips an empty or fully transparent value, keeping the last colour', async () => {
    // Computed colours use the comma form, which parseAlpha reads.
    for (const color of ['', 'transparent', 'rgba(0, 0, 0, 0)', 'rgba(20, 20, 20, 0)']) {
      headerColor = color;
      await load();
      expect(meta()!.content, JSON.stringify(color)).toBe('#05cd99');
      observers.splice(0).forEach((o) => o.disconnect());
    }
  });

  it('passes solid colours with a zero channel and partly transparent ones through', async () => {
    // A zero LAST channel is blue, not alpha — black or an olive edit is solid.
    for (const color of ['rgb(0, 0, 0)', 'rgb(20, 20, 0)', 'rgba(245, 245, 245, 0.5)']) {
      headerColor = color;
      await load();
      expect(meta()!.content, color).toBe(color);
      observers.splice(0).forEach((o) => o.disconnect());
    }
  });

  it('is a no-op without the header or the meta tag', async () => {
    document.body.innerHTML = '';
    await load();
    expect(meta()!.content).toBe('#05cd99');

    document.body.innerHTML = '<header class="site-header"></header>';
    meta()!.remove();
    const { syncThemeColor } = await load();
    expect(() => syncThemeColor()).not.toThrow();
  });
});

/**
 * The inline look block seeds the colour before first paint, from a copy of
 * the header's four surfaces. The module corrects any drift once it runs, so a
 * stale copy only flashes — but it must not go stale silently.
 */
const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const layout = read('src/layouts/BaseLayout.astro');

function seedSurfaces(): string[] {
  const m = /const headerSurfaces = \[([^\]]*)\]/.exec(layout);
  expect(m, 'headerSurfaces located in BaseLayout').not.toBeNull();
  return [...m![1].matchAll(/'(#[0-9a-f]{6})'/gi)].map((x) => x[1].toLowerCase());
}

describe("the inline seed mirrors the header's surfaces", () => {
  it('Header.astro still paints light-dark(--bg-light-alt, --bg-dark)', () => {
    // If this changes, the four values below (and headerSurfaces) change too.
    expect(read('src/components/Header.astro')).toContain(
      'background: light-dark(var(--bg-light-alt), var(--bg-dark));'
    );
  });

  it('headerSurfaces equals the four theme states in variables.css, lightest first', () => {
    const css = read('src/styles/variables.css');
    const dimAt = css.indexOf('html.theme-dim {');
    expect(dimAt, 'html.theme-dim block located').toBeGreaterThan(-1);
    const rootCss = css.slice(0, dimAt);
    const dimCss = css.slice(dimAt, css.indexOf('}', dimAt));

    const HEX = '(#[0-9a-fA-F]{6})';
    // `--bg-dark:` with the colon, so -secondary / -tertiary never match.
    const pick = (src: string, re: string, label: string) => {
      const m = new RegExp(re).exec(src);
      expect(m, `${label} located`).not.toBeNull();
      return m![1].toLowerCase();
    };
    const light = pick(rootCss, `--bg-light-alt:\\s*light-dark\\(${HEX},`, 'light');
    const dark = pick(rootCss, `--bg-dark:\\s*${HEX};`, 'dark');
    const dimLight = pick(dimCss, `--bg-light-alt:\\s*light-dark\\(${HEX},`, 'dim light');
    const dimDark = pick(
      dimCss,
      `--bg-dark:\\s*light-dark\\(#[0-9a-fA-F]{6},\\s*${HEX}\\)`,
      'dim dark'
    );

    // Known-present values, so an extractor that drifts cannot pass vacuously.
    expect([light, dark]).toEqual(['#f5f5f5', '#0a0a0a']);
    // Order is STORAGE_VALUES: light, dim light, dim dark, dark.
    expect(seedSurfaces()).toEqual([light, dimLight, dimDark, dark]);
  });

  describe('the inline look block writes the seed for the restored theme', () => {
    // Sliced as tests/unit/daily-look.test.ts slices it.
    const start = layout.indexOf('const dayToPalette = [');
    const tryStart = layout.lastIndexOf(
      'try {',
      layout.lastIndexOf('const now = new Date()', start)
    );
    const endMarker = '// Never block the page';
    const block = layout.slice(tryStart, layout.indexOf('}', layout.indexOf(endMarker)) + 1);

    // A fixed clock, so the pick's stamp and the block's "today" always agree.
    const now = new Date(2026, 8, 29, 12);
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(now);
    });
    afterEach(() => {
      vi.useRealTimers();
      localStorage.clear();
    });

    it('the block carries the seed', () => {
      expect(block).toContain('const headerSurfaces = [');
    });

    STORAGE_VALUES.forEach((theme, i) => {
      it(`${theme} → headerSurfaces[${i}]`, () => {
        localStorage.setItem('theme', theme);
        localStorage.setItem('theme-date', localDateKey(now));
        new Function(block)();
        expect(meta()!.content).toBe(seedSurfaces()[i]);
      });
    });
  });
});
