/**
 * stdio entrypoint for the GST MCP server.
 *
 * **Era policy: `legacy: 'serve'` (the `serveStdio` default — passed
 * implicitly by omitting the option).** This is deliberately DIFFERENT from
 * the Worker, which runs modern-only (`legacy: 'reject'` in
 * `pipeline/handle-authenticated.ts`). The asymmetry is a reading of two
 * different client populations, not an oversight — see ADR-0013:
 *
 *   - The Worker has no external clients (verified in BL-106) and a
 *     dependency deadline pushing it off the legacy path.
 *   - stdio has an **active, committed client**: the git-tracked `.mcp.json`
 *     at the repo root registers this server as `gst` for every Claude Code
 *     session in this project, and README.md documents Claude Desktop too.
 *     Their protocol revision is not ours to control, so Directive 6's
 *     active-client rule applies: a coordinated migration or a compat shim.
 *     `'serve'` IS the shim, and it costs nothing structurally — one instance
 *     from the same factory is pinned per connection, so there is no second
 *     code path and no duplicated registration.
 *
 * The failure modes differ too: the Worker's is caught by CI or a probe;
 * stdio's is a human noticing their tools vanished mid-session.
 *
 * To go modern-only here later, pass `{ legacy: 'reject' }`. Note the token
 * differs from the Worker's — `serveStdio` takes `'serve' | 'reject'` while
 * the `agents` handler takes `'stateless' | 'reject'`.
 */

import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server';
import { registerLocalOnlyTools } from './tools/_local-only';

// The factory runs per connection, so BOTH registrations must live inside it.
// Pre-BL-106 this file built one instance and called `registerLocalOnlyTools`
// on it once; under `serveStdio` that would register the local-only surface on
// an instance the transport never pins.
serveStdio(
  () => {
    const server = createServer();
    // stdio-only: offline radar tool + radar Resources backed by the node:fs
    // reader (BL-032 Q12). The Worker registers radar Resources separately
    // with the Upstash-backed reader and never touches these.
    registerLocalOnlyTools(server);
    return server;
  },
  {
    onerror: (err) => {
      console.error('[gst-mcp] transport error:', err);
    },
  }
);

console.error('[gst-mcp] connected on stdio');
