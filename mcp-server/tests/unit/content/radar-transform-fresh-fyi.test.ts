/**
 * Unit tests for `filterFreshFyi` (Radar FYI time-limited pinning).
 *
 * Pinned behavior:
 *   - empty input → []
 *   - all fresh → passthrough, capped at maxCount (newest by annotatedAt)
 *   - all stale → [] (curated tier may legitimately render empty)
 *   - mixed → drops only the stale items
 *   - > maxCount fresh → keeps the newest maxCount BY annotatedAt
 *   - unparseable annotatedAt/publishedAt → dropped (expiry filter must not
 *     leak items it cannot prove are fresh)
 *   - future-dated annotation → kept and sorts first
 *   - boundary: exactly maxAgeDays ago is KEPT; maxAgeDays + 1ms is DROPPED
 *   - annotatedAt missing → falls back to publishedAt for the age/sort axis
 *   - exported constants are the agreed values (30 / 15)
 */

import { describe, it, expect } from 'vitest';
import {
  filterFreshFyi,
  FYI_MAX_AGE_DAYS,
  FYI_MAX_COUNT,
  type SnapshotItem,
} from '../../../src/content/radar-transform';

const NOW = new Date('2026-07-01T12:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

/**
 * Build an FYI-shaped SnapshotItem annotated `daysAgo` days before NOW.
 * Pass `overrides` to exercise the publishedAt-fallback / unparseable cases.
 */
function fyi(id: string, daysAgo: number, overrides: Partial<SnapshotItem> = {}): SnapshotItem {
  return {
    id,
    title: `Item ${id}`,
    url: `https://example.com/${id}`,
    source: 'Example',
    category: 'enterprise-tech',
    publishedAt: new Date(NOW - daysAgo * DAY).toISOString(),
    annotatedAt: new Date(NOW - daysAgo * DAY).toISOString(),
    annotation: { gstTake: 'take' },
    ...overrides,
  };
}

const DEFAULT_OPTS = { maxAgeDays: FYI_MAX_AGE_DAYS, maxCount: FYI_MAX_COUNT };

describe('filterFreshFyi', () => {
  it('returns [] for empty input', () => {
    expect(filterFreshFyi([], DEFAULT_OPTS, NOW)).toEqual([]);
  });

  it('passes through fresh items (newest-first by annotatedAt)', () => {
    const items = [fyi('a', 10), fyi('b', 1), fyi('c', 20)];
    const result = filterFreshFyi(items, DEFAULT_OPTS, NOW);
    expect(result.map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('returns [] when every item is stale (curated tier may be empty)', () => {
    const items = [fyi('a', 31), fyi('b', 45), fyi('c', 400)];
    expect(filterFreshFyi(items, DEFAULT_OPTS, NOW)).toEqual([]);
  });

  it('drops only the stale items in a mixed feed', () => {
    const items = [fyi('fresh', 5), fyi('stale', 60), fyi('edge', 29)];
    const result = filterFreshFyi(items, DEFAULT_OPTS, NOW);
    expect(result.map((i) => i.id)).toEqual(['fresh', 'edge']);
  });

  it('keeps only the newest maxCount when more than maxCount are fresh', () => {
    // 20 items, all fresh, annotated 0..19 days ago.
    const items = Array.from({ length: 20 }, (_, i) => fyi(`i${i}`, i));
    const result = filterFreshFyi(items, DEFAULT_OPTS, NOW);
    expect(result).toHaveLength(FYI_MAX_COUNT);
    // Newest 15 by annotation date → i0..i14.
    expect(result.map((i) => i.id)).toEqual(
      Array.from({ length: FYI_MAX_COUNT }, (_, i) => `i${i}`)
    );
  });

  it('drops items with an unparseable date', () => {
    const items = [
      fyi('good', 3),
      fyi('bad', 3, { annotatedAt: 'not-a-date', publishedAt: 'also-bad' }),
    ];
    const result = filterFreshFyi(items, DEFAULT_OPTS, NOW);
    expect(result.map((i) => i.id)).toEqual(['good']);
  });

  it('keeps a future-dated annotation and sorts it first', () => {
    const future = fyi('future', -5); // annotated 5 days in the future
    const items = [fyi('now', 0), future, fyi('old', 10)];
    const result = filterFreshFyi(items, DEFAULT_OPTS, NOW);
    expect(result.map((i) => i.id)).toEqual(['future', 'now', 'old']);
  });

  it('keeps an item annotated exactly maxAgeDays ago (inclusive boundary)', () => {
    const exactly = fyi('boundary', 0, {
      annotatedAt: new Date(NOW - FYI_MAX_AGE_DAYS * DAY).toISOString(),
    });
    expect(filterFreshFyi([exactly], DEFAULT_OPTS, NOW).map((i) => i.id)).toEqual(['boundary']);
  });

  it('drops an item annotated maxAgeDays + 1ms ago (exclusive past the boundary)', () => {
    const justPast = fyi('past', 0, {
      annotatedAt: new Date(NOW - FYI_MAX_AGE_DAYS * DAY - 1).toISOString(),
    });
    expect(filterFreshFyi([justPast], DEFAULT_OPTS, NOW)).toEqual([]);
  });

  it('falls back to publishedAt when annotatedAt is absent', () => {
    const noAnnotatedAt = fyi('pubonly', 0, {
      annotatedAt: undefined,
      publishedAt: new Date(NOW - 2 * DAY).toISOString(),
    });
    const stalePub = fyi('pubstale', 0, {
      annotatedAt: undefined,
      publishedAt: new Date(NOW - 90 * DAY).toISOString(),
    });
    const result = filterFreshFyi([noAnnotatedAt, stalePub], DEFAULT_OPTS, NOW);
    expect(result.map((i) => i.id)).toEqual(['pubonly']);
  });

  it('defaults now to Date.now() when omitted', () => {
    const recent = fyi('recent', 0, {
      annotatedAt: new Date(Date.now() - 2 * DAY).toISOString(),
    });
    const ancient = fyi('ancient', 0, {
      annotatedAt: new Date(Date.now() - 200 * DAY).toISOString(),
    });
    const result = filterFreshFyi([recent, ancient]);
    expect(result.map((i) => i.id)).toEqual(['recent']);
  });

  it('exposes the agreed cap constants', () => {
    expect(FYI_MAX_AGE_DAYS).toBe(30);
    expect(FYI_MAX_COUNT).toBe(15);
  });
});
