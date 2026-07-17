# BL-032 — Soak-Week Testing Playbook

> **Audience**: operator running the BL-032 staging soak (currently RP); future operators repeating the exercise after BL-033 / BL-034 / BL-035 substrate changes.
>
> **Purpose**: this doc is the structured exercise plan for the one-week staging soak between Phase 6 § B.5 (staging live) and § B.6 (production deploy). Its job is to **harden the system by surfacing failures, inconsistencies, and pain points BEFORE production users see them**. Every test scenario below either confirms a capability already implemented or surfaces a remediation candidate.
>
> **Status**: authored 2026-05-06 at the start of the BL-032 soak window; first run by RP through ~2026-05-13. After this initial pass, the doc evolves with each future MCP substrate change — re-run the relevant scenario sections after every Worker code commit + before every production deploy.
>
> **Companion docs**:
>
> - [`MCP_SERVER_REMOTE_BL-032.md`](MCP_SERVER_REMOTE_BL-032.md) — architecture rationale (Q1-Q13)
> - [`mcp-server/src/docs/operations/DEPLOY.md`](../../../mcp-server/src/docs/operations/DEPLOY.md) — deploy runbook this builds on
> - [`mcp-server/src/docs/operations/AUTH.md`](../../../mcp-server/src/docs/operations/AUTH.md) — bearer-token operations
> - [`mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md`](../../../mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md) — consumer setup
> - [`mcp-server/src/docs/operations/RATE_LIMITS.md`](../../../mcp-server/src/docs/operations/RATE_LIMITS.md) — rate-limit + circuit-breaker design
>
> **Test ID convention**: `T.<section>.<n>` — section letters group by area (A=Auth, B=Tools, C=Rate-limit, D=Inoreader, E=Observability, F=Onboarding, G=DR, H=Performance, I=Security, J=Schema, **K=Claude workflow consumption**). IDs are stable; new tests append, deprecated tests get `~~strikethrough~~` rather than removal so historical results stay decodable.

---

## How to use this doc

