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

### T.C.3 — Cached body byte-identical to fresh compute

- Date: 2026-05-13
- Tester: RP
- Client: Invoke-McpRequest.ps1
- Command/Action: Two consecutive `resources/read` for `gst://library/vdr-structure`, 200ms apart, comparing `.result.contents[0].text`
- Outcome: PASS
- Observed: both reads returned 16215-byte bodies; `bodies equal: True`
- Expected: bodies identical
- Notes: Confirms the `readThroughCache` wrapper is transparent to the client — whether the second read hit Upstash or recomputed, the body shape and bytes are identical. The hit/miss signal lives in `wrangler tail` (`resource_cache_hit` / `resource_cache_miss` events) — T.C.1/T.C.2 verify that signal with live tail observation.

### T.C.4 — Cache wrapper transparent to error paths

- Date: 2026-05-13
- Tester: RP
- Client: Invoke-McpRequest.ps1
- Command/Action: `resources/read` on `gst://library/__not-a-real-slug__` (a deliberately invalid URI)
- Outcome: PASS
- Observed: JSON-RPC error envelope returned at HTTP 200: `{ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "MCP error -32602: Resource gst://library/__not-a-real-slug__ not found" } }`
- Expected: JSON-RPC error envelope (NOT a cached success body)
- Notes: **Surfaced a test-framing defect in `Test-Bl0325.ps1`** — the original T.C.4 scriptblock relied on `try/catch` around `Invoke-McpRequest`, but JSON-RPC errors come through as HTTP 200 + `.error` envelope (per MCP spec), so the catch branch never fired and the test would have FAILED with "UNEXPECTED: got success response" against a correctly-behaving server. **Fixed in-session**: rewrote the scriptblock to inspect `$resp.error.code` (must be negative) and `$resp.error.message` (must match library/not-found/unknown). The cache substrate itself was always correct — `readThroughCache` only memoizes on successful compute, so unknown-URI throws are never cached.

---

## Section W — Radar Resources on Worker

### T.W.3 — `gst://radar/fyi/latest` returns populated body

- Date: 2026-05-13
- Tester: RP
- Client: Invoke-McpRequest.ps1
- Command/Action: `(Invoke-McpRequest -Method 'resources/read' -Params @{ uri = 'gst://radar/fyi/latest' }).result.contents[0].text | ConvertFrom-Json`
- Outcome: PASS
- Observed: `tier=fyi, itemCount=18, lastSeededAt=2026-05-13T16:12:35Z (UTC), firstTitle="Claude Opus 4.7 arrives with better vision, memory, and instruction-following"`
- Expected: `tier:'fyi'`, recent `lastSeededAt`, `itemCount >= 1`, non-empty items
- Notes: Verified after applying the T.Y.2 token-stale recovery procedure. Real Inoreader-sourced data confirmed (titles match current AI-industry coverage). The Phase 3 SnapshotReader → Worker live-store path is fully functional.

### T.W.4 — `gst://radar/wire/latest` returns populated body

- Date: 2026-05-13
- Tester: RP
- Client: Invoke-McpRequest.ps1
- Command/Action: same shape as T.W.3 with `uri='gst://radar/wire/latest'`
- Outcome: PASS
- Observed: `tier=wire, itemCount=58, lastSeededAt=2026-05-13T16:12:36Z, firstTitle="Anthropic courts a new kind of customer: small business owners"`
- Expected: `tier:'wire'`, `itemCount >= 1`
- Notes: Wire tier has ~3× the FYI count (58 vs 18), consistent with BL-031 design — Wire is broader market coverage; FYI is curated PE/M&A-relevant items.

### T.W.5 — Wire category URIs filter correctly

- Date: 2026-05-13
- Tester: RP
- Client: Invoke-McpRequest.ps1
- Command/Action: Iterated `gst://radar/wire/{pe-ma,enterprise-tech,ai-automation,security}` and counted items whose `category` field didn't match the URI segment
- Outcome: PASS
- Observed:
  - `pe-ma: itemCount=15, wrongCategory=0`
  - `enterprise-tech: itemCount=15, wrongCategory=0`
  - `ai-automation: itemCount=15, wrongCategory=0`
  - `security: itemCount=13, wrongCategory=0`
- Expected: every item's `category` matches the URI's category segment (or empty list)
- Notes: All 4 categories filter correctly — 0 items with wrong category in any tier. Counts add to 58 = matches Wire total from T.W.4. Confirms the per-category radar reader's filter logic is intact across the SnapshotReader → Worker live-store refactor.

### T.W.1 — `resources/list` exposes 6 radar URIs

