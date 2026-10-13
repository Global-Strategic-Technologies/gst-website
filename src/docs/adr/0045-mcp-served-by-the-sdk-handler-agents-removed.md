# ADR-0045: MCP is served by the SDK's `createMcpHandler` directly; `agents` is removed

- **Status**: Accepted 2026-10-13 (`@gst/mcp-server` 0.69.0, `@modelcontextprotocol/server` 2.3.1). **Supersedes [ADR-0013](0013-mcp-2026-07-28-modern-only-worker.md) decision 4** ("Keep the `agents` dependency"); the rest of ADR-0013 stands.
- **Source initiative**: none — forced by Dependabot PR #535 (`@modelcontextprotocol/server` 2.0.0 → 2.3.1), which this change supersedes.

## Context

Since BL-106 the Worker served MCP through Cloudflare's `agents` package: `mcp-server/src/pipeline/handle-authenticated.ts` imported `createMcpHandler` from `agents/mcp/server` and handed it our per-request `createServer` factory. That function is a wrapper over the SDK's own `createMcpHandler`, and it was the one symbol of `agents` we used.

`agents@0.24.0` declares `@modelcontextprotocol/server` as an **exact** peer (`2.0.0`), and so does every release through `0.28.0`, the latest on 2026-10-13. Dependabot PR #535 bumped our copy to 2.3.1 and failed `tsc`, because the bump installed two SDK copies: our `createServer` built a 2.3.1 `McpServer`, and `agents`' handler ran it through its own 2.0.0 copy. The same exact-peer pinning is why the root `overrides` for `@modelcontextprotocol/client` and `@modelcontextprotocol/sdk` existed (added 2026-10-09 to close an advisory that had no in-range fix).

