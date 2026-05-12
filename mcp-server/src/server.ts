/**
 * Transport-portable MCP server factory.
 *
 * This factory registers the surface that runs on BOTH the stdio entrypoint
 * (`src/index.ts`) and the Cloudflare Worker entrypoint (`src/worker.ts`).
 * Tools and Resources registered here MUST be Workers-compatible — no
 * `node:fs` / `node:crypto` / `node:path` at module load time.
 *
 * Stdio-only registrations (radar offline tool + radar Resources, which use
 * `node:*` via radar-snapshot.ts) live in [`tools/_local-only.ts`](./tools/_local-only.ts)
 * and are called only from `src/index.ts`. See BL-032 Q12 in
 * `src/docs/development/MCP_SERVER_REMOTE_BL-032.md` for the rationale.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDiligenceTool } from './tools/diligence';
import { registerPortfolioTools } from './tools/portfolio';
import { registerIcgTool } from './tools/icg';
import { registerTechparTool } from './tools/techpar';
import { registerTechDebtTool } from './tools/tech-debt';
import { registerRegulationsTool } from './tools/regulations';
import { registerRadarLiveTools } from './tools/radar-live';
import { registerLibraryResources } from './resources/library';
import { registerRegulationResources } from './resources/regulations';
import { registerPrompts } from './prompts/_registry';
import type { Env } from './worker';

/**
 * Build a transport-portable MCP server registry.
 *
 * The optional `env` parameter is passed through to live radar tools
 * (BL-032 Phase 4c) so they can read Inoreader credentials and check
 * the circuit breaker per request. The Worker calls `createServer(env)`
 * inside its fetch handler (env captured in tool closures, request-
 * scoped). The stdio entrypoint calls `createServer()` with no env;
 * radar-live tools still register but return a `config-missing` error
 * envelope when Inoreader creds aren't bound at the runtime level.
 */
export function createServer(env: Env = {}): McpServer {
  const server = new McpServer({
    name: 'gst-mcp',
    version: '0.1.0',
  });

  // Tools (transport-portable)
  registerDiligenceTool(server);
  registerPortfolioTools(server);
  registerIcgTool(server);
  registerTechparTool(server);
  registerTechDebtTool(server);
  registerRegulationsTool(server);
  registerRadarLiveTools(server, env);

  // Resources (transport-portable — radar Resources are stdio-only, see _local-only.ts)
  registerLibraryResources(server);
  registerRegulationResources(server);

  // Prompts
  registerPrompts(server);

  return server;
}
