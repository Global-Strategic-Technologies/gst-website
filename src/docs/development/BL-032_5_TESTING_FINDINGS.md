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

**2026-05-13T17:02 UTC update — success-side verified at the 17:00 UTC natural Cron tick.** After the T.Y.2 recovery refreshed the Inoreader access token at 16:12, the next natural Cron tick at 17:00:55 UTC ran successfully end-to-end: `/health` returned `ok:true, inoreader:'ok', inoreaderObservedAt:'2026-05-13T17:00:55.269Z', radarSnapshotAgeSeconds:69`. Cron mechanism + outcome both PASS. The substrate behavior under the happy path is now fully verified.

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

### T.Y.4-prod — BL-039 autonomous self-heal verified AGAINST PRODUCTION

- Date: 2026-05-13
- Tester: RP
- Client: PowerShell Invoke-McpRequest + curl /health + Vercel runtime-logs MCP tool
- Severity: PASS (live production verification on top of T.Y.4 staging)
- Command/Action: Same protocol as T.Y.4 (staging) but executed against production: corrupted `inoreader:access_token` in `gst-radar-tokens` Upstash DB → `INVALID_TOKEN_PROD_BL039_TEST`; deleted `mcp:radar:cache:fyi` + `mcp:radar:cache:wire` in `gst-mcp` Upstash DB; triggered `search_radar` against `mcp.globalstrategic.tech` (production Worker version `4ca681a4`, gitSha `e86dcaa`).
- Outcome: PASS — production autonomous recovery in ~3 seconds; populated radar payload returned with real Inoreader item titles.
- Observed:
  - PowerShell tool call result: `PASS — populated payload. Matches: 76 | First: "What It Will Take to Make AI Sustainable"`
  - `/health` BEFORE (19:22:37 UTC): `ok:true, inoreader:"unknown", radarSnapshotAgeSeconds:1298` (cache from 19:00 UTC Cron)
  - `/health` DURING corruption (19:28:35 UTC): `inoreader:"unknown", radarSnapshotAgeSeconds:null` (cache cleared, no Inoreader traffic yet)
  - `/health` AFTER self-heal (post-19:29:53 UTC): `ok:true, inoreader:"ok", inoreaderObservedAt:"2026-05-13T19:29:53.026Z", radarSnapshotAgeSeconds:18`
  - Vercel production runtime logs: **6 POSTs to `/api/inoreader/refresh` between 19:29:49-19:29:52 UTC, all HTTP 200, all logging "[Radar] Access token refreshed"**
  - Bad token in `gst-radar-tokens.inoreader:access_token` was overwritten with a fresh valid one by the BL-039 path itself; no operator cleanup needed.
- Expected: same chain as T.Y.4 (staging) — Worker hits Inoreader 401 → calls production's `/api/inoreader/refresh` → website endpoint refreshes OAuth → Worker re-resolves config → retries Inoreader → succeeds.
- Notes:
  - **This is the definitive proof that BL-039 works against the production code path** — same Worker code as staging, but routed against the production website URL (`globalstrategic.tech/api/inoreader/refresh`) instead of the Vercel preview URL. The full production wire path (Cloudflare → Vercel production → Inoreader OAuth → Upstash → Cloudflare retry) verified end-to-end.
  - The 6-POST fan-out reproduces in production (matches staging T.Y.4 finding) — confirms BL-040 (debounce parallel refreshes) is a real opportunity and not a staging-environment artifact.
  - Inoreader `inoreader:access_token` lifetime appears to be ~30 days based on observed refresh cadence — natural BL-039 firings in production are expected roughly monthly.

### Sentry alert configuration (Layer 2 — passive observability)

- Configured: 2026-05-13 by RP in `gst-7o.sentry.io → gst-website project → Alerts`
- Alert #1 — success path:
  - Source: Alert on all issues in selected projects
  - Project: `gst-website`
  - Environment: `production`
  - WHEN: A new issue is created
  - IF: `The event's message contains "BL-039 refresh succeeded"`
  - Action interval: 60 minutes (debounces the parallel-refresh fan-out)
  - Notify: Reid Peryam (email)
- Alert #2 — failure path:
  - Same source / project / environment / WHEN
  - IF: `The event's message contains "BL-039 refresh failed"`
  - Action interval: 0 minutes (failures rare + important — no throttling)
  - Notify: Reid Peryam (email)