`agents` main merged a move to an exact `2.3.1` pin on 2026-10-12 (cloudflare/agents PR #2574), unreleased on 2026-10-13. That release would have unblocked this one bump while keeping the lock-step: our SDK version would still move only when `agents` moved its pin.

ADR-0013 decision 4 kept `agents` for three stated reasons: it is the Cloudflare-supported seam for the v2 factory; removing it is a separate change with its own risk profile; and it is the Durable Objects / Workflows path if the deferred Tasks work activates. The repo owner decided on 2026-10-13 to remove it.

## Decision

1. **The Worker imports `createMcpHandler` from `@modelcontextprotocol/server` and calls it directly.** `agents` is removed from `mcp-server/package.json`; `@modelcontextprotocol/server` moves from exact `2.0.0` to exact `2.3.1`. The SDK returns an object rather than a callable, so the call is `mcp.fetch(request)` (its second parameter is `{ authInfo, parsedBody }`, never `env`), where the wrapper was called as `mcp(request, env, ctx)`.
2. **The pipeline owns the exact-path rule.** The SDK handler matches no path. The wrapper answered 404 unless the pathname was exactly `/mcp`, and that was load-bearing: `isRoutedPath` in `mcp-server/src/worker.ts` admits `/mcp/*` and any method on `/radar/snapshot`, and the pipeline only short-circuits `GET /radar/snapshot`. `handle-authenticated.ts` now checks `url.pathname === '/mcp'` at the dispatch point and answers 404 `Not Found` otherwise. It is placed there, not as an early return, so the request is still rate-limited, logged (`mcp.request`) and CORS-wrapped as before. The gates ahead of it are unchanged too, so a request to one of those paths can still be refused by a gate before it reaches the 404.
3. **No origin, host or CORS option is passed, because the SDK handler has none.** It is validation-free by design: no origin or host gating, no `Access-Control-*` headers. `src/auth/cors.ts` remains the single origin authority (ADR-0013 decision 3 stands; only its mechanism is gone — see Consequences).
4. **`maxRequestBodySize` is set to 100 MiB** (`MAX_REQUEST_BODY_BYTES`). SDK 2.1.0 and later cap request bodies at 4 MiB by default and answer 413 above it, on both lanes. Nothing capped bodies before, and `inspectToolCalls` has already read the whole body before the handler runs. The option must be a finite positive number and cannot be disabled, so the value is far above any real payload.
5. **`legacy: 'stateless'` is unchanged.** Both protocol eras are still served, and ADR-0013's standing rule about `'reject'` still applies.

**Rejected:**

- **Wait for `agents` to move its pin.** It unblocks one bump and keeps the coupling: every later SDK release waits on an `agents` release, for a wrapper whose remaining work (below) we either do not use or now own in four lines.
- **A root override forcing `agents` onto `@modelcontextprotocol/server` 2.3.1.** That is what the `client` / `sdk` overrides did, and it was acceptable there because neither package was on the Worker's runtime path. `server` is on it, and `agents`' legacy adapter patched SDK transport internals — an override would have run that adapter against a version its authors had not pinned.
- **Tightening `isRoutedPath` to exact `/mcp`.** It would turn an unauthenticated `/mcp/extra` from a 401 challenge into a 404, and cut across [ADR-0044](0044-mcp-oauth-canonical-resource-and-public-origin.md)'s OAuth resource definition (`/mcp` and its sub-paths).
- **Adopting the SDK's 4 MiB body default.** A new refusal on both lanes for no benefit here: the body is already fully read by our own code before the handler sees it.

## Consequences

**What the wrapper did, and what replaces each.** Read from `node_modules/agents/dist/handler-stateless-*.js` before removal; that source is no longer installed.

1. _Exact-path match._ Replaced by the pipeline's dispatch check (decision 2).
2. _Call shape._ `mcp(request, env, ctx)` became `mcp.fetch(request)` (decision 1).
3. _Origin / host gating and CORS._ The wrapper had its own origin gate, whose default accepted set was the localhost trio, and emitted wildcard CORS; we had switched both off with `allowedOriginHostnames: '*'` and `corsOptions: false`. Neither option exists on the SDK handler and neither behaviour does. The wrapper's Host-header check ran only on localhost and `*.workers.dev` hosts and was a no-op on our custom-domain routes.
4. _Legacy (2025-era) lane._ The wrapper forced the SDK to `legacy: 'reject'` and served legacy requests through its own adapter, whose one intended delta was failing server-to-client JSON-RPC requests immediately. We issue none (only logging notifications). The SDK's native `legacy: 'stateless'` fallback now serves that lane: the same transport class, the same 405 for non-POST, the same SSE / 202 behaviour.
5. _Auth plumbing._ The wrapper ran the handler inside an `AsyncLocalStorage` auth context and derived `authInfo` from a verified-context symbol on the Worker `ctx`. Nothing in `mcp-server/src` reads `authInfo`, `getMcpAuthContext` or `requestInfo`, and `@cloudflare/workers-oauth-provider@1.2.3` never sets that symbol; auth reaches tools through the `createServer(env, {...})` closure. Removing it changes nothing. This also closes the question ADR-0013 left open about adopting `getMcpAuthContext`.
6. _Error catch-all._ Wrapper and SDK both answer 500 JSON-RPC `-32603` on a throw and call `onerror`. We still pass `onerror` → `safeLog` `mcp.handler.error`. No extra try/catch was added.

**Wire changes** (server 0.69.0, remote Worker transport only; listed in `mcp-server/BREAKING_CHANGES.md`). stdio is unaffected — `serveStdio`'s signature is unchanged.

- New refusal (SDK 2.1.0): a request whose body carries the modern `_meta` envelope claim but omits the `MCP-Protocol-Version` header is answered HTTP 400, JSON-RPC `-32020`. It was served before. 2025-era requests (`initialize`, envelope-less calls) still classify as legacy and are not affected, so this does not reopen the 0.44.0 incident path.
- New refusal (SDK 2.1.0): a JSON-RPC batch of more than 100 messages is answered HTTP 400, `-32600`. Batch arrays classify as legacy, so this one lands on the legacy lane, after the factory has run.
- Request bodies: effectively no change for clients (decision 4).
- Legacy lane: a factory throw now echoes the request `id` (was `id: null`); an already-aborted legacy request no longer gets a 499 (the modern lane still returns 499).

**Dependencies.**

- Root `overrides` removed: `@modelcontextprotocol/sdk` (the package left the tree) and `@modelcontextprotocol/client` (its only remaining consumer is `mcp-server`'s exact `2.3.1` devDependency, used in tests).
- Root `overrides` kept, now with dev-only consumers: `fast-uri`, `qs`, `ip-address`. Consumers and exit conditions: [DEVELOPER_TOOLING.md § npm audit policy](../development/DEVELOPER_TOOLING.md#npm-audit-policy).
- Lockfile: 109 packages removed, none added. The only version changes are `@modelcontextprotocol/server` and `@modelcontextprotocol/core`, 2.0.0 → 2.3.1 — now a single `core`, shared with the client.
- Licence: `@modelcontextprotocol/server` is MIT through 2.2.0 and Apache-2.0 from 2.3.0.

**`nodejs_compat` stays** in `mcp-server/wrangler.toml`, for a different reason. `agents`' handler (`node:async_hooks`) and its `mimetext` / `mime-types` transitives are gone, and the SDK imports no `node:` module on the Worker path. The flag is required by our own Worker code: `node:crypto` in `src/schemas/compose-dossier-envelope.ts` and `src/prompts/irl-ingestion.ts`, and `node:process` in `src/config.ts`. The earlier statement that our own Worker code is Web-API-only was wrong and is corrected in `wrangler.toml` and `ARCHITECTURE.md`.

**Rollback**: `rollback-mcp.yml` to the previous Worker version. No stored state is involved either way.

**Before the production approval, and after it.** Before: query persisted Worker logs for `mcp.request` with `era: modern`, by `keyOwner`, to confirm which modern-lane callers exist — they are the only population the new `-32020` refusal can reach. After: watch `mcp.request` with status 400 and `era: no-factory-run` (the missing-header refusal), and `mcp.handler.error`.

**Tests that pin this**: `mcp-server/tests/integration/protocol-era-worker.test.ts` — authenticated POST `/mcp/extra` and POST `/radar/snapshot` are 404; authenticated GET `/mcp` is 405; a body just over 4 MiB is served, not 413; a modern request without `MCP-Protocol-Version` is 400 `-32020`; and the origin / CORS property on the wire (a browser origin is served, an allowlisted origin is echoed, no wildcard). `mcp-server/tests/unit/pipeline/handle-authenticated-metrics.test.ts` asserts the handler is called as `fetch(request)` and is not reached off `/mcp`.

**Code/docs that carry this decision**: `mcp-server/src/pipeline/handle-authenticated.ts`, `mcp-server/src/worker.ts` (`isRoutedPath` comment), `mcp-server/src/index.ts` (era-token comment), `mcp-server/wrangler.toml` (`nodejs_compat` rationale), `mcp-server/src/docs/ARCHITECTURE.md` § SDK and § Streamable HTTP binding, `mcp-server/BREAKING_CHANGES.md` (0.69.0).

**Revisit trigger**: the Tasks / Durable Objects work activating ([BL-107](../development/BACKLOG.md#bl-107-mcp-server--tasks-extension-and-mrtr-candidate)). Long-running Worker jobs want Durable Objects or Workflows, which is what `agents` is for; re-adopting it then is a decision about that surface, and would bring the exact-peer coupling back with it.
