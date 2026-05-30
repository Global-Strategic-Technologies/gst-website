/**
 * BL-047 T1 — alert-rule synthetic unit tests.
 *
 * The dispatcher itself is exercised via the worker-scheduled tests
 * (synthetic-cron branch). This file pins the `isoYearWeek` algorithm
 * against known ISO-8601 calendar dates so a regression in the week
 * calculation surfaces here, decoupled from the worker-scheduled mock
 * machinery.
 *
 * Reference dates verified against the ISO 8601 week-date specification:
 *   - 2026-01-01 (Thursday) → 2026-W01
 *   - 2025-12-29 (Monday)  → 2026-W01  (week starts pre-year-boundary)
 *   - 2025-12-28 (Sunday)  → 2025-W52
 *   - 2026-05-30 (Saturday, BL-047 ship date) → 2026-W22
 *   - 2027-01-04 (Monday) → 2027-W01
 */
import { describe, it, expect } from 'vitest';
import { isoYearWeek } from '../../../src/observability/alert-rule-synthetic';

describe('isoYearWeek — ISO-8601 week-date calendar', () => {
  it.each([
    ['2026-01-01T12:00:00Z', '2026-W01'],
    ['2025-12-29T12:00:00Z', '2026-W01'],
    ['2025-12-28T12:00:00Z', '2025-W52'],
    ['2026-05-30T12:00:00Z', '2026-W22'],
    ['2027-01-04T12:00:00Z', '2027-W01'],
  ])('iso(%s) === %s', (input, expected) => {
    expect(isoYearWeek(new Date(input))).toBe(expected);
  });

  it('two consecutive Mondays produce two consecutive week strings (the load-bearing property)', () => {
    const monday1 = new Date('2026-05-25T14:00:00Z'); // Monday W22
    const monday2 = new Date('2026-06-01T14:00:00Z'); // Monday W23
    expect(isoYearWeek(monday1)).toBe('2026-W22');
    expect(isoYearWeek(monday2)).toBe('2026-W23');
    expect(isoYearWeek(monday1)).not.toBe(isoYearWeek(monday2));
  });
});
