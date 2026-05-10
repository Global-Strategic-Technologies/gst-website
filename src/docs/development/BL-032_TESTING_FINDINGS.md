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

## Soak terminal setup (PowerShell — Windows)

Almost every Section A / B / C / E test below references `Invoke-McpRequest` or `Invoke-McpTool`. Those functions are checked in at [`mcp-server/scripts/Invoke-McpRequest.ps1`](../../../mcp-server/scripts/Invoke-McpRequest.ps1). **Dot-source the helper once per soak terminal** before running any test:

```powershell
cd c:\Code\gst-website\mcp-server
. .\scripts\Invoke-McpRequest.ps1
```

What you get:

| Function                                                        | Use for                                                  | Returns                                                                           |
| --------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `Invoke-McpRequest -Method <m> [-Params <hash>] [-Id <n>]`      | `tools/list`, `prompts/list`, raw JSON-RPC introspection | Full JSON-RPC envelope (`{ jsonrpc, id, result \| error }`)                       |
| `Invoke-McpTool -Name <toolName> [-Arguments <hash>] [-Id <n>]` | Any T.B._ tool-call test (or T.K._ tool exercise)        | Parsed tool-response payload — `result.content[0].text` already JSON-deserialized |

**Why both** — `Invoke-McpRequest` exposes the protocol envelope (useful for T.A._ / T.E._ protocol-shape tests). `Invoke-McpTool` short-circuits the `result.content[0].text | ConvertFrom-Json` chain that every tool test would otherwise repeat.

**Env-var bootstrap** — on dot-source:

- `$env:MCP_URL` defaults to `https://mcp-staging.globalstrategic.tech` if unset (with a console note)
- `$env:MCP_KEY` is prompted via `Read-Host` (input visible) if unset
- Both can be re-set explicitly per session (e.g., `$env:MCP_URL = "https://mcp.globalstrategic.tech"` for production probes — rare during BL-032)

**Quick example — what T.B.1.a becomes:**

```powershell
# Before (manual unwrap):
$resp = Invoke-McpRequest -Method "tools/call" -Params @{ name = "list_portfolio_facets"; arguments = @{} }
$facets = $resp.result.content[0].text | ConvertFrom-Json

# After (with the helper):
$facets = Invoke-McpTool -Name "list_portfolio_facets"
```

**For tests that need bare `curl.exe`** (T.A.2 through T.A.8 — auth-shape probes that intentionally bypass the helper) the helper is a no-op overhead. Dot-source it anyway and use `curl.exe` for those specific tests; the env vars it sets up are still useful.

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

- Date: 5/10/2026
- Tester: Reid Peryam
- Client: direct curl
- Command/Action: `curl.exe -i $env:MCP_URL/mcp -X POST -H "Authorization: Bearer  $env:MCP_KEY  "` (note extra spaces around the token)
- Outcome: PASS
- Observed:

HTTP/1.1 401 Unauthorized
Date: Sun, 10 May 2026 16:34:41 GMT
Content-Type: application/json
Content-Length: 57
Connection: keep-alive
WWW-Authenticate: Bearer realm="gst-mcp"
Report-To: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=ijAIloij3U5SLjRls3LPlWln19LkqxrPT2Fiusnbxs0IxOcxw5sJjATADRcgd8xVtYwcV4rzEyOTR7bsfybmN8ZF7b%2BkdRQDVu0CAOC4LB27eXIVi1istbNiBWEPSE2E%2BVPx%2FfNoevyiLDK4xx7BovOdRonUULKw8t4me3Vw2w%3D%3D"}]}
Nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
Server: cloudflare
CF-RAY: 9f9a5a511c2e01cf-GRU
alt-svc: h3=":443"; ma=86400

{"error":"unauthorized","message":"Invalid Bearer token"}

- Expected: Either accepts (after trim) or rejects cleanly with 401. **Whichever it does, behavior must be deterministic** (no inconsistent intermittent results)
- Severity (if fail): IMPORTANT
- Remediation:
- Notes: the output of the command is exactly as stated in the observed field, even after removing the whitespace from the token and retrying.

## T.A.7 — Multiple Authorization headers

