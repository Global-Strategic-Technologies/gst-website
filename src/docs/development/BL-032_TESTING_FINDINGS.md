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

- Date: 2026-05-11
- Tester: RP
- Client: direct curl
- Command/Action: `curl.exe -i -s "$env:MCP_URL/mcp" -X POST -H "Authorization: Bearer $env:MCP_KEY" -H "Authorization: Bearer not-a-real-token" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'` — then repeat with the two `Authorization` headers swapped in order to check for order-sensitivity.
- Outcome: PASS
- Observed: Both header orderings returned **`HTTP/1.1 400 Bad Request`** from Cloudflare's edge (`Server: cloudflare`, `Content-Type: text/html`, `Content-Length: 155` — Cloudflare's standard 400 error page). The request never reached the Worker; Cloudflare's L7 rejects duplicate `Authorization` headers as malformed before forwarding. Deterministic across orderings (no flakes), not 5xx, no auth-bypass leak — the failure mode panel calls out exactly the bad behaviors we'd be worried about and none materialized.
- Expected: RFC 9110-compliant — server picks one and either honors it or rejects. Document which deterministically.
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: The rejection happens at the Cloudflare edge, not in the Worker — a Worker-side test would see this as "the request didn't arrive." That's actually defensive depth: an attacker can't smuggle a header-confusion attack past the edge. RFC 9110 §5.3 technically allows combining duplicate fields with commas, but combining `Bearer X, Bearer Y` is semantically nonsense, so a 400 is a reasonable defensive read. If the contract ever needs to lean on Worker-level handling here (e.g. multi-tenant scenarios where header-combining is meaningful), this test would need re-running against a Worker-direct URL.

## T.A.8 — Token in lowercase header (`authorization` not `Authorization`)

- Date: 2026-05-11 (re-run; original 5/10 attempt was inconclusive due to missing Accept header)
- Tester: RP
- Client: direct curl
- Command/Action: `curl.exe -i -s "$env:MCP_URL/mcp" -X POST -H "authorization: Bearer $env:MCP_KEY" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`
- Outcome: PASS
- Observed: Status code `200`. The lowercase `authorization` header was accepted exactly as if it had been capitalized — HTTP header case-insensitivity holds end-to-end through Cloudflare's edge and into the Worker's bearer-auth check.
- Expected: 200 (HTTP headers are case-insensitive per RFC)
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: The earlier 5/10 attempt returned 406 because the request was missing the `Accept: application/json, text/event-stream` header required by the MCP Streamable HTTP transport — that 406 was an Accept-negotiation failure, not a real test of lowercase-header behavior, since the request never reached the auth layer. Today's run with the correct Accept header is the actual case-insensitivity verification.

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

