/**
 * MCP Resources: gst://regulations/<jurisdiction>/<framework-id>
 *
 * One Resource per regulatory framework (120 total). Bodies are emitted as
 * pretty-printed JSON; agents that want a structured object should JSON.parse
 * the text content. The full Regulation schema (id, name, regions,
 * effectiveDate, summary, category, keyRequirements, penalties) is preserved.
 *
 * BL-032.5 Phase 1: every read goes through `readThroughCache` so hot
 * Regulation Resources serve from Upstash on subsequent reads (24h TTL).
 * The pretty-print cost (~1-2ms per framework on cold reads) is paid once
 * per TTL window. Fail-open: when Upstash isn't bound, falls back to
 * recomputing on every call.
 */

import type { McpServer } from '@modelcontextprotocol/server';
import { REGULATION_ENTRIES, loadRegulationByUri } from '../content/regulation-loader';
import { readThroughCache, RESOURCE_TTL_SECONDS } from '../cache/resource-cache';
import { NOOP_METRICS_CONTEXT, withResourceMetrics, type MetricsContext } from '../metrics/_index';
import type { Env } from '../worker';

export function registerRegulationResources(
  server: McpServer,
  env: Env = {},
  metrics: MetricsContext = NOOP_METRICS_CONTEXT
): void {
  for (const entry of REGULATION_ENTRIES) {
    server.registerResource(
      entry.data.name,
      entry.uri,
      {
        title: entry.data.name,
        description: entry.data.summary,
        mimeType: 'application/json',
      },
      withResourceMetrics(entry.uri, metrics, async (uri: URL) => {
        const { body, mimeType } = await readThroughCache(
          env,
          uri.href,
          RESOURCE_TTL_SECONDS.REGULATION,
          async () => {
            const found = loadRegulationByUri(uri.href);
            if (!found) {
              throw new Error(`Unknown regulation URI: ${uri.href}`);
            }
            return {
              body: JSON.stringify(found.data, null, 2),
              mimeType: 'application/json',
            };
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
