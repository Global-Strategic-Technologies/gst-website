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
> **Test ID convention**: `T.<section>.<n>` — section letters group by area (A=Auth, B=Tools, C=Rate-limit, D=Inoreader, E=Observability, F=Onboarding, G=DR, H=Performance, I=Security, J=Schema). IDs are stable; new tests append, deprecated tests get `~~strikethrough~~` rather than removal so historical results stay decodable.

---

## How to use this doc

**During the soak week**: pick a section per session; execute scenarios in order; record outcomes per the [§ Findings template](#findings-template). Aim for ≥80% scenario coverage across the week. Don't try to run all scenarios in one sitting — the per-day Inoreader budget alone makes that imprudent.

**After a finding surfaces a real defect**: open a tracking issue (or a closure-stanza-style note in the BL-032 design doc), reference the test ID, and fix-or-defer per blast radius. Mark the scenario in this doc with the fix's commit SHA so future runs can confirm the regression doesn't recur.

**For the production deploy gate**: every scenario marked **Critical** in the [§ Pre-production gate checklist](#pre-production-gate-checklist) must pass before clicking `npm run deploy:production`. Scenarios marked Non-blocking can have known failures that are acknowledged but allowed to ship.

**Shell adaptation**: PowerShell-flavored snippets shown for Windows operators. The bash equivalents follow DEPLOY.md § B.3's translation table.

**Setup once per soak session**:

```powershell
$env:MCP_URL = "https://mcp-staging.globalstrategic.tech"
$env:MCP_KEY = "<your MCP_KEY_RP value from password manager>"

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

Each transport-portable tool has a contract documented in [`mcp-server/src/docs/contracts/`](../../../mcp-server/src/docs/contracts/) (BL-031.85). The tests below cover happy path + edge cases per tool. Use Claude Desktop, Claude Code (project-level via `.mcp.json`), or direct curl — note the client used in each finding.

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

| ID      | Variant                                                  | Expected                                                                                                                                  |
| ------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| T.B.3.a | All 13 fields valid                                      | Response has `topics[]`, `attentionAreas[]`, `triggerMap`, `metadata.totalQuestions ≥ 30`, `unknownDimensionCount = 0`, `deeplink`        |
| T.B.3.b | All fields = `'unknown'` (BL-031.95 sentinel)            | `unknownDimensionCount = 13` — agenda widens conservatively rather than failing; response includes a low-confidence callout per BL-031.95 |
| T.B.3.c | Mix of unknown + known                                   | `unknownDimensionCount` matches count of `'unknown'`s passed                                                                              |
| T.B.3.d | Invalid enum value                                       | Returns MCP error envelope (NOT thrown exception); error message names the bad field                                                      |
| T.B.3.e | Missing required field                                   | MCP error; error names the missing field                                                                                                  |
| T.B.3.f | Geographies array with both `'unknown'` and a real value | Validates per BL-031.95 contract — `['unknown']` alone is fine; mixed array behavior should be documented                                 |
| T.B.3.g | Geographies as empty array                               | Rejected (must have ≥ 1 element per Zod schema)                                                                                           |
| T.B.3.h | Deeplink round-trip                                      | Open the deeplink in a browser → wizard pre-fills with same inputs                                                                        |

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

| ID      | Variant                                  | Expected                                                                                                                                                           |
| ------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T.B.4.a | Answers map (canonical stage `series-b`) | `overallScore` 0-100, `maturityLevel` ∈ {Reactive, Aware, Optimizing, Strategic}, sorted recommendations, `stageContext` shows ICG-native equivalent (`series-bc`) |
| T.B.4.b | ICG-native stage value (`series-bc`)     | Same shape; `stageContext` shows the canonical mapping                                                                                                             |
| T.B.4.c | Use `-1` "Not sure" answer               | Tracked separately; doesn't penalize the way `0` does                                                                                                              |
| T.B.4.d | Empty answers map                        | Returns score = 0 and `notAnsweredCount` reflects all questions                                                                                                    |
| T.B.4.e | Invalid question ID                      | MCP error or filtered silently — document which                                                                                                                    |
| T.B.4.f | Score out of range (-2 or 4)             | Zod rejection clean                                                                                                                                                |

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

### Can defer to post-prod soak (Minor / Cosmetic)

- T.A.15 — timing-safe token comparison (Important for BL-033, not blocking BL-032 internal soak)
- T.D.6 — Refresh-token-expiry path (rare; documented in DEPLOY.md C.5)
- T.D.7, T.D.8 — Inoreader timeout / 5xx (hard to simulate; observe naturally)
- T.F.2.\* — External consumer rehearsal (BL-033 work; do as time permits during soak for early signal)
- T.G.4, T.G.5 — Hard DB recovery (destructive; test in next BL-035-style substrate change instead)
- T.H.1 — Cold-isolate latency (acceptable to be slow on first call after a quiet period)
- T.J.2 — Wizard parity (regression check; do during BL-031.95 follow-ups, not soak)

---

## Known gaps / things hard to test pre-prod

Documenting honestly so the soak doesn't pretend to cover ground it actually doesn't:

1. **Real Inoreader 429** — naturally would take a full day of intentional budget burning, which is destructive (affects the website's radar feed). Strategy 1 (direct breaker-flag set) approximates the post-429 state but doesn't exercise the FIRST 429-detection path inside `inoreader-worker.ts`. **Mitigation**: catch in production via Sentry alert "Inoreader budget breach" once captured-to-Sentry lands (BL-032 → BL-033 follow-up).

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
|  6  | I, J  |  15           |  15  |  0   |  0           |  |
|  7  | gates |  per checklist|  ... |  ... |  ...         | If gates pass, deploy production; else triage and re-soak |
```

---

_Last updated: 2026-05-06 — initial authoring at the start of the BL-032 soak window. Scenarios reflect the surface as of `feature-mcp1` HEAD (Path 2 dual-client refactor + 12 doc-fix commits + this testing playbook). Findings collected during the 2026-05-06 → ~2026-05-13 soak window will inform the BL-032 closure stanza in BACKLOG.md._
