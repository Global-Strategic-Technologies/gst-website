# BL-032.5 — Resources & Prompts on Remote: Soak Testing Playbook

> **Audience**: operator running the BL-032.5 staging soak (currently RP); future operators repeating the exercise after a related Worker code change.
>
> **Purpose**: surface defects in the BL-032.5 substrate **before** flipping the staging deploy to production. The playbook only covers capabilities that are **net-new in BL-032.5** — the BL-032 substrate (auth, rate-limit, Tools, the existing Resource registry) was hardened during the 2026-05-06 → 2026-05-12 soak and does not need re-soaking here.
>
> **Status**: authored 2026-05-13 alongside the BL-032.5 Phase 1–4 commits on branch `feature-mcp2`. First run by RP after `wrangler deploy --env staging` lands.
>
> **Test ID convention**: `T.<section>.<n>` — same shape as the BL-032 playbook. **New sections introduced by BL-032.5**:
>
> - **C** = Resource cache (Phase 1)
> - **W** = Radar Resources on Worker (Phase 3) — distinct from BL-032 Section B's radar Tools
> - **X** = Worker Cron — hourly radar refresh + budget guards (Phase 4)
> - **H** = `/health` extension — `radarSnapshotAgeSeconds` (Phase 4)
> - **M** = Manifest-hash stability (Phase 4)
> - **K** = Claude workflow consumption — end-to-end via Claude Desktop pointed at staging
>
> Sections A / B / D / E / F / G / H / I / J are owned by [`MCP_SERVER_REMOTE_BL-032_TESTING.md`](MCP_SERVER_REMOTE_BL-032_TESTING.md) and are not re-run here unless a deliberate regression check is wanted.
>
> **Companion docs**:
>
> - [`MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md`](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md) — design rationale + the four-phase execution plan
> - [`mcp-server/scripts/Test-Bl0325.ps1`](../../../mcp-server/scripts/Test-Bl0325.ps1) — PowerShell batch runner that automates the programmatically-testable subset of this playbook
> - [`BL-032_5_TESTING_FINDINGS.md`](BL-032_5_TESTING_FINDINGS.md) — operator-filled findings log

---

## How to use this doc

**One-shot batch verification** (recommended for the post-deploy smoke test):

```powershell
cd c:\Code\gst-website\mcp-server
$env:MCP_URL = 'https://mcp-staging.globalstrategic.tech'
. .\scripts\Invoke-McpRequest.ps1      # bootstraps MCP_KEY via Read-Host -AsSecureString
.\scripts\Test-Bl0325.ps1              # runs every automated scenario, prints PASS/FAIL summary
```

The batch runner exercises **sections C / W / H / M**. Sections **X (Cron)** and **K (Claude workflow consumption)** require either operator-initiated actions (`wrangler triggers test`) or human-driven UI verification, so they live below as manual scenarios.

**Per-scenario manual verification**: pick a scenario from a section's table, run the snippet in the "How to run" column, log the outcome in [`BL-032_5_TESTING_FINDINGS.md`](BL-032_5_TESTING_FINDINGS.md) using the `T.<section>.<n>` ID.

