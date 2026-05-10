# BL-032 — Soak-Week Testing Findings Log

> **Purpose**: operator log for outcomes of scenarios executed against the BL-032 staging soak. One block per finding, append-only within a soak window. Critical findings are mirrored into the [Pre-production gate checklist](MCP_SERVER_REMOTE_BL-032_TESTING.md#pre-production-gate-checklist) until resolved.
>
> **Companion**: [`MCP_SERVER_REMOTE_BL-032_TESTING.md`](MCP_SERVER_REMOTE_BL-032_TESTING.md) — scenario catalogue, test ID convention, expected outcomes. Read that doc first for any test ID's setup and pass/fail criteria.
>
> **Soak window opened**: 2026-05-06 (RP). This file was created 2026-05-07 as the persistent notebook for that soak and any subsequent re-runs after BL-033 / BL-034 / BL-035 substrate changes.

---

## How to use this file

1. Pick a scenario from the [playbook](MCP_SERVER_REMOTE_BL-032_TESTING.md), execute it, and append a finding block (template below) under the matching section heading.
2. Use the **exact test ID** from the playbook (`T.<section>.<n>`) so cross-doc references stay decodable. If you exercise an unlisted scenario, file it under § Ad-hoc / unscheduled and assign a fresh ID like `T.X.<n>`.
3. **PASS outcomes are worth logging too** — they're the regression evidence future runs check against. A terse PASS block (date, tester, "PASS — matches expected") is enough.
4. **FAIL or INCONCLUSIVE outcomes** must include severity and a remediation pointer (issue link, commit SHA after fix, or `deferred — track in BACKLOG.md` with rationale). Per [CLAUDE.md § 4a](../../../.claude/CLAUDE.md), prefer fixing in-session over deferring.
5. Once a finding is resolved (commit SHA referenced), do **not** delete the block — strike through the title (`~~T.X.n — title~~`) and add a `Resolved:` line. Historical context stays decodable.

---

## Findings template

Copy-paste this block per finding. Date format is ISO-8601. Tester is initials (e.g., `RP`). The `Command/Action` field captures the exact invocation (curl/PowerShell snippet) or operator action (e.g., "rotate `MCP_KEY_RP`") so the finding stays decodable without round-tripping back to the playbook — copy from the playbook's "How to run" column and adjust if your run deviated.

```
## T.<section>.<n> — <short title>
- Date: YYYY-MM-DD
- Tester: <initials>
- Client: <Claude Desktop | Claude Code (.mcp.json) | direct curl | wrangler tail | wrangler CLI | Upstash REST | n/a>
- Command/Action: <exact command run or operator action taken — quote from playbook "How to run">
- Outcome: PASS / FAIL / INCONCLUSIVE
- Observed: <what actually happened, terse>
- Expected: <what was supposed to happen — quote from playbook column>
- Severity (if fail): Critical / Important / Minor / Cosmetic
- Remediation: <issue link, commit SHA, or "deferred — track in BACKLOG.md">
- Notes: <anything else worth recording — surprising context, env details>
```

---

## Section A — Authentication & access

## T.A.1 — Valid token

- Date: 2026-05-08
- Tester: RP
- Outcome: PASS
- Observed:
  generate_diligence_agenda
  search_portfolio
  list_portfolio_facets
  assess_infrastructure_cost_governance
  compute_techpar
  estimate_tech_debt_cost
  search_regulations
  list_regulation_facets
  search_radar
  get_latest_insights
- Expected: 10 tool names returned
- Severity (if fail):
- Remediation:
- Notes:

## T.A.2 — Valid token

- Date: 2026-05-09
- Tester: RP
- Outcome: PASS
- Observed:

  HTTP/1.1 401 Unauthorized
  Date: Sun, 10 May 2026 01:57:37 GMT
  Content-Type: application/json
  Content-Length: 65
  Connection: keep-alive
  WWW-Authenticate: Bearer realm="gst-mcp"
  Report-To: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=1Es3zvbpZi43zVW4R7rZk4aARjYMimLEHcWxUdkBLkAQk7umW35jdhMaR5dm4EoHsF9FGeeggUUkDGPB6zzszptJgHXh37gjwg6CYg5zHnNWrUAS2fYmM54aW9sDRdQictQAcWrXs0MWshTRSCiA1Tvast%2Bveej4iniaJbFwBQ%3D%3D"}]}
  Nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
  Server: cloudflare
  CF-RAY: 9f95558c0a09f1ff-GRU
  alt-svc: h3=":443"; ma=86400

- Expected: unauthorized error, missing authorization header
- Severity (if fail):
- Remediation:
- Notes:

## T.A.3 — Wrong Bearer schema

- Date: 2026-05-09
- Tester: RP
- Outcome: PASS
- Client: curl.exe -i $env:MCP_URL/mcp -X POST -H "Authorization: Basic abc=="
- Observed:

  {"error":"unauthorized","message":"Authorization header must use Bearer scheme"}

- Expected: 401 with reason indicating non-Bearer scheme rejected
- Severity (if fail):
- Remediation:
- Notes:

## T.A.4 — Empty Bearer schema

- Date: 2026-05-09
- Tester: RP
- Outcome: FAIL
- Client: curl.exe -i $env:MCP_URL/mcp -X POST -H "Authorization: Bearer "
- Observed:

{"error":"unauthorized","message":"Authorization header must use Bearer scheme"}

- Expected: 401 with reason indicating empty token
- Severity (if fail): Minor
- Remediation:
- Notes:

## T.A.5 — Wrong token value rejected with 401 + bearer-rejected reason

- Date: 2026-05-07
- Tester: RP
- Client: direct curl (PowerShell 7 `Invoke-WebRequest` via `Invoke-McpRequest` helper)
- Outcome: PASS
- Observed: `Authorization: Bearer <45-char non-matching value>` against staging returned `HTTP 401 Unauthorized`, `Content-Type: application/json`, body `{"error":"unauthorized","message":"Invalid Bearer token"}`. No 5xx, no 403.
- Expected: 401, reason = `bearer-rejected`, NOT 403.
- Notes: Captured incidentally while debugging T.A.1 setup (see T.X.1) — the operator had pasted the literal placeholder string from the playbook setup snippet instead of a real token. The Worker correctly distinguished "wrong-value" from "missing-header" — body says `"Invalid Bearer token"`, not `"Missing Authorization header"` (T.A.2's expected message), confirming the auth code differentiates the two failure modes.

## T.A.6 — Token with leading/trailing whitespace

- Date:
- Tester:
- Client: direct curl
- Command/Action: `curl.exe -i $env:MCP_URL/mcp -X POST -H "Authorization: Bearer  $env:MCP_KEY  "` (note extra spaces around the token)
- Outcome:
- Observed:
- Expected: Either accepts (after trim) or rejects cleanly with 401. **Whichever it does, behavior must be deterministic** (no inconsistent intermittent results)
- Severity (if fail):
- Remediation:
- Notes:

## T.A.7 — Multiple Authorization headers

- Date:
- Tester:
- Client: direct curl
- Command/Action: Send two `Authorization` headers in the same request — one valid (`Bearer $env:MCP_KEY`), one bogus (`Bearer not-a-real-token`). Vary order across runs.
- Outcome:
- Observed:
- Expected: RFC 9110-compliant — server picks one and either honors it or rejects. Document which deterministically.
- Severity (if fail):
- Remediation:
- Notes:

## T.A.8 — Token in lowercase header (`authorization` not `Authorization`)

- Date:
- Tester:
- Client: direct curl
- Command/Action: `curl.exe -i $env:MCP_URL/mcp -X POST -H "authorization: Bearer $env:MCP_KEY"`
- Outcome:
- Observed:
- Expected: 200 (HTTP headers are case-insensitive per RFC)
- Severity (if fail):
- Remediation:
- Notes:

## T.A.9 — keyOwner attribution accuracy

- Date:
- Tester:
- Client: direct curl + wrangler tail
- Command/Action: Make any successful tool call, then in another terminal: `npx wrangler tail --env staging --search '"keyOwner":"RP"'`
- Outcome:
- Observed:
- Expected: Tail line shows `keyOwner: "RP"` (suffix from `MCP_KEY_RP`). Authorization header value MUST NOT appear anywhere in the log line.
- Severity (if fail): Critical if full token leaks via Authorization header logging (would mean safeLog regression)
- Remediation:
- Notes:

## T.A.10 — Token rotation mid-session

- Date:
- Tester:
- Client: Claude Desktop (post operator-rotation)
- Command/Action: Operator rotates `MCP_KEY_RP` per AUTH.md Rotate procedure. Tester continues issuing tool calls from Claude Desktop using the OLD token value (do not restart the client).
- Outcome:
- Observed:
- Expected: Old token starts returning 401 within ~30s (next isolate cold start)
- Severity (if fail):
- Remediation:
- Notes:

## T.A.11 — After rotation, new token works

- Date:
- Tester:
- Client: Claude Desktop
- Command/Action: After T.A.10, configure Claude Desktop with the NEW token value (update `claude_desktop_config.json`, restart). Run a smoke prompt that triggers any tool call.
- Outcome:
- Observed:
- Expected: 200, tools work normally
- Severity (if fail):
- Remediation:
- Notes:

## T.A.12 — Revoked key behavior

- Date:
- Tester:
- Client: wrangler CLI + direct curl
- Command/Action: `npx wrangler secret delete MCP_KEY_RP --env staging`, then call any tool with the deleted key value.
- Outcome:
- Observed:
- Expected: 401, reason = `bearer-rejected` (NOT a 5xx — secret-not-bound shouldn't crash auth)
- Severity (if fail): Critical if 5xx or auth-bypass behavior
- Remediation:
- Notes:

## T.A.13 — Multiple keys per env (after team-member onboarding)

- Date:
- Tester:
- Client: direct curl + wrangler tail
- Command/Action: Operator sets `MCP_KEY_AB` (separate test key). Tester calls tools with each token in turn (RP and AB). Operator inspects `wrangler tail --env staging` to confirm keyOwner attribution.
- Outcome:
- Observed:
- Expected: Each token works; logs distinguish keyOwner correctly per request (`"keyOwner":"RP"` vs `"keyOwner":"AB"`)
- Severity (if fail):
- Remediation:
- Notes:

## T.A.14 — Same token value reused across keys

- Date:
- Tester:
- Client: wrangler CLI + direct curl
- Command/Action: Operator sets `MCP_KEY_RP = X` and `MCP_KEY_AB = X` (identical value). Make a call with that value and observe attribution.
- Outcome:
- Observed:
- Expected: Behavior is documented one way or the other (e.g., first-match wins, or rejected as duplicate). Consistency matters more than which choice.
- Severity (if fail): Critical if crashes or randomly attributes to either keyOwner
- Remediation:
- Notes:

## T.A.15 — Token comparison timing-safe

- Date:
- Tester:
- Client: direct curl (with timing measurement)
- Command/Action: Call with a token that's character-for-character close to the real token (e.g., last char different). Time the response with `Measure-Command { Invoke-McpRequest ... }`. Compare against T.A.5's outright-wrong-token timing across N=20+ samples each.
- Outcome:
- Observed:
- Expected: Latency identical to T.A.5's case (constant-time comparison via `crypto.timingSafeEqual` or equivalent)
- Severity (if fail): Important — timing diff suggests `===` comparison; would let an attacker enumerate token char-by-char (matters for BL-033, not blocking BL-032 internal soak)
- Remediation:
- Notes:

## Section B — Tool execution (10-tool surface)

> Default Client per playbook is `direct curl (PowerShell helper)` via the `Invoke-McpRequest` function from the playbook's "Setup once per soak session" block. Substitute Claude Desktop / Claude Code if you exercised the variant from a different client and adjust the Command/Action line accordingly.

### T.B.1 — `list_portfolio_facets`

#### T.B.1.a — Happy path (no args)

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "list_portfolio_facets"; arguments = @{} }`
- Outcome:
- Observed:
- Expected: Returns `{ themes, engagementCategories, growthStages, years }` arrays — non-empty, deduplicated, sorted
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.1.b — Spurious args ignored

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "list_portfolio_facets"; arguments = @{ unrecognized = "ignored" } }`
- Outcome:
- Observed:
- Expected: Same response as T.B.1.a, no error
- Severity (if fail):
- Remediation:
- Notes:

### T.B.2 — `search_portfolio`

#### T.B.2.a — Free-text matches multiple fields

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "search_portfolio"; arguments = @{ search = "kubernetes" } }`
- Outcome:
- Observed:
- Expected: Returns projects mentioning K8s in `summary`, `technologies`, or other indexed fields. Verify against `src/data/ma-portfolio/projects.json`
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.2.b — Empty search → all 61 projects

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "search_portfolio"; arguments = @{} }`
- Outcome:
- Observed:
- Expected: `matches.Count = 61` (per BACKLOG.md BL-031 + BL-031.95)
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.2.c — Theme + engagement filter compose

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "search_portfolio"; arguments = @{ theme = "<a real theme>"; engagement = "Buy-Side" } }`
- Outcome:
- Observed:
- Expected: Count ≤ either filter alone (intersection semantics)
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.2.d — "all" sentinel for both filters

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "search_portfolio"; arguments = @{ theme = "all"; engagement = "all" } }`
- Outcome:
- Observed:
- Expected: Same as T.B.2.b (all 61 projects)
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.2.e — Invalid theme → either filter ignored OR error

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "search_portfolio"; arguments = @{ theme = "not-a-real-theme" } }`
- Outcome:
- Observed:
- Expected: Document which behavior; should be stable (always-ignore OR always-error, not both)
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.2.f — Deeplink populated

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Run any successful search variant above; inspect the `deeplink` field in the response
- Outcome:
- Observed:
- Expected: `deeplink: "https://globalstrategic.tech/ma-portfolio?..."` reflecting filter state
- Severity (if fail):
- Remediation:
- Notes:

### T.B.3 — `generate_diligence_agenda`

> Reusable `$inputs` snippet from playbook:
>
> ```powershell
> $inputs = @{ transactionType = "majority-stake"; productType = "b2b-saas"; techArchetype = "modern-cloud-native"; headcount = "51-200"; revenueRange = "5-25m"; growthStage = "scaling"; companyAge = "5-10yr"; geographies = @("us","eu"); businessModel = "productized-platform"; scaleIntensity = "moderate"; transformationState = "stable"; dataSensitivity = "moderate"; operatingModel = "product-aligned-teams" }
> ```

#### T.B.3.a — All 13 fields valid

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "generate_diligence_agenda"; arguments = $inputs }` (using `$inputs` from above)
- Outcome:
- Observed:
- Expected: Response has `topics[]`, `attentionAreas[]`, `triggerMap`, `metadata.totalQuestions ≥ 30`, `unknownDimensionCount = 0`, `deeplink`
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.3.b — All fields = `'unknown'` (BL-031.95 sentinel)

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Build `$unknownInputs` with every field set to `"unknown"` (and `geographies = @("unknown")`); call `generate_diligence_agenda` with it
- Outcome:
- Observed:
- Expected: `unknownDimensionCount = 13`; agenda widens conservatively rather than failing; response includes a low-confidence callout per BL-031.95
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.3.c — Mix of unknown + known

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Take `$inputs` from T.B.3.a; set 4-6 fields to `"unknown"`, leave the rest concrete; call the tool
- Outcome:
- Observed:
- Expected: `unknownDimensionCount` matches the count of `'unknown'`s passed
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.3.d — Invalid enum value

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Take `$inputs`; set `productType = "vaporware"` (not in enum); call the tool
- Outcome:
- Observed:
- Expected: MCP error envelope (NOT thrown exception); error message names the bad field
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.3.e — Missing required field

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Take `$inputs`; remove one required field (e.g., `$inputs.Remove("revenueRange")`); call the tool
- Outcome:
- Observed:
- Expected: MCP error; error message names the missing field
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.3.f — Geographies array with both `'unknown'` and a real value

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Take `$inputs`; set `geographies = @("unknown", "us")`; call the tool
- Outcome:
- Observed:
- Expected: Validates per BL-031.95 contract — `['unknown']` alone is fine; mixed-array behavior should be documented
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.3.g — Geographies as empty array

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Take `$inputs`; set `geographies = @()`; call the tool
- Outcome:
- Observed:
- Expected: Rejected (must have ≥ 1 element per Zod schema)
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.3.h — Deeplink round-trip

