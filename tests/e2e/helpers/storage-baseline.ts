import type { Page } from '@playwright/test';

/**
 * The storage every E2E spec starts from (playwright.config.ts `use.storageState`).
 *
 * The site's default look depends on the visitor's date (ADR-0040: the palette
 * follows the weekday, the theme the week of the month), and ambient motion is
 * on by default (ADR-0039). A spec that asserted on colours, clicks or axe
 * results would otherwise pass on some days and fail on others, under six
 * animating layers. So every context starts as a visitor who picked palette 0
 * in light theme TODAY and switched motion off.
 *
 * The stamps must be today's local date, or the pick counts as expired and the
 * rotation applies. Node and the browsers share the OS time zone, so the date
 * computed here when the config loads matches the page's. A run that crosses
 * local midnight falls back to the rotation (TEST_BEST_PRACTICES #29).
 *
 * Both origins are seeded: 4321 for the main config, 4325 for a scratch config
 * that inherits `use` but points its own dev server elsewhere. storageState is
 * keyed by origin, so a single origin would silently seed nothing there
 * (tests/e2e/storage-baseline.test.ts fails loudly if that ever happens).
 *
 * This file computes the date itself rather than importing
 * src/scripts/daily-look.ts, so the harness never depends on the code it tests.
 */

type StorageState = {
  cookies: [];
  origins: { origin: string; localStorage: { name: string; value: string }[] }[];
};

const ORIGINS = [4321, 4325].map((port) => `http://localhost:${port}`);

/** Local YYYY-MM-DD, the format the site stamps a pick with. */
export function todayKey(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A browser that switched every ambient effect off. */
export const AMBIENT_OFF = '{"on":[]}';

function stateOf(entries: Record<string, string>): StorageState {
  const localStorage = Object.entries(entries).map(([name, value]) => ({ name, value }));
  return { cookies: [], origins: ORIGINS.map((origin) => ({ origin, localStorage })) };
}

/** Palette 0, light theme, both picked today; ambient off unless asked for. */
export function baselineStorageState(
  { ambient }: { ambient: 'off' | 'default' } = { ambient: 'off' }
): StorageState {
  const today = todayKey();
  return stateOf({
    palette: '0',
    'palette-date': today,
    theme: 'light',
    'theme-date': today,
    ...(ambient === 'off' ? { 'ambient-motion': AMBIENT_OFF } : {}),
  });
}

/** The baseline look with nothing stored for ambient: a first visit's motion. */
export const LOOK_ONLY = baselineStorageState({ ambient: 'default' });

/** Nothing stored at all: a first visit's look AND motion. */
export const EMPTY_STATE: StorageState = { cookies: [], origins: [] };

/**
 * Seed storage before the page's own scripts run, on the first load only, so a
 * reload sees what the page itself wrote. Values of `null` remove the key.
 */
export async function seedStorage(
  page: Page,
  entries: Record<string, string | null>
): Promise<void> {
  await page.addInitScript((raw) => {
    if (window.top !== window || sessionStorage.getItem('__storage-seeded')) return;
    for (const [key, value] of Object.entries(raw)) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    sessionStorage.setItem('__storage-seeded', '1');
  }, entries);
}

/**
 * Seed a look picked on `date` (default today), for specs that need a palette
 * or theme other than the baseline's.
 */
export async function seedLook(
  page: Page,
  look: { palette?: number; theme?: 'light' | 'dim-light' | 'dim-dark' | 'dark'; date?: string }
): Promise<void> {
  const date = look.date ?? todayKey();
  const entries: Record<string, string> = {};
  if (look.palette !== undefined) {
    entries.palette = String(look.palette);
    entries['palette-date'] = date;
  }
  if (look.theme !== undefined) {
    entries.theme = look.theme;
    entries['theme-date'] = date;
  }
  await seedStorage(page, entries);
}