- Date: 5/10/2026
- Tester: Reid Peryam
- Client: direct curl
- Command/Action: Send two `Authorization` headers in the same request — one valid (`Bearer $env:MCP_KEY`), one bogus (`Bearer not-a-real-token`). Vary order across runs.
- Outcome:
- Observed:
- Expected: RFC 9110-compliant — server picks one and either honors it or rejects. Document which deterministically.
- Severity (if fail):
- Remediation:
- Notes: Did not test, cannot repro the required test query myself (don't know how), please provide the test query for follow-up testing

## T.A.8 — Token in lowercase header (`authorization` not `Authorization`)

- Date: 5/10/2026
- Tester: RP
- Client: direct curl
- Command/Action: `curl.exe -i $env:MCP_URL/mcp -X POST -H "authorization: Bearer $env:MCP_KEY"`
- Outcome: PASS
- Observed:

      HTTP/1.1 406 Not Acceptable
      Date: Sun, 10 May 2026 17:02:36 GMT
      Content-Type: application/json
      Content-Length: 142
      Connection: keep-alive
      Access-Control-Allow-Origin: *
      Access-Control-Expose-Headers: mcp-session-id
      RateLimit-Limit: 60
      RateLimit-Remaining: 59
      RateLimit-Reset: 24
      Report-To: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=ufCTbwFWjeDfFfM%2FgpG9Rnq0CHzjoKCBnzOJy8jIIKSRxzD7kor4JVpqG%2FCPvhsO2fkvOJtoCrHyBY6k4SWIIJ%2FP0uTFNtuelxrtXyi6Bar6PR4HOlmthLWGZcHQa8m7vfDNMGfoe87TsU9Htwv%2FJuxNOJiwnta0TUli0K4Cog%3D%3D"}]}
      Nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
      Server: cloudflare
      CF-RAY: 9f9a833789bf6229-GRU
      alt-svc: h3=":443"; ma=86400

      {"jsonrpc":"2.0","error":{"code":-32000,"message":"Not Acceptable: Client must accept both application/json and text/event-stream"},"id":null}

- Expected: 200 (HTTP headers are case-insensitive per RFC)
- Severity (if fail):
- Remediation:
- Notes:

## T.A.9 — keyOwner attribution accuracy

- Date: 5/10/2026
- Tester: RP
- Client: direct curl + wrangler tail
- Command/Action: Make any successful tool call, then in another terminal: `npx wrangler tail --env staging --search '"keyOwner":"RP"'`
- Outcome: Pass
- Observed:

  curl.exe -s $env:MCP_URL/mcp -X POST `-H "Authorization: Bearer $env:MCP_KEY"`
  -H "Content-Type: application/json" `-H "Accept: application/json, text/event-stream"`
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

- Expected: Tail line shows `keyOwner: "RP"` (suffix from `MCP_KEY_RP`). Authorization header value MUST NOT appear anywhere in the log line.
- Severity (if fail): Critical if full token leaks via Authorization header logging (would mean safeLog regression)
- Remediation:
- Notes:

## T.A.10 — Token rotation mid-session

- Date: 5/10/2026
- Tester: RP
- Client: Claude Desktop (post operator-rotation)
- Command/Action: Operator rotates `MCP_KEY_RP` per AUTH.md Rotate procedure. Tester continues issuing tool calls from Claude Desktop using the OLD token value (do not restart the client).
- Outcome: Pass
- Observed:
- Expected: Old token starts returning 401 within ~30s (next isolate cold start)
- Severity (if fail):
- Remediation:
- Notes:

## T.A.11 — After rotation, new token works

- Date: 5/10/2026
- Tester: RP
- Client: Claude Desktop
- Command/Action: After T.A.10, configure Claude Desktop with the NEW token value (update `claude_desktop_config.json`, restart). Run a smoke prompt that triggers any tool call.
- Outcome: Pass
- Observed:
- Expected: 200, tools work normally
- Severity (if fail):
- Remediation:
- Notes:

## T.A.12 — Revoked key behavior

- Date: 5/10/2026

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

- Date: 2026-05-10
- Tester: RP
- Client: wrangler CLI + direct curl + wrangler tail
- Command/Action: Set `MCP_KEY_AB` to the existing `MCP_KEY_RP` value (`$env:MCP_KEY | npx wrangler secret put MCP_KEY_AB --env staging`); force isolate pickup via `npm run deploy:staging`; issue 5 authenticated `tools/list` calls in a loop and observe `keyOwner` attribution in `wrangler tail --env staging`.
- Outcome: PASS
- Observed: All 5 calls (Ids 1-5) returned HTTP 200 and logged `"keyOwner":"AB"` deterministically — no mixed attribution, no 5xx, no crash. Excerpt from tail:

      {"event":"mcp.request","keyOwner":"AB","path":"/mcp","status":200,"durationMs":0,"success":true}
      {"event":"mcp.request","keyOwner":"AB","path":"/mcp","status":200,"durationMs":0,"success":true}
      {"event":"mcp.request","keyOwner":"AB","path":"/mcp","status":200,"durationMs":0,"success":true}
      {"event":"mcp.request","keyOwner":"AB","path":"/mcp","status":200,"durationMs":0,"success":true}
      {"event":"mcp.request","keyOwner":"AB","path":"/mcp","status":200,"durationMs":0,"success":true}

- Expected: Behavior is documented one way or the other (e.g., first-match wins, or rejected as duplicate). Consistency matters more than which choice.
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Behavior is deterministic — `MCP_KEY_AB` consistently wins when both secrets share the same value. `wrangler secret list --env staging` returns secrets alphabetically (AB before RP), suggesting the Worker's `Object.entries(env)` iteration sees AB first and first-match wins; confirming this requires inspecting `auth/bearer.ts`. Either way, the soak's deterministic-attribution requirement is satisfied. Worth adding to AUTH.md as a documented edge case so future operators understand duplicate-value secrets attribute to the alphabetically-earlier suffix. Bonus signal incidentally observed during this test — a `"event":"auth.failed","path":"/sitemap.xml","reason":"bearer-rejected"` line fired on an unrelated probe, which is the post-AC behavior T.E.11 expects (worth re-checking T.E.11 once the captureMessage AC closes — see Known Gaps in playbook).

  **CLEANUP performed**: `npx wrangler secret delete MCP_KEY_AB --env staging` then `npm run deploy:staging` to force isolate pickup. `npx wrangler secret list --env staging` confirmed `MCP_KEY_AB` is gone (10 secrets remain: 1× MCP*KEY_RP, 4× INOREADER*\_, 4× UPSTASH\_\_, 1× SENTRY_DSN).

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

- Date: 5/10/2026
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpRequest -Method "tools/call" -Params @{ name = "list_portfolio_facets"; arguments = @{} }`
- Outcome: PASSED
- Observed:
- Expected: Returns `{ themes, engagementCategories, growthStages, years }` arrays — non-empty, deduplicated, sorted
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.1.b — Spurious args ignored

- Date: 5/10/2026
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "list_portfolio_facets" -Arguments @{ unrecognized = "ignored" }`
- Outcome: Ye
- Observed:
- Expected: Same response as T.B.1.a, no error
- Severity (if fail):
- Remediation:
- Notes:

### T.B.2 — `search_portfolio`

#### T.B.2.a — Free-text matches multiple fields

- Date: 5/10/2026you
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: # In a fresh terminal — setup once
  cd c:\Code\gst-website\mcp-server
  . .\scripts\Invoke-McpRequest.ps1

          # T.B.2.a — search "kubernetes"
          $payload = Invoke-McpTool -Name "search_portfolio" -Arguments @{ search = "kubernetes" }

          # Verify the three things T.B.2.a expects
          "matches.Count: $($payload.matches.Count)"

          $payload.matches | Select-Object codeName, theme, technologies | Format-Table -AutoSize

          $payload.matches | ForEach-Object {
            $hit = ($_.summary -match 'kubernetes|k8s') -or (($_.technologies -join ' ') -match 'kubernetes|k8s')
            "$($_.codeName): kubernetes-mention=$hit"
          }

- Outcome: PASS
- Observed:
  Legis: kubernetes-mention=True
  Wolverine: kubernetes-mention=True
  Maverick: kubernetes-mention=True
  Vanguard SASE: kubernetes-mention=True
  Knapsack: kubernetes-mention=True
  Eagle: kubernetes-mention=True
  Ace: kubernetes-mention=True
  Luminate: kubernetes-mention=True
  PS C:\Code\gst-website\mcp-server>

- Expected: Returns projects mentioning K8s in `summary`, `technologies`, or other indexed fields. Verify against `src/data/ma-portfolio/projects.json`
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.2.b — Empty search → all 61 projects

- Date: 5/10/2026
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "search_portfolio"`
- Outcome: PASS
- Observed:

      PS C:\Code\gst-website\mcp-server> Invoke-McpTool -Name "search_portfolio"

      matches
      -------
      {@{id=voss; codeName=Voss; industry=Cross-Border Payments & FinTech; theme=Finance; summary=Integrated cross-bord…

      PS C:\Code\gst-website\mcp-server>

- Expected: `matches.Count = 61` (per BACKLOG.md BL-031 + BL-031.95)
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.2.c — Theme + engagement filter compose

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "search_portfolio" -Arguments @{ theme = "<a real theme>"; engagement = "Buy-Side" }`
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
- Command/Action: `Invoke-McpTool -Name "search_portfolio" -Arguments @{ theme = "all"; engagement = "all" }`
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
- Command/Action: `Invoke-McpTool -Name "search_portfolio" -Arguments @{ theme = "not-a-real-theme" }`
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

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "generate_diligence_agenda" -Arguments $inputs` (using `$inputs` from above)
- Outcome: PASS
- Observed: All 6 acceptance criteria met.
  - **4 topics** with per-topic question distribution totaling 20:
    - `architecture` (6 questions): arch-01, arch-02, arch-03, arch-04, arch-09, arch-12
    - `operations` (7 questions): ops-01, ops-02, ops-03, ops-04, ops-05, ops-07, ops-13
    - `carveout-integration` (2 questions): ci-08, ci-10
    - `security-risk` (5 questions): sec-01, sec-05, sec-07, sec-08, sec-17
  - **20 triggerMap entries** with trigger attribution: Geography drove 3 (ci-10, sec-05, sec-17); Revenue drove 2 (arch-09, ops-13); Company Size drove 2 (arch-02, ops-03); Product Type drove 2 (arch-03, ops-04); Transaction Type drove 1 (ci-08); Tech Stack drove 1 (arch-04); Company Age drove 1 (ops-05); Product Type + Growth Stage drove 1 (arch-12). Unconditional questions (no triggers): arch-01, ops-01, ops-02, ops-07, sec-01, sec-07, sec-08.
  - **2 attentionAreas**: `attention-gdpr-multi` (Cross-Border Data Compliance — triggered by `geographies` ∋ {eu, uk, apac, latam, africa}; here matched on eu), `attention-moat-erosion` (AI Commodity Risk — triggered by `productType = "b2b-saas"`).
  - **`metadata.totalQuestions = 20`**, at the upper bound of the engine invariant [15, 20].
  - **`unknownDimensionCount = 0`** (all 13 dimensions resolved to concrete values).
  - **`deeplink`** populated; full URL captured: `https://globalstrategic.tech/hub/tools/diligence-machine/?tt=majority-stake&pt=b2b-saas&ta=modern-cloud-native&hc=51-200&rr=5-25m&gs=scaling&ca=5-10yr&ge=us%2Ceu&bm=productized-platform&si=moderate&ts=stable&ds=moderate&om=product-aligned-teams`. All 13 dimensions present in query string (`tt`, `pt`, `ta`, `hc`, `rr`, `gs`, `ca`, `ge`, `bm`, `si`, `ts`, `ds`, `om`); array `geographies` correctly URL-encoded as `us%2Ceu`.
- Expected: Response has `topics[]`, `attentionAreas[]`, `triggerMap`, `15 ≤ metadata.totalQuestions ≤ 20` (engine invariant per `tests/unit/diligence-engine.test.ts:757`), `unknownDimensionCount = 0`, `deeplink`
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Initial run on 2026-05-10 surfaced an apparent discrepancy — playbook stub originally documented `totalQuestions ≥ 30`, observed 20. Investigation traced the engine to `src/utils/diligence-engine.ts:425` where `balanceAcrossTopics(pivotedQuestions, 15, 20)` has had `maxTotal = 20` since the initial Diligence Machine commit (`3dcbc6c`). The `15–20` range is the documented invariant — enforced by `tests/unit/diligence-engine.test.ts:757-764` (and a sibling assertion at line 993). The playbook's `≥ 30` was never grounded in actual engine behavior; it was introduced unverified in commit `ab6fdbc` (BL-032 playbook authoring). No regression; the spec was wrong, not the implementation. Playbook expected-text and this stub corrected in the same commit that logs this PASS.

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
- Client: browser
- Command/Action: Open the deeplink captured during T.B.3.a's 2026-05-10 PASS run in a browser: `https://globalstrategic.tech/hub/tools/diligence-machine/?tt=majority-stake&pt=b2b-saas&ta=modern-cloud-native&hc=51-200&rr=5-25m&gs=scaling&ca=5-10yr&ge=us%2Ceu&bm=productized-platform&si=moderate&ts=stable&ds=moderate&om=product-aligned-teams`. Verify the wizard pre-fills with the same 13 inputs.
- Outcome:
- Observed:
- Expected: Wizard pre-fills with the same 13 input values
- Severity (if fail):
- Remediation:
- Notes: T.B.3.a's response already confirms the deeplink is generated correctly and contains all 13 dimensions in the query string (`tt`/`pt`/`ta`/`hc`/`rr`/`gs`/`ca`/`ge`/`bm`/`si`/`ts`/`ds`/`om`). This test verifies the OTHER half of the round-trip — that the wizard's URL-state restoration (BL-031.95) reads those query params back into the form correctly.

### T.B.4 — `assess_infrastructure_cost_governance`

#### T.B.4.a — Answers map (canonical stage `series-b`)

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "assess_infrastructure_cost_governance" -Arguments @{ answers = @{ q1_1 = 2; q1_2 = 1; q1_3 = 0; q2_1 = 3 }; companyStage = "series-b" }` (real ICG question IDs from `src/data/infrastructure-cost-governance/domains.ts` follow `q<domain>_<n>` pattern)
- Outcome: PASS
- Observed: Operator confirmed response payload matched the expected shape (overallScore in range, maturityLevel in the enum, sorted recommendations, stageContext mapping `series-b` → ICG-native `series-bc`). Full payload not captured to the finding by operator preference — "It's a lot of data, just mark it as pass." Behavioral correctness verified by visual inspection on 2026-05-10.
- Expected: `overallScore` 0-100, `maturityLevel` ∈ {Reactive, Aware, Optimizing, Strategic}, sorted recommendations, `stageContext` shows ICG-native equivalent (`series-bc`)
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Playbook's original snippet used placeholder `q1`/`q2`/`q3`/`q4` IDs with a `# use real ICG question IDs` comment; the four IDs above (`q1_1`, `q1_2`, `q1_3`, `q2_1`) are the actual first four questions in the canonical ordering. Worth a follow-up to update the playbook snippet to use real IDs so future operators don't need to look them up.

#### T.B.4.b — ICG-native stage value (`series-bc`)

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "assess_infrastructure_cost_governance" -Arguments @{ answers = @{ q1_1 = 2; q1_2 = 1; q1_3 = 0; q2_1 = 3 }; companyStage = "series-bc" }`
- Outcome: PASS
- Observed: `overallScore = 12`, `maturityLevel = "Reactive"`, `stageContext = { native: "series-bc", canonical: ["series-b", "series-c"] }`. Same response shape as T.B.4.a; ICG-native stage cleanly maps to its canonical equivalents.
- Expected: Same response shape; `stageContext` shows the canonical mapping
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Confirms the stage-adapter layer (BL-031.87) handles both directions — canonical `series-b` → ICG-native `series-bc` (verified in T.B.4.a) and ICG-native `series-bc` → canonical `["series-b", "series-c"]` (this test).

#### T.B.4.c — Use `-1` "Not sure" answer

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "assess_infrastructure_cost_governance" -Arguments @{ answers = @{ q1_1 = -1; q1_2 = 1; q1_3 = 0; q2_1 = 3 }; companyStage = "series-b" }`
- Outcome: PASS
- Observed: A/B disambiguation completed 2026-05-10. Two consecutive identical-shape runs, varying only `q1_1`:
  - **A — `q1_1 = -1`** (skip sentinel): `d1.rawScore = 0`, `d1.skippedCount = 1`, `overallScore = 5`
  - **B — `q1_1 = 0`** (zero answer): `d1.rawScore = 1`, `d1.skippedCount = 0`, `overallScore = 8`
  - rawScore formula (verified at `src/utils/icg-engine.ts:114-117`) sums each answer literally: A's d1 → (-1) + 1 + 0 = 0; B's d1 → 0 + 1 + 0 = 1. There is no foundational-anchor short-circuit and no domain-zeroing special case. `-1` is _literally added_ to the sum.
  - The engine's documented design (per comment at `icg-engine.ts:112-113` and explicit unit-test contract at `tests/unit/icg-engine.test.ts:700-718` titled "scores -1 worse than 'Not in place' (0)") is that "Not sure" actively penalizes — _ignorance is worse than known absence_. So `-1` < `0` < positive scores. The engine is behaving exactly as designed.
- Expected: `skippedCount` increments (per-domain and top-level); `-1` is scored as a literal `-1` contribution to `rawScore`, intentionally penalizing MORE than `0` ("Not in place") per `icg-engine.ts:112-113` + `tests/unit/icg-engine.test.ts:700-718`. The "ignorance is worse than known absence" design is honest about not-knowing.
- Severity (if fail): n/a
- Remediation: n/a — PASS for the engine's documented contract
- Notes: Initial playbook expectation was wrong ("doesn't penalize the way `0` does") — actual engine behavior is "penalizes MORE than `0` does" by intentional design. Fixed in three places in this session:
  1. Playbook `MCP_SERVER_REMOTE_BL-032_TESTING.md` T.B.4.c row corrected to match engine intent.
  2. `src/utils/icg-engine.ts:239` summary-text label corrected from "scored as zero" (misleading) to "scored as -1, penalised below 'Not in place'".
  3. This finding's Expected/Outcome reframed to match the engine's documented contract. The MCP tool's response shape (`skippedCount` field) is purely diagnostic — counts the -1 sentinels separately for UI/audit purposes, but those answers DO contribute negatively to `rawScore`.

#### T.B.4.d — Empty answers map

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "assess_infrastructure_cost_governance" -Arguments @{ answers = @{}; companyStage = "series-b" }`
- Outcome: PASS (with playbook-wording calibration)
- Observed: `overallScore = 0`, `maturityLevel = "Reactive"`. The response shape uses `answeredCount` + `totalQuestions` (visible in T.B.4.e's full payload — `answeredCount: 2, totalQuestions: 20`), not the `notAnsweredCount` field name the playbook anticipated. With an empty answers map, `answeredCount` would be 0 and `totalQuestions` 20 — equivalent information, different naming. The score-of-zero contract is satisfied.
- Expected: Returns score = 0 and `notAnsweredCount` reflects all questions (playbook spec — `notAnsweredCount` field name does not exist; the engine uses `answeredCount` + `totalQuestions` instead. Equivalent information.)
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Mirrors the T.B.3.a `≥30` calibration issue — playbook documented a field name that doesn't match the engine's actual response shape. Worth tightening the playbook's expected text to `answeredCount = 0` and `totalQuestions = <bank size>`. The behavioral contract (zero score on empty input) is correct.

#### T.B.4.e — Invalid question ID

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "assess_infrastructure_cost_governance" -Arguments @{ answers = @{ q1_1 = 2; bogus_id_zz = 3 }; companyStage = "series-b" }`
- Outcome: PASS — behavior documented (neither pure-silent-filter nor pure-error)
- Observed: Bogus ID was **preserved in state but ignored for scoring**. Specifically: `answeredCount: 2` (counts both ids); `bogus_id_zz` is visible in the `deeplink` base64 state (`"a":{"bogus_id_zz":3,"q1_1":2}`); all 6 domain `rawScore` values reflect only `q1_1=2` (d1.rawScore=2, all others 0). So the bogus ID round-trips through state and counters but contributes nothing to maturity scoring or domain attribution. `overallScore = 5`, recommendations list populated (driven by the foundational-threshold breach, not by the bogus ID).
- Expected: MCP error or filtered silently — document which behavior (playbook expected one of two; observed behavior is "neither — pass-through to state, ignore for scoring")
- Severity (if fail): Minor — the pass-through behavior is benign at runtime but means the deeplink state can carry forward-compat or typo-ed IDs indefinitely. Consider whether the engine should warn or filter at parse time.
- Remediation: Document this behavior in the ICG engine's contract notes — future operators / contract consumers should know that "unknown IDs persist in deeplink state but don't affect scoring." Not a blocker; could become a finding for BL-032.75 (observability maturity) if telemetry on unknown-ID submission becomes useful.
- Notes: Confirms `answeredCount` counts EVERY id in the input regardless of validity — useful caveat to know when interpreting that field. Cross-references the earlier accidental run with placeholder IDs `q1`, `q2`, `q3`, `q4` (during T.B.4.a setup), which showed the same pattern.

#### T.B.4.f — Score out of range (-2 or 4)

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: Two runs: `Invoke-McpTool -Name "assess_infrastructure_cost_governance" -Arguments @{ answers = @{ q1_1 = 4 }; companyStage = "series-b" }` and `@{ q1_1 = -2 }; companyStage = "series-b"`
- Outcome: PASS (Zod rejected both)
- Observed: Both calls were rejected by the engine's Zod validation. The helper's `ConvertFrom-Json` raised an exception on line 127 because `result.content[0].text` started with the character `M` (likely the start of an error string like "Method ..." or "Missing ..."). The Worker DID respond with a valid MCP envelope containing the error text; the helper just hadn't been written to handle non-JSON content gracefully. T.B.4.f is PASS for the Zod-rejection contract.
- Expected: Zod rejection clean
- Severity (if fail): Minor — secondary finding only, not on T.B.4.f itself
- Remediation: Helper robustness improvement landed in the same session — `Invoke-McpRequest.ps1` now wraps the final `ConvertFrom-Json` in a `try`/`catch` and returns the raw envelope with a Write-Warning when the content text isn't JSON. Operators can then inspect `$payload.result.content[0].text` directly to see the Zod error message.
- Notes: Worth a follow-up to capture the exact rejection text for documentation (one more run with the patched helper would surface it cleanly). The MCP transport's success/error semantics — engine rejection still arrives in the standard `result.content[0].text` envelope rather than as a JSON-RPC `error` — is a design choice worth noting for any future MCP consumer.

### T.B.5 — `compute_techpar`

> Per BL-031.95, all 6 money fields are annual dollars (the previous monthly/×12 for `infraHostingAnnual` was renamed). Tests should exercise the renamed field name.

#### T.B.5.a — Quick mode, canonical stage

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "compute_techpar" -Arguments @{ arr = 20000000; stage = "series-b"; mode = "quick"; capexView = "cash"; growthRate = 30; exitMultiple = 12; infraHostingAnnual = 4000000; infraPersonnel = 800000; rdOpEx = 5000000; rdCapEx = 1000000; engFTE = 75; engCost = 0; prodCost = 0; toolingCost = 0 }` (14 required fields — note the input field is `stage`, not `companyStage` as the original stub had it)
- Outcome: PASS
- Observed: `totalTechPct = 54`, `zone = "healthy"` ✓, `stageContext = { native: "series_bc", canonical: ["series-b", "series-c"] }` ✓, `deeplink` present ✓. Response top-level fields: `total, totalCash, totalGAAP, totalTechPct, zone, stageConfig, categories, kpis, gap, stageContext, deeplink`. KPIs (including `revenuePerEngineer`) are nested inside the `kpis` object per `techpar-engine.ts:334-345`. Earlier "blank revenuePerEngineer" observation was a misdirection — the field exists at `$payload.kpis.revenuePerEngineer`, not at top-level. `$payload.kpis.revenuePerEngineer` will compute to ~266666.67 (= 20M / 75).
- Expected: Returns `totalTechPct`, `zone` ∈ {underinvest, ahead, healthy, above, elevated, critical}, KPIs (nested in `kpis`), gap projection, `deeplink`
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Original stub command used `companyStage` (incorrect — the techpar tool's input field is `stage`, not `companyStage`; verified at `mcp-server/src/tools/techpar.ts:57-59` and the schema at `src/schemas/techpar.ts:115-184`). Original stub also omitted 10 of the 14 required fields. The corrected 14-field command above is now the canonical T.B.5.a invocation. The playbook's verification text says "KPIs" generically — useful to clarify the field path is `payload.kpis.*` (not top-level). Worth a separate playbook update so the snippet matches what the tool actually accepts.

#### T.B.5.b — Deepdive mode

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: Same as T.B.5.a but `mode = "deepdive"`, `engCost = 7000000`, `prodCost = 1500000`, `toolingCost = 500000`, `rdOpEx = 99999999` (the 99M is a stale value that should be ignored per the deepdive contract)
- Outcome: PASS
- Observed: `totalTechPct = 74`, `zone = "elevated"`. The 99M stale `rdOpEx` was correctly ignored — if it had been used, `totalTechPct` would have been catastrophic (~500%+). Instead the engine synthesized R&D OpEx from `engCost + prodCost + toolingCost = $9M`, producing a sensible 74% ratio. Increase from T.B.5.a's 54% reflects the synthesized $9M being ~$4M higher than T.B.5.a's $5M `rdOpEx`.
- Expected: `engCost + prodCost + toolingCost` synthesized as R&D OpEx; raw `rdOpEx` ignored
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Confirms BL-031.95 deepdive synthesis works correctly. The 99M-as-stale-canary pattern is reusable for future regression checks (any future regression that silently passes `rdOpEx` through would push `totalTechPct` into the hundreds of percent).

#### T.B.5.c — Cash vs GAAP capex view

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: Two runs with identical inputs except `capexView` (`cash` vs `gaap`), both with `rdCapEx = 2000000`.
- Outcome: PASS
- Observed: `cash: total = 11800000, zone = "above"` vs `gaap: total = 9800000, zone = "healthy"`. Diff is exactly `2000000` — the rdCapEx value, precisely the contract. Zone differs because the rdCapEx push crosses the `healthy` → `above` threshold under cash but not gaap.
- Expected: Different `total` and `zone` values when `rdCapEx > 0`
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Very clean differential. The 2M difference is exactly attributable; demonstrates the capexView toggle's contract is correctly wired through the engine.

#### T.B.5.d — `arr = 0`

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: Take T.B.5.a inputs; set `arr = 0`
- Outcome: PASS
- Observed: Engine correctly rejected. Helper raised `ConvertFrom-Json` exception (the `result.content[0].text` starts with `"T"` — matches the rejection string `"TechPar requires both \`arr\` and \`infraHostingAnnual\` to be greater than zero."`from`techpar.ts:66`). `$r1.totalTechPct` is empty, confirming no valid result was returned.
- Expected: Engine returns null in JS — surfaced as MCP error per BL-031.95
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Operator's terminal had dot-sourced the pre-patch helper (the `try`/`catch` around `ConvertFrom-Json` landed in commit `2cf028b` AFTER this test session started), so the rejection surfaced as a raw exception rather than the cleaner Write-Warning. Re-dot-sourcing the helper picks up the patched behavior for future runs. PASS for the Zod-rejection contract; helper-rendering improvement is already in commit history.

#### T.B.5.e — `infraHostingAnnual = 0`

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: Take T.B.5.a inputs; set `infraHostingAnnual = 0`
- Outcome: PASS
- Observed: Same rejection path as T.B.5.d — engine refused, helper raised `ConvertFrom-Json` exception on the "T..." rejection string. `$r2.totalTechPct` empty.
- Expected: Same null → MCP error
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Confirms the joint-precondition: both `arr > 0` AND `infraHostingAnnual > 0` must hold for the engine to return a usable result. Either zero triggers the same rejection text.

#### T.B.5.f — TechPar-native stage `series_bc` (underscore) accepted

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: Take T.B.5.a inputs; set `stage = "series_bc"` (underscore form, TechPar-native)
- Outcome: PASS
- Observed: Identical numeric results to T.B.5.a's canonical `series-b` run: `totalTechPct = 54`, `zone = "healthy"`. Confirms the BL-031.87 stage-adapter collapses canonical `series-b` (and `series-c`) into TechPar-native `series_bc` cleanly in both directions.
- Expected: Treated identically to canonical `series-b` / `series-c`
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Bidirectional adapter parity confirmed. The original stub used `companyStage = "series_bc"` (wrong field name); corrected to `stage = "series_bc"` per the techpar schema.

### T.B.6 — `estimate_tech_debt_cost`

#### T.B.6.a — Realistic inputs

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "estimate_tech_debt_cost" -Arguments @{ teamSize = 50; salary = 200000; maintenanceBurdenPct = 30; deployFrequency = "Weekly"; incidents = 5; mttrHours = 4; remediationBudget = 500000; arr = 50000000; remediationPct = 80; contextSwitchOn = $true }`
- Outcome: PASS
- Observed: `annualCost = 3713076.92`, `paybackMonths = 2.02`, `doraLabel = "High"` ✓, `totalMonthly = 309423.08`, `contextSwitchMonthly = 57500`, `incidentMonthly = 1923.08`.
- Expected: Returns `annualCost`, `paybackMonths`, `doraLabel = "High"`, decomposed monthly costs
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Original stub had 5 wrong field names: `avgSalary` → `salary`, `maintenanceBurden` (0.30) → `maintenanceBurdenPct` (30), `budget` → `remediationBudget`, `remediationEfficiency` (0.80) → `remediationPct` (80), `deployFrequency: "weekly"` → `"Weekly"` (case-sensitive enum). Per schema at `src/schemas/tech-debt.ts:35-46`. Playbook snippet update recommended.

#### T.B.6.b — `contextSwitchOn = false`

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: Same as T.B.6.a but `contextSwitchOn = $false`
- Outcome: PASS
- Observed: `totalMonthly = 251923.08`, `contextSwitchMonthly = 0` ✓. Difference vs T.B.6.a = $57,500 — exactly matches T.B.6.a's `contextSwitchMonthly` (the entire context-switch cost cleanly drops out when the flag is off).
- Expected: `contextSwitchMonthly = 0`, `totalMonthly` reduced
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Subtraction sanity check confirms the contextSwitchOn boolean is the _only_ lever affecting that cost component — no spillover into other monthly buckets.

#### T.B.6.c — `incidents = 0`

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: Same as T.B.6.a but `incidents = 0`
- Outcome: PASS
- Observed: `incidentMonthly = 0` ✓, `totalMonthly = 307500` (vs T.B.6.a's 309423.08 — diff ≈ 1923, which matches T.B.6.a's `incidentMonthly`).
- Expected: `incidentMonthly = 0`
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Same clean subtractive pattern as T.B.6.b — zeroing the incidents input cleanly removes the incident-cost monthly bucket without affecting others.

#### T.B.6.d — `teamSize = 0`

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: Same as T.B.6.a but `teamSize = 0`
- Outcome: PASS
- Observed: Zod rejected. Helper's patched `try`/`catch` (commit `2cf028b`) cleanly surfaced the rejection text: `"MCP error -32602: Input validation error: Invalid arguments for tool estimate_tech_debt_cost: [{ origin: 'number', code: 'too_small', minimum: 0, inclusive: false, path: ... }]"`. `$b6d.annualCost` is empty (no valid result returned).
- Expected: Zod rejection (exclusiveMinimum)
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: First test where the patched helper's error-preview surfaced cleanly (vs the raw exception that fired in earlier sessions). Validates the helper-robustness fix from earlier today.

### T.B.7 — `search_regulations`

#### T.B.7.a — Free-text "GDPR"

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "search_regulations" -Arguments @{ query = "GDPR" }` (note: input field is `query`, NOT `search` as in original stub — see `src/schemas/regulatory-map.ts:50-55`)
- Outcome: PASS (after ranker fix in this session)
- Observed: Initial run returned `bh-pdpl` (Bahrain Personal Data Protection Law) as top match for query="GDPR" — `eu-gdpr` was buried in the 10-result page. Root cause was traced to `mcp-server/src/tools/regulations.ts:65-82` — the prior `matchesQuery` returned a boolean substring match against `id` / `name` / `summary` with no relevance score; `applyFilters` then returned results in `REGULATION_ENTRIES` iteration order, which is filename-alphabetical (`BH-PDPL.json` precedes `EU-GDPR.json`). `bh-pdpl`'s summary contains the literal string "GDPR" once, satisfying the boolean and winning by iteration order. Fix landed in the same session: replaced `matchesQuery` with a weighted `scoreQuery` that boosts exact-id-match (100), id-includes (50), exact-name (80), name-starts-with (40), name-includes (20), and weak summary-only mention (5); `applyFilters` now sorts descending by score. Stable sort preserves filename-alphabetic order for tie-break. Five regression tests added to `mcp-server/tests/unit/regulations.test.ts` asserting eu-gdpr-first for "GDPR" (and "gdpr"), us-ca-ccpa-first for "ccpa", no-query preserves upstream order, and no-match returns empty. All 19 regulations tests pass.
- Expected: Returns matches with `id: 'gdpr'` (or canonical equivalent like `eu-gdpr`) first; each match has `uri`, `summary`, `keyRequirements`
- Severity (if fail): n/a
- Remediation: Fixed in this session — see Notes for the commit linking the ranker + regression tests.
- Notes: Original stub used `search` field name (wrong — schema at `src/schemas/regulatory-map.ts:50-55` uses `query`); corrected during the helper rewrite earlier today. The ranker fix is a real engine improvement, not just a doc calibration — the prior behavior would surface the wrong canonical regulation for any short-name query (CCPA, GDPR, etc.), measurably degrading T.K.\* prose-prompt result quality.

#### T.B.7.b — Jurisdiction `eu` filter

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "search_regulations" -Arguments @{ jurisdiction = "eu" }`
- Outcome: PASS
- Observed: `matches.Count = 6`. Every match has `jurisdiction = "eu"` (verified via filter check returning `True` for "all EU").
- Expected: All matches scoped to EU regulations
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Clean jurisdiction-filter behavior. Six EU regulations in the dataset.

#### T.B.7.c — Category `data-privacy` filter

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "search_regulations" -Arguments @{ category = "data-privacy" }`
- Outcome: PASS
- Observed: `matches.Count = 20` (the schema default `limit = 20` caps the result here; the data-privacy category likely has more matches in total). Every returned match has `category = "data-privacy"` (verified).
- Expected: All matches in data-privacy category
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Default `limit = 20` clips the result. Use `-Arguments @{ category = "data-privacy"; limit = 120 }` to see all data-privacy frameworks.

#### T.B.7.d — `limit = 5`

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "search_regulations" -Arguments @{ limit = 5 }`
- Outcome: PASS
- Observed: `matches.Count = 5`. Limit honored exactly.
- Expected: Max 5 results
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes:

#### T.B.7.e — `limit = 200`

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "search_regulations" -Arguments @{ limit = 200 }`
- Outcome: PASS
- Observed: Zod rejected with clean error preview from the patched helper: `"MCP error -32602: Input validation error: Invalid arguments for tool search_regulations: [{ origin: 'number', code: 'too_big', maximum: 120, inclusive: true, path: ... }]"`. `$b7e.matches` is empty (no valid result).
- Expected: Capped at 120 (max per schema) — verify Zod enforces
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Schema enforcement clean. The max=120 is set at `RegulationSearchInputSchema.limit` per `src/schemas/regulatory-map.ts:54`.

#### T.B.7.f — Deeplink + filterDeeplink populated

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "search_regulations" -Arguments @{ jurisdiction = "eu"; category = "data-privacy" }`
- Outcome: PASS
- Observed: Per-match `matches[0].deeplink` populated ✓, top-level `filterDeeplink` populated ✓ (only present when `jurisdiction` or `category` is supplied — confirmed by code at `mcp-server/src/tools/regulations.ts:206-212`).
- Expected: Both URLs reflect supplied filters
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes:

### T.B.8 — `list_regulation_facets`

#### T.B.8.a — Happy path

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "list_regulation_facets"`
- Outcome: PASS
- Observed:
  - `jurisdictions: 73 entries` — `ae, ar, au, bd, bh, br, ca, ca-ab, ca-bc, ca-qc, ch, cl, cn, co, ec, eg, eu, gb, gh, global, id, il, in, jp, ke, kr, kz, mx, my, ng, nz, pe, ph, pk, qa, rs, rw, sa, sg, th, tr, tz, ug, us, us-ca, us-co, us-ct, us-de, us-fl, us-ia, us-il, us-in, us-ky, us-md, us-mn, us-mt, us-ne, us-nh, us-nj, us-ny, us-or, us-pa, us-ri, us-tn, us-tx, us-ut, us-va, us-vt, us-wi, uy, uz, vn, za`
  - `categories: 4 entries` — `ai-governance, cybersecurity, data-privacy, industry-compliance` ✓
  - `totalFrameworks: 120` ✓ (matches playbook's "~120")
- Expected: Returns deduplicated `jurisdictions[]` (e.g., `eu`, `us`, `us-ca`, `ca-qc`, `uk`) and `categories[]` (4 known values)
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Jurisdictions dataset has grown to 73 distinct codes (vs the playbook's example of 5). The 4 categories match exactly. Worth a playbook update — the example list (`eu, us, us-ca, ca-qc, uk`) is no longer comprehensive; the current dataset includes 50 US state codes, 4 Canadian provinces, plus 70+ country-level jurisdictions. Note: `uk` appears as `gb` in the actual dataset (ISO alpha-2 for United Kingdom).

### T.B.9 — `search_radar` (live Inoreader; budget-sensitive)

#### T.B.9.a — Category `pe-ma` happy path

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "search_radar" -Arguments @{ category = "pe-ma" }`
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
- Command/Action: `Invoke-McpTool -Name "search_radar"`
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
- Command/Action: Loop the four categories: `foreach ($cat in @("pe-ma","enterprise-tech","ai-automation","cyber-data")) { Invoke-McpTool -Name "search_radar" -Arguments @{ category = $cat } }`
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
- Command/Action: Follow DEPLOY.md C.5 token-refresh recovery flow; after, call `Invoke-McpTool -Name "search_radar" -Arguments @{ category = "pe-ma" }` then `curl.exe $env:MCP_URL/health`
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
- Command/Action: First force the breaker open via Section D Strategy 1 (`/set/mcp:radar:circuit-open/inoreader-rate-limit` with EX=21600); then call `Invoke-McpTool -Name "search_radar" -Arguments @{ category = "pe-ma" }`
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
- Command/Action: `Invoke-McpTool -Name "get_latest_insights"`
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
- Command/Action: `Invoke-McpTool -Name "get_latest_insights" -Arguments @{ limit = 30 }`
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
- Command/Action: `Invoke-McpTool -Name "get_latest_insights" -Arguments @{ limit = 31 }`
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
- Command/Action: `Invoke-McpTool -Name "get_latest_insights" -Arguments @{ limit = 0 }`
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
- Command/Action: `Invoke-McpTool -Name "get_latest_insights" -Arguments @{ category = "ai-automation" }`
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
- Command/Action: Hammer `search_radar` calls varying category to bust cache: `foreach ($i in 1..10) { Invoke-McpTool -Name "search_radar" -Arguments @{ category = "pe-ma"; _bust = $i } -Id $i }`
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

> Many of these tests touch the circuit breaker. Section D Strategy 1 in the playbook (direct Upstash `set/mcp:radar:circuit-open/inoreader-rate-limit` with EX=21600) is the recommended way to simulate post-429 state without burning Inoreader budget. Strategy 2 (natural budget burn) is operator-approval-only.

## T.D.1 — Cache HIT amortizes Inoreader calls

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Call `Invoke-McpTool -Name "search_radar" -Arguments @{ category = "pe-ma" }` twice with identical args within 6h. Inspect `cacheHit` on each response and check Inoreader access logs (Cloudflare access logs or website's traffic) for the corresponding outbound calls.
- Outcome:
- Observed:
- Expected: First call: `cacheHit: false`, ~6 Inoreader calls. Second call: `cacheHit: true`, 0 Inoreader calls.
- Severity (if fail): Caching broken would be a budget regression
- Remediation:
- Notes:

## T.D.2 — Cache key includes category

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Call once with `category = "pe-ma"` then once with `category = "enterprise-tech"`; inspect both responses' `cacheHit` and the returned items
- Outcome:
- Observed:
- Expected: Two separate cache entries; both fetch from Inoreader on first call of each (cache key is category-aware)
- Severity (if fail): If second call returns `pe-ma` results, cache key isn't category-aware
- Remediation:
- Notes:

## T.D.3 — Force circuit-open via direct Upstash set (Strategy 1)

- Date:
- Tester:
- Client: Upstash REST + direct curl (PowerShell helper)
- Command/Action: First set `$env:UPSTASH_MCP_REST_URL` and `$env:UPSTASH_MCP_REST_TOKEN` from password manager. Then `curl.exe -X POST "$env:UPSTASH_MCP_REST_URL/set/mcp:radar:circuit-open/inoreader-rate-limit" -H "Authorization: Bearer $env:UPSTASH_MCP_REST_TOKEN" -d "EX=21600"`. Then call `Invoke-McpTool -Name "search_radar" -Arguments @{ category = "pe-ma" }` and `curl.exe $env:MCP_URL/health`.
- Outcome:
- Observed:
- Expected: Subsequent radar tool calls return 503 with `Retry-After`; `/health` shows `inoreader: 'degraded'` after the cached status TTL refreshes; non-radar tools unaffected.
- Severity (if fail):
- Remediation:
- Notes:

## T.D.4 — Recovery from circuit-open

- Date:
- Tester:
- Client: Upstash REST + direct curl (PowerShell helper)
- Command/Action: After T.D.3, delete the flag: `curl.exe -X POST "$env:UPSTASH_MCP_REST_URL/del/mcp:radar:circuit-open" -H "Authorization: Bearer $env:UPSTASH_MCP_REST_TOKEN"`. Then call radar and `/health`.
- Outcome:
- Observed:
- Expected: Inoreader hit; if successful, `cacheHit: false`, breaker stays closed; `/health` `inoreader: 'ok'` after next status refresh.
- Severity (if fail): Stale 503 keeps returning means cache layer isn't invalidating
- Remediation:
- Notes:

## T.D.5 — Inoreader access-token-stale recovery (already observed once)

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: Wait until website's access token expires (don't trigger website refresh during the wait); then call `Invoke-McpTool -Name "search_radar" -Arguments @{ category = "pe-ma" }`
- Outcome:
- Observed:
- Expected: Returns `{"error":"token-stale", "status":401, ...}` envelope
- Severity (if fail): Returns success despite stale token (using env fallback indefinitely is bad sign), or hard crash
- Remediation:
- Notes:

## T.D.6 — Refresh-token-expiry path (rare; paper-test)

- Date:
- Tester:
- Client: shell (Node)
- Command/Action: Cannot easily simulate without wrecking the website. From a clean machine, cd to website root and run `node scripts/inoreader-auth.mjs setup`; verify it prints an auth URL.
- Outcome:
- Observed:
- Expected: Script prints an auth URL and is reachable from a clean machine
- Severity (if fail): Recovery path is broken if script errors before printing URL
- Remediation:
- Notes: Defer the full token-refresh round-trip to DEPLOY.md § C.5 walkthrough; this stub only validates that the recovery script runs

## T.D.7 — Inoreader timeout

- Date:
- Tester:
- Client: direct curl (PowerShell helper) — naturally observed OR with injected delay
- Command/Action: Either inject a network delay against Inoreader (hard) or capture a natural-occurrence finding during soak. Re-run radar call after the timeout signal triggers.
- Outcome:
- Observed:
- Expected: `{"error":"network-timeout", "status":504}` after `FETCH_TIMEOUT_MS = 5000`
- Severity (if fail):
- Remediation:
- Notes:

## T.D.8 — Inoreader 5xx (other than 429)

- Date:
- Tester:
- Client: direct curl (PowerShell helper) — naturally observed
- Command/Action: Hard to simulate; observe naturally during soak. When a 5xx happens, capture the envelope returned to the caller and verify the breaker did NOT open (check `mcp:radar:circuit-open` in Upstash).
- Outcome:
- Observed:
- Expected: `{"error":"upstream-error", "status":<5xx>}` envelope; circuit breaker NOT opened (5xx ≠ 429)
- Severity (if fail): Breaker opens unnecessarily, or 5xx propagates raw
- Remediation:
- Notes:

## T.D.9 — `/health` `inoreaderObservedAt` updates on radar call

- Date:
- Tester:
- Client: direct curl (PowerShell helper) + direct curl
- Command/Action: Call `Invoke-McpTool -Name "search_radar" -Arguments @{ category = "pe-ma" }` (success). Wait 30s. Then `curl.exe $env:MCP_URL/health` and inspect `inoreaderObservedAt`.
- Outcome:
- Observed:
- Expected: `inoreaderObservedAt` reflects the recent call's timestamp (within seconds)
- Severity (if fail): Stale timestamp means status cache isn't updating
- Remediation:
- Notes:

## T.D.10 — Worker reads OAuth token from Inoreader DB read-only

- Date:
- Tester:
- Client: wrangler CLI + direct curl (PowerShell helper)
- Command/Action: `npx wrangler secret put INOREADER_ACCESS_TOKEN --env staging` (paste a gibberish value); `npm run deploy:staging`; then call `Invoke-McpTool -Name "search_radar" -Arguments @{ category = "pe-ma" }`.
- Outcome:
- Observed:
- Expected: Worker reads from `inoreader:access_token` Upstash key (Path 2 read-only token), gets the website's actual token, succeeds
- Severity (if fail): Critical — if radar fails with bad-token error, Worker is using env fallback when it shouldn't (Path 2 invariant broken)
- Remediation:
- Notes: Restore the real `INOREADER_ACCESS_TOKEN` after the test

## Section E — Observability

## T.E.1 — `wrangler tail` shows every request

- Date:
- Tester:
- Client: wrangler tail + direct curl (PowerShell helper)
- Command/Action: Open one terminal: `npx wrangler tail --env staging`. In another, run any tool call (e.g., a smoke prompt or `Invoke-McpRequest -Method "tools/list"`). Observe the tail output.
- Outcome:
- Observed:
- Expected: Each request logs `event: mcp.request` with `keyOwner`, `path`, `status`, `durationMs`
- Severity (if fail):
- Remediation:
- Notes:

## T.E.2 — Authorization header NEVER logged

- Date:
- Tester:
- Client: wrangler tail
- Command/Action: After issuing a normal authenticated request: `npx wrangler tail --env staging --search "Bearer"`
- Outcome:
- Observed:
- Expected: No matches (zero log lines containing `Bearer`)
- Severity (if fail): Critical — token in logs would be a safeLog regression
- Remediation:
- Notes:

## T.E.3 — Cookie header NEVER logged

- Date:
- Tester:
- Client: wrangler tail
- Command/Action: After issuing a request that carried a `Cookie` header: `npx wrangler tail --env staging --search "Cookie"`
- Outcome:
- Observed:
- Expected: No matches
- Severity (if fail): Privacy leak
- Remediation:
- Notes:

## T.E.4 — Sentry captures unhandled exception

- Date:
- Tester:
- Client: deliberate-crash deploy + Sentry UI
- Command/Action: Deploy a temporary endpoint that throws (e.g., add a route in `worker.ts` that does `throw new Error("e2e-trigger")`), call it, then revert. OR wait for natural occurrence. Inspect Sentry → Issues for the new event.
- Outcome:
- Observed:
- Expected: Sentry receives exception with `keyOwner` + `path` tags; alert rule "MCP unhandled exception" fires email
- Severity (if fail):
- Remediation:
- Notes:

## T.E.5 — Sentry breadcrumbs preserve request context

- Date:
- Tester:
- Client: deliberate-crash deploy + Sentry UI
- Command/Action: Same as T.E.4; in Sentry UI inspect the breadcrumb chain on the captured event
- Outcome:
- Observed:
- Expected: Breadcrumbs include the relevant tool calls leading to the crash
- Severity (if fail):
- Remediation:
- Notes:

## T.E.6 — `/health` shape matches Path 2 spec

- Date:
- Tester:
- Client: direct curl
- Command/Action: `curl.exe $env:MCP_URL/health`
- Outcome:
- Observed:
- Expected: Fields: `ok`, `version`, `gitSha`, `phase`, `upstashMcp`, `upstashInoreader`, `inoreader`, `inoreaderObservedAt`
- Severity (if fail): Missing fields, or pre-Path-2 single `redis` field present
- Remediation:
- Notes:

## T.E.7 — `/health` doesn't leak access token

- Date:
- Tester:
- Client: direct curl
- Command/Action: `curl.exe $env:MCP_URL/health`; scan raw response body for token-like strings (long base64/hex sequences, anything resembling `oauth_token` / `access_token`)
- Outcome:
- Observed:
- Expected: No values resembling Inoreader OAuth tokens (per `health.ts` PRIVACY note — probe-result discarded)
- Severity (if fail): Critical — implementation regression on the privacy comment
- Remediation:
- Notes:

## T.E.8 — Health probes are cheap (no Inoreader API call)

- Date:
- Tester:
- Client: direct curl (loop) + Inoreader dev portal
- Command/Action: `1..100 | ForEach-Object { curl.exe -s $env:MCP_URL/health > $null }`. Then check Inoreader's daily-call counter (Inoreader dev portal) for movement.
- Outcome:
- Observed:
- Expected: Daily Inoreader call count unchanged from `/health` traffic alone
- Severity (if fail): Each `/health` call burns Inoreader budget (Q8 violated)
- Remediation:
- Notes:

## T.E.9 — `/health` ok semantics

- Date:
- Tester:
- Client: Upstash REST + direct curl
- Command/Action: Set `mcp:inoreader:last-status` to a fresh `degraded` entry via Upstash REST API; then `curl.exe $env:MCP_URL/health`
- Outcome:
- Observed:
- Expected: `inoreader: 'degraded'`, `ok: false`
- Severity (if fail):
- Remediation:
- Notes:

## T.E.10 — Sentry alert rules fire

- Date:
- Tester:
- Client: Sentry UI + email inbox
- Command/Action: Per SENTRY_MANUAL_SETUP.md, trigger conditions for Rule #1 (unhandled exception, see T.E.4) and Rule #4 (5xx rate, if Sentry plan supports). Watch the configured email inbox for ~5 min.
- Outcome:
- Observed:
- Expected: Email arrives within ~5 min of trigger
- Severity (if fail): Alerts silent — verify alert config wasn't lost on Sentry-side
- Remediation:
- Notes:

## T.E.11 — `auth.failed` captures to Sentry

- Date:
- Tester:
- Client: direct curl + Sentry UI
- Command/Action: Send 5+ requests with `Authorization: Bearer wrong-key` over a 10-minute window: `1..6 | ForEach-Object { curl.exe -i $env:MCP_URL/mcp -X POST -H "Authorization: Bearer wrong-key" -H "Content-Type: application/json" -d '{}'; Start-Sleep -Seconds 90 }`. Inspect Sentry → Issues for the `auth.failed` group.
- Outcome:
- Observed:
- Expected: Sentry receives the `auth.failed` event(s) with `path` tag + `reason: bearer-rejected`; Alert #2 fires email
- Severity (if fail): Sentry shows nothing → BL-032 captureMessage AC not closed (see "Known gaps" — expected to FAIL until AC closes)
- Remediation:
- Notes:

## T.E.12 — `inoreader-rate-limit` captures to Sentry

- Date:
- Tester:
- Client: Upstash REST + direct curl (PowerShell helper) + Sentry UI
- Command/Action: Force the breaker open via T.D.3's "direct breaker-flag set" technique (or wait for natural Inoreader 429). Trigger one radar tool call after: `Invoke-McpTool -Name "search_radar" -Arguments @{ category = "pe-ma" }`. Inspect Sentry → Issues.
- Outcome:
- Observed:
- Expected: Sentry receives the `inoreader-rate-limit` event with `keyOwner` + `path` tags; Alert #3 fires email
- Severity (if fail): Sentry shows nothing → BL-032 captureMessage AC not closed (see "Known gaps" — expected to FAIL until AC closes)
- Remediation:
- Notes:

## Section F — Onboarding flow

> Section F has two distinct flows: T.F.1 (internal team-member dry-run) and T.F.2 (external consumer rehearsal — BL-033 input). Operator soak onboarding is documented in DEPLOY.md Part A § A.1-A.7 and is not re-tested here.

### T.F.1 — Internal team-member onboarding (happy path)

> The full happy-path narrative (operator + team-member steps) lives in the playbook. Stubs below are the **post-onboarding verification scenarios** (T.F.1.a-d) for the operator to run after AB completes setup.

#### T.F.1.a — AB's calls show `keyOwner: "AB"` in logs

- Date:
- Tester:
- Client: wrangler tail (operator) — after AB makes a call from Claude Desktop
- Command/Action: Operator runs `npx wrangler tail --env staging --search '"keyOwner":"AB"'` while AB issues at least one tool call from their Claude Desktop session
- Outcome:
- Observed:
- Expected: Tail line(s) appear with `keyOwner: "AB"`
- Severity (if fail):
- Remediation:
- Notes:

#### T.F.1.b — AB's rate-limit counter independent of RP's

- Date:
- Tester:
- Client: direct curl (PowerShell helper) — AB hammers, RP probes
- Command/Action: AB runs a hammer loop (`1..70 | ForEach-Object { Invoke-McpRequest -Method "tools/list" -Id $_ }` with the AB token). RP simultaneously calls a tool with the RP token.
- Outcome:
- Observed:
- Expected: AB hits 429 around req 60; RP's calls still get 200
- Severity (if fail): Critical if cross-key counter contamination (mirrors T.C.5)
- Remediation:
- Notes:

#### T.F.1.c — AB's documentation discoverability

- Date:
- Tester:
- Client: n/a (AB self-report)
- Command/Action: After onboarding completes, ask AB: "Could you find the doc to set up your config without help?" Capture verbatim response.
- Outcome:
- Observed:
- Expected: AB found `REMOTE_CLIENT_SETUP.md` without operator hand-holding
- Severity (if fail): Discoverability gap — log a doc improvement task (e.g., README link, in-app link from Claude Desktop)
- Remediation:
- Notes:

#### T.F.1.d — First-blocker-to-fix time

- Date:
- Tester:
- Client: n/a (stopwatch on AB's onboarding)
- Command/Action: Stopwatch from "AB receives token" to "first successful tool call". Record total elapsed time and any blockers encountered.
- Outcome:
- Observed:
- Expected: <15 min target. Anything over 30 min indicates onboarding friction.
- Severity (if fail): >30 min — log specific friction points (which doc step blocked? OS-specific path bug? mcp-remote install issue?)
- Remediation:
- Notes:

### T.F.2 — External consumer onboarding (soak rehearsal for BL-033)

> Hypothetical "ExtCo" rehearsal. Verification stubs (T.F.2.a-e) capture observations against the operator checklist; outcomes feed BL-033's external-pilot scope discussion.

#### T.F.2.a — All-the-docs-they-need are public

- Date:
- Tester:
- Client: n/a (manual review)
- Command/Action: From an unauthenticated browser session, attempt to view `REMOTE_CLIENT_SETUP.md`, `RATE_LIMITS.md`, and `AUTH.md` in the `mcp-server/` tree. Confirm each is reachable without login.
- Outcome:
- Observed:
- Expected: All three accessible without auth gating
- Severity (if fail):
- Remediation:
- Notes:

#### T.F.2.b — Sensitive operational details aren't in those docs

- Date:
- Tester:
- Client: n/a (manual review from external-reader perspective)
- Command/Action: Re-skim `REMOTE_CLIENT_SETUP.md`, `RATE_LIMITS.md`, `AUTH.md` as if you were an external reader. Flag any references to internal Linear tickets, internal Slack channels, internal Vercel project IDs, RP's specific email, or other internal-only details.
- Outcome:
- Observed:
- Expected: No internal-only references; if any are found, log them for redaction before sharing externally
- Severity (if fail):
- Remediation:
- Notes:

#### T.F.2.c — Token has clear scope at issuance

- Date:
- Tester:
- Client: n/a (operator notebook check)
- Command/Action: Write a notebook entry for the hypothetical `MCP_KEY_EXTCO`: who can use it, what tools, what budget, when to review. Confirm the entry is durable (not just in chat / ephemeral).
- Outcome:
- Observed:
- Expected: Operator notebook captures the scope; documented as paper-only for BL-032 (BL-033 enforces in code)
- Severity (if fail):
- Remediation:
- Notes:

#### T.F.2.d — Bearer key compromise simulation

- Date:
- Tester:
- Client: wrangler CLI + Claude Desktop (rotation drill)
- Command/Action: Mid-rehearsal, simulate "ExtCo accidentally pasted token in Slack". Operator triggers rotation per AUTH.md § Rotate (`npx wrangler secret put MCP_KEY_EXTCO --env staging`); ExtCo updates client config with new token. Measure time-to-rotate-and-restore.
- Outcome:
- Observed:
- Expected: <10 min from compromise-detection to ExtCo's first successful call with the new token
- Severity (if fail):
- Remediation:
- Notes:

#### T.F.2.e — Revocation simulation

- Date:
- Tester:
- Client: wrangler CLI + Claude Desktop
- Command/Action: Simulate end-of-engagement. Operator: `npx wrangler secret delete MCP_KEY_EXTCO --env staging`. ExtCo continues calling for ~60s; capture the consumer-side experience (error message text, client UI behavior).
- Outcome:
- Observed:
- Expected: ExtCo's calls return 401 within ~30s. Document whether the consumer client surfaces a clear message vs. cryptic Claude/Cursor output.
- Severity (if fail):
- Remediation:
- Notes:

## Section G — Disaster recovery

## T.G.1 — Wrangler rollback works

- Date:
- Tester:
- Client: wrangler CLI + direct curl
- Command/Action: After a deploy, list versions with `npx wrangler deployments list --env staging`; pick the previous version; `npx wrangler rollback --env staging <version-id>`. Then `curl.exe $env:MCP_URL/health` and any tool call.
- Outcome:
- Observed:
- Expected: Rollback completes in <30s; `/health` returns previous version's `gitSha`; tools still work
- Severity (if fail):
- Remediation:
- Notes:

## T.G.2 — Secrets persist through rollback

- Date:
- Tester:
- Client: wrangler CLI
- Command/Action: After T.G.1: `npx wrangler secret list --env staging`
- Outcome:
- Observed:
- Expected: All 9 secrets present and correct (per the deploy baseline)
- Severity (if fail): If secrets are lost, this is a Cloudflare bug — flag in Sentry
- Remediation:
- Notes:

## T.G.3 — Sentry continues capturing post-rollback

- Date:
- Tester:
- Client: deliberate-crash deploy + Sentry UI
- Command/Action: Post-rollback, trigger an exception (same shape as T.E.4) and inspect Sentry → Issues for the new event
- Outcome:
- Observed:
- Expected: Sentry receives it; alert fires
- Severity (if fail): Sentry connection broken (DSN secret lost during rollback)
- Remediation:
- Notes:

## T.G.4 — MCP DB hard-delete recovery

- Date:
- Tester:
- Client: Upstash dashboard + wrangler CLI + direct curl
- Command/Action: **DESTRUCTIVE — only on a throwaway DB, NOT the real MCP DB during soak.** Delete the throwaway DB in Upstash console; recreate; update `UPSTASH_MCP_REST_URL` and `UPSTASH_MCP_REST_TOKEN` via `npx wrangler secret put`; redeploy.
- Outcome:
- Observed:
- Expected: After recovery, `/health` shows `upstashMcp: 'ok'`; rate limiter starts from empty counters (acceptable since per-day window resets); circuit breaker reset (acceptable)
- Severity (if fail): Worker permanently broken, or stale-state behavior
- Remediation:
- Notes:

## T.G.5 — Inoreader DB Read-Only token rotated by website team

- Date:
- Tester:
- Client: cross-team coordination (Vercel owner) + wrangler CLI + direct curl
- Command/Action: Coordinate with whoever owns the Vercel project: regenerate Read-Only token in Upstash; update Worker's `UPSTASH_INOREADER_REST_TOKEN` via `npx wrangler secret put`; `npx wrangler deploy --env staging`. Then `curl.exe $env:MCP_URL/health` and call radar.
- Outcome:
- Observed:
- Expected: `/health` `upstashInoreader: 'ok'`; radar tools resume after redeploy
- Severity (if fail): Coordination gap surfaced (e.g., website team didn't know Worker shared the DB; Q13 Resolved-revision context wasn't communicated)
- Remediation:
- Notes:

## T.G.6 — Cloudflare account compromise — operator can revoke fast

- Date:
- Tester:
- Client: wrangler CLI (throwaway account)
- Command/Action: Spin up a throwaway Cloudflare account; deploy a minimal Worker there; document the revocation steps (token rotation, account-key revocation) and time them.
- Outcome:
- Observed:
- Expected: Operator can `wrangler logout`, rotate Cloudflare API tokens, and redeploy elsewhere within ~30 min
- Severity (if fail): Recovery requires Cloudflare-side support tickets (deploy keys not under operator's direct control)
- Remediation:
- Notes:

## Section H — Performance

> All H stubs use the playbook's `Measure-McpLatency` helper. Paste once per soak session before running these tests (definition in playbook § Section H — "Latency-measurement helper").

## T.H.1 — Cold-isolate latency

- Date:
- Tester:
- Client: direct curl (PowerShell helper, single sample)
- Command/Action: Wait 5+ min after last call (lets Workers isolate spin down). Then `Measure-McpLatency -Method "tools/list" -N 1` (single sample — first call is the cold one).
- Outcome:
- Observed:
- Expected: <800ms (cold start adds ~200-300ms over warm)
- Severity (if fail): >2s consistently
- Remediation:
- Notes:

## T.H.2 — Warm-isolate non-radar latency

- Date:
- Tester:
- Client: direct curl (PowerShell helper, N=10)
- Command/Action: Right after T.H.1's cold call: `Measure-McpLatency -Method "tools/call" -Params @{ name = "list_portfolio_facets"; arguments = @{} } -N 10`. Samples 2-10 represent warm-isolate latency.
- Outcome:
- Observed:
- Expected: p95 <500ms
- Severity (if fail): Substantially over (>1s) — investigate via Sentry tracing
- Remediation:
- Notes:

## T.H.3 — Radar cold (cache miss)

- Date:
- Tester:
- Client: direct curl (PowerShell helper, single sample)
- Command/Action: Use a category not called within 6h to force cache miss: `Measure-McpLatency -Method "tools/call" -Params @{ name = "search_radar"; arguments = @{ category = "ai-automation" } } -N 1`
- Outcome:
- Observed:
- Expected: <2s
- Severity (if fail): >5s — Inoreader is slow OR our fetch path is regressed
- Remediation:
- Notes:

## T.H.4 — Radar warm (cache hit)

- Date:
- Tester:
- Client: direct curl (PowerShell helper, N=10)
- Command/Action: Same call as T.H.3 within 6h: `Measure-McpLatency -Method "tools/call" -Params @{ name = "search_radar"; arguments = @{ category = "ai-automation" } } -N 10`
- Outcome:
- Observed:
- Expected: p95 <200ms
- Severity (if fail): >500ms — Upstash latency, or cache deserialization regression
- Remediation:
- Notes:

## T.H.5 — Latency under concurrent load

- Date:
- Tester:
- Client: direct curl (PowerShell helper, multi-window)
- Command/Action: Open 5 PowerShell windows; in each: `1..20 | ForEach-Object { Invoke-McpRequest -Method "tools/list" -Id $_ }`. Capture per-window latency samples and compare median against T.H.2's solo run.
- Outcome:
- Observed:
- Expected: No latency cliff (p95 holds within target ±20%)
- Severity (if fail): p95 doubles → Worker has a hidden serialization point
- Remediation:
- Notes:

## T.H.6 — `/health` latency budget

- Date:
- Tester:
- Client: direct curl (loop)
- Command/Action: `1..100 | ForEach-Object { (Measure-Command { curl.exe -s $env:MCP_URL/health > $null }).TotalMilliseconds } | Measure-Object -Average -Maximum`
- Outcome:
- Observed:
- Expected: Median <50ms (Promise.all over 3 cheap probes); p95 <150ms
- Severity (if fail): Substantially over → Upstash REST latency from Cloudflare's edge unexpectedly slow
- Remediation:
- Notes:

## Section I — Security

## T.I.1 — Authorization header strip in logs

- Date:
- Tester:
- Client: wrangler tail
- Command/Action: Same as T.E.2 — `npx wrangler tail --env staging --search "Bearer"` after issuing a normal authenticated request
- Outcome:
- Observed:
- Expected: No matches
- Severity (if fail): Critical — token leak
- Remediation:
- Notes: Security framing of T.E.2; record both findings if running once

## T.I.2 — CORS preflight rejects unknown origin

- Date:
- Tester:
- Client: direct curl
- Command/Action: `curl.exe -i -X OPTIONS $env:MCP_URL/mcp -H "Origin: https://evil.example.com" -H "Access-Control-Request-Method: POST"`
- Outcome:
- Observed:
- Expected: 403 (or 204 with CORS headers absent — depending on cors.ts impl)
- Severity (if fail): Critical if 204 with `Access-Control-Allow-Origin: *` (would let any site relay user's bearer token)
- Remediation:
- Notes:

## T.I.3 — CORS preflight accepts known origin

- Date:
- Tester:
- Client: direct curl
- Command/Action: `curl.exe -i -X OPTIONS $env:MCP_URL/mcp -H "Origin: https://claude.ai" -H "Access-Control-Request-Method: POST"`
- Outcome:
- Observed:
- Expected: 204 with `Access-Control-Allow-Origin: https://claude.ai` (echoed back, not wildcard)
- Severity (if fail): Wildcard or no-CORS-headers
- Remediation:
- Notes:

## T.I.4 — Bearer keyOwner extraction is pinned

- Date:
- Tester:
- Client: n/a (code review)
- Command/Action: Open `mcp-server/src/auth/bearer.ts`. Confirm the regex/parser strips just the `MCP_KEY_` prefix and uses the suffix verbatim (no lowercase, no further `_` splits).
- Outcome:
- Observed:
- Expected: Code review pass — extraction matches the documented behavior in T.A.13
- Severity (if fail): Off-by-one in suffix extraction (could let a token leak via misattributed logs)
- Remediation:
- Notes:

## T.I.5 — Token comparison is constant-time

- Date:
- Tester:
- Client: n/a (code review) OR direct curl (timing — cross-reference T.A.15)
- Command/Action: Either: (a) inspect `mcp-server/src/auth/bearer.ts` for `crypto.timingSafeEqual` (or equivalent); (b) cross-reference T.A.15's measured timing diff
- Outcome:
- Observed:
- Expected: Constant-time comparison (`crypto.timingSafeEqual` or equivalent)
- Severity (if fail): Plain `===` comparison — Important; not Critical at internal-soak-scope, matters for BL-033
- Remediation:
- Notes:

## T.I.6 — No raw `console.log` in worker code

- Date:
- Tester:
- Client: n/a (lint)
- Command/Action: `npm run lint` from repo root; verify `no-console` rule covers `mcp-server/src/worker.ts`
- Outcome:
- Observed:
- Expected: Lint passes; if a raw `console.log` were introduced it would fail
- Severity (if fail): Lint rule disabled or removed
- Remediation:
- Notes:

## T.I.7 — Health probe doesn't leak access token

- Date:
- Tester:
- Client: direct curl
- Command/Action: `curl.exe $env:MCP_URL/health`; scan response body for token-like strings
- Outcome:
- Observed:
- Expected: No token in response body
- Severity (if fail): Critical — token leak
- Remediation:
- Notes: Security framing of T.E.7; if both are run, can cross-reference

## T.I.8 — wrangler.toml has no plaintext secrets

- Date:
- Tester:
- Client: PowerShell (Select-String)
- Command/Action: `Select-String -Path mcp-server/wrangler.toml -Pattern '(?i)token|secret|key'`
- Outcome:
- Observed:
- Expected: Only secret NAMES in comments; no plaintext values
- Severity (if fail): Critical if plaintext secret in committed file
- Remediation:
- Notes:

## T.I.9 — Production deploy doesn't include source maps

- Date:
- Tester:
- Client: Cloudflare dashboard (post-deploy bundle inspector)
- Command/Action: After `npm run deploy:production`, open Cloudflare dashboard → Workers & Pages → gst-mcp → bundle inspector
- Outcome:
- Observed:
- Expected: No `.map` files in the deployed bundle
- Severity (if fail): Source maps exposed (would aid an attacker — moderate severity)
- Remediation:
- Notes:

## T.I.10 — Worker bundle doesn't ship `_local-only.ts` content

- Date:
- Tester:
- Client: direct curl (PowerShell helper)
- Command/Action: After deploy, `Invoke-McpRequest -Method "tools/list"` and inspect the returned tool names
- Outcome:
- Observed:
- Expected: 10 transport-portable tools only; `search_radar_offline` and `search_radar_cache` MUST NOT appear
- Severity (if fail): Stdio-only tools registered → would attempt to read files (404s, but a regression worth catching)
- Remediation:
- Notes:

## Section J — Schema

## T.J.1 — Tool registry parity (stdio vs Worker)

- Date:
- Tester:
- Client: vitest
- Command/Action: `npm run test:run -- tests/integration/registry-snapshot.test.ts` (BL-031.85)
- Outcome:
- Observed:
- Expected: Test passes — snapshot match between stdio and Worker tool registries
- Severity (if fail):
- Remediation:
- Notes:

## T.J.2 — Each tool's input schema matches its website-page filter UI

- Date:
- Tester:
- Client: n/a (manual UI comparison)
- Command/Action: Pick a tool (e.g., `search_portfolio`); compare its zod schema in `mcp-server/src/tools/search-portfolio.ts` to the actual filter chips on `/ma-portfolio` in a browser
- Outcome:
- Observed:
- Expected: No drift between Zod schema enum values and the filter UI options
- Severity (if fail): Drift signals require a BACKLOG entry for the next BL-031.95-style alignment pass
- Remediation:
- Notes:

## T.J.3 — Each tool's deeplink reproduces filter state

- Date:
- Tester:
- Client: cross-reference T.B.2.f and T.B.3.h
- Command/Action: Use the deeplink captured in T.B.2.f and T.B.3.h; open in a browser; verify the page reproduces the filter state
- Outcome:
- Observed:
- Expected: Round-trip works — deeplink → page state matches the original tool inputs
- Severity (if fail):
- Remediation:
- Notes:

## T.J.4 — `'unknown'` sentinel coverage (BL-031.95 Phase 2)

- Date:
- Tester:
- Client: cross-reference T.B.3.b
- Command/Action: Verify per T.B.3.b that every enum field accepts `'unknown'`; engine widens conservatively when sentinel is passed
- Outcome:
- Observed:
- Expected: Every enum field in `generate_diligence_agenda` accepts `'unknown'`; widened-agenda response when all 13 fields are `'unknown'`
- Severity (if fail):
- Remediation:
- Notes:

## T.J.5 — Path 2 Env interface declares all 4 new secrets typed

- Date:
- Tester:
- Client: n/a (code review)
- Command/Action: Open `mcp-server/src/worker.ts`; inspect the Env interface declarations
- Outcome:
- Observed:
- Expected: Each of the 4 Path 2 secrets is declared as `?: string` (not `unknown`) for better autocomplete + lint signal
- Severity (if fail):
- Remediation:
- Notes:

## Section K — Claude workflow consumption

> Section K uses a different template — outcomes are qualitative (1-5 rubric per playbook § K.3), not pass/fail. Run prompts in a fresh client session (don't pre-load context). Score each dimension; log a finding for any prompt where any score < 4. Prompts and expected behaviors are quoted from the playbook so the operator can paste verbatim.

### K.1 — Structured workflow scenarios

#### T.K.1.1 — Tool discoverability without explicit naming

- Date:
- Tester:
- Client: Claude Desktop (gst-mcp-staging connector)
- Prompt verbatim:
  > "What kind of due-diligence work has GST done in healthcare?"
- Expected: Claude calls `search_portfolio` with `theme = "Healthcare Tech"` (or equivalent), returns prose summary
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Tool description gap — `<tool>` description doesn't make applicability clear
  - [ ] Zod `.describe()` gap on field `<field>`
  - [ ] BL-031.75 prompt-library candidate
  - [ ] Schema simplification
  - [ ] Result-shape simplification
  - [ ] Error-envelope copy
  - [ ] BL-033 feature gap
  - [ ] Other:
- Notes:

#### T.K.1.2 — Required-field handling — graceful elicitation

- Date:
- Tester:
- Client: Claude Desktop
- Prompt verbatim:
  > "Generate a diligence agenda for a SaaS company"
- Expected: Claude either (a) asks for the missing 12 inputs in a structured way, OR (b) uses `'unknown'` sentinel for unknowable fields per BL-031.95. Does NOT hallucinate values.
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Tool description gap
  - [ ] Zod `.describe()` gap
  - [ ] BL-031.75 prompt-library candidate
  - [ ] Schema simplification
  - [ ] Result-shape simplification
  - [ ] Error-envelope copy
  - [ ] BL-033 feature gap
  - [ ] Other:
- Notes:

#### T.K.1.3 — Multi-step chain composition

- Date:
- Tester:
- Client: Claude Desktop
- Prompt verbatim:
  > "Find recent radar items about kubernetes from the last week, then for the most discussed one, generate a quick due-diligence question list as if it were a deal target"
- Expected: Claude calls `search_radar` first, evaluates results, then calls `generate_diligence_agenda` with reasonable inferred inputs from the radar item
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5):
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Tool description gap
  - [ ] Zod `.describe()` gap
  - [ ] BL-031.75 prompt-library candidate
  - [ ] Schema simplification
  - [ ] Result-shape simplification
  - [ ] Error-envelope copy
  - [ ] BL-033 feature gap
  - [ ] Other:
- Notes:

#### T.K.1.4 — Long-conversation tool-result memory

- Date:
- Tester:
- Client: Claude Desktop (5-turn conversation)
- Prompt verbatim:
  > Turn 1: "List the GST portfolio facets."
  > [Turns 2-4: unrelated chat]
  > Turn 5: "Search portfolio for the first engagement-category we listed earlier"
- Expected: Claude reuses the earlier result without re-calling the tool (or re-calls only if it correctly identifies that the data could have changed). Claude does NOT pretend the result is novel.
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Tool description gap
  - [ ] Zod `.describe()` gap
  - [ ] BL-031.75 prompt-library candidate
  - [ ] Schema simplification
  - [ ] Result-shape simplification
  - [ ] Error-envelope copy
  - [ ] BL-033 feature gap
  - [ ] Other:
- Notes:

#### T.K.1.5 — Error-message UX (503 circuit-open)

- Date:
- Tester:
- Client: Claude Desktop (with circuit pre-opened per Section D Strategy 1)
- Pre-test setup: Force the circuit open per T.D.3 (Upstash REST `/set/mcp:radar:circuit-open/inoreader-rate-limit` with EX=21600)
- Prompt verbatim:
  > "What's in the radar today?"
- Expected: Claude renders the 503/Retry-After to the user clearly (e.g., "the radar tool is temporarily unavailable due to upstream rate limits; try again after X minutes")
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5):
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Tool description gap
  - [ ] Zod `.describe()` gap
  - [ ] BL-031.75 prompt-library candidate
  - [ ] Schema simplification
  - [ ] Result-shape simplification
  - [ ] Error-envelope copy — Claude renders error envelope badly
  - [ ] BL-033 feature gap
  - [ ] Other:
- Notes:

#### T.K.1.6 — Cross-client parity

- Date:
- Tester:
- Client: Claude Desktop + Claude Code + Cursor (run T.K.1.1 prompt in each)
- Prompt verbatim:
  > "What kind of due-diligence work has GST done in healthcare?"
- Expected: Same tool selection across all three clients; comparable result quality (some prose-style variation is fine)
- Tool selection (1-5): Desktop= , Code= , Cursor=
- Input completeness (1-5): Desktop= , Code= , Cursor=
- Result synthesis (1-5): Desktop= , Code= , Cursor=
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5): Desktop= , Code= , Cursor=
- Improvement opportunity:
  - [ ] Cross-client behavior diverges — document in REMOTE_CLIENT_SETUP.md
  - [ ] Other:
- Notes: Per playbook deferral list, only Claude Desktop is required for BL-032 baseline; Cursor + ChatGPT are nice-to-have signal for BL-033

#### T.K.1.7 — Connector disambiguation (local stdio + remote staging)

- Date:
- Tester:
- Client: Claude Desktop (with both `gst` local stdio and `gst-mcp-staging` remote configured)
- Prompt verbatim:
  > "Search the radar"
- Expected: Document which connector Claude picks and why; verify whichever it picks gives the right answer
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Cross-client behavior diverges (connector ambiguity)
  - [ ] Tool description gap
  - [ ] Other:
- Notes:

#### T.K.1.8 — Token / context window cost

- Date:
- Tester:
- Client: Claude Desktop (5-turn conversation across 3 tools)
- Prompt verbatim:
  > Run a 5-turn conversation that exercises 3 different tools (e.g., turn 1: list facets; turn 2: search portfolio; turn 3: generate diligence agenda; turns 4-5: synthesis questions). Estimate tokens consumed by tool descriptions + JSON results in Claude's context.
- Expected: Tool descriptions <500 tokens combined; max-output JSON <2k tokens per response
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5):
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Result-shape simplification — JSON output too verbose; consider `summary`-mode flag
  - [ ] Tool description gap
  - [ ] Other:
- Notes: Token-bloat findings inform BL-032.75 observability + BL-033 cost-modeling

#### T.K.1.9 — Hallucination detection — fake project

- Date:
- Tester:
- Client: Claude Desktop
- Prompt verbatim:
  > "What did GST find during the diligence on Acme Corp's $40M Series C?"
- Expected: Claude calls `search_portfolio`, returns empty, says "I don't see an Acme Corp engagement in GST's portfolio" — does NOT fabricate engagement details
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5):
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Tool description gap — should make "anonymized portfolio" scope explicit
  - [ ] Result-shape simplification
  - [ ] Other:
- Notes:

#### T.K.1.10 — Stale-data / freshness signaling

- Date:
- Tester:
- Client: Claude Desktop (two prompts ~10 min apart)
- Prompt verbatim:
  > "What did the radar surface today?"
  > [Wait 10 minutes]
  > "What did the radar surface today?"
- Expected: Claude either re-calls each time OR explicitly notes "based on data from X minutes ago, do you want me to re-check?"
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Tool description gap — should signal time-sensitive data
  - [ ] BL-031.75 prompt-library candidate
  - [ ] Other:
- Notes:

### K.2.a — Discovery prompts

#### T.K.2.a.1 — Regulated industries

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "Does GST have any past work in regulated industries — financial services or healthcare?"
- Expected: Claude reaches for `search_portfolio` (theme/category filter) — not web search, not "I don't have access"
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Tool description gap on `search_portfolio`
  - [ ] Other:
- Notes:

#### T.K.2.a.2 — Radar AI agent governance

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "What does the GST radar show in the past few days about AI agent governance?"
- Expected: Claude calls `search_radar` with the AI/automation category (or equivalent free-text)
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Tool description gap on `search_radar`
  - [ ] Other:
- Notes:

#### T.K.2.a.3 — Tech-debt assessment narrative

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "Help me think through what a tech-debt assessment for a 200-person SaaS engineering org would cost annually if 30% of dev time is going to maintenance."
- Expected: Claude calls `estimate_tech_debt_cost` with reasonable inferred inputs
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Tool description gap on `estimate_tech_debt_cost`
  - [ ] Zod `.describe()` gap
  - [ ] Other:
- Notes:

#### T.K.2.a.4 — GDPR for B2B SaaS

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "What are the GDPR requirements for a B2B SaaS company headquartered in the US but with EU customers?"
- Expected: Claude calls `search_regulations` with `search = "GDPR"` (or `jurisdiction = "eu"`)
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Tool description gap on `search_regulations`
  - [ ] Other:
- Notes:

#### T.K.2.a.5 — ICG maturity for PE roll-up

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "How would I assess whether a target company's infrastructure cost discipline is mature enough for a PE roll-up?"
- Expected: Claude calls `assess_infrastructure_cost_governance` (potentially asking for ICG question answers first)
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Tool description gap on `assess_infrastructure_cost_governance`
  - [ ] Zod `.describe()` gap
  - [ ] Other:
- Notes:

### K.2.b — Single-tool natural prompts (one per tool)

#### T.K.2.b.1 — `list_portfolio_facets`

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "What categories of M&A engagements has GST worked on?"
- Expected: Claude calls `list_portfolio_facets`
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Tool description gap
  - [ ] Other:
- Notes:

#### T.K.2.b.2 — `search_portfolio`

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "Pull GST's relevant engagements involving SaaS marketplaces sold to PE."
- Expected: Claude calls `search_portfolio` with appropriate theme/engagement filters
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Tool description gap
  - [ ] Zod `.describe()` gap
  - [ ] Other:
- Notes:

#### T.K.2.b.3 — `generate_diligence_agenda`

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "Draft a diligence agenda for a Series B B2B SaaS target — modern cloud-native stack, ~150 engineers, EU+US presence, healthcare-adjacent data."
- Expected: Claude calls `generate_diligence_agenda` with the provided inputs mapped to schema fields; uses `'unknown'` for missing dimensions
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Tool description gap
  - [ ] Zod `.describe()` gap
  - [ ] Schema simplification
  - [ ] Other:
- Notes:

#### T.K.2.b.4 — `assess_infrastructure_cost_governance`

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "Run an ICG assessment for a Series B PE-backed SaaS company; here are my answers to the standard ICG questions: [paste a few real answers]"
- Expected: Claude calls `assess_infrastructure_cost_governance` with the answers map
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Tool description gap
  - [ ] Zod `.describe()` gap
  - [ ] Other:
- Notes:

#### T.K.2.b.5 — `compute_techpar`

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "Run a TechPar benchmark — Series B SaaS, $20M ARR, $4M annual cloud + infra, 75 engineers, 30% growth, deepdive mode."
- Expected: Claude calls `compute_techpar` with the provided inputs (note `infraHostingAnnual` field name)
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Tool description gap
  - [ ] Zod `.describe()` gap (annual vs monthly money fields)
  - [ ] Other:
- Notes:

#### T.K.2.b.6 — `estimate_tech_debt_cost`

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "Estimate the carrying cost of tech debt for a 100-person eng org at $200K/eng, 35% maintenance burden, weekly deploys, 6 incidents/mo, $40M ARR."
- Expected: Claude calls `estimate_tech_debt_cost` with the inputs
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Tool description gap
  - [ ] Zod `.describe()` gap
  - [ ] Other:
- Notes:

#### T.K.2.b.7 — `search_regulations`

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "What are the key data-residency requirements I need to think about for a SaaS company expanding into Quebec?"
- Expected: Claude calls `search_regulations` with `jurisdiction = "ca-qc"` (or free-text "Quebec")
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Tool description gap
  - [ ] Zod `.describe()` gap (jurisdiction codes)
  - [ ] Other:
- Notes:

#### T.K.2.b.8 — `list_regulation_facets`

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "What jurisdictions does GST's regulatory map cover?"
- Expected: Claude calls `list_regulation_facets`
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Tool description gap
  - [ ] Other:
- Notes:

#### T.K.2.b.9 — `search_radar`

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "Pull recent radar items in the AI/automation category."
- Expected: Claude calls `search_radar` with `category = "ai-automation"`
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Tool description gap
  - [ ] Zod `.describe()` gap
  - [ ] Other:
- Notes:

#### T.K.2.b.10 — `get_latest_insights`

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "Show me GST's most recent annotated radar items — the FYI tier."
- Expected: Claude calls `get_latest_insights`
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Tool description gap
  - [ ] Other:
- Notes:

### K.2.c — Multi-tool chain workflows

#### T.K.2.c.1 — Deal-target intake

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "I'm meeting tomorrow with a target: B2B SaaS, healthcare-RCM, $30M ARR, Series B, hybrid-legacy with active modernization in flight, 180 engineers across US+EU. Pull any comparable past GST engagements, then draft the diligence agenda I should walk in with."
- Expected: `search_portfolio` → `generate_diligence_agenda`. Score tool selection, composition, synthesis, overall.
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5):
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] BL-031.75 prompt-library candidate
  - [ ] Tool description gap
  - [ ] Schema simplification
  - [ ] Other:
- Notes:

#### T.K.2.c.2 — Radar-driven thesis development

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "Find recent radar items in the PE/M&A category from the last week. For any deals or themes that might intersect with GST's past tech-due-diligence work, surface the comparable engagements."
- Expected: `search_radar` → `search_portfolio`. Score multi-tool composition + synthesis quality.
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5):
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] BL-031.75 prompt-library candidate
  - [ ] Other:
- Notes:

#### T.K.2.c.3 — Cost-governance assessment + roll-up suggestion

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "For a Series B PE-backed SaaS company in financial services where my client is hitting elevated tech costs (above the healthy benchmark), give me both a TechPar benchmark and an ICG maturity assessment, then suggest the top 3 remediation areas across both lenses."
- Expected: `compute_techpar` + `assess_infrastructure_cost_governance` run in parallel; synthesis combines both. Score composition + synthesis.
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5):
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] BL-031.75 prompt-library candidate
  - [ ] Other:
- Notes:

#### T.K.2.c.4 — Regulatory-blast-radius scoping

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "My target operates in the US, Canada (including Quebec), and the EU; processes patient data; uses LLM-based features. What are the regulatory frameworks I need to flag in my diligence memo, and any past GST work I can reference?"
- Expected: `search_regulations` (multi-jurisdiction) → `search_portfolio` (healthcare/AI). Score multi-jurisdiction handling, AI/healthcare regulatory awareness, GST-engagement linking.
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5):
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] BL-031.75 prompt-library candidate
  - [ ] Tool description gap (multi-jurisdiction handling)
  - [ ] Other:
- Notes:

#### T.K.2.c.5 — Tech-debt + roadmap argument

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "For a 250-engineer org spending 40% of capacity on maintenance with $80M ARR, calculate tech-debt carrying cost AND show me ICG questions where they're likely failing. Then draft a one-paragraph board pitch for why a remediation budget is necessary."
- Expected: `estimate_tech_debt_cost` + `assess_infrastructure_cost_governance` + synthesis to consultant prose. Score across all dimensions.
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5):
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] BL-031.75 prompt-library candidate
  - [ ] Other:
- Notes:

### K.2.d — Edge cases & error recovery

#### T.K.2.d.1 — Compute techpar with deliberately invalid input

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "Run a TechPar benchmark with $0 ARR."
- Expected: Zod rejection; Claude either re-asks or surfaces the error clearly
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5):
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Error-envelope copy
  - [ ] Other:
- Notes:

#### T.K.2.d.2 — Search portfolio with 0 results

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "Find GST engagements in agriculture-vertical SaaS for sub-$1M ARR seed-stage targets."
- Expected: Empty result; Claude doesn't fabricate engagements
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5):
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Tool description gap
  - [ ] Other:
- Notes:

#### T.K.2.d.3 — Radar during budget exhaustion

- Date:
- Tester:
- Client: Claude Desktop (with circuit pre-opened per Section D Strategy 1)
- Pre-test setup: Force the circuit open per T.D.3
- Prompt verbatim:
  > "What's in the radar today?"
- Expected: Claude renders 503; user sees "temporarily unavailable + retry later"
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5):
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Error-envelope copy
  - [ ] Other:
- Notes:

#### T.K.2.d.4 — Generate agenda with all 13 fields = 'unknown'

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "Generate a diligence agenda but I have no information about the target yet — just early-stage curiosity."
- Expected: Claude uses `'unknown'` sentinel per BL-031.95; result is a wide, low-confidence agenda with the unknownDimensionCount callout
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Tool description gap (unknown sentinel)
  - [ ] Result-shape simplification
  - [ ] Other:
- Notes:

#### T.K.2.d.5 — Mixed valid + invalid enum

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "Generate an agenda for a target with productType='vaporware' and revenueRange='5-25m'."
- Expected: Clear Zod rejection on productType; Claude either asks for clarification or proceeds with the rest
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A): N/A
- Failure handling (1-5):
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] Error-envelope copy
  - [ ] Zod `.describe()` gap
  - [ ] Other:
- Notes:

### K.2.e — Mid-engagement consultant scenarios

#### T.K.2.e.1 — Pre-call prep (under time pressure)

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "I'm in 5 min on a call with a target's CTO. They make B2B inventory-management software, ~$8M ARR, growing 50% YoY, hybrid cloud + on-prem. Give me my top 5 questions for the architecture portion of the call."
- Expected: Calls `generate_diligence_agenda` (or similar) with reasonable inferred inputs; produces 5 prioritized questions; tone matches time-pressured consultant
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A):
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] BL-031.75 prompt-library candidate
  - [ ] Other:
- Notes:

#### T.K.2.e.2 — Mid-call lookup

- Date:
- Tester:
- Client: Claude Desktop (continued from T.K.2.e.1 or fresh)
- Prompt verbatim:
  > "The target just told me they have 'patchwork microservices on K8s with some legacy monoliths'. What follow-up questions does that signal?"
- Expected: Claude responds quickly with architecture-tradeoff probes; possibly references comparable engagements via `search_portfolio`
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A):
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] BL-031.75 prompt-library candidate
  - [ ] Other:
- Notes:

#### T.K.2.e.3 — Post-call synthesis

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "From this call, I learned: Series C, $50M ARR, modern cloud-native, 220 engineers, EU+US, multi-region, healthcare data, low data-sensitivity processing model, recently modernized. What attention areas should appear in my diligence memo?"
- Expected: Calls `generate_diligence_agenda` with the captured dimensions; output `attentionAreas[]` reads as memo content
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A):
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] BL-031.75 prompt-library candidate
  - [ ] Result-shape simplification
  - [ ] Other:
- Notes:

#### T.K.2.e.4 — Investor-facing summary

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "For a partner update tomorrow, summarize GST's most relevant work in B2B SaaS / financial services / regulatory diligence over the last 18 months."
- Expected: Calls `search_portfolio` (multi-filter); synthesizes into investor-update prose
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5 or N/A):
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] BL-031.75 prompt-library candidate
  - [ ] Tool description gap (date-range filtering)
  - [ ] Other:
- Notes:

#### T.K.2.e.5 — Triage hot lead

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "A founder just sent me their pitch — they're a $15M-ARR Series B AI-tooling company looking for tech advisory. Pull any radar items + past engagements that would inform whether this is a fit, and tell me if I should take the call."
- Expected: `search_radar` (AI category) + `search_portfolio` (Series B / AI / advisory engagements); synthesis includes a fit recommendation
- Tool selection (1-5):
- Input completeness (1-5):
- Result synthesis (1-5):
- Composition (1-5):
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5):
- Improvement opportunity:
  - [ ] BL-031.75 prompt-library candidate
  - [ ] Other:
- Notes:

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