- Rationale for two separate alerts: success and failure are operationally distinct signals — success is informational (the system is working; ~monthly cadence expected), failure is urgent (the auto-recovery itself broke; needs operator attention). Lumping them into one alert would hide the severity distinction.
- Filter approach: message-based (`contains`) instead of tag-based (`area:bl-039`) because Sentry's tag autocomplete dropdown didn't yet have `area` indexed for the project. Same pattern documented in `SENTRY_MANUAL_SETUP.md` § "Filter syntax mismatch resolved 2026-05-12" for the existing `inoreader-rate-limit` alert.
- First natural firing expected: roughly 30 days out (next Inoreader access-token expiry).

### T.Y.4 — BL-039 autonomous self-heal verified end-to-end (closes T.Y.3 gate)

- Date: 2026-05-13
- Tester: RP
- Client: PowerShell Invoke-McpRequest + curl /health + Vercel runtime-logs MCP tool
- Severity: PASS (highest-confidence verification — proves T.Y.3 gate is closed)
- Command/Action: Deliberately staled `inoreader:access_token` in the `gst-radar-tokens` Upstash DB (value: `INVALID_TOKEN_BL039_TEST`), deleted `mcp:radar:cache:fyi` + `mcp:radar:cache:wire` in the `gst-mcp` Upstash DB to force a cache-miss, then triggered `search_radar` (tier=fyi, limit=3) against staging Worker (commit `5ff5cb2`, version `4ca681a4`).
- Outcome: PASS — autonomous recovery completed in ~3 seconds; populated radar payload returned to operator with real Inoreader-sourced item title ("AI chatbots are giving out people's real phone numbers").
- Expected: Worker hits Inoreader 401 → calls preview's `/api/inoreader/refresh` → website endpoint refreshes OAuth → Worker re-resolves config → retries Inoreader → succeeds; cache populates; client never sees the underlying 401
- Observed (full evidence chain):
  - `/health` BEFORE (18:23:59 UTC): `ok: true, inoreader: "unknown", radarSnapshotAgeSeconds: null` (cache cleared, no Inoreader traffic yet)
  - First Tool call attempted at 18:25 UTC FAILED with legacy `token-stale` envelope — `INOREADER_REFRESH_URL` had not been bound on the Worker (operator skipped a wrangler-secret-put step), so the Worker fell back to the production default `https://globalstrategic.tech/api/inoreader/refresh` which 404'd (endpoint not deployed to production yet). `/health` at 18:25:12 UTC: `ok: false, inoreader: "degraded"`. Diagnosed via Vercel runtime-logs MCP showing zero traffic on preview + production showing 404 on POST.
  - Recovery: operator ran `wrangler secret put INOREADER_REFRESH_URL --env staging` with the preview branch-alias URL.
  - Second Tool call at 18:30 UTC PASSED — populated `matches` array with real radar items.
  - `/health` AFTER (18:30:43 UTC): `ok: true, inoreader: "ok", inoreaderObservedAt: "2026-05-13T18:30:24Z", radarSnapshotAgeSeconds: 19`
  - Vercel preview runtime logs: 6 POST hits to `/api/inoreader/refresh` between 18:30:20-18:30:23 UTC, all HTTP 200, all log "[Radar] Access token refreshed".
  - The bad token in `gst-radar-tokens.inoreader:access_token` was overwritten with a fresh valid one by the BL-039 path itself — no operator cleanup needed.
- Notes:
  - **This closes T.Y.3 — the production-deploy gate** for BL-032.5. The autonomous self-heal works against real Cloudflare Workers + real Vercel Astro endpoint + real Upstash + real Inoreader. With BL-039 in place, the BL-032.5 Cron's dependency on human visits to `/hub/radar` is eliminated.
  - **Optimization-opportunity follow-up**: `search_radar` triggered 6 parallel refresh POSTs because `fetchAllStreams` fans out into 5 parallel Inoreader calls (1 tags-list + 4 folder streams), each independently hitting 401 and each independently calling the refresh endpoint. The endpoint is idempotent so this is correct but wasteful. File as a separate BACKLOG.md item: debounce parallel BL-039 refresh calls via an Upstash lock so a single search_radar call triggers at most 1 refresh.
  - **Operator-misstep finding**: surfaced that `wrangler secret put` is silent if the operator skips a command in a multi-step setup (no error, no warning, just absence in the secret list). Worth adding a verification step to `REMOTE_CLIENT_SETUP.md` / deployment runbooks: after secret-bind, always run `wrangler secret list --env <env>` and grep for the expected secret names. Filed as a doc nit; not blocking.

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

