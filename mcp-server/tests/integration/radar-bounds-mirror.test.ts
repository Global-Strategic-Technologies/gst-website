/**
 * BL-109 — the radar tools apply the website's display bound, and report truncation.
 *
 * **Why this file exists.** `search_radar` returned ~46 wire items where `/hub/radar`
 * renders 30, and under BL-108's two-channel response that produced a 143,027-character
 * result which exceeded a real client's tool-result ceiling — a hard failure, not a
 * large response. The bound was inline in `RadarFeed.astro`, untested, and never applied
 * server-side.
 *
 * **What this file guards that the website unit test cannot**: that the *tool* applies
 * the shared bounder, and applies it in the one correct order —
 *
 *     dedupe against FYI → bound globally → merge → apply input.category
 *
 * Both orderings below fail silently under a naive implementation, and neither is
 * observable from `tests/unit/radar-feed-bounds.test.ts`, which tests the function alone.
 *
 * **What nothing covers**: `RadarFeed.astro`'s own call site and its FYI-URL dedupe.
 * Astro components cannot be imported by vitest. Guards there are `astro check`, the
 * deletion of the inline block, and review.
 *
 * Fixtures are deliberately **larger than MAX_WIRE** — every pre-existing radar fixture
 * is 2-5 items, which is exactly why the missing bound was invisible for so long.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { handleRadarOfflineTool } from '../../src/tools/radar-offline';
import { MAX_WIRE, MIN_PER_CATEGORY } from '../../../src/utils/radar-feed-bounds';
import * as snapshot from '../../src/content/radar-snapshot';

type SuccessResult = {
  content: { type: string; text: string }[];
  structuredContent?: {
    matches: Array<{ id: string; category: string | null; tier: string; summary?: string }>;
    totalMatched: number;
    returned: number;
  };
};

const HOUR = 3_600_000;

function wireItem(i: number, category: string, url?: string) {
  return {
    id: `wire-${i}`,
    title: `Wire ${i}`,
    url: url ?? `https://example.com/wire-${i}`,
    source: 'Example',
    category,
    publishedAt: new Date(Date.UTC(2026, 0, 2) - i * HOUR).toISOString(),
    summary: `<p>Body <em>${i}</em> with <img src="https://track.example/p.gif" /> markup.</p>`,
  };
}

function fyiItem(i: number, category: string, url?: string) {
  return {
    id: `fyi-${i}`,
    title: `FYI ${i}`,
    url: url ?? `https://example.com/fyi-${i}`,
    source: 'Example',
    category,
    publishedAt: new Date(Date.UTC(2026, 0, 3) - i * HOUR).toISOString(),
    annotation: { gstTake: `Take ${i}` },
  };
}

function mockSnapshots(fyi: ReturnType<typeof fyiItem>[], wire: ReturnType<typeof wireItem>[]) {
  vi.spyOn(snapshot, 'readFyiSnapshot').mockReturnValue({
    tier: 'fyi',
    lastSeededAt: '2026-01-01T00:00:00.000Z',
    items: fyi,
  } as ReturnType<typeof snapshot.readFyiSnapshot>);
  vi.spyOn(snapshot, 'readWireSnapshot').mockReturnValue({
    tier: 'wire',
    lastSeededAt: '2026-01-01T00:00:00.000Z',
    items: wire,
  } as ReturnType<typeof snapshot.readWireSnapshot>);
}

beforeEach(() => vi.restoreAllMocks());

describe('BL-109 — wire bound', () => {
  it('caps wire at MAX_WIRE while keeping every FYI item', async () => {
    // The guarantee that makes field-trimming unnecessary: FYI carries the GST Take,
    // and the bound must never cost one.
    const fyi = Array.from({ length: 12 }, (_, i) => fyiItem(i, 'pe-ma'));
    const wire = Array.from({ length: 50 }, (_, i) => wireItem(i, 'pe-ma'));
    mockSnapshots(fyi, wire);

    const result = (await handleRadarOfflineTool({ category: undefined })) as SuccessResult;
    const matches = result.structuredContent!.matches;

    expect(matches.filter((m) => m.tier === 'wire')).toHaveLength(MAX_WIRE);
    expect(matches.filter((m) => m.tier === 'fyi')).toHaveLength(12);
  });

  it('bounds GLOBALLY, before the category filter', async () => {
    // The subtle one. The website's category pills filter client-side over the
    // already-bounded set — which is the entire reason MIN_PER_CATEGORY exists. If the
    // tool filtered first and bounded after, a `security` call would return up to
    // MAX_WIRE security items where the page shows a handful. That bug is invisible on
    // the unfiltered call, i.e. on every test anyone would write first.
    const wire = [
      ...Array.from({ length: 50 }, (_, i) => wireItem(i, 'pe-ma')),
      // `security` items are the OLDEST, so only the per-category quota rescues them.
      ...Array.from({ length: 20 }, (_, i) => ({
        ...wireItem(500 + i, 'security'),
        publishedAt: new Date(Date.UTC(2020, 0, 1) - i * HOUR).toISOString(),
      })),
    ];
    mockSnapshots([], wire);

    const result = (await handleRadarOfflineTool({ category: 'security' })) as SuccessResult;
    const matches = result.structuredContent!.matches;

    // The quota, not the cap, is what rescues these: a purely chronological cut would
    // have dropped all 20 `security` items in favour of the newer `pe-ma` ones.
    expect(matches).toHaveLength(MIN_PER_CATEGORY);
  });
});

describe('BL-109 — truncation is self-describing', () => {
  it('totalMatched counts the request match BEFORE the bound; returned counts after', async () => {
    const wire = Array.from({ length: 50 }, (_, i) => wireItem(i, 'pe-ma'));
    mockSnapshots([], wire);

    const result = (await handleRadarOfflineTool({ category: undefined })) as SuccessResult;
    const payload = result.structuredContent!;

    expect(payload.returned).toBe(MAX_WIRE);
    expect(payload.totalMatched).toBe(50);
    expect(payload.returned).toBeLessThan(payload.totalMatched);
    expect(result.content[0].text).toContain(`${MAX_WIRE} of 50`);
  });

  it('totalMatched respects the category filter — it is not the whole feed', async () => {
    // Counting `merged.length` instead would report 60 here. The field means "how many
    // matched THIS request", not "how many exist".
    const wire = [
      ...Array.from({ length: 40 }, (_, i) => wireItem(i, 'pe-ma')),
      ...Array.from({ length: 20 }, (_, i) => wireItem(100 + i, 'security')),
    ];
    mockSnapshots([], wire);

    const result = (await handleRadarOfflineTool({ category: 'security' })) as SuccessResult;
    expect(result.structuredContent!.totalMatched).toBe(20);
  });
});

describe('BL-109 — summary projection', () => {
  it('strips HTML from summary at the tool boundary', async () => {
    mockSnapshots([], [wireItem(1, 'pe-ma')]);

    const result = (await handleRadarOfflineTool({ category: undefined })) as SuccessResult;
    const summary = result.structuredContent!.matches[0].summary;

    expect(summary).toBe('Body 1 with markup.');
    expect(summary).not.toContain('<');
    expect(summary).not.toContain('track.example');
  });

  it('leaves an absent summary undefined rather than manufacturing an empty string', async () => {
    const bare = { ...wireItem(1, 'pe-ma') } as Record<string, unknown>;
    delete bare.summary;
    mockSnapshots([], [bare as ReturnType<typeof wireItem>]);

    const result = (await handleRadarOfflineTool({ category: undefined })) as SuccessResult;
    const match = result.structuredContent!.matches[0];

    expect(match.summary).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(match, 'summary')).toBe(false);
  });

  it('does NOT strip in toSnapshotItem — the snapshot/Resource path keeps raw HTML', async () => {
    // The projection is deliberately confined to the tool boundary. `toSnapshotItem`
    // also feeds /radar/snapshot, the gst://radar/* Resources and the cron cache, all of
    // which want the source bytes.
    const { toSnapshotItem } = await import('../../src/content/radar-transform');
    const item = toSnapshotItem(
      {
        id: 'raw-1',
        title: 'Raw',
        canonical: [{ href: 'https://example.com/raw-1' }],
        origin: { title: 'Example' },
        published: 1767225600,
        summary: { content: '<p>Keep <em>my</em> markup.</p>' },
        categories: [],
      } as never,
      'wire'
    );

    expect(item.summary).toBe('<p>Keep <em>my</em> markup.</p>');
  });
});
