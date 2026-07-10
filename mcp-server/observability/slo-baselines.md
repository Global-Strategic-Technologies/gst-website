# MCP Server — SLO Baselines

> **Source initiative**: [BL-032.75 Phase 2](../../src/docs/development/MCP_SERVER_OBSERVABILITY_BL-032_75.md#phase-2--baselining-7-days-calendar-wait--1-day-engineering)
>
> **Status**: 🟡 **Fill in progress (2026-07-10)** — Phase 1 instrumentation ✅ shipped + AE emission live across all 10 tools, 5 resources, all prompts, and the `inoreader_call` chokepoint. The original 2026-06-07 data-pull deadline was **missed** (this doc sat untouched for ~5 weeks); the pull is being re-run on a fresh trailing-7-day window, which is preferable anyway — the AE stream now includes the BL-045/071/076 instrumentation added since the original window and reflects current traffic shape.
>
> **What this doc becomes**: measured p50/p95/p99 latency per Tool/Resource/Prompt, Inoreader spend by category, sustained error rates per scope, plus the **calibrated SLO targets** derived from those baselines via the per-metric-kind rules documented in the design doc § "What good observability looks like."

---

## Baselining window

| Field                    | Value                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Started                  | 2026-05-31 (with the Phase 1 honest-closure PR)                                                                                       |
| First data-pull deadline | 2026-06-07 — **missed**; no pull ran                                                                                                  |
| Actual pull window       | trailing 7 days at re-run (2026-07-10 procedure) — dates recorded in the generated comment above the filled tables below              |
| Window length            | 7 calendar days (revised from the backlog AC's 10-14; internal-only traffic captures weekly seasonality in 7 days)                    |
| Traffic profile          | Normal team usage — no synthetic load injection. The point is to observe what production actually does, not what a benchmark might do |

## Data-pull procedure (run 2026-06-07)

1. Bind the operator AE read token + account ID locally:
   ```powershell
   $env:CF_AE_TOKEN = '<token from 1Password — gst-mcp-ae-read>'
   $env:CLOUDFLARE_ACCOUNT_ID = '<account id>'
   ```
2. Run the verification probe against production to confirm events are flowing:
   ```powershell
   .\mcp-server\scripts\Verify-AeEmission.ps1 -Env production -WindowHours 168
   ```
3. Run the scripted pull — it executes both baselining queries and prints paste-ready
   markdown for the three tables below:

   ```powershell
   npm -w @gst/mcp-server run ae:baseline -- --env production --window-days 7
   ```

   The queries live in [`scripts/invoke-ae-baseline.mjs`](../scripts/invoke-ae-baseline.mjs)
   (`buildBaselineQueries`, unit-tested). Column map per `src/metrics/_schema.ts`:
   latency groups by raw `blob1/blob2/blob4` (event_type/name/outcome) with
   `quantileWeighted(p, double1, _sample_interval)`; Inoreader spend reads
   `blob2 AS category, blob7 AS zone1, blob6 AS status_code`.

   > **2026-07-10 correction**: this doc's original inline Query 2 predated the
   > finalized AE schema and read `blob3 AS category` / `blob5 AS status_code`
   > (blob3 is `keyOwner`; blob5 is `correlation_id`). The script carries the
   > corrected column map and a regression test locks it.

4. Calibrate SLO targets per the per-metric-kind rules in the design doc (the script
   pre-applies these and emits a proposed-targets table for review):
   - **Latency**: target = `p95_baseline × 1.5`
   - **Availability**: error-budget floor (0.5% sustained, 5% spike-tolerable for 5 min)
   - **Throughput**: target = `peak_observed × 1.3` (30% headroom)
   - **Freshness**: target = `2 × cron-interval` (BL-032.7 cron is 6h, so freshness SLO = 12h)
5. Senior-engineer review of the proposed targets; record sign-off below.
6. Replace this whole "Baselining window" section with the **filled-in baselines table** and the **SLO targets table**.

## Filled baselines (populate 2026-06-07)

> Empty until the window closes. Schema preview below so the future fill-in is structured consistently.

### Latency baselines (per tool/resource/prompt)

| event_type | name | outcome | event_count | p50_ms | p95_ms | p99_ms |
| ---------- | ---- | ------- | ----------- | ------ | ------ | ------ |
| _(TBD)_    |      |         |             |        |        |        |

### Inoreader spend by category

| category | zone1 | status_code | call_count | notes |
| -------- | ----- | ----------- | ---------- | ----- |
| _(TBD)_  |       |             |            |       |

### Proposed SLO targets (post-calibration)

| Surface | Metric | Baseline | Target | Justification |
| ------- | ------ | -------- | ------ | ------------- |
| _(TBD)_ |        |          |        |               |

### Sign-off

| Reviewer | Date | Decision |
| -------- | ---- | -------- |
| _(TBD)_  |      |          |

---

## Phase 3 unblock criteria

Once this doc is filled and signed off, Phase 3 (alerts + status surface; dashboards deferred) can begin:

- **7 canonical alert rules** per the design doc § "Alerts" table (the authoritative set —
  an earlier revision of this list here had drifted from it): `inoreader-budget-exhausted`,
  `radar-snapshot-stale`, `health-check-failing`, `traffic-spike-detected`,
  `scope-mismatch-403-rate`, `oauth-refresh-failure-rate`, `sentry-envelope-post-failure-rate`
- Alerts evaluated by a scheduled Worker cron querying AE + Upstash directly and routed
  through the existing Sentry envelope infra (fingerprinted issue events → email rules);
  thresholds derived from the signed-off SLO targets above
- Grafana Infinity datasource pointed at `POST /accounts/{id}/analytics_engine/sql` —
  **deferred** until a Grafana Cloud account exists (recorded in the design doc as the
  remaining Phase 3 item)