- Date: 2026-05-13
- Tester: RP
- Client: Invoke-McpRequest.ps1
- Command/Action: `(Invoke-McpRequest -Method 'resources/list').result.resources | Where-Object { $_.uri -like 'gst://radar/*' } | Measure-Object`
- Outcome: PASS
- Observed: `Count = 6`
- Expected: count = 6
- Notes: Confirms Phase 3 transport-portable Resources registration succeeded — radar Resources are now served by the Worker (previously stdio-only).

### T.W.2 — Radar URIs match canonical list

- Date: 2026-05-13
- Tester: RP
- Client: Invoke-McpRequest.ps1
- Command/Action: same as T.W.1, with `Select-Object -ExpandProperty uri | Sort-Object`
- Outcome: PASS
- Observed:
  ```
  gst://radar/fyi/latest
  gst://radar/wire/ai-automation
  gst://radar/wire/enterprise-tech
  gst://radar/wire/latest
  gst://radar/wire/pe-ma
  gst://radar/wire/security
  ```
- Expected: exact set `{fyi/latest, wire/latest, wire/pe-ma, wire/enterprise-tech, wire/ai-automation, wire/security}`
- Notes: URI-stability invariant intact — no drift since the BL-032 baseline. Manifest hash (T.M.1) covers this discipline at CI time too.

---

## Section X — Worker Cron

### T.X.2 — Cron handler fired naturally at 16:00 UTC (graceful upstream-failure path)

- Date: 2026-05-13
- Tester: RP
- Client: curl /health + Invoke-McpRequest resources/read
- Command/Action: Observed `/health` and `gst://radar/fyi/latest` at 16:01:44 UTC, ~50s after natural Cron tick
- Outcome: **PASS for the Cron mechanism / FAIL for the desired outcome** — the Cron handler ran successfully (proven by `inoreaderObservedAt: "2026-05-13T16:00:54.491Z"` matching the 16:00 UTC tick + 54s for the Inoreader call), but Inoreader returned an error so the cache was NOT populated. `gst://radar/fyi/latest` still returns the snapshot-missing error envelope.
- Expected: tail shows `cron.radar-refresh.success` with wireItems/fyiItems counts; cache populated
- Observed: `/health` returned `ok: false, inoreader: "degraded", inoreaderObservedAt: "2026-05-13T16:00:54.491Z", radarSnapshotAgeSeconds: null`. The Cron classified the upstream failure as `degraded` and refused to write empty/garbage data to cache — exactly the documented Phase 4 contract.
- Severity: Important (not Critical — Cron mechanism is verified working; the failure is at the upstream Inoreader/token layer, recoverable via the `REMOTE_CLIENT_SETUP.md` § token-stale procedure)
- Remediation: Apply token-stale recovery (see T.Y.2 below). Re-verify after recovery + next radar Tool call to confirm cache populates and `/health` flips to `ok: true`.
- Notes: This is **graceful upstream-failure handling working correctly** — the Phase 4 Cron handler distinguished "Inoreader degraded" from "code defect" and bailed without corrupting state. The same code path would pass T.X.2's strict success criteria once Inoreader is healthy. Crucially: no crash, no partial writes, no incorrect status — the system degraded safely.

### T.X.1 — Cron trigger registered in wrangler.toml

- Date: 2026-05-13
- Tester: RP
- Client: Cloudflare dashboard + wrangler deploy log
- Command/Action: Inspected Cloudflare dashboard → Workers & Pages → gst-mcp-staging → Settings → Trigger Events
- Outcome: PASS
- Observed: dashboard shows `Type: Cron`, `Handler: scheduled()`, `Details: 0 * * * *`, `Schedule: Every hour`, `Next: Wed, 13 May 2026 16:00:00`. `wrangler deploy --env staging` output also confirmed `Deployed gst-mcp-staging triggers ... schedule: 0 * * * *`.
- Expected: trigger registered, `cron: 0 * * * *`
- Notes: Current Cloudflare dashboard UI does NOT expose a "Send test event" button for Cron Triggers (only "View events" for past runs). Manual Cron testing requires either (a) `wrangler dev --test-scheduled` locally or (b) waiting for the natural top-of-hour tick. T.X.2 will be verified at the 16:00 UTC natural tick.

---

## Section H — `/health` extension

### T.H.1 — `/health` includes `radarSnapshotAgeSeconds`

- Date: 2026-05-13
- Tester: RP
- Client: curl
- Command/Action: `curl -s https://mcp-staging.globalstrategic.tech/health`
- Outcome: PASS
- Observed: payload includes `radarSnapshotAgeSeconds: null`; `gitSha: "be942a8"` matches HEAD on `feature-mcp2`; `upstashMcp: "ok"`, `upstashInoreader: "ok"`, `inoreader: "unknown"` (no traffic since cold deploy), `phase: "BL-032 Phase 5 (observability)"`.
- Expected: field exists; value is `null` (cold deploy, pre-Cron) or a non-negative integer
- Notes: First check after `wrangler deploy --env staging` of version `7e53b0b0-191d-45bf-b22c-081c27f0b0e1`. Cron hadn't fired yet, so `null` is the correct value. Re-verify after T.X.2 — the field should become a small number (<30s).

