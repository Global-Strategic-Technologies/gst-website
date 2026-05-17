/**
 * Radar display-model helpers \u2014 shared category catalog, MCP snapshot
 * adapters, and the unified-feed merge.
 *
 * Post-BL-032.8 Phase B (2026-05-17), this file no longer transforms raw
 * Inoreader API shapes \u2014 the website doesn't call Inoreader directly. The
 * MCP Worker delivers items pre-typed as `RadarSnapshotItem`; the adapters
 * below turn those into the website's `RadarFyiItem` / `RadarWireItem`
 * display models. The HTML strip + 250-char truncate + 'Untitled'/'Unknown'
 * fallbacks preserve the rendering contract the FyiItem / WireItem .astro
 * components depend on.
 */

import type { RadarFyiItem, RadarWireItem, RadarFeedItem, RadarCategory } from './types';

export const CATEGORIES: Record<string, RadarCategory> = {
  'pe-ma': {
    id: 'pe-ma',
    label: 'PE & M&A',
    color: '#9B59B6',
  },
  'enterprise-tech': {
    id: 'enterprise-tech',
    label: 'Enterprise Tech',
    color: '#A0785A',
  },
  'ai-automation': {
    id: 'ai-automation',
    label: 'AI & Automation',
    color: '#3498DB',
  },
  security: {
    id: 'security',
    label: 'Security',
    color: '#E74C3C',
  },
};

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&rdquo;/g, '\u201D')
    .replace(/&ldquo;/g, '\u201C')
    .replace(/&hellip;/g, '\u2026')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).replace(/\s+\S*$/, '') + '...';
}

/**
 * Merge FYI and Wire items into a single chronological feed.
 * FYI items sort by annotatedAt; Wire items sort by publishedAt.
 */
export function mergeFeed(fyi: RadarFyiItem[], wire: RadarWireItem[]): RadarFeedItem[] {
  return [
    ...fyi.map((item) => ({ ...item, kind: 'fyi' as const, sortDate: item.annotatedAt })),
    ...wire.map((item) => ({ ...item, kind: 'wire' as const, sortDate: item.publishedAt })),
  ].sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());
}

// ---------------------------------------------------------------------------
// BL-032.8 Phase 4 — SnapshotItem adapters
//
// The MCP Worker's GET /radar/snapshot endpoint returns items in the
// `SnapshotItem` shape (the canonical MCP-radar contract — see
// mcp-server/src/content/radar-transform.ts). When RadarFeed.astro
// consumes that endpoint instead of calling Inoreader directly, it
// needs adapters from SnapshotItem back into the website's display
// models (RadarFyiItem / RadarWireItem). These adapters preserve the
// existing display behavior — HTML stripping + truncation, category
// fallback, annotation timestamp surfacing — so the visible UX stays
// unchanged across the cutover.
//
// Decoupled from the Inoreader API entirely — no `InoreaderItem` input,
// so when the Phase B retirement removes `inoreader/client.ts` the
// adapters keep working unchanged.
// ---------------------------------------------------------------------------

/**
 * Shape returned by the MCP Worker's `/radar/snapshot` endpoint for one
 * item. Mirrors `SnapshotItem` in the MCP server's `radar-transform.ts`,
 * duplicated here only to avoid a build-time dependency on the
 * mcp-server package from the website's Vite/Astro build. Changes to the
 * MCP-side shape MUST be reflected here in lockstep.
 */
export interface RadarSnapshotItem {
  id: string;
  title: string;
  url: string;
  source: string;
  sourceUrl?: string;
  category: string | null;
  publishedAt: string;
  annotatedAt?: string;
  summary?: string;
  annotation?: { highlightedText?: string; gstTake?: string };
}

/**
 * Adapt a SnapshotItem (MCP shape) into the website's FYI display model.
 *
 * Returns null if the item lacks annotation data — same contract as
 * `toFyiItem(InoreaderItem)`, which returns null when there are no
 * annotations. Preserves the existing display behavior (HTML strip,
 * summary truncation, sort-by-annotatedAt) so the UX is unchanged
 * across the cutover.
 */
export function snapshotToFyiItem(item: RadarSnapshotItem): RadarFyiItem | null {
  const ann = item.annotation;
  if (!ann || (!ann.highlightedText && !ann.gstTake)) return null;
  return {
    id: item.id,
    title: (item.title || 'Untitled').trim(),
    url: item.url,
    source: item.source || 'Unknown',
    sourceUrl: item.sourceUrl ?? '',
    category: item.category ?? 'enterprise-tech',
    publishedAt: item.publishedAt,
    // Fall back to publishedAt when the MCP snapshot omits annotatedAt
    // (defensive — toSnapshotItem populates it on FYI items by design).
    annotatedAt: item.annotatedAt ?? item.publishedAt,
    highlightedText: ann.highlightedText ?? '',
    gstTake: ann.gstTake ?? '',
    summary: truncate(stripHtml(item.summary ?? ''), 250),
  };
}

/** Adapt a SnapshotItem (MCP shape) into the website's Wire display model. */
export function snapshotToWireItem(item: RadarSnapshotItem): RadarWireItem {
  return {
    id: item.id,
    title: (item.title || 'Untitled').trim(),
    url: item.url,
    source: item.source || 'Unknown',
    category: item.category ?? 'enterprise-tech',
    publishedAt: item.publishedAt,
  };
}