**During the soak week**: pick a section per session; execute scenarios in order; record outcomes per the [§ Findings template](#findings-template). Aim for ≥80% scenario coverage across the week. Don't try to run all scenarios in one sitting — the per-day Inoreader budget alone makes that imprudent.

**After a finding surfaces a real defect**: open a tracking issue (or a closure-stanza-style note in the BL-032 design doc), reference the test ID, and fix-or-defer per blast radius. Mark the scenario in this doc with the fix's commit SHA so future runs can confirm the regression doesn't recur.

**For the production deploy gate**: every scenario marked **Critical** in the [§ Pre-production gate checklist](#pre-production-gate-checklist) must pass before clicking `npm run deploy:production`. Scenarios marked Non-blocking can have known failures that are acknowledged but allowed to ship.

**Shell adaptation**: PowerShell-flavored snippets shown for Windows operators. The bash equivalents follow DEPLOY.md § B.3's translation table.

**Setup once per soak session**:

```powershell
$env:MCP_URL = "https://mcp-staging.globalstrategic.tech"
# Read-Host prompts interactively so the secret doesn't enter PSReadLine history.
# (Avoid `$env:MCP_KEY = "..."` — that records the value in plaintext to
#  %APPDATA%\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt.)
$env:MCP_KEY = Read-Host -Prompt "Paste MCP_KEY_RP value (input will be visible)"

# Reusable PowerShell helper (also documented in DEPLOY.md § B.3):
function Invoke-McpRequest {
  param(
    [Parameter(Mandatory)] [string] $Method,
    [hashtable] $Params = @{},
    [int] $Id = 1
  )
  $body = @{ jsonrpc = "2.0"; id = $Id; method = $Method; params = $Params } | ConvertTo-Json -Compress -Depth 10
  $headers = @{ Authorization = "Bearer $env:MCP_KEY"; Accept = "application/json, text/event-stream" }
  $resp = Invoke-WebRequest -Uri "$env:MCP_URL/mcp" -Method Post -Headers $headers -ContentType "application/json" -Body $body -SkipHttpErrorCheck
  $dataLine = $resp.Content -split "`n" | Where-Object { $_ -like "data:*" } | Select-Object -First 1
  if (-not $dataLine) { return $resp }  # raw response if not SSE (e.g., 401 path)
  return $dataLine.Substring(5).Trim() | ConvertFrom-Json
}
```

---

## Findings template

For each scenario you execute, log the outcome. Suggested format (copy-paste this block per finding):

```
## T.<section>.<n> — <short title>
- Date: 2026-05-06
- Tester: RP
- Outcome: PASS / FAIL / INCONCLUSIVE
- Observed: <what actually happened, terse>
- Expected: <what was supposed to happen>
- Severity (if fail): Critical / Important / Minor / Cosmetic
- Remediation: <link to issue, commit SHA, or "deferred — track in BACKLOG.md">
- Notes: <anything else worth recording>
```

Findings can live in a separate `BL-032_TESTING_FINDINGS.md` file (one block per finding), in a Linear/GitHub issue, or in your operator notebook — wherever the rest of soak notes live. Critical findings should also surface in this doc's [§ Pre-production gate checklist](#pre-production-gate-checklist) until resolved.

---

## Section A — Authentication & access

The Worker's auth surface is small (static bearer tokens per Q11) but corner-case-rich. Every failure mode here has a user-facing impact, so they all matter.

| ID         | Scenario                                                        | How to run                                                                                                               | Expected                                                                                                                             | Failure mode                                                                                                                                                       |
| ---------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **T.A.1**  | Valid token works                                               | `(Invoke-McpRequest -Method "tools/list").result.tools.name`                                                             | 10 tool names returned                                                                                                               | Any other behavior — already proven in B.3.3, regression check                                                                                                     |
| **T.A.2**  | Missing Authorization header → 401                              | `curl.exe -i $env:MCP_URL/mcp -X POST -d '{}' -H "Content-Type: application/json"`                                       | `HTTP/2 401` + `WWW-Authenticate: Bearer realm="gst-mcp"` + JSON `{"error":"unauthorized","message":"Missing Authorization header"}` | 200, 5xx, or wrong WWW-Authenticate                                                                                                                                |
| **T.A.3**  | Wrong bearer scheme                                             | `curl.exe -i $env:MCP_URL/mcp -X POST -H "Authorization: Basic abc=="`                                                   | 401 with reason indicating non-Bearer scheme rejected                                                                                | 200 (broken auth!) or 5xx                                                                                                                                          |
| **T.A.4**  | Empty Bearer token                                              | `curl.exe -i $env:MCP_URL/mcp -X POST -H "Authorization: Bearer "`                                                       | 401 with reason indicating empty token                                                                                               | 200, or 401 but with confusing message                                                                                                                             |
| **T.A.5**  | Wrong token value                                               | `curl.exe -i $env:MCP_URL/mcp -X POST -H "Authorization: Bearer not-a-real-token"`                                       | 401, reason = `bearer-rejected`, NOT 403                                                                                             | 200, 403, or 5xx                                                                                                                                                   |
| **T.A.6**  | Token with leading/trailing whitespace                          | `curl.exe -i $env:MCP_URL/mcp -X POST -H "Authorization: Bearer  $env:MCP_KEY  "` (note extra spaces)                    | Either accepts (after trim) or rejects cleanly with 401. **Whichever it does, behavior must be deterministic**                       | Inconsistent (sometimes works, sometimes doesn't)                                                                                                                  |
| **T.A.7**  | Multiple Authorization headers                                  | Send two `Authorization` headers — one valid, one bogus                                                                  | RFC 9110-compliant: server picks one and either honors it or rejects. Document which.                                                | Server crashes (5xx), or behavior depends on header order                                                                                                          |
| **T.A.8**  | Token in lowercase header (`authorization` not `Authorization`) | `curl.exe -i $env:MCP_URL/mcp -X POST -H "authorization: Bearer $env:MCP_KEY"`                                           | 200 (HTTP headers are case-insensitive per RFC)                                                                                      | 401 (would be a real bug)                                                                                                                                          |
| **T.A.9**  | keyOwner attribution accuracy                                   | Make a call, then `wrangler tail --search '"keyOwner":"RP"'`                                                             | Tail shows `keyOwner: "RP"` (suffix from `MCP_KEY_RP`)                                                                               | `keyOwner: "RP"` missing or wrong; or full token leaks via Authorization header logging (CRITICAL — would mean safeLog regression)                                 |
| **T.A.10** | Token rotation mid-session                                      | Operator: rotate `MCP_KEY_RP` per AUTH.md. Tester: continue calling with old token from Claude Desktop                   | Old token starts returning 401 within ~30s (next isolate cold start)                                                                 | Old token continues to work indefinitely (rotation isn't taking effect)                                                                                            |
| **T.A.11** | After rotation, new token works                                 | Configure Claude Desktop with the new token value; smoke prompt                                                          | 200, tools work                                                                                                                      | Stale config caching, partial rotation propagation                                                                                                                 |
| **T.A.12** | Revoked key behavior                                            | `wrangler secret delete MCP_KEY_RP --env staging` then call                                                              | 401, reason = `bearer-rejected` (NOT a 5xx — secret-not-bound shouldn't crash auth)                                                  | 5xx, or auth-bypass behavior (CRITICAL)                                                                                                                            |
| **T.A.13** | Multiple keys per env (after team-member onboarding)            | Operator sets MCP_KEY_AB; tester calls with each token in turn                                                           | Each token works; logs distinguish keyOwner correctly per request                                                                    | Tokens cross-contaminate; keyOwner attribution wrong                                                                                                               |
| **T.A.14** | Same token value reused across keys                             | Operator sets `MCP_KEY_RP` = X and `MCP_KEY_AB` = X (same value). Call.                                                  | Behavior is documented one way or the other (e.g., first-match wins, or rejected as duplicate)                                       | Crashes or randomly attributes to either keyOwner                                                                                                                  |
| **T.A.15** | Token comparison timing-safe                                    | Call with a token that's character-for-character close to the real token (e.g., last char different). Time the response. | Latency identical to T.A.5's outright-wrong-token case (timing attack defense via constant-time comparison)                          | Timing diff suggests `===` comparison — would let an attacker enumerate token char-by-char (Important; not Critical at internal-soak-scope but matters for BL-033) |

---

## Section B — Tool execution (the 10-tool surface)

Each transport-portable tool has a contract documented in [`mcp-server/src/docs/tools/`](../../../mcp-server/src/docs/tools/) (BL-031.85). The tests below cover happy path + edge cases per tool. Use Claude Desktop, Claude Code (project-level via `.mcp.json`), or direct curl — note the client used in each finding.

### T.B.1 — `list_portfolio_facets`

```powershell
$resp = Invoke-McpRequest -Method "tools/call" -Params @{ name = "list_portfolio_facets"; arguments = @{} }
$resp.result.content[0].text | ConvertFrom-Json
```

| ID      | Variant               | Expected                                                                                                 |
| ------- | --------------------- | -------------------------------------------------------------------------------------------------------- |
| T.B.1.a | Happy path (no args)  | Returns `{ themes, engagementCategories, growthStages, years }` arrays — non-empty, deduplicated, sorted |
| T.B.1.b | Spurious args ignored | Pass `arguments = @{ unrecognized = "ignored" }` — same response as 1.a, no error                        |

### T.B.2 — `search_portfolio`

```powershell
$resp = Invoke-McpRequest -Method "tools/call" -Params @{ name = "search_portfolio"; arguments = @{ search = "kubernetes"; engagement = "Buy-Side" } }
($resp.result.content[0].text | ConvertFrom-Json).matches.Count
```

| ID      | Variant                                        | Expected                                                                                                                                                            |
| ------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T.B.2.a | Free-text matches multiple fields              | Search "kubernetes" — returns projects that mention K8s in `summary`, `technologies`, or other indexed fields. Verify against `src/data/ma-portfolio/projects.json` |
| T.B.2.b | Empty search → all 61 projects                 | `arguments = @{}` — count = 61 (per BACKLOG.md BL-031 + BL-031.95                                                                                                   |
| T.B.2.c | Theme + engagement filter compose              | Both filters — count ≤ either alone                                                                                                                                 |
| T.B.2.d | "all" sentinel for both filters                | Same as 2.b                                                                                                                                                         |
| T.B.2.e | Invalid theme → either filter ignored OR error | Document which behavior; should be stable                                                                                                                           |
| T.B.2.f | Deeplink populated                             | Response includes `deeplink: "https://globalstrategic.tech/ma-portfolio?..."` reflecting filter state                                                               |

### T.B.3 — `generate_diligence_agenda`

```powershell
$inputs = @{
  transactionType = "majority-stake"
  productType = "b2b-saas"
  techArchetype = "modern-cloud-native"
  headcount = "51-200"
  revenueRange = "5-25m"
  growthStage = "scaling"
  companyAge = "5-10yr"
  geographies = @("us", "eu")
  businessModel = "productized-platform"
  scaleIntensity = "moderate"
  transformationState = "stable"
  dataSensitivity = "moderate"
  operatingModel = "product-aligned-teams"
}
$resp = Invoke-McpRequest -Method "tools/call" -Params @{ name = "generate_diligence_agenda"; arguments = $inputs }
$resp.result.content[0].text | ConvertFrom-Json
```

| ID      | Variant                                                  | Expected                                                                                                                                                                                                                                     |
| ------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T.B.3.a | All 13 fields valid                                      | Response has `topics[]`, `attentionAreas[]`, `triggerMap`, `15 ≤ metadata.totalQuestions ≤ 20` (engine invariant — `balanceAcrossTopics` caps at 20; see `tests/unit/diligence-engine.test.ts:757`), `unknownDimensionCount = 0`, `deeplink` |
| T.B.3.b | All fields = `'unknown'` (BL-031.95 sentinel)            | `unknownDimensionCount = 13` — agenda widens conservatively rather than failing; response includes a low-confidence callout per BL-031.95                                                                                                    |
| T.B.3.c | Mix of unknown + known                                   | `unknownDimensionCount` matches count of `'unknown'`s passed                                                                                                                                                                                 |
| T.B.3.d | Invalid enum value                                       | Returns MCP error envelope (NOT thrown exception); error message names the bad field                                                                                                                                                         |
| T.B.3.e | Missing required field                                   | MCP error; error names the missing field                                                                                                                                                                                                     |
| T.B.3.f | Geographies array with both `'unknown'` and a real value | Validates per BL-031.95 contract — `['unknown']` alone is fine; mixed array behavior should be documented                                                                                                                                    |
| T.B.3.g | Geographies as empty array                               | Rejected (must have ≥ 1 element per Zod schema)                                                                                                                                                                                              |
| T.B.3.h | Deeplink round-trip                                      | Open the deeplink in a browser → wizard pre-fills with same inputs                                                                                                                                                                           |

### T.B.4 — `assess_infrastructure_cost_governance`

```powershell
$resp = Invoke-McpRequest -Method "tools/call" -Params @{
  name = "assess_infrastructure_cost_governance"
  arguments = @{
    answers = @{ q1 = 2; q2 = 1; q3 = 0; q4 = 3 }  # use real ICG question IDs
    companyStage = "series-b"
  }
}
```

| ID      | Variant                                  | Expected                                                                                                                                                                                                                                                                                                                          |
| ------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T.B.4.a | Answers map (canonical stage `series-b`) | `overallScore` 0-100, `maturityLevel` ∈ {Reactive, Aware, Optimizing, Strategic}, sorted recommendations, `stageContext` shows ICG-native equivalent (`series-bc`)                                                                                                                                                                |
| T.B.4.b | ICG-native stage value (`series-bc`)     | Same shape; `stageContext` shows the canonical mapping                                                                                                                                                                                                                                                                            |
| T.B.4.c | Use `-1` "Not sure" answer               | `skippedCount` increments (per-domain and top-level); `-1` is scored as a literal `-1` contribution to `rawScore`, intentionally penalizing MORE than `0` ("Not in place") per `icg-engine.ts:112-113` + `tests/unit/icg-engine.test.ts:700-718`. The "ignorance is worse than known absence" design is honest about not-knowing. |
| T.B.4.d | Empty answers map                        | Returns `overallScore = 0` and `answeredCount = 0` against full `totalQuestions` (no `notAnsweredCount` field; the playbook's earlier wording was inaccurate to the engine's actual response shape).                                                                                                                              |
| T.B.4.e | Invalid question ID                      | MCP error or filtered silently — document which                                                                                                                                                                                                                                                                                   |
| T.B.4.f | Score out of range (-2 or 4)             | Zod rejection clean                                                                                                                                                                                                                                                                                                               |

### T.B.5 — `compute_techpar`

Per BL-031.95, all 6 money fields are annual dollars (the previous monthly/×12 for `infraHostingAnnual` was renamed). Tests should exercise the renamed field name.

| ID      | Variant                                                | Expected                                                                                                                  |
| ------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| T.B.5.a | Quick mode, canonical stage                            | Returns `totalTechPct`, `zone` ∈ {underinvest, ahead, healthy, above, elevated, critical}, KPIs, gap projection, deeplink |
| T.B.5.b | Deepdive mode                                          | `engCost + prodCost + toolingCost` synthesized as R&D OpEx; raw `rdOpEx` ignored                                          |
| T.B.5.c | Cash vs GAAP capex view                                | Different `total` and `zone` values when `rdCapEx > 0`                                                                    |
| T.B.5.d | `arr = 0`                                              | Engine returns null in JS — surfaced as MCP error per BL-031.95                                                           |
| T.B.5.e | `infraHostingAnnual = 0`                               | Same null → MCP error                                                                                                     |
| T.B.5.f | TechPar-native stage `series_bc` (underscore) accepted | Treated identically to canonical `series-b` / `series-c`                                                                  |

### T.B.6 — `estimate_tech_debt_cost`

| ID      | Variant                                                                                                                                                                                | Expected                                                                              |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| T.B.6.a | Realistic inputs (50 engs, $200K avg salary, 30% maintenance burden, weekly deploys, 5 incidents/mo, 4hr MTTR, $500K budget, $50M ARR, 80% remediation efficiency, contextSwitch=true) | Returns `annualCost`, `paybackMonths`, `doraLabel = "High"`, decomposed monthly costs |
| T.B.6.b | `contextSwitchOn = false`                                                                                                                                                              | `contextSwitchMonthly = 0`, `totalMonthly` reduced                                    |
| T.B.6.c | `incidents = 0`                                                                                                                                                                        | `incidentMonthly = 0`                                                                 |
| T.B.6.d | `teamSize = 0`                                                                                                                                                                         | Zod rejection (exclusiveMinimum)                                                      |

### T.B.7 — `search_regulations`

| ID      | Variant                             | Expected                                                                                                    |
| ------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| T.B.7.a | Free-text "GDPR"                    | Returns matches with `id: 'gdpr'` first (or near-first); each match has `uri`, `summary`, `keyRequirements` |
| T.B.7.b | Jurisdiction `eu` filter            | All matches scoped to EU regulations                                                                        |
| T.B.7.c | Category `data-privacy` filter      | All matches in data-privacy category                                                                        |
| T.B.7.d | `limit = 5`                         | Max 5 results                                                                                               |
| T.B.7.e | `limit = 200`                       | Capped at 120 (max per schema) — verify Zod enforces                                                        |
| T.B.7.f | Deeplink + filterDeeplink populated | Both URLs reflect supplied filters                                                                          |

### T.B.8 — `list_regulation_facets`

| ID      | Variant    | Expected                                                                                                              |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------- |
| T.B.8.a | Happy path | Returns deduplicated `jurisdictions[]` (e.g., `eu`, `us`, `us-ca`, `ca-qc`, `uk`) and `categories[]` (4 known values) |

### T.B.9 — `search_radar` (live Inoreader; budget-sensitive)

| ID      | Variant                              | Expected                                                                     | Caveats                                                                       |
| ------- | ------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| T.B.9.a | Category `pe-ma` happy path          | Non-zero matches; `cacheHit: false` on first call within 6h window           | Burns ~6 Inoreader calls; do once per soak day                                |
| T.B.9.b | Same call again within 6h            | `cacheHit: true`; same matches as 9.a; `fetchedAt` unchanged                 | If cache is broken, this would be a budget regression                         |
| T.B.9.c | No category (all four)               | Larger match set; cache key differs from category-specific calls             |                                                                               |
| T.B.9.d | Each of 4 categories                 | All return non-zero; each populates own cache entry                          | Burns 4 × 6 = 24 Inoreader calls — only do once during soak to map cache keys |
| T.B.9.e | After Inoreader access-token refresh | Recovery flow per DEPLOY.md C.5; verify `inoreader: 'ok'` in `/health` after | Already observed once during initial deploy                                   |
| T.B.9.f | During simulated Inoreader 429       | See Section D § T.D.6 for forced 429 setup                                   |                                                                               |

### T.B.10 — `get_latest_insights`

| ID       | Variant            | Expected                                                                                        |
| -------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| T.B.10.a | Default limit (10) | Returns 10 FYI items, `published`-sorted newest-first; each has GST-annotation fields populated |
| T.B.10.b | Limit = 30 (max)   | Up to 30 items                                                                                  |
| T.B.10.c | Limit = 31         | Zod rejection (max: 30)                                                                         |
| T.B.10.d | Limit = 0          | Zod rejection (min: 1)                                                                          |
| T.B.10.e | Category filter    | Only items matching that category                                                               |

---

## Section C — Rate limiting & circuit breaker

The rate limiter is the load-bearing protection against Inoreader budget exhaustion. Test the substrate (sliding window math, RFC 9331 headers) AND the operational path (graceful skip when MCP DB unreachable).

| ID         | Scenario                                     | How to run                                                                                                                                                                            | Expected                                                                                                                 | Failure mode                                                                 |
| ---------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| **T.C.1**  | Per-minute cap exhausted                     | 70 requests in <60s (B.3.7 hammer test)                                                                                                                                               | ~60 × 200, ~10 × 429; sliding-window timing affects exact split                                                          | All 200 (limiter broken) or all 429 (limiter too strict)                     |
| **T.C.2**  | RFC 9331 headers on every response           | Inspect `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` on a single 200 response                                                                                          | All three present; `Limit = 60`; `Remaining` decremented from 60; `Reset` ∈ [1, 60]                                      | Headers absent (broken substrate) or wrong values                            |
| **T.C.3**  | `Retry-After` header on 429                  | Hit the cap, inspect 429 response                                                                                                                                                     | `Retry-After: <seconds>` matches `RateLimit-Reset`                                                                       | Missing, or wildly off                                                       |
| **T.C.4**  | Per-day cap (1000)                           | Hard to test exhaustively; estimate from per-minute hammers + sliding window math                                                                                                     | Cap holds; per-day window separate from per-minute                                                                       | Counters bleed                                                               |
| **T.C.5**  | Independent counters per key                 | Two keys (`MCP_KEY_RP` + `MCP_KEY_AB`); hammer one to exhaustion                                                                                                                      | Other key still gets 200                                                                                                 | Counters cross-pollinate (CRITICAL)                                          |
| **T.C.6**  | Radar tools tighter limits (5/min, 50/day)   | Hammer `search_radar` calls (vary category to bust cache)                                                                                                                             | Hits at 5/min before reaching 60-cap                                                                                     | Radar uses general limits (regression of Phase 4)                            |
| **T.C.7**  | Graceful skip when MCP DB unreachable        | Operator: temporarily corrupt `UPSTASH_MCP_REST_TOKEN` → redeploy → call                                                                                                              | Worker serves auth + non-radar tools normally; `safeLog` shows `event: ratelimit.skipped, reason: upstash-mcp-not-bound` | 5xx, or rate limiter blocks all calls (fail-closed when it should fail-open) |
| **T.C.8**  | Sliding-window decay observable              | Hit cap; wait 30s; verify N more requests succeed                                                                                                                                     | ~30 of the cap-60 tokens released over 30s                                                                               | All 60 tokens still locked (window math bug)                                 |
| **T.C.9**  | Circuit-breaker state isolation per env      | Open the breaker on staging; verify production unaffected                                                                                                                             | Staging radar tools 503; production radar tools 200                                                                      | Cross-env contamination (staging breaker affects production)                 |
| **T.C.10** | Manual circuit-breaker reset (DEPLOY.md C.5) | `curl.exe -X POST "$env:UPSTASH_MCP_REST_URL/del/mcp:radar:circuit-open" -H "Authorization: Bearer $env:UPSTASH_MCP_REST_TOKEN"` (set both env vars from your password manager first) | Next radar call hits Inoreader; if Inoreader OK, breaker stays closed                                                    | Reset doesn't take effect; state stale-cached on Worker side                 |

---

## Section D — Inoreader integration & forced 429 reproduction

The hardest scenario to test in a non-destructive way. Inoreader's 200/day budget is shared with the website's ISR (~28/day) and the MCP per-key cap (50/day) — so naturally exhausting it via MCP alone takes a full day. Two strategies for forcing the 429 path during soak:

**Strategy 1 — directly set the circuit-breaker flag** (recommended; doesn't burn Inoreader budget):

```powershell
# Set the Upstash MCP DB credentials in this shell (from password manager or wrangler secret list):
$env:UPSTASH_MCP_REST_URL = "<your MCP DB URL>"
$env:UPSTASH_MCP_REST_TOKEN = "<your MCP DB Standard token>"

# Set the breaker flag with a 6h TTL (21600 seconds):
curl.exe -X POST "$env:UPSTASH_MCP_REST_URL/set/mcp:radar:circuit-open/inoreader-rate-limit" `
  -H "Authorization: Bearer $env:UPSTASH_MCP_REST_TOKEN" `
  -d "EX=21600"
```

This simulates the post-Inoreader-429 state without actually hitting Inoreader. To clear it (per DEPLOY.md § C.5):

```powershell
curl.exe -X POST "$env:UPSTASH_MCP_REST_URL/del/mcp:radar:circuit-open" `
  -H "Authorization: Bearer $env:UPSTASH_MCP_REST_TOKEN"
```

**Strategy 2 — burn the budget naturally** (only attempt with operator approval; affects website's radar feed for 6h):

Call `search_radar` with each of the 4 distinct categories AND no-category, then mutate Worker code to drop the cache TTL to 0 (or use a 5th identifier-bearing param to force cache misses). Each call burns ~6 Inoreader API requests; 30+ unique cache-key calls × 6 = 180+ requests (within the 200/day budget). When Inoreader 429s, the natural-path circuit breaker engages.

| ID         | Scenario                                                      | How to run                                                                                                                                                                                                                       | Expected                                                                                                                                                             | Failure mode                                                                                                     |
| ---------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **T.D.1**  | Cache HIT amortizes Inoreader calls                           | Call `search_radar` twice with identical args within 6h                                                                                                                                                                          | First call: `cacheHit: false`, ~6 Inoreader calls (visible in Cloudflare access logs or website's traffic). Second call: `cacheHit: true`, 0 Inoreader calls         | Second call also `cacheHit: false` (caching broken — budget regression)                                          |
| **T.D.2**  | Cache key includes category                                   | Call with `category=pe-ma` then `category=enterprise-tech`                                                                                                                                                                       | Two separate cache entries; both fetch from Inoreader on first call of each                                                                                          | Second call returns `pe-ma` results (cache key not category-aware)                                               |
| **T.D.3**  | Force circuit-open via direct Upstash set (Strategy 1 above)  | Set `mcp:radar:circuit-open` manually                                                                                                                                                                                            | Subsequent radar tool calls return 503 with `Retry-After`; `/health` shows `inoreader: 'degraded'` after the cached status TTL refreshes; non-radar tools unaffected | Radar tools return 200 with stale cache (breaker not consulted), or 5xx (broken state handling)                  |
| **T.D.4**  | Recovery from circuit-open                                    | After T.D.3, delete the flag → call radar tool                                                                                                                                                                                   | Inoreader hit; if successful, `cacheHit: false`, breaker stays closed; `/health` `inoreader: 'ok'` after next status refresh                                         | Stale 503 keeps returning (cache layer not invalidating)                                                         |
| **T.D.5**  | Inoreader access-token-stale recovery (already observed once) | Wait until website's access token expires + don't trigger website refresh; call `search_radar`                                                                                                                                   | Returns `{"error":"token-stale", "status":401, ...}` envelope                                                                                                        | Returns success despite stale token (means we're using env fallback indefinitely — bad sign), or hard crash      |
| **T.D.6**  | Refresh-token-expiry path (rare)                              | Cannot easily simulate without wrecking the website. **Defer to DEPLOY.md § C.5 paper-tested walkthrough**; verify the operator-recovery script `node scripts/inoreader-auth.mjs setup` is reachable + runs from a clean machine | Manual smoke: cd to website root, run `node scripts/inoreader-auth.mjs setup`; verify it prints an auth URL                                                          | Script errors before printing URL (means recovery path is broken)                                                |
| **T.D.7**  | Inoreader timeout                                             | Simulate by injecting a network delay; OR observe natural-occurrence during soak                                                                                                                                                 | `{"error":"network-timeout", "status":504}` after `FETCH_TIMEOUT_MS = 5000`                                                                                          | Hangs >5s or returns 5xx                                                                                         |
| **T.D.8**  | Inoreader 5xx (other than 429)                                | Hard to simulate; observe naturally during soak                                                                                                                                                                                  | `{"error":"upstream-error", "status":<5xx>}` envelope; circuit breaker NOT opened (5xx ≠ 429)                                                                        | Breaker opens unnecessarily; or 5xx propagates raw                                                               |
| **T.D.9**  | `/health` `inoreaderObservedAt` updates on radar call         | Call `search_radar` (success). Wait 30s. Call `/health`.                                                                                                                                                                         | `inoreaderObservedAt` reflects the recent call's timestamp (within seconds)                                                                                          | Stale timestamp (status cache not updating)                                                                      |
| **T.D.10** | Worker reads OAuth token from Inoreader DB read-only          | Set `INOREADER_ACCESS_TOKEN` env to gibberish via `wrangler secret put`; redeploy; call `search_radar`                                                                                                                           | Worker reads from `inoreader:access_token` Upstash key (Path 2 read-only token), gets the website's actual token, succeeds                                           | If radar fails with bad-token error: Worker is using env fallback when it shouldn't be (Path 2 invariant broken) |

---

## Section E — Observability

| ID         | Scenario                                        | How to run                                                                                                                                                            | Expected                                                                                                         | Failure mode                                                                       |
| ---------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **T.E.1**  | `wrangler tail` shows every request             | `wrangler tail --env staging` in one terminal; smoke prompt in another                                                                                                | Each request logs `event: mcp.request` with `keyOwner`, `path`, `status`, `durationMs`                           | Logs missing or partial                                                            |
| **T.E.2**  | Authorization header NEVER logged               | `wrangler tail --search "Bearer"` after a normal request                                                                                                              | No matches (zero log lines containing `Bearer`)                                                                  | Token in logs (CRITICAL — safeLog regression)                                      |
| **T.E.3**  | Cookie header NEVER logged                      | Similar — `wrangler tail --search "Cookie"` after a request that included a Cookie                                                                                    | No matches                                                                                                       | Cookie in logs (privacy leak)                                                      |
| **T.E.4**  | Sentry captures unhandled exception             | Trigger a deliberate handler crash (deploy a temporary endpoint that throws; OR wait for natural occurrence)                                                          | Sentry receives exception with `keyOwner` + `path` tags; alert rule "MCP unhandled exception" fires email        | Exception not in Sentry, or tags missing                                           |
| **T.E.5**  | Sentry breadcrumbs preserve request context     | Same as T.E.4; inspect breadcrumb chain in Sentry UI                                                                                                                  | Breadcrumbs include the relevant tool calls leading to the crash                                                 | No breadcrumbs (instrumentation broken)                                            |
| **T.E.6**  | `/health` shape matches Path 2 spec             | `curl.exe $env:MCP_URL/health`                                                                                                                                        | Fields: `ok`, `version`, `gitSha`, `phase`, `upstashMcp`, `upstashInoreader`, `inoreader`, `inoreaderObservedAt` | Missing fields, or pre-Path-2 single `redis` field present                         |
| **T.E.7**  | `/health` doesn't leak access token             | `curl.exe $env:MCP_URL/health` then check raw response body for token-like strings                                                                                    | No values resembling Inoreader OAuth tokens (per `health.ts` PRIVACY note — probe-result discarded)              | Access token visible (CRITICAL — implementation regression on the privacy comment) |
| **T.E.8**  | Health probes are cheap (no Inoreader API call) | Loop 100 calls: `1..100 \| ForEach-Object { curl.exe -s $env:MCP_URL/health > $null }`. Then check Inoreader's daily-call counter (Inoreader dev portal) for movement | Daily Inoreader call count unchanged from `/health` traffic alone                                                | Each `/health` call burns Inoreader budget (Q8 violated)                           |
| **T.E.9**  | `/health` ok semantics                          | Set `mcp:inoreader:last-status` to a fresh `degraded` entry; call `/health`                                                                                           | `inoreader: 'degraded'`, `ok: false`                                                                             | Aggregate `ok` calculation wrong                                                   |
| **T.E.10** | Sentry alert rules fire                         | Per SENTRY_MANUAL_SETUP.md, configured 4 rules with email actions. Trigger conditions for #1 (unhandled exception) and #4 (5xx rate, if Sentry plan supports).        | Email arrives within ~5 min of trigger                                                                           | Alerts silent — verify alert config wasn't lost on Sentry-side                     |
| **T.E.11** | `auth.failed` captures to Sentry                | Send 5+ requests with `Authorization: Bearer wrong-key` over a 10-minute window. Inspect Sentry → Issues for the `auth.failed` group.                                 | Sentry receives the `auth.failed` event(s) with `path` tag + `reason: bearer-rejected`; Alert #2 fires email     | Sentry shows nothing → BL-032 captureMessage AC not closed (see "Known gaps")      |
| **T.E.12** | `inoreader-rate-limit` captures to Sentry       | Force the breaker open via the Section D D.3 "direct breaker-flag set" technique OR wait for natural Inoreader 429. Trigger one radar tool call after.                | Sentry receives the `inoreader-rate-limit` event with `keyOwner` + `path` tags; Alert #3 fires email             | Sentry shows nothing → BL-032 captureMessage AC not closed (see "Known gaps")      |

---

## Section F — Onboarding flows

Three distinct flows: **operator** (RP, the deploy lead), **internal team-member** (e.g., AB, an analyst getting their first MCP key), and **external consumer** (deferred to BL-033 with OAuth, but a happy-path script for static-bearer external onboarding is useful for soak).

### Operator soak onboarding (already executed)

Reference: DEPLOY.md Part A § A.1-A.7. **Already executed during this initial deploy run; this section documents the baseline so future operators can repeat against new envs (BL-035 or successor projects).**

### T.F.1 — Internal team-member onboarding (happy path)

Imagine a team-member "AB" (initials of an analyst) wants MCP access. Use this scenario to dry-run [DEPLOY.md § C.1](../../../mcp-server/src/docs/operations/DEPLOY.md) end-to-end before ever needing it for real.

**Operator (RP) steps**:

1. **Generate a fresh token** for AB using the snippets in [DEPLOY.md § A.6 step 1](../../../mcp-server/src/docs/operations/DEPLOY.md) (openssl / Node / PowerShell — pick what's on the operator's path)
2. **Save in operator's password manager** with note `GST MCP — AB — production` (or `staging` if just doing a soak rehearsal)
3. **Set the Wrangler secret**:
   ```powershell
   cd mcp-server
   npx wrangler secret put MCP_KEY_AB --env staging
   # Paste the AB token at the prompt
   ```
4. **Verify**: `npx wrangler secret list --env staging` shows `MCP_KEY_AB` alongside `MCP_KEY_RP`
5. **Share with AB** via a secure channel (password-manager share, encrypted email, in-person device drop) — NEVER plaintext Slack
6. **Notify**: send AB a link to [`REMOTE_CLIENT_SETUP.md`](../../../mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md)

**Team-member (AB) steps**:

1. Receive token from operator (via password-manager share)
2. Save token in AB's password manager
3. Configure Claude Desktop per `REMOTE_CLIENT_SETUP.md` § Claude Desktop:
   - Pre-install `mcp-remote` globally
   - Edit `claude_desktop_config.json` (correct path for AB's OS/install method)
   - Add `gst-mcp-staging` connector entry with the AB token
   - Restart Claude Desktop
4. Smoke prompt: _"Using gst-mcp-staging, list the GST portfolio facets."_
5. Verify response: deduplicated themes/categories shown

**Verification scenarios** (T.F.1.x — for the operator to run after AB completes onboarding):

| ID      | What to verify                              | How                                                                                                                                     |
| ------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| T.F.1.a | AB's calls show `keyOwner: "AB"` in logs    | `wrangler tail --search '"keyOwner":"AB"'`                                                                                              |
| T.F.1.b | AB's rate-limit counter independent of RP's | Have AB hammer; RP's calls still get 200                                                                                                |
| T.F.1.c | AB's documentation discoverability          | AB self-reports: "Could you find the doc to set up your config?" If they had to ask, the doc has a discoverability gap                  |
| T.F.1.d | First-blocker-to-fix time                   | Stopwatch from "AB receives token" to "first successful tool call." Target: <15 min. Anything over 30 min indicates onboarding friction |

### T.F.2 — External consumer onboarding (soak rehearsal for BL-033)

External-consumer onboarding is officially BL-033 territory (OAuth-based), but a **static-bearer rehearsal** during the soak surfaces the same operational pain points without the OAuth-server engineering cost. Use this scenario to dry-run what a future external onboarding might look like, and document any gaps that surface so BL-033's planning has real data.

**Scenario**: a hypothetical external consumer "ExtCo" (an investee company's CTO) requests MCP access for their team.

**Operator (RP) checklist** — the path this dry-run would take:

1. **Verify ExtCo has an authorized engagement**: an active GST relationship, signed scope-of-work that contemplates AI/MCP access, identified primary contact (e.g., `ext.cto@extco.com`)
2. **Generate a unique key per consumer** — single shared key per company is acceptable for BL-032 baseline (BL-033 will move to per-individual OAuth):
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
3. **Set the Wrangler secret with a meaningful name**:
   ```powershell
   npx wrangler secret put MCP_KEY_EXTCO --env staging
   ```
   The keyOwner (`EXTCO`) makes external traffic visually distinct from internal in `wrangler tail`. **Note**: this is the place to flag a BL-033 prerequisite — at scale, a fixed-format `MCP_KEY_<INITIALS>` doesn't generalize to org-name suffixes; document any conflicts encountered
4. **Document the scope** somewhere durable — operator notebook, Linear ticket, signed agreement: who at ExtCo can use the token, allowed tool surface (currently all 10 — BL-033 adds per-key scoping), expected daily volume, expiry/review date
5. **Generate a tailored onboarding email/PDF** — not just "here's a token" but: scope summary, REMOTE_CLIENT_SETUP.md link, rate-limit etiquette (per RATE_LIMITS.md), incident contact, expected response time for support, key-rotation timeline
6. **Deliver the token** via your team's agreed external-secure channel (not the same as internal — likely a password-manager share to ExtCo's primary contact's dedicated identity)
7. **Schedule a follow-up** at 24h + 7d to confirm working state and surface friction

**Verification scenarios for this dry-run**:

| ID      | What to surface                                    | How                                                                                                                                                                                                                                        |
| ------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T.F.2.a | All-the-docs-they-need are public                  | Check that REMOTE_CLIENT_SETUP.md, RATE_LIMITS.md, and AUTH.md aren't gated behind auth (they're under `mcp-server/` and visible to anyone with the URL — confirm)                                                                         |
| T.F.2.b | Sensitive operational details aren't in those docs | Re-skim the three docs from an external-reader perspective: any references to internal Linear tickets, internal Slack channels, internal Vercel project IDs, RP's specific email, etc., that should be redacted before sharing externally? |
| T.F.2.c | Token has clear scope at issuance                  | Operator notebook entry exists with: who can use it, what tools, what budget, when to review. **This is paper-only for BL-032; BL-033 enforces in code**                                                                                   |
| T.F.2.d | Bearer key compromise simulation                   | Halfway through the rehearsal, simulate "ExtCo accidentally pasted token in Slack" — operator triggers rotation per AUTH.md § Rotate, ExtCo updates client config with new token. Time-to-rotate-and-restore: target <10 min               |
| T.F.2.e | Revocation simulation                              | Simulate end-of-engagement: operator deletes `MCP_KEY_EXTCO`. ExtCo's calls 401 within ~30s. ExtCo client behavior: does it surface a clear message, or does Claude/Cursor say something cryptic? Document the consumer-side experience    |

**Outcomes worth capturing for BL-033 input**:

- Onboarding-flow friction time (15-min target; capture actual)
- Number of doc-clarification questions during rehearsal (each suggests a doc improvement)
- Consumer client used (Claude Desktop / Code / Cursor / ChatGPT) — informs which client's config gets the most attention in BL-033's docs
- Did the rehearsal surface any tool that an external consumer actually shouldn't see? (e.g., `search_portfolio` returns anonymized data — but is "anonymized" sufficient if an external consumer might recognize a deal from the structure?). If yes, this is a BL-033 scoping requirement
- Did anything in the operator's notebook need to become structured data instead? (e.g., a YAML file mapping keyOwner → metadata)

---

## Section G — Disaster recovery

| ID        | Scenario                                                 | How to run                                                                                                                                                                    | Expected                                                                                                                                                            | Failure mode                                                                                                                       |
| --------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **T.G.1** | Wrangler rollback works                                  | After a deploy: `npx wrangler rollback --env staging` (pick previous version from list)                                                                                       | Rollback completes in <30s; `/health` returns previous version's `gitSha`; tools still work                                                                         | Rollback errors, or rolled-back version has stale secrets                                                                          |
| **T.G.2** | Secrets persist through rollback                         | After T.G.1: `wrangler secret list --env staging`                                                                                                                             | All 9 secrets present and correct                                                                                                                                   | Secrets lost (would be a Cloudflare bug; flag in Sentry)                                                                           |
| **T.G.3** | Sentry continues capturing post-rollback                 | Post-rollback, trigger an exception                                                                                                                                           | Sentry receives it; alert fires                                                                                                                                     | Sentry connection broken (DSN secret lost)                                                                                         |
| **T.G.4** | MCP DB hard-delete recovery                              | Delete the MCP DB in Upstash (test on a throwaway DB only — DO NOT do this on the real MCP DB during soak). Recreate. Update `UPSTASH_MCP_REST_*` Wrangler secrets. Redeploy. | After recovery: `/health` `upstashMcp: 'ok'`; rate limiter starts from empty counters (acceptable since per-day window resets); circuit breaker reset (acceptable). | Worker permanently broken; or stale-state behavior                                                                                 |
| **T.G.5** | Inoreader DB Read-Only token rotated by website team     | Coordinate with whoever owns Vercel: regenerate Read-Only token, update Worker's `UPSTASH_INOREADER_REST_TOKEN`, redeploy                                                     | `/health` `upstashInoreader: 'ok'`; radar tools resume after redeploy                                                                                               | Coordination gap surfaced (e.g., website team didn't know Worker shared the DB; Q13 Resolved-revision context wasn't communicated) |
| **T.G.6** | Cloudflare account compromise — operator can revoke fast | Simulate by spinning up a throwaway Cloudflare account and deploying there; document the revocation steps                                                                     | Operator can `wrangler logout`, rotate Cloudflare API tokens, redeploy elsewhere within ~30 min                                                                     | Recovery requires Cloudflare-side support tickets (deploy keys not under operator's direct control)                                |

---

## Section H — Performance & latency

Target numbers from BL-032 outcomes (BACKLOG.md): p95 <500ms non-radar tools, p95 <2s radar (cold), <200ms radar (warm).

**Latency-measurement helper** — paste once per soak session; reuse across H.1 through H.6:

```powershell
# Returns the median + p95 of a tool call's wall-clock latency over N runs.
function Measure-McpLatency {
  param(
    [Parameter(Mandatory)] [string] $Method,
    [hashtable] $Params = @{},
    [int] $N = 10
  )
  $samples = @()
  1..$N | ForEach-Object {
    $sample = (Measure-Command { Invoke-McpRequest -Method $Method -Params $Params -Id $_ }).TotalMilliseconds
    $samples += $sample
  }
  $sorted = $samples | Sort-Object
  $median = $sorted[[math]::Floor($N / 2)]
  $p95 = $sorted[[math]::Floor($N * 0.95) - 1]
  [PSCustomObject]@{ N=$N; MedianMs=[math]::Round($median, 1); P95Ms=[math]::Round($p95, 1); Samples=$samples }
}
# Usage:
#   Measure-McpLatency -Method "tools/call" -Params @{ name="list_portfolio_facets"; arguments=@{} } -N 10
```

| ID        | Scenario                       | How to run                                                                                                                                                                             | Target                                                     | Failure mode                                                                       |
| --------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **T.H.1** | Cold-isolate latency           | Wait 5+ min after last call (lets Workers isolate spin down); `Measure-McpLatency -Method "tools/list" -N 1` (single sample — first call is the cold one)                              | <800ms (cold start adds ~200-300ms over warm)              | >2s consistently                                                                   |
| **T.H.2** | Warm-isolate non-radar latency | Right after T.H.1's cold call, run `Measure-McpLatency -Method "tools/call" -Params @{name="list_portfolio_facets"; arguments=@{}} -N 10` — 2nd-10th samples are warm                  | p95 <500ms                                                 | Substantially over (>1s) — investigate via Sentry tracing                          |
| **T.H.3** | Radar cold (cache miss)        | `Measure-McpLatency -Method "tools/call" -Params @{name="search_radar"; arguments=@{category="ai-automation"}} -N 1` (use a category you haven't called within 6h to force cache miss) | <2s                                                        | >5s — Inoreader is slow OR our fetch path is regressed                             |
| **T.H.4** | Radar warm (cache hit)         | Same call within 6h: `Measure-McpLatency -Method "tools/call" -Params @{name="search_radar"; arguments=@{category="ai-automation"}} -N 10`                                             | p95 <200ms                                                 | >500ms — Upstash latency, or cache deserialization regression                      |
| **T.H.5** | Latency under concurrent load  | Open 5 PowerShell windows; in each: `1..20 \| ForEach-Object { Invoke-McpRequest -Method "tools/list" -Id $_ }`. Compare median latencies vs T.H.2's solo run                          | No latency cliff (p95 holds within target ±20%)            | p95 doubles → Worker has a hidden serialization point                              |
| **T.H.6** | `/health` latency budget       | `1..100 \| ForEach-Object { (Measure-Command { curl.exe -s $env:MCP_URL/health > $null }).TotalMilliseconds } \| Measure-Object -Average -Maximum`                                     | Median <50ms (Promise.all over 3 cheap probes); p95 <150ms | Substantially over → Upstash REST latency from Cloudflare's edge unexpectedly slow |

---

## Section I — Security

| ID         | Scenario                                            | How to run                                                                                                                                                                                       | Expected                                                                | Severity if fails                                                                                 |
| ---------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **T.I.1**  | Authorization header strip in logs                  | T.E.2 above; this is the same scenario from a security framing                                                                                                                                   | No matches                                                              | **CRITICAL** — token leak                                                                         |
| **T.I.2**  | CORS preflight rejects unknown origin               | `curl.exe -i -X OPTIONS $env:MCP_URL/mcp -H "Origin: https://evil.example.com" -H "Access-Control-Request-Method: POST"`                                                                         | 403 (or 204 with CORS headers absent — depending on cors.ts impl)       | 204 with `Access-Control-Allow-Origin: *` (would let any site relay user's bearer token)          |
| **T.I.3**  | CORS preflight accepts known origin                 | Same with `Origin: https://claude.ai`                                                                                                                                                            | 204 with `Access-Control-Allow-Origin: https://claude.ai` (echoed back) | Wildcard or no-CORS-headers                                                                       |
| **T.I.4**  | Bearer keyOwner extraction is pinned                | After T.A.13, find the regex/parser in auth/bearer.ts. Confirm it strips just the `MCP_KEY_` prefix and uses the suffix verbatim — not e.g. lowercase the suffix or splitting on additional `_`s | Code review pass                                                        | Off-by-one in suffix extraction (could let a token leak via misattributed logs)                   |
| **T.I.5**  | Token comparison is constant-time                   | Code review or measurement (T.A.15 above)                                                                                                                                                        | Constant-time `crypto.timingSafeEqual` or equivalent                    | Plain `===` comparison                                                                            |
| **T.I.6**  | No raw `console.log` in worker code                 | `npm run lint` enforces `no-console` in `mcp-server/src/worker.ts` per eslint config                                                                                                             | Lint passes; raw `console.log` would fail                               | Lint rule disabled or removed                                                                     |
| **T.I.7**  | Health probe doesn't leak access token              | T.E.7 above; security framing                                                                                                                                                                    | No token in response body                                               | **CRITICAL** — token leak                                                                         |
| **T.I.8**  | wrangler.toml has no plaintext secrets              | PowerShell: `Select-String -Path mcp-server/wrangler.toml -Pattern '(?i)token\|secret\|key'`. bash: `grep -iE 'token\|secret\|key' mcp-server/wrangler.toml`                                     | Only secret NAMES in comments; no values                                | Plaintext secret in committed file (CRITICAL)                                                     |
| **T.I.9**  | Production deploy doesn't include source maps       | After `npm run deploy:production`, check the deployed bundle via Cloudflare dashboard → Workers → gst-mcp → bundle inspector                                                                     | No `.map` files in the bundle                                           | Source maps exposed (would aid an attacker — moderate severity)                                   |
| **T.I.10** | Worker bundle doesn't ship `_local-only.ts` content | After deploy, call `tools/list` — confirm `search_radar_offline` and `search_radar_cache` aren't in the response                                                                                 | 10 transport-portable tools only                                        | Stdio-only tools registered → would attempt to read files (404s, but a regression worth catching) |

---

## Section J — Schema & contract integrity

These regression checks ensure tools' input/output schemas stay in lockstep with the website wizards (BL-031.95 contract) and that Path 2's typing changes haven't drifted.

| ID        | Scenario                                                    | How to run                                                                                                         | Expected                                                                          |
| --------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **T.J.1** | Tool registry parity (stdio vs Worker)                      | `tests/integration/registry-snapshot.test.ts` (BL-031.85)                                                          | Test passes — snapshot match                                                      |
| **T.J.2** | Each tool's input schema matches its website-page filter UI | Manual: pick a tool (e.g., search_portfolio); compare its zod schema to the actual filter chips on `/ma-portfolio` | Drift signals require a BACKLOG entry for the next BL-031.95-style alignment pass |
| **T.J.3** | Each tool's deeplink reproduces filter state                | T.B.2.f, T.B.3.h above                                                                                             | Round-trip works                                                                  |
| **T.J.4** | `'unknown'` sentinel coverage (BL-031.95 Phase 2)           | T.B.3.b above                                                                                                      | Every enum field accepts `'unknown'`; engine widens conservatively                |
| **T.J.5** | Path 2 Env interface declares all 4 new secrets typed       | Code review of `worker.ts` Env interface                                                                           | Each is `?: string` not `unknown` (better autocomplete + lint signal)             |

---

## Section K — Claude workflow consumption

The other sections test "does the Worker behave correctly when called." This section tests **"does Claude USE it well in real conversations."** Different signal — qualitative, non-deterministic, surfaces tool-description quality, prompt-library design, error-message UX, and the consumption patterns that determine whether GST team-members and (post-BL-033) external consumers actually get value out of the surface.

**Why this section is structured differently**:

- **Outcomes are qualitative, not pass/fail**. Claude's behavior is non-deterministic; a single prompt run is a sample, not a proof. Findings are scored on a 1-5 rubric (below).
- **Prose-consumption matters more than protocol correctness**. A Worker that returns perfect JSON is useless if Claude can't translate that JSON into prose a consultant would actually paste into a deal memo. The most valuable findings here surface in _what Claude writes back_, not in HTTP status codes.
- **Improvement opportunities outnumber defects**. Each unsatisfying response is a candidate for: clearer tool description, better Zod `.describe()` text, BL-031.75-style prompt-library expansion, schema simplification, or — if a workflow is genuinely impossible — a feature gap to log against BL-033.

### Scoring rubric

For each prose prompt or workflow scenario, score these dimensions 1-5:

| Score              | Meaning                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **5 — Excellent**  | Claude picked the right tool(s), gathered inputs cleanly, produced prose a consultant would paste into client work without edits   |
| **4 — Good**       | Right tool, mostly-right inputs, useful prose with minor edits needed                                                              |
| **3 — Acceptable** | Right tool eventually, some friction (extra clarifying prompts, light hallucination, awkward synthesis) but the user gets value    |
| **2 — Poor**       | Wrong tool initially OR significant hallucination OR prose that misrepresents tool output. Recoverable with re-prompting           |
| **1 — Failing**    | Did not use the MCP tool when it should have, OR fabricated tool output, OR prose-synthesis introduced false claims about GST data |

**Scoring dimensions** (score each 1-5 per applicable):

- **Tool selection accuracy** — picked the right tool (or right tool first, then refined)
- **Input completeness** — gathered required inputs without hallucinating; asked for missing ones rather than guessing
- **Result synthesis** — converted JSON tool output to useful prose (not just dumped the JSON)
- **Composition** (multi-tool only) — chained tools correctly, passed data between them faithfully
- **Failure handling** — when a tool errored or returned empty, recovered gracefully (vs hiding it from user)
- **Overall workflow value** — would a real consultant in this situation be satisfied?

A finding worth logging is anything where any score < 4 — those are improvement signals, not just defects.

### K.1 — Structured workflow scenarios

These are protocol-level checks of conversational behavior — closer in shape to the rest of the playbook but still qualitative. Run from Claude Desktop with the `gst-mcp-staging` connector enabled.

| ID           | Scenario                                                | How to run                                                                                                                                                                         | Expected                                                                                                                                                                                                         | Failure mode                                                                                                            |
| ------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **T.K.1.1**  | Tool discoverability without explicit naming            | Prompt: _"What kind of due-diligence work has GST done in healthcare?"_                                                                                                            | Claude calls `search_portfolio` with `theme = "Healthcare Tech"` (or equivalent), returns prose summary                                                                                                          | Claude reaches for web search, or asks "I don't have access to GST's portfolio" — means tool description is too narrow  |
| **T.K.1.2**  | Required-field handling — graceful elicitation          | Prompt: _"Generate a diligence agenda for a SaaS company"_ (only 1 of 13 required inputs provided)                                                                                 | Claude either (a) asks for the missing 12 inputs in a structured way, OR (b) uses `'unknown'` sentinel for unknowable fields per BL-031.95. Does NOT hallucinate values                                          | Claude fabricates inputs ("I'll assume 51-200 headcount") — silently fills gaps without flagging                        |
| **T.K.1.3**  | Multi-step chain composition                            | Prompt: _"Find recent radar items about kubernetes from the last week, then for the most discussed one, generate a quick due-diligence question list as if it were a deal target"_ | Claude calls `search_radar` first, evaluates results, then calls `generate_diligence_agenda` with reasonable inferred inputs from the radar item                                                                 | Single-tool only; or skips the radar call and hallucinates "kubernetes news"                                            |
| **T.K.1.4**  | Long-conversation tool-result memory                    | Turn 1: call `list_portfolio_facets`. Turn 5 (after unrelated chat): _"Search portfolio for the first engagement-category we listed earlier"_                                      | Claude reuses the earlier result without re-calling the tool (or re-calls only if it correctly identifies that the data could have changed — neither is wrong, but Claude shouldn't pretend the result is novel) | Re-calls unnecessarily AND treats result as fresh; or worse, fabricates the earlier list                                |
| **T.K.1.5**  | Error-message UX (503 circuit-open)                     | Pre-test: open the circuit breaker per Strategy 1 in Section D. Then prompt: _"What's in the radar today?"_                                                                        | Claude renders the 503/Retry-After to the user clearly: "the radar tool is temporarily unavailable due to upstream rate limits; try again after X minutes"                                                       | Claude says "no radar items today" — silently suppresses the error, leaving the user with a falsely-empty answer        |
| **T.K.1.6**  | Cross-client parity                                     | Run T.K.1.1 from Claude Desktop, Claude Code, and Cursor in turn (if all three are configured)                                                                                     | Same tool selection; comparable result quality (some prose-style variation is fine)                                                                                                                              | One client picks a different tool, or one client returns markedly different result quality                              |
| **T.K.1.7**  | Connector disambiguation (local stdio + remote staging) | With both `gst` (local stdio) and `gst-mcp-staging` (remote) configured, prompt: _"Search the radar"_ (no connector named)                                                         | Document which one Claude picks and why. Verify whichever it picks gives the right answer                                                                                                                        | Claude calls BOTH (wasteful), or randomly picks one without ability to predict                                          |
| **T.K.1.8**  | Token / context window cost                             | Run a 5-turn conversation that exercises 3 different tools; estimate tokens consumed by tool descriptions + JSON results in Claude's context                                       | Tool descriptions <500 tokens combined; max-output JSON <2k tokens per response                                                                                                                                  | Tool result JSONs are bloated (>5k tokens for typical use) — surfaces as a request to add `summary`-mode flags to tools |
| **T.K.1.9**  | Hallucination detection — fake project                  | Prompt: _"What did GST find during the diligence on Acme Corp's $40M Series C?"_ (no such engagement exists)                                                                       | Claude calls `search_portfolio`, returns empty, says "I don't see an Acme Corp engagement in GST's portfolio"                                                                                                    | Claude fabricates engagement details, possibly mixing data from unrelated real engagements                              |
| **T.K.1.10** | Stale-data / freshness signaling                        | Prompt: _"What did the radar surface today?"_ — twice, ~10 min apart                                                                                                               | Claude either re-calls each time (right answer for time-sensitive radar data) OR explicitly notes "based on data from X minutes ago, do you want me to re-check?"                                                | Claude treats the cached first call as freshly-current                                                                  |

### K.2 — Golden prose prompts (organic consumption)

Run each prompt verbatim in a fresh Claude Desktop conversation (don't pre-load context). Score per the rubric above. The prompts are intentionally consultant-flavored — they reflect actual usage patterns rather than test-rig probes.

#### K.2.a — Discovery prompts (does Claude find the right tool?)

These prompts deliberately do NOT name a tool. Claude's job is to navigate the registry on tool descriptions alone.

```
T.K.2.a.1 — "Does GST have any past work in regulated industries — financial services or healthcare?"
T.K.2.a.2 — "What does the GST radar show in the past few days about AI agent governance?"
T.K.2.a.3 — "Help me think through what a tech-debt assessment for a 200-person SaaS engineering org would cost annually if 30% of dev time is going to maintenance."
T.K.2.a.4 — "What are the GDPR requirements for a B2B SaaS company headquartered in the US but with EU customers?"
T.K.2.a.5 — "How would I assess whether a target company's infrastructure cost discipline is mature enough for a PE roll-up?"
```

For each: did Claude pick the right tool first try? If not, where did it default to (web search? hallucination? "I don't have access"?) — that's a tool-description gap to log.

#### K.2.b — Single-tool natural prompts (one per tool)

Exercise each of the 10 transport-portable tools through a natural-language path, not a parameter-passing path. The point is to verify the tool description is good enough that Claude knows when AND how to call it.

```
T.K.2.b.1  list_portfolio_facets    "What categories of M&A engagements has GST worked on?"
T.K.2.b.2  search_portfolio         "Pull GST's relevant engagements involving SaaS marketplaces sold to PE."
T.K.2.b.3  generate_diligence_agenda "Draft a diligence agenda for a Series B B2B SaaS target — modern cloud-native stack, ~150 engineers, EU+US presence, healthcare-adjacent data."
T.K.2.b.4  assess_infrastructure_cost_governance "Run an ICG assessment for a Series B PE-backed SaaS company; here are my answers to the standard ICG questions: [paste a few real answers]"
T.K.2.b.5  compute_techpar          "Run a TechPar benchmark — Series B SaaS, $20M ARR, $4M annual cloud + infra, 75 engineers, 30% growth, deepdive mode."
T.K.2.b.6  estimate_tech_debt_cost  "Estimate the carrying cost of tech debt for a 100-person eng org at $200K/eng, 35% maintenance burden, weekly deploys, 6 incidents/mo, $40M ARR."
T.K.2.b.7  search_regulations       "What are the key data-residency requirements I need to think about for a SaaS company expanding into Quebec?"
T.K.2.b.8  list_regulation_facets   "What jurisdictions does GST's regulatory map cover?"
T.K.2.b.9  search_radar             "Pull recent radar items in the AI/automation category."
T.K.2.b.10 get_latest_insights      "Show me GST's most recent annotated radar items — the FYI tier."
```

For each, score: tool selection (1-5), input completeness (1-5), result synthesis (1-5), overall (1-5).

#### K.2.c — Multi-tool chain workflows (real-work scenarios)

These are the load-bearing prose tests. Each prompt deliberately requires composing 2+ tools to answer. The signal is whether Claude orchestrates them correctly.

```
T.K.2.c.1 — Deal-target intake
"I'm meeting tomorrow with a target: B2B SaaS, healthcare-RCM, $30M ARR, Series B, hybrid-legacy with active modernization in flight, 180 engineers across US+EU. Pull any comparable past GST engagements, then draft the diligence agenda I should walk in with."
[Expects: search_portfolio → generate_diligence_agenda. Score: tool selection, composition, synthesis, overall.]

T.K.2.c.2 — Radar-driven thesis development
"Find recent radar items in the PE/M&A category from the last week. For any deals or themes that might intersect with GST's past tech-due-diligence work, surface the comparable engagements."
[Expects: search_radar → search_portfolio. Score multi-tool composition + synthesis quality.]

T.K.2.c.3 — Cost-governance assessment + roll-up suggestion
"For a Series B PE-backed SaaS company in financial services where my client is hitting elevated tech costs (above the healthy benchmark), give me both a TechPar benchmark and an ICG maturity assessment, then suggest the top 3 remediation areas across both lenses."
[Expects: compute_techpar + assess_infrastructure_cost_governance run in parallel; synthesis combines both. Score composition + synthesis.]

T.K.2.c.4 — Regulatory-blast-radius scoping
"My target operates in the US, Canada (including Quebec), and the EU; processes patient data; uses LLM-based features. What are the regulatory frameworks I need to flag in my diligence memo, and any past GST work I can reference?"
[Expects: search_regulations (multi-jurisdiction) → search_portfolio (healthcare/AI). Score: multi-jurisdiction handling, AI/healthcare regulatory awareness, GST-engagement linking.]

T.K.2.c.5 — Tech-debt + roadmap argument
"For a 250-engineer org spending 40% of capacity on maintenance with $80M ARR, calculate tech-debt carrying cost AND show me ICG questions where they're likely failing. Then draft a one-paragraph board pitch for why a remediation budget is necessary."
[Expects: estimate_tech_debt_cost + assess_infrastructure_cost_governance + synthesis to consultant prose. Score across all dimensions.]
```

#### K.2.d — Edge cases & error recovery

```
T.K.2.d.1 — Compute techpar with deliberately invalid input
"Run a TechPar benchmark with $0 ARR." [Expect: Zod rejection; Claude either re-asks or surfaces the error clearly.]

T.K.2.d.2 — Search portfolio with 0 results
"Find GST engagements in agriculture-vertical SaaS for sub-$1M ARR seed-stage targets." [Expect: empty result; Claude doesn't fabricate engagements.]

T.K.2.d.3 — Radar during budget exhaustion (run when circuit is open per Section D Strategy 1)
"What's in the radar today?" [Expect: Claude renders 503; user sees "temporarily unavailable + retry later."]

T.K.2.d.4 — Generate agenda with all 13 fields = 'unknown'
"Generate a diligence agenda but I have no information about the target yet — just early-stage curiosity." [Expect: Claude uses 'unknown' sentinel per BL-031.95; result is a wide, low-confidence agenda with the unknownDimensionCount callout.]

T.K.2.d.5 — Mixed valid + invalid enum
"Generate an agenda for a target with productType='vaporware' and revenueRange='5-25m'." [Expect: clear Zod rejection on productType; Claude either asks for clarification or proceeds with the rest.]
```

#### K.2.e — Mid-engagement consultant scenarios

These are the highest-fidelity simulations of real GST work. They reflect actual time-pressured consulting moments.

```
T.K.2.e.1 — Pre-call prep (under time pressure)
"I'm in 5 min on a call with a target's CTO. They make B2B inventory-management software, ~$8M ARR, growing 50% YoY, hybrid cloud + on-prem. Give me my top 5 questions for the architecture portion of the call."

T.K.2.e.2 — Mid-call lookup
"The target just told me they have 'patchwork microservices on K8s with some legacy monoliths'. What follow-up questions does that signal?"

T.K.2.e.3 — Post-call synthesis
"From this call, I learned: Series C, $50M ARR, modern cloud-native, 220 engineers, EU+US, multi-region, healthcare data, low data-sensitivity processing model, recently modernized. What attention areas should appear in my diligence memo?"

T.K.2.e.4 — Investor-facing summary
"For a partner update tomorrow, summarize GST's most relevant work in B2B SaaS / financial services / regulatory diligence over the last 18 months."

T.K.2.e.5 — Triage hot lead
"A founder just sent me their pitch — they're a $15M-ARR Series B AI-tooling company looking for tech advisory. Pull any radar items + past engagements that would inform whether this is a fit, and tell me if I should take the call."
```

### K.3 — Findings template (for prose tests)

For any prompt where overall score < 4, log a finding using this template (in addition to the standard finding block from earlier in the doc):

```
## T.K.<id> — <prompt summary>
- Date: <date>
- Tester: <initials>
- Client used: Claude Desktop / Claude Code / Cursor / ChatGPT / [other]
- Prompt verbatim:
  > [exact text used]

- Tool selection: <1-5> — <which tool did Claude pick? right one?>
- Input completeness: <1-5> — <did it ask for missing fields, or hallucinate?>
- Result synthesis: <1-5> — <did the prose answer feel like a useful consultant artifact?>
- Composition (multi-tool): <1-5 or N/A>
- Failure handling: <1-5 or N/A>
- Overall workflow value: <1-5>

- Improvement opportunity: <which knob to turn?>
  - [ ] Tool description gap — `<tool name>`'s description doesn't make its applicability clear → revise in `mcp-server/src/tools/<file>.ts`
  - [ ] Zod `.describe()` gap on field `<field>` — Claude couldn't infer how to format the input → expand the `.describe()` text
  - [ ] BL-031.75 prompt-library candidate — this exact pattern recurs; should ship as a saved Prompt
  - [ ] Schema simplification — input shape forces Claude into too many clarifying questions
  - [ ] Result-shape simplification — JSON output too verbose for the conversational context
  - [ ] Error-envelope copy — Claude renders our error envelopes badly; revise the `message` field text
  - [ ] BL-033 feature gap — workflow is genuinely impossible without OAuth / per-user scoping / [other future feature]
  - [ ] Other: <free text>

- Notes: <anything else, including verbatim Claude response excerpts if helpful>
```

### K.4 — Acting on findings

Findings flow back to specific change-points in the codebase. Match each finding to the right artifact:

| Finding type                           | Where to fix                                                            | Example                                                                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool description too vague             | `mcp-server/src/tools/<tool>.ts` `description` field                    | "search_portfolio works for any company name" → narrow to "GST's anonymized M&A portfolio"                                                        |
| Zod field description unclear          | `mcp-server/src/tools/<tool>.ts` `.describe()` strings                  | A field where Claude consistently asks for clarification                                                                                          |
| Workflow recurs across testers         | New entry in BL-031.75 prompt library (`mcp-server/src/prompts/`)       | T.K.2.e.1's "pre-call prep in 5 min" pattern                                                                                                      |
| Result JSON bloat                      | Tool's response shape (consider adding a `summary`-mode flag)           | Default `search_radar` returns 30 full items × ~500 tokens each = 15k tokens                                                                      |
| Error message UX bad                   | `mcp-server/src/lib/inoreader-worker.ts` error-envelope `message` field | "Inoreader access token is stale" → "I couldn't fetch radar data right now; the website's token-refresh job will recover this within ~5 minutes." |
| Cross-client behavior diverges         | Document the divergence in `REMOTE_CLIENT_SETUP.md`                     | One client renders SSE differently from another                                                                                                   |
| Genuine feature gap (not BL-032 scope) | New entry in `BACKLOG.md` referencing the test ID                       | T.K.1.5's "Claude can't tell user when budget is exhausted because there's no UX surface for that" → BL-033 issue                                 |

**Cadence**: aim for ≥3 prose-test sessions across the soak week (one per day for the first three days; revisit after fixes if the surface gets adjusted mid-soak). Each session: pick 5-10 prompts from K.2; run; score; capture findings. After the soak, the aggregated K-section findings should produce a prioritized list of: (a) quick-fix tool-description PRs, (b) BL-031.75 prompt-library expansion candidates, (c) BL-033 inputs for the external-pilot scope discussion.

---

## Pre-production gate checklist

These scenarios are **must-pass** before clicking `npm run deploy:production`. Anything failing here is a hard blocker. Non-blocking scenarios from the broader playbook can ship with documented known-issues.

### Must pass (Critical)

- [ ] T.A.1 — Valid token works
- [ ] T.A.2 — Missing Authorization → 401
- [ ] T.A.5 — Wrong token → 401
- [ ] T.A.9 — keyOwner attribution accurate (no token leak)
- [ ] T.A.12 — Revoked key → 401, not 5xx
- [ ] T.B.1.a, T.B.2.a, T.B.3.a, T.B.4.a, T.B.5.a, T.B.6.a, T.B.7.a, T.B.8.a — at least one happy path per tool
- [ ] T.B.9.a + T.B.10.a — radar tools work end-to-end against real Inoreader
- [ ] T.C.1 — Rate limiter caps at 60/min cleanly
- [ ] T.C.2 — RFC 9331 headers on every response
- [ ] T.C.5 — Per-key counters independent
- [ ] T.C.7 — Graceful skip when MCP DB unreachable
- [ ] T.D.1 — 6h cache HIT amortizes Inoreader budget
- [ ] T.D.3 — Circuit-breaker engages on `mcp:radar:circuit-open` flag
- [ ] T.E.1 — Every request logs via wrangler tail
- [ ] T.E.2 — Authorization header NOT in logs (token leak check)
- [ ] T.E.6 — `/health` shape matches Path 2 spec
- [ ] T.E.7 — `/health` doesn't leak access token
- [ ] T.G.1 — Rollback works (proves recovery path)
- [ ] T.I.1, T.I.7, T.I.8, T.I.10 — security baseline (no token leaks; `_local-only` not on Worker)

### Should pass (Important; can ship with documented exceptions)

- [ ] T.A.3, T.A.4, T.A.6 — auth corner cases
- [ ] T.A.10, T.A.11 — token rotation works
- [ ] T.B.\* edge cases (each tool's invalid-input handling)
- [ ] T.C.6 — radar tools subject to tighter limits (5/min, 50/day)
- [ ] T.C.8 — sliding-window decay observable
- [ ] T.D.5 — token-stale recovery (already observed once)
- [ ] T.E.4 — Sentry captures unhandled exceptions
- [ ] T.F.1.\* — internal team-member onboarding (no real team-member needs to be added pre-prod, but the dry-run should pass)
- [ ] T.H.2, T.H.4 — warm-path latency targets
- [ ] T.K.1.1 — Tool discoverability (≥3/5 across testers)
- [ ] T.K.1.2 — Required-field handling (≥4/5 — hallucinated inputs are a real defect, not a usability concern)
- [ ] T.K.1.5 — Error-message UX during 503 (≥4/5 — silent error suppression IS a defect)
- [ ] T.K.1.9 — Hallucination-detection on fake project (≥4/5 — fabricated GST data is a quality gate)
- [ ] At least 1 prose session run (5+ prompts from K.2.b/c with average overall ≥3/5)

### Can defer to post-prod soak (Minor / Cosmetic)

- T.A.15 — timing-safe token comparison (Important for BL-033, not blocking BL-032 internal soak)
- T.D.6 — Refresh-token-expiry path (rare; documented in DEPLOY.md C.5)
- T.D.7, T.D.8 — Inoreader timeout / 5xx (hard to simulate; observe naturally)
- T.F.2.\* — External consumer rehearsal (BL-033 work; do as time permits during soak for early signal)
- T.G.4, T.G.5 — Hard DB recovery (destructive; test in next BL-035-style substrate change instead)
- T.H.1 — Cold-isolate latency (acceptable to be slow on first call after a quiet period)
- T.J.2 — Wizard parity (regression check; do during BL-031.95 follow-ups, not soak)
- T.K.1.6 — Cross-client parity (only Claude Desktop is required for BL-032 baseline; Cursor + ChatGPT are nice-to-have signal for BL-033)
- T.K.1.8 — Token / context window cost analysis (not blocking; informs BL-032.75 observability + BL-033 cost-modeling)
- T.K.2.\* — Most golden prose prompts are improvement-opportunity capture, not deploy-blocking. Findings flow to BL-032 closure / BL-031.75 prompt-library expansion / BL-033 input

---

## Known gaps / things hard to test pre-prod

Documenting honestly so the soak doesn't pretend to cover ground it actually doesn't:

1. **Real Inoreader 429** — naturally would take a full day of intentional budget burning, which is destructive (affects the website's radar feed). Strategy 1 (direct breaker-flag set) approximates the post-429 state but doesn't exercise the FIRST 429-detection path inside `inoreader-worker.ts`. **Mitigation**: catch in production via Sentry alert "Inoreader budget breach" once captured-to-Sentry lands (BL-032 → BL-033 follow-up).

   **Sub-gap — captureMessage AC pending**: Today the `auth.failed` (worker.ts:111-118) and `inoreader-rate-limit` (radar-live.ts:117) handlers early-return / catch-and-convert without calling `Sentry.captureMessage` / `captureException`, so [SENTRY_MANUAL_SETUP.md](SENTRY_MANUAL_SETUP.md) Alerts #2 + #3 sit dormant by design. T.E.11 + T.E.12 (Section E) verify the post-AC behavior; both will FAIL until the captureMessage AC closes (tracked under BL-032 Observability — see [BACKLOG.md](BACKLOG.md#bl-032-mcp-server--internal-remote-phase-2)). During this soak, expected behavior for both cases is "no Sentry event"; treat that as the open AC, not a regression.

2. **Actual external consumer onboarding** — BL-033 territory. T.F.2 dry-runs the operational shape but doesn't validate against real external constraints (their compliance review of our auth model, their security team's questions, etc.). **Mitigation**: the BL-033 plan should include a paid-pilot scope-of-work template informed by T.F.2 findings during this soak.

3. **High concurrent traffic** (>20 simultaneous connections from different agents) — soak is single-operator-scale. **Mitigation**: T.H.5 stress-tests at 5x; full load-shaping is BL-032.75 scope.

4. **Long-running MCP sessions** — Claude Desktop typically keeps the bridge alive for hours or days. Failures that emerge only after 24+ hours of uptime (memory leaks, slow socket exhaustion in mcp-remote, etc.) won't surface in single-day testing. **Mitigation**: the week-long soak itself IS this test; track via Sentry and operator-reported friction.

5. **Cloudflare-platform issues** (Worker isolate restarts mid-request, regional outages, DDoS pattern matching false positives) — entirely out of operator control. **Mitigation**: monitoring + acknowledge in incident response; not BL-032 scope to harden.

6. **OAuth substrate** — not present in BL-032 by design (Q11 → static bearer for soak). Anything OAuth-related is BL-033 scope, including discovery, consent flows, refresh, scope grants. T.F.2 surfaces the gap; doesn't fill it.

---

## Recording the soak — running tally template

A simple "scoreboard" you can keep alongside the per-finding blocks. Update as you progress:

```
| Day | Section | Scenarios run | Pass | Fail | Inconclusive | Notes |
| --- | --- | --- | --- | --- | --- | --- |
|  1  | A     |  10           |  9   |  1   |  0           | T.A.6 fail — see BL-032-soak-1 issue |
|  2  | B     |  18           |  18  |  0   |  0           |  |
|  3  | C, D  |  18           |  17  |  0   |  1           | T.D.6 inconclusive — refresh-token simulation deferred |
|  4  | E, F  |  15           |  14  |  1   |  0           | T.F.1.c — discoverability gap; AB couldn't find the doc |
|  5  | G, H  |  11           |  10  |  0   |  1           | T.H.5 inconclusive — couldn't generate enough concurrent load |
|  6  | I, J, K.1 |  25       |  24  |  0   |  1           | T.K.1.6 cross-client deferred (Cursor not configured) |
|  7  | K.2 prose | 10 prompts | avg overall: 3.6/5 | -- | -- | 4 improvement opportunities logged: 2 tool descriptions, 1 BL-031.75 candidate, 1 BL-033 feature-gap |
|  8  | gates |  per checklist|  ... |  ... |  ...         | If gates pass, deploy production; else triage and re-soak |
```

Note: Section K's prose tests use a different scoring axis — average overall score (1-5) instead of pass/fail counts. Track them separately so the scoreboard's pass/fail columns stay meaningful for the deterministic-test sections.

---

_Last updated: 2026-05-06 — initial authoring at the start of the BL-032 soak window. Scenarios reflect the surface as of `feature-mcp1` HEAD (Path 2 dual-client refactor + 12 doc-fix commits + this testing playbook). Findings collected during the 2026-05-06 → ~2026-05-13 soak window will inform the BL-032 closure stanza in BACKLOG.md._