- Date:
- Tester:
- Client: direct curl (PowerShell helper) + browser
- Command/Action: From T.B.3.a's response, copy the `deeplink` URL and open it in a browser
- Outcome:
- Observed:
- Expected: Wizard pre-fills with the same 13 input values
- Severity (if fail):
- Remediation:
- Notes:

### T.B.4 — `assess_infrastructure_cost_governance`

#### T.B.4.a — Answers map (canonical stage `series-b`)

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "assess_infrastructure_cost_governance"; arguments = @{ answers = @{ q1 = 2; q2 = 1; q3 = 0; q4 = 3 }; companyStage = "series-b" } }` (use real ICG question IDs)
- Outcome:
- Observed:
- Expected: `overallScore` 0-100, `maturityLevel` ∈ {Reactive, Aware, Optimizing, Strategic}, sorted recommendations, `stageContext` shows ICG-native equivalent (`series-bc`)
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.4.b — ICG-native stage value (`series-bc`)

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Same as T.B.4.a but `companyStage = "series-bc"`
- Outcome:
- Observed:
- Expected: Same response shape; `stageContext` shows the canonical mapping
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.4.c — Use `-1` "Not sure" answer

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Same as T.B.4.a but include at least one `q* = -1` answer
- Outcome:
- Observed:
- Expected: Tracked separately; doesn't penalize the way `0` does
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.4.d — Empty answers map

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "assess_infrastructure_cost_governance"; arguments = @{ answers = @{}; companyStage = "series-b" } }`
- Outcome:
- Observed:
- Expected: Returns score = 0 and `notAnsweredCount` reflects all questions
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.4.e — Invalid question ID

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Include a non-existent question ID in answers (e.g., `qZZ = 2`)
- Outcome:
- Observed:
- Expected: MCP error or filtered silently — document which behavior
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.4.f — Score out of range (-2 or 4)

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Pass `q1 = 4` (or `q1 = -2`) — outside the valid -1..3 range
- Outcome:
- Observed:
- Expected: Zod rejection clean
- Severity (if fail):
- Remediation:
- Notes:

### T.B.5 — `compute_techpar`

> Per BL-031.95, all 6 money fields are annual dollars (the previous monthly/×12 for `infraHostingAnnual` was renamed). Tests should exercise the renamed field name.

#### T.B.5.a — Quick mode, canonical stage

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "compute_techpar"; arguments = @{ mode = "quick"; companyStage = "series-b"; arr = 20000000; infraHostingAnnual = 4000000 } }` (fill in remaining required fields per Zod schema)
- Outcome:
- Observed:
- Expected: Returns `totalTechPct`, `zone` ∈ {underinvest, ahead, healthy, above, elevated, critical}, KPIs, gap projection, `deeplink`
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.5.b — Deepdive mode

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Same shape as T.B.5.a but `mode = "deepdive"` and supply `engCost`, `prodCost`, `toolingCost` (and a stale `rdOpEx` to confirm it's ignored)
- Outcome:
- Observed:
- Expected: `engCost + prodCost + toolingCost` synthesized as R&D OpEx; raw `rdOpEx` ignored
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.5.c — Cash vs GAAP capex view

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Run T.B.5.a then run again with `rdCapEx > 0`; compare `total` and `zone` between the two responses
- Outcome:
- Observed:
- Expected: Different `total` and `zone` values when `rdCapEx > 0`
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.5.d — `arr = 0`

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Take T.B.5.a inputs; set `arr = 0`
- Outcome:
- Observed:
- Expected: Engine returns null in JS — surfaced as MCP error per BL-031.95
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.5.e — `infraHostingAnnual = 0`

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Take T.B.5.a inputs; set `infraHostingAnnual = 0`
- Outcome:
- Observed:
- Expected: Same null → MCP error
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.5.f — TechPar-native stage `series_bc` (underscore) accepted

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Take T.B.5.a inputs; set `companyStage = "series_bc"` (underscore form)
- Outcome:
- Observed:
- Expected: Treated identically to canonical `series-b` / `series-c`
- Severity (if fail):
- Remediation:
- Notes:

### T.B.6 — `estimate_tech_debt_cost`

#### T.B.6.a — Realistic inputs

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "estimate_tech_debt_cost"; arguments = @{ teamSize = 50; avgSalary = 200000; maintenanceBurden = 0.30; deployFrequency = "weekly"; incidents = 5; mttrHours = 4; budget = 500000; arr = 50000000; remediationEfficiency = 0.80; contextSwitchOn = $true } }`
- Outcome:
- Observed:
- Expected: Returns `annualCost`, `paybackMonths`, `doraLabel = "High"`, decomposed monthly costs
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.6.b — `contextSwitchOn = false`

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Same as T.B.6.a but `contextSwitchOn = $false`
- Outcome:
- Observed:
- Expected: `contextSwitchMonthly = 0`, `totalMonthly` reduced
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.6.c — `incidents = 0`

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Same as T.B.6.a but `incidents = 0`
- Outcome:
- Observed:
- Expected: `incidentMonthly = 0`
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.6.d — `teamSize = 0`

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Same as T.B.6.a but `teamSize = 0`
- Outcome:
- Observed:
- Expected: Zod rejection (exclusiveMinimum)
- Severity (if fail):
- Remediation:
- Notes:

### T.B.7 — `search_regulations`

#### T.B.7.a — Free-text "GDPR"

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "search_regulations"; arguments = @{ search = "GDPR" } }`
- Outcome:
- Observed:
- Expected: Returns matches with `id: 'gdpr'` first (or near-first); each match has `uri`, `summary`, `keyRequirements`
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.7.b — Jurisdiction `eu` filter

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "search_regulations"; arguments = @{ jurisdiction = "eu" } }`
- Outcome:
- Observed:
- Expected: All matches scoped to EU regulations
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.7.c — Category `data-privacy` filter

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "search_regulations"; arguments = @{ category = "data-privacy" } }`
- Outcome:
- Observed:
- Expected: All matches in data-privacy category
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.7.d — `limit = 5`

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "search_regulations"; arguments = @{ limit = 5 } }`
- Outcome:
- Observed:
- Expected: Max 5 results
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.7.e — `limit = 200`

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "search_regulations"; arguments = @{ limit = 200 } }`
- Outcome:
- Observed:
- Expected: Capped at 120 (max per schema) — verify Zod enforces
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.7.f — Deeplink + filterDeeplink populated

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Run any T.B.7.a-c variant; inspect `deeplink` and `filterDeeplink` fields
- Outcome:
- Observed:
- Expected: Both URLs reflect supplied filters
- Severity (if fail):
- Remediation:
- Notes:

### T.B.8 — `list_regulation_facets`

#### T.B.8.a — Happy path

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "list_regulation_facets"; arguments = @{} }`
- Outcome:
- Observed:
- Expected: Returns deduplicated `jurisdictions[]` (e.g., `eu`, `us`, `us-ca`, `ca-qc`, `uk`) and `categories[]` (4 known values)
- Severity (if fail):
- Remediation:
- Notes:

### T.B.9 — `search_radar` (live Inoreader; budget-sensitive)

#### T.B.9.a — Category `pe-ma` happy path

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "search_radar"; arguments = @{ category = "pe-ma" } }`
- Outcome:
- Observed:
- Expected: Non-zero matches; `cacheHit: false` on first call within 6h window
- Severity (if fail):
- Remediation:
- Notes: Caveat — burns ~6 Inoreader calls; do once per soak day

#### T.B.9.b — Same call again within 6h

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Repeat T.B.9.a's call within 6h of the first
- Outcome:
- Observed:
- Expected: `cacheHit: true`; same matches as T.B.9.a; `fetchedAt` unchanged
- Severity (if fail): If cache is broken, this would be a budget regression
- Remediation:
- Notes:

#### T.B.9.c — No category (all four)

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "search_radar"; arguments = @{} }`
- Outcome:
- Observed:
- Expected: Larger match set; cache key differs from category-specific calls
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.9.d — Each of 4 categories

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Loop the four categories: `foreach ($cat in @("pe-ma","enterprise-tech","ai-automation","cyber-data")) { Invoke-McpRequest -Method "tools/call" -Params @{ name = "search_radar"; arguments = @{ category = $cat } } }`
- Outcome:
- Observed:
- Expected: All return non-zero; each populates own cache entry
- Severity (if fail):
- Remediation:
- Notes: Caveat — burns 4 × 6 = 24 Inoreader calls; only do once during soak to map cache keys

