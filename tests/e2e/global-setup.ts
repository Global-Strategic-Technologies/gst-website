/**
 * Playwright global setup.
 *
 * Seeds the Inoreader dev cache with mock data so the Radar page
 * renders deterministic content during E2E tests — no live API calls.
 */

import { seedRadarCache } from './fixtures/seed-radar-cache';

export default function globalSetup() {
  seedRadarCache();
}
