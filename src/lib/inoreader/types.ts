/**
 * Inoreader API response types.
 * Based on Google Reader API format used by Inoreader.
 * Reference: https://www.inoreader.com/developers/stream-contents
 */

export interface InoreaderAnnotation {
  id: number;
  start: number;
  end: number;
  added_on: number;
  text: string;
  note: string;
}

export interface InoreaderItem {
  id: string;
  title: string;
  published: number;
  updated?: number;
  canonical?: Array<{ href: string }>;
  alternate?: Array<{ href: string; type: string }>;
  origin: {
    streamId: string;
    title: string;
    htmlUrl: string;
  };
  summary?: { content: string };
  content?: { content: string };
  author?: string;
  categories: string[];
  annotations?: InoreaderAnnotation[];
  enclosure?: Array<{ href: string; type: string }>;
}

export interface InoreaderStreamResponse {
  direction: string;
  id: string;
  title?: string;
  updated: number;
  items: InoreaderItem[];
  continuation?: string;
}

/** Transformed display model for FYI items (Tier 2 — curated reads) */
export interface RadarFyiItem {
  id: string;
  title: string;
  url: string;
  source: string;
  sourceUrl: string;
  category: string;
  publishedAt: string;
  annotatedAt: string;
  highlightedText: string;
  gstTake: string;
  summary: string;
}

/** Transformed display model for Wire items (Tier 1 — automated feed) */
export interface RadarWireItem {
  id: string;
  title: string;
  url: string;
  source: string;
  category: string;
  publishedAt: string;
}

export interface RadarCategory {
  id: string;
  label: string;
  color: string;
}