#### T.B.9.e — After Inoreader access-token refresh

- Date:
- Tester:
- Client: direct curl (PowerShell helper) + manual recovery flow
- Command/Action: Follow DEPLOY.md C.5 token-refresh recovery flow; after, call `Invoke-McpRequest -Method "tools/call" -Params @{ name = "search_radar"; arguments = @{ category = "pe-ma" } }` then `curl.exe $env:MCP_URL/health`
- Outcome:
- Observed:
- Expected: `inoreader: 'ok'` in `/health` after recovery; radar call succeeds
- Severity (if fail):
- Remediation:
- Notes: Already observed once during initial deploy

#### T.B.9.f — During simulated Inoreader 429

- Date:
- Tester:
- Client: direct curl (PowerShell helper) + Upstash REST
- Command/Action: First force the breaker open via Section D Strategy 1 (`/set/mcp:radar:circuit-open/inoreader-rate-limit` with EX=21600); then call `Invoke-McpRequest -Method "tools/call" -Params @{ name = "search_radar"; arguments = @{ category = "pe-ma" } }`
- Outcome:
- Observed:
- Expected: See Section D § T.D.3 — radar tools return 503 with `Retry-After`
- Severity (if fail):
- Remediation:
- Notes:

### T.B.10 — `get_latest_insights`

