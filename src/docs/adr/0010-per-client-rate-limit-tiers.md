# ADR-0010: Per-client rate-limit tiers carried in the token claim; soft-limit warnings over the SSE notification channel

- **Status**: Accepted 2026-07-26 (0.41.0)
- **Source initiative**: BL-033 External Pilot (Phase 3), Slice 5 — the "Rate limiting (per-client, contractual)" AC block ([BACKLOG.md § BL-033](../development/BACKLOG.md#bl-033-mcp-server--external-pilot-phase-3)). Builds on [ADR-0008](0008-mcp-oauth-embedded-authorization-server.md) (self-contained M2M tokens) and [ADR-0006](0006-inoreader-zone1-budget-protection.md) (Inoreader Zone-1 budget / circuit breaker).

## Context

The sliding-window per-client limiter shipped in BL-032 Phase 3 + BL-038 and enforces in production, but with **flat, hardcoded ceilings** (`mcp-server/src/ratelimit/limiter.ts` — 60/min, 1000/day general; 5/min, 50/day radar). BL-033 requires the ceilings to vary **per client tier**. The tier (`free-pilot` / `paid` / `enterprise`) was already stored on the M2M client record (`mcp-server/src/oauth/m2m-clients.ts`, in Cloudflare KV) but was **inert** — never read on the enforcement path. Two decisions had non-obvious rejected alternatives worth recording.

Ceilings here are **capability/abuse config, not ratified SLA quotas** (BL-033 operator directive: build capability, don't ratify SLA numbers). The numbers are tunable defaults, not contractual commitments.

## Decision

### 1. The tier travels IN the self-contained token claim — not re-fetched from KV at the limiter

The M2M access token (`M2mTokenClaims`, `mcp-server/src/oauth/m2m-token.ts`) gains a `tier` claim, minted from `record.tier` at token issuance and surfaced onto `AuthSuccess.tier` (`mcp-server/src/auth/bearer.ts`). The request boundary resolves it to ceilings via `resolveTierLimits(auth.tier)` (`mcp-server/src/ratelimit/tiers.ts`) and passes them to `createLimiter(env, limits)`.

**Rejected: re-fetch the client record from KV at the limiter to read `tier`.** That reintroduces exactly the ~60s cross-colo eventual-consistency hazard that ADR-0008 eliminated by making M2M tokens self-contained — a KV read on the hot path, on every request, for a value that is already cryptographically bound into the token. The token is the authoritative carrier of the client's grant; tier belongs there with scope and keyOwner.

**No-regression default.** Static `MCP_KEY_*` team keys and the OAuth human-consent path carry no tier (`AuthSuccess.tier === undefined`); `resolveTierLimits(undefined)` returns `INTERNAL_TIER`, which equals the pre-Slice-5 constants bit-for-bit (60/1000/5/50). Unknown tier strings (operator misconfiguration) also fail generous to `INTERNAL_TIER` and log once. A legacy ≤1h M2M token minted before this shipped has no `tier` claim → resolves to `internal` and self-heals on the next re-exchange.

### 2. The 80%-consumed soft-limit warning is an MCP `notifications/message` over the request's SSE stream — best-effort, with headers as the guaranteed fallback

At ≤20% remaining in any bucket (`CheckResult.minRemainingRatio`), the tool-metrics wrapper (`mcp-server/src/metrics/with-metrics.ts`) emits a `notifications/message` (level `warning`, logger `ratelimit`) via `extra.sendNotification`, so a compliant agent can throttle itself before the hard 429.

Transport analysis that made this feasible (verified against the installed `agents` + `@modelcontextprotocol/sdk` packages):

- `createMcpHandler` passes no transport options, so the SDK's `enableJsonResponse` stays off and **every `tools/call` POST is answered with `text/event-stream`** (`webStandardStreamableHttp.js:464`). A spec-compliant MCP client MUST accept SSE, so the notification channel exists on the same response.
- A request handler's `extra.sendNotification` routes onto that request's own stream via `relatedRequestId` (`protocol.js:322-326`).
- The server MUST declare the `logging` capability or `notifications/message` throws `"Server does not support logging"` (`server/index.js:173-177`) — so `createServer` now constructs `new McpServer(info, { capabilities: { logging: {} } })`.

**Best-effort by design.** A client that sends the mandatory `Accept` header but only parses the terminal `result` frame ignores interim notifications; delivery can also no-op on an aborted request. That is acceptable because the **always-present `RateLimit-*` + `RateLimit-Policy` headers on every authenticated response (200 and 429)** are the transport-agnostic, guaranteed throttle signal. The emit is wrapped so a missing capability, non-SSE consumer, or rejected send is a visibility loss, never a tool-call failure.

**Rejected: emit at the Worker boundary.** The rate-limit gate runs before `createMcpHandler` builds the server, so there is no MCP server/notification channel there — the emit must live at the tool wrapper, which owns the per-request `extra`.

### Radar ceilings — decoupled from the Inoreader budget

Per-client radar caps are **per-client fairness + thin cache-cold defense-in-depth**, NOT the Inoreader-budget control. Radar tool calls are ~99% Upstash cache hits (zero Inoreader spend); only a cold/expired-cache miss falls through to a live fetch (`mcp-server/src/content/radar-live-store.ts`), and the global **circuit breaker** (ADR-0006) — wired into the radar tool path — is the real upstream-budget guard.

## Consequences

- **Cites this ADR**: `mcp-server/src/ratelimit/tiers.ts`, `limiter.ts`, `mcp-server/src/oauth/m2m-token.ts`, `mcp-server/src/metrics/with-metrics.ts`, `mcp-server/src/docs/operations/RATE_LIMITS.md`, `mcp-server/src/docs/ARCHITECTURE.md § Rate limiting & Inoreader budget`.
- **AC-1 deviation (recorded)**: the AC says tier is "stored in Redis"; it is actually stored in **Cloudflare KV** (the M2M record's substrate per ADR-0008). The limiter counters remain in Upstash Redis.
- **Tuning**: ceilings live in `TIER_LIMITS` (`tiers.ts`); change + redeploy. They are tunable, non-contractual — do not publish as SLA quotas.
- **Tier change semantics**: a client whose tier changes reuses the same Redis limiter keys; the new ceiling applies on the next window evaluation (no key migration).
- **Enforcement testing**: tier-ceiling enforcement (like the base limiter) is validated against staging Upstash, not in CI (no live Redis in unit runs); unit tests pin the tier config, the `minRemainingRatio` signal, the header/claim shapes, and the soft-limit emit contract.
- **Revisit triggers**: a pilot contracting a genuinely committed rate SLA (promotes ceilings from capability config to a ratified quota — out of scope per directive); a client requiring guaranteed (not best-effort) soft-limit delivery (would need an ack'd backpressure channel the MCP spec doesn't define today); per-tool (vs per-tool-class) ceilings if a single tool needs independent budgeting.

## Amendment — 2026-08-04 (BL-106): the soft-limit channel now rides a deprecated feature

The 80%-consumed soft-limit warning is a `notifications/message`, which requires the MCP **Logging** capability. Protocol revision `2026-07-28` **deprecates Logging** (SEP-2577), under a twelve-month floor — so this decision's in-band signal is on a clock we do not control.

[ADR-0013](0013-mcp-2026-07-28-modern-only-worker.md) decision 5 keeps it, and the reasoning is worth restating here because it is this ADR's channel that is at stake: folding the signal into the `RateLimit-*` response headers is **not** a like-for-like swap. Headers reach client _code_; the notification reaches the _model's context_. Collapsing them removes a signal rather than a concept, so the header fallback this ADR already documents does not make the notification redundant.

Verified survivable on the SDK v2 path — the compat adapter intercepts only JSON-RPC requests, so notifications pass through unaltered. Two implementation notes from BL-106: the notifier moved from v1's flat `extra.sendNotification` to `ctx.mcpReq.notify`, and locating it by duck-typing would have failed **silently** (the emit is contractually non-throwing), so `with-metrics.ts` now derives its view from the SDK's own `ServerContext` type and a rename is a compile error.

**Revisit trigger** (in addition to those above): SEP-2577's Logging removal moves from deprecated to scheduled — at which point the choice is the `RateLimit-*` headers, an ack'd backpressure channel if the spec defines one by then, or dropping the in-band warning.