**Soak window**: opened 2026-05-13T15:00 UTC (post-deploy of staging `7e53b0b0` / commit `be942a8`); pre-production-gate phase closed 2026-05-13T17:02 UTC.

**Substrate verdict**: ✅ **PASS** — every BL-032.5 Phase 1-4 component verified working as designed against real Cloudflare Workers + real Upstash + real Inoreader. 15 findings logged across sections C / W / X / H / M / K / Y.

### Critical-gate scorecard

| Test          | Outcome                  | Notes                                                                                                                                                                               |
| ------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T.H.1         | ✅ PASS                  | `/health` exposes `radarSnapshotAgeSeconds`                                                                                                                                         |
| T.M.1         | ✅ PASS                  | manifest-stability test passes; no canonical-hash drift                                                                                                                             |
| T.W.1 / T.W.2 | ✅ PASS                  | `resources/list` returns the canonical 6 radar URIs                                                                                                                                 |
| T.W.3 / T.W.4 | ✅ PASS                  | both core radar URIs return populated bodies after recovery                                                                                                                         |
| T.X.1         | ✅ PASS                  | Cron trigger registered (`0 * * * *`) on staging                                                                                                                                    |
| T.X.2         | ✅ PASS (after recovery) | Mechanism verified at 16:00 UTC tick (degraded outcome handled gracefully); success-side verified at 17:00:55 UTC tick (clean run, cache populated, `/health` flipped to `ok:true`) |
| T.X.4         | ✅ PASS                  | `radarSnapshotAgeSeconds` tracks cache age correctly                                                                                                                                |
| T.K.1 / T.K.2 | ✅ PASS                  | Claude Desktop reads pinned Library + radar Resources; voice consistent with GST Take addendum                                                                                      |

### Important & Optional coverage

- T.C.3 / T.C.4 ✅ PASS — Resource cache wrapper transparent (and T.C.4 surfaced + fixed a test-framing bug in `Test-Bl0325.ps1` mid-soak, committed `5adfa18`)
- T.W.5 ✅ PASS — 4 Wire categories filter cleanly (0 wrong-category items across all)
- T.Y.1 ✅ PASS — Tool path regression check via staging Claude Desktop connector (Phase 3 `createServer` refactor did not break Tool registration)
- T.Y.2 ✅ Resolved in-session — first Cron tick hit a stale Inoreader OAuth token; recovered via documented `REMOTE_CLIENT_SETUP.md` § token-stale procedure (visit `/hub/radar` + force-refresh via radar Tool call)

### ✅ Production-deploy gate — CLEARED 2026-05-13T18:30 UTC

**BL-032.5 + BL-039 are cleared for production deploy.**