#### T.B.10.a — Default limit (10)

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "get_latest_insights"; arguments = @{} }`
- Outcome:
- Observed:
- Expected: Returns 10 FYI items, `published`-sorted newest-first; each has GST-annotation fields populated
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.10.b — Limit = 30 (max)

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "get_latest_insights"; arguments = @{ limit = 30 } }`
- Outcome:
- Observed:
- Expected: Up to 30 items
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.10.c — Limit = 31

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "get_latest_insights"; arguments = @{ limit = 31 } }`
- Outcome:
- Observed:
- Expected: Zod rejection (max: 30)
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.10.d — Limit = 0

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "get_latest_insights"; arguments = @{ limit = 0 } }`
- Outcome:
- Observed:
- Expected: Zod rejection (min: 1)
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.10.e — Category filter

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "get_latest_insights"; arguments = @{ category = "ai-automation" } }`
- Outcome:
- Observed:
- Expected: Only items matching that category
- Severity (if fail):
- Remediation:
- Notes:

## Section C — Rate-limit & circuit-breaker

## T.C.1 — Per-minute cap exhausted

- Date:
- Tester:
- Client: direct curl (PowerShell helper, in a loop)
- Command/Action: `1..70 | ForEach-Object { Invoke-McpRequest -Method "tools/list" -Id $_ }` (70 requests in <60s — B.3.7 hammer test); inspect status codes via the helper's raw-response branch or by switching to `curl.exe -i`
- Outcome:
- Observed:
- Expected: ~60 × 200, ~10 × 429; sliding-window timing affects exact split
- Severity (if fail): Critical if all 200 (limiter broken) or all 429 (limiter too strict)
- Remediation:
- Notes:

## T.C.2 — RFC 9331 headers on every response

- Date:
- Tester:
- Client: direct curl
- Command/Action: `curl.exe -i $env:MCP_URL/mcp -X POST -H "Authorization: Bearer $env:MCP_KEY" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}'` — inspect `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` on the 200 response
- Outcome:
- Observed:
- Expected: All three headers present; `Limit = 60`; `Remaining` decremented from 60; `Reset` ∈ [1, 60]
- Severity (if fail):
- Remediation:
- Notes:

## T.C.3 — `Retry-After` header on 429

- Date:
- Tester:
- Client: direct curl
- Command/Action: After T.C.1 has driven the 429 path, repeat one more `curl.exe -i ...` request and inspect the 429 response headers for `Retry-After`
- Outcome:
- Observed:
- Expected: `Retry-After: <seconds>` matches `RateLimit-Reset`
- Severity (if fail):
- Remediation:
- Notes:

## T.C.4 — Per-day cap (1000)

- Date:
- Tester:
- Client: direct curl (extended; estimate-only)
- Command/Action: Hard to test exhaustively. Estimate from per-minute hammers + sliding-window math; OR run a slow background loop (~15 req/min) for an hour and confirm counters tick correctly
- Outcome:
- Observed:
- Expected: Cap holds; per-day window separate from per-minute (counters do not bleed)
- Severity (if fail):
- Remediation:
- Notes:

## T.C.5 — Independent counters per key

- Date:
- Tester:
- Client: direct curl (PowerShell helper) — two keys
- Command/Action: With `MCP_KEY_RP` and `MCP_KEY_AB` both set as wrangler secrets, hammer one key (`1..70 | ForEach-Object { ... }` using the RP token), then make a single call with the AB token
- Outcome:
- Observed:
- Expected: Other key still gets 200 (counters are per-key)
- Severity (if fail): Critical if counters cross-pollinate
- Remediation:
- Notes:

## T.C.6 — Radar tools tighter limits (5/min, 50/day)

- Date:
- Tester:
- Client: direct curl (PowerShell helper, in a loop)
- Command/Action: Hammer `search_radar` calls varying category to bust cache: `foreach ($i in 1..10) { Invoke-McpRequest -Method "tools/call" -Params @{ name = "search_radar"; arguments = @{ category = "pe-ma"; _bust = $i } } -Id $i }`
- Outcome:
- Observed:
- Expected: Hits 429 at 5/min before reaching the 60-cap general limit
- Severity (if fail): Regression of Phase 4 if radar uses general limits
- Remediation:
- Notes:

## T.C.7 — Graceful skip when MCP DB unreachable

- Date:
- Tester:
- Client: wrangler CLI + direct curl + wrangler tail
- Command/Action: Operator: `npx wrangler secret put UPSTASH_MCP_REST_TOKEN --env staging` and paste a corrupted value → `npx wrangler deploy --env staging`. Then call any tool. Inspect `npx wrangler tail --env staging` for the `safeLog` event.
- Outcome:
- Observed:
- Expected: Worker serves auth + non-radar tools normally; `safeLog` shows `event: ratelimit.skipped, reason: upstash-mcp-not-bound`
- Severity (if fail): Critical — limiter must fail-open, not fail-closed
- Remediation:
- Notes: Restore the real token after the test

## T.C.8 — Sliding-window decay observable

- Date:
- Tester:
- Client: direct curl (PowerShell helper, in a loop)
- Command/Action: First hit the cap per T.C.1; wait 30s; then issue N more requests in a tight loop (e.g., `1..30 | ForEach-Object { Invoke-McpRequest -Method "tools/list" -Id $_ }`) and tally how many succeed
- Outcome:
- Observed:
- Expected: ~30 of the cap-60 tokens released over 30s
- Severity (if fail):
- Remediation:
- Notes:

## T.C.9 — Circuit-breaker state isolation per env

- Date:
- Tester:
- Client: direct curl + Upstash REST
- Command/Action: Open the breaker on staging via Section D Strategy 1 (`/set/mcp:radar:circuit-open/inoreader-rate-limit` with EX=21600); then call `search_radar` against staging AND against production
- Outcome:
- Observed:
- Expected: Staging radar tools → 503; production radar tools → 200
- Severity (if fail): Critical if cross-env contamination
- Remediation:
- Notes:

## T.C.10 — Manual circuit-breaker reset (DEPLOY.md C.5)

- Date:
- Tester:
- Client: Upstash REST + direct curl (PowerShell helper)
- Command/Action: Set `$env:UPSTASH_MCP_REST_URL` and `$env:UPSTASH_MCP_REST_TOKEN` from password manager, then: `curl.exe -X POST "$env:UPSTASH_MCP_REST_URL/del/mcp:radar:circuit-open" -H "Authorization: Bearer $env:UPSTASH_MCP_REST_TOKEN"`. Then call `search_radar` to confirm recovery.
- Outcome:
- Observed:
- Expected: Next radar call hits Inoreader; if Inoreader OK, breaker stays closed
- Severity (if fail): Reset doesn't take effect; state stale-cached on Worker side
- Remediation:
- Notes:

## Section D — Inoreader integration

_No findings logged yet._

## Section E — Observability

_No findings logged yet._

## Section F — Onboarding flow

_No findings logged yet._

## Section G — Disaster recovery

_No findings logged yet._

## Section H — Performance

_No findings logged yet._

## Section I — Security

_No findings logged yet._

## Section J — Schema

_No findings logged yet._

## Section K — Claude workflow consumption

_No findings logged yet._

## Section X — Ad-hoc / unscheduled

## T.X.1 — Setup snippet placeholder is a copy-paste trap

- Date: 2026-05-07
- Tester: RP
- Client: PowerShell 7.x (Windows)
- Outcome: FAIL (operator-experience defect, not a system defect)
- Observed: Operator copied the playbook's "Setup once per soak session" block verbatim into PS 7. The literal line `$env:MCP_KEY = "<your MCP_KEY_RP value from password manager>"` executed and set the env var to the placeholder text. T.A.1 then failed silently — the helper's SSE parser fell through to returning the raw HTTP response, and `(...).result.tools.name` evaluated to `$null` with no error message visible. Diagnostic confirmed the value via byte inspection: last 8 bytes of `$env:MCP_KEY` were `6D 61 6E 61 67 65 72 3E` (`manager>`), `Length` = 45 chars, matching `<your MCP_KEY_RP value from password manager>` exactly. The 401 response itself was correct — see T.A.5.
- Expected: setup completes without operator action that produces an unmistakable wrong value, OR fails fast with a clear "you didn't paste a token" signal.
- Severity: Minor — cost ~10 min of debugging plus a side trip to install PowerShell 7 (the bash-style `-SkipHttpErrorCheck` flag in the helper is PS 7+ only, which the operator hadn't realized). Could cost more for an operator without diagnostic instinct.
- Remediation: Replaced the literal-placeholder line in the playbook setup block with `$env:MCP_KEY = Read-Host -Prompt "Paste MCP_KEY_RP value (input will be visible)"` in commit `3bacd0e`. Bonus: `Read-Host` keeps the secret out of `PSReadLine` history (`%APPDATA%\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt`), which is a real security improvement over the prior `$env:MCP_KEY = "..."` pattern.
- Notes: Two follow-ups worth considering for future polish (not blocking this soak):
  1. The bash equivalent in [DEPLOY.md § B.3](../../../mcp-server/src/docs/operations/DEPLOY.md) likely has the same placeholder hazard — review and convert to `read -s MCP_KEY` if so.
  2. The `Invoke-McpRequest` helper's SSE-only parser silently returns the raw HTTP response when the body isn't SSE — operators who run `(call).result.foo` get `$null` with no obvious cause. Consider having the helper raise a clearer error on non-2xx responses, OR document the diagnostic incantation (`$resp.GetType()` + `$resp.Content.Substring(0,200)`) prominently in the playbook's "How to use this doc" section.

---

## Pre-production gate — open Critical findings

> Mirror any **Critical** finding here as a one-line pointer until resolved. The production deploy gate ([§ Pre-production gate checklist](MCP_SERVER_REMOTE_BL-032_TESTING.md#pre-production-gate-checklist)) requires this list to be empty.

_No open Critical findings._
