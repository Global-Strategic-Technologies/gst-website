# BL-032.5 — Soak Testing Findings Log

> **Purpose**: operator log for outcomes of scenarios executed against the BL-032.5 staging soak. One block per finding, append-only within a soak window.
>
> **Companion**: [`MCP_SERVER_REMOTE_BL-032_5_TESTING.md`](MCP_SERVER_REMOTE_BL-032_5_TESTING.md) — scenario catalogue, test ID convention, expected outcomes. Read that doc first for any test ID's setup and pass/fail criteria.
>
> **Soak window opened**: 2026-05-13. This file was created alongside the Phase 4 commit on `feature-mcp2` as the persistent notebook for the BL-032.5 verification cycle and any subsequent re-runs after future substrate changes.

---

## How to use this file

1. Pick a scenario from the [playbook](MCP_SERVER_REMOTE_BL-032_5_TESTING.md), execute it, and append a finding block (template below) under the matching section heading.
2. Use the **exact test ID** from the playbook (`T.<section>.<n>`) so cross-doc references stay decodable. If you exercise an unlisted scenario, file it under § Ad-hoc / unscheduled and assign a fresh ID like `T.Y.<n>` (where `Y` is a section letter not in the playbook).
3. **PASS outcomes are worth logging too** — they're the regression evidence future runs check against. A terse PASS block (date, tester, "PASS — matches expected") is enough.
4. **FAIL or INCONCLUSIVE outcomes** must include severity and a remediation pointer (issue link, commit SHA after fix, or `deferred — track in BACKLOG.md` with rationale).
5. Once a finding is resolved (commit SHA referenced), do **not** delete the block — strike through the title (`~~T.X.n — title~~`) and add a `Resolved:` line.

---

## Recommended one-shot batch run

For the post-deploy smoke test, the PowerShell batch runner exercises every scenario in sections **C / W / H / M** in one command:

```powershell
cd c:\Code\gst-website\mcp-server
$env:MCP_URL = 'https://mcp-staging.globalstrategic.tech'
. .\scripts\Invoke-McpRequest.ps1      # bootstraps MCP_KEY via Read-Host -AsSecureString
.\scripts\Test-Bl0325.ps1              # prints a PASS/FAIL/SKIP table

# To capture for findings:
.\scripts\Test-Bl0325.ps1 -OutFile findings-batch-$(Get-Date -Format 'yyyy-MM-dd-HHmm').txt
```

Sections **X (Cron)** and **K (Claude workflow consumption)** still need operator-initiated steps — those live as manual blocks below.

---

## Findings template

Copy-paste this block per finding. Date format is ISO-8601. Tester is initials.

```
## T.<section>.<n> — <short title>
- Date: YYYY-MM-DD
- Tester: <initials>
- Client: <Claude Desktop | Claude Code | Test-Bl0325.ps1 | wrangler CLI | curl | Upstash REST UI | other>
- Command/Action: <exact command or operator action — quote from playbook "How to run">
- Outcome: PASS / FAIL / INCONCLUSIVE / SKIP
- Observed: <what actually happened, terse>
- Expected: <what was supposed to happen — quote from playbook column>
- Severity (if fail): Critical / Important / Minor / Cosmetic
- Remediation: <issue link, commit SHA, or "deferred — track in BACKLOG.md">
- Notes: <anything else worth recording — surprising context, env details>
```

---

## Section C — Resource cache

_(no findings logged yet — populate during the soak)_

---

## Section W — Radar Resources on Worker

_(no findings logged yet)_

---

## Section X — Worker Cron

_(no findings logged yet)_

---

## Section H — `/health` extension

_(no findings logged yet)_

---

## Section M — Manifest-hash stability

_(no findings logged yet)_

---

## Section K — Claude workflow consumption

_(no findings logged yet — these are the highest-signal end-to-end findings; prioritize at least one)_

---

## Section Y — Ad-hoc / unscheduled

For scenarios not in the playbook that surface during operator usage. Assign fresh `T.Y.<n>` IDs.

_(none filed yet)_

---

## Soak closure

When the soak window closes (typically after the production deploy lands and a one-week post-deploy review passes), summarize the outcomes here. Any unresolved P1 items get re-filed under a new BL-032.5-style close-out bucket (mirroring the BL-032.25 pattern) or under successor initiatives.

_(soak still open as of 2026-05-13)_
