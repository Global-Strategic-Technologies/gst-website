# ADR-0041: Radar is an explicit scope, and `tools/call` enforces tool scopes

- **Status**: Accepted (2026-09-27, `mcp-server` 0.67.0)
- **Source initiative**: BL-166 (filed from BL-155's design review; the review is in the [archived BL-155 design doc](../development/_archive/SELF_SERVE_TRIAL_BL-155.md) § Slice 2). Closed and pruned 2026-09-27; see the [BACKLOG](../development/BACKLOG.md) header ledger

## Context

The scope catalog (`mcp-server/src/auth/scopes.ts`), the provisioning script's `--allow-radar` flag, BL-033's per-tool AC and the public `/hub/mcp` copy all said that radar is granted separately, and that a client granted `tool:search_portfolio` gets exactly that tool. None of it was enforced:

- **No `tools/call` path checked a tool scope.** The only scope checks guarded the radar Resource (`resources/radar.ts`), `/radar/snapshot` (`pipeline/handle-authenticated.ts`) and, by tier rather than scope, the trial radar deny (`pipeline/tier-gate.ts`, [ADR-0008](0008-mcp-oauth-embedded-authorization-server.md) amendment).
- **`hasScope` matched by prefix**, so the `tool:*` in every default grant (`DEFAULT_SCOPES`, the script's `MINIMUM_SCOPES`) covered `tool:radar:*`. A pilot provisioned without `--allow-radar` could still call `search_radar` and `get_latest_insights`.
- **Grant-time escalation.** A `tool:*` holder that _asked_ for `tool:radar:*` at consent (`oauth/consent.ts`) or at `/token` (`oauth/m2m-token.ts`) was granted it, because both filter requested scopes through `hasScope`. That included trials.
- **Two leaks around the trial gate.** A JSON-RPC batch array skipped the tier gate and the radar rate bucket, because `extractToolCall` read only single objects and the SDK's legacy lane accepts batches. And the `gst_radar_brief_today` prompt embedded the radar snapshot without a scope check, so a trial could read radar through `prompts/get`.

The operator decided (2026-09-27) that radar becomes an explicit scope, which `tool:*` stops covering, and that **every existing client keeps radar** while new clients start without it. The team roster and the latency probe keep radar by default.

One constraint shaped the migration: **an OAuth auth-code grant keeps the scopes it was given at consent.** Consent writes `props.scopes` once and the API handler builds `auth` from them. Props are encrypted per token, so no script can rewrite them. M2M JWTs carry the scopes of their `/token` mint and live at most 1h. KV client records can be listed and patched through the admin API.

## Decision

**1. The carve-out in `hasScope`.** A wildcard does not reach into an _explicit namespace_ unless the wildcard itself sits inside that namespace. The list is `EXPLICIT_NAMESPACES = ['tool:radar:']`:

- `tool:*` no longer covers `tool:radar:search_radar` or `tool:radar:*`;
- `tool:radar:*` still covers `tool:radar:<name>`, and exact strings still match;
- `tool:*` still covers every other tool.

Because consent and `/token` filter requested scopes through `hasScope`, the carve-out closes the grant-time escalation with no change at those call sites. `tool:radar:*` joins `DEFAULT_SCOPES`, so static keys with no `_SCOPES` override (the team roster and the latency probe) keep radar. `TRIAL_SCOPES` excludes both radar scopes, and `SCOPES_SUPPORTED` keeps the same members in the same order.

**2. Two gates at the boundary, the first unchanged.** Both run in `pipeline/handle-authenticated.ts` before the rate limiter, so a refusal consumes no window and starts no stream, and both answer HTTP 200 with JSON-RPC `-32002` (`MissingScopeError`).

- **The tier gate runs first and keeps its code.** `trialRadarDenial` still refuses every trial-tier call to a radar tool and still emits `tier_denial`. It stays because legacy trial grants and trial M2M tokens can already _hold_ `tool:radar:*`: old prefix matching granted it to a trial that asked, and PRM `scopes_supported` advertises it. The scope gate alone would let those through. Only the gate's header comment changed, since "a scope exclusion cannot do this" stopped being true.
- **The tool-scope gate runs second** (`pipeline/tool-scope-gate.ts`, `toolScopeDenial`). A call needs `tool:radar:<name>` for a tool in `RADAR_TOOLS` (`dispatch/extract-tool-name.ts`) and `tool:<name>` for every other tool. `data.missingScope` names the grant to ask for: `tool:radar:*` for radar, `tool:<name>` otherwise. A narrow client calling an unknown tool name gets `-32002 tool:<name>` rather than the SDK's unknown-tool error, which is harmless. A refusal logs `safeLog` `tool.scope-denied` and emits **no** Analytics Engine event, so `tier_denial` keeps its exact trial-radar meaning and `scope_denial` stays the 403 attack signal behind the `scope-mismatch-403-rate` paging alert.

**3. The grant marker, for OAuth grants.** New consents stamp `scopeModel: 2` (`SCOPE_MODEL`) into the grant props. `oauth/api-handler.ts` builds `auth.scopes` through `effectiveScopes(scopes, { scopeModel, tier })`: a marked grant is used as stored, and an **unmarked** grant is a pre-0.67.0 artifact that gets `tool:radar:*` added when it holds `tool:*` and its tier is not `trial`. So every legacy grant keeps exactly the tool access it was consented with, from the first request after deploy, with no gap. **The marker's lifetime:** the rule is permanent for as long as unmarked grants live. An unmarked grant ends only when it is revoked or replaced by a new consent (which revokes prior grants per user and client), so the `effectiveScopes` branch is not removable on a date.

**4. A script, for KV records.** `mcp-server/scripts/migrate-radar-scope.mjs` (`npm run radar:migrate-scope`) lists every M2M record and patches each non-trial record that holds `tool:*` and lacks `tool:radar:*`. It is a dry run by default and `--apply` patches; a second run is a no-op. It lists, without patching, non-trial records with no `tool:*` (they never covered radar) and records holding an off-catalog scope, which `PATCH` would refuse because it validates the whole array. Converted trials (tier `paid`, `TRIAL_SCOPES`) reach radar today, so they are patched and listed in their own group. The admin key comes from `MCP_ADMIN_KEY`, never a flag. **M2M tokens get no marker**: they live at most 1h and are re-minted from the record, so running the script at least 1h before approving the production deploy means every live token of a client that sends no `scope` already carries `tool:radar:*`. Running it early is harmless, because under the old code `tool:*` already covered `tool:radar:*`. The procedure is [DEPLOY.md § C.7](../../../mcp-server/src/docs/operations/DEPLOY.md#c7--migrate-client-records).

**5. Batches carrying `tools/call` are rejected.** `inspectToolCalls` reports a batch array that holds any `tools/call`, and the pipeline answers HTTP 400 with JSON-RPC `-32600` "JSON-RPC batches may not contain tools/call", the SDK's own error shape, before either gate. It logs `safeLog` `mcp.batch-rejected`. Batches with no `tools/call` pass through. Batching left the spec in 2025-06-18 and the official client SDKs do not emit it. Today's telemetry cannot tell whether any client batches, so the log line is how a real one would show up, and the rollback is reverting this one check.

**6. The radar prompt embed is scope-gated.** On the Worker path the prompt registry gets the radar reader only when the caller holds `resource:radar:read`; otherwise the embed carries `RADAR_NOT_GRANTED_REMOTE`. The prompt template bytes do not change, so no prompt version moves.

**Rejected:**

- **A tier deny as the mechanism for pilots (BL-166 option b)**, extending `trialRadarDenial` to each tier that must not get radar. It ties radar access to tier rather than to the client's grant, so a pilot that should have radar and one that should not could not share a tier, and it leaves per-tool narrowing (`tool:search_portfolio`) unenforced. The trial's tier deny is kept for the legacy-grant reason above, not as the model.
- **A `createdAt` cutoff** (clients created before the deploy keep radar). `createdAt` is on the KV record, not on the grant props or the M2M token the request path reads, so enforcing it would put a KV read on every call. It would also be a rule about a date that lives in code forever and says nothing about what a record holds, while records are patched in place. The script makes each record say what it means, and the marker does the same for grants.
- **Filtering `tools/list`** by scope. It changes the published tool counts and every parity guard bound to them, and a client that cannot see a tool gets a less useful answer than a clear `-32002` naming the scope to ask for. KISS: the list stays unfiltered.
- **Forced re-consent** for every OAuth grant. It breaks every connector user's session to fix a problem the read-time marker fixes invisibly, and the operator's decision was that existing clients keep radar, not that they re-grant it.
- **Rewriting legacy props via `newProps` on refresh** (`tokenExchangeCallback`). It reaches a grant only when it next refreshes, so a non-trial access token would lose radar between deploy and that refresh. It also breaks the callback's pinned invariant that non-trial grants exit at its first line. The read-time marker has neither problem.

## Consequences

- **Introspection reports stored scopes, not effective ones.** `POST /oauth/introspect` returns the scopes captured at consent, so an unmarked legacy grant introspects without the `tool:radar:*` that `effectiveScopes` adds at request time. [AUTH.md § Introspect a token](../../../mcp-server/src/docs/operations/AUTH.md#introspect-a-token-supportdebugging) says so.
- **Accepted residual, M2M clients that send an explicit `scope`.** A client that sends, say, `scope=tool:*` without `tool:radar:*` loses radar at deploy until it adds `tool:radar:*` to its request. Nothing logs the requested scope, so these clients cannot be found in advance; `mcp-server/BREAKING_CHANGES.md` carries the client-impact line, and `tool.scope-denied` is where they surface.
- **Static keys with a `_SCOPES` override** get exactly the override; the legacy rule does not cover them. The rollout checks every override before the push. `MCP_KEY_WEBSITE_RADAR` (`resource:radar:read` only) is now refused tools, which is intended: it only calls `/radar/snapshot`.
- **A trial converted to `paid` does not gain radar.** Its `allowedScopes` is `TRIAL_SCOPES`, so the conversion PATCH must add `tool:radar:*` if radar is wanted ([AUTH.md](../../../mcp-server/src/docs/operations/AUTH.md)).
- **Leak detection for tools is a log line, not a page.** A leaked `resource:radar:read` key calling tools now surfaces as `tool.scope-denied`, not a 403; the `scope-mismatch-403-rate` runbook says so.
- **Rollback stays safe.** Old code ignores `scopeModel`, and under old prefix semantics a migrated record's extra `tool:radar:*` changes nothing.
- **The public copy became true.** `/hub/mcp`'s "granted separately" claim now holds, and the trial page counts the tools a trial can call (registered remote tools minus `RADAR_TOOLS`, "fourteen"), pinned by `tests/integration/mcp-trial-parity.test.ts`.
- **Revisit** if a second namespace needs the same treatment (add it to `EXPLICIT_NAMESPACES`, with its own migration), or if a client needs refusal counts, which would justify an Analytics Engine dimension for `tool.scope-denied`.
- **Code that cites this ADR:**
  - `mcp-server/src/auth/scopes.ts` (`EXPLICIT_NAMESPACES`, `hasScope`, `SCOPE_MODEL`, `effectiveScopes`)
  - `mcp-server/src/pipeline/tool-scope-gate.ts`, `mcp-server/src/pipeline/tier-gate.ts`, `mcp-server/src/pipeline/handle-authenticated.ts`
  - `mcp-server/src/dispatch/extract-tool-name.ts` (`inspectToolCalls`)
  - `mcp-server/src/oauth/consent.ts`, `mcp-server/src/oauth/api-handler.ts`
  - `mcp-server/scripts/migrate-radar-scope.mjs`
- **Docs:** [AUTH.md](../../../mcp-server/src/docs/operations/AUTH.md), [ARCHITECTURE.md § Scope gating](../../../mcp-server/src/docs/ARCHITECTURE.md#scope-gating), [PILOT_ONBOARDING.md](../../../mcp-server/src/docs/operations/PILOT_ONBOARDING.md), [DEPLOY.md § C.7](../../../mcp-server/src/docs/operations/DEPLOY.md#c7--migrate-client-records), the radar [CONTRACT.md](../../../mcp-server/src/docs/tools/radar/CONTRACT.md#authorization-bl-166).
