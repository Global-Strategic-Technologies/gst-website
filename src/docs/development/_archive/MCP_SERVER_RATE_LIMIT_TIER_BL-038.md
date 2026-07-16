# MCP Server — Radar Rate-Limit Tier (BL-038)

> **Backlog initiative**: [BL-038: MCP Server — Radar Rate-Limit Tier (5/min, 50/day)](BACKLOG.md#bl-038-mcp-server--radar-rate-limit-tier-5min-50day)
>
> **Companion docs**:
>
> - [`mcp-server/src/docs/operations/RATE_LIMITS.md`](../../../mcp-server/src/docs/operations/RATE_LIMITS.md) — consumer- and operator-facing rate-limit reference. The "Phase 4 — radar-tier activation" stanza (line 160) is the doc-claim this initiative makes true.
> - [MCP_SERVER_REMOTE_BL-032.md](MCP_SERVER_REMOTE_BL-032.md) § Phase 3 (limiter substrate) and § Phase 4c (radar-live tools). The substrate this initiative extends.
> - [MCP_SERVER_ARCHITECTURE_BL-031.md](MCP_SERVER_ARCHITECTURE_BL-031.md) — overall MCP architecture and Worker dispatch lifecycle.
> - [BL-032.7 circuit-breaker stanza](BACKLOG.md#bl-0327) — the adjacent Inoreader-budget defense layer; composes with (does not replace) the per-key radar tier.
> - [BL-041: Upstash ACL hardening](BACKLOG.md#bl-041) — **verified 2026-05-31 truth-pass against `mcp-server/src/docs/operations/DEPLOY.md § A.3.5` final ACL strings**: PR #186/#187 shipped `ACL SETUSER mcp-worker-rw on ~mcp:* ~"" +@read +@write +@scripting -@dangerous`; the `~mcp:*` glob covers the new `mcp:ratelimit:radar:*` prefix without ACL changes.
>
> **Predecessors**: BL-032 Phase 3 (sliding-window limiter substrate), BL-032 Phase 4c (`search_radar` / `get_latest_insights` shipped), BL-041 (ACL keyspace confirmed).
>
> **Sequels**: none planned. A future per-tier observability dashboard (under BL-032.75 follow-up) would consume the new `mcp:ratelimit:radar:*` keys without further code change.
>
> **Scope**: add a second pair of `Ratelimit` instances (5/60s and 50/1d) keyed under `mcp:ratelimit:radar:*` for the two radar tools (`search_radar`, `get_latest_insights`); generalize `chooseBindingTier` from 2 buckets to 4; route the Worker's tool-dispatch through a `toolClass: 'general' | 'radar'` selector; extend the 429 envelope with two new `reason` values. Single PR, additive, no architectural change.
>
> **Status**: Open · documentation-ahead-of-code gap. Surfaced in BL-032 soak T.C.6 (2026-05-11) when Upstash key inspection found zero `mcp:ratelimit:radar:*` keys despite ~12 radar calls during the soak window — proving the radar tier never shipped with Phase 4 despite [`limiter.ts:6`](../../../mcp-server/src/ratelimit/limiter.ts#L6) and [`RATE_LIMITS.md:162`](../../../mcp-server/src/docs/operations/RATE_LIMITS.md#L162) both claiming otherwise.

---

## Context — why this earns an initiative

The MCP server today protects the shared Inoreader 200 req/day budget through three layers:

1. **Per-key general limiter** (60/min, 1000/day sliding window, Upstash-backed) — applies to every authenticated call.
2. **6-hour Upstash cache** on the radar payload — first call within a window is cold; rest are cache hits and do not touch Inoreader.
3. **Global circuit breaker** (BL-032.7 substrate, 6h TTL) — flips closed when Inoreader returns 429, fail-closes radar tools across all keys.

In the common case the cache absorbs nearly all upstream pressure: 60 `search_radar` calls in one minute against a warm cache cost zero Inoreader sub-calls. But the cache-miss-aligned worst case is non-trivial. Immediately after a cache TTL roll, or right after the circuit breaker auto-resets, every radar call is cold. Sixty cold radar calls per minute would exhaust the entire Inoreader 200/day budget in roughly 3.3 minutes — and the only thing standing in the way is the cache TTL boundary, which is not a security control.

The original BL-032 design recognized this and called for a stricter parallel bucket for radar tools (5 requests/minute, 50/day per key). The bucket was documented in two places — the `limiter.ts` module header and the operator-facing `RATE_LIMITS.md` table — but the actual `Ratelimit` instances and the `toolClass` dispatch logic never landed. T.C.6 caught the gap during the BL-032.5 soak: Upstash inspection showed all rate-limit traffic was flowing through `mcp:ratelimit:gen:*` keys, with zero hits on `mcp:ratelimit:radar:*` despite a dozen radar tool invocations.

This initiative is a small, well-scoped fix to close the documentation-vs-code drift. It is **half a day of engineering** and ships defense-in-depth on a budget we already pay for upstream.

---

## Decisions

| Decision                                                         | Choice                                                                                                                                                                                                                                              | Rationale                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Algorithm**                                                    | `Ratelimit.slidingWindow(5, '60 s')` + `Ratelimit.slidingWindow(50, '1 d')`                                                                                                                                                                         | Matches the existing general buckets in [`limiter.ts:84-96`](../../../mcp-server/src/ratelimit/limiter.ts#L84). No new library research needed — same `@upstash/ratelimit` v2 usage pattern.                      |
| **Key prefix**                                                   | `mcp:ratelimit:radar:min`, `mcp:ratelimit:radar:day`                                                                                                                                                                                                | Mirrors the existing `mcp:ratelimit:gen:min` / `:gen:day` shape. Inside the `~mcp:*` keyspace already granted to the `mcp-worker-rw` Upstash user (BL-041 ACL audit) — no Upstash console changes.                |
| **`toolClass` enum**                                             | `'general' \| 'radar'` (string literal union, not an enum)                                                                                                                                                                                          | Forward-compatible: a third class (`'expensive'`, `'mutation'`) can be added without churning the type. String literal union over TS enum because the codebase already prefers unions (e.g., `CheckResult.tier`). |
| **Cron-path coverage**                                           | **Excluded from the radar tier.** The `refreshRadarSnapshot` Cron path has its own budget protection (BL-032.5 Phase 4 hourly Cron caps at ~24 Inoreader calls/day, hard-coded in the Cron handler) and does not flow through the per-key dispatch. | Adding a Cron-path bucket would conflate two enforcement domains. The Cron is a single trusted actor; per-key buckets are for untrusted callers.                                                                  |
| **429 envelope `reason` values**                                 | Add `radar-rate-limit-per-minute` and `radar-rate-limit-per-day`. Existing values (`bearer-rejected`, `rate-limit` w/ `tier: minute/day`) unchanged.                                                                                                | Lets agents distinguish "slow my radar polling" from "slow everything." Required by BL-038 AC.                                                                                                                    |
| **Day-counter interaction (BL-032.7)**                           | A radar-tier denial returns 429 **before** the Worker dispatches to the radar tool, so the day-counter (which increments inside the Inoreader client) does NOT increment for a denied call.                                                         | Correct semantics: the day-counter tracks actual Inoreader cost, not denied attempts. Document explicitly.                                                                                                        |
| **`toolClass` lives at dispatch site, not on tool registration** | The Worker keeps a `radarTools = new Set([...])` lookup and computes `toolClass` per-request. Tool-registry objects do NOT gain a `class` field.                                                                                                    | See Open Questions § 1 for the forward-compat trade-off. Short answer: dispatch-site lookup is O(1), one place to update, no registry-shape churn.                                                                |

---

## Implementation design

### 1. Two new `Ratelimit` instances in `createLimiter()`

Add to [`mcp-server/src/ratelimit/limiter.ts`](../../../mcp-server/src/ratelimit/limiter.ts) alongside the existing `perMinute` / `perDay`:

```ts
const PERRADARMINUTE_LIMIT = 5;
const PERRADARDAY_LIMIT = 50;

// ... inside createLimiter(env):
const perRadarMinute = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(PERRADARMINUTE_LIMIT, '60 s'),
  prefix: `${KEY_PREFIX}:radar:min`,
  analytics: false,
});

const perRadarDay = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(PERRADARDAY_LIMIT, '1 d'),
  prefix: `${KEY_PREFIX}:radar:day`,
  analytics: false,
});
```

### 2. `Limiter.check()` signature change

```ts
export interface Limiter {
  check: (keyOwner: string, toolClass: 'general' | 'radar') => Promise<CheckResult>;
}
```

When `toolClass === 'general'`: run the two general buckets only (current behavior).
When `toolClass === 'radar'`: run **all four** buckets in parallel (general AND radar — radar tools count against both, per the additivity contract already stated in `RATE_LIMITS.md:164`).

```ts
async check(keyOwner, toolClass) {
  if (toolClass === 'general') {
    const [minRes, dayRes] = await Promise.all([
      perMinute.limit(keyOwner),
      perDay.limit(keyOwner),
    ]);
    return chooseBindingTier(minRes, dayRes);
  }
  // toolClass === 'radar'
  const [minRes, dayRes, radarMinRes, radarDayRes] = await Promise.all([
    perMinute.limit(keyOwner),
    perDay.limit(keyOwner),
    perRadarMinute.limit(keyOwner),
    perRadarDay.limit(keyOwner),
  ]);
  return chooseBindingTier4(minRes, dayRes, radarMinRes, radarDayRes);
}
```

### 3. `chooseBindingTier4` — generalized priority

`CheckResult.tier` extends from `'minute' | 'day'` to `'minute' | 'day' | 'radar-minute' | 'radar-day'`.

Priority rules (deny-first, generalized from the existing 2-bucket logic):

1. **If any bucket denied**: return the denied envelope whose `reset` is **latest** (longest Retry-After). Among the tied buckets, prefer day-class over minute-class. This matches the existing logic's "both denied → return day" behavior, generalized.
2. **If all passed**: return the envelope with **fewest `remaining`** tokens. Tie-break order: `minute` > `radar-minute` > `day` > `radar-day` (closest-cliff window first), so consumers see the most urgent backoff signal.

The existing 2-bucket `chooseBindingTier` stays as a wrapper / unit-test surface; `chooseBindingTier4` is a new exported pure function. Both call into a shared internal helper to avoid duplicated deny-precedence code.

### 4. Worker dispatch — tool-class extraction

In [`mcp-server/src/worker.ts`](../../../mcp-server/src/worker.ts) at the rate-limit call site (line 442-465 today), add a tool-name extraction step before `limiter.check()`. The Worker already plans to do this (line 534-535 carries a `// Tool-name extraction at the Worker boundary requires request.clone() + JSON-RPC parse; deferred to BL-032.75 maturity work` comment) — BL-038 brings the work forward.

```ts
const RADAR_TOOLS = new Set(['search_radar', 'get_latest_insights']);

// Pre-parse the JSON-RPC body to determine tool class. Cheap when not a
// tools/call (no parse needed); for tools/call we clone the body + JSON.parse.
const toolName = await extractToolName(request); // returns null for non-tools/call
const toolClass: 'general' | 'radar' = toolName && RADAR_TOOLS.has(toolName) ? 'radar' : 'general';

const limiter = createLimiter(env);
if (limiter) {
  const rlResult = await limiter.check(auth.keyOwner, toolClass);
  // ... existing deny + safeLog flow unchanged
}
```

`extractToolName(request)` lives in a new module `mcp-server/src/dispatch/extract-tool-name.ts`. It `request.clone()`s, attempts a JSON-RPC parse, and returns `params.name` for `tools/call` requests (null otherwise). Failure modes (non-JSON body, missing fields) all return null → `'general'` (fail-safe to the broader bucket; never gates more than the tool's own class warrants).

### 5. 429 envelope — new `reason` values

[`headers.ts:39 tooManyRequestsResponse`](../../../mcp-server/src/ratelimit/headers.ts#L39) currently emits `tier: 'minute' | 'day'` in the JSON body. Extend to `tier: 'minute' | 'day' | 'radar-minute' | 'radar-day'` and add a top-level `reason` field with the BACKLOG-spec values:

- `tier: 'radar-minute'` → `reason: 'radar-rate-limit-per-minute'`
- `tier: 'radar-day'` → `reason: 'radar-rate-limit-per-day'`
- `tier: 'minute'` → `reason: 'rate-limit-per-minute'` (newly explicit; was implicit before)
- `tier: 'day'` → `reason: 'rate-limit-per-day'`

The `safeLog({ event: 'ratelimit.exceeded', reason: ... })` line at [`worker.ts:452`](../../../mcp-server/src/worker.ts#L452) gets the same value so operator dashboards see the tier breakdown for free.

### 6. Tool registry — why dispatch-site lookup, not a `class` field

Considered: adding `class: 'radar'` to the `registerTool()` call sites in [`mcp-server/src/tools/radar-live.ts:296,312`](../../../mcp-server/src/tools/radar-live.ts#L296). Rejected for BL-038 scope, with an open-questions follow-up:

- **Pro**: forward-compatible. A third radar tool (e.g., `search_radar_by_topic`) would be self-classifying — author adds `class: 'radar'` at registration, no other touch points.
- **Con**: requires churning the `registerTool()` signature across the registry (BL-031.75 prompt registry pattern would need parallel adoption), threading the class through `createServer()` and into the Worker. Substantially more than half a day. The dispatch-site `Set` is one line to extend per future radar tool — the cost is recognized and accepted.

BL-038 ships the `Set` lookup. The registry refactor is captured in Open Questions § 1 for a future initiative.

---

## Test strategy

### Unit tests — `chooseBindingTier4`

New file `mcp-server/tests/unit/ratelimit/limiter.test.ts` (the existing limiter has no unit-test file today, only the integration test). Cases:

1. All 4 buckets pass, `radar-minute` has fewest remaining → returns `tier: 'radar-minute'`, `allowed: true`.
2. All 4 buckets pass, `day` has fewest remaining → returns `tier: 'day'`.
3. Only `radar-minute` denied → returns `tier: 'radar-minute'`, `allowed: false`.
4. Both `minute` and `radar-minute` denied → returns the later-reset of the two.
5. All 4 denied → returns the latest-reset, day-class preferred over minute-class.
6. `chooseBindingTier` (2-bucket) backward-compat: existing test cases unchanged.

### Unit tests — `extractToolName`

New file `mcp-server/tests/unit/dispatch/extract-tool-name.test.ts`:

1. `tools/call` for `search_radar` → returns `'search_radar'`.
2. `tools/call` for `list_portfolio_facets` → returns `'list_portfolio_facets'`.
3. `tools/list` (no name in params) → returns `null`.
4. Non-JSON body → returns `null`.
5. Malformed JSON-RPC (missing `params`) → returns `null`.

Plus a derived `toolClass` resolution table test: `'search_radar' → 'radar'`, `'get_latest_insights' → 'radar'`, every other tool name and `null → 'general'`.

### Integration test — `search_radar` 429s at request 6

New describe block in [`mcp-server/tests/integration/ratelimit.test.ts`](../../../mcp-server/tests/integration/ratelimit.test.ts), gated behind `UPSTASH_MCP_REST_URL` presence (same gating pattern as Phase 6 enforcement tests):

1. Fire 5 `search_radar` calls — all return 200 (or whatever the radar tool returns; matters that they aren't 429).
2. Fire a 6th `search_radar` — assert 429 with `reason: 'radar-rate-limit-per-minute'`, `tier: 'radar-minute'`.
3. Immediately fire `list_portfolio_facets` — assert NOT 429 (general bucket has 54 of 60 remaining; radar tier denial doesn't bleed across classes).
4. Inspect Upstash keys via `createMcpClient(env)`: assert `mcp:ratelimit:radar:min:*` keys exist for the test `keyOwner`.

### Snapshot test — 429 envelope shape

Extend `mcp-server/tests/unit/ratelimit-headers.test.ts`:

1. `tier: 'radar-minute'` envelope → snapshot includes `reason: 'radar-rate-limit-per-minute'`, `retryAfterSeconds: <number>`, `limit: 5`.
2. `tier: 'radar-day'` envelope → snapshot includes `reason: 'radar-rate-limit-per-day'`, `limit: 50`.
3. Existing `tier: 'minute' | 'day'` snapshots updated to include the new explicit `reason` field (backward-compat shape).

---

## Documentation plan

| File                                                                                                      | Change                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`mcp-server/src/ratelimit/limiter.ts:6`](../../../mcp-server/src/ratelimit/limiter.ts#L6)                | Retire the "Phase 4 adds a stricter parallel bucket for radar tools" aspirational comment; replace with a description of the implemented 4-bucket behavior, including the deny-precedence rule.                                                        |
| [`mcp-server/src/docs/operations/RATE_LIMITS.md`](../../../mcp-server/src/docs/operations/RATE_LIMITS.md) | Flip the table at line 18 from "⏳ Activated in Phase 4" to "✅ Active in BL-038". Rewrite the "Phase 4 — radar-tier activation" section (line 160) from future tense to past tense. Add the two new `reason` values to the 429 envelope example.      |
| [`mcp-server/src/worker.ts:441`](../../../mcp-server/src/worker.ts#L441)                                  | Update the inline comment block (currently "Phase 4 adds a stricter parallel bucket for radar tools") to describe the now-active dispatch-site `toolClass` resolution.                                                                                 |
| `src/docs/development/MCP_SERVER_RATE_LIMIT_TIER_BL-038.md`                                               | This doc — created.                                                                                                                                                                                                                                    |
| [`mcp-server/BREAKING_CHANGES.md`](../../../mcp-server/BREAKING_CHANGES.md)                               | New entry for the `Limiter.check()` signature change. **Internal-only surface** (no MCP-protocol breakage), but the manifest-hash test will require an `EXPECTED_MANIFEST_HASH` update if any tool descriptor changes — confirm during implementation. |

---

## Risks + tradeoffs

| Risk                                                      | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **False-positive denials at 5/min**                       | The 5/min cap is tight. Legitimate analytical workflows that fan out to `search_radar` multiple times in a chain (e.g., `gst_target_quick_look` runs 4 tool calls but only 1 is `search_radar`) stay well under the cap. The risk is interactive sessions where an operator manually fires several radar queries while exploring — they could hit the cap in under a minute. Mitigation: the 429 envelope's distinct `reason` lets the consumer recognize "I should pace radar specifically" rather than backing off everything. If this is hit in practice during BL-038's soak, raise to 10/min — the Inoreader 200/day budget headroom supports it (50/day per key × 3 active operators = 150/day, fits inside 200 with ISR's 28/day + Cron's 24/day = 52/day reserved). |
| **Tool-class extraction adding request latency**          | The Set lookup is O(1). The cost is the JSON-RPC body parse (`request.clone()` + `JSON.parse`) — sub-millisecond on the typical 200-byte MCP request body. Verified pattern: the Worker already plans this extraction for safeLog under BL-032.75; BL-038 just brings it forward. No perceptible latency budget impact.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **4 Redis commands → 8 Redis commands per radar request** | Each `Ratelimit.limit()` call costs 2 Redis commands; radar requests now hit all 4 buckets in parallel = 8 commands. Upstash free tier is 10,000/day. Worst case: a single operator at the full 50 radar/day cap consumes 50 × 8 = 400 radar-class commands; non-radar 950 calls × 4 = 3,800 commands. Total per-operator ~4,200/day, 2 operators = 8,400/day, still under free tier. RATE_LIMITS.md § "Upstash quota envelope" math (line 122) is updated accordingly.                                                                                                                                                                                                                                                                                                     |
| **Composition with BL-032.7 circuit-breaker**             | If the breaker is open, radar tool dispatch already 503s before the rate-limit check matters. If a radar-tier denial fires, the day-counter (which lives inside the Inoreader client, called from the tool handler) does NOT increment — correct semantics because no Inoreader call was made. Documented explicitly in the Decisions table.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Aspirational doc strings retained accidentally**        | Two surfaces (`limiter.ts:6` + `RATE_LIMITS.md:160`) explicitly target the aspirational-comment retirement as ACs. Reviewer should `grep -i "phase 4" mcp-server/src/ratelimit/ mcp-server/src/docs/operations/RATE_LIMITS.md` post-merge to confirm zero residue.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

**Out of scope** (do not touch in this PR):

- The cron-path `refreshRadarSnapshot` — has its own budget protection in the Cron handler.
- BL-032.77 cron dedup — orthogonal to the per-key dispatch path.
- The radar-tools registry refactor to carry `class` metadata — see Open Questions § 1.

---

## Acceptance Criteria

- [ ] `perRadarMinute` (5/60s) and `perRadarDay` (50/1d) `Ratelimit` instances added to `createLimiter()` with prefixes `mcp:ratelimit:radar:min` and `mcp:ratelimit:radar:day`.
- [ ] `Limiter.check()` accepts `toolClass: 'general' | 'radar'`; runs 4 buckets when `'radar'`, 2 when `'general'`.
- [ ] Worker dispatch pre-parses the MCP request body to determine tool class via the `RADAR_TOOLS` Set; passes the resolved `toolClass` to `check()`.
- [ ] 429 envelope distinguishes radar-tier denial from general-tier denial in a top-level `reason` field with values `radar-rate-limit-per-minute` and `radar-rate-limit-per-day` (alongside the existing `tier` field, which extends to include `'radar-minute' | 'radar-day'`).
- [ ] Unit tests cover 4-bucket priority logic in `chooseBindingTier4` (deny precedence, all-pass closest-cliff selection, tie-breaking).
- [ ] Unit tests cover `extractToolName` + the `toolClass` resolution table.
- [ ] Integration test asserts `search_radar` 429s at request 6 within 60s while `list_portfolio_facets` continues to accept calls (gated on `UPSTASH_MCP_REST_URL` presence).
- [ ] [`RATE_LIMITS.md`](../../../mcp-server/src/docs/operations/RATE_LIMITS.md) updated: tool-family table flips to "Active in BL-038", "Phase 4 — radar-tier activation" rewritten in past tense, 429 envelope example updated.
- [ ] [`limiter.ts:6`](../../../mcp-server/src/ratelimit/limiter.ts#L6) aspirational comment retired; replaced with a description of the implemented 4-bucket behavior.
- [ ] [`mcp-server/BREAKING_CHANGES.md`](../../../mcp-server/BREAKING_CHANGES.md) entry for the internal `Limiter.check()` signature change; manifest-hash test passing.

---

## Open questions

1. **Should `toolClass` move to the tool-registration object for future-extensibility?** Today the dispatch-site `RADAR_TOOLS` Set is the source of truth. A future PR could add `class: 'radar'` to each `registerTool()` call in `radar-live.ts`, with the Worker reading the class out of the registry. The cost is a registry-signature refactor (touches every tool file + the manifest-hash test). The benefit is self-classifying tools at the author site. Recommend deferring to a future BL-038.5 unless we add a third or fourth tool class in the same quarter.
2. **Should the 5/min cap be tunable per-key?** The current design caps all keys at the same 5/min. A future `MCP_KEY_HIGH_RADAR_*` family (or scope-based override) could carry a higher cap for trusted internal agents (e.g., BL-033 pilot orchestrators that legitimately fan out radar). Out of scope for BL-038; flag for the BL-032.75 observability dashboard work to inform the decision with real usage data first.
3. **Does the manifest-hash test need an update?** The `Limiter.check()` signature change is internal — no MCP-protocol surface changes. Manifest-hash should NOT shift. Verify during implementation; if it does shift, an unintended surface leak needs investigation before the bump.

---

## Closure note

**Shipped 2026-05-31 via PR <TBD>.**

Implementation landed in a single atomic commit (typecheck contract preserved at every commit boundary — the `Limiter.check` signature widening required updating the worker call site in the same commit to avoid a broken intermediate). All 8 BACKLOG ACs + the 9th design-doc-internal AC (manifest-hash stability) delivered:

- `perRadarMinute` (5/60s) + `perRadarDay` (50/1d) instances live at [`limiter.ts`](../../../mcp-server/src/ratelimit/limiter.ts).
- `Limiter.check(keyOwner, toolClass: 'general' | 'radar')` signature shipped; 2 buckets for general, 4 for radar.
- Worker dispatch via new [`extractToolName`](../../../mcp-server/src/dispatch/extract-tool-name.ts) + `toolClassFor` resolution at the rate-limit gate.
- 429 envelope `reason` field maps tier → stable agent-facing string via new `reasonForTier()` helper in [`headers.ts`](../../../mcp-server/src/ratelimit/headers.ts).
- Unit tests: 8 `chooseBindingTier4` priority cases + 4 reason-field envelope cases + 7 `extractToolName` cases (including empty-body fail-safe + body-consumption regression guard) + `RADAR_TOOLS` resolution table.
- `RATE_LIMITS.md` flipped past-tense; 429 envelope example updated; Upstash command-budget math added.
- `limiter.ts:6` aspirational comment retired.
- Manifest-hash stability test passing — internal `Limiter.check` signature widening is NOT an MCP-protocol surface change.

Integration-test integration deliberately deferred to a post-merge live probe against staging — the existing integration test gates on `UPSTASH_MCP_REST_URL` and CI doesn't bind it, so a CI-skip-only test would be cargo-cult scaffolding.

**Audit minor #5 follow-up — operator-count reconciliation**: § Risks line 224 quotes "3 active operators" against Inoreader budget; line 226 quotes "2 operators" against Upstash command budget. At 3 operators × 8 cmds × 1000 calls/day = 24k/day, over Upstash's 10k free tier. `RATE_LIMITS.md` now documents the 2-operator sizing explicitly + the 3rd-operator upgrade trigger.

**First MCP-surface change to exercise the BL-037 Phase A `workflow_run` deploy chain end-to-end** — push to `feature/bl-038-*` triggers `test-mcp-server.yml` (paths filter matches `mcp-server/**/*.ts`) → on green, `Deploy MCP Worker — staging` auto-fires → smoke probe validates `/health.gitSha` matches deployed commit within ~60s.

---

_Last updated: 2026-05-31 (shipped)._
