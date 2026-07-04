# BL-032.8 Phase B Soak Gate — Operator Tracker

> ## ✅ Gate closed 2026-05-27
>
> Phase B (PR #140) merged 2026-05-27 after the soak window closed clean. Operator-side decommissioning of legacy Vercel `INOREADER_*` env vars, Worker `UPSTASH_INOREADER_REST_*` + `INOREADER_REFRESH_SECRET` secrets, and the `gst-radar-tokens` Upstash database itself was completed the same day. This document is retained as the historical operator tracker — sections below reflect the original forward-looking design and are now historical reference for future similar soak gates. See [`MCP_SERVER_RADAR_UNIFICATION_BL-032_8.md`](../../../../../src/docs/development/MCP_SERVER_RADAR_UNIFICATION_BL-032_8.md) for the closure note.

> **Window**: 2026-05-17 (Phase A merged) → 2026-05-27 (PR #140 merged; closed clean — original target was 2026-05-24, slipped 3 days due to ordering of BL-032.76 cron-Sentry fix landing first)
> **PR**: [#140 — Phase B retirement (✅ MERGED 2026-05-27)](https://github.com/Global-Strategic-Technologies/gst-website/pull/140)
> **Companion docs**:
>
> - [`MCP_SERVER_RADAR_UNIFICATION_BL-032_8.md`](../../../../../src/docs/development/MCP_SERVER_RADAR_UNIFICATION_BL-032_8.md) — full initiative design + 6-phase plan
> - [`DEPLOY.md` § C.5](../DEPLOY.md) — Inoreader budget recovery (use during soak if a 401 cascade fires)
> - [`DEPLOY.md` § C.13](../DEPLOY.md) — Decommission legacy Inoreader DB (post-merge step)
> - [`DEPLOY.md` § C.6](../DEPLOY.md) — Incident triage tree (use if soak observations turn ambiguous)

## Purpose

The 7-day soak gate is the structural protection between Phase A (website cutover, with `git revert` rollback path retained) and Phase B (Phase A safety nets deleted). It exists because Phase A leaves the system in a state where regressions are recoverable; Phase B closes that door. Merging Phase B before the soak completes turns a tactical regression into a recovery incident.

This document is the operator tracker for the window — what to monitor, what to actively verify, what to do before merging, and what to do after.

---

## Daily passive monitoring (≤ 5 min/day)

Watch four signals. Any one of them tripping is an [abort condition](#abort-conditions).

| #   | Signal                                  | Where to look                                                        | "Good" looks like                                                                                  |
| --- | --------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | `triggerWebsiteRefresh` invocations     | Sentry → MCP Worker project → **Issues** / **Discover**              | Zero events across the whole window                                                                |
| 2   | Inoreader Developer Console daily usage | https://www.inoreader.com/developers/ → registered app → usage graph | Single app's daily Zone-1 well under 100/day (~24 calls/day expected: 4 cron firings × ~6 fetches) |
| 3   | Production `/hub/radar`                 | Browser visit                                                        | Feed renders with current FYI + Wire items                                                         |
| 4   | Vercel logs `[Radar]` errors            | Vercel Dashboard → `gst-website` → **Logs** → filter `[Radar]`       | Near-zero error lines                                                                              |

### Daily tick log

Tick each box as you observe the signal that day. Add a one-line note if anything looked off (even if it self-resolved).

| Day | Date       | Sig 1 ✅ | Sig 2 ✅ | Sig 3 ✅ | Sig 4 ✅ | Operator initials | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ---------- | -------- | -------- | -------- | -------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 2026-05-17 | [x]      | [x]      | [x]      | [x]      | RP                | Baseline established post-Phase-A merge.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2   | 2026-05-18 | [x]      | [⚠️→✅]  | [x]      | [x]      | RP                | Sig 2 anomaly at 12:30 UTC (36%); root-caused to dual-env cron; fix shipped PR #143; tomorrow validates ~30/day baseline. Sig 4 bot-probe noise reduced via PR #144. See § Findings log below.                                                                                                                                                                                                                                                                           |
| 3   | 2026-05-19 | [x]      | [x]      | [x]      | [x]      | RP                | Active verification block ticked. Two observability defects surfaced + resolved same-day: PR #150 (cron Sentry-capture flush, restored visibility) + PR #152 (Inoreader-status TTL → stale-while-OK, restored `/health` field semantics). Plus PR #149 (SECRETS_INVENTORY doc). See § Findings log below.                                                                                                                                                                |
| 4   | 2026-05-20 | [x]      | [x]      | [x]      | [x]      | RP                | First full day on the post-PR-#150 + post-PR-#152 production code. Sig 2 (Inoreader Zone-1) at 24% by 07:45 UTC — exactly the expected post-fix baseline (4 cron firings × 6 calls = 24/day), confirming PR #143's dual-cron disable is holding. `/health` now shows `inoreader: 'ok'` + `inoreaderObservedSource: 'cron'` + `inoreaderObservedSecondsAgo: 17064` (~4.7h since 06:00 UTC cron) — both Day-3 observability fixes verified live. See § Findings log below. |
| 5   | 2026-05-21 | [x]      | [x]      | [x]      | [x]      | RP                | Inoreader Zone-1 at 37% — higher than 28% post-fix steady state. Investigation surfaced a real observability gap: the cron's day-counter only tracks cron-radar fetches, not OAuth refresh or live cache-miss. Structural ~15-25% undercount vs Inoreader's Developer Console. Substrate operating correctly; gap is observability-side only. Planning + scoping captured under BL-032.75 (Day-5 finding). See § Findings log below.                                     |
| 6   | 2026-05-22 | [ ]      | [ ]      | [ ]      | [ ]      |                   |                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 7   | 2026-05-23 | [ ]      | [ ]      | [ ]      | [ ]      |                   |                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

---

## Active verification (one-time, recommend Day 3 or 4)

Pick a quieter moment and run these from PowerShell. The point is to confirm the new code paths are exercised — passive monitoring proves things didn't break, active verification proves the new code is the reason.

```powershell
# 1. Worker reachable + healthy. Should return ok: true, upstashMcp: ok
Invoke-RestMethod https://mcp.globalstrategic.tech/health | ConvertTo-Json -Depth 5

# 2. /radar/snapshot returns both tiers OK
$key = "<paste MCP_KEY_WEBSITE_RADAR from password manager>"
Invoke-RestMethod -Uri https://mcp.globalstrategic.tech/radar/snapshot `
  -Headers @{ Authorization = "Bearer $key" } | ConvertTo-Json -Depth 5
```

3. **Cron proactive refresh exercise**: in Sentry → MCP Worker project, filter on `eventTag = "oauth-refresh-success"` over the past 24h. Should see ~4 events/day tagged `extra.source = "cron"`. If zero, the cron isn't firing or the proactive-TTL hook is skipping.

### Optional — induced reactive-refresh test

Only run this if you want explicit assurance the 401 → refresh → retry cascade works end-to-end. It briefly perturbs production state.

```powershell
# A. Open the gst-mcp Upstash console → CLI tab → run:
#    DEL mcp:inoreader:access_token
#
# B. Immediately hit /radar/snapshot:
Invoke-RestMethod -Uri https://mcp.globalstrategic.tech/radar/snapshot `
  -Headers @{ Authorization = "Bearer $key" } | ConvertTo-Json -Depth 5
#
# C. In Sentry, look for an oauth-refresh-success event with
#    extra.source = "live-tool" timestamped during step B.
```

### Active verification checklist

- [x] Health endpoint returns `ok: true, upstashMcp: ok` — Date: 2026-05-19 Operator: RP
- [x] `/radar/snapshot` returns 200 with both tiers `ok: true` — Date: 2026-05-19 Operator: RP _(verified via SSR rendering on `/hub/radar` per Sig 3; direct PowerShell test deferred because `MCP_KEY_WEBSITE_RADAR` is Vercel-Sensitive write-once and not readable back)_
- [x] Cron fires 4× / day in past 24h — Date: 2026-05-19 Operator: RP _(criterion satisfied by Cloudflare's authoritative cron event log: 4/4 firings Success in 24h. Sentry `cron.radar-refresh.success` capture is dropping ~75% of events — observability defect documented in Findings log, not soak-blocking.)_
- [ ] (Optional) Reactive refresh exercised + observed in Sentry — Date: \_**\_ Operator: \_\_**

---

## Pre-merge operator tasks (run on 2026-05-24, BEFORE clicking merge)

Full sequence — execute top-to-bottom. Each block is a logical group; the comments explain why the order matters.

```powershell
# ---------------------------------------------------------------------
# Step 1 — Vercel: remove the legacy INOREADER_* env vars
# ---------------------------------------------------------------------
# These were the website's OAuth credentials when it was a direct Inoreader
# caller. Post-Phase-B the website doesn't read any of them — they're
# inert. Remove for hygiene + reduced blast radius. Vercel CLI prompts for
# the target (production / preview / development) on each command.
#
# Coverage (verified against `vercel env ls` on 2026-05-19):
#   - INOREADER_APP_ID, INOREADER_APP_KEY, INOREADER_ACCESS_TOKEN,
#     INOREADER_REFRESH_TOKEN: bound to all 3 envs (Dev + Preview + Prod)
#   - INOREADER_REFRESH_SECRET: bound to Production + Preview only
#   - INOREADER_FOLDER_PREFIX is NOT bound on Vercel — earlier draft of
#     this doc included a vercel rm for it; removed 2026-05-19 after the
#     Day-3 SECRETS_INVENTORY audit found no Vercel binding for that name.
vercel env rm INOREADER_APP_ID
vercel env rm INOREADER_APP_KEY
vercel env rm INOREADER_ACCESS_TOKEN
vercel env rm INOREADER_REFRESH_TOKEN
vercel env rm INOREADER_REFRESH_SECRET

# ---------------------------------------------------------------------
# Step 2 — Worker: remove the BL-039 fallback secret (both envs)
# ---------------------------------------------------------------------
# The Worker code that read INOREADER_REFRESH_SECRET was deleted in PR #140
# commit 606f484. The secret is unused by any code path.
Set-Location c:\Code\gst-website\mcp-server
npx wrangler secret delete INOREADER_REFRESH_SECRET --env staging
npx wrangler secret delete INOREADER_REFRESH_SECRET --env production

# ---------------------------------------------------------------------
# Step 3 — Worker: remove the legacy gst-radar-tokens DB bindings (both envs)
# ---------------------------------------------------------------------
# These pointed at the website's old Upstash DB (Read-Only token). With the
# Worker's dual-read fallback removed in PR #140 commit 3749087, they're unused.
npx wrangler secret delete UPSTASH_INOREADER_REST_URL --env staging
npx wrangler secret delete UPSTASH_INOREADER_REST_TOKEN --env staging
npx wrangler secret delete UPSTASH_INOREADER_REST_URL --env production
npx wrangler secret delete UPSTASH_INOREADER_REST_TOKEN --env production

# ---------------------------------------------------------------------
# Step 4 — Verify both Worker secret lists are clean
# ---------------------------------------------------------------------
npx wrangler secret list --env staging
npx wrangler secret list --env production
# Should NOT contain: INOREADER_REFRESH_SECRET, UPSTASH_INOREADER_REST_*
# SHOULD still contain: MCP_KEY_*, UPSTASH_MCP_REST_*,
#                       INOREADER_APP_ID, INOREADER_APP_KEY,
#                       INOREADER_ACCESS_TOKEN, INOREADER_REFRESH_TOKEN, SENTRY_DSN
```

### Pre-merge sanity check

After Step 4, confirm production still works on the trimmed secret list (the Worker code on `master` doesn't read any of the deleted secrets, but verification rules out a fat-finger):

- [ ] `Invoke-RestMethod https://mcp.globalstrategic.tech/health` returns `ok: true`
- [ ] Browser visit to `/hub/radar` renders the unified feed normally
- [ ] No new `[Radar]` errors in Vercel logs

### Pre-merge checklist

- [ ] Daily tick log shows 7 consecutive clean days
- [ ] Active verification block ticked
- [ ] Vercel `INOREADER_*` removed: `INOREADER_APP_ID`, `INOREADER_APP_KEY`, `INOREADER_ACCESS_TOKEN`, `INOREADER_REFRESH_TOKEN` across all 3 envs (4 × 3 = 12) + `INOREADER_REFRESH_SECRET` across Production + Preview (1 × 2 = 2) = **14 Vercel removals**
- [ ] Worker `INOREADER_REFRESH_SECRET` removed (staging + production = 2 removals)
- [ ] Worker `UPSTASH_INOREADER_REST_*` removed (2 secrets × 2 envs = 4 removals)
- [ ] Secret-list verification clean on both envs
- [ ] Post-deletion sanity check green

---

## Merge sequence

1. GitHub UI → PR #140 → **Ready for review** (un-draft)
2. Wait for CI green (`test`, `lint`, `astro check`, `typecheck`)
3. **Create a merge commit** (project convention — not squash)
4. After merge, reset `dev` HEAD to `master` per usual workflow

### Merge checklist

- [ ] PR un-drafted on **\_\_\_** at **\_** UTC
- [ ] CI green
- [ ] Merged via merge commit (not squash); commit SHA: **\_\_\_**
- [ ] `dev` HEAD reset to `master`
- [ ] BACKLOG.md confirms `BL-032.8: ✅ SHIPPED 2026-05-17` and `BL-040: ✅ SUPERSEDED`

### Post-deploy verification (Vercel — within ~5 min of merge)

PR #140 deletes the website-side BL-039 surface (`src/pages/api/inoreader/refresh.ts`) and the Worker-side fallback caller (`mcp-server/src/lib/inoreader-bl039-fallback.ts`). Vercel auto-deploys the website on merge to master (typically 2-3 min); the Worker requires a manual `npm run deploy:production` from `mcp-server/`. After both land, the `/api/inoreader/refresh` route ceases to exist on the website entirely — anonymous probes that previously hit the Astro middleware short-circuit (PR #144, 404 from in-function middleware) now get a 404 directly from Vercel's edge routing layer with NO function invocation.

The verification is two-part: confirm the user-visible status code stays 404 (no regression), and confirm Vercel logs no longer show any `[Radar]`/`_render` function invocations for that path (the noise reduction Day-2's Finding #3 was supposed to fix completely, not just relabel).

```powershell
# 1. Anonymous GET still returns 404 (now from Vercel's edge, not from
#    Astro middleware — but visually indistinguishable to the caller).
Invoke-WebRequest -Uri https://globalstrategic.tech/api/inoreader/refresh -SkipHttpErrorCheck `
  | Select-Object StatusCode, @{N='Server';E={$_.Headers['Server']}}, `
                              @{N='VercelId';E={$_.Headers['X-Vercel-Id']}}

# Expected: StatusCode 404. Server header may still be "Vercel" but NO
# X-Vercel-Id header means the response came from Vercel's static
# 404 page, not a serverless function invocation. (If X-Vercel-Id IS
# set, the function still ran — Vercel may take a few minutes to
# update its routing manifest after deploy. Re-test after 5 min.)

# 2. Browser-style POST: should also return 404, NOT 401/403/405.
#    The route file is gone; Astro can't even reach the (now-deleted)
#    POST handler. The CSRF gate doesn't run either because there's
#    no SSR function invocation.
Invoke-WebRequest -Uri https://globalstrategic.tech/api/inoreader/refresh -Method POST `
  -Headers @{
    Authorization = 'Bearer wrong-token';
    Origin = 'https://globalstrategic.tech';
    'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  } -SkipHttpErrorCheck | Select-Object StatusCode
# Expected: 404 (was 401 with bearer-present + Origin in the pre-PR-140
# state). The 401 → 404 transition proves the route handler is gone,
# not just hidden by middleware.

# 3. Vercel function-invocation log check (Vercel dashboard, not CLI).
#    Vercel Dashboard → gst-website project → Logs → filter for
#    "/api/inoreader/refresh" over the past 30 min.
#    Expected: zero entries. If any appear, the route file wasn't
#    fully deleted by the PR or Vercel's deploy lagged.
```

### Post-deploy verification checklist

- [ ] Anonymous GET returns 404 with NO `X-Vercel-Id` header (proves no function invocation) — Date: **\_\_\_** Operator: **\_\_**
- [ ] Bearer-present POST returns 404 (was 401 pre-PR-140) — Date: **\_\_\_** Operator: **\_\_**
- [ ] Vercel logs show zero `/api/inoreader/refresh` function invocations in the 30 min after deploy — Date: **\_\_\_** Operator: **\_\_**

If any of these fail, do NOT delete the legacy Upstash DB in the post-merge gate (next section) — that step assumes PR #140's full delete chain landed cleanly. Investigate first; if the route file persists, the deploy may have skipped a file (Vercel build-cache quirks) and a force-rebuild is needed.

---

## Post-merge gate (wait 48h — earliest action 2026-05-26)

Only after production has been stable for 48h on the post-merge code:

1. **Delete the legacy `gst-radar-tokens` Upstash database** — operator walkthrough: [DEPLOY.md § C.13](../DEPLOY.md). Steps:
   - Upstash console → Redis → select `gst-radar-tokens`
   - Confirm zero connections under **Details → Connections**
   - **Danger Zone** → **Delete Database** → type the DB name to confirm
2. **(Optional) Disconnect Vercel's Upstash integration** on the `gst-website` project → **Storage** tab.

### Post-merge gate checklist

- [ ] 48h of stable production observed after merge
- [ ] `gst-radar-tokens` database deleted on **\_\_\_** at **\_** UTC
- [ ] (Optional) Vercel Upstash integration disconnected

---

## Abort conditions

If any of these fire during the soak window, **keep PR #140 in DRAFT** and investigate before resuming:

| Condition                                                                                    | What it means                                                                                                                         | First response                                                                                                                                                        |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Non-zero `triggerWebsiteRefresh` invocations in Sentry                                       | The new `inoreader-oauth.ts` refresh path failed and the BL-039 fallback (about to be deleted) was the only thing keeping radar alive | Inspect the Sentry stack trace. Root-cause on `master` via a fix PR. Once shipped, restart the soak clock from the fix-merge date.                                    |
| `/hub/radar` empty fallback persists > 12h (> 2 ISR cycles)                                  | Either the Worker is down or the MCP_KEY_WEBSITE_RADAR bearer is mis-bound on Vercel                                                  | Run the [active verification](#active-verification-one-time-recommend-day-3-or-4) block. Cross-reference [DEPLOY.md § C.6](../DEPLOY.md) incident triage tree.        |
| Inoreader Zone-1 day-counter approaches 100/day on a single 24h window without obvious cause | Single-flight lock isn't coalescing concurrent refreshes — would have manifested as BL-040 originally                                 | Check `mcp:inoreader:refresh-lock` key behavior in Upstash; inspect the `refresh-single-flight.test.ts` invariant; consider whether a Worker isolate is hot-spotting. |
| `/health` reports `upstashMcp: degraded` for > 5 min and Upstash status page is healthy      | Config regression on the MCP DB secret, not a provider outage                                                                         | `wrangler secret list --env production` to confirm `UPSTASH_MCP_REST_URL` + `UPSTASH_MCP_REST_TOKEN` are bound; rotate per [DEPLOY.md § A.3](../DEPLOY.md) if needed. |

### Abort log

If an abort fires, record it here for the post-incident write-up:

| Date / time | Condition triggered | Investigator | Root cause | Resolution + new soak start date |
| ----------- | ------------------- | ------------ | ---------- | -------------------------------- |
|             |                     |              |            |                                  |

### Findings log

Non-abort observations discovered during the soak. Useful for the post-mortem and for evolving the soak playbook on future cutover initiatives.

| Date       | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-18 | **Dual-env cron doubling Inoreader Zone-1 budget burn.** Inoreader Developer Console showed 36% utilization at 12:30 UTC against an expected 18% (3 cron firings × 6 calls). Counter `mcp:inoreader:day-counter:2026-05-18` confirmed 36. Sentry showed 4 `cron.radar-refresh.success` events in 10 hours instead of 2. Root cause: both `[env.staging.triggers]` and `[env.production.triggers]` ran `0 */6 * * *` against the same Inoreader OAuth app. Fix: PR #143 removed `[env.staging.triggers]` entirely; staging cron-path validation moves to the test suite + manual `wrangler dev` runs. Defensive comment added in `wrangler.toml`: if anyone re-enables a staging cron later, they must FIRST register a separate Inoreader OAuth app for staging. Day-3 baseline projection drops to ~24-30/day.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-05-18 | **`auth.failed bearer-rejected` Sentry noise from bot probes.** Sentry issue GST-MCP-SERVER-4 surfaced multiple events from anonymous probes against `/favicon.ico` and similar paths on `mcp.globalstrategic.tech`. Worker auth was rejecting them correctly (401), but every probe burned Sentry quota + obscured actionable failures. Fix: PR #141 (merged earlier) added an `isRoutedPath()` allowlist that 404s unknown paths before auth runs, plus a `shouldCaptureAuthFailure(reason)` predicate that gates Sentry capture on actionable failure modes only (`invalid-token`, `malformed-scopes`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-05-18 | **405 noise on website `/api/inoreader/refresh`.** Vercel logs showed bot probes against the BL-039 refresh endpoint (POST-only) being rejected with 405. Endpoint behavior was HTTP-correct but visually noisy. Fix: PR #144 added the website-side analogue of the Worker's route allowlist via Astro middleware (`src/middleware.ts` → `INTERNAL_ENDPOINTS` set). Anonymous probes now 404 silently before the route handler runs. Real callers (Worker with bearer) reach the route handler unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-05-18 | **BL-039 fallback silently broken by Astro CSRF.** Smoke-testing PR #144 with a bearer-present POST returned 403 (not the expected 401). Root-caused to Astro's default `security.checkOrigin = true` — POST requests without a matching `Origin` header are rejected with 403 at the Astro layer (before the route handler). The Worker's BL-039 fallback fetch (in `inoreader-bl039-fallback.ts:80-83`, since deleted by PR #140) doesn't set `Origin`, so the fallback path has been silently broken since Astro v5+'s CSRF default flipped on. **Soak gate signal still valid**: "zero `triggerWebsiteRefresh` invocations" measures primary-path reliability; through Day 2 the primary (`inoreader-oauth.ts` Worker-direct refresh) has been stable + zero fallback invocations needed. **Decision**: accept the gap rather than fix for 5 days of life. PR #140 deletes the entire BL-039 fallback path on 2026-05-24 anyway; fixing the Origin header now would be ~30 LOC of code change to retire days later. Future cutover initiatives should test the rollback safety net end-to-end before relying on it as a soak protection.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-05-19 | **Cron is firing 4x/day but Sentry capture drops ~75% of success events.** Day-3 active verification surfaced an apparent cadence anomaly: only 6 `cron.radar-refresh.success` events visible in Sentry over 6 days, vs expected ~28. Investigation cleared cron itself — Cloudflare's cron event log shows all 4 daily firings in the past 24h with `Status: Success` and CPU times 64-86ms; today's 06:01 UTC firing had complete breadcrumbs in Sentry showing all 6 Inoreader fetches + 5 Upstash writes returning 200. The defect was purely on the observability path: `@sentry/cloudflare`'s scheduled-handler flush is best-effort, and when the radar refresh completes fast (~65ms CPU), the isolate teardown beats the Sentry HTTP POST. **Resolution**: PR #150 (`fix(mcp-cron): flush Sentry queue before scheduled-handler teardown`) shipped + deployed to production + staging same-day. Adds explicit `Sentry.flush(2000)` inside the scheduled handler's `ctx.waitUntil` so the isolate stays alive for the SDK transport to drain. Test coverage in `tests/unit/sentry.test.ts` (3 new tests on the `flushSentry` wrapper). **Verification**: next cron firing after deploy (00:00 UTC 2026-05-20) is the live test — Day-4 tick should confirm ~4 success events per 24h going forward. **Lesson**: in-soak fixes are appropriate when the issue is observability or operator-facing and the fix is narrowly scoped + well-tested.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-05-19 | **/health reports `inoreader: 'unknown'` ~98% of the time** even though Inoreader is healthy. Day-3 active verification showed `inoreaderObservedAt: null` despite recent cron firings; gitSha confirmed the new code was deployed. Root cause: `mcp:inoreader:last-status` had a 5-minute TTL in Upstash, but the cron only fires every 6 hours and the website (highest-volume consumer post-BL-032.8) only reads cached snapshots — never refreshing the key. So 5h 55m of every 6h interval was `'unknown'`. The original design assumed continuous MCP-tool traffic; that assumption is false post-Phase-A. **Resolution**: PR #152 (`feat(mcp-health): stale-while-OK semantics for inoreader observation`) shipped + deployed to production + staging same-day. The key now persists indefinitely; `inoreaderObservedSecondsAgo` and `inoreaderObservedSource` ('cron' \| 'live-tool') added to the response so readers compute their own staleness threshold. Backwards-compatible with the old entry shape (pre-2026-05-19 entries return `source: null` until rewritten). 4 new unit tests in `health.test.ts`. **Verification**: next cron firing populates the new-shape entry; `/health` then shows `inoreader: 'ok'` continuously between firings, with `observedSecondsAgo` growing predictably. **Operator value-add**: the new `inoreaderObservedSource` field gives a real product signal — if every observation for weeks is `source: 'cron'`, no human has triggered an MCP tool call, useful for measuring BL-033 pilot-client adoption.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-05-20 | **Day-4 verification: all three Day-3 fixes (PR #143, PR #150, PR #152) confirmed in production.** Health check at 07:45 UTC returned `inoreader: 'ok'`, `inoreaderObservedSource: 'cron'`, `inoreaderObservedAt: 2026-05-20T06:00:12.928Z`, `inoreaderObservedSecondsAgo: 17064` (~4.7h since the 06:00 UTC cron firing). The stale-while-OK contract is holding — the field stayed `'ok'` for 4.7h rather than flipping to `'unknown'` at the 5-min mark like before PR #152. Inoreader Developer Console showed 24% Zone-1 utilization at 07:45 UTC = 24 calls = exactly the expected post-PR-#143 baseline (4 cron firings × 6 calls). Comparing against pre-fix days: 11-15 May showed daily spikes to 80-110 calls (dual-cron era + initial Phase-A churn); 18-20 May settled into the steady 24-44 range. The chart visually confirms the budget regression is closed. All 4 daily passive monitoring signals clean. **Net Day-4 result**: substrate is operating exactly as the architecture predicts. Days 5-7 are routine tick-the-boxes if nothing else surfaces; PR #140 merge gate at 2026-05-24 stays on track.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-05-21 | **Inoreader day-counter undercounts true Zone-1 spend by 15-25%.** Day-5 observation: Inoreader Developer Console at 37% utilization by end-of-day vs the cron-only day-counter's implied prediction of 24%. Investigation traced the structural shape: the `mcp:inoreader:day-counter:<YYYY-MM-DD>` key is incremented only by [`incrementDayCounter` in `radar-refresh.ts:115`](../../../cron/radar-refresh.ts) and so tracks only the cron-radar fetch path. Two other Zone-1-consuming paths bypass it — OAuth token refresh calls (`/oauth2/token`, in `inoreader-oauth.ts`, ~4/day baseline = 1 per cron firing's proactive TTL check + ad-hoc on live-tool reactive 401-retry) and live cache-miss radar fetches (same `API_BASE` in `inoreader-client.ts` but invoked from live-tool paths when the 6h cache TTL has elapsed). Predicted post-fix baseline: 24 (cron) + 4 (OAuth) = **28/day**, matches 18-20 May observed exactly. Days exceeding 28 (e.g., today's 37) reflect 1-2 reactive OAuth refreshes from live tool calls + occasional cache-miss radar fetches (operational testing, dry-runs, slow-cron windows). **Soak-gate signal**: not soak-blocking. Substrate is operating correctly; cron's soft-cap protection (`counter + 6 > 94`) still works because the counter accurately measures the cron's contribution — which is what the cap gates. The gap is purely observability-side: the operator's mental model that "day-counter = total Inoreader spend" was wrong. **Resolution scope**: filed as BL-032.75 sub-deliverable § BL-032.8 Phase B soak findings → Inoreader spend accounting. The fix is a single-egress-wrapper refactor (~1-1.5 days engineering) that introduces a `fetchInoreaderZone1(env, url, init, category)` helper covering all three call sites, replaces the cron-only counter with a global `mcp:inoreader:zone1-spend:<YYYY-MM-DD>` counter + per-category breakdown, surfaces breakdown via `/health` for operator visibility, and revises the cron's soft-cap threshold to account for the OAuth refresh that now also increments. Full landscape (call sites, three implementation options, recommended hybrid, acceptance criteria, effort estimate) captured in BACKLOG.md so a future session executing the fix doesn't re-discover. **Why this matters for BL-033**: pilot-client traffic will inflate the live-tool category significantly; without per-category visibility the operator can't tell whether budget burn is internal cron drift or external client surge. **Lesson**: observability-counter correctness is itself a soak signal — the cron-radar counter was always meant as a budget-guard for the cron, not a global spend tracker, but the BL-032.8 rollout claims (line ~1200 of BACKLOG) framed it as canonical. Corrected in the same BACKLOG PR. |

---

## Soak completion record

Once Day 7 ticks clean and PR #140 merges, fill this in as the closure artifact:

- **Soak completed clean**: Yes / No (\***\*\_\_\_\*\***)
- **Final PR #140 merge date**: \***\*\_\_\_\*\***
- **Merge commit SHA**: \***\*\_\_\_\*\***
- **Operator who ran the gate**: \***\*\_\_\_\*\***
- **Post-merge gate cleared on**: \***\*\_\_\_\*\*** (Upstash database deleted)
- **Initiative closed in BACKLOG.md**: confirmed Yes / No

---

_Last updated: 2026-05-17 — soak gate opened alongside PR #140._
