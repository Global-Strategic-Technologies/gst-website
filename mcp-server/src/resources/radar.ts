/**
 * MCP Resources: gst://radar/...
 *
 * Static URIs registered at server boot:
 *   - gst://radar/fyi/latest          (annotated highlights, with GST Take)
 *   - gst://radar/wire/latest         (latest items across all categories)
 *   - gst://radar/wire/<category>     (one per of the four canonical categories)
 *
 * Per-item URIs (gst://radar/item/<id>) are NOT pre-registered as static
 * resources — there are too many cached items and the IDs change with each
 * `npm run radar:seed`. The `search_radar_offline` tool (BL-032 Phase 4b
 * rename of `search_radar_cache`) returns the items directly; callers
 * don't need to chain to a per-item Resource.
 *
 * If the snapshot file is missing, the read callback returns an `isError`-
 * shaped TextResourceContents with instructions to run `npm run radar:seed`.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  RADAR_CATEGORIES,
  readFyiSnapshot,
  readWireSnapshot,
  readWireSnapshotByCategory,
  SNAPSHOT_MISSING_MESSAGE,
  type RadarCategory,
  type SnapshotTier,
} from '../content/radar-snapshot';

const CATEGORY_LABELS: Readonly<Record<RadarCategory, string>> = {
  'pe-ma': 'PE & M&A',
  'enterprise-tech': 'Enterprise Tech',
  'ai-automation': 'AI & Automation',
  security: 'Security',
};

function buildBody(uri: string, tier: SnapshotTier | null): string {
  if (!tier) {
    return JSON.stringify({ error: SNAPSHOT_MISSING_MESSAGE, uri }, null, 2);
  }
  return JSON.stringify(
    {
      uri,
      tier: tier.tier,
      lastSeededAt: tier.lastSeededAt,
      itemCount: tier.items.length,
      items: tier.items,
    },
    null,
    2
  );
}

export function registerRadarResources(server: McpServer): void {
  // gst://radar/fyi/latest
  server.registerResource(
    'GST Radar — FYI (latest annotated items)',
    'gst://radar/fyi/latest',
    {
      title: 'GST Radar — FYI (latest annotated)',
      description:
        'Latest annotated highlights from the GST Radar feed (snapshot-backed; refreshed via `npm run radar:seed`).',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: buildBody(uri.href, readFyiSnapshot()),
        },
      ],
    })
  );

  // gst://radar/wire/latest
  server.registerResource(
    'GST Radar — Wire (latest)',
    'gst://radar/wire/latest',
    {
      title: 'GST Radar — Wire (latest across all categories)',
      description:
        'Latest items from the merged GST Radar Wire feed (snapshot-backed; refreshed via `npm run radar:seed`).',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: buildBody(uri.href, readWireSnapshot()),
        },
      ],
    })
  );

  // gst://radar/wire/<category> for each of the four canonical categories.
  for (const category of RADAR_CATEGORIES) {
    const uri = `gst://radar/wire/${category}`;
    server.registerResource(
      `GST Radar — Wire (${CATEGORY_LABELS[category]})`,
      uri,
      {
        title: `GST Radar — Wire: ${CATEGORY_LABELS[category]}`,
        description: `${CATEGORY_LABELS[category]} items from the GST Radar Wire feed (snapshot-backed).`,
        mimeType: 'application/json',
      },
      async (resourceUri) => ({
        contents: [
          {
            uri: resourceUri.href,
            mimeType: 'application/json',
            text: buildBody(resourceUri.href, readWireSnapshotByCategory(category)),
          },
        ],
      })
    );
  }
}

/** Frozen list of expected radar URIs — used by the URI-stability test. */
export const RADAR_URIS: ReadonlyArray<string> = [
  'gst://radar/fyi/latest',
  'gst://radar/wire/latest',
  ...RADAR_CATEGORIES.map((c) => `gst://radar/wire/${c}`),
];