**For the production deploy gate**: every scenario marked **Critical** in [§ Pre-production gate checklist](#pre-production-gate-checklist) must pass on staging before `wrangler deploy --env production`.

---

## Setup once per soak session

The BL-032 PowerShell helpers (`Invoke-McpRequest`, `Invoke-McpTool`) were hardened in BL-032.25 § 4 to fail loudly on HTTP errors and on protocol-unexpected 2xx responses. BL-032.5 uses them unchanged plus a few BL-032.5-specific helpers loaded by `Test-Bl0325.ps1`:

```powershell
cd c:\Code\gst-website\mcp-server
$env:MCP_URL = 'https://mcp-staging.globalstrategic.tech'   # or mcp.globalstrategic.tech for prod
. .\scripts\Invoke-McpRequest.ps1
```

`MCP_KEY` is prompted via `Read-Host -AsSecureString` (no scrollback leak). Override per session if needed:

```powershell
$env:MCP_KEY = (Read-Host -AsSecureString "MCP_KEY" | ConvertFrom-SecureString -AsPlainText)
```

---

## Section C — Resource cache (Phase 1)

The new `cache/resource-cache.ts` wraps Library + Regulation Resource handlers with an Upstash-backed cache. Hit/miss is **invisible to clients** — both paths return the same body shape. The signal is in `wrangler tail` (`resource_cache_hit` / `resource_cache_miss` events).

| ID        | Scenario                                       | How to run                                                                                                                                                                                                                                                                           | Expected                                                                                       |
| --------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| **T.C.1** | Cache miss on first read of a Library URI      | After staging deploy, **flush the cache once**: `wrangler kv key delete --binding=cache mcp:resource:* --env staging` (or wait 24h for natural expiry). Then in one terminal: `wrangler tail --env staging`; in another: read `gst://library/vdr-structure` via `Invoke-McpRequest`. | tail shows one `"event":"resource_cache_miss","uri":"gst://library/vdr-structure"` line        |
| **T.C.2** | Cache hit on second read of same URI           | Within ~24h of T.C.1, repeat the same `resources/read` call. Watch tail.                                                                                                                                                                                                             | tail shows `"event":"resource_cache_hit","uri":"gst://library/vdr-structure"` — no second miss |
| **T.C.3** | Cached body is byte-identical to fresh compute | Within `Test-Bl0325.ps1`: run `Compare-CachedVsFresh` which reads a URI twice and diffs the bodies.                                                                                                                                                                                  | bodies identical                                                                               |
| **T.C.4** | Cache wrapper transparent to error paths       | Read an unknown URI (e.g. `gst://library/nope`)                                                                                                                                                                                                                                      | JSON-RPC error envelope (Resource not found); cache wrapper does NOT cache the error response  |

**Failure modes worth recording**:

- tail shows `resource_cache_skip` with `reason=upstash-not-bound` on the staging Worker → Upstash MCP-DB binding is wrong, or `UPSTASH_MCP_REST_*` secrets aren't set on the env (regression check).
- Cache hit but body changed since last read → cache TTL math is wrong, or someone manually updated the Library data and the cache is serving stale.

---

## Section W — Radar Resources on Worker (Phase 3)

Radar Resources moved from stdio-only to transport-portable. The Worker now serves them from the Upstash-backed reader (the same `mcp:radar:cache:*` keys radar Tools use). Six URIs total.

| ID        | Scenario                                                       | How to run                                                                                                                                              | Expected                                                                                                                             |
| --------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **T.W.1** | `resources/list` now exposes all 6 radar URIs                  | `(Invoke-McpRequest -Method 'resources/list').result.resources \| Where-Object { $_.uri -like 'gst://radar/*' } \| Measure-Object`                      | count = 6                                                                                                                            |
| **T.W.2** | All 6 radar URIs are exactly the canonical list                | Same as T.W.1 but pluck `.uri` and sort                                                                                                                 | `gst://radar/fyi/latest`, `gst://radar/wire/latest`, `gst://radar/wire/{pe-ma,enterprise-tech,ai-automation,security}`               |
| **T.W.3** | `gst://radar/fyi/latest` returns populated body                | `(Invoke-McpRequest -Method 'resources/read' -Params @{ uri='gst://radar/fyi/latest' }).result.contents[0].text \| ConvertFrom-Json`                    | body has `tier:'fyi'`, `lastSeededAt` ISO string within the last ~6h, `itemCount` ≥ 1, `items[]` non-empty                           |
| **T.W.4** | `gst://radar/wire/latest` returns populated body               | Same as T.W.3 with `uri='gst://radar/wire/latest'`                                                                                                      | body has `tier:'wire'`, `itemCount` ≥ 1                                                                                              |
| **T.W.5** | Each Wire category URI returns filtered items                  | For each of `pe-ma`, `enterprise-tech`, `ai-automation`, `security`: read `gst://radar/wire/<cat>`                                                      | every item has `category` matching the URI's category segment; `itemCount` ≤ total Wire count                                        |
| **T.W.6** | Read a radar URI on a cold cache → snapshot-missing error body | Only meaningful pre-soak deploy. After flushing `mcp:radar:cache:fyi`, read `gst://radar/fyi/latest` before the next Cron tick.                         | body = `{ error: 'Radar snapshot is not yet populated. …', uri: '…' }`. After next Cron tick, T.W.3 starts returning populated body. |
| **T.W.7** | Stdio radar Resources still work (regression check)            | From a local stdio session: `(Invoke-McpRequest -Method 'resources/read' -Params @{ uri='gst://radar/fyi/latest' })` against `mcp-server/dist/index.js` | populated body — stdio path still reads from `.cache/inoreader/` (no behavior change)                                                |

T.W.6 is the most operationally important — it confirms the Worker reader correctly distinguishes "snapshot missing" from "snapshot present but empty."

---

## Section X — Worker Cron (Phase 4)

The hourly `scheduled` handler refreshes both radar tiers in Upstash. Verification covers manual triggering, budget-guard behavior, and the day-counter.

| ID        | Scenario                                            | How to run                                                                                                                                                                                      | Expected                                                                                                                                            |
| --------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T.X.1** | Cron trigger registered in wrangler.toml            | `wrangler triggers list --env staging`                                                                                                                                                          | output lists `cron: 0 * * * *`                                                                                                                      |
| **T.X.2** | Manual cron invocation succeeds                     | Terminal 1: `wrangler tail --env staging --format=json`. Terminal 2: `wrangler triggers test --env staging "0 * * * *"`                                                                         | tail shows one `cron.radar-refresh.success` log line with `wireItems` and `fyiItems` counts; no `partial`, `skipped`, or `error` lines for this run |
| **T.X.3** | Day-counter increments after a successful Cron run  | After T.X.2: `wrangler kv key get --binding=cache mcp:inoreader:day-counter:$(Get-Date -Format 'yyyy-MM-dd') --env staging` (or via Upstash REST UI; the key lives in MCP DB)                   | value = 6 if this was the first run today; otherwise previous + 6                                                                                   |
| **T.X.4** | `/health` reflects the freshly-refreshed snapshot   | Within ~5s after T.X.2 completes: `Invoke-RestMethod $env:MCP_URL/health` (no auth needed)                                                                                                      | `radarSnapshotAgeSeconds` is a small number (< 30) — the Cron just refreshed                                                                        |
| **T.X.5** | Cron skips when circuit breaker is open             | (Optional / destructive — only if comfortable touching the breaker.) Set `mcp:radar:circuit-open` with a 6h TTL via Upstash REST UI. Re-run `wrangler triggers test`. Delete the key afterward. | tail shows `cron.radar-refresh.skipped` with `reason=circuit-open`; day-counter unchanged                                                           |
| **T.X.6** | Cron skips when day-counter is at/over the soft cap | (Optional / destructive.) Set the day-counter key to 175 in Upstash REST UI. Re-run `wrangler triggers test`. Delete the key afterward.                                                         | tail shows `cron.radar-refresh.skipped` with `reason=day-cap-reached, counter=175`; readers serve stale data until midnight UTC                     |
| **T.X.7** | Wait one natural hour, observe a real Cron tick     | After staging deploy, leave `wrangler tail --env staging` running across the top-of-hour                                                                                                        | exactly one Cron line at HH:00:00 UTC ±5s; no double-fires; no missed hours over a 24h window                                                       |

T.X.5 and T.X.6 are optional because they involve manually toggling Upstash state — only do them if you want to confirm the budget guards work end-to-end. The unit tests at `mcp-server/tests/unit/cron/radar-refresh.test.ts` cover the same branches with mocks.

---

## Section H — `/health` extension (Phase 4)

`/health` gained `radarSnapshotAgeSeconds`. Two scenarios cover the field's presence + correctness.

| ID        | Scenario                                             | How to run                                                                                                              | Expected                                                                        |
| --------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **T.H.1** | `/health` payload includes `radarSnapshotAgeSeconds` | `Invoke-RestMethod $env:MCP_URL/health \| Select-Object radarSnapshotAgeSeconds`                                        | field exists; value is `null` (cold deploy, pre-Cron) or a non-negative integer |
| **T.H.2** | Field tracks the actual Upstash cache age            | Run T.X.2 (manual Cron trigger). Immediately call `/health`. Wait 10 minutes, call again.                               | first call: `radarSnapshotAgeSeconds < 30`. Second call: ≈ 600 ± 20             |
| **T.H.3** | Field returns `null` cleanly when MCP DB unreachable | (Optional) Temporarily rotate `UPSTASH_MCP_REST_TOKEN` to an invalid value, hit `/health`. Restore the token afterward. | `radarSnapshotAgeSeconds: null` and `upstashMcp: 'degraded'`. No 5xx.           |

T.H.3 is optional because it forces a degraded state on staging that affects every endpoint — only run if confident in the token-restoration step.

---

## Section M — Manifest-hash stability (Phase 4)

The `manifest-stability.test.ts` test runs as part of `npm test` and fails CI on any URI / prompt-name / prompt-version drift. There's nothing to verify at runtime — the discipline is enforced at CI time. One scenario to confirm the discipline is wired correctly.

| ID        | Scenario                                           | How to run                                                                                                                                               | Expected                                                                                                                        |
| --------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **T.M.1** | Manifest hash test passes on the deployed branch   | `cd mcp-server && npm test 2>&1 \| Select-String 'manifest'`                                                                                             | one line: `✓ manifest-stability hash`; no errors                                                                                |
| **T.M.2** | Intentional drift produces a clear failure message | (Optional, in a throwaway local commit.) Rename `gst://library/vdr-structure` to `gst://library/vdr-structure-renamed` in a test branch; run `npm test`. | The test fails with the remediation message naming the new hash, BREAKING_CHANGES.md, and the test constant. Revert the commit. |

---

## Section K — Claude workflow consumption (manual, end-to-end)

The high-confidence test that BL-032.5 actually delivers user-facing value: invoke the same `gst_*` prompts and pin the same Resources from Claude Desktop pointed at staging that pilot clients will use against production. Each scenario covers one of the use cases enumerated in [BL-032.5 design doc § Use cases](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md#planning-criteria).

| ID        | Scenario                                                                                                      | Expected                                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T.K.1** | Pin `gst://library/vdr-structure` in a fresh Claude Desktop conversation; ask "summarize the structure"       | Claude reads the Resource and produces a summary grounded in the actual content — not Claude's general VDR knowledge. First-read latency < 1s; second-read clearly faster |
| **T.K.2** | Pin `gst://radar/fyi/latest` in a fresh conversation; ask "what's most relevant to a SaaS PE deal right now?" | Claude reads the snapshot, references specific items by title with the GST Take voice. `lastSeededAt` is recent (within Cron interval ± a tick)                           |
| **T.K.3** | Invoke `gst_target_quick_look` with a real-sounding target profile                                            | Claude calls all four orchestrated tools in sequence; no 429 rate-limit error; final brief covers all four perspectives                                                   |
| **T.K.4** | Pin `gst://regulations/eu/gdpr` + `gst://regulations/us-ca/ccpa` in a deal-review conversation                | Both Resources resolve; Claude cross-references requirements across jurisdictions                                                                                         |
| **T.K.5** | Switch the same conversation from staging to local stdio mid-session                                          | Same pinned URIs resolve from the stdio reader; bodies byte-identical (URI stability invariant)                                                                           |
| **T.K.6** | Repeat T.K.1 from Claude mobile (or Claude Code) instead of Desktop                                           | Same outcome as T.K.1 — proves the "always-on access" use case actually lands. Latency may be slightly higher (cellular vs wired)                                         |

Findings from this section feed directly into the BL-033 pilot-readiness assessment.

---

## Pre-production gate checklist

Every box must be checked before `wrangler deploy --env production`. Critical items block; Important items warrant a closure-stanza decision (fix-or-defer) but don't block.

### Critical (must PASS on staging)

- [ ] **T.W.1, T.W.2** — `resources/list` exposes the canonical 6 radar URIs
- [ ] **T.W.3, T.W.4** — both core radar URIs return populated bodies
- [ ] **T.X.1, T.X.2** — Cron trigger is registered AND manually fires successfully
- [ ] **T.X.4** — `/health` reflects fresh snapshot after manual Cron
- [ ] **T.H.1** — `/health` exposes `radarSnapshotAgeSeconds`
- [ ] **T.M.1** — `npm test` passes including the manifest-hash check
- [ ] **T.K.1** OR **T.K.2** — at least one end-to-end Claude Desktop verification

### Important (worth executing; failure → open BL-032.5 close-out item rather than block)

- [ ] **T.C.1, T.C.2** — cache hit observable in `wrangler tail`
- [ ] **T.W.5** — Wire category URIs filter correctly
- [ ] **T.X.7** — one natural Cron tick observed in tail
- [ ] **T.K.3** — `gst_target_quick_look` 4-tool fan-out lands under rate-limit budget

### Optional (skip unless you're specifically interested)

- [ ] **T.C.3, T.C.4** — cache transparency + error-path passthrough
- [ ] **T.W.6, T.W.7** — cold-cache + stdio regression
- [ ] **T.X.3, T.X.5, T.X.6** — day-counter + circuit breaker + day-cap manual toggles
- [ ] **T.H.2, T.H.3** — health field age accuracy + degraded fallback
- [ ] **T.M.2** — manifest-hash drift remediation flow rehearsal
- [ ] **T.K.4, T.K.5, T.K.6** — cross-jurisdiction pinning + transport-mid-session-switch + mobile

---

_Last updated: 2026-05-13 — authored alongside the BL-032.5 Phase 1–4 commits on `feature-mcp2`. Re-run before each production deploy that touches the Resource cache, scope catalog, radar Resource registration, Cron schedule, or `/health` shape._
