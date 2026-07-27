/**
 * Tool / Resource registrations that are stdio-only — NOT registered on the
 * Cloudflare Worker entrypoint.
 *
 * **Why this exists** (BL-032 Q12 — see
 * `mcp-server/src/docs/ARCHITECTURE.md#transport-binding-per-tool-q12`):
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
 * **BL-032.5 Phase 3 update**: radar Resources are now transport-portable
 * — see `resources/radar.ts`. This file still registers them for the stdio
 * path (using the node:fs-backed `stdioSnapshotReader`); the Worker path
 * registers them inside `createServer()` using `createWorkerSnapshotReader`.
 * The offline tool (`search_radar_offline`) remains stdio-only as the
 * dev/CI/budget-exhausted fallback.
 *
 * **CI invariant**: `tests/integration/protocol-roundtrip.test.ts` asserts the
 * full stdio tool-name list (createServer + this file), so removing or renaming
 * a local-only tool fails there. (This comment previously cited a
 * `tests/integration/registry-snapshot.test.ts` that has never existed in the
 * repo — corrected in BL-090.)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerRadarOfflineTool, registerSearchRadarCacheAlias } from './radar-offline';
import { registerRadarResources } from '../resources/radar';
import { stdioSnapshotReader } from '../content/radar-snapshot-reader-stdio';

export function registerLocalOnlyTools(server: McpServer): void {
  registerRadarOfflineTool(server);
  // Deprecated alias for one release. Removed in mcp-server@0.2.0.
  // See mcp-server/BREAKING_CHANGES.md.
  registerSearchRadarCacheAlias(server);
  // BL-032.5 Phase 3: pass the stdio reader explicitly. The Worker path
  // registers radar Resources separately in `server.ts` via the Upstash-
  // backed reader; this stdio site is the only place the node:fs-backed
  // reader is wired up.
  registerRadarResources(server, stdioSnapshotReader);
}
