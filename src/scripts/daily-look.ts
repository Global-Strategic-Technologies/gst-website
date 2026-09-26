/**
 * Daily look rotation (ADR-0040).
 *
 * The site's default look follows the visitor's local date:
 *   - the palette follows the weekday, Monday = palette 0 … Sunday = palette 6;
 *   - the theme follows the week of the month, days 1–7 light, 8–14 dim light,
 *     15–21 dim dark, 22 to the end dark (ADR-0038's four states, in order).
 *
 * A visitor's own pick (a palette tab, the panel's theme button, the footer
 * toggle) holds until local midnight. Each pick is stored as before
 * (`localStorage.palette` / `localStorage.theme`) plus a date stamp
 * (`palette-date` / `theme-date`), and counts only on the day it is stamped
 * with. The two dimensions are independent: picking a theme leaves the palette
 * on the rotation. Values stored before the rotation shipped carry no stamp,
 * so they read as expired.
 *
 * The inline init script in BaseLayout.astro cannot import this module and
 * duplicates it; tests/unit/daily-look.test.ts runs that script against this
 * module over a date matrix.
 */

import { STORAGE_VALUES, type ThemeState, type ThemeStorageValue } from './theme-state';

/**
 * Weekday (Monday first) → palette id. Pinned rather than derived from the
 * palette list: adding an 8th palette must be a decision about its weekday,
 * and tests/unit/daily-look.test.ts fails until that decision is made. The
 * values are also the set of valid stored palette ids — this module is bundled
 * into the footer toggle, so it doesn't import the palette metadata.
 */
export const DAY_TO_PALETTE = [0, 1, 2, 3, 4, 5, 6] as const;

export const DATE_KEYS = { palette: 'palette-date', theme: 'theme-date' } as const;
export type LookDimension = keyof typeof DATE_KEYS;

export interface Look {
  palette: number;
  theme: ThemeState;
}

export interface StoredLook {
  palette: string | null;
  paletteDate: string | null;
  theme: string | null;
  themeDate: string | null;
}

/** 0 = Monday … 6 = Sunday, on the local clock. */
export function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** Days 1–7 → 0 (light) … days 22 onward → 3 (dark). */
export function themeForDate(date: Date): ThemeState {
  return Math.min(3, Math.floor((date.getDate() - 1) / 7)) as ThemeState;
}

/** Local YYYY-MM-DD — the stamp a pick is stored with. */
export function localDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The rotation's look for a date, ignoring any pick. */
export function lookForDate(date: Date): Look {
  return { palette: DAY_TO_PALETTE[weekdayIndex(date)], theme: themeForDate(date) };
}

/** Today's look: a pick stamped today wins, per dimension; else the rotation. */
export function resolveLook(stored: StoredLook, date: Date): Look {
  const look = lookForDate(date);
  const today = localDateKey(date);

  if (stored.themeDate === today && stored.theme !== null) {
    const i = STORAGE_VALUES.indexOf(stored.theme as ThemeStorageValue);
    if (i >= 0) look.theme = i as ThemeState;
  }
  if (stored.paletteDate === today && stored.palette !== null) {
    const id = Number(stored.palette);
    if ((DAY_TO_PALETTE as readonly number[]).includes(id) && String(id) === stored.palette) {
      look.palette = id;
    }
  }
  return look;
}

/** Reads the stored picks; storage that throws reads as nothing stored. */
export function readStoredLook(storage: Storage = localStorage): StoredLook {
  try {
    return {
      palette: storage.getItem('palette'),
      paletteDate: storage.getItem(DATE_KEYS.palette),
      theme: storage.getItem('theme'),
      themeDate: storage.getItem(DATE_KEYS.theme),
    };
  } catch {
    return { palette: null, paletteDate: null, theme: null, themeDate: null };
  }
}

/**
 * Stores an explicit pick with today's stamp, so it holds until local
 * midnight. Throws when storage does; callers keep their own handling.
 */
export function rememberChoice(
  dimension: LookDimension,
  value: string,
  now: Date = new Date(),
  storage: Storage = localStorage
): void {
  storage.setItem(dimension, value);
  storage.setItem(DATE_KEYS[dimension], localDateKey(now));
}
