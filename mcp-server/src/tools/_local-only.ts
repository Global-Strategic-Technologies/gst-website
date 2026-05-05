/**
 * Tool / Resource registrations that are stdio-only — NOT registered on the
 * Cloudflare Worker entrypoint.
 *
 * **Why this exists** (BL-032 Q12 — see
 * `src/docs/development/MCP_SERVER_REMOTE_BL-032.md#q12-transport-binding-per-radar-tool-new`):
 * the offline radar tool (`search_radar_offline`, with the deprecated
 * `search_radar_cache` alias for one release per Q2) and the radar
 * Resources (`gst://radar/...`) read from `<repo>/.cache/inoreader/`
 * via [`content/radar-snapshot.ts`](../content/radar-snapshot.ts), which uses
 * `node:fs`, `node:crypto`, and `node:path` at module load time. Those APIs
 * don't exist on Cloudflare Workers' Web-API-only runtime.
 *
 * Splitting these registrations out of `createServer()` means the Worker can
 * import `createServer()` without transitively pulling Node-only modules into
 * the Worker bundle. The stdio entrypoint (`src/index.ts`) calls both
 * `createServer()` and `registerLocalOnlyTools(server)`; the Worker entrypoint
 * (`src/worker.ts`) calls only `createServer()`.
 *
 * **Forward path** (BL-032.5): the radar Resources will move to Upstash-backed
 * HTTP delivery via a Worker Cron snapshot refresh. At that point the radar
 * Resources migrate from this module back into `createServer()` and become
 * transport-portable. The offline tool (`search_radar_offline` post-rename)
 * remains here as the dev/CI/budget-exhausted fallback.
 *
 * **CI invariant** (Phase 6): the schema-drift test
 * (`tests/integration/registry-snapshot.test.ts`) snapshots both the stdio
 * registry (createServer + this file) and the Worker registry (createServer
 * alone) and asserts the diff is exactly the local-only set declared here.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerRadarOfflineTool, registerSearchRadarCacheAlias } from './radar-offline';
import { registerRadarResources } from '../resources/radar';

export function registerLocalOnlyTools(server: McpServer): void {
  registerRadarOfflineTool(server);
  // Deprecated alias for one release. Removed in mcp-server@0.2.0.
  // See mcp-server/BREAKING_CHANGES.md.
  registerSearchRadarCacheAlias(server);
  registerRadarResources(server);
}
