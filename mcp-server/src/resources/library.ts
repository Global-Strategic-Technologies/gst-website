/**
 * MCP Resources: gst://library/<slug>
 *
 * Exposes the GST Library articles as readable Resources. The body is
 * inlined into the binary at build time (see content/library-loader.ts).
 *
 * BL-032.5 Phase 1: every read goes through `readThroughCache` so hot
 * Library Resources serve from Upstash on subsequent reads (24h TTL).
 * Cache is invisible to clients; when Upstash isn't bound (stdio dev
 * paths) the read-through fails open and the handler returns the
 * computed body directly.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LIBRARY_ENTRIES, loadLibraryByUri } from '../content/library-loader';
import { readThroughCache, RESOURCE_TTL_SECONDS } from '../cache/resource-cache';
import { NOOP_METRICS_CONTEXT, withResourceMetrics, type MetricsContext } from '../metrics/_index';
import type { Env } from '../worker';

export function registerLibraryResources(
  server: McpServer,
  env: Env = {},
  metrics: MetricsContext = NOOP_METRICS_CONTEXT
): void {
  for (const entry of LIBRARY_ENTRIES) {
    server.registerResource(
      entry.name,
      entry.uri,
      {
        title: entry.name,
        description: entry.description,
        mimeType: entry.mimeType,
      },
      withResourceMetrics(entry.uri, metrics, async (uri: URL) => {
        const { body, mimeType } = await readThroughCache(
          env,
          uri.href,
          RESOURCE_TTL_SECONDS.LIBRARY,
          async () => {
            const found = loadLibraryByUri(uri.href);
            if (!found) {
              throw new Error(`Unknown library URI: ${uri.href}`);
            }
            return { body: found.body, mimeType: found.mimeType };
          }
        );
        return {
          contents: [
            {
              uri: uri.href,
              mimeType,
              text: body,
            },
          ],
        };
      })
    );
  }
}
