// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DAY_TO_PALETTE,
  DATE_KEYS,
  localDateKey,
  lookForDate,
  readStoredLook,
  rememberChoice,
  resolveLook,
  themeForDate,
  weekdayIndex,
  type StoredLook,
} from '../../src/scripts/daily-look';
import { applyState, readState, STORAGE_VALUES } from '../../src/scripts/theme-state';
import { palettes } from '../../src/data/palettes';

/** Local-time constructor, so every case means the same day in any time zone. */
const day = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
const NOTHING: StoredLook = { palette: null, paletteDate: null, theme: null, themeDate: null };

describe('daily look rotation (ADR-0040)', () => {
  it('maps Monday → palette 0 … Sunday → palette 6', () => {
    // 2026-06-01 is a Monday.
    const week = [1, 2, 3, 4, 5, 6, 7].map((d) => lookForDate(day(2026, 6, d)).palette);
    expect(week).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(weekdayIndex(day(2026, 6, 7))).toBe(6);
  });

  it('maps the week of the month to the four themes, lightest first', () => {
    const at = (d: number) => themeForDate(day(2026, 8, d));
    expect([1, 7].map(at)).toEqual([0, 0]);
    expect([8, 14].map(at)).toEqual([1, 1]);
    expect([15, 21].map(at)).toEqual([2, 2]);
    // The fourth bucket runs to the month's end, so there is no fifth.
    expect([22, 28, 29, 30, 31].map(at)).toEqual([3, 3, 3, 3, 3]);
    expect(themeForDate(day(2026, 2, 28))).toBe(3);
  });

  it('stamps with the local date, midnight to midnight', () => {
    expect(localDateKey(day(2026, 9, 25, 23, 59))).toBe('2026-09-25');
    expect(localDateKey(day(2026, 9, 26, 0, 0))).toBe('2026-09-26');
    expect(localDateKey(day(2026, 1, 5))).toBe('2026-01-05');
  });

  it('covers exactly the palettes, one per weekday', () => {
    expect(DAY_TO_PALETTE, 'one palette per weekday').toHaveLength(7);
    expect(
      [...DAY_TO_PALETTE].sort((a, b) => a - b),
      'the palette list changed: decide the new palette’s weekday (ADR-0040 § Revisit)'
    ).toEqual(palettes.map((p) => p.id).sort((a, b) => a - b));
  });

  describe('resolveLook', () => {
    const wed = day(2026, 6, 10); // palette 2, dim light
    const today = localDateKey(wed);

    it('with nothing stored, follows the rotation', () => {
      expect(resolveLook(NOTHING, wed)).toEqual({ palette: 2, theme: 1 });
    });

    it('a pick stamped today holds', () => {
      const stored = { palette: '5', paletteDate: today, theme: 'dark', themeDate: today };
      expect(resolveLook(stored, wed)).toEqual({ palette: 5, theme: 3 });
    });

    it('palette 0 picked today holds on a day that rotates elsewhere', () => {
      expect(resolveLook({ ...NOTHING, palette: '0', paletteDate: today }, wed).palette).toBe(0);
    });

    it('yesterday’s pick, an unstamped pick and a junk value all fall back', () => {
      const yesterday = localDateKey(day(2026, 6, 9));
      for (const stored of [
        { palette: '5', paletteDate: yesterday, theme: 'dark', themeDate: yesterday },
        { palette: '5', paletteDate: null, theme: 'dark', themeDate: null },
        { palette: '9', paletteDate: today, theme: 'sepia', themeDate: today },
        { palette: '05', paletteDate: today, theme: '', themeDate: today },
      ]) {
        expect(resolveLook(stored, wed), JSON.stringify(stored)).toEqual({ palette: 2, theme: 1 });
      }
    });

    it('resolves each dimension on its own', () => {
      expect(resolveLook({ ...NOTHING, theme: 'dark', themeDate: today }, wed)).toEqual({
        palette: 2,
        theme: 3,
      });
      expect(resolveLook({ ...NOTHING, palette: '4', paletteDate: today }, wed)).toEqual({
        palette: 4,
        theme: 1,
      });
    });
  });

  describe('storage', () => {
    beforeEach(() => localStorage.clear());

    it('rememberChoice writes the value and today’s stamp, and readStoredLook reads both', () => {
      const now = day(2026, 6, 10);
      rememberChoice('palette', '4', now);
      rememberChoice('theme', 'dim-dark', now);
      expect(localStorage.getItem(DATE_KEYS.palette)).toBe('2026-06-10');
      expect(readStoredLook()).toEqual({
        palette: '4',
        paletteDate: '2026-06-10',
        theme: 'dim-dark',
        themeDate: '2026-06-10',
      });
      expect(resolveLook(readStoredLook(), now)).toEqual({ palette: 4, theme: 2 });
      expect(resolveLook(readStoredLook(), day(2026, 6, 11))).toEqual(
        lookForDate(day(2026, 6, 11))
      );
    });

    it('readStoredLook reads nothing when storage throws', () => {
      const throwing = {
        getItem: () => {
          throw new Error('denied');
        },
      } as unknown as Storage;
      expect(readStoredLook(throwing)).toEqual(NOTHING);
    });
  });
});