---

## Section M — Manifest-hash stability

### T.M.1 — manifest-stability test passes on the deployed branch

- Date: 2026-05-13
- Tester: RP
- Client: vitest (npm test)
- Command/Action: `cd mcp-server && npx vitest run tests/integration/manifest-stability.test.ts`
- Outcome: PASS
- Observed: `Test Files  1 passed (1) / Tests  3 passed (3)` — 377ms total. No drift from the canonical hash `2d155d19ea7a2e37f29a2c405cb65c2f18def7f5adc5968550f02348a117b6a0` recorded in `BREAKING_CHANGES.md`.
- Expected: one line `✓ manifest-stability hash`; no errors
- Notes: The discipline is enforced at CI time, not at runtime — this test is also part of the full `npm test` suite (490/490 pass). It guards against accidental URI rename, prompt-name drift, or prompt-version bump without a corresponding BREAKING_CHANGES.md entry.

---

## Section K — Claude workflow consumption

### T.K.1 — Pin `gst://library/vdr-structure` in Claude Desktop staging

- Date: 2026-05-13
- Tester: RP
- Client: Claude Desktop (MSIX install, gst-mcp-staging connector via mcp-remote bridge)
- Command/Action: Fresh conversation; pinned `gst://library/vdr-structure` via `+ → Add from gst-mcp-staging → Resources`; prompted "Using only the pinned Resource (not your general VDR knowledge), give me a 5-bullet summary..."
- Outcome: PASS
- Observed: Claude read the Resource, returned a summary grounded in actual document content (not general VDR knowledge). No errors. Cited specific section heading verbatim.
- Expected: Resource read; summary specific to the article; quoted heading exists in source
- Notes: Confirms the Phase 1 server-side Resource cache + Phase 3 transport-portable Library Resource paths work end-to-end through Claude Desktop's mcp-remote bridge against staging. First-read latency subjectively < 1s.

### T.K.2 — Pin `gst://radar/fyi/latest` in Claude Desktop staging

- Date: 2026-05-13
- Tester: RP
- Client: Claude Desktop (MSIX install, gst-mcp-staging connector)
- Command/Action: Fresh conversation; pinned `gst://radar/fyi/latest`; prompted "Using only the pinned radar snapshot, what's the single most relevant item to a Series-B SaaS PE deal in the European market right now? Quote the item title verbatim. Also tell me when the snapshot was last refreshed."
- Outcome: PASS
- Observed: Claude quoted the specific item title verbatim ("Main Capital invests in insurtech firm Agenium"); reasoned cross-jurisdictionally (filtered out US-based items, non-SaaS European items, out-of-stage targets); quoted lastSeededAt as `2026-05-13T16:12:36.096Z` (matches T.W.4 observation exactly, just with millisecond precision PowerShell stripped during ConvertFrom-Json). Voice was claim-first / direct / specific, consistent with GST Take if system-prompt addendum is enabled.
- Expected: Claude reads the snapshot, references specific items by title, lastSeededAt within Cron-tick window
- Notes: **Highest-signal verification in the whole soak** — proves the full Phase 1-4 stack (Phase 1 cache + Phase 3 radar SnapshotReader + Phase 4 Cron-populated cache) delivers actionable PE/M&A intelligence to Claude Desktop pinned-Resource workflows. Caveat from T.Y.3 still applies: this works only because the cache is fresh; if the Cron stops refreshing (token-stale), this same prompt would return snapshot-missing.

---

## Section Y — Ad-hoc / unscheduled

For scenarios not in the playbook that surface during operator usage. Assign fresh `T.Y.<n>` IDs.

### T.Y.3 — **CRITICAL: Worker Cron token-refresh dependency on human page-visits**

- Date: 2026-05-13
- Tester: RP
- Severity: **Critical — blocks production deploy until mitigated**
- Surfaced by: T.Y.2 token-stale recovery showed that the Worker Cron's autonomy is undermined by the Q4 invariant (website is sole refresh-writer for `inoreader:access_token`)
- The defect (architectural, not code-level):
  - Worker Cron runs hourly autonomously
  - Inoreader OAuth token expires periodically (hours/days)
  - Website's `/hub/radar` ISR refreshes the token, but **only when a human visits the page**
  - If `/hub/radar` is unvisited for the token-lifetime window, the token expires
  - All subsequent Cron ticks fail → radar Resources return snapshot-missing → MCP clients see degraded radar