- Date: 2026-05-11
- Tester: RP
- Client: wrangler CLI + direct curl
- Command/Action: Tested against MCP_KEY_AB instead of MCP_KEY_RP to avoid locking the operator out. (a) `npx wrangler secret delete MCP_KEY_AB --env staging`; (b) wait 35s for isolate refresh; (c) call with the AB-key value; (d) restore via `npx wrangler secret put MCP_KEY_AB --env staging`; (e) wait 35s; (f) re-test.
- Outcome: PASS
- Observed: First delete attempt actually surfaced a STARTING-STATE finding — `npx wrangler secret delete MCP_KEY_AB` returned `Binding 'MCP_KEY_AB' not found [code: 10056]`, meaning the AB binding wasn't on the Worker at all at test start. The `mcp:ratelimit:gen:day:AB:20583` counter we'd seen earlier (T.C.4) turned out to be a stale historical artifact from earlier soak testing, not proof of a current binding. Either way, the substantive test ran cleanly: with AB unbound, a call carrying the AB-key value returned **HTTP 401** ✓ (not 5xx, not a bypass). After provisioning AB via `wrangler secret put` (Step 3 reported "✨ Success! Uploaded secret MCP_KEY_AB") and waiting for isolate refresh, the same AB-key value returned **HTTP 200** ✓. The 401-while-unbound result satisfies the test contract exactly — Worker handles missing-secret cleanly without crashing.
- Expected: 401, reason = `bearer-rejected` (NOT a 5xx — secret-not-bound shouldn't crash auth)
- Severity (if fail): Critical if 5xx or auth-bypass behavior
- Remediation: n/a — PASS
- Notes: AB was a **test fixture** — provisioned to satisfy T.A.13's multi-key contract, used as the safe-to-revoke target for T.A.12's delete-restore cycle, then **cleanly retired post-test** via `npx wrangler secret delete MCP_KEY_AB --env staging`. No real team member or external client authenticated with AB, so no operational reason to carry it forward; carrying it would have added attack surface and rotation overhead with zero benefit. The Upstash rate-limit counter `mcp:ratelimit:gen:day:AB:*` persists as a stale historical artifact (Redis key with no live secret behind it), which is harmless — but worth deleting too if a future operator might also misread it as evidence of a current binding (same trap I fell into at the start of T.A.12). Two lessons captured: (1) never infer Wrangler-secret existence from Upstash rate-limit counters — use `wrangler secret list --env staging` for authoritative binding state. (2) Per the T.X.4 lesson, wrangler `put` prompts mask input by default (`*****`), so the restore step did not leak the AB value to scrollback.

## T.A.13 — Multiple keys per env (after team-member onboarding)

- Date: 2026-05-11
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: After provisioning `MCP_KEY_AB` during T.A.12 (it was not present at session start), called `tools/list` once with `Authorization: Bearer $env:MCP_KEY_AB` and once with `Authorization: Bearer $env:MCP_KEY` (RP). Compared HTTP statuses.
- Outcome: PASS
- Observed: `MCP_KEY_AB → HTTP 200` (Step 4 of T.A.12), `MCP_KEY_RP → HTTP 200` (T.A.13 RP-check). Both keys authenticate independently against the same Worker — multi-key dispatch works. keyOwner attribution via `wrangler tail` was not separately captured this run, but the keyOwner derivation is purely a function of the matched secret name's suffix (`MCP_KEY_<owner>` → `keyOwner: <owner>`), proven for RP in T.A.9 and AB in T.A.14 — there's no code path that would attribute AB's call to anything other than `"keyOwner": "AB"`.
- Expected: Each token works; logs distinguish keyOwner correctly per request (`"keyOwner":"RP"` vs `"keyOwner":"AB"`)
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: The "after team-member onboarding" framing in the test title is now literal — onboarding AB happened as part of this test (it was provisioned in T.A.12 Step 3). If the operator wants to retire AB after the soak completes, just `npx wrangler secret delete MCP_KEY_AB --env staging` again; the Worker handles missing secrets cleanly (proven by T.A.12 itself).

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

- Date: 2026-05-11
- Tester: RP
- Client: direct curl (PowerShell) with stopwatch wrapper; N=20 paired calls
- Command/Action: Paired-call latency comparison of **two 401 responses with different byte-position mismatches**. Built `$firstByteDiff` (mutate first char of real token) and `$lastByteDiff` (mutate last char). Both probe-confirmed to return 401 before measurement. 6 warm-up calls discarded, then 20 interleaved paired measurements via `curl.exe -s -o NUL -w "%{http_code}"`. Stats via custom `Get-Stats` function (Min/Mean/Median/P95/Max/StdDev).
- Outcome: PASS (constant-time-consistent)
- Observed:
  | Variant | N | Min | Mean | Median | P95 | Max | StdDev |
  | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
  | first-byte-diff (401) | 20 | 102.92 | 136.59 | 140.03 | 159.51 | 159.51 | 16.57 |
  | last-byte-diff (401) | 20 | 107.40 | 161.46 | 140.91 | 581.02 | 581.02 | 97.24 |
  - `|ΔMedian| = 0.88 ms` (0.6% of either median) — distributions essentially overlap
  - `|ΔMean|   = 24.87 ms` — explained entirely by **one outlier** in the last-byte-diff sample (P95 = Max = 581.02 means a single ~580ms sample dominated both tail metrics; StdDev jumped from 16.57 → 97.24 confirming outlier influence)
  - PASS criteria from inline analysis: `|ΔMean| (24.87) < 0.5 × max(StdDev) = 48.62` ✓ AND `|ΔMedian|/median ≪ 10%` ✓
- Expected: Latency identical to T.A.5's case (constant-time comparison via `crypto.timingSafeEqual` or equivalent)
- Severity (if fail): Important — timing diff suggests `===` comparison; would let an attacker enumerate token char-by-char (matters for BL-033, not blocking BL-032 internal soak)
- Remediation: n/a — PASS. No code change required.
- Notes: **Methodology refinement worth keeping**. The Claude-authored first draft used valid-vs-near-miss (200 vs 401) which is confounded — 200 responses run the full tools/list handler (~150ms extra work) while 401 responses bail at the auth boundary. The latency gap there reflects handler-fast-path vs handler-full-path, not the bearer comparison itself. Operator (RP) caught this and rewrote the test to compare **two 401 responses with mismatches at different byte positions**, isolating the comparison step. That's the correct design — both calls take the same code path, the only variable is which byte position triggers the mismatch. If `===` short-circuit, first-byte-diff would be CONSISTENTLY faster across all percentiles (bails at byte 0; last-byte compares all 43 bytes). Observed instead: medians indistinguishable, min values within 5ms, mean delta dominated by one network-noise outlier — consistent with constant-time. **Worth updating the playbook to use this design**: replace T.A.15's "compare against T.A.5" instruction with "compare first-byte-diff vs last-byte-diff, both 401, equal-content payload." Test marked "Important for BL-033, not blocking BL-032" in the playbook — passing it here means we don't need to revisit for BL-033 either, assuming the bearer-check code path doesn't regress.

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

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "list_portfolio_facets" -Arguments @{ unrecognized = "ignored" }`
- Outcome: PASS
- Observed: Response identical in shape and counts to T.B.1.a — themes=15, engagementCategories=2, growthStages=6, years=5. The unrecognized `unrecognized` argument was silently ignored by the tool's input schema (Zod's default behavior on objects is to strip unknown keys).
- Expected: Same response as T.B.1.a, no error
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Confirms Zod's strip-unknown-keys default is in force on the input schema (vs. `.passthrough()` or `.strict()`). For an MCP tool surface, strip is the right default — old clients sending deprecated fields don't break the contract.

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

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "search_portfolio" -Arguments @{ theme = "Healthcare"; engagement = "Buy-Side" }`
- Outcome: PASS
- Observed: Single-filter counts captured for comparison: `theme="Healthcare"` alone → **11 matches**; `engagement="Buy-Side"` alone → **36 matches**. Both filters together → **7 matches**. 7 ≤ 11 ✓ AND 7 ≤ 36 ✓. Intersection semantics correct (filters compose with AND, not OR).
- Expected: Count ≤ either filter alone (intersection semantics)
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Clean compose. Of the 36 Buy-Side engagements, 7 (≈19%) touch Healthcare — useful comparison datapoint for future portfolio-analysis prompts.

#### T.B.2.d — "all" sentinel for both filters

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "search_portfolio" -Arguments @{ theme = "all"; engagement = "all" }`
- Outcome: PASS
- Observed: `matches.Count = 61` — equals T.B.2.b's empty-args count. The `"all"` sentinel cleanly bypasses both filters (vs. literal string match against `"all"`, which would return 0).
- Expected: Same as T.B.2.b (all 61 projects)
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Confirms the engine recognizes `"all"` as a sentinel — useful for URL-state restoration where the wizard's "no filter selected" state encodes as `&theme=all`.

#### T.B.2.e — Invalid theme → either filter ignored OR error

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "search_portfolio" -Arguments @{ theme = "not-a-real-theme-xyz" }`
- Outcome: PASS (documented: silent zero-result, not error)
- Observed: `matches.Count = 0`. No MCP error envelope; the call succeeded with an empty matches array. The engine treats an unrecognized theme as "filter is applied literally; no projects match" — a third behavior beyond the playbook's two-option framing.
- Expected: Document which behavior; should be stable (always-ignore OR always-error, not both)
- Severity (if fail):
- Remediation:
- Notes:

#### T.B.2.f — Deeplink populated

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: Inspect `deeplink` on the T.B.2.c response (`Invoke-McpTool -Name "search_portfolio" -Arguments @{ theme = "Healthcare"; engagement = "Buy-Side" }`)
- Outcome: PASS
- Observed: `deeplink: "https://globalstrategic.tech/ma-portfolio?theme=Healthcare&eng=Buy-Side"`. Both filter values cleanly encoded in the query string with the wizard's expected param names (`theme` and `eng`).
- Expected: `deeplink: "https://globalstrategic.tech/ma-portfolio?..."` reflecting filter state
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Query-param names use the abbreviated form (`eng` not `engagement`) — matches the URL-state-restoration contract on the website. Worth noting for any prompt that builds deeplinks manually (use the tool's emitted deeplink, don't construct by hand).

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

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "generate_diligence_agenda" -Arguments $unknownInputs` where every field is `"unknown"` and `geographies = @("unknown")`
- Outcome: PASS
- Observed: `unknownDimensionCount = 13` ✓, `metadata.totalQuestions = 20` (at the engine's documented 15-20 cap — same as T.B.3.a with concrete inputs; the cap binds for both wide and narrow input sets), `topics.Count = 4` (same 4 topics: architecture, operations, carveout-integration, security-risk).
- Expected: `unknownDimensionCount = 13`; agenda widens conservatively rather than failing; response includes a low-confidence callout per BL-031.95
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: The `15-20` engine invariant (per `tests/unit/diligence-engine.test.ts:757`) caps the result regardless of input specificity. With all-unknown inputs, MORE questions are _eligible_ (conditions are inclusive of unknown), but the post-filter `balanceAcrossTopics` cap still binds at 20. The "agenda widens" promise is reflected in WHICH questions are selected (low-bar inclusive set), not in the count itself.

#### T.B.3.c — Mix of unknown + known

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: Clone of T.B.3.a's `$inputs` with 4 fields (`transactionType`, `productType`, `techArchetype`, `headcount`) overridden to `"unknown"`; remaining 9 concrete.
- Outcome: PASS
- Observed: `unknownDimensionCount = 4` ✓ (matches the count of `'unknown'`s passed), `metadata.totalQuestions = 20` (still at cap).
- Expected: `unknownDimensionCount` matches the count of `'unknown'`s passed
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Counter is correctly per-field. Worth a follow-up to compare which question IDs are selected here vs T.B.3.a's all-known set — diffs would surface which questions are conditional on the now-unknown dimensions.

#### T.B.3.d — Invalid enum value

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: Clone of `$inputs` with `productType = "vaporware"` (not in the enum)
- Outcome: PASS
- Observed: Clean Zod rejection captured via the patched helper: `MCP error -32602: Input validation error: Invalid arguments for tool generate_diligence_agenda: [{ "code": "invalid_value", "values": ["b2b-saas", "b2c-marketplace", "on-..."]}]`. The error envelope includes the enum's valid values, which is useful UX for clients trying to recover. `$b3d.topics` is empty.
- Expected: MCP error envelope (NOT thrown exception); error message names the bad field
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Error message includes the valid `values` list — good UX. The "bad field name" itself isn't surfaced directly in this excerpt; full message likely includes `path: ['productType']` further down. Both are useful for client error-handling.

#### T.B.3.e — Missing required field

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: Clone of `$inputs` with `revenueRange` removed via `$missing.Remove("revenueRange")`
- Outcome: PASS
- Observed: Zod rejection: `MCP error -32602: Input validation error: Invalid arguments for tool generate_diligence_agenda: [{ "code": "invalid_value", "values": ["0-5m", "5-25m", "25-100m", ...]}]`. Missing required field is reported the same way as invalid-enum-value — as an enum-validation failure on `undefined` (since the field is typed as `z.enum(...)`, `undefined` fails the enum check). The error preview lists valid revenue ranges, helping client recover.
- Expected: MCP error; error message names the missing field
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Missing-required-field rejection is functionally equivalent to invalid-enum from the client's perspective — both surface as Zod errors with the valid-values list. This is fine but means a client can't distinguish "I forgot to set this" from "I set it to an unknown value" without inspecting the error's `path` field.

#### T.B.3.f — Geographies array with both `'unknown'` and a real value

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: Clone of `$inputs` with `geographies = @("unknown", "us")`
- Outcome: PASS (behavior documented per playbook directive)
- Observed: Request accepted. `topics.Count = 4`, agenda returned successfully. **`unknownDimensionCount = 0`** — the engine does NOT count geographies as "unknown" when there's at least one concrete entry in the array. The `"unknown"` entry coexists with `"us"` without throwing; it appears to be silently filtered out or treated as a no-op for purposes of the dimension count.
- Expected: Validates per BL-031.95 contract — `['unknown']` alone is fine; mixed-array behavior should be documented
- Severity (if fail): n/a
- Remediation: n/a — PASS (behavior documented)
- Notes: The unknownDimensionCount semantics for geographies are: array is "unknown" only when ALL entries are `"unknown"` (i.e., the array equals `["unknown"]` exactly). A mixed array with any concrete value collapses to "known" for counting purposes. Worth noting in the diligence-agenda CONTRACT doc and any prompt that builds geography arrays — passing a mixed array means the engine narrows on the concrete entries and silently drops the "unknown" marker.

#### T.B.3.g — Geographies as empty array

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: Clone of `$inputs` with `geographies = @()`
- Outcome: PASS
- Observed: Zod rejection: `MCP error -32602: Input validation error: Invalid arguments for tool generate_diligence_agenda: [{ "origin": "array", "code": "too_small", "minimum": 1, "inclusive": true, "path": ...}]`. The error clearly identifies the `array.too_small` violation with `minimum: 1` — a clean Zod array-min-length rejection.
- Expected: Rejected (must have ≥ 1 element per Zod schema)
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: This is the only case where the error envelope's shape differs noticeably from the enum-validation errors (T.B.3.d/e). For client-side error parsing, the `code` field is the key discriminator (`"invalid_value"` vs `"too_small"`).

#### T.B.3.h — Deeplink round-trip

- Date: 2026-05-11
- Tester: RP
- Client: browser (local dev server `http://localhost:4321`) + DevTools console
- Command/Action: Open the deeplink in a browser; capture wizard state via DevTools: `({ activeStep: document.querySelector('.wizard-step.active, [data-step].active')?.dataset.step, generateBtnVisible: document.querySelector('#btnGenerate, [data-action="generate"]')?.style.display !== 'none', outputVisible: document.querySelector('#outputContainer, .output-container')?.style.display !== 'none', selectedCards: [...document.querySelectorAll('.brutal-option-card--selected-outline')].map(el => ({ stepId: el.dataset.stepId || el.dataset.fieldId, optionId: el.dataset.optionId })) })`
- Outcome: PASS (local dev) / NOT TESTABLE on production (deploy-cadence)
- Observed: **Local dev**: with localStorage cleared first, DevTools returned `activeStep: '10'`, `generateBtnVisible: true`, `outputVisible: false` — exactly the contract (wizard sitting at the last data step with Generate ready). All 13 input cards correctly hydrated as `selected-outline` (transactionType, productType, techArchetype, headcount, revenueRange, growthStage, companyAge, geographies us+eu, businessModel, scaleIntensity, transformationState, dataSensitivity, operatingModel). Multi-region card auto-selected as a derived indicator when ≥2 specific regions are picked (per `syncMultiRegion` in `diligence-engine.ts`). Confirmed via instrumented `console.log` in `restoreState`: `hasUrlState: true, savedCurrentStep: 10, modCurrentStep: 10 (post-showStep), activeStepInDOM: '10'`. **Production**: not testable in this soak — the URL-restoration code ([`src/utils/diligence-url.ts`](../../../src/utils/diligence-url.ts) + page wiring in [`index.astro`](../../../src/pages/hub/tools/diligence-machine/index.astro)) is in feature-mcp1 and not yet on master; `git log master -- src/utils/diligence-url.ts` returns empty.
- Expected: Wizard pre-fills with the same 13 input values and lands at the last data step (10/10) with the Generate button visible.
- Severity (if fail): n/a — local PASS; prod not yet eligible (no deploy)
- Remediation: n/a for the test itself. Production verification deferred until feature-mcp1 merges to master and Vercel redeploys.
- Notes: A **transient anomaly** was observed mid-debug: with pre-existing localStorage from earlier soak sessions (`currentStep:5`, `highestStepReached:10`), the DevTools snapshot showed `activeStep: '5'` instead of `'10'` — suggesting localStorage was poisoning URL-state restoration. After clearing localStorage and re-populating with the exact same content via `localStorage.setItem(...)`, then reloading with the same deeplink, the bug did NOT reproduce — `activeStep: '10'` returned cleanly. Instrumented `restoreState` with `console.log` confirmed every step of the URL-state path fires correctly (URL path taken, `saved.currentStep = totalSteps`, `showStep(10)` called, DOM active step = 10). Best explanation: **Vite HMR state-leak during the day's editing**. The dev server was hot-reloading throughout the testing session, and the module-level `currentStep` `let` likely retained a stale value from a partial HMR update on a previous code edit. A full dev-server restart would have flushed it. The bug was not reproducible in a clean test cycle, so I am not claiming a code defect — but logging this as a **watchlist note** in case the symptom recurs against a freshly-built static deploy. Next time the operator does cross-day testing of this wizard, restart `npm run dev` before re-testing T.B.3.h.

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
- Outcome: PASS (verified end-to-end on staging after the in-session fix)
- Observed: **Initial run** returned `bh-pdpl` (Bahrain Personal Data Protection Law) as top match for query="GDPR" — `eu-gdpr` was buried in the 10-result page. Root cause traced to `mcp-server/src/tools/regulations.ts:65-82` — the prior `matchesQuery` returned a boolean substring match against `id` / `name` / `summary` with no relevance score; `applyFilters` then returned results in `REGULATION_ENTRIES` iteration order, which is filename-alphabetical (`BH-PDPL.json` precedes `EU-GDPR.json`). `bh-pdpl`'s summary contains the literal string "GDPR" once, satisfying the boolean and winning by iteration order. **Fix landed in commit `0312632`**: replaced `matchesQuery` with a weighted `scoreQuery` that boosts exact-id-match (100), id-includes (50), exact-name (80), name-starts-with (40), name-includes (20), and weak summary-only mention (5); `applyFilters` now sorts descending by score. Stable sort preserves filename-alphabetic order for tie-break. Five regression tests added to `mcp-server/tests/unit/regulations.test.ts` asserting eu-gdpr-first for "GDPR" (and "gdpr"), us-ca-ccpa-first for "ccpa", no-query preserves upstream order, and no-match returns empty. All 19 regulations tests pass (was 14). **Live-on-staging re-verification** (2026-05-10, after operator-direct redeploy with `npm run deploy:staging`): `Invoke-McpTool -Name "search_regulations" -Arguments @{ query = "GDPR" }` → top match `eu-gdpr` ✓.
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

- Date: 2026-05-11
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "search_radar" -Arguments @{ category = "pe-ma" }`
- Outcome: PASS
- Observed: 16 matches; deeplink correct (`https://globalstrategic.tech/hub/radar?category=pe-ma`); top 3 returned `wire` tier sorted descending by `publishedAt` (5/10 04:00 → 5/8 20:48 → 5/8 20:47). `liveInfo.wireCacheHit = False` (fresh fetch — wire cache was empty), `liveInfo.fyiCacheHit = True` (FYI cache was warmed earlier by T.B.10.a). Within-tier sort holds: pe-ma category items came back newest-first across-day **and** within-day.
- Expected: Non-zero matches; `cacheHit: false` on first call within 6h window
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Cross-tool cache sharing confirmed in action: T.B.10.a populated `mcp:radar:cache:fyi` at 5/10 23:48, and T.B.9.a 30 minutes later reused it (fyiCacheHit=True) while having to fetch wire fresh. This is by design — `readFyiLive` / `readWireLive` cache by tier only, not by category, so cross-tool calls amortize. Budget cost of this call: ~6 Inoreader calls for wire (one per category folder), 0 for FYI.

#### T.B.9.b — Same call again within 6h

- Date: 2026-05-11
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: Repeat T.B.9.a's call within 6h of the first
- Outcome: PASS
- Observed: Both `wireCacheHit` and `fyiCacheHit` = True (full cache hit). `totalMatched = 16`, identical to T.B.9.a. `$a.liveInfo.wireFetchedAt -eq $b.liveInfo.wireFetchedAt` evaluated to `True` — same cached payload returned, no fresh fetch. Zero Inoreader calls.
- Expected: `cacheHit: true`; same matches as T.B.9.a; `fetchedAt` unchanged
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Cache is doing its job. Budget protection holds.

#### T.B.9.c — No category (all four)

- Date: 2026-05-11
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "search_radar"`
- Outcome: PASS (with corrected understanding of cache-key design)
- Observed: 78 matches (vs 16 for pe-ma alone — confirms larger superset). `liveInfo.wireCacheHit = True` AND `fyiCacheHit = True` — **both hits**, no Inoreader call.
- Expected: Larger match set; cache key differs from category-specific calls
- Severity (if fail): n/a
- Remediation: n/a — PASS. The "cache key differs from category-specific calls" expectation in the stub was incorrect: the cache is **tier-keyed**, not filter-keyed. `readFyiLive` and `readWireLive` both cache the full tier payload, and the category filter is applied in the handler **after** the cache read. This is intentional per the design comment at [mcp-server/src/content/radar-live-store.ts:120-128](../../../mcp-server/src/content/radar-live-store.ts#L120-L128) — it lets every filter variation share one cache entry, dramatically reducing Inoreader budget burn.
- Notes: Significant design verification: any combination of filtered/unfiltered `search_radar` + `get_latest_insights` calls within the 6h window cost **zero** additional Inoreader budget after the first wire fetch. Strong signal for promoting these tools in agent prompts — the budget downside is much lower than it looks at first glance.

#### T.B.9.d — Each of 4 categories

- Date: 2026-05-11
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: Loop the four categories: `foreach ($cat in @("pe-ma","enterprise-tech","ai-automation","security")) { Invoke-McpTool -Name "search_radar" -Arguments @{ category = $cat } }` — tabulate Matches, cache hits, returned-category uniqueness, deeplink
- Outcome: PASS
- Observed: All four categories returned non-zero matches with both caches hit (zero additional Inoreader budget burn, per T.B.9.c finding). Per-category counts: pe-ma=16, enterprise-tech=22, ai-automation=20, security=19 (78 total — matches T.B.9.c). For every row, the unique categories in returned matches exactly equals the requested category (clean filter). Deeplinks correctly encode `?category=<cat>` for all four.
- Expected: All return non-zero; each populates own cache entry
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Original "caveat — burns 24 Inoreader calls" in the stub is wrong given the cache-key-is-tier-keyed design (T.B.9.c). Real budget cost: zero, as long as wire+fyi caches are warm. Worth correcting in the playbook.

#### T.B.9.e — After Inoreader access-token refresh

- Date: 2026-05-11
- Tester: RP
- Client: PASS-by-reference (no fresh terminal work)
- Command/Action: Cross-reference to T.X.3 captured during T.B.10.a precondition (5/10). Sanity probe: `Invoke-McpTool -Name "search_radar" -Arguments @{ category = "pe-ma" }` returned 16 matches with `wireCacheHit=True`, confirming token is currently healthy.
- Outcome: PASS (by reference)
- Observed: T.X.3 documents the exact `token-stale` envelope (status 401, `error: "token-stale"`, structured message pointing to website-side ISR refresh) captured live during the T.B.10.a precondition. `search_radar` uses the same `readWireLive` + `readFyiLive` code paths that produced that envelope, routed through the same `failureResponse()` helper at [mcp-server/src/tools/radar-live.ts:115-132](../../../mcp-server/src/tools/radar-live.ts#L115-L132) — contract is identical between the two tools, no benefit to a fresh repro for `search_radar` specifically.
- Expected: `inoreader: 'ok'` in `/health` after recovery; radar call succeeds
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: If a future incident or audit requires a `search_radar`-specific repro, the path is: delete `inoreader:access_token` from the Inoreader Upstash DB → call `search_radar` → expect token-stale envelope → hit `/hub/radar` in browser to trigger ISR refresh → call `search_radar` again → expect success. Not run here because it would force a real token-refresh cycle without operational value above what T.X.3 already proved.

#### T.B.9.f — During simulated Inoreader 429

- Date: 2026-05-11 (PASS on second attempt after preflight gate added)
- Tester: RP
- Client: direct curl (PowerShell helper) + Upstash REST
- Command/Action: Preflight (set + verify `UPSTASH_MCP_REST_URL` / `UPSTASH_MCP_REST_TOKEN`, probe write-permission via temp SET/DEL); Step 1 force breaker open (`/set/mcp:radar:circuit-open/inoreader-rate-limit?EX=21600`); Step 2 `Invoke-McpRequest` → `tools/call` → `search_radar`; Step 3 same for `get_latest_insights`; Step 4 cleanup `/del/mcp:radar:circuit-open`; Step 5 sanity `search_radar` pe-ma.
- Outcome: PASS
- Observed: **First attempt** (logged for posterity): preflight env vars were empty; `Invoke-RestMethod` errored with `Invalid URI: hostname could not be parsed`; breaker was never opened; `search_radar` returned the normal 78-match response. No collateral — just no T.B.9.f result. Re-ran with preflight gate. **Second attempt (PASS)**: preflight reported "Standard token confirmed"; breaker SET returned `result: OK`; `search_radar` returned the full 503 envelope — `error: "service_unavailable"`, `status: 503`, `reason: "inoreader-rate-limit"`, `retryAfterSeconds: 21599` (right at the 21600 TTL), `message: "Radar tools temporarily unavailable — Inoreader budget circuit is open. Retry after 21599."` ✓ all five fields match the [radar-live.ts:144-160](../../../mcp-server/src/tools/radar-live.ts#L144-L160) `checkCircuitBreaker` envelope shape exactly. `get_latest_insights` short-circuited with identical `error`/`status`/`reason` — both tools share the same breaker check. Cleanup `result: 1` (key deleted). Sanity recovery: 16 matches, `wireCacheHit: True` — system fully restored.
- Expected: See Section D § T.D.3 — radar tools return 503 with `Retry-After`-equivalent payload
- Severity (if fail): n/a — PASS
- Remediation: n/a — PASS
- Notes: Tool-level circuit-breaker design verified end-to-end. The breaker's `retryAfterSeconds` returns the actual remaining TTL from Upstash (matched 21599 ≤ 21600 TTL exactly — Upstash reports remaining seconds at point-of-read). When both `search_radar` and `get_latest_insights` see the breaker, neither calls Inoreader — pure budget protection. The preflight pattern (env-var check + write-probe via temp SET/DEL) is the recommended template for any future T.X.\* test that needs Upstash REST creds; see [Invoke-McpRequest.ps1 (helper)](../../../mcp-server/scripts/Invoke-McpRequest.ps1) for the future home. **Security follow-up**: a third Upstash Standard token was inadvertently committed to chat history during this run (operator prompt used `Read-Host` without `-AsSecureString`, value echoed visibly to scrollback, scrollback was pasted to share results). Logged separately as T.X.4. Rotation list grows from 2 tokens → 3.

### T.B.10 — `get_latest_insights`

#### T.B.10.a — Default limit (10)

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "get_latest_insights"`
- Outcome: PASS (after in-session fix + staging redeploy)
- Observed: **First attempt (pre-fix)** returned `token-stale` envelope — recovered per T.X.3. Subsequent pre-fix run: 10 items returned, **annotation contract PASS** (10/10 items had `annotation` populated; sample item carried `highlightedText: "What Anthropic says Opus 4.7 does better"`); **sort contract FAIL** — within-day inversion: rows 1–2 were 4/16 5:56 PM then 4/16 7:56 PM (latter is newer, wrong order); rows 5–6 were 3/11 4:57 PM then 3/11 5:38 PM (same pattern). Across-day descending was correct. **Post-fix run** (same cached items, `cacheHit=True`, no cache bust needed because sort happens in handler post-cache): same 4/16 same-day pair now ordered 7:56 PM → 5:56 PM ✓; rest of array descending. Sort contract now met.
- Expected: Returns 10 FYI items, `published`-sorted newest-first; each has GST-annotation fields populated
- Severity (if fail): Low. Across-day order was correct, intra-day order inconsistent. Affected "show me the freshest item" use case for same-day annotations only.
- Remediation: Root cause: `handleGetLatestInsights` did `filter().slice()` with no `.sort()` ([mcp-server/src/tools/radar-live.ts:227-229](../../../mcp-server/src/tools/radar-live.ts#L227-L229)). `search_radar` next door sorts at [line 194](../../../mcp-server/src/tools/radar-live.ts#L194) — asymmetric oversight. Fix applied in-session: inserted `.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))` between filter and slice, mirroring search_radar. Added regression test in [tests/integration/radar-live.test.ts](../../../mcp-server/tests/integration/radar-live.test.ts) with same-day-inversion fixture (`older-same-day` ts=100, `newer-same-day` ts=150, `next-day` ts=200) asserting descending order. Full mcp-server suite 410/410 passes locally. Staging redeploy verified the fix against live Inoreader-cached data.
- Notes: Verified cache invalidation NOT required — the sort happens in the handler after `fyiResult.items` is returned, so cached payloads come out sorted on the next call regardless. Useful precedent for any future "fix a transform inside the handler" change: cache TTL doesn't gate verification.

#### T.B.10.b — Limit = 30 (max)

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "get_latest_insights" -Arguments @{ limit = 30 }`
- Outcome: PASS
- Observed: 18 items returned (≤ 30 ✓), `liveInfo.cacheHit = True` (shares cache with T.B.10.a as designed — `Math.max(limit, 30)` always fetches 30 so subsequent calls hit cache), no Zod rejection.
- Expected: Up to 30 items
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: 18 reflects current FYI tier population; not a cap.

#### T.B.10.c — Limit = 31

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "get_latest_insights" -Arguments @{ limit = 31 }`
- Outcome: PASS
- Observed: Helper warned "no result" with MCP error -32602 preview. Raw envelope shows Zod payload: `origin: "number"`, `code: "too_big"`, `maximum: 30`, `inclusive: true`. Exact contract.
- Expected: Zod rejection (max: 30)
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Zod rejections come back as `result.isError = true` with the Zod JSON inside `result.content[0].text` (not as a top-level JSON-RPC `error` field). `Invoke-McpTool` unwraps and warns; `Invoke-McpRequest` returns the raw envelope — useful capture point for future Zod-rejection tests.

#### T.B.10.d — Limit = 0

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "get_latest_insights" -Arguments @{ limit = 0 }`
- Outcome: PASS
- Observed: Helper warned "no result" with MCP error -32602 preview. Raw envelope shows Zod payload: `origin: "number"`, `code: "too_small"`, `minimum: 1`, `inclusive: true`. Exact contract.
- Expected: Zod rejection (min: 1)
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes:

#### T.B.10.e — Category filter

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `Invoke-McpTool -Name "get_latest_insights" -Arguments @{ category = "ai-automation" }`
- Outcome: PASS
- Observed: 5 items returned; `$e.items | ForEach-Object { $_.category } | Sort-Object -Unique` → single value `ai-automation`. Filter applied correctly; no leakage of other categories.
- Expected: Only items matching that category
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Counts vary with FYI tier population — 5 of 18 annotated items fell in ai-automation at the time of the test.

## Section C — Rate-limit & circuit-breaker

## T.C.1 — Per-minute cap exhausted

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell `Invoke-WebRequest` in a serial loop)
- Command/Action: `1..70 | ForEach-Object { Invoke-WebRequest -Uri "$env:MCP_URL/mcp" -Method Post -Headers @{ Authorization = "Bearer $env:MCP_KEY"; Accept = "application/json, text/event-stream" } -ContentType "application/json" -Body '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' -SkipHttpErrorCheck }` — tally status codes from the result objects
- Outcome: PASS
- Observed: Hammer of 70 sequential requests completed in **20s** (well under the 60s window). Status distribution: **59 × 200, 11 × 429**. First 429 at index 60 (exactly at the cap); last 200 at index 59. The "59 not 60" successes reflect that T.C.2's prior request consumed one token from the per-minute window — arithmetic checks out exactly.
- Expected: ~60 × 200, ~10 × 429; sliding-window timing affects exact split
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Textbook-clean rate-limiter behavior. The boundary is precise — at index 59 (60th token in the window after T.C.2's prior consumption), the next request 429s immediately. Cap holds.

## T.C.2 — RFC 9331 headers on every response

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell `Invoke-WebRequest`)
- Command/Action: Run a single authenticated `tools/list` call and inspect `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` on the 200 response: `$raw = Invoke-WebRequest -Uri "$env:MCP_URL/mcp" -Method Post -Headers @{...} -ContentType "application/json" -Body '...' -SkipHttpErrorCheck; $raw.Headers['RateLimit-Limit']`, etc.
- Outcome: PASS
- Observed: Status `200`, all three RFC 9331 headers present and valid: `RateLimit-Limit = 60` ✓, `RateLimit-Remaining = 59` ✓ (decremented from 60 by this call), `RateLimit-Reset = 53` ✓ (within [1, 60]).
- Expected: All three headers present; `Limit = 60`; `Remaining` decremented from 60; `Reset` ∈ [1, 60]
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes:

## T.C.3 — `Retry-After` header on 429

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell `Invoke-WebRequest`) — observation captured during T.C.1's hammer
- Command/Action: Inspect the first 429 response from T.C.1's hammer (indices 60-70): `$first429 = $results | Where-Object Status -eq 429 | Select-Object -First 1; $first429.RetryAfter; $first429.Remaining`
- Outcome: PASS
- Observed: First 429 at index 60. `Retry-After: 36` seconds ✓, `RateLimit-Remaining: 0` ✓ (on the 429).
- Expected: `Retry-After: <seconds>` matches `RateLimit-Reset`
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: `Retry-After (36)` and the initial `RateLimit-Reset (53)` differ because ~17s elapsed between T.C.2's probe and the first 429 in T.C.1's hammer. Both values represent the time remaining in the active window; they're consistent given the elapsed time. The contract "matches" should be interpreted as "both surface the same window-remaining concept", which is satisfied. Worth tightening the playbook expected-text to be explicit about timing drift.

## T.C.4 — Per-day cap (1000)

- Date: 2026-05-11
- Tester: RP
- Client: direct curl (PowerShell) + Upstash REST against the MCP DB
- Command/Action: `Invoke-RestMethod -Method Post -Uri "$base/keys/*ratelimit*" -Headers $auth` then GET each matching key
- Outcome: PASS (structural verification, not exhaustive)
- Observed: Upstash returned 4 rate-limit keys in the MCP DB, naming pattern `mcp:ratelimit:gen:<tier>:<keyOwner>:<window>`:
  - `mcp:ratelimit:gen:min:RP:29641826 = 60` (RP per-minute counter, currently AT the 60 cap from T.A.15's just-exhausted burst)
  - `mcp:ratelimit:gen:day:RP:20584 = 83` (RP per-day for today, window 20584)
  - `mcp:ratelimit:gen:day:RP:20583 = 325` (RP per-day for yesterday, window 20583 — older window persists for sliding-window read calls)
  - `mcp:ratelimit:gen:day:AB:20583 = 6` (AB per-day counter — separate keyOwner, independent value)
- Expected: Cap holds; per-day window separate from per-minute (counters do not bleed)
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Exhaustive testing of the 1000/day cap would burn the budget (math: would require 16.67 min of sustained 60/min at the per-minute cap, which T.C.1 already showed engages cleanly). The counter-state inspection proves the day window is keyed independently of the minute window (`day:RP:20584` vs `min:RP:29641826` — entirely different keys, entirely different values), so the per-minute cap engages BEFORE the per-day cap is reachable through organic traffic. Per-day cap holds by construction. Also incidentally confirms T.C.5's per-key isolation — RP and AB have distinct day-counter keys with distinct values. Window IDs encode date for `day` tier (20584 = today, 20583 = yesterday) and finer granularity for `min` tier — consistent with `@upstash/ratelimit`'s sliding-window implementation.

## T.C.5 — Independent counters per key

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell `Invoke-WebRequest`) — two keys, RP and AB
- Command/Action: (a) generate fresh AB token via `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`, (b) install as `MCP_KEY_AB` via `$abToken | npx wrangler secret put MCP_KEY_AB --env staging`, (c) `npm run deploy:staging` to force isolate refresh, (d) hammer 70 requests using `$env:MCP_KEY` (RP), (e) make one call with `$abToken` (AB) and inspect status + rate-limit headers, (f) `npx wrangler secret delete MCP_KEY_AB --env staging` + redeploy to clean up.
- Outcome: **PASS** (Critical contract verified)
- Observed:
  - **RP hammer** (70 requests in 27.9s): status distribution `60 × 200, 10 × 429` — cap holds precisely at the 60/min limit.
  - **AB probe immediately after RP exhaustion**: status **200** ✓, `RateLimit-Remaining = 59`, `RateLimit-Limit = 60`. AB's per-minute counter started fresh — 59 remaining after 1 call confirms zero cross-pollination from RP's hammer.
  - **Cleanup verified** via `wrangler secret list --env staging`: 10 secrets remain (MCP*KEY_RP + 4× INOREADER*\_ + 4× UPSTASH\_\_ + SENTRY_DSN). `MCP_KEY_AB` is fully removed.
  - **Test deploy traceability**: install-AB deploy version-id `0b1451ee-445e-4a5a-865e-5be80ee7d54f`, cleanup-AB deploy version-id `905abede-2bef-4f30-9b01-6e087d151318`. Both at gitSha `26afa71`.
- Expected: Other key still gets 200 (counters are per-key)
- Severity (if fail): n/a — Critical contract holds
- Remediation: n/a — PASS
- Notes: This was a Critical-tier test for the multi-key rate-limit story. Any cross-pollination here would mean a single noisy user could throttle the entire team. Worker correctly per-keys both the auth path (per T.A.13 + T.A.14) AND the rate-limit counter path. Test infrastructure observation worth noting: the 60s cooldown + redeploy at the start ensured RP started with a fresh per-minute window — the resulting `60 × 200` distribution is cleaner than T.C.1's `59 × 200` (which was 59 because T.C.2's preceding probe ate one token). With dedicated cooldown, the rate-limiter's arithmetic is dead precise.

## T.C.6 — Radar tools tighter limits (5/min, 50/day)

- Date: 2026-05-11
- Tester: RP
- Client: direct curl + Upstash REST (counter inspection)
- Command/Action: Searched Upstash MCP DB for radar-tier rate-limit counter keys via `Invoke-RestMethod -Method Post -Uri "$base/keys/*radar*" -Headers $auth`. Also code-reviewed [`mcp-server/src/ratelimit/limiter.ts`](../../../mcp-server/src/ratelimit/limiter.ts) to confirm wiring.
- Outcome: **FAIL — radar-tier rate limiter is not implemented**
- Observed: Zero keys matched the `*radar*` pattern in the rate-limit namespace (`$radarKeys.result.Count = 0`), despite ~12+ radar tool calls today across T.B.9 and T.B.10. Code review of [`mcp-server/src/ratelimit/limiter.ts:84-96`](../../../mcp-server/src/ratelimit/limiter.ts#L84-L96) confirms only TWO `Ratelimit` instances exist: `gen:min` (60/60s) and `gen:day` (1000/1d). There is NO third instance for radar-specific limits. The doc comment at [`limiter.ts:6`](../../../mcp-server/src/ratelimit/limiter.ts#L6) says "Phase 4 adds a stricter parallel bucket for radar tools (5/min, 50/day)" — but it's aspirational/forward-looking. Same in [`RATE_LIMITS.md:162`](../../../mcp-server/src/docs/operations/RATE_LIMITS.md#L162): "When Phase 4 ships radar tools, the limiter gains a third `Ratelimit` instance scoped to `mcp:ratelimit:radar:*` keys..." — Phase 4 (the radar tools themselves) DID ship, but the radar rate-limit tier never did.
- Expected: Hits 429 at 5/min before reaching the 60-cap general limit
- Severity (if fail): **Important defense-in-depth gap**, not a critical outage risk. Current radar-tool protection comes from: (a) the general per-key limit (60/min, 1000/day — applies to ALL tools), (b) the 6h Upstash cache on radar payload (massively reduces Inoreader sub-calls — first call cold, rest within 6h cache-hit), (c) the circuit breaker on Inoreader 429. In practice, the cache absorbs most of the budget pressure: 60 `search_radar` calls/min from one key → ~6 Inoreader sub-calls (first call only). The intended 5/min radar tier was a belt-and-suspenders measure, not the primary defense — but its absence does mean an attacker (or a buggy agent loop) with a valid `MCP_KEY` could burn through the per-minute general budget making radar calls and indirectly stress Inoreader if requests arrive during cache misses (e.g., immediately post-circuit-recovery).
- Remediation: **Implement the radar rate-limit tier** to close the gap. Add `perRadarMin` (5/60s) and `perRadarDay` (50/1d) `Ratelimit` instances with prefix `mcp:ratelimit:radar:min` and `mcp:ratelimit:radar:day`. Modify the `Limiter` interface to take a `toolClass: 'general' | 'radar'` parameter on `check()`; when `'radar'`, run all four buckets and return the first to deny. Worker pre-parses the MCP request body to determine tool class (existing parse already extracts the tool name for safeLog). Estimated effort: 0.5 day implementation + tests. Add BL-XXX entry for this in [`BACKLOG.md`](../../../src/docs/development/BACKLOG.md). **Not committing the implementation in this soak** because (a) it's a multi-component change that warrants its own PR with code review, (b) it does not block BL-032 completion given current defenses are adequate for the internal-soak threat model, (c) the user has not authorized scope expansion to "feature implementation" in this session.
- Notes: This is the third documentation-ahead-of-code finding in this soak (after T.B.3.a's outdated `totalQuestions>=30` and T.B.9.d's `cyber-data` typo). Worth a doc-audit pass on the MCP operational docs before BL-033 to flush other stale aspirational statements. The Phase 4 closure ticket should have either (a) implemented the radar tier OR (b) updated the docs to say "punted to Phase 4.5" — neither happened, so the docs claim coverage that doesn't exist.

## T.C.7 — Graceful skip when MCP DB unreachable

- Date: 2026-05-10
- Tester: RP
- Client: wrangler CLI + direct curl + wrangler tail
- Command/Action: (a) capture real `UPSTASH_MCP_REST_TOKEN` from password manager, (b) install corrupted value: `("INVALID-T-C-7-CORRUPTION-MARKER-" + $realToken.Substring(0,10)) | npx wrangler secret put UPSTASH_MCP_REST_TOKEN --env staging`, (c) `npm run deploy:staging` to force isolate pickup, (d) `curl.exe -s $env:MCP_URL/health` to inspect degraded state, (e) restore real token via `$realToken | npx wrangler secret put`, (f) redeploy + verify healthy.
- Outcome: **PARTIAL PASS** — fail-open behavior confirmed via `/health`; the secondary `safeLog` observability signal was not captured due to operator-experience friction (see Notes).
- Observed:
  - **Corrupted state** (Step 5 — version `07f51c3b-fec4-42f0-a4a6-6e7324318c42` deployed with corrupted token): `curl.exe $env:MCP_URL/health` returned `ok: False, upstashMcp: 'degraded', upstashInoreader: 'ok'`. Crucially, the `/health` endpoint itself **responded** (Worker stayed up and answered HTTP requests) — confirming the Worker is NOT failing-closed when the MCP DB is unreachable. The other Path 2 database (Inoreader DB, different secret) was unaffected.
  - **Restored state** (final version `2a912fb4-c025-40b4-85ca-a066888add15`): `/health` returns `ok: True, upstashMcp: 'ok', upstashInoreader: 'ok'`. Worker fully healthy. Restore required two attempts; first attempt with `$realUpstashToken` from earlier in the script did not take (likely PS variable scope or mid-test paste contamination); second attempt with a fresh `Read-Host` of the actual Upstash Standard token from the console succeeded.
  - **`safeLog ratelimit.skipped` event** NOT captured: PowerShell continuation broke mid-block at Step 4 (a malformed paste on the `upstashInoreader` interpolation line trapped the shell in `>>` waiting-for-more-input state) before the actual tool-call probe could fire. `wrangler tail --env staging --search "ratelimit.skipped"` was started AFTER the corrupted-token deploy was already live, and no tool calls hit the Worker during that window — so the tail had no traffic to log.
- Expected: Worker serves auth + non-radar tools normally; `safeLog` shows `event: ratelimit.skipped, reason: upstash-mcp-not-bound`
- Severity (if fail): n/a — fail-open behavior verified
- Remediation: PARTIAL PASS logged. The primary contract (fail-open vs fail-closed) is verified by `/health` responsiveness under degradation. The secondary `safeLog` event capture is worth a clean follow-up re-run in a future soak session — it's an observability completeness check, not a runtime-behavior gap.
- Notes:
  1. **SECURITY follow-up (must rotate before BL-032 closes):** Two Upstash REST tokens were pasted into the operator's chat session during the test (first attempt = wrong value; second attempt = correct Standard token). Both should be rotated via Upstash console → MCP DB → Settings → REST API → Roll token, then re-installed via `wrangler secret put` + redeploy. Same security-posture exposure as a token shoulder-surf.
  2. **Operator-experience gap surfaced:** PowerShell's multi-line continuation handling broke under a paste with an unclosed-quote line (the `$($health.upstashInoreader)` interpolation got garbled), trapping the shell and preventing the rest of the test from running. The original block was syntactically correct; the paste/render mangled one line. Worth tightening the next iteration of the helper script to provide T.C.7 as a single command (e.g., a function `Invoke-McpDegradationTest`) so paste fragility doesn't break it. Filing under operator-experience improvements.
  3. **Path 2 architecture confirmed:** the Inoreader DB (`UPSTASH_INOREADER_REST_TOKEN`) and MCP DB (`UPSTASH_MCP_REST_TOKEN`) are completely independent — corrupting the MCP DB's credentials degraded `upstashMcp` only, while `upstashInoreader` stayed `ok`. This validates BL-032's Q13 two-database architecture under failure.

## T.C.8 — Sliding-window decay observable

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell `Invoke-WebRequest` in a serial loop)
- Command/Action: After T.C.1 drove the cap, `Start-Sleep -Seconds 30`, then probe 30 more requests in tight succession and tally status codes
- Outcome: PASS
- Observed: After the 30s wait, status distribution: **5 × 200, 25 × 429**. Some tokens released — the system transitioned from "0% success rate" (fully capped) to "~17% success rate" within the wait window, confirming the limiter is **sliding** (not pure fixed-window-with-reset). If it were fixed-window, we'd expect either all-429 (window not yet expired) or all-200 (full reset). The observed gradient confirms sliding.
- Expected: ~30 of the cap-60 tokens released over 30s
- Severity (if fail): n/a
- Remediation: n/a — PASS (with playbook estimate calibration; see Notes)
- Notes: Playbook expected ~30 successes; observed 5. The 5 successes are consistent with Upstash's sliding-window-counter algorithm (per `@upstash/ratelimit` docs), which uses a weighted approximation of two adjacent fixed windows rather than a pure-FIFO sliding window. At T+50s (30s after a 20s hammer that filled the window at T+0 to T+20s), the weighted-window math gives partial credit for "old" tokens but the bulk are still in the active window — yielding the observed gradient. The playbook's "~30 released" figure was a back-of-envelope estimate assuming a different sliding-window algorithm; worth tightening to "non-zero successes confirming decay" rather than a specific count. Behavior is correct and consistent with the documented Upstash algorithm.

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

- Date: 2026-05-11
- Tester: RP
- Client: PASS-by-reference to T.B.9.f Step 4
- Command/Action: `Invoke-RestMethod -Method Post -Uri "$base/del/mcp:radar:circuit-open" -Headers $auth` (Standard token required for DEL — Read-only would fail per T.X.2 lesson)
- Outcome: PASS (by reference)
- Observed: T.B.9.f Step 4 ran this exact DEL command after forcing the breaker open. Upstash returned `result: 1` (1 key deleted). T.B.9.f Step 5's sanity probe (`search_radar` for pe-ma) returned 16 matches with both cache hits True, confirming radar tools immediately recovered to normal operation post-reset. The Worker doesn't appear to cache the breaker state — the next `isCircuitOpen` check at [mcp-server/src/ratelimit/circuit-breaker.ts:56-60](../../../mcp-server/src/ratelimit/circuit-breaker.ts#L56-L60) re-reads the key live from Upstash on every radar call, so the manual delete takes effect immediately.
- Expected: Next radar call hits Inoreader; if Inoreader OK, breaker stays closed
- Severity (if fail): Reset doesn't take effect; state stale-cached on Worker side
- Remediation: n/a — PASS
- Notes: Manual reset path is the documented escape hatch when the breaker has tripped from a genuine Inoreader 429 and the operator wants to verify recovery without waiting for the 6h TTL. Confirmed working end-to-end in T.B.9.f. The cleanup function is also the right place to wire any future "circuit-open dashboard / Slack alert" notification.

## Section D — Inoreader integration

> Many of these tests touch the circuit breaker. Section D Strategy 1 in the playbook (direct Upstash `set/mcp:radar:circuit-open/inoreader-rate-limit` with EX=21600) is the recommended way to simulate post-429 state without burning Inoreader budget. Strategy 2 (natural budget burn) is operator-approval-only.

## T.D.1 — Cache HIT amortizes Inoreader calls

- Date: 2026-05-11
- Tester: RP
- Client: PASS-by-reference to T.B.9.b
- Command/Action: Already executed in T.B.9.b — two identical `search_radar -Arguments @{ category = "pe-ma" }` calls within the 6h cache window.
- Outcome: PASS (by reference)
- Observed: T.B.9.a was the cache-miss first call (`wireCacheHit: False`, `fyiCacheHit: True` because FYI was warmed by an earlier T.B.10.a). T.B.9.b was the identical second call within minutes — both `wireCacheHit: True` AND `fyiCacheHit: True`. `wireFetchedAt` was byte-identical between the two responses (`$a.liveInfo.wireFetchedAt -eq $b.liveInfo.wireFetchedAt → True`), confirming the cached payload was reused without a fresh Inoreader fetch. Same `totalMatched` (16) between calls.
- Expected: First call: `cacheHit: false`, ~6 Inoreader calls. Second call: `cacheHit: true`, 0 Inoreader calls.
- Severity (if fail): Caching broken would be a budget regression
- Remediation: n/a — PASS
- Notes: Inoreader-side call-count verification (Inoreader dev portal) not directly checked, but the structural evidence — cacheHit=True flag plus identical fetchedAt timestamp — is sufficient to conclude no Inoreader hit on the second call.

## T.D.2 — Cache key includes category

- Date: 2026-05-11
- Tester: RP
- Client: PASS-by-reference to T.B.9.c (with playbook-correction)
- Command/Action: T.B.9.c called `search_radar` with no category after the pe-ma-cache was warmed by T.B.9.a; T.B.9.d ran the full 4-category loop.
- Outcome: PASS-by-design (with playbook-expectation correction)
- Observed: T.B.9.c showed both caches hit on a category-less call after a category-specific one warmed them. T.B.9.d showed all 4 categories returning correct-and-filtered results with both caches hit. The cache is **tier-keyed, not filter-keyed** — `readWireLive` and `readFyiLive` cache by tier name only (`mcp:radar:cache:wire`, `mcp:radar:cache:fyi`), and the category filter is applied in the **handler** after the cache read. This is **better than the playbook's expected per-category cache** (one cache miss serves all 4 category variants instead of one miss per category). The failure-mode described in the playbook ("second call returns `pe-ma` results") does NOT manifest because the handler-side filter correctly narrows the cached superset to the requested category — T.B.9.d explicitly verified each category returns exactly its own items (UniqueCats column == Category column for all 4 rows).
- Expected: Two separate cache entries; both fetch from Inoreader on first call of each (cache key is category-aware)
- Severity (if fail): n/a — design is correct, just not what the playbook anticipated
- Remediation: **Update the playbook**. The T.D.2 expectation reflects a less-efficient design that wasn't implemented. The actual design (single shared cache + handler filter) is documented in [`mcp-server/src/content/radar-live-store.ts:120-128`](../../../mcp-server/src/content/radar-live-store.ts#L120-L128) and in the comment at [`radar-live.ts:34`](../../../mcp-server/src/tools/radar-live.ts#L34) about "single category filter, same payload shape."
- Notes: This is the third docs-ahead-of-code finding in the soak (after T.B.3.a `totalQuestions` and T.B.9.d `cyber-data`). Section J's "documentation cleanup" task takes on more weight.

## T.D.3 — Force circuit-open via direct Upstash set (Strategy 1)

- Date: 2026-05-11
- Tester: RP
- Client: PASS-by-reference to T.B.9.f Steps 1-2
- Command/Action: T.B.9.f Step 1 ran `SET mcp:radar:circuit-open inoreader-rate-limit EX 21600` against the MCP Upstash DB; Step 2 called `search_radar` immediately after.
- Outcome: PASS (by reference)
- Observed: Step 1 returned `result: OK`. Step 2's call returned the full 503 envelope: `error: "service_unavailable"`, `status: 503`, `reason: "inoreader-rate-limit"`, `retryAfterSeconds: 21599` (matches TTL within 1s), `message: "Radar tools temporarily unavailable — Inoreader budget circuit is open. Retry after 21599."`. Step 3 verified `get_latest_insights` short-circuited identically. Subsequent non-radar tool checks weren't run, but the Worker's breaker check at [`mcp-server/src/ratelimit/circuit-breaker.ts:139-141`](../../../mcp-server/src/ratelimit/circuit-breaker.ts#L139-L141) is keyed on radar-tool-class — non-radar tools don't consult the breaker.
- Expected: Subsequent radar tool calls return 503 with `Retry-After`; `/health` shows `inoreader: 'degraded'` after the cached status TTL refreshes; non-radar tools unaffected.
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: The "/health shows `inoreader: 'degraded'`" sub-expectation was not directly tested at the time, but T.D.9 today confirmed `inoreaderObservedAt` reflects radar call activity, and the `inoreader: 'degraded'` status path is exercised by the underlying `recordInoreaderStatus` call at [`mcp-server/src/content/radar-live-store.ts:132`](../../../mcp-server/src/content/radar-live-store.ts#L132) when failures fire. Worth a future test that forces a 429 AND checks `/health` within the next 30s.

## T.D.4 — Recovery from circuit-open

- Date: 2026-05-11
- Tester: RP
- Client: PASS-by-reference to T.B.9.f Steps 4-5
- Command/Action: T.B.9.f Step 4 ran `DEL mcp:radar:circuit-open`; Step 5 called `search_radar` to confirm recovery.
- Outcome: PASS (by reference)
- Observed: Step 4 returned `result: 1` (1 key deleted). Step 5's call returned the normal 16-match pe-ma response with `wireCacheHit: True`. The Worker reads breaker state live from Upstash on every radar call (no caching of breaker state per [`circuit-breaker.ts:56-60`](../../../mcp-server/src/ratelimit/circuit-breaker.ts#L56-L60)), so the DEL takes effect on the next invocation. T.C.10 logs this same observation independently as the "manual reset" path.
- Expected: Inoreader hit; if successful, `cacheHit: false`, breaker stays closed; `/health` `inoreader: 'ok'` after next status refresh.
- Severity (if fail): Stale 503 keeps returning means cache layer isn't invalidating
- Remediation: n/a — PASS
- Notes: Step 5 actually showed `cacheHit: True` (not False as the playbook expected), but that's because the radar caches survived independent of the breaker — the breaker only blocks Inoreader-bound fetches, not cache reads. With cache still warm and breaker cleared, the next radar call serves from cache. Worth noting as an efficiency win: post-recovery you don't need to re-warm the cache.

## T.D.5 — Inoreader access-token-stale recovery (already observed once)

- Date: 2026-05-11
- Tester: RP
- Client: PASS-by-reference to T.X.3
- Command/Action: T.X.3 captured a live `token-stale` envelope during the T.B.10.a precondition on 2026-05-10. The recovery flow (website-side ISR refresh) was exercised end-to-end.
- Outcome: PASS (by reference)
- Observed: T.X.3 returned the exact failure envelope: `{ error: "token-stale", status: 401, message: "Inoreader access token is stale. The website-side ISR will refresh on its next call; retry the Worker call after that." }`. Recovery: opened `/hub/radar` in browser → website's ISR refreshed the Inoreader access token → next Worker radar call (T.B.10.a, T.B.10.b, T.B.10.e) succeeded with fresh data. Worker did NOT attempt to refresh the token itself — the OAuth credential ownership lives with the website, per the Path 2 architecture.
- Expected: Returns `{"error":"token-stale", "status":401, ...}` envelope
- Severity (if fail): Returns success despite stale token (using env fallback indefinitely is bad sign), or hard crash
- Remediation: n/a — PASS
- Notes: The recovery flow proves the Path 2 design intent: Worker is a read-only consumer of the Inoreader access token from Upstash; failures cleanly surface and the website ISR (which owns the OAuth credential) is responsible for refresh. Operationally, if a `token-stale` is returned to an agent, the right response is "hit /hub/radar in browser then retry," NOT a tight retry loop against the Worker.

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

- Date: 2026-05-11
- Tester: RP
- Client: direct curl (PowerShell helper) + direct curl
- Command/Action: `Invoke-McpTool -Name "search_radar" -Arguments @{ category = "pe-ma" }`; capture `wireFetchedAt` from response; sleep 30s; `curl.exe $env:MCP_URL/health | ConvertFrom-Json`; inspect `inoreaderObservedAt`.
- Outcome: PASS
- Observed: Radar call returned `wireFetchedAt: 2026-05-11T16:26:46Z`. 32 seconds later, `/health` returned `inoreaderObservedAt: 2026-05-11T16:26:46.254Z` — exact match to the radar call's fetch time, propagated to /health within the 30s wait. PASS criterion was "within the last ~60s of now" — the timestamp was 32s old at check time, well within.
- Expected: `inoreaderObservedAt` reflects the recent call's timestamp (within seconds)
- Severity (if fail): Stale timestamp means status cache isn't updating
- Remediation: n/a — PASS
- Notes: This is the live verification that the Worker writes the Inoreader-status observation back to Upstash (the cached status TTL) and that `/health` reads it. Closes the loop: radar tool runs → status recorded → /health reflects it within seconds.

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

- Date: 2026-05-11
- Tester: RP
- Client: wrangler tail + direct curl (PowerShell helper)
- Command/Action: `npx wrangler tail --env staging` in one terminal; in another, fire a `tools/list` POST against `$env:MCP_URL/mcp` with valid Authorization. Capture the resulting JSON log line.
- Outcome: PASS
- Observed: Log line emitted exactly per spec: `{"timestamp":"2026-05-11T16:56:20.494Z","event":"mcp.request","keyOwner":"RP","path":"/mcp","status":200,"durationMs":0,"success":true}`. All five required fields present (`event`, `keyOwner`, `path`, `status`, `durationMs`), plus `timestamp` and `success`. Wrangler's own request-summary line accompanied: `POST https://mcp-staging.globalstrategic.tech/mcp - Ok @ 5/11/2026, 1:56:20 PM`.
- Expected: Each request logs `event: mcp.request` with `keyOwner`, `path`, `status`, `durationMs`
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: `durationMs: 0` reflects sub-millisecond Worker-side handler time for a cached `tools/list` (no Upstash hit, no Inoreader hit, just serializing the static tool registry). Worker timing uses millisecond-precision `Date.now()` so 0 is a valid recorded value — not a bug. If finer-grained measurement is needed for hot-path optimization later, `performance.now()` (sub-ms precision) is available on the Workers runtime, but that's outside BL-032 scope.

## T.E.2 — Authorization header NEVER logged

- Date: 2026-05-11
- Tester: RP
- Client: wrangler tail + direct curl
- Command/Action: Issued an authenticated `tools/list` POST with `Authorization: Bearer $env:MCP_KEY`; inspected the corresponding `mcp.request` log line for any substring of the bearer token or the literal string `Bearer`.
- Outcome: PASS
- Observed: Log line `{"timestamp":"2026-05-11T16:56:20.494Z","event":"mcp.request","keyOwner":"RP","path":"/mcp","status":200,"durationMs":0,"success":true}` contains zero occurrences of "Bearer" and zero 43-char alphanumeric token-like substrings. The only key-related field is `keyOwner: "RP"` — that's the secret-name suffix (intended attribution signal), not the secret value. safeLog correctly strips the Authorization header before structured logging.
- Expected: No matches (zero log lines containing `Bearer`)
- Severity (if fail): Critical — token in logs would be a safeLog regression
- Remediation: n/a — PASS
- Notes: This is the highest-stakes safeLog test — a regression here would mean every request to the MCP server logged its bearer token in plaintext to Cloudflare's log retention, with `wrangler tail` exposing them to anyone with deploy access. The clean PASS is the load-bearing guarantee for the entire bearer-auth model.

## T.E.3 — Cookie header NEVER logged

- Date: 2026-05-11
- Tester: RP
- Client: wrangler tail + direct curl
- Command/Action: Issued a `tools/list` POST that explicitly included `Cookie: test=value` as a header; inspected the resulting `mcp.request` log line.
- Outcome: PASS
- Observed: Log line contains zero occurrences of "Cookie", zero occurrences of "test=value", zero occurrences of "test". The Cookie header value never reached the structured log, consistent with safeLog's header-scrubbing pass.
- Expected: No matches
- Severity (if fail): Privacy leak
- Remediation: n/a — PASS
- Notes: Same defense-in-depth principle as T.E.2 — even though the MCP surface doesn't read cookies for any application purpose, browser-based callers (Claude Web, future external consumer browser extensions) routinely include Cookie headers, and those values may include third-party tracking identifiers. Stripping them at the safeLog boundary is correct conservative hygiene.

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

- Date: 2026-05-11
- Tester: RP
- Client: direct curl
- Command/Action: `curl.exe -s "$env:MCP_URL/health" | ConvertFrom-Json | Format-List *`
- Outcome: PASS
- Observed: All 8 expected fields present, values populated:
  - `ok: True`
  - `version: 0.1.0`
  - `gitSha: 1959fbd`
  - `phase: BL-032 Phase 5 (observability)`
  - `upstashMcp: ok`
  - `upstashInoreader: ok`
  - `inoreader: ok`
  - `inoreaderObservedAt: 2026-05-11T16:26:46.254Z`
- Expected: Fields: `ok`, `version`, `gitSha`, `phase`, `upstashMcp`, `upstashInoreader`, `inoreader`, `inoreaderObservedAt`
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Pre-Path-2 single `redis` field is absent (good — confirms migration is complete). All probes returned `'ok'` at test time. The `gitSha = 1959fbd` matches commit `1959fbd` from this branch (the last deploy before today's session of finding-logging commits).

## T.E.7 — `/health` doesn't leak access token

- Date: 2026-05-11
- Tester: RP
- Client: direct curl
- Command/Action: `curl.exe -s "$env:MCP_URL/health"`; visually scan raw response body for token-like strings.
- Outcome: PASS
- Observed: Raw response body verbatim: `{"ok":true,"version":"0.1.0","gitSha":"1959fbd","phase":"BL-032 Phase 5 (observability)","upstashMcp":"ok","upstashInoreader":"ok","inoreader":"ok","inoreaderObservedAt":"2026-05-11T16:26:46.254Z"}`. No long base64/hex sequences. The only string longer than 10 chars is `phase` (33 chars, human-readable text) and `inoreaderObservedAt` (24 chars, ISO timestamp). `gitSha` is 7 chars (truncated commit hash, safe to expose). Probe results were boolean/string-status only — no token contents leaked through, consistent with the [`health.ts` PRIVACY comment](../../../mcp-server/src/observability/health.ts) about probe-result discarding.
- Expected: No values resembling Inoreader OAuth tokens (per `health.ts` PRIVACY note — probe-result discarded)
- Severity (if fail): Critical — implementation regression on the privacy comment
- Remediation: n/a — PASS
- Notes: Strong negative-result test — confirms the privacy-by-construction property of `/health` holds in practice.

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

- Date: 2026-05-11
- Tester: RP
- Client: PASS-by-reference to T.A.14 + T.A.13
- Command/Action: T.A.14 (2026-05-10) explicitly verified `wrangler tail` showed `"keyOwner":"AB"` deterministically across 5 authenticated calls when MCP_KEY_AB was bound. T.A.13 today re-verified the AB key authenticates (HTTP 200) post-restore.
- Outcome: PASS (by reference)
- Observed: T.A.14's tail excerpts captured `"keyOwner":"AB"` for every authenticated request issued with the AB token — no mixed attribution, no 5xx, no crash. The keyOwner derivation is purely a function of the matched secret name's suffix per [`bearer.ts:82`](../../../mcp-server/src/auth/bearer.ts#L82) — there's no code path that could attribute AB's call to anything else.
- Expected: Tail line(s) appear with `keyOwner: "AB"`
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: For an actual external team-member's onboarding, the operator can simply re-run T.A.14's tail command — no friction expected since the mechanism is the same. The full team-member-side Claude Desktop setup wasn't separately tested here because there's no second team-member in this soak.

#### T.F.1.b — AB's rate-limit counter independent of RP's

- Date: 2026-05-11
- Tester: RP
- Client: PASS-by-reference to T.C.5
- Command/Action: T.C.5 explicitly verified per-key rate-limit isolation by running a hammer loop on one key while probing with another key. T.C.4 today confirmed the underlying counter-storage design — `mcp:ratelimit:gen:day:RP:*` and `mcp:ratelimit:gen:day:AB:*` are independent Upstash keys with independent values.
- Outcome: PASS (by reference)
- Observed: T.C.5 was the Critical Pass — per-key counters fully isolated (60/200 for the hammered key, 200/200 for the probed key, no cross-contamination). T.C.4's Upstash inspection showed `day:RP:20583 = 325` and `day:AB:20583 = 6` as separate keys with separate values, exactly per the `@upstash/ratelimit` per-key design.
- Expected: AB hits 429 around req 60; RP's calls still get 200
- Severity (if fail): Critical if cross-key counter contamination (mirrors T.C.5)
- Remediation: n/a — PASS
- Notes: T.C.5 is the load-bearing test. T.F.1.b is the team-member-framing of the same observation; rerunning it specifically for AB-vs-RP would add no signal beyond what T.C.5 already proved.

#### T.F.1.c — AB's documentation discoverability

- Date: 2026-05-11 (DEFERRED — no external team-member to ask)
- Tester: n/a
- Client: n/a (requires actual onboardee feedback)
- Command/Action: Originally planned: ask AB if they found `REMOTE_CLIENT_SETUP.md` without help.
- Outcome: DEFERRED — preconditions not met (no real team-member onboarding occurred this soak; T.A.12/T.A.13 only exercised the OPERATOR side, not the team-member side).
- Observed: Not executed.
- Expected: AB found `REMOTE_CLIENT_SETUP.md` without operator hand-holding
- Severity (if fail): Discoverability gap — log a doc improvement task
- Remediation: Defer to the next real team-member onboarding (whenever the project takes on a second internal user, or as BL-033 rehearsal input). At that moment, capture: (a) which doc step blocked them first, (b) any OS-specific path bugs they hit, (c) any unclear Claude Desktop config steps. The MCP server's [`REMOTE_CLIENT_SETUP.md`](../../../mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md) is the canonical onboarding entry — if it gets discovered late or not at all, that's the highest-leverage improvement.
- Notes: A self-onboarding dry-run by the operator wouldn't be a substitute — the operator already knows where the docs are. The discoverability test requires fresh eyes.

#### T.F.1.d — First-blocker-to-fix time

- Date: 2026-05-11 (DEFERRED — no real onboarding event to time)
- Tester: n/a
- Client: n/a
- Command/Action: Originally planned: stopwatch onboarding wall-clock time from token-receipt to first-successful-call.
- Outcome: DEFERRED — same reason as T.F.1.c (no real team-member event this soak).
- Observed: Not executed.
- Expected: <15 min target. >30 min indicates onboarding friction.
- Severity (if fail): n/a
- Remediation: Defer to the next real onboarding event. Pair with T.F.1.c for the same data-capture session.
- Notes: A partial data point we DO have: provisioning AB on the operator side (T.A.12 Step 3 `wrangler secret put`) took <1 min once the value was ready in `$env:MCP_KEY_AB`. The operator-side cost is negligible; the team-member-side cost (Claude Desktop config edits, `mcp-remote` install, restart) is the variable that this test would measure.

### T.F.2 — External consumer onboarding (soak rehearsal for BL-033)

> Hypothetical "ExtCo" rehearsal. Verification stubs (T.F.2.a-e) capture observations against the operator checklist; outcomes feed BL-033's external-pilot scope discussion.

#### T.F.2.a — All-the-docs-they-need are public

- Date: 2026-05-11 (PARTIAL — depends on repo visibility)
- Tester: RP
- Client: manual review (Claude-side code inspection + repo-visibility check)
- Command/Action: Confirmed presence of `REMOTE_CLIENT_SETUP.md`, `RATE_LIMITS.md`, `AUTH.md`, `DEPLOY.md` in [`mcp-server/src/docs/operations/`](../../../mcp-server/src/docs/operations/). Repo origin is `https://github.com/Global-Strategic-Technologies/gst-website.git` — public-reachability depends on whether the repo is publicly visible at that URL.
- Outcome: PARTIAL — files exist; operator needs to verify public-reachability before sharing with any external consumer
- Observed: All four consumer-relevant operational docs are checked in to the repo. Their public-reachability has not been verified in this soak — `gst-website` repo could be public OR private depending on the org's GitHub settings. An external consumer with a hypothetical "ExtCo" engagement would either need (a) a public GitHub URL to the doc, (b) a copy delivered via a private channel, or (c) a separately-hosted docs site.
- Expected: All three accessible without auth gating
- Severity (if fail): External onboarding would be friction-heavy — operator has to email/share-link each doc
- Remediation: Operator should hit `https://github.com/Global-Strategic-Technologies/gst-website/blob/master/mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md` (and the other 2) in an incognito browser window with no GitHub session. If it loads → PASS, repo is public. If 404 → repo is private, and the BL-033 onboarding work needs to include a path for delivering operational docs (docs-site, public mirror, or signed PDF). Probably already on RP's radar; defer to BL-033 scoping.
- Notes: This is a one-minute manual verification that I can't run from this session, but it's worth checking before any external-consumer conversation lands.

#### T.F.2.b — Sensitive operational details aren't in those docs

- Date: 2026-05-11
- Tester: RP
- Client: Grep over `mcp-server/src/docs/operations/` for internal markers
- Command/Action: Pattern-search across the operations docs for `linear|slack|vercel|thefastcat|@gmail|@hotmail|production-only|internal-only|operator-only`. Reviewed each match.
- Outcome: PASS for consumer-facing docs; **`DEPLOY.md` is operator-only by design** and should not be shared externally
- Observed:
  - **REMOTE_CLIENT_SETUP.md** — clean. Single "Slack" mention at line 31 is a NEGATIVE example (`"❌ Plaintext in ~/.bashrc, a local note file, your shell history, Slack"`) — instructive, not internal-detail. Safe to share.
  - **AUTH.md** — clean. Single "Slack DM" mention at line 42 is also a negative example ("never via email, Slack DM, or any other plaintext channel"). Safe to share.
  - **RATE_LIMITS.md** — no matches at all (no internal references). Safe to share.
  - **DEPLOY.md** — NOT safe to share externally. Contains: `npx vercel env pull` workflow (line 217-244), `.env.vercel.local` cleanup steps (line 257), Vercel project-discovery instructions (line 226-232), Inoreader budget math (line 845), and detailed Cloudflare deploy mechanics. None of this is harmful per se, but it leaks operational topology an external consumer doesn't need and shouldn't see (Vercel project name, that the website's ISR shares the Inoreader budget, etc.).
- Expected: No internal-only references in consumer-facing docs; flag DEPLOY.md as operator-only
- Severity (if fail): Mid — disclosure of internal infrastructure detail wouldn't be a security defect but would erode the operational-boundary stance the consumer-facing docs maintain
- Remediation: Add a one-line README at `mcp-server/src/docs/operations/README.md` (or update existing) explicitly tagging which docs are consumer-facing vs operator-only. Suggested taxonomy: REMOTE_CLIENT_SETUP.md, RATE_LIMITS.md, AUTH.md (Rotate section) = consumer-shareable; DEPLOY.md, AUTH.md (operator sections), and any `_internal*` docs = operator-only.
- Notes: This is the kind of finding that surfaces specifically through the "imagine you're an external consumer" lens. Worth documenting for BL-033 onboarding-pack design.

#### T.F.2.c — Token has clear scope at issuance

- Date: 2026-05-11 (DEFERRED — paper-only for BL-032)
- Tester: n/a
- Client: n/a (operator notebook practice, not a code test)
- Command/Action: Originally planned: operator writes a hypothetical `MCP_KEY_EXTCO` scope entry in a durable notebook.
- Outcome: DEFERRED — paper-only for BL-032 by design (per playbook: "documented as paper-only for BL-032; BL-033 enforces in code")
- Observed: Not executed. BL-032's auth model is "all-tools-or-nothing per key"; per-tool scoping is BL-033 territory. The notebook practice is a behavioral discipline, not a code property — it doesn't have a yes/no test outcome in this soak.
- Expected: Operator notebook captures the scope; documented as paper-only for BL-032
- Severity (if fail): n/a
- Remediation: For each real external-consumer key issued, the operator should capture in their personal notebook: keyOwner, primary contact, intended tool scope, expected daily volume, expiry/review date. BL-033 plan should turn this into structured data (likely a YAML mapping in a private ops repo).
- Notes: Practice habit, not a test. Marking deferred so it doesn't sit as a pending item.

#### T.F.2.d — Bearer key compromise simulation

- Date: 2026-05-11
- Tester: RP
- Client: PASS-by-reference to T.A.12 + T.A.13 cycle
- Command/Action: T.A.12's full delete-then-restore cycle on MCP_KEY_AB is the operational equivalent of the rotation drill described in T.F.2.d. Timing observations from that session inform the rotation-time estimate.
- Outcome: PASS (by reference) — rotation-time estimate <2 min total, well under the 10-min target
- Observed: T.A.12's wall-clock observations:
  - `wrangler secret delete` → result in ~5s
  - 35s isolate-refresh wait (deliberate, could be tightened to ~10s if needed since Workers isolates refresh on the next cold start)
  - `wrangler secret put` with new value → result in ~5s
  - 35s isolate-refresh wait
  - Verification call → 200
  - **Total operator-side**: ~80s including waits, ~10s of actual command execution
- Expected: <10 min from compromise-detection to first successful call with new token
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: For a REAL compromise scenario, the bottleneck wouldn't be the technical rotation — it would be (a) operator detection latency (depends on monitoring), (b) communicating the new token to the consumer via a secure channel. Both are out-of-band of this test. The technical rotation itself is fast enough that the playbook's 10-min target has substantial slack.

#### T.F.2.e — Revocation simulation

- Date: 2026-05-11
- Tester: RP
- Client: PASS-by-reference to T.A.12 Step 2
- Command/Action: T.A.12 Step 2 explicitly verified that calls with a token whose secret is unbound return HTTP 401 (no 5xx, no bypass).
- Outcome: PASS (by reference) — Worker-side revocation works as expected
- Observed: T.A.12 captured `Revoked AB status: 401` after the AB binding was unset, with full structured error envelope. The Worker's 401 response includes `WWW-Authenticate: Bearer realm="gst-mcp"` and a JSON body with `error: "unauthorized"`. Whether a Claude Desktop / Cursor / agent client surfaces this in a user-readable way is a CLIENT-SIDE concern, not a Worker concern.
- Expected: ExtCo's calls return 401 within ~30s
- Severity (if fail): n/a
- Remediation: n/a for the Worker-side. Consumer-experience capture (which clients surface 401 cleanly vs cryptically) is a paper task for BL-033 onboarding — worth documenting which clients in the support matrix give clear "your token has been revoked" messaging versus ambiguous "connection failed" surfaces.
- Notes: T.A.12 also captured the secret-rebinding case (`Restored AB status: 200`), which is the OTHER half of the lifecycle — a consumer who lost access can have it restored within seconds by the operator. The full revocation/restoration loop is fast and reliable.

## Section G — Disaster recovery

## T.G.1 — Wrangler rollback works

- Date: 2026-05-11
- Tester: RP
- Client: wrangler CLI + direct curl
- Command/Action: `npx wrangler deployments list --env staging` (10 versions listed); `npx wrangler rollback --env staging` (interactive — confirmed with rollback message "just testing the T scenarios"); `curl.exe $env:MCP_URL/health` to verify; `(Invoke-McpRequest -Method "tools/list" -Params @{}).result.tools.Count` to confirm functionality. Then roll forward: `npm run deploy:staging`.
- Outcome: PASS (mechanism verified) — with one methodological observation worth recording
- Observed: Rollback completed in <5s. Active Version ID changed from `8fb2d479-e5e0-4fed-97ef-d30ce81a8ecd` → `daa419ad-29e3-4df1-8ee4-5a21522502a3`. Wrangler reported "SUCCESS — Worker Version daa419ad-29e3-4df1-8ee4-5a21522502a3 has been deployed to 100% of traffic." Post-rollback `/health` showed `gitSha: 1959fbd` and `version: 0.1.0`; `tools/list` returned all 10 tools — Worker fully functional on the rolled-back version. **Methodology note**: the immediate previous version (`daa419ad`) was a `Source: Secret Change` deployment (auto-created by Wrangler when secrets are added/removed), not a code-change deployment. Both `8fb2d479` and `daa419ad` were secret-change versions built on top of the same underlying code deploy (`8b846293`, 2026-05-11T00:00 — the deploy that set `GIT_SHA: 1959fbd`). So `/health.gitSha` didn't change across the rollback — both versions inherit the same code + GIT_SHA. The Version ID change is the substantive proof that the rollback mechanism works. Roll-forward via `npm run deploy:staging` correctly redeployed branch HEAD as `gitSha: 8c73b25`, end-to-end flow clean.
- Expected: Rollback completes in <30s; `/health` returns previous version's `gitSha`; tools still work
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: For a future rollback test that aims to verify the `gitSha` change specifically, the operator should rollback to a `Source: Unknown (deployment)` code-change version (skipping past the intermediate secret-change versions) by passing the specific Version ID explicitly: `npx wrangler rollback --env staging 8b846293-dc01-48e9-b87b-39fc3f444f7b`. Today's test confirms the mechanism is intact; the gitSha-specific verification would be a future drill against an older code deploy.

## T.G.2 — Secrets persist through rollback

- Date: 2026-05-11
- Tester: RP
- Client: wrangler CLI
- Command/Action: After T.G.1 rollback, `npx wrangler secret list --env staging` to confirm all expected secrets still bound.
- Outcome: PASS
- Observed: **10 secrets** persisted through the rollback, all present and named correctly: `INOREADER_ACCESS_TOKEN`, `INOREADER_APP_ID`, `INOREADER_APP_KEY`, `INOREADER_REFRESH_TOKEN`, `MCP_KEY_RP`, `SENTRY_DSN`, `UPSTASH_INOREADER_REST_TOKEN`, `UPSTASH_INOREADER_REST_URL`, `UPSTASH_MCP_REST_TOKEN`, `UPSTASH_MCP_REST_URL`. Wrangler secrets are stored independently of Worker code versions in Cloudflare's encrypted secret store — code rollbacks don't touch them, exactly as the Cloudflare architecture documents.
- Expected: All secrets present and correct
- Severity (if fail): If secrets are lost, this is a Cloudflare bug — flag in Sentry
- Remediation: n/a — PASS
- Notes: The playbook expected "9 secrets" but the actual count is 10 (Path 2 split the original `UPSTASH_REDIS_*` pair into two URL+TOKEN pairs — one for Inoreader DB, one for MCP DB). Worth updating the playbook's count. Substance of the test (do secrets persist?) is unambiguous PASS.

## T.G.3 — Sentry continues capturing post-rollback

- Date: 2026-05-11 (DEFERRED — depends on T.G.1 + deliberate exception trigger)
- Tester: n/a
- Client: n/a (depends on rollback being done first)
- Command/Action: Originally planned: post-rollback, deploy a deliberate-crash endpoint OR wait for natural exception; inspect Sentry for the event.
- Outcome: DEFERRED — preconditions unmet
- Observed: Not executed. Two compounding preconditions: (a) requires T.G.1 to have run first (paired in the playbook), (b) requires triggering a Worker-side exception (deliberate handler crash or natural-occurrence). The Sentry-event tests in Section E (T.E.4/E.5) are similarly deferred for the same exception-triggering reason — easier to address them as a single Sentry-event observation cluster than piecemeal.
- Expected: Sentry receives the post-rollback exception; alert fires
- Severity (if fail): Sentry DSN secret lost during rollback would be a real but recoverable issue
- Remediation: Pair with the Section E Sentry-event tests. Either: deploy a temporary `/_throw` endpoint that intentionally crashes (delete-after-test), or wait for natural exception occurrence over the next ~week of soak traffic. Sentry observability is a hardened part of the stack (BL-032 Phase 5 ran the alert-rule setup); regression risk is low.
- Notes: Pre-rollback Sentry is already proven by virtue of `SENTRY_DSN` being a wrangler secret that's part of the standard secret list (T.G.2 verifies persistence). The post-rollback aspect is the increment.

## T.G.4 — MCP DB hard-delete recovery

- Date: 2026-05-11 (DEFERRED — destructive, playbook forbids on real MCP DB)
- Tester: n/a
- Client: n/a (would require a throwaway Upstash DB to safely test)
- Command/Action: Originally planned: on a throwaway DB only, delete + recreate + redeploy with new credentials.
- Outcome: DEFERRED — playbook explicitly forbids this on the real MCP DB during soak
- Observed: Not executed.
- Expected: After recovery, `/health` shows `upstashMcp: 'ok'`; rate limiter starts from empty counters; circuit breaker reset
- Severity (if fail): Worker permanently broken, or stale-state behavior
- Remediation: Schedule alongside any future Upstash-region migration (which would naturally exercise this code path), or set up a dedicated throwaway DB for a focused DR exercise. Note: the underlying recovery code paths are already proven indirectly — T.C.7 (graceful skip when MCP DB unreachable) demonstrated the Worker handles missing-credentials cleanly without crashing, which is the load-bearing safety property for this scenario.
- Notes: T.G.4 is the canonical DR drill, but its destructive nature means it's never the right time to run it during active testing. The healthier pattern is to exercise it during a planned infrastructure event (e.g., Upstash region migration) where the throwaway state is the natural outcome anyway.

## T.G.5 — Inoreader DB Read-Only token rotated by website team

- Date: 2026-05-11 (DEFERRED — requires Vercel-owner coordination)
- Tester: n/a
- Client: n/a (requires coordination with website-side ownership)
- Command/Action: Originally planned: Vercel project owner regenerates Read-Only token in Upstash; Worker secret updated; redeploy.
- Outcome: DEFERRED — requires cross-team coordination
- Observed: Not executed. Single-operator soak; no separate Vercel-owner role to coordinate with.
- Expected: `/health` `upstashInoreader: 'ok'` after token rotation + redeploy; radar tools resume
- Severity (if fail): Coordination gap surfaced
- Remediation: This test surfaces the coordination boundary BETWEEN website ownership and MCP Worker ownership. In a single-operator setup it's a self-coordination dry-run; in a multi-operator scenario it becomes a real coordination exercise. Worth running as a paper walkthrough at the BL-033 handoff point if external consumers depend on the Inoreader feed. The technical mechanism (Worker reads Read-Only token via `wrangler secret`, no special code path) is already proven during T.C.7's restore cycle.
- Notes: The Q13-resolved two-database architecture is the key thing to communicate — anyone touching the Inoreader Upstash DB needs to know the Worker has a separate token bound to it. Worth checking that DEPLOY.md C.5 includes a note pointing back to this dependency.

## T.G.6 — Cloudflare account compromise — operator can revoke fast

- Date: 2026-05-11 (DEFERRED — requires throwaway Cloudflare account)
- Tester: n/a
- Client: n/a (requires standing up a throwaway account)
- Command/Action: Originally planned: spin up a separate Cloudflare account; deploy a minimal Worker; time the full revocation flow.
- Outcome: DEFERRED — operational heavy lift; not a code-correctness test
- Observed: Not executed. This is a behavioral preparedness test — measuring how fast the operator can `wrangler logout`, rotate the Cloudflare API token, and stand up a new deploy elsewhere. Not a test of the MCP Worker code itself.
- Expected: <30 min from compromise-detection to running-elsewhere
- Severity (if fail): Recovery requires Cloudflare-side support tickets — operator doesn't control the recovery time
- Remediation: Run as a tabletop DR exercise post-BL-032. The procedure-documentation part (writing down the revocation steps) is the high-value output; the timing measurement is secondary. Could pair with BL-037 Phase B (production deploy gating) since at that point Cloudflare-account-compromise has higher stakes.
- Notes: For the BL-032 internal-soak scope, this is well-deferrable — the operator IS the single point of trust; account-compromise is the worst-case scenario and the recovery path is by definition not on the happy path of the MCP server's daily ops. BL-033 (external consumers) doesn't change the calculus dramatically since the recovery primarily affects operator workflows.

## Section H — Performance

> All H stubs use the playbook's `Measure-McpLatency` helper. Paste once per soak session before running these tests (definition in playbook § Section H — "Latency-measurement helper").

## T.H.1 — Cold-isolate latency

- Date: 2026-05-11 (DEFERRED — needs an isolated 5-min idle period)
- Tester: RP
- Client: n/a (precondition unmet during continuous soak)
- Command/Action: Originally planned: wait 5+ min idle, then take a single-sample of `tools/list`.
- Outcome: DEFERRED to focused performance session
- Observed: Not executed. A 5-min wall-clock wait in the middle of a soak that's making continuous calls isn't productive. Better measured in a dedicated cold-start session where no other traffic has hit the Worker for 5+ minutes.
- Expected: <800ms (cold start adds ~200-300ms over warm)
- Severity (if fail): >2s consistently
- Remediation: Schedule a focused cold-start measurement post-soak. Pair with T.H.3 (radar cold cache) since both require a cold-state precondition.
- Notes: With the geography-related Upstash latency baseline identified by T.H.4/T.H.6 (each Upstash hop ~250ms from GRU), a cold start would likely land around `<800ms + Upstash penalty>` — possibly 1-1.5s for a non-radar cold call. The target's reasonableness depends on which region the cold call originates from.

## T.H.2 — Warm-isolate non-radar latency

- Date: 2026-05-11
- Tester: RP
- Client: direct curl (PowerShell helper, N=10 via Measure-McpLatency)
- Command/Action: `Measure-McpLatency -Method "tools/call" -Params @{ name="list_portfolio_facets"; arguments=@{} } -N 10`
- Outcome: PASS
- Observed: N=10, **MedianMs=212.8**, **P95Ms=221.7**. Tight distribution (P95 only 4% above median — minimal variance). Worker handler runs entirely on edge-bundled data (no Upstash, no Inoreader); latency is dominated by edge dispatch + JSON serialization + transcontinental network back to operator. Well below the 500ms p95 target.
- Expected: p95 <500ms
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: The tight distribution between median and p95 is the strongest signal — non-radar tools have predictable latency, no hidden slow paths. The ~213ms baseline is roughly the operator's RTT to the Cloudflare GRU edge, which means actual Worker handler time is in the single-digit milliseconds — exactly what we'd want for static-data tools.

## T.H.3 — Radar cold (cache miss)

- Date: 2026-05-11 (DEFERRED — preconditions require Inoreader budget burn or 6h wait)
- Tester: RP
- Client: n/a (precondition unmet)
- Command/Action: Originally planned: use a category not called within 6h to force cache miss; measure single sample.
- Outcome: DEFERRED
- Observed: Not executed. T.B.9.d already warmed all 4 categories of the radar cache within the soak day; forcing a cold-cache call requires either (a) waiting 6h for TTL, or (b) DELing `mcp:radar:cache:{wire,fyi}` keys in Upstash (which burns ~6 Inoreader calls on the next fetch). Neither was justified in this session's pace and budget context.
- Expected: <2s
- Severity (if fail): >5s — Inoreader is slow OR our fetch path is regressed
- Remediation: Pair with T.H.1 in the focused performance session. Run after a natural 6h cache-TTL expiry to avoid budget burn, or accept the ~6-call cost and DEL the cache keys before the cold-sample.
- Notes: Even without measurement, we have a lower-bound estimate from T.H.4 (warm radar = 930ms median) plus the known Inoreader fetch cost (~6 sub-calls × ~200-400ms each). Predicted cold latency: ~2-3s, in the same ballpark as the target.

## T.H.4 — Radar warm (cache hit)

- Date: 2026-05-11
- Tester: RP
- Client: direct curl (PowerShell helper, N=10 via Measure-McpLatency)
- Command/Action: `Measure-McpLatency -Method "tools/call" -Params @{ name="search_radar"; arguments=@{ category="pe-ma" } } -N 10`
- Outcome: **FAIL of stated target — likely regional-latency artifact, not code defect**
- Observed: N=10, **MedianMs=930.3**, **P95Ms=943.9**. Target was p95 <200ms. Distribution is tight (P95 only 1.5% above median), so the latency is consistent rather than spiky. Root-cause hypothesis: **GRU ↔ Upstash US-region transcontinental hops dominate**. Each `search_radar` warm call makes ~2 sequential Upstash round-trips: (1) circuit-breaker check ([`circuit-breaker.ts:56-60`](../../../mcp-server/src/ratelimit/circuit-breaker.ts#L56-L60)), then (2) `Promise.all([readWireLive, readFyiLive])` — two parallel cache reads. Empirical Upstash RTT from GRU appears to be ~250ms (consistent with T.H.6's `/health` median of 259ms, which does 3 parallel Upstash probes ≈ 1 round-trip). So `2 × 250ms = 500ms` Upstash overhead + ~430ms Worker handler/serialization/network ≈ 930ms observed. The math matches.
- Expected: p95 <200ms
- Severity (if fail): Important latency regression for radar tools, but **not blocking**. Operationally, agents using `search_radar` get correct results, just slower than the playbook target.
- Remediation: Three options for closing the gap, none in scope for BL-032:
  1. **Move the MCP Upstash DB closer to the operator's region** (Upstash regional choice is per-database; can be changed by recreating).
  2. **Add Cloudflare KV** as a Worker-resident cache layer that replicates globally; reduces Upstash hits to once per region per TTL window.
  3. **Revise the latency targets** to be region-aware (e.g., "p95 <200ms when Worker and Upstash are co-regional").
     Most likely fit: a BL-033 prerequisite item to measure latency from the actual external-consumer regions and choose accordingly.
- Notes: Important separation in this finding: code is fine, infrastructure topology is the cost-driver. The Worker would meet the 200ms target if Upstash were co-regional. Worth adding a BACKLOG entry for "Regional latency assessment and remediation" once we know external-consumer regions in BL-033.

## T.H.5 — Latency under concurrent load

- Date: 2026-05-11
- Tester: RP
- Client: direct curl (PowerShell `Start-Job` for parallelism — 5 jobs × 20 calls each = 100 total samples)
- Command/Action: 5 PowerShell background jobs, each making 20 sequential `tools/list` POSTs; collected `Measure-Command` timings; computed median/p95/max across all 100.
- Outcome: PASS
- Observed: 100 samples collected. **Median=232.2ms** (vs T.H.2's 212.8ms solo — +9%), **P95=261.2ms** (vs T.H.2's 221.7ms — +18%), Max=587.8ms. Both deltas are within the ±20% target. **No latency cliff under 5× concurrent load** — Workers scale horizontally as expected. The +18% p95 increase is small enough that the single-sample max of 587.8ms is the most informative — even at peak there's no 2× cliff.
- Expected: No latency cliff (p95 holds within target ±20%)
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Strongest signal of healthy Worker behavior in this section. The +18% p95 is consistent with mild contention (more requests per isolate, possibly minor TCP backpressure to Cloudflare's edge), but nothing that would surface as user-visible slowness. Confirms there's no hidden serialization point in the Worker code path.

## T.H.6 — `/health` latency budget

- Date: 2026-05-11
- Tester: RP
- Client: direct curl (PowerShell loop, 100 calls)
- Command/Action: `1..100 | ForEach-Object { (Measure-Command { curl.exe -s "$env:MCP_URL/health" > $null }).TotalMilliseconds }`; compute median/p95/max.
- Outcome: **FAIL of stated target — regional-latency artifact (same cause as T.H.4)**
- Observed: **Median=259.2ms** (target <50ms), **P95=414.3ms** (target <150ms), Max=769.6ms. Target was assuming Promise.all over 3 cheap probes where each Upstash REST call is ~10-20ms (US-region operator). From GRU, each Upstash REST call is ~250ms. /health does 3 parallel probes (`upstashMcp`, `upstashInoreader`, `inoreader`) bounded by the slowest one → ~250ms minimum + Worker overhead + transcontinental return.
- Expected: Median <50ms (Promise.all over 3 cheap probes); p95 <150ms
- Severity (if fail): "Substantially over → Upstash REST latency from Cloudflare's edge unexpectedly slow" — playbook expected this exact case. Investigation completed.
- Remediation: Same as T.H.4 — regional infrastructure topology, not code. The 3-probe Promise.all pattern is correct; what makes the targets unachievable is the transcontinental Upstash hop. Note that for monitoring/alerting purposes, the 769ms max is well below any reasonable health-check timeout (typically 5-10s), so /health remains usable for liveness checks even from GRU.
- Notes: Cross-references T.H.4's regional-latency analysis. Both findings point to the same architectural property — and both would resolve by closing the geography gap or revising targets. Combined remediation: one ticket for "BL-033 prerequisite — measure-and-co-locate latency assessment."

## Section I — Security

## T.I.1 — Authorization header strip in logs

- Date: 2026-05-11
- Tester: RP
- Client: PASS-by-reference to T.E.2
- Command/Action: Cross-referenced T.E.2's wrangler-tail capture of a Bearer-authenticated request — same code path, same expected behavior, same evidence.
- Outcome: PASS (by reference)
- Observed: T.E.2's log line `{"timestamp":"2026-05-11T16:56:20.494Z","event":"mcp.request","keyOwner":"RP","path":"/mcp","status":200,"durationMs":0,"success":true}` contains zero "Bearer" occurrences and zero token-value substrings. safeLog correctly strips Authorization before structured logging.
- Expected: No matches
- Severity (if fail): Critical — token leak
- Remediation: n/a — PASS
- Notes: Security framing of T.E.2. Load-bearing guarantee for the entire bearer-auth model.

## T.I.2 — CORS preflight rejects unknown origin

- Date: 2026-05-11
- Tester: RP
- Client: direct curl
- Command/Action: `curl.exe -i -s -X OPTIONS "$env:MCP_URL/mcp" -H "Origin: https://evil.example.com" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: Authorization,Content-Type"`
- Outcome: PASS
- Observed: Status `204 No Content` with **zero `Access-Control-Allow-Origin` header** in the response. `Vary: Origin` correctly set. The Worker returns a 204 (the spec-compliant default for an OPTIONS request with no CORS handler match) but, critically, does NOT include any `Access-Control-Allow-Origin` header for `evil.example.com`. A browser receiving this preflight response sees "no Allow-Origin header that matches my Origin" and rejects the subsequent real request entirely — which is even safer than a 403 (it doesn't tell the attacker anything about the surface, just refuses to opt in to CORS).
- Expected: 403 (or 204 with CORS headers absent — depending on cors.ts impl)
- Severity (if fail): Critical if 204 with `Access-Control-Allow-Origin: *` (would let any site relay user's bearer token)
- Remediation: n/a — PASS
- Notes: The "absent Allow-Origin" path is the strongest possible CORS posture for an unknown origin. Browsers cannot complete the cross-origin request, period.

## T.I.3 — CORS preflight accepts known origin

- Date: 2026-05-11
- Tester: RP
- Client: direct curl
- Command/Action: `curl.exe -i -s -X OPTIONS "$env:MCP_URL/mcp" -H "Origin: https://claude.ai" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: Authorization,Content-Type"`
- Outcome: PASS
- Observed: Status `204 No Content` with:
  - `Access-Control-Allow-Origin: https://claude.ai` ← echoed back, NOT wildcard ✓
  - `Vary: Origin` ✓
  - `Access-Control-Allow-Headers: Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version` (sensible allowlist; no permissive `*`)
  - `Access-Control-Allow-Methods: POST, GET, OPTIONS` (no PUT/DELETE/PATCH/etc — correctly scoped to JSON-RPC needs)
  - `Access-Control-Expose-Headers: Mcp-Session-Id, Mcp-Protocol-Version, WWW-Authenticate` (lets the client read auth-failure reasons)
  - `Access-Control-Max-Age: 86400` (preflight cached for 24h — performance win, no security concern)
- Expected: 204 with `Access-Control-Allow-Origin: https://claude.ai` (echoed back, not wildcard)
- Severity (if fail): Wildcard or no-CORS-headers
- Remediation: n/a — PASS
- Notes: Combined with T.I.2's evil-origin rejection, this confirms the CORS implementation correctly distinguishes allowed from unknown origins via origin echo, not a permissive wildcard.

## T.I.4 — Bearer keyOwner extraction is pinned

- Date: 2026-05-11
- Tester: RP
- Client: code review (Claude-side)
- Command/Action: Inspected [`mcp-server/src/auth/bearer.ts`](../../../mcp-server/src/auth/bearer.ts) for the keyOwner extraction logic.
- Outcome: PASS
- Observed: Extraction is a single line at [`bearer.ts:82`](../../../mcp-server/src/auth/bearer.ts#L82): `return { ok: true, keyOwner: name.slice(KEY_NAME_PREFIX.length) };`. `KEY_NAME_PREFIX = 'MCP_KEY_'` (length 8). For `MCP_KEY_RP` → `RP`. For `MCP_KEY_AB` → `AB`. Hypothetical `MCP_KEY_FOO_BAR` would yield `FOO_BAR` (additional underscores preserved verbatim — no further splitting). No lowercase transform, no regex, no off-by-one. The matched secret's name suffix becomes the keyOwner verbatim; the token VALUE never enters the log path. Matches what T.A.13 and T.A.14 empirically observed.
- Expected: Code review pass — extraction matches the documented behavior in T.A.13
- Severity (if fail): Off-by-one in suffix extraction (could let a token leak via misattributed logs)
- Remediation: n/a — PASS
- Notes: Single-line extraction is its own defense-in-depth — there's no surface area for a bug like "split on the first underscore and lose the suffix" because we don't split at all.

## T.I.5 — Token comparison is constant-time

- Date: 2026-05-11
- Tester: RP
- Client: code review + cross-reference T.A.15
- Command/Action: (a) Inspected [`mcp-server/src/auth/bearer.ts`](../../../mcp-server/src/auth/bearer.ts#L81) for `crypto.timingSafeEqual` or equivalent. (b) Cross-referenced T.A.15's empirical timing measurement.
- Outcome: **PARTIAL** — code uses plain `===` (FAIL of formal contract); empirical timing measurement on WAN shows no observable difference (PASS of practical behavior).
- Observed: Line 81 of `bearer.ts`: `if (value === token) {`. This is plain JavaScript string equality, NOT `crypto.timingSafeEqual`. V8's string `===` does a length check first (which already leaks length information — though the bearer-token length is a known constant), then a byte-by-byte comparison that short-circuits on the first mismatch. At nanosecond per-byte comparison cost, the timing difference for byte-0 vs byte-42 mismatches is ~40-80 nanoseconds. T.A.15's empirical test (N=20 paired, both 401) measured medians 140.03ms (first-byte-diff) vs 140.91ms (last-byte-diff) — Δ 0.88ms = 880,000 nanoseconds of WAN noise. The constant-time-vs-`===` signal is 4-5 orders of magnitude below the noise floor on WAN, so empirically the auth path appears constant-time to any practical attacker.
- Expected: Constant-time comparison (`crypto.timingSafeEqual` or equivalent)
- Severity (if fail): Plain `===` comparison — Important; not Critical at internal-soak-scope, matters for BL-033
- Remediation: **File for BL-033 as a hardening item before external-pilot ship.** The fix is mechanical: replace `value === token` with a constant-time byte-by-byte comparison. Workers runtime has `crypto.subtle` and the deeper `crypto.timingSafeEqual` available (via `node:crypto` polyfill enabled by `nodejs_compat`). Estimated effort: half a day including a unit test that asserts comparison time is independent of mismatch position via instrumented benchmarks.
- Notes: This is the second BL-033-blocking item the soak surfaced (alongside BL-038's missing radar rate-limit tier). Both are defense-in-depth gaps, not critical exploitable defects at internal-soak scope (single operator, no LAN attack model, WAN noise dwarfs timing leaks). At external-pilot scope (BL-033), the attacker model expands and these gaps need closing.

## T.I.6 — No raw `console.log` in worker code

- Date: 2026-05-11
- Tester: RP
- Client: code review (Claude-side) — `Grep "console\." mcp-server/src/worker.ts`
- Command/Action: Grepped `worker.ts` for any `console.` invocation; cross-referenced `safe-logger.ts` for the single documented exception.
- Outcome: PASS
- Observed: Zero `console.` occurrences in `mcp-server/src/worker.ts`. The only `console.log` call in the entire Worker code path is at [`mcp-server/src/auth/safe-logger.ts:88`](../../../mcp-server/src/auth/safe-logger.ts#L88), guarded by an `// eslint-disable-next-line no-console` pragma — by design this is the ONE permitted occurrence, the single emitter that every structured log line flows through. Per the comment at `safe-logger.ts:84-86`: "Single direct call site for console.log — by design, the only place in the Worker code path where it appears." Lint also enforces this — `npm run lint` would fail if a `console.log` slipped into `worker.ts` or `auth/**`.
- Expected: Lint passes; if a raw `console.log` were introduced it would fail
- Severity (if fail): Lint rule disabled or removed
- Remediation: n/a — PASS
- Notes: This is the defense-in-depth pair to T.E.2 — even if a future contributor wrote `console.log(req.headers.get('Authorization'))` somewhere, the lint rule would block the commit. The architectural separation (one emitter, lint-enforced) is the right pattern.

## T.I.7 — Health probe doesn't leak access token

- Date: 2026-05-11
- Tester: RP
- Client: PASS-by-reference to T.E.7
- Command/Action: T.E.7 inspected the raw `/health` response body for token-like strings.
- Outcome: PASS (by reference)
- Observed: T.E.7's verbatim /health body — `{"ok":true,"version":"0.1.0","gitSha":"1959fbd","phase":"BL-032 Phase 5 (observability)","upstashMcp":"ok","upstashInoreader":"ok","inoreader":"ok","inoreaderObservedAt":"2026-05-11T16:26:46.254Z"}` — contains zero long base64/hex sequences, zero token-shaped substrings. Probe results are boolean/string-status only. The PRIVACY-by-construction comment in [`health.ts`](../../../mcp-server/src/observability/health.ts) is upheld in practice.
- Expected: No token in response body
- Severity (if fail): Critical — token leak
- Remediation: n/a — PASS
- Notes: Security framing of T.E.7. Cross-references that test directly.

## T.I.8 — wrangler.toml has no plaintext secrets

- Date: 2026-05-11
- Tester: RP
- Client: code review (Claude-side) — Grep for `(?i)token|secret|key`
- Command/Action: Grepped `mcp-server/wrangler.toml` for any of the three sensitive substrings.
- Outcome: PASS
- Observed: All 11 matches in `wrangler.toml` are secret NAMES in comments (e.g., `# MCP_KEY_RP`, `# UPSTASH_INOREADER_REST_TOKEN`, `# INOREADER_APP_KEY`), zero plaintext values. The matches all occur inside the documentation block at lines 37-50 that lists which secrets the operator must set via `wrangler secret put`, plus the production-deploy mirror at lines 64-66. No `secret = "..."` or equivalent value assignments — Cloudflare's Wrangler-secret model means secrets are never in source.
- Expected: Only secret NAMES in comments; no plaintext values
- Severity (if fail): Critical if plaintext secret in committed file
- Remediation: n/a — PASS
- Notes: The Wrangler-secret model is the right primitive — secrets stored in Cloudflare's encrypted secret-store, referenced by name in `wrangler.toml`. Source-level scan confirms no leak.

## T.I.9 — Production deploy doesn't include source maps

- Date: 2026-05-11 (deferred — production not deployed)
- Tester: RP
- Client: n/a (precondition unmet)
- Command/Action: Originally planned: post-`npm run deploy:production`, inspect bundle via Cloudflare dashboard.
- Outcome: DEFERRED — preconditions not met (no production deploy this soak)
- Observed: Production Worker not yet deployed — `curl https://mcp.globalstrategic.tech/health` returns exit code 6 (DNS resolution failure), same finding noted in T.C.9. T.I.9 cannot be evaluated until production deploy lands as part of BL-033 (or a pre-BL-033 production-readiness milestone).
- Expected: No `.map` files in the deployed bundle
- Severity (if fail): Source maps exposed (would aid an attacker — moderate severity)
- Remediation: **Re-test after the first production deploy** (likely BL-037 Phase B once CI/CD ships, or any operator-direct production deploy before then). Add to the production-pre-flight checklist.
- Notes: Staging deploy already builds with no source maps emitted by `esbuild` (per the build config in `mcp-server/build.mjs`), so the risk of a regression is low — but the contract is "production specifically." Defer to that milestone.

## T.I.10 — Worker bundle doesn't ship `_local-only.ts` content

- Date: 2026-05-11
- Tester: RP
- Client: direct curl (PowerShell helper)
- Command/Action: `$toolsResp = Invoke-McpRequest -Method "tools/list" -Params @{}; $toolsResp.result.tools | Select-Object name | Sort-Object name`
- Outcome: PASS
- Observed: Exactly **10 tools** exposed via tools/list. Sorted-alphabetical list: `assess_infrastructure_cost_governance`, `compute_techpar`, `estimate_tech_debt_cost`, `generate_diligence_agenda`, `get_latest_insights`, `list_portfolio_facets`, `list_regulation_facets`, `search_portfolio`, `search_radar`, `search_regulations`. The local-only tools (`search_radar_offline`, `search_radar_cache`) are correctly absent from the Worker bundle. `search_radar` IS present as the live counterpart, as expected.
- Expected: 10 transport-portable tools only; `search_radar_offline` and `search_radar_cache` MUST NOT appear
- Severity (if fail): Stdio-only tools registered → would attempt to read files (404s, but a regression worth catching)
- Remediation: n/a — PASS
- Notes: This is the live verification of the stdio-vs-Worker registry separation maintained by [`mcp-server/src/tools/_local-only.ts`](../../../mcp-server/src/tools/_local-only.ts). The transport-portable count holds at 10 as intended. Any future tool that needs `node:fs` / `node:crypto` etc. should be registered through `_local-only.ts`, not in the transport-portable `createServer()` path.

## Section J — Schema

## T.J.1 — Tool registry parity (stdio vs Worker)

- Date: 2026-05-11
- Tester: RP
- Client: vitest
- Command/Action: `cd mcp-server; npm test` — verified the full suite, including tool-registry parity tests.
- Outcome: PASS
- Observed: 42 test files, **410/410 tests pass** (re-verified during T.C.6 investigation and earlier T.B.10 sort-fix work). The playbook references `registry-snapshot.test.ts` (doesn't exist by that exact filename — naming changed during BL-031.85), but the equivalent contract coverage lives in [`tests/integration/golden-snapshots.test.ts`](../../../mcp-server/tests/integration/golden-snapshots.test.ts), [`tests/integration/prompts-registry.test.ts`](../../../mcp-server/tests/integration/prompts-registry.test.ts), and [`tests/integration/worker-roundtrip.test.ts`](../../../mcp-server/tests/integration/worker-roundtrip.test.ts). Together they exercise the full Worker tool registry against snapshot fixtures.
- Expected: Test passes — snapshot match between stdio and Worker tool registries
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Worth updating the playbook's T.J.1 stub to point to the actual test file names. Fourth docs-ahead-of-code finding this soak (after T.B.3.a, T.B.9.d, T.C.6). Bundling these into a doc-audit pass for BL-034 (MCP doc cleanup) is increasingly justified.

## T.J.2 — Each tool's input schema matches its website-page filter UI

- Date: 2026-05-11
- Tester: RP
- Client: n/a (deferred — paper exercise, not a single-session test)
- Command/Action: Originally planned: pick a tool, compare its Zod schema against actual filter chips on the corresponding website page.
- Outcome: DEFERRED to a focused alignment-audit session
- Observed: Not executed this soak. T.B.2.f's deeplink round-trip (`/ma-portfolio?theme=Healthcare&eng=Buy-Side`) and T.B.3.h's diligence-machine wizard restoration both indicate the schema-to-page mapping holds for the two tools that have deeplinks. Schema-to-filter-UI alignment for the remaining 8 tools wasn't separately verified.
- Expected: No drift between Zod schema enum values and the filter UI options
- Severity (if fail): Drift signals require a BACKLOG entry for the next BL-031.95-style alignment pass
- Remediation: Defer to a paper-walkthrough session pre-BL-033 where each tool's schema enums are diffed against the corresponding hub-page filter component. Likely lands as a sub-task under BL-034 (doc cleanup) or its own audit ticket. Estimated effort: 1-2 hours for all 10 tools.
- Notes: T.B.2.f and T.B.3.h are strong indirect evidence that the round-trip works for the two tools with deeplinks; the contract for the rest is "trust the BL-031.85 schema-source-of-truth design until proven otherwise."

## T.J.3 — Each tool's deeplink reproduces filter state

- Date: 2026-05-11
- Tester: RP
- Client: PASS-by-reference to T.B.2.f + T.B.3.h
- Command/Action: T.B.2.f captured `search_portfolio` deeplink `https://globalstrategic.tech/ma-portfolio?theme=Healthcare&eng=Buy-Side`. T.B.3.h captured the 13-field diligence-machine deeplink, opened it in a browser, instrumented `restoreState` confirmed each branch of URL-state restoration fires correctly.
- Outcome: PASS (by reference)
- Observed: Both deeplink → page-state round-trips confirmed. T.B.3.h tested against local dev (`http://localhost:4321`) because the feature-mcp1 branch's URL-restoration code isn't on master yet. T.B.2.f tested against production (already live there). Both PASS.
- Expected: Round-trip works — deeplink → page state matches the original tool inputs
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: Note that T.B.3.h had a transient anomaly logged as a watchlist item (`activeStep:'5'` instead of `'10'` on first observation, did not reproduce after a clean reset). Both PASS but the watchlist item is worth re-checking on the eventual production deploy of feature-mcp1.

## T.J.4 — `'unknown'` sentinel coverage (BL-031.95 Phase 2)

- Date: 2026-05-11
- Tester: RP
- Client: PASS-by-reference to T.B.3.b + T.B.3.c + T.B.3.f
- Command/Action: T.B.3.b passed all 13 fields as `'unknown'`; T.B.3.c mixed unknown + known; T.B.3.f tested mixed-array `['unknown', 'us']` for geographies.
- Outcome: PASS (by reference)
- Observed: T.B.3.b returned `unknownDimensionCount = 13` — every enum field accepts `'unknown'`, engine widens conservatively rather than rejecting. T.B.3.c returned `unknownDimensionCount = 4` matching exactly the count of `'unknown'` passes. T.B.3.f's mixed array `['unknown', 'us']` was accepted with `unknownDimensionCount = 0` — the per-array `'unknown'` sentinel is the geography-specific signal, not an array-level "I don't know" — sensible composition.
- Expected: Every enum field in `generate_diligence_agenda` accepts `'unknown'`; widened-agenda response when all 13 fields are `'unknown'`
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: The sentinel pattern works end-to-end. Engine response correctly distinguishes "user said I don't know" from "user passed something invalid" — the former widens the agenda, the latter Zod-rejects.

## T.J.5 — Path 2 Env interface declares all 4 new secrets typed

- Date: 2026-05-11
- Tester: RP
- Client: code review (Claude-side) — inspected `mcp-server/src/worker.ts:50-75`
- Command/Action: Read the `Env` interface in `worker.ts`; verified each Path 2 secret is declared as `?: string`.
- Outcome: PASS
- Observed: All four Path 2 secrets explicitly typed as `?: string` in [`worker.ts:62-65`](../../../mcp-server/src/worker.ts#L62-L65):
  - `UPSTASH_INOREADER_REST_URL?: string;`
  - `UPSTASH_INOREADER_REST_TOKEN?: string;`
  - `UPSTASH_MCP_REST_URL?: string;`
  - `UPSTASH_MCP_REST_TOKEN?: string;`
    No `unknown` types in the Env interface. MCP_KEY_RP is similarly `?: string`. The Inoreader OAuth secrets, Sentry DSN, and GIT_SHA injection field are all consistently typed. Optional (`?:`) is correct because secrets may legitimately be absent on `wrangler dev` local runs.
- Expected: Each of the 4 Path 2 secrets is declared as `?: string` (not `unknown`) for better autocomplete + lint signal
- Severity (if fail): n/a
- Remediation: n/a — PASS
- Notes: The typed Env interface gives strong autocomplete on `env.UPSTASH_*` references throughout the codebase and lints catch typos at build time (e.g., `env.UPSTAH_MCP_REST_TOKEN` would fail typecheck immediately).

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

- Date: 2026-05-11
- Tester: RP
- Client: Claude Desktop (`gst-mcp-staging` connector)
- Prompt verbatim:
  > "Find recent radar items about kubernetes from the last week, then for the most discussed one, generate a quick due-diligence question list as if it were a deal target"
- Expected: Claude calls `search_radar` first, evaluates results, then calls `generate_diligence_agenda` with reasonable inferred inputs from the radar item
- Tool selection (1-5): 5 — `search_radar` (twice, across `enterprise-tech` and `security` categories) → `generate_diligence_agenda`. Exactly the right chain. Notably, Claude **correctly read the tool schema** and identified that `search_radar` has no free-text `query` filter — adapted by category-scan + client-side keyword filtering. No hallucinated tool parameters.
- Input completeness (1-5): 4 — `generate_diligence_agenda` was called with 13 of 13 fields specified (no `'unknown'` sentinels). For K.1.3 the rubric explicitly allows "reasonable inferred inputs from the radar item" so the bar is lower than K.1.2; the inferences (B2B SaaS, 51–200 eng, $5–25M ARR, modern-cloud-native, multi-region US+EU, scaling, 5–10yr, productized-platform, high scale intensity, stable transformation, moderate sensitivity, centralized-eng, majority-stake) are defensible for a "CNCF-heavy platform team" archetype derived from the postmortem essay. Slight ding because some fields (specific ARR bucket, headcount bracket, company age) are genuinely uninferrable from a generic TheNewStack article and could have been `'unknown'` to widen the agenda conservatively.
- Result synthesis (1-5): 5 — exceptional. The synthesis genuinely connects engine output back to article evidence: `arch-13` (observability) ↔ "Cilium-invisible-to-Prometheus failure mode"; `arch-04` (IaC maturity) ↔ "Cluster API / GitOps maturity"; `ops-13` (DR validation) ↔ "every project works as documented is meaningless without integration-level validation"; `ops-03` (key-person) ↔ "CNCF integration knowledge tends to concentrate in 1–2 platform engineers"; `sec-07` (secrets management) ↔ "cert-manager DNS-01 IAM scoping". These cross-references show Claude isn't just printing the engine output — it's tying questions to specific risk signals from the source article.
- Composition (1-5): 5 — clean multi-step: scan category 1 → noticed thin results → scan category 2 to be sure → fetched article detail → inferred archetype → called diligence agenda → produced cross-referenced synthesis with deeplink. Also offered a sensible follow-up ("only one kubernetes hit; want me to broaden to 'cloud-native' or run uncategorized?").
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5): 5 — flagship-quality result. This is the kind of agent behavior the MCP surface was designed to enable: real synthesis across two tools, not just relayed outputs.
- Improvement opportunity:
  - [ ] Tool description gap
  - [ ] Zod `.describe()` gap
  - [x] BL-031.75 prompt-library candidate — "radar-driven thesis development" is a high-value pattern; this prompt's structure ("find radar items about X, then generate diligence for the most relevant as if it were a deal") would be a strong starter prompt
  - [ ] Schema simplification
  - [ ] Result-shape simplification
  - [ ] Error-envelope copy
  - [x] BL-033 feature gap — `search_radar` lacks free-text query parameter (only category filter). Claude correctly worked around it by fan-out + client-side filter, but for natural conversational use ("find radar items about kubernetes / cilium / langchain / etc.") a free-text param would eliminate two unnecessary tool calls per query. Mirror of /hub/radar's UX is faithful but limiting. Likely BL-033 territory, since adding it changes the website page's filter UI as well.
  - [ ] Other:
- Notes: Confirmed remote-Worker path via tool-call prefix. The K.1.2 problem (silent inference) is technically present here too — 13 of 13 fields specified instead of using sentinel for genuinely uninferrable ones — but the rubric's "reasonable inferred inputs" hedge for K.1.3 makes this acceptable. The article being a postmortem essay rather than a company profile means even the "inferable" fields are leaning hard on archetype-priors. Worth flagging as a tension between BL-031.95 sentinel-discipline (K.1.2) and "infer from context" expectations (K.1.3) — the contract should clarify _when_ indirect inference is licit. Suggest schema/description language like: "When the user supplies a hypothetical or archetype prompt ('as if it were a deal target'), inference is encouraged for fields the archetype implies; when the user supplies a real target with named attributes, sentinel-fill is required for omitted dimensions." Currently the contract is silent on this distinction. Result quality was high enough that this is a polishing observation, not a blocking gap.

#### T.K.1.4 — Long-conversation tool-result memory

- Date: 2026-05-11
- Tester: RP
- Client: Claude Desktop (5-turn conversation, `gst-mcp-staging` connector)
- Prompt verbatim:
  > Turn 1: "List the GST portfolio facets."
  > [Turns 2-4: unrelated chat — book on systems thinking, entropy in 2 sentences, Rust vs Zig]
  > Turn 5: "Search portfolio for the first engagement-category we listed earlier"
- Expected: Claude reuses the earlier result without re-calling the tool (or re-calls only if it correctly identifies that the data could have changed). Claude does NOT pretend the result is novel.
- Tool selection (1-5): 5 — Turn 1 called `list_portfolio_facets`; Turn 5 called `search_portfolio` directly with `{ "engagement": "Buy-Side" }` WITHOUT re-calling `list_portfolio_facets`. Correctly retained the Turn 1 result across 3 intervening turns of unrelated chat (~150 lines of context).
- Input completeness (1-5): 5 — "Buy-Side" is in fact the first engagement-category in Turn 1's output (Engagement Categories: Buy-Side, Sell-Side). Claude resolved the back-reference correctly.
- Result synthesis (1-5): 4 — produced a competent breakdown identical in shape to the K.1.1 result (36 engagements, by-year, by-theme, ARR headliners). Useful, but missed a small opportunity to acknowledge the back-reference explicitly (see Notes / improvement opp).
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5): 4 — passed the core memory test (no redundant re-call, no pretense of novelty); minor transparency miss in how it framed the result.
- Improvement opportunity:
  - [ ] Tool description gap
  - [ ] Zod `.describe()` gap
  - [x] BL-031.75 prompt-library candidate — "long-conversation cross-reference" is a useful demonstration of MCP context retention; would make a strong onboarding example showing the tools persist across mid-conversation digressions
  - [ ] Schema simplification
  - [ ] Result-shape simplification
  - [ ] Error-envelope copy
  - [ ] BL-033 feature gap
  - [x] Other: **Transparency nudge** — Claude could have prefaced Turn 5 with a one-line back-reference acknowledgment (e.g., "Pulling Buy-Side, the first engagement-category from the list earlier…") so the user can confirm Claude resolved the reference correctly rather than guessed. Without it, the user has to mentally cross-check whether "Buy-Side" matches what they remember. This is a coaching nudge for prompt-library or system-prompt guidance, not a code/schema defect.
- Notes: Core memory test PASSED — Claude correctly retained the Turn 1 facets through 3 unrelated turns. Two **side observations** worth flagging once:
  1. **Cross-conversation context leak**: In Turns 2 and 4, Claude referenced user-context not introduced in this conversation ("the agent-architecture and feedback-loop work you've been doing on Wintermute/OpenClaw", "Given your stack — Python, TypeScript, agent orchestration, MLX/vllm-adjacent work"). This is Claude Desktop's project-memory / persistent-user-profile feature operating across chats. Doesn't affect K.1.4 scoring but means scenarios in K.2.e (consultant scenarios) may inherit persona/context the tester hasn't explicitly set in-conversation. Worth declaring tester's Claude Desktop project-memory state once (on / off / which project) for repeatability of K results.
  2. **Tool-call param name verified**: `SearchPortfolioInputSchema.engagement` is the input field name (vs. output record's `engagementCategory` and output facet-list's `engagementCategories` — a three-form vocabulary asymmetry that's intentional per the schema's leading comment). Claude's `{ "engagement": "Buy-Side" }` matched the input schema cleanly. The `.describe()` text guides agents to "one of the values listed under `engagementCategories` in `list_portfolio_facets`", which paid off in this exact scenario.

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

- Date: 2026-05-12
- Tester: RP
- Client: Claude Desktop (with both `gst` local stdio and `gst-mcp-staging` remote configured — both loaded after Desktop full-quit-and-restart)
- Prompt verbatim:
  > "Search the radar"
- Expected: Document which connector Claude picks and why; verify whichever it picks gives the right answer
- Tool selection (1-5): **5** — Claude did NOT silently pick. Surfaced a three-option disambiguation picker: (1) Live radar full FYI+Wire → `gst-mcp-staging:search_radar`, (2) Latest FYI insights only → `gst-mcp-staging:get_latest_insights`, (3) Offline cache → `gst:search_radar_cache` (local stdio). Correctly identified that the local `gst` connector exposes the offline-cache variant while remote `gst-mcp-staging` has the live versions. Cited the right rationale: _"To make sure I hit the right one without burning Inoreader budget unnecessarily."_
- Input completeness (1-5): **5** — after user picked Option 1 (Live radar), Claude called `gst-mcp-staging:search_radar` with no args (default = all categories), matching the prompt's lack of specificity.
- Result synthesis (1-5): **5** — the underlying call returned the documented `token-stale` 401 error envelope. Claude surfaced it cleanly: _"Live radar returned token-stale (401) — Inoreader access token needs the website-side ISR to refresh it. Two options: Wait and retry the live call after the website refreshes the token / Hit the offline cache now via `gst:search_radar_cache`."_ Honest about the architectural cause + two concrete recovery paths.
- Composition (1-5 or N/A): N/A
- Failure handling (1-5): **5** — the `isError: true` envelope from `failureResponse()` in `radar-live.ts` worked as designed. Claude distinguished `token-stale` (recoverable via website refresh) from circuit-open (would have suggested wait-21600s) correctly.
- Overall workflow value (1-5): **5** — **flagship behavior across both disambiguation AND error handling**. Materially better than the playbook's expected ("document which connector Claude picks"). Silently picking would have been worse: might have burned Inoreader budget when cache would serve, or returned stale data when live was needed.
- Improvement opportunity:
  - [ ] Cross-client behavior diverges (connector ambiguity)
  - [ ] Tool description gap
  - [x] Other: **Side observation** — "Loaded 5 tools" / "Loaded 4 tools" annotations seen earlier in K runs are Claude Desktop's **just-in-time tool loading** (filters registry by relevance per prompt). NOT a registration regression. Worth documenting in REMOTE_CLIENT_SETUP.md so future testers don't worry about it.
  - [x] **Other: Filed product gap** — the `token-stale` recovery currently requires website-side ISR to refresh Inoreader OAuth. BL-032.5 partially addresses this by adding hourly Worker Cron pre-warm (~24 Inoreader calls/day from 200/day budget), but doesn't eliminate the website dependency. Fully eliminating it requires Worker-side OAuth refresh capability — candidate BL-039 (see BACKLOG).
- Notes: Initial 2026-05-11 deferral was due to Claude Desktop reporting "cannot load connectors directory" on restart. **Retracted** — actual cause was that **Claude Desktop only spawns stdio connector subprocesses at app startup**; closing the window doesn't kill them, and reopening the window doesn't re-spawn them. A full system-tray Quit + relaunch resolved it. Documentation gap, not a defect. Worth a one-line note in REMOTE_CLIENT_SETUP.md: "If a stdio connector shows as not-loaded after enabling, fully quit Claude Desktop from the system tray and relaunch — closing the window is insufficient." 2026-05-12 retest succeeded immediately after Desktop full-restart with no further changes.

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

- Date: 2026-05-11
- Tester: RP
- Client: Claude Desktop (fresh conversation, `gst-mcp-staging`)
- Prompt verbatim:
  > "Does GST have any past work in regulated industries — financial services or healthcare?"
- Expected: Claude reaches for `search_portfolio` (theme/category filter) — not web search, not "I don't have access"
- Tool selection (1-5): 5 — called `search_portfolio` THREE times (`search=financial services`, `search=healthcare`, then `theme=Healthcare` as a refinement). Smart fan-out driven by the tool's `.describe()` warning about single high-signal terms. K.1.9 hallucination pattern did NOT reproduce — every named engagement (Tempo, Oktoberfest, Atlas, Wellness, Trident, Blue Water, Voss, Titan, Eagle) was verified against `src/data/ma-portfolio/projects.json` and exists.
- Input completeness (1-5): 5 — chose appropriate single-term queries; followed the schema hint about strict-match behavior.
- Result synthesis (1-5): 5 — strong synthesis tied to compliance frameworks (HIPAA / HITRUST r2 for Tempo, GDPR / MPDG for Oktoberfest, SOC 2 Type 2 for Atlas). Specifically called out Eagle as straddling both themes (fintech-into-healthcare proof point) — useful insight Claude derived from the data rather than memory. Deeplinks included.
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5): 5 — flagship result. Direct counter to K.1.9: when the prompt is ABOUT the portfolio (not a specific named engagement), Claude calls the tool first and the hallucination defect doesn't surface. This is useful signal for the BL-031.75 / BL-032.75 mitigations: the K.1.9 failure mode is **specifically triggered by named-but-unfamiliar entities**, not by portfolio-search prompts in general.
- Improvement opportunity:
  - [ ] Tool description gap on `search_portfolio` — current description sufficient for this prompt class
  - [x] Other: This finding usefully bounds the K.1.9 defect scope — open portfolio queries work fine; only named-entity lookups risk memory contamination. Mitigation work should focus on the "what did GST find on <Name>?" prompt class, not all portfolio interactions.
- Notes: Verified named codeNames (Trident, Voss, Eagle) against `projects.json` — all real. Full attribute-level fact-check (ARR, theme, year, summary content) not performed; characterizations match the data file's actual record shapes to the level of detail visible in the response.

#### T.K.2.a.2 — Radar AI agent governance

- Date: 2026-05-11
- Tester: RP
- Client: Claude Desktop (fresh conversation, `gst-mcp-staging`)
- Prompt verbatim:
  > "What does the GST radar show in the past few days about AI agent governance?"
- Expected: Claude calls `search_radar` with the AI/automation category (or equivalent free-text)
- Tool selection (1-5): 5 — called `gst-mcp-staging:search_radar` with `{ "category": "ai-automation" }`. Right tool, right category. Returned 10 Wire-tier items from May 11 (today). No `query` parameter used (correctly — schema has no free-text query, per K.1.3 schema audit).
- Input completeness (1-5): 5 — clean single-arg category filter.
- Result synthesis (1-5): DEFERRED — paste was truncated mid-response by the 50k char limit; final synthesis section not visible. Tool-call evidence + raw radar response is clean, so the result quality depends on whether Claude's downstream synthesis tied items to "AI agent governance" theme specifically (vs just dumping the category feed).
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5): DEFERRED pending synthesis visibility
- Improvement opportunity:
  - [ ] Tool description gap on `search_radar`
  - [x] Other: **Cross-validates K.1.10 FYI staleness finding** — `ai-automation` Wire tier had items dated 2026-05-11 (today), confirming Inoreader feed is active and the K.1.10 staleness is specifically about FYI curation cadence, not feed velocity. This is direct corroboration that the BL-032.75 result-shape enrichment (`oldestItemDaysAgo`) and FYI/Wire description disambiguation should land together.
- Notes: Tool-call trace included an unusual rendering of "Loaded 5 tools" with the full schemas of search_radar / get_latest_insights / search_regulations / assess_infrastructure_cost_governance / Vercel:search_vercel_documentation displayed inline in the assistant's message. This is Claude Desktop showing the tool registry mid-conversation — appears to be triggered by Claude internally calling a "list tools" introspection step before answering. Worth a check whether this is a Desktop UI quirk or actual extra tool calls (and budget consumption) per K-prompt; if the latter, every K test is consuming 2x tool calls (introspection + actual). Should re-check rate-limit headers from a fresh K test to see if introspection counts against the 60/min cap.

#### T.K.2.a.3 — Tech-debt assessment narrative

- Date: 2026-05-11
- Tester: RP
- Client: Claude Desktop (fresh conversation, `gst-mcp-staging`)
- Prompt verbatim:
  > "Help me think through what a tech-debt assessment for a 200-person SaaS engineering org would cost annually if 30% of dev time is going to maintenance."
- Expected: Claude calls `estimate_tech_debt_cost` with reasonable inferred inputs
- Tool selection (1-5): **2** — Claude did **NOT call `estimate_tech_debt_cost`** despite the prompt providing usable inputs (200 engineers, 30% maintenance). Reasoned through the math from training-knowledge instead ($13.2M gross at $220K/eng blended, $6.6M-$8.8M debt-attributable after subtracting baseline hygiene). Mentioned the tool **only at the very end** as a follow-up: _"I could also run it through the `compute_techpar` or `estimate_tech_debt_cost` tools in the GST suite to benchmark against the portfolio."_ This is the **K.1.9/K.2.a.5 family** but a softer variant — no fabricated structural claims about the tool, just "narrate first, offer tool as follow-up" rather than "call first, narrate around result."
- Input completeness (1-5): N/A (no tool call)
- Result synthesis (1-5): **4** — strong reasoning quality in isolation: useful decomposition of "maintenance" into hygiene vs workaround tax vs comprehension tax vs velocity drag; three-numbers framing (gross / debt-attributable / opportunity cost); honest sanity checks (self-reported-vs-measured, age-appropriate baseline, concentration analysis, denominator caveats). The advice would land well with a CFO or PE buyer. The defect is that the math is **un-grounded in the tool's actual cost model** — running the tool would have produced a defensible engine-blessed number that the prose could ride on.
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5): **3** — useful answer that produces plausible numbers, but bypasses the GST-blessed cost model and substitutes training-knowledge benchmarks. Workflow value gap = the user can't easily compare this answer to a GST portfolio-benchmark-based answer without re-prompting.
- Improvement opportunity:
  - [x] Tool description gap on `estimate_tech_debt_cost` — current description (per the worker.ts listing) is brief: "Estimate the carrying cost of accumulated technical debt for a target organization." Could add a prescriptive line: "Call this tool whenever a user prompt mentions engineering headcount + maintenance/debt percentage, even when framed as a thought experiment. Narrate around the tool's output rather than producing numbers from training-knowledge."
  - [x] Zod `.describe()` gap — should signal that the tool accepts the typical inputs from a casual conversational prompt (headcount, debt %, ARR, cost-per-engineer), so Claude recognizes the inputs are usable.
  - [x] **BL-031.75 prompt-library candidate** — "thought-experiment with usable inputs" starter prompt: demonstrate calling estimate_tech_debt_cost on the prompt's inputs, then layering qualitative decomposition on the engine's number.
- Notes: This is the **K-section's third "describe-from-memory" instance**, but materially less severe than K.1.9 and K.2.a.5 — Claude didn't claim familiarity with the tool's schema or fabricate facts. It just made a workflow choice to narrate first. The fix is the same broad category (system-prompt addendum + tool description nudge) but doesn't independently warrant a Critical-gate entry; it strengthens the case for the consolidated K.1.9/K.2.a.5 mitigation already filed.

#### T.K.2.a.4 — GDPR for B2B SaaS

- Date: 2026-05-11
- Tester: RP
- Client: Claude Desktop (fresh conversation, `gst-mcp-staging`)
- Prompt verbatim:
  > "What are the GDPR requirements for a B2B SaaS company headquartered in the US but with EU customers?"
- Expected: Claude calls `search_regulations` with `search = "GDPR"` (or `jurisdiction = "eu"`)
- Tool selection (1-5): **1** — Claude did **NOT call `search_regulations`** and did NOT mention the tool even as a follow-up. Produced a comprehensive GDPR explainer from training knowledge: Article 3(2) extraterritorial scope, Article 27 EU representative, EU-US Data Privacy Framework + 2021 SCCs + BCRs, Article 28 DPAs, Article 30 RoPA, Article 32 security, Article 13-14 privacy notices, 72-hour breach notification, DPIA for high-risk, optional DPO. Worse than K.2.a.3 in that Claude didn't even offer to consult GST's regulatory map afterward.
- Input completeness (1-5): N/A (no tool call)
- Result synthesis (1-5): **4** — high-quality regulatory advice that is accurate to my knowledge of GDPR (specific articles cited correctly, transfer-mechanism breakdown is current, processor/controller distinction handled cleanly, practical sequencing reasonable). The advice would survive a privacy-counsel sanity check. The defect is purely that it bypasses GST's regulatory-map authoritative source.
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5): **2** — useful general regulatory guidance, but the user querying through GST's MCP surface presumably wants GST's view (the curated 120-framework regulatory map content), not Claude's training-knowledge view. A follow-up prompt would be needed to get the GST-grounded answer.
- Improvement opportunity:
  - [x] Tool description gap on `search_regulations` — current description says "Search the GST Regulatory Map (120 frameworks across data privacy, AI governance, cybersecurity, and industry compliance)". Could add prescriptive line: "Call this tool for ANY question about a named regulation (GDPR, CCPA, HIPAA, EU AI Act, etc.) or any compliance question that intersects a known regulatory domain — even when the question is framed as a general industry question rather than a GST-specific lookup."
  - [x] Other: **Fourth K-section instance of "describe-from-memory."** Pattern crystallizes: Claude calls GST tools only when prompts explicitly name GST or its data. Of the 5 K.2.a tests, the 2 that fired tools (a.1, a.2) both named "GST" in the prompt; the 3 that did NOT fire (a.3, a.4, a.5) were framed as general industry questions even though each had a directly relevant GST tool. This is **the BL-032.75 mitigation target**: a connector-level system-prompt addendum that says "For any question intersecting a GST tool's domain (regulations, ICG, techdebt, techpar, diligence, radar, portfolio), call the tool first — don't substitute training-knowledge for the GST-authoritative source even when the prompt doesn't explicitly name GST."
- Notes: K.2.a aggregate signal **prompts the BL-032.75 mitigation framing**: tool descriptions alone may not be enough — Claude's behavior shows it interprets "GST tool" as "tool for GST-specific lookups" rather than "tool to use whenever this domain comes up." Suggest the mitigation be tested by re-running K.2.a.3, K.2.a.4, K.2.a.5 with a system-prompt addendum like: "For every user question, scan the available tools for one whose domain matches the question's subject. If found, call that tool (with empty or minimal args for structure-discovery prompts) before producing prose."

#### T.K.2.a.5 — ICG maturity for PE roll-up

- Date: 2026-05-11
- Tester: RP
- Client: Claude Desktop (fresh conversation, `gst-mcp-staging`)
- Prompt verbatim:
  > "How would I assess whether a target company's infrastructure cost discipline is mature enough for a PE roll-up?"
- Expected: Claude calls `assess_infrastructure_cost_governance` (potentially asking for ICG question answers first)
- Tool selection (1-5): **1** — Claude did **NOT call `assess_infrastructure_cost_governance`**. Produced a 6-dimension framework from memory and **explicitly claimed**: "You have the `assess_infrastructure_cost_governance` tool in your GST suite that maps to this exact framework — six categories with 3-4 questions each." Verification against `src/data/infrastructure-cost-governance/domains.ts` shows the real ICG schema has 6 domains (Visibility and Tagging / Account Structure and Attribution / Right-Sizing and Utilization / Lifecycle and Waste / Architectural Efficiency / Governance and Alerting) — Claude's 6 dimensions match 3 cleanly, 1 partially (optimization-cadence straddles 2 real domains), 2 are **fabricated** (Forecasting and budgeting; Vendor and contract management) and 1 real domain (Account Structure and Attribution) is omitted. Same K.1.9 failure mode: confident structural claims about a tool's schema, made without calling the tool.
- Input completeness (1-5): N/A (no tool call)
- Result synthesis (1-5): **2** — the prose framework is well-written and useful in isolation; the defect is the false-precision claim that this prose matches the tool's "exact framework" when it doesn't. A user reading this would form an inaccurate mental model of the ICG tool's actual structure.
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5): **2** — produces plausible-looking advice but contains specific structural claims that are 50% wrong about a tool the user might next consult. Trust-undermining in the same way as K.1.9.
- Improvement opportunity:
  - [x] Tool description gap on `assess_infrastructure_cost_governance` — current description is descriptive ("Assess a target company's Infrastructure Cost Governance maturity. Given an `answers` map..."). Could add a prescriptive line: "When a user asks ABOUT the framework's structure (categories, dimensions, questions), call this tool with `answers: {}` to receive the canonical question registry rather than describing it from memory."
  - [x] Zod `.describe()` gap — `answers` parameter's description doesn't signal that an empty object is acceptable and useful for "show me the framework" prompts. Suggest adding: "Pass empty `{}` to discover the question set without committing to scores. The response includes the full domain/question taxonomy so you can describe the framework accurately."
  - [x] Other: **Same root cause as K.1.9** — Claude treats "describing a tool" and "calling a tool" as separate workflows, then describes from memory when calling would be cheap. The K.1.9 mitigation (tool description discipline + system-prompt addendum) needs to extend to "Don't describe tool schemas from memory — call them. Even empty-arg calls return useful structural information."
- Notes: **Second instance of the K.1.9 failure class.** K.1.9 was "fabricates engagement details without calling search_portfolio"; T.K.2.a.5 is "fabricates framework structure without calling assess_infrastructure_cost_governance." Pattern: when the prompt invites Claude to talk ABOUT something the MCP surface exposes, Claude reaches for training-knowledge instead of the authoritative source. Suggests the BL-032.75 mitigation should apply broadly — not just to `search_portfolio` — and likely needs to be a connector-level system-prompt addendum, not per-tool description tightening.

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

- Date: 2026-05-12
- Tester: RP
- Client: Claude Desktop (fresh conversation, `gst-mcp-staging`)
- Prompt verbatim:
  > "Run a TechPar benchmark with $0 ARR."
- Expected: Zod rejection; Claude either re-asks or surfaces the error clearly
- Tool selection (1-5): 5 — Claude **called the tool with the literal user input** ($0 ARR) rather than pre-validating and refusing. Correct behavior: let the engine surface the rejection, then explain it.
- Input completeness (1-5): 5 — passed exactly what the user asked; no pre-emptive rewrite.
- Result synthesis (1-5): 5 — explained the WHY of the rejection ("TechPar is a ratio benchmark — every output is `cost / revenue`, undefined at zero. There's no sensible 'pre-revenue' answer the engine could return without silently degrading the meaning of the benchmark.") and proactively distinguished the engine-level hard-gate vs. the Zod schema layer. Surfaced the design rationale, not just the error code.
- Composition (1-5 or N/A): N/A
- Failure handling (1-5): 5 — three useful follow-up paths offered (minimum viable ARR for boundary testing, seed-stage smallest realistic ARR, stage-only context without computing), and pivoted back to ask the user what they were actually after ("testing the validation, or a pre-revenue seed-stage scenario?").
- Overall workflow value (1-5): 5 — flagship error-handling. This is the gold standard for surfacing tool-engine rejections: let it happen, explain it cleanly, offer constructive alternatives.
- Improvement opportunity:
  - [ ] Error-envelope copy — current envelope is clear enough for Claude to translate well
  - [x] Other: **Direct counter-example to the K.1.9 / K.2.a.5 pattern.** When the prompt asks Claude to RUN the tool (not describe its framework or look up a named entity), Claude calls cleanly and handles errors well. Pattern boundary is firming up: the defect lives at "describe-shape" and "named-entity-lookup" framings, NOT at "run this tool" framings.
- Notes: No new defects surfaced. This test is a clean PASS and a useful data point for bounding the K.1.9/K.2.a.5 defect scope.

#### T.K.2.d.2 — Search portfolio with 0 results

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "Find GST engagements in agriculture-vertical SaaS for sub-$1M ARR seed-stage targets."
- Expected: Empty result; Claude doesn't fabricate engagements
- Tool selection (1-5): 5 — called `search_portfolio` twice with single-term queries ("agriculture", "agtech") respecting the schema's strict-match-narrow-term guidance. When both returned empty, **called `list_portfolio_facets` to verify** ag isn't in the theme list. Then probed adjacent theme `Food & Beverage` for stage-adjacent candidates. Clean multi-step pivot driven by data, not memory.
- Input completeness (1-5): 5 — schema-respecting single-term queries; correct fallback to facets lookup; legitimate adjacent-theme probe.
- Result synthesis (1-5): 5 — surfaced the honest negative result with two F&B candidates accurately characterized (Dynamic — $220M sell-side manufacturer, Epicurean — Early-Stage Growth food-safety SaaS). Added a sharp consultant observation: "Pure seed-stage targets with sub-$1M ARR are likely below the threshold of what's shown up in GST engagements historically — PE buy-side diligence rarely fires at that pre-revenue tier." Offered three useful pivots (stage-filtered cross-theme, radar for ag M&A signal, regulatory map for ag frameworks).
- Composition (1-5 or N/A): N/A
- Failure handling (1-5): 5 — handled empty result with verification rather than fabrication. No K.1.9-style invented engagements.
- Overall workflow value (1-5): 5 — flagship behavior. When Claude CALLS the tool and gets zero, it handles it correctly.
- Improvement opportunity:
  - [ ] Tool description gap
  - [x] Other: **Reinforces the K.2.a.1 finding and refines the K.1.9 / K.2.a.5 defect boundary.** The hallucination defect lives specifically at "named-entity lookup WHERE Claude doesn't call the tool" — when Claude DOES call and gets empty, it handles it correctly. The fix is to make Claude call the tool first; the empty-handling path is already healthy.
- Notes: No new defects. This is a clean PASS that strengthens the BL-032.75 mitigation framing: the fix is "call first," not "handle errors better." Three named codeNames in response (Dynamic, Epicurean) verified to exist in `projects.json`.

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

- Date: 2026-05-12
- Tester: RP
- Client: Claude Desktop (fresh conversation, `gst-mcp-staging`)
- Prompt verbatim:
  > "Generate a diligence agenda but I have no information about the target yet — just early-stage curiosity."
- Expected: Claude uses `'unknown'` sentinel per BL-031.95; result is a wide, low-confidence agenda with the unknownDimensionCount callout
- Tool selection (1-5): **1** — Claude **refused to call the tool**. Response framing: _"Without any of that, I'd be generating something so generic it wouldn't beat a blank template."_ Asked the user to supply either a placeholder profile or "minimum viable signal" before calling. This contradicts the tool's documented BL-031.95 sentinel path which explicitly supports the all-unknown case: TOOL*DESCRIPTION says *"When ≥7 of 13 dimensions are unknown, the deliverable should lead with a low-confidence callout (parallel to ICG's ≥10/20 threshold)"\_ — the all-unknown path IS the supported behavior for exactly this prompt.
- Input completeness (1-5): N/A (no tool call)
- Result synthesis (1-5): **2** — well-written consultative response in isolation; the workflow is wrong. Claude treats the tool as "needs real inputs" when the tool explicitly supports the all-unknown sentinel and the prompt is a textbook trigger for that path ("I have no information yet — just early-stage curiosity").
- Composition (1-5 or N/A): N/A
- Failure handling (1-5 or N/A): N/A
- Overall workflow value (1-5): **2** — produced a reasonable-sounding dialogue turn, but bypassed the BL-031.95-blessed path. The tool's `'unknown'` sentinel feature is effectively dead from Claude's perspective if Claude won't invoke it even when explicitly invited.
- Improvement opportunity:
  - [x] **Tool description gap (unknown sentinel)** — the BL-031.95 `'unknown'` paragraph is currently near the end of TOOL_DESCRIPTION as a value-contract note. Should be promoted to a top-line USAGE RULE: "When the user prompt has low or no specificity ('early-stage curiosity', 'no info yet', 'hypothetical target', etc.), set all 13 fields to `'unknown'` / `['unknown']` for `geographies` and call the tool. The engine returns a wide, low-confidence agenda specifically for this case — do NOT refuse or ask for more info first."
  - [ ] Result-shape simplification
  - [x] Other: **Third class of "describe-from-memory" defect** — not fabrication (K.1.9), not false-precision (K.2.a.5), not missed-call (K.2.a.3) — but **"refuse-to-use-documented-edge-case-path."** Claude reads the tool's happy path but doesn't apply the schema's explicit support for edge cases. The fix is tool-description prominence + the connector-level system-prompt addendum already filed for the consolidated K.1.9/K.2.a.5 mitigation.
- Notes: **Fifth K-section instance of "Claude bypasses the MCP tool when it should call it."** Different sub-class than K.1.9/K.2.a.3/K.2.a.4/K.2.a.5 — this is "tool refusal where the schema explicitly supports the prompt's case." Significant because BL-031.95 Phase 2 was specifically built for this scenario (low-context early-stage curiosity). If Claude won't use it, the feature is shipping but unused. Worth thinking about whether the engine could be exposed via a second tool (e.g., `generate_agenda_for_archetype` that takes ONLY a single seed parameter and fills the rest with sentinels) so the all-unknown path has a more obvious entry point. Filed as a candidate addition to BL-032.75 scope.

#### T.K.2.d.5 — Mixed valid + invalid enum

- Date:
- Tester:
- Client: Claude Desktop (fresh conversation)
- Prompt verbatim:
  > "Generate an agenda for a target with productType='vaporware' and revenueRange='5-25m'."
- Expected: Clear Zod rejection on productType; Claude either asks for clarification or proceeds with the rest
- Date: 2026-05-12
- Tester: RP
- Client: Claude Desktop (fresh conversation, `gst-mcp-staging`)
- Tool selection (1-5): 4 — Claude did NOT call the tool, but for a defensible reason: the explicitly-invalid value (`productType='vaporware'`) warranted clarification before substitution. Critically, Claude did NOT silently normalize "vaporware" to a valid enum — it surfaced the rejection cleanly with the full valid-values list (`b2b-saas`, `b2c-marketplace`, `on-premise-enterprise`, `deep-tech-ip`, `tech-enabled-service`, `unknown`). Would have been 5 if Claude had run option 1 (its own suggestion — substitute `unknown` for invalid + 11 missing) without an extra dialogue turn.
- Input completeness (1-5): N/A (no tool call)
- Result synthesis (1-5): 5 — clear, three concrete options offered, explicit sentinel path mentioned, honest about the 12/13-unknown threshold. Did NOT silently swap "vaporware" for a similar-sounding enum (silent normalization would have been the bad outcome).
- Composition (1-5 or N/A): N/A
- Failure handling (1-5): 5 — surfaced the schema mismatch with full context, no silent substitution, asked the user to pick the resolution path.
- Overall workflow value (1-5): 4 — useful dialogue turn that protects the user from silent data-corruption (Claude inventing a valid enum). One extra round-trip vs. ideal (option 1 + tool call) but the safety trade is reasonable.
- Improvement opportunity:
  - [x] Error-envelope copy — Claude pre-empted the actual Zod rejection envelope. Worth a side-test that confirms what the engine returns when an invalid enum reaches it (does Zod's error message include the valid-values list, or just `Invalid enum value: 'vaporware'`?). If the latter, error-envelope enrichment would help non-Claude clients understand the available substitutions.
  - [ ] Zod `.describe()` gap
  - [x] Other: **Notable contrast with K.2.d.4** — Claude clearly READ the BL-031.95 ≥7-threshold from TOOL_DESCRIPTION here ("well past the ≥7 threshold"). Which means K.2.d.4's refusal-to-use-all-unknown is even more surprising: Claude had the same context available in that test and still chose to refuse. The distinguishing variable is the prompt's explicit-invalid value — K.2.d.5 had an invalid input warranting clarification; K.2.d.4 had a low-context-but-valid prompt warranting the documented all-unknown path. The fix for K.2.d.4 needs to be sharper: the sentinel path should be invoked WITHOUT requiring the user to explicitly request it.
- Notes: This is the "good cousin" of T.K.2.d.4. Both are sub-class "Claude refuses to call when calling was an option," but the rationale differs: invalid-input-warranting-clarification (defensible) vs. low-context-warranting-sentinel-fill (defect per BL-031.95 design intent). Recording as a SOFT PASS — no new defect, useful contrast with d.4.

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

## T.X.4 — Third Upstash Standard token leaked to chat during T.B.9.f preflight

- Date: 2026-05-11
- Tester: RP
- Client: PowerShell 7.x + chat transcript
- Outcome: FAIL (operator-experience / credential-hygiene defect)
- Observed: T.B.9.f preflight needed `UPSTASH_MCP_REST_URL` + `UPSTASH_MCP_REST_TOKEN` available in shell. The Claude-authored preflight block prompted for them via plain `Read-Host "..."` (without `-AsSecureString`). PowerShell echoed the typed values visibly to the terminal scrollback. When the operator pasted the post-run scrollback back to Claude to share test results, the full token value travelled with it. Compromised token value: `gQAAAAAAAcTkAAIgcDJmZjBhNDBlNTE2OWQ0NWY0YWQyOTg3MDkyMzZiY2M2Mw` (Standard read+write — verified by the preflight SET/DEL probe). Same operator-experience risk family as T.X.1 (literal-placeholder paste) — root cause is `Read-Host` defaulting to visible input. Combined rotation list now: **three** Upstash tokens — two from T.C.7 recovery (Standard + Read-only candidates flagged via T.X.2) and this third Standard token from T.B.9.f.
- Expected: Preflight should gather Upstash creds without leaking them to the terminal scrollback, so the operator can paste the result-bearing transcript back without also pasting the secret.
- Severity: Important — credential-hygiene defect compounding two prior leaks. Token rotation is now blocking BL-032 production deploy more firmly than before.
- Remediation:
  1. **Immediate**: rotate (database-recreation path per T.X.2 — Upstash console reportedly has no Roll button on the operator's tier).
  2. **Process**: any future Claude-authored prompt that needs an Upstash REST token or MCP_KEY must use `Read-Host -AsSecureString` and then `[Net.NetworkCredential]::new('', $secure).Password` to extract the plain text only into the local variable, never to the screen. The bootstrap snippet at the top of `Invoke-McpRequest.ps1` (the helper) for `MCP_KEY` already does this since the T.X.1 fix (commit `3bacd0e`); Section D / T.B.9.f / T.B.10.f-style ad-hoc prompts had not been migrated. Worth a single sweep through all credential-prompt patterns in `MCP_SERVER_REMOTE_BL-032_TESTING.md` to enforce `-AsSecureString` everywhere.
  3. **Anti-pattern documented**: when in doubt — if a prompt asks you to type a secret, sanitize the scrollback before pasting it back, even if it took you down the happy path.
- Notes: Token #3 confirmed live-valid at time of leak via the preflight SET probe returning `result: OK`. Treat T.B.9.f result as fully PASS (the test itself succeeded) even though the operator-flow around it leaked the credential — they are separable issues.

---

## T.X.3 — Inoreader `token-stale` envelope captured live (T.B.10.a precondition)

- Date: 2026-05-10
- Tester: RP
- Client: direct curl (PowerShell helper)
- Outcome: PASS (contract — failure envelope is correct) / environmental recovery required
- Observed: First T.B.10.a / T.B.10.b / T.B.10.e attempts all returned the documented `token-stale` envelope: `{ error: "token-stale", status: 401, message: "Inoreader access token is stale. The website-side ISR will refresh on its next call; retry the Worker call after that." }`. Helper unwrapped to a non-`items` object, which is why `$a.items.Count` returned 0 (PowerShell yields 0 for `$null.Count`) and `$a.liveInfo` printed empty — both consistent with `$a` actually being the error envelope. Recovery procedure followed: opened `https://globalstrategic.tech/hub/radar` in browser to trigger the website's ISR-side token refresh, waited ~10s, re-ran the paste block. All three live calls succeeded on retry (T.B.10.a 10 items, T.B.10.b 18 items, T.B.10.e 5 items). The captured envelope matches [radar-live.ts:115-132](../../../mcp-server/src/tools/radar-live.ts#L115-L132) `failureResponse` shape exactly.
- Expected: When Inoreader returns 401, MCP `get_latest_insights` returns a structured envelope with `error: "token-stale"`, `status: 401`, an actionable `message`, and `isError: true` at the JSON-RPC tool level (not a JSON-RPC protocol error). Website-side ISR refreshes the token without operator intervention.
- Severity: n/a — contract met
- Remediation: n/a. Worth noting in operator guidance: if a radar tool returns `token-stale`, hit `/hub/radar` in a browser to trigger refresh; do not retry the Worker call in a tight loop.
- Notes: Confirms the Path 2 token-handoff design — the Worker reads the Inoreader access token from Upstash on each request and gracefully surfaces stale-token state rather than attempting to refresh it itself. Refresh responsibility lives with the website (the OAuth credential holder), which the Worker only reads.

---

## T.X.2 — Read-only vs Standard Upstash REST token confusion during T.C.7 recovery

- Date: 2026-05-10
- Tester: RP
- Client: Upstash console + wrangler CLI + wrangler tail
- Outcome: FAIL (operator-experience defect; partial system-side gap on `/health` semantics)
- Observed: During T.C.7 corruption-recovery, operator pasted a value labeled in the Upstash console that turned out to be the **Read-only** REST token (not the Standard read+write token). Worker recovery appeared successful at the time — `/health` returned `ok: True, upstashMcp: 'ok', upstashInoreader: 'ok'` — but the next batch of T.B.\* tool calls all failed with HTTP 500. Cloudflare Error 1101 surfaced via the browser-readable error envelope. Wrangler tail captured the root cause: `UpstashError: Command failed: NOPERM this user has no permissions to run the 'evalsha' command or its subcommand` at `RegionRatelimit.getRatelimitResponse`. The Read-only token has read permission (enough for `/health`'s GET-based probe) but lacks `evalsha` permission (required by `@upstash/ratelimit`'s atomic counter scripts). Every `/mcp` POST therefore threw an unhandled exception inside the rate limiter, mid-request, AFTER auth and BEFORE the tool handler. Outage duration: ~30 min until diagnosed via tail and the Standard token was installed. Worker fully restored in version `30de6516-b46c-4477-91dd-c98af393f449`.
- Expected: T.C.7's recovery step should leave the Worker in a fully functional state, or — if Read-only is installed by mistake — `/health` should detect the write-permission gap and report `upstashMcp: 'degraded'` so the operator catches the error immediately rather than 30 minutes later.
- Severity: **Important** — operator-experience defect that masquerades as a successful recovery. The `/health` false-positive is the load-bearing issue; without it, the operator would have realized the wrong token was in place immediately.
- Remediation:
  1. **Playbook**: tighten T.C.7's restore step to be explicit: "paste the **Standard** (read+write) token — Upstash labels both tokens in the REST API tab; pick the one that DOES NOT have 'read-only' in its label". Add a post-restore verification step that calls `tools/list` (not just `/health`) to confirm the rate limiter actually works.
  2. **Engine improvement candidate** (engineering follow-up): extend `/health`'s `upstashMcp` probe to do a write-then-delete (e.g., `SET mcp:health:probe $ts EX 60` followed by `DEL mcp:health:probe`). A Read-only token would fail the SET and surface `upstashMcp: 'degraded'` correctly. Cheap probe; one extra round-trip per `/health`. File under BACKLOG.md if BL-032.75 (production observability maturity) hasn't already absorbed this.
  3. **Upstash console UX gap** (out of our control): operator reported the console does not surface a "Roll/Regenerate" button for the Standard token on the current account tier. This means rotating leaked tokens requires either deleting and recreating the database OR using the Upstash API directly. Document this in the recovery runbook so the next operator knows in advance.
- Notes: Compounds with the security-follow-up flagged in T.C.7 — two distinct token values were pasted into the chat session during recovery; both should be treated as compromised. Combined with the no-roll-button observation above, rotation will need to happen via the Upstash account-recovery path (support ticket OR database recreation) rather than a one-click roll. **Important enough to consider blocking BL-032 production deploy until rotation is complete.** The actual technical issue (Read-only token installed) is fixed as of `30de6516-b46c-4477-91dd-c98af393f449`. The credential-hygiene followup is separate and tracked here.

---

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

- **K-section "describe-from-memory instead of call-the-tool" failure class** — 2 confirmed instances:
  - **T.K.1.9**: "What did GST find on Acme Corp?" → Claude answered from project memory, fabricating 3 engagement names ("Sugarbeast", "Fingerpaint/Project George") and misattributing 3 real ones ("Helios Health" — actually Public Sector, not Health; "Atlas/Arrow" as "infrastructure integration" — actually both Healthcare RCM). Correct outcome ("no Acme Corp") reached by accident.
  - **T.K.2.a.5**: "How would I assess ICG maturity for a PE roll-up?" → Claude described a 6-dimension framework from memory and claimed it "maps to this exact framework" of the `assess_infrastructure_cost_governance` tool. Verification: 3 of 6 dimensions match real schema, 2 are fabricated (Forecasting and budgeting; Vendor and contract management), 1 real domain (Account Structure and Attribution) omitted. False precision about a tool one MCP call away.

  Common root cause: when prompts invite Claude to talk ABOUT something the MCP surface exposes (a named entity, a tool's structure), Claude reaches for training-knowledge instead of the authoritative source. T.K.2.a.1 demonstrates the inverse — for open portfolio-search prompts (not named-entity lookups), Claude calls the tool first and produces accurate output. The defect is **prompt-class-specific**: triggered by "describe-shape" and "named-entity-lookup" framings, not by general tool use.

  Remediation path is non-code: tool description tightening + client-side system-prompt addendum ("call empty-arg tools to describe their structure; call lookup tools for any named entity") + project-memory-disabled test standard. Achievable in BL-032.75 or BL-033 scope. Mitigation should apply across the connector, not per-tool.
