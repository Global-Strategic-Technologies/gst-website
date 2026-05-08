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

Copy-paste this block per finding. Date format is ISO-8601. Tester is initials (e.g., `RP`).

```
## T.<section>.<n> — <short title>
- Date: YYYY-MM-DD
- Tester: <initials>
- Client: <Claude Desktop | Claude Code (.mcp.json) | direct curl | wrangler tail>
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

## T.A.5 — Wrong token value rejected with 401 + bearer-rejected reason

- Date: 2026-05-07
- Tester: RP
- Client: direct curl (PowerShell 7 `Invoke-WebRequest` via `Invoke-McpRequest` helper)
- Outcome: PASS
- Observed: `Authorization: Bearer <45-char non-matching value>` against staging returned `HTTP 401 Unauthorized`, `Content-Type: application/json`, body `{"error":"unauthorized","message":"Invalid Bearer token"}`. No 5xx, no 403.
- Expected: 401, reason = `bearer-rejected`, NOT 403.
- Notes: Captured incidentally while debugging T.A.1 setup (see T.X.1) — the operator had pasted the literal placeholder string from the playbook setup snippet instead of a real token. The Worker correctly distinguished "wrong-value" from "missing-header" — body says `"Invalid Bearer token"`, not `"Missing Authorization header"` (T.A.2's expected message), confirming the auth code differentiates the two failure modes.

## Section B — Tool execution (10-tool surface)

_No findings logged yet._

## Section C — Rate-limit & circuit-breaker

_No findings logged yet._

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