The T.Y.3 architectural gap has been closed by BL-039 (Option B — Worker self-heals on Inoreader 401 by calling website's `/api/inoreader/refresh` endpoint). T.Y.4 verified the full autonomous-recovery chain end-to-end against real services (real Cloudflare Worker, real Vercel Astro endpoint, real Upstash, real Inoreader OAuth):

- Deliberately staled `inoreader:access_token` + flushed radar cache
- `search_radar` Tool call → cache miss → Inoreader 401 → BL-039 refresh path → fresh OAuth token written → retry succeeded
- End-to-end latency ~3 seconds; populated radar payload returned to client
- Bad token self-healed (overwritten with fresh value); no operator cleanup needed

The Phase 4 Cron handler does everything correctly (detects degraded, refuses to corrupt cache, surfaces state via `/health` and `mcp:inoreader:last-status`). Combined with BL-039's failure-mode-elimination, MCP-only consumers no longer depend on website-side traffic to keep radar fresh.

**Historical note**: at soak-open (2026-05-13T15:00 UTC), the production-deploy gate was 🔴 BLOCKED on T.Y.3. Promoting BL-039 to MUST-SHIP-BEFORE-PROD (commit `50acbf8`), implementing it (commit `143cd05`), and verifying autonomous recovery (T.Y.4) closed the gate within the same session — 2026-05-13T18:30 UTC.

### Re-soak triggers

This findings log should be re-run when any of these land:

1. **BL-039 implementation** — once Worker can refresh its own token, re-run the BL-032.5 soak with a deliberately stale-token scenario to confirm the Cron now recovers autonomously. T.X.2 / T.X.4 / T.W.3 / T.W.4 + a new T.Y.4 (autonomous recovery) need to land cleanly before production deploy.
2. **Substrate-touching changes** — Resource cache logic (`mcp-server/src/cache/resource-cache.ts`), scope catalog (`auth/scopes.ts`), radar SnapshotReader (`content/radar-snapshot-reader-*.ts`), Cron schedule (`wrangler.toml` triggers), `/health` shape, or manifest hash discipline.
3. **Pre-each-production-deploy** that touches any BL-032.5 surface — quick re-run of the Critical-gate scorecard above suffices; full Section K is overkill unless prompts/Resources changed.

### Next session — BL-039 implementation (separate initiative)

Recommended sequencing per the 2026-05-13 planning conversation:

1. Confirm Option B from `BACKLOG.md` § BL-039 § Use cases (Worker calls a new website-side `/api/inoreader/refresh` endpoint on token-stale; preserves Q4 single-writer invariant)
2. Implement + tests on a fresh branch off `feature-mcp2` (or its successor)
3. Deploy to staging
4. Re-soak BL-032.5 per § Re-soak triggers above
5. Then — and only then — promote BL-032.5 + BL-039 together to production

---

_Soak closed pre-production-gate: 2026-05-13T17:02 UTC. Final closure (post-production-deploy review) deferred until BL-039 lands and the re-soak passes._

---

## Section Z — Post-soak operational findings (BL-032.6 demo prep + delivery)

Findings surfaced during BL-032.6 demo-preparation (2026-05-14) and live-demo execution (2026-05-15) operational use of the production substrate. T.Z.1 and T.Z.2 are BL-040 evidence; T.Z.3 was discovered during the BL-032.6 demo-day RCA when these findings — together with the upstream Inoreader 100/day Zone-1 cap (confirmed via the Inoreader Developer dashboard reading `100% / 100 requests per day`) — caused the radar surface to go fully unavailable during the demo window. **Suggested home for fixes: a new follow-on BL-032.7 "Inoreader budget hardening" initiative** that bundles T.Z.1 + T.Z.2 + T.Z.3 + per-env Inoreader app separation (see T.Z.3 § Remediation). All three findings are substrate behavior gaps, not BL-032.5 regressions; the BL-032.5 deliverable shipped without these surfacing because the prior soak window did not include a multi-hour Inoreader sub-limit episode followed by daily-cap exhaustion.

### T.Z.1 — Cron `partial` outcomes increment day-counter even when zero Inoreader calls succeeded

- Date: 2026-05-14
- Tester: RP
- Client: Sentry breadcrumb inspection (event `GST-MCP-SERVER-6` ID `ecb835d6`, captured 2026-05-14T10:00:22 -04 during BL-032.6 demo prep)
- Command/Action: Drilled into a `cron.radar-refresh.partial` Sentry event's breadcrumb timeline during operational triage of Inoreader 429 episode
- Outcome: FAIL (substrate design gap)
- Observed: In the 10:00:22 EDT Cron run, both Wire-tier first call (`GET inoreader.com/reader/api/0/tag/list`) AND FYI-tier call (`GET inoreader.com/reader/api/0/stream/contents/.../annotated`) returned HTTP 429 within the same millisecond. Zero Inoreader content was retrieved. The handler proceeded to `await incrementDayCounter(env, CALLS_PER_REFRESH)` at [mcp-server/src/cron/radar-refresh.ts:159](../../../mcp-server/src/cron/radar-refresh.ts#L159), adding 6 to the `mcp:inoreader:day-counter:2026-05-14` key as if 6 calls had succeeded. Repeated 3+ times in the visible Sentry trace timeline before the breaker eventually opened (via a downstream live tool call, not the Cron — see T.Z.2). Downstream consequence: the day-counter reached the 180 soft cap by ~21:00 UTC despite many of those "180 calls" being 429-rejected.
- Expected: Counter should reflect actual successful Inoreader consumption. When all attempted calls 429, the counter should stay flat (or at minimum differentiate success-on-one-tier from failed-on-both).
- Severity: Important
- Remediation: deferred — track in BACKLOG.md as part of BL-040
- Notes: The inline rationale at [radar-refresh.ts:159](../../../mcp-server/src/cron/radar-refresh.ts#L159) reads _"Increment regardless of outcome — the Inoreader calls happened (or were attempted) whether or not the parsed response was usable."_ The original framing treats attempts as the protected resource. In practice when Inoreader hard-429s us, the attempts cost nothing on Inoreader's quota side but consume our internal soft cap. **Counter-as-budget-proxy breaks in this failure mode.** Suggested fix shape: refactor `RefreshOutcome` to distinguish `partial-one-tier-ok` from `partial-both-failed`, and only increment the counter for outcomes where at least one tier returned `ok: true`.

### T.Z.2 — Cron 429 outcomes do not trip the circuit breaker; only live tool calls do

- Date: 2026-05-14
- Tester: RP
- Client: Sentry event inspection + code review of [`mcp-server/src/cron/radar-refresh.ts`](../../../mcp-server/src/cron/radar-refresh.ts) + [`mcp-server/src/tools/radar-live.ts`](../../../mcp-server/src/tools/radar-live.ts)
- Command/Action: Traced the call sites of `openCircuit()`; verified whether Cron's `refreshRadarSnapshot` calls it on Inoreader 429
- Outcome: FAIL (substrate design gap)
- Observed: The Cron handler reads `wire.ok` and `fyi.ok` and emits `cron.radar-refresh.partial` when either is false, but does NOT call `openCircuit(env, ...)`. The breaker is only opened from `failureResponse` in [mcp-server/src/tools/radar-live.ts:117-133](../../../mcp-server/src/tools/radar-live.ts#L117-L133), which is exclusively invoked by `handleSearchRadar` / `handleGetLatestInsights` — the live tool path. During the 2026-05-14 incident, the Cron emitted multiple `partial` outcomes from 10:00 EDT onward without opening the breaker; the breaker only opened later when a live `search_radar` tool call from an OpenClaw agent during demo prep hit 429.
- Expected: Either (a) Cron 429 outcomes should also call `openCircuit()` — failing fast across all consumers; or (b) the design intent that "only live traffic should open the breaker" should be documented inline with a rationale.
- Severity: Important
- Remediation: deferred — track in BACKLOG.md as part of BL-040
- Notes: In the absence of any live tool calls, the Cron could hard-429 hourly for 24h, hit the day-counter soft cap (via T.Z.1's counter-leak), fill the radar cache with stale data, and the substrate's observability would surface only `partial` warnings — no `inoreader-rate-limit` event, no circuit-open state, no 503 response surface for alert rules to bind to. Operators would have to read each `partial` event's breadcrumbs to spot the underlying 429s. **The protective mechanism (breaker) is gated behind a consumer pattern (live tool calls), not the actual upstream signal (429 from Inoreader).** Combined with T.Z.1, this creates an extended-blind-spot window where the substrate is degraded but appears healthy to most alert rules. Suggested fix shape: extract a `handleInoreaderFailure(env, failure)` helper that both the Cron's partial path and the live tool path can call, centralising the `openCircuit()` + `captureMessage('inoreader-rate-limit', ...)` decision.

### T.Z.3 — 429 handler discards diagnostic headers, blocking quick RCA

- Date: 2026-05-15
- Tester: RP (operator) + AI-pair (Claude Code)
- Client: Sentry event inspection of the `inoreader-rate-limit` issue captured at 2026-05-15T11:18:31.104 -04 during BL-032.6 demo execution; code review of [`mcp-server/src/lib/inoreader-worker.ts`](../../../mcp-server/src/lib/inoreader-worker.ts)
- Command/Action: Drilled into the demo-day Sentry event hoping to read `X-Reader-Zone1-Limit`, `X-Reader-Zone1-Usage`, and `Retry-After` from the 429 response to attribute root cause. None present.
- Outcome: FAIL (observability gap)
- Observed: At [inoreader-worker.ts:284-290](../../../mcp-server/src/lib/inoreader-worker.ts#L284), the 429 handler records ONLY `status` and `statusText`:

  ```ts
  if (status === 429) {
    return {
      ok: false,
      status: 429,
      reason: 'inoreader-rate-limit',
      message: `Inoreader rate limit exceeded: ${status} ${statusText}`,
    };
  }
  ```

  The response body and the diagnostic headers Inoreader documents in [their rate-limiting docs](https://www.inoreader.com/developers/rate-limiting) — `X-Reader-Zone1-Limit`, `X-Reader-Zone1-Usage`, `X-Reader-Zone2-Limit`, `X-Reader-Zone2-Usage`, `X-Reader-Limits-Reset-After` — are silently discarded. The Sentry breadcrumb's `Fetch` entry shows only `URL [429]` (verified against the demo-day event screenshot); the parent error message gives no quantitative information about WHICH zone hit the limit, HOW deep into the limit we were, or HOW LONG until reset. RCA required an out-of-band call to Inoreader's Developer Dashboard which confirmed `Zone 1: 100% of 100 requests/day` — the actual root cause was reachable only through human dashboard inspection, not through our own observability.

- Expected: When Inoreader returns 429, the handler should:
  1. Read the diagnostic headers off `response.headers` and surface them in the `RefreshFailure` envelope alongside `status`
  2. Attach them as Sentry tags (`inoreader.zone1.usage`, `inoreader.zone1.limit`, `inoreader.reset_after_seconds`) so the next 429 event in Sentry tells the full story without an external lookup
  3. Optionally include the response body excerpt (first ~200 chars) in the captureMessage `extra` field — Inoreader's 429 body sometimes specifies which sub-limit was hit
- Severity: Important — directly extended the demo-day RCA from 30 seconds (read the header) to >2 hours (hypothesis testing + dashboard hunting)
- Remediation: ~10 LOC change in `inoreader-worker.ts` + matching `sentry.ts` tag extraction. **Schedule in the proposed BL-032.7 "Inoreader budget hardening" follow-on initiative** alongside T.Z.1 + T.Z.2 + the per-env Inoreader app split discussed below.
- Notes: This finding is the meta-finding behind T.Z.1 and T.Z.2 — both of those took longer to diagnose than they should have because every 429 captured to Sentry today had the same opaque message and required code-spelunking + Inoreader-dashboard lookups to interpret. Fixing this single instrumentation gap retroactively makes T.Z.1 and T.Z.2 self-diagnosing in production.

#### Additional finding — per-env Inoreader app sharing (BL-032.7 scope)

Discovered alongside T.Z.3 during demo-day RCA:

- **Both Worker envs share one Inoreader app (`App ID 1000008446 — "Global Strategic Technologies Radar"`)**. Default zone limits are 100/day Zone 1 + 100/day Zone 2 per app (Inoreader docs: [rate-limiting](https://www.inoreader.com/developers/rate-limiting), [register-app](https://www.inoreader.com/developers/register-app)).
- Until both crons were paused on 2026-05-15, staging + production were each making 6 calls/hour against the SAME Zone-1 100/day budget = 12 calls/hour combined. Over a 24h day this exceeds the Zone-1 cap by ~44%; in practice the daily reset (UTC midnight) gave us partial coverage early in the day until the cap was hit, then full-day outage.
- The website's hub Radar page (`/hub/radar`) ALSO calls Inoreader through the website's own server-side code path (separate from the MCP Worker), which historically used the same app credentials. Any user visit to the hub Radar page during a demo cycle ALSO consumes the 100/day budget — invisible to our day-counter (which only tracks Worker-side intent).
- **Recommendation: separate Inoreader apps per consumer surface**:
  - App #1 — **Website Radar** (consumer: `/hub/radar` server-side rendering + BL-039 refresh path; lower cadence, user-triggered)
  - App #2 — **MCP Worker** (consumer: hourly Cron + live agent tool calls; higher cadence, machine-driven)
  - Each app gets its own 100/day Zone-1 + 100/day Zone-2 quota → effective Zone-1 budget doubles to 200/day, and one consumer's bad day doesn't blank the other.
  - Cost: one new app registration on Inoreader's developer portal; one new pair of OAuth credentials; one OAuth-callback URL split. ~30 min of operator work.
  - Alternative considered: request a Zone-1 limit increase from Inoreader (the "Request limits increase" button exists on the dashboard). Less work but creates a single point of failure — one app's daily exhaustion still affects both consumers. Pursue only if Inoreader denies the per-app split or if account-level limits also apply.
- This split also resolves the attribution ambiguity in T.Z.1: with one app per consumer, the Inoreader Developer dashboard becomes a clean second source of truth for "did this consumer over-spend?"
- Severity: Important — this is the upstream-side root cause of the demo-day outage. Until the apps are split (or limits raised), every operational cycle is one degraded Inoreader window away from the same incident.
- Remediation: schedule in **BL-032.7 "Inoreader budget hardening"** alongside T.Z.1, T.Z.2, T.Z.3.
