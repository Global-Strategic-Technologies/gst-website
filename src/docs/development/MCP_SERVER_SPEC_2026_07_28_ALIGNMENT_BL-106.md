# MCP Server — `2026-07-28` Spec Alignment (BL-106)

> **Backlog initiative**: [BL-106: MCP Server — 2026-07-28 spec alignment](BACKLOG.md#bl-106-mcp-server--2026-07-28-spec-alignment)
>
> **Companion docs**:
>
> - [`mcp-server/src/docs/ARCHITECTURE.md`](../../../mcp-server/src/docs/ARCHITECTURE.md) — the maintained system reference. Its [§ Streamable HTTP binding](../../../mcp-server/src/docs/ARCHITECTURE.md#streamable-http-binding) records which SDK generation we bind and why; this doc explains what changes that.
> - [ADR-0010: Per-client rate-limit tiers](../adr/0010-per-client-rate-limit-tiers.md) — its soft-limit-warning decision rides on the Logging feature this revision deprecates.
> - [ADR-0008: MCP OAuth embedded authorization server](../adr/0008-mcp-oauth-embedded-authorization-server.md) — its no-DCR stance is ratified by this revision.
> - [ADR-0011: Tool response channel policy](../adr/0011-tool-response-channel-policy.md) — bounds what the loosened schema keywords can buy us.
>
> **Predecessors**: [BL-033](BACKLOG.md#bl-033-mcp-server--external-pilot-phase-3) (OAuth 2.1, audit log, tier system — the surfaces this revision touches).
>
> **Scope**: a gap analysis of the deployed GST MCP server against MCP spec revision `2026-07-28`, with a disposition for every delta — and, from 2026-08-03, the record of implementing it. (The original scope line read "ships no code"; the operator authorised implementation on the same branch after the analysis was filed.)
>
> **Operator directives (2026-08-03)**: (1) **do not maintain backwards compatibility** — there are no external clients; (2) **simplicity, elegance and maintainability are the governing design policy.** Both are load-bearing below: together they turn this from a careful staged migration into a net deletion.
>
> **Status: implemented 2026-08-03** at `@gst/mcp-server` 0.44.0; decisions ratified in [ADR-0013](../adr/0013-mcp-2026-07-28-modern-only-worker.md). **Five conclusions in this document were overturned during implementation** — see § What implementation overturned. They are corrected in place below AND listed there, because the wrong versions were acted on (and one was reported to the operator) before being caught.

---

## At a glance

|                        |                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec revision released | `2026-07-28`                                                                                                                                |
| What our Worker speaks | `2026-07-28` only, since 0.44.0 — was `2025-11-25`. stdio still serves both                                                                 |
| Migration substrate    | **Already resolved in `node_modules`** — `agents@0.20.1` pulls `@modelcontextprotocol/{core,client,server}@2.0.0`, which carry `2026-07-28` |
| What sets the clock    | **Not the spec.** `agents` has deprecated the v1 path we use and will remove it in its next major                                           |
| Confirmed defects      | One (CORS preflight)                                                                                                                        |
| Net effect             | Deadline retired; `agents` and `nodejs_compat` **stayed** — see § What implementation overturned                                            |
| Analysis date          | 2026-08-03                                                                                                                                  |

---

## Verified position

Every claim below was checked against installed source, not inferred from release notes.

- **Our cap is `2025-11-25`.** `@modelcontextprotocol/sdk@1.30.0` declares `LATEST_PROTOCOL_VERSION = '2025-11-25'`.
- **We are on a deprecated path today.** `mcp-server/src/pipeline/handle-authenticated.ts` passes a v1 `McpServer` to `createMcpHandler`, which logs _"Passing an MCP SDK v1 server to createMcpHandler is deprecated and will be removed in the next major version"_ on every request.
- **Our registry survives migration.** The v2 `McpServer` retains `registerTool` / `registerResource` / `registerPrompt`, and `registerResource` gained a `cacheHint` option — the seam for `ttlMs` / `cacheScope`.
- **Our per-request construction is the supported v2 shape.** The v2 handler takes `McpServerFactory = (ctx) => McpServer | Server | Promise<…>`. Our `createServer(env, {...})` closure already is one, so the radar-live tools' `env` capture is not at risk.
- **Surface counts**, matching [ARCHITECTURE.md § System shape](../../../mcp-server/src/docs/ARCHITECTURE.md#system-shape): **17 tools** — inclusive of the two stdio-only tools in `mcp-server/src/tools/radar-offline.ts`, so **the Worker exposes 15**; **9 prompts** (`ALL_PROMPTS`); **5 `registerResource` call sites**, three inside loops, so registered URIs far outnumber call sites.
- **Nothing outside the team speaks MCP RPC to us.** The website consumes `GET /radar/snapshot` over plain HTTP (`src/components/radar/RadarFeed.astro`), not the JSON-RPC surface, so it is unaffected by protocol version. No M2M or OAuth clients are provisioned.

---

## The simplification: narrow the `agents` import

The governing question under the operator directives is not "how do we migrate carefully" but "what can we delete."

### What `agents` actually is

Cloudflare's **Agents SDK** — a framework for persistent, stateful AI agents on Durable Objects (its own framing: agents that "remember context, reason through problems, schedule their own work"). Its `mcp` module historically offered two very different things:

1. **`McpAgent`** — the framework path: the MCP server _is_ a Durable Object, with per-session state, hibernation, and a DO-backed event store for stream resumption.
2. **`createMcpHandler`** — a thin adapter mapping an `McpServer` onto a Workers `fetch`. This is the only thing we use.

**The framework path is closed.** `McpAgent` now carries `@deprecated McpAgent is feature-frozen. Migrate to an SDK v2 factory with createMcpHandler from agents/mcp/server.` Cloudflare froze the session-shaped agent in the same period the spec removed protocol-level sessions. Our per-request, no-session architecture is where both vendors landed — that is worth recording, because it means the statelessness in § Free wins was not luck.

### Three entry points, not two

| Entry point                    | What it is                                                               |
| ------------------------------ | ------------------------------------------------------------------------ |
| `agents/mcp` → `McpAgent`      | Deprecated, feature-frozen                                               |
| **`agents/mcp/server`**        | **Cloudflare's recommended target** — exports only the stateless handler |
| `@modelcontextprotocol/server` | The raw SDK handler that the above wraps                                 |

We currently import from `agents/mcp`, the wide barrel that carries the whole Durable Object / RPC / event-store surface. `agents/mcp/server` exports exactly `createMcpHandler` and `getMcpAuthContext`, and pulls in only the stateless chunk.

### Recommendation: narrow first, then evaluate

**Step 1 — change the import to `agents/mcp/server`.** One line. Near-zero risk, and it is the path Cloudflare's own deprecation notice points at. ~~This alone is expected to shed the transitive `mimetext` / `mime-types` and therefore allow removing `nodejs_compat`.~~ **Corrected in implementation: it does not.** The stateless handler imports `node:async_hooks` at module top for its auth-context `AsyncLocalStorage`, so the flag is load-bearing for the handler itself. The `wrangler.toml` comment claiming it existed solely for `mimetext` / `mime-types` was wrong and has been fixed.

**Step 2 — then ask whether the remaining wrapper earns its keep.** Everything it still adds over the raw SDK handler is already done by `worker.ts` before the handler is reached, does not apply to us, or is being removed:

| What the wrapper adds     | Our position                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| Route matching → 404      | `isRoutedPath()` in `worker.ts` already gates this                                       |
| CORS / `OPTIONS` handling | `isPreflight()` + `withCors()` in `auth/cors.ts` run first; ours is the origin allowlist |
| Origin validation         | Same — our allowlist is stricter and audited                                             |
| Host-header validation    | Only engages for localhost / `workers.dev`; we serve a custom domain                     |
| Legacy compatibility lane | **Being removed** per the no-backwards-compatibility directive                           |
| OAuth `props` plumbing    | We resolve auth ourselves and thread `AuthSuccess` through `handleAuthenticated`         |

Dropping to `@modelcontextprotocol/server` (which exports both `createMcpHandler` and `WebStandardStreamableHTTPServerTransport` directly) would additionally remove the only deadline in this analysis and leave one origin policy instead of two. Treat it as an optional second subtraction, not a precondition.

> **Re-entry trigger.** If the deferred **Tasks** work activates, long-running jobs on Workers genuinely want Durable Objects or Workflows — `agents`' actual competence. Leaning out of it now is reversible, and Tasks is the condition to reconsider.

### What we are _not_ rolling our own of

Worth stating so the question is not reopened: we do not implement MCP ourselves — the official SDK does the protocol. What `worker.ts` hand-rolls is the **request pipeline**: bearer/OAuth auth, the origin allowlist, Upstash sliding-window rate limits, the hash-chained audit log, per-`keyOwner` metrics. `agents` does not offer these and does not claim to; they are what makes this a governed service rather than a demo. That code is not a framework we failed to adopt.

---

## Gap disposition

Every delta in the [`2026-07-28` changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog), with a verdict. A delta we decline appears with its reason — a gap analysis that lists only work is not trustworthy.

| Delta                                                                    | SEP  | Verdict                        | Why                                                                                                                |
| ------------------------------------------------------------------------ | ---- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Sessions + `Mcp-Session-Id` removed                                      | 2567 | **No-op**                      | We hold no session state                                                                                           |
| `initialize` removed; `_meta` carries version + capabilities             | 2575 | **Migrate**                    | Handled by the v2 handler                                                                                          |
| `server/discover` RPC                                                    | 2575 | **Migrate**                    | Provided by the v2 server                                                                                          |
| `subscriptions/listen` replaces the GET stream and `resources/subscribe` | 2575 | **No-op**                      | No subscriptions, no GET stream                                                                                    |
| `ping`, `logging/setLevel`, `notifications/roots/list_changed` removed   | 2575 | **No-op**                      | None implemented                                                                                                   |
| MRTR replaces server-initiated requests                                  | 2322 | **Deferred (trigger)**         | No tool asks the client anything                                                                                   |
| `resultType` on all results                                              | 2322 | **Migrate**                    | Emitted by the v2 server                                                                                           |
| SSE resumability / `Last-Event-ID` removed                               | 2575 | **No-op**                      | Never relied on it                                                                                                 |
| Tasks → `io.modelcontextprotocol/tasks` extension                        | 2663 | **Deferred (trigger)**         | Real fit, no consumer                                                                                              |
| `Mcp-Method` / `Mcp-Name` request headers                                | 2243 | **Fix now + Migrate**          | CORS preflight is a live defect; header routing follows                                                            |
| `x-mcp-header` parameter mirroring                                       | 2243 | **Declined**                   | No tool parameter benefits                                                                                         |
| `ttlMs` / `cacheScope` on list + read results                            | 2549 | **Migrate**                    | Publishes a policy we already maintain privately                                                                   |
| Deterministic `tools/list` ordering                                      | —    | **No-op**                      | Already deterministic                                                                                              |
| Resource-not-found `-32002` → `-32602`                                   | —    | **No-op**                      | SDK already throws `InvalidParams`                                                                                 |
| Error-code allocation policy + renumbering                               | —    | **No-op**                      | Our one custom code sits in the grandfathered range                                                                |
| `extensions` field on capabilities                                       | —    | **No-op**                      | Nothing to advertise                                                                                               |
| OpenTelemetry trace context in `_meta`                                   | 414  | **Deferred**                   | Sentry + Analytics Engine cover today's needs                                                                      |
| Looser `inputSchema` / `outputSchema` keywords                           | 2106 | **No-op here**                 | Does not move [BL-092](BACKLOG.md#bl-092-mcp-server--declare-outputschema-on-the-tool-surface-candidate)'s blocker |
| RFC 9207 `iss` on authorization responses                                | 2468 | **Closed**                     | See below                                                                                                          |
| `application_type` in DCR                                                | 837  | **No-op**                      | DCR disabled                                                                                                       |
| Credentials bound to issuing authorization server                        | 2352 | **No-op**                      | Client-side requirement                                                                                            |
| `notifications/elicitation/complete` removed                             | —    | **No-op**                      | Never implemented                                                                                                  |
| **Roots, Sampling, Logging deprecated**                                  | 2577 | **Logging is a real exposure** | See below                                                                                                          |
| HTTP+SSE transport reclassified Deprecated                               | 2596 | **No-op**                      | Streamable HTTP only                                                                                               |
| `includeContext` values deprecated                                       | 2596 | **No-op**                      | Sampling unused                                                                                                    |
| DCR deprecated in favour of Client ID Metadata Documents                 | —    | **Already aligned**            | Pre-empted by ADR-0008                                                                                             |

---

## Free wins

The specification moved toward decisions this codebase had already made.

- **Roots, Sampling, elicitation and Tasks are unused** (grep-verified). Their deprecation or restructuring costs nothing.
- **DCR deprecation ratifies ADR-0008.** `mcp-server/src/oauth/provider.ts` omits `clientRegistrationEndpoint`; the spec has now formally deprecated DCR in favour of Client ID Metadata Documents. The stance needs no revision.
- **We are already structurally stateless** — `createServer(env, {...})` is called per request. The removal of protocol-level sessions asks nothing of us.

---

## Logging deprecation

**We do use Logging.** `mcp-server/src/server.ts` declares `{ capabilities: { logging: {} } }` so a tool handler can emit the 80%-consumed soft-limit warning as a `notifications/message` (`mcp-server/src/metrics/with-metrics.ts`); without the declared capability the SDK's `assertNotificationCapability` throws and a best-effort warning becomes a failed tool call. SEP-2577 deprecates the feature, which makes this load-bearing for **[ADR-0010](../adr/0010-per-client-rate-limit-tiers.md)**.

**Recommendation: keep it, and record the exit.** It survives migration — the deprecation window is at least twelve months, and nothing in the v2 path blocks a notification. The obvious alternative, folding the signal into the `RateLimit-*` headers we already emit, is _not_ a like-for-like swap: headers reach client code, the notification reaches the model's context. They serve different consumers, so collapsing them loses a signal rather than simplifying. Revisit when removal is actually scheduled.

---

## Confirmed defect

**The CORS preflight allowlist rejects the new spec's required headers.** `mcp-server/src/auth/cors.ts` allows `Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version`. Revision `2026-07-28` makes `Mcp-Method` and `Mcp-Name` REQUIRED on every Streamable HTTP POST, and adds optional `Mcp-Param-*` — which **cannot be allowlisted** (no wildcard-prefix form exists) and needs no allowlisting, since those headers appear only for tools declaring `x-mcp-header`, which we declined. A browser-based client on the new spec — the claude.ai / ChatGPT connector case the allowlist exists to serve — fails at the preflight before any MCP traffic flows.

Independent of the migration, and worth fixing regardless: it costs hours and its absence is invisible until a real client hits it.

---

## Investigated and dismissed

Negative results, recorded so they are not re-derived.

- **Resource-not-found error code.** Already correct — SDK v1.30.0 throws `InvalidParams` (`-32602`). The only `-32002` in our tree is `MissingScopeError.CODE` in `mcp-server/src/auth/scopes.ts`, whose comment records a deliberate contract to keep it stable. "Fixing" it would break an unrelated promise.
- **`tools/list` ordering.** Already deterministic — insertion order over the fixed registration sequence.
- **Per-client identity telemetry.** `keyOwner` is already a first-class metric field (`mcp-server/src/metrics/_schema.ts`), stamped `OAUTH:<owner>` for grants and from the `MCP_KEY_*` suffix otherwise. Capturing the new `clientInfo` would add only client software and version.
- **RFC 9207 `iss`.** Defends against authorization-server mix-up, which requires a third-party OAuth client; none are provisioned, and `@cloudflare/workers-oauth-provider` never advertises `authorization_response_iss_parameter_supported`, so a strict client sees the parameter as unsupported rather than being misled. Fixing it needs an upstream PR or a fork. **Closed, not deferred** — BL-093's onboarding gate already covers the only condition that would revive it.
- **Looser schema keywords (SEP-2106) do not unblock BL-092.** BL-092's blocker is that the SDK client validates `structuredContent` whenever present with no `isError` guard, colliding with ADR-0011's invariant that error results also carry it. That is a validation-trigger problem, not a keyword-strictness one.

---

## What implementation overturned

Five conclusions in the analysis above did not survive contact with the code. They are corrected in place, and listed together here because a gap analysis whose errors are quietly edited out teaches nothing about how much to trust the next one.

| Claim                                                     | What was actually true                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add `Mcp-Param-*` to the CORS allowlist                   | **Impossible and unnecessary.** CORS has no wildcard-prefix form for `Allow-Headers`; and the headers only exist for tools declaring `x-mcp-header`, which we declined                                                                                                                              |
| Narrowing/dropping `agents` likely frees `nodejs_compat`  | **It cannot.** The stateless handler imports `node:async_hooks` at module top for its auth-context `AsyncLocalStorage`. Reported to the operator in an exec summary before being caught                                                                                                             |
| Replace the body-parse tool-name dispatch with `Mcp-Name` | **A rate-limit bypass.** Base64-sentinel header values decode SDK-side but not in a naive read, letting an encoded `search_radar` escape the radar tier. (The originally-filed rationale — "declare one tool, send another" — was _also_ wrong: the SDK rejects that with `-32020` before dispatch) |
| Keep `agents` because it owns the origin/host gate        | **Empty reason.** After `allowedOriginHostnames: '*'` the gate never runs, and host validation no-ops on a custom domain. The decision stands on scope discipline and the supported-seam argument instead                                                                                           |
| Modern-only on both transports                            | **Wrong for stdio.** The git-tracked `.mcp.json` makes stdio's client population real and unverifiable, so Directive 6's active-client rule applies there but not to the Worker                                                                                                                     |

Two further things were discovered rather than corrected, and neither was in the plan:

- **The v2 handler runs its own origin gate**, defaulting to the localhost trio — which on a custom domain answers **403** to every `Origin: https://claude.ai` request. This would have broken exactly the browser clients the CORS fix was written to serve, and no existing test would have caught it. It is the single most consequential finding of the implementation.
- **`with-metrics.ts` located the notifier by duck-typing** on a field v2 renamed, and `maybeWarnSoftLimit` is contractually non-throwing — so the rate-limit warning would have died silently, with the soft-limit tests staying green against their own v1-shaped fake.

## Positions considered and dropped

Recorded because both are tempting shapes that cost real time before being discarded.

1. **"Instrument first, then decide when to migrate."** Rested on the premise that we needed to learn whether clients still fall back to `initialize`. Withdrawn: the deadline comes from the `agents` deprecation, not from client behaviour, and the v2 handler's `era` discriminator would supply that signal as a byproduct of migrating anyway.
2. **"Keep a legacy compatibility lane."** Withdrawn by operator directive — no external clients exist. The only MCP RPC consumers are the team's own third-party LLM clients, so the cost of being wrong is a same-day rollback, not an incident. Retaining the lane would preserve the `agents` dependency and the duplicated CORS layer for no one.

---

## Business value

- **Header-based routing.** `Mcp-Method` / `Mcp-Name` let Cloudflare rules meter and route per tool without parsing a JSON body, moving enforcement to the edge — the thing a metered product built on [ADR-0010](../adr/0010-per-client-rate-limit-tiers.md)'s tiers eventually needs. ~~Modern-only makes this a straight swap: read the header, delete the body clone and JSON parse.~~ **Corrected in implementation: the body parse stays.** `Mcp-Name` may carry a base64 sentinel the SDK decodes but a naive read would not, so an encoded `search_radar` would escape the stricter radar rate-limit tier. The edge-metering value is real; replacing the in-Worker gate is not part of it.
- **`ttlMs` / `cacheScope`.** `RESOURCE_TTL_SECONDS` in `mcp-server/src/cache/resource-cache.ts` already encodes per-family freshness; today it is invisible to clients, so they re-poll on their own schedule. Publishing it costs a field per result. See [ARCHITECTURE.md § Server-side resource caching](../../../mcp-server/src/docs/ARCHITECTURE.md#server-side-resource-caching).
- **Maintainability.** The legacy lane, the duck-typed notifier scan, the v1 `.shape` workarounds and a dead TTL constant all went. `agents`, the body-parse dispatch and `nodejs_compat` all **stayed** — for the reasons in § What implementation overturned — so this was a smaller net deletion than projected.
- **Tasks and MRTR are capability, not leverage.** Genuinely useful — Tasks for the long-running `compose_dossier_envelope` and XLSX paths, MRTR for mid-call clarification — but neither has a consumer. Building them now repeats the pattern [BL-093](BACKLOG.md#bl-093-mcp-server--commercialization-phase-4) was deferred for on 2026-08-02.

---

## Timing

The specification imposes no deadline: sessions and `initialize` were **removed in this revision** rather than deprecated, and the features deprecated here sit behind a twelve-month minimum window — attributed to SEP-2577 in the installed type declarations, so earliest removal is a Current revision on or after **2027-07-28**.

With no external clients there is no coordination cost and nothing to sequence around. **Migrate now**: it retires the `agents` deadline rather than managing it, and every week on the v1 path is a week the deprecation warning fires on every request.

---

## Open questions

- ~~**Q1 — Does narrowing to `agents/mcp/server` free `nodejs_compat`?**~~ **Answered: no.** `handler-stateless-*.js` imports `node:async_hooks` at module top. The flag stays and `wrangler.toml` now says why.
- **Q2 — Is `getMcpAuthContext` worth adopting, or is it redundant?** It is the other half of what `agents/mcp/server` exports. We resolve auth ourselves and thread `AuthSuccess` through `handleAuthenticated`, and `mcp-server/src/oauth/api-handler.ts` re-enters that same pipeline — so this is expected to be redundant rather than useful. It is the one integration point the wrapper touches that we have not exercised, and it decides whether step 2 (dropping to the raw SDK) is clean or fiddly.

---

## Out of scope

- **The stdio entrypoint.** `mcp-server/src/index.ts` uses the v1 `StdioServerTransport`. Whether it migrates with the Worker is a migration-time call; team usage is remote.
- **`mcp-server/BREAKING_CHANGES.md`.** No wire behaviour changes until the migration lands, and the no-external-clients directive follows the BL-076 precedent for handling them when it does.
- **ADR authorship.** This document proposes; it decides nothing. The migration decision — the `agents` question, and the ADR-0010 logging exit — is what earns an ADR, written at that point.
