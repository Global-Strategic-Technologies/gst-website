/**
 * stdio entrypoint for the GST MCP server.
 *
 * **Era policy: `legacy: 'serve'` (the `serveStdio` default — passed
 * implicitly by omitting the option).** The Worker now serves both eras too
 * (`legacy: 'stateless'`), so the two transports agree; they did not always,
 * and the history is the useful part:
 *
 *   - stdio has an **active, committed client**: the git-tracked `.mcp.json`
 *     at the repo root registers this server as `gst` for every Claude Code
 *     session in this project, and README.md documents Claude Desktop too.
 *     Their protocol revision is not ours to control, so Directive 6's
 *     active-client rule applies: a coordinated migration or a compat shim.
 *     `'serve'` IS the shim, and it costs nothing structurally — one instance
 *     from the same factory is pinned per connection, so there is no second
 *     code path and no duplicated registration.
 *   - The Worker shipped modern-only in 0.44.0 on the reasoning that it had
 *     "no external clients", and was reverted the same day in 0.44.1 because
 *     **Claude Desktop speaks `2025-11-25`**. The exact argument written here
 *     for stdio applied to the Worker as well and was not made: the team
 *     points Claude Desktop at the remote surface, so it has an active client
 *     whose revision we do not control. "No external clients" was read as
 *     "no clients". See ADR-0013's 2026-08-04 amendment.
 *
 * That history also corrects a claim this docstring used to make — that the
 * Worker's failure mode "is caught by CI or a probe". It was not. It was
 * caught by a user, on production, reported as a tool that would not run.
 *
 * To go modern-only on either transport later, confirm from the
 * `mcp.request.era` telemetry that nothing is opening with `initialize`
 * FIRST. Note the tokens differ — `serveStdio` takes `'serve' | 'reject'`
 * while the `agents` handler takes `'stateless' | 'reject'`.
 */

// Default import — `@types/node/process.d.ts` is `export = process`. Explicit
// rather than global: under the workers-types global script `process` is `any`,
// which silently drops `process.exit`'s `never` return and widens the factory
// below to `McpServer | undefined` (BL-137 / ADR-0020).
import process from 'node:process';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server';
import { registerLocalOnlyTools } from './tools/_local-only';
import { stdioSnapshotReader } from './content/radar-snapshot-reader-stdio';

// The factory runs per connection, so BOTH registrations must live inside it.
// Pre-BL-106 this file built one instance and called `registerLocalOnlyTools`
// on it once; under `serveStdio` that would register the local-only surface on
// an instance the transport never pins.
serveStdio(
  () => {
    try {
      // `radarReader` is supplied HERE rather than resolved inside
      // `createServer`: `stdioSnapshotReader` is node:fs-backed, and importing
      // it from the transport-portable factory would put the filesystem reader
      // back in the Worker bundle. It feeds prompt embeds; radar Resources get
      // the same reader via `registerLocalOnlyTools` below.
      const server = createServer({}, { radarReader: stdioSnapshotReader });
      // stdio-only: offline radar tool + radar Resources backed by the node:fs
      // reader (BL-032 Q12). The Worker registers radar Resources separately
      // with the Upstash-backed reader and never touches these.
      registerLocalOnlyTools(server);
      return server;
    } catch (err) {
      // A registry that cannot be built is fatal for stdio: the client would
      // otherwise see a process that is up but answers nothing. This restores
      // the pre-BL-106 `main().catch(… process.exit(1))` behaviour, which the
      // move to `serveStdio` dropped — the factory runs per connection, so a
      // throw here is swallowed by the SDK rather than reaching a top-level
      // handler.
      console.error('[gst-mcp] fatal: failed to build server registry:', err);
      process.exit(1);
    }
  },
  {
    onerror: (err) => {
      console.error('[gst-mcp] transport error:', err);
    },
  }
);

// `serveStdio` returns synchronously and the connection is established lazily
// on the first message, so this is a "listening" line, not a "connected" one.
// (Pre-BL-106 it followed an awaited `server.connect()` and genuinely meant
// connected.) stdout stays protocol-only — all logging goes to stderr.
console.error('[gst-mcp] listening on stdio');
