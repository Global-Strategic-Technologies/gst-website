/**
 * Transform Inoreader API responses into Radar display models.
 *
 * Handles URL extraction, category inference, HTML stripping,
 * and annotation extraction for FYI items.
 */

import type {
  InoreaderItem,
  RadarFyiItem,
  RadarWireItem,
  RadarFeedItem,
  RadarCategory,
} from './types';

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

const FOLDER_TO_CATEGORY: Record<string, string> = {
  'GST-PE-MA': 'pe-ma',
  'GST-Enterprise-Tech': 'enterprise-tech',
  'GST-AI-Automation': 'ai-automation',
  'GST-Security': 'security',
};

function extractUrl(item: InoreaderItem): string {
  return item.canonical?.[0]?.href || item.alternate?.[0]?.href || '';
}

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
 * Infer category from Inoreader item's categories array.
 *
 * Priority:
 * 1. Explicit gst-* tag
 * 2. GST-* folder membership
 * 3. Keyword inference from title
 * 4. Default to enterprise-tech
 */
function inferCategory(item: InoreaderItem): string {
  for (const cat of item.categories) {
    const tagLabel = cat.split('/').pop() || '';
    if (tagLabel.startsWith('gst-')) {
      const catId = tagLabel.replace('gst-', '');
      if (CATEGORIES[catId]) return catId;
    }

    for (const [folder, catId] of Object.entries(FOLDER_TO_CATEGORY)) {
      if (cat.includes(`/label/${folder}`)) return catId;
    }
  }

  const title = (item.title || '').toLowerCase();
  if (/private equity|m&a|merger|acquisition|deal|buyout|portfolio company/.test(title))
    return 'pe-ma';
  if (/security|cyber|vulnerability|breach|compliance|soc\b/.test(title)) return 'security';
  if (/\bai\b|artificial intelligence|machine learning|llm|automation|ml ops/.test(title))
    return 'ai-automation';

  return 'enterprise-tech';
}

/**
 * Transform an annotated Inoreader item into an FYI display model.
 * Merges highlight text and notes across all annotations for the item,
 * since Inoreader may return them as separate annotation objects.
 */
export function toFyiItem(item: InoreaderItem): RadarFyiItem | null {
  const annotations = item.annotations || [];
  if (annotations.length === 0) return null;

  // Merge across all annotations: collect the first non-empty text and note.
  // Inoreader may store a highlight (text only) and a comment (note only)
  // as separate annotation objects on the same item.
  const highlightedText = annotations.find((a) => a.text && a.text.trim() !== '')?.text || '';
  const gstTake = annotations.find((a) => a.note && a.note.trim() !== '')?.note || '';

  // Use the most recent annotation timestamp for sort ordering
  const latestAnnotation = annotations.reduce((latest, a) =>
    a.added_on > latest.added_on ? a : latest
  );

  const summary = stripHtml(item.summary?.content || item.content?.content || '');

  return {
    id: item.id,
    title: (item.title || 'Untitled').trim(),
    url: extractUrl(item),
    source: item.origin?.title || 'Unknown',
    sourceUrl: item.origin?.htmlUrl || '',
    category: inferCategory(item),
    publishedAt: new Date(item.published * 1000).toISOString(),
    annotatedAt: new Date(latestAnnotation.added_on * 1000).toISOString(),
    highlightedText,
    gstTake,
    summary: truncate(summary, 250),
  };
}

/**
 * Transform an Inoreader item into a compact Wire display model.
 */
export function toWireItem(item: InoreaderItem): RadarWireItem {
  return {
    id: item.id,
    title: (item.title || 'Untitled').trim(),
    url: extractUrl(item),
    source: item.origin?.title || 'Unknown',
    category: inferCategory(item),
    publishedAt: new Date(item.published * 1000).toISOString(),
  };
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