/**
 * BaseLayout's inline init script cannot import the module, so it repeats the
 * rotation. Rather than match its text, run it: fake the clock, seed storage,
 * execute the real block against the real <html>, and require the classes the
 * module's resolveLook() + applyState() produce.
 */
describe("BaseLayout's inline look block matches the module", () => {
  const src = readFileSync(resolve(__dirname, '../../src/layouts/BaseLayout.astro'), 'utf8');
  const start = src.indexOf('const dayToPalette = [');
  const tryStart = src.lastIndexOf('try {', src.lastIndexOf('const now = new Date()', start));
  const endMarker = '// Never block the page';
  const block = src.slice(tryStart, src.indexOf('}', src.indexOf(endMarker)) + 1);

  const html = document.documentElement;
  const reset = () => {
    localStorage.clear();
    html.className = '';
  };
  beforeEach(() => {
    reset();
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    reset();
  });

  it('the block is located', () => {
    expect(start, 'inline block located').toBeGreaterThan(-1);
    expect(block.startsWith('try {')).toBe(true);
    expect(block).toContain("localStorage.getItem('theme-date')");
    expect(block.trim().endsWith('}')).toBe(true);
  });

  it('its theme list is STORAGE_VALUES, and its weekday map is DAY_TO_PALETTE', () => {
    const list = (name: string) => {
      const m = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(block);
      expect(m, `${name} located`).not.toBeNull();
      return [...m![1].matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1]);
    };
    expect(list('themes')).toEqual([...STORAGE_VALUES]);
    expect(list('dayToPalette')).toEqual(DAY_TO_PALETTE.map(String));
  });

  const run = () => new Function(block)();

  /** What the module says <html> should carry. */
  const expected = (stored: StoredLook, now: Date) => {
    const look = resolveLook(stored, now);
    const ref = document.createElement('div');
    applyState(ref, look.theme);
    if (look.palette !== 0) ref.classList.add(`palette-${look.palette}`);
    return [...ref.classList].sort();
  };

  // Every weekday, every theme bucket and both ends of the month.
  const dates = [1, 2, 3, 4, 5, 6, 7, 8, 14, 15, 21, 22, 28, 29, 30, 31].map((d) =>
    day(2026, 8, d, 12)
  );
  dates.push(day(2026, 9, 25, 23, 59), day(2026, 9, 26, 0, 0), day(2027, 2, 28, 12));

  const storageCases = (now: Date): Array<[string, Partial<Record<string, string>>]> => {
    const today = localDateKey(now);
    const yesterday = localDateKey(new Date(now.getTime() - 86_400_000));
    return [
      ['nothing stored', {}],
      [
        'both picked today',
        { palette: '5', 'palette-date': today, theme: 'dark', 'theme-date': today },
      ],
      ['palette 0 picked today', { palette: '0', 'palette-date': today }],
      ['theme only, today', { theme: 'dim-dark', 'theme-date': today }],
      [
        'picked yesterday',
        { palette: '3', 'palette-date': yesterday, theme: 'dark', 'theme-date': yesterday },
      ],
      ['unstamped (pre-rotation)', { palette: '6', theme: 'dark' }],
      [
        'junk values today',
        { palette: '9', 'palette-date': today, theme: 'sepia', 'theme-date': today },
      ],
    ];
  };

  for (const now of dates) {
    for (const [name, entries] of storageCases(now)) {
      it(`agrees with resolveLook on ${localDateKey(now)} ${now.getHours()}h: ${name}`, () => {
        vi.setSystemTime(now);
        for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v!);
        run();
        const stored = readStoredLook();
        expect([...html.classList].sort()).toEqual(expected(stored, now));
        // And readState agrees with the module's theme.
        expect(readState(html)).toBe(resolveLook(stored, now).theme);
      });
    }
  }

  it('still applies the rotation when storage throws', () => {
    const now = day(2026, 6, 18); // Thursday, dim dark → palette 3
    vi.setSystemTime(now);
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('denied');
    };
    try {
      expect(run).not.toThrow();
    } finally {
      Storage.prototype.getItem = original;
    }
    expect([...html.classList].sort()).toEqual(expected(NOTHING, now));
    expect(html.classList.contains('palette-3')).toBe(true);
  });
});
