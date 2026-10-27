// @vitest-environment jsdom
/**
 * Printing leaves a dark theme for the length of the print and restores it
 * after (src/scripts/print-theme.ts): the browser's print events drive it.
 */
import { DARK_CLASS, DIM_CLASS } from '../../src/scripts/theme-state';
import '../../src/scripts/print-theme';

const html = document.documentElement;

afterEach(() => {
  html.className = '';
});

describe('print theme', () => {
  it.each([
    ['dark', [DARK_CLASS]],
    ['dim dark', [DARK_CLASS, DIM_CLASS]],
    ['dim light', [DIM_CLASS]],
  ])('prints %s in the light theme, then restores it', (_name, classes) => {
    html.className = `${classes.join(' ')} palette-3`;
    window.dispatchEvent(new Event('beforeprint'));
    expect(html.classList.contains(DARK_CLASS)).toBe(false);
    expect(html.classList.contains(DIM_CLASS)).toBe(false);
    expect(html.classList.contains('palette-3')).toBe(true);
    window.dispatchEvent(new Event('afterprint'));
    for (const c of classes) expect(html.classList.contains(c)).toBe(true);
  });

  it('leaves the light theme alone', () => {
    html.className = 'palette-2';
    window.dispatchEvent(new Event('beforeprint'));
    window.dispatchEvent(new Event('afterprint'));
    expect(html.className).toBe('palette-2');
  });
});