- Why this is more painful than the BL-032 (Tools-only) state:
  - BL-032 Tools fall through to Inoreader on cache-miss — a Tool call refreshes the cache (and indirectly exercises the token path enough to surface staleness)
  - BL-032.5 Resources DO NOT fall through — they serve from cache or return snapshot-missing. The Cron is the only thing keeping Resources fresh. If the Cron is broken, the Resources go cold and clients see snapshot-missing
- Mitigations (pick one before production deploy):
  1. **Ship BL-039 (Worker-as-refresh-writer) first** — canonical fix per the existing roadmap (`REMOTE_CLIENT_SETUP.md` references this); gives the Worker authority to refresh the token autonomously. Estimated ~1 week of work
  2. **Add a website-side scheduled cron** that refreshes the Inoreader token periodically (independent of user page-visits). Estimated ~1 day; lives entirely on the Vercel side; preserves the Q4 single-writer invariant
  3. **Document the operational dependency** in `REMOTE_CLIENT_SETUP.md` § token-stale and add a Sentry alert that fires when `/health` shows `inoreader: 'degraded'` for >2 consecutive Cron ticks — operator manually visits `/hub/radar`. This is "live with the gap" with monitoring; least work but worst UX
- Remediation: discuss with project lead before production deploy. **Do NOT promote BL-032.5 to production without addressing this** — the substrate is fine, but the operational guarantee that radar is "always fresh" is currently false. File as a new BACKLOG.md item if BL-039 is not the right priority; otherwise promote BL-039 to must-ship-before-prod.
- Notes: The Phase 4 Cron handler is doing exactly the right thing (detect degraded → don't write garbage). The gap is at the architecture boundary, not the code. This finding does NOT invalidate the Phase 1-4 substrate — every other test passed.

### T.Y.2 — Inoreader token-stale at first staging Cron tick (recoverable, not a substrate defect)

- Date: 2026-05-13
- Tester: RP
- Client: curl /health
- Command/Action: First natural Cron tick at 16:00 UTC after BL-032.5 staging deploy hit Inoreader and got back a non-success response (likely 401/token-expired given the elapsed time since the website's last refresh-write cycle).
- Outcome: INCONCLUSIVE pending recovery
- Observed: Cron's `mcp:inoreader:last-status` entry shows `status: 'degraded', observedAt: 2026-05-13T16:00:54.491Z`. Radar cache was NOT populated (cold cache persists).
- Expected: first Cron tick after deploy succeeds; cache populates
- Severity: Important (operational — affects T.X.2 / T.X.4 / T.W.3-5 verification, but recovery is well-documented)
- Remediation: Per `REMOTE_CLIENT_SETUP.md` § token-stale: (1) operator visits `https://globalstrategic.tech/hub/radar` in browser to trigger website ISR refresh of `inoreader:access_token` in the Inoreader-DB; (2) wait ~10s; (3) make a radar Tool call (e.g. `search_radar`) to force a cache-miss fetch with the refreshed token — this is faster than waiting for the 17:00 UTC Cron tick because `readFyiLive`/`readWireLive` fall through to Inoreader on cache-miss without needing `forceRefresh`.
- Notes: Per the Q4 invariant, the Worker is NOT a refresh-writer — the website is the sole refresh-writer (will be revisited in BL-039). This finding is **expected operational state**: BL-032.5 was deployed days after the last website-side radar refresh, so the access token had naturally expired. The fact that the Cron caught it and bailed gracefully (rather than crashing or writing bad data) is exactly the Phase 4 contract working. The website's ISR refresh path will be exercised as part of the recovery.

### T.Y.1 — Tool path regression check via Claude Desktop staging connector

- Date: 2026-05-13
- Tester: RP
- Client: Claude Desktop (MSIX install, gst-mcp-staging connector via mcp-remote bridge)
- Command/Action: Fresh conversation, smoke prompt: "Using gst-mcp-staging, list the GST portfolio facets."
- Outcome: PASS
- Observed: Claude called `list_portfolio_facets` via the staging connector; tool response returned successfully.
- Expected: tool call lands; bearer auth accepted through mcp-remote bridge; deduplicated themes/categories returned
- Notes: Not a documented BL-032.5 playbook scenario (Tools were already on Worker via BL-032), but a useful regression check confirming the Phase 3 `createServer(env, ctx)` signature change did NOT break Tool registration on the Worker. Establishes that staging connector end-to-end (Claude Desktop → mcp-remote bridge → custom domain → Worker → Tool handler) is healthy. Pre-requisite passed for T.K.1/T.K.2 once radar cache populates at 16:00 UTC.

---

## Soak closure

When the soak window closes (typically after the production deploy lands and a one-week post-deploy review passes), summarize the outcomes here. Any unresolved P1 items get re-filed under a new BL-032.5-style close-out bucket (mirroring the BL-032.25 pattern) or under successor initiatives.

_(soak still open as of 2026-05-13)_
