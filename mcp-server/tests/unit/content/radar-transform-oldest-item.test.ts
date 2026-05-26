/**
 * Unit tests for `oldestItemDaysAgo` (BL-031.95 follow-up; result-shape
 * enrichment for radar tools).
 *
 * Pinned behavior:
 *   - empty input → null (distinguishes "no items" from "items today")
 *   - all items today → 0
 *   - one item N days ago → N (whole-day floor)
 *   - mixed dates → picks the oldest
 *   - undefined/unparseable publishedAt is skipped (degrade gracefully;
 *     don't throw on malformed Inoreader data)
 *   - all items have unparseable dates → null
 *   - boundary: 23h59m ago is still 0 days (rolling 24h buckets, not UTC
 *     midnight buckets — documented behavior)
 */

import { describe, it, expect } from 'vitest';
import { oldestItemDaysAgo } from '../../../src/content/radar-transform';

const NOW = new Date('2026-05-26T15:00:00.000Z').getTime();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function item(daysAgo: number): { publishedAt: string } {
  return { publishedAt: new Date(NOW - daysAgo * DAY).toISOString() };
}

describe('oldestItemDaysAgo', () => {
  it('returns null for empty input', () => {
    expect(oldestItemDaysAgo([], NOW)).toBeNull();
  });

  it('returns 0 for a single item published "now"', () => {
    expect(oldestItemDaysAgo([item(0)], NOW)).toBe(0);
  });

  it('returns the floor of (now - oldest) in days for a single item', () => {
    expect(oldestItemDaysAgo([item(5)], NOW)).toBe(5);
    expect(oldestItemDaysAgo([item(14)], NOW)).toBe(14);
  });

  it('picks the oldest item when multiple are present', () => {
    expect(oldestItemDaysAgo([item(2), item(7), item(1), item(4)], NOW)).toBe(7);
  });

  it('uses rolling 24h buckets, not UTC midnight (23h59m is still 0 days)', () => {
    const almostDay = { publishedAt: new Date(NOW - (DAY - 60 * 1000)).toISOString() };
    expect(oldestItemDaysAgo([almostDay], NOW)).toBe(0);
  });

  it('treats exactly 24h ago as 1 day', () => {
    const exactlyOneDay = { publishedAt: new Date(NOW - DAY).toISOString() };
    expect(oldestItemDaysAgo([exactlyOneDay], NOW)).toBe(1);
  });

  it("clamps future-dated items to 0 (defensive — Inoreader shouldn't but might)", () => {
    const future = { publishedAt: new Date(NOW + 5 * DAY).toISOString() };
    expect(oldestItemDaysAgo([future], NOW)).toBe(0);
  });

  it('skips items with unparseable publishedAt and uses the remaining valid items', () => {
    const malformed = { publishedAt: 'not a date' };
    expect(oldestItemDaysAgo([malformed, item(3)], NOW)).toBe(3);
  });

  it('returns null when every item has an unparseable publishedAt', () => {
    expect(oldestItemDaysAgo([{ publishedAt: 'garbage' }, { publishedAt: '' }], NOW)).toBeNull();
  });

  it('defaults `now` to Date.now() when omitted', () => {
    const recent = { publishedAt: new Date(Date.now() - 2 * DAY).toISOString() };
    const result = oldestItemDaysAgo([recent]);
    // Allow ±1 due to wall-clock drift between item construction and call.
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(2);
  });
});
