/**
 * Playwright global teardown.
 *
 * Cleans up the mock Inoreader cache seeded during global setup.
 */

import { clearRadarCache } from './fixtures/seed-radar-cache';

export default function globalTeardown() {
  clearRadarCache();
}
