# MCP Server — SLO Baselines

> **Source initiative**: [BL-032.75 Phase 2](../../src/docs/development/MCP_SERVER_OBSERVABILITY_BL-032_75.md#phase-2--baselining-7-days-calendar-wait--1-day-engineering)
>
> **Status**: 🟡 **Baselining window started 2026-05-31** — Phase 1 instrumentation ✅ shipped + AE emission live across all 10 tools, 5 resources, all prompts, and the `inoreader_call` chokepoint. This document is populated at the close of the 7-day baselining window (next-action 2026-06-07).
>
> **What this doc becomes**: measured p50/p95/p99 latency per Tool/Resource/Prompt, Inoreader spend by category, sustained error rates per scope, plus the **calibrated SLO targets** derived from those baselines via the per-metric-kind rules documented in the design doc § "What good observability looks like."

---

## Baselining window

| Field                    | Value                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Started                  | 2026-05-31 (with the Phase 1 honest-closure PR)                                                                                       |
| First data-pull deadline | 2026-06-07                                                                                                                            |
| Window length            | 7 calendar days (revised from 10-14; internal-only traffic captures weekly seasonality in 7 days)                                     |
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
3. For each `event_type` × `name` × `outcome` combination, pull p50/p95/p99 latency from `mcp_events`:
   ```sql
   SELECT blob1 AS event_type,
          blob2 AS name,
          blob4 AS outcome,
          quantileWeighted(0.5, double1, _sample_interval) AS p50_ms,
          quantileWeighted(0.95, double1, _sample_interval) AS p95_ms,
          quantileWeighted(0.99, double1, _sample_interval) AS p99_ms,
          sum(_sample_interval) AS event_count
   FROM mcp_events
   WHERE timestamp >= NOW() - INTERVAL '7' DAY
   GROUP BY event_type, name, outcome
   ORDER BY event_count DESC
   ```
4. For Inoreader spend by category, filter on `event_type='inoreader_call'`:
   ```sql
   SELECT blob3 AS category,
          blob7 AS zone1,
          blob5 AS status_code,
          sum(_sample_interval) AS call_count
   FROM mcp_events
   WHERE blob1 = 'inoreader_call'
     AND timestamp >= NOW() - INTERVAL '7' DAY
   GROUP BY category, zone1, status_code
   ORDER BY call_count DESC
   ```
5. Calibrate SLO targets per the per-metric-kind rules in the design doc:
   - **Latency**: target = `p95_baseline × 1.5`
   - **Availability**: error-budget floor (0.5% sustained, 5% spike-tolerable for 5 min)
   - **Throughput**: target = `peak_observed × 1.3` (30% headroom)
   - **Freshness**: target = `2 × cron-interval` (BL-032.7 cron is 6h, so freshness SLO = 12h)
6. Senior-engineer review of the proposed targets; record sign-off below.
7. Replace this whole "Baselining window" section with the **filled-in baselines table** and the **SLO targets table**.

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

Once this doc is filled and signed off, Phase 3 (dashboards + alerts) can begin:

- Grafana Infinity datasource pointed at `POST /accounts/{id}/analytics_engine/sql`
- 7 canonical alert rules per design doc § "Alerts" (latency p95 over target × 1.2; error rate over budget floor; scope-mismatch 403 rate; OAuth refresh failure rate; Sentry envelope POST failure rate; cron drift > 2× cron-interval; AE freshness lag)
- Each alert routed via existing Sentry alert infra; thresholds derived from the SLO targets above
