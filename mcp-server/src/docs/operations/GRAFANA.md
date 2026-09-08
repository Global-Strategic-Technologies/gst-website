# Runbook — Grafana dashboard (Analytics Engine)

lastReviewedAt: 2026-09-08

The MCP server's metrics dashboard. Source of truth: [`mcp-server/observability/grafana-dashboard.json`](../../../observability/grafana-dashboard.json), guarded by `tests/unit/observability/grafana-dashboard.test.ts`.

**Status**: the dashboard artifact ships in this repo. **Creating the Grafana Cloud account, configuring the datasource and importing the JSON are operator tasks** and have not been done — this runbook is how to do them. Until then the dashboard exists as a file and nothing renders.

> **Why this was deferred so long.** BL-032.75 Phase 3 shipped the alert rules and `/status` in an account-free form in 2026-07 and recorded the dashboard as deferred with an explicit trigger: _until a Grafana Cloud account exists_. That trigger fired 2026-09-08.

## Plugin: Altinity ClickHouse, not Infinity

Cloudflare's own guidance is the **Altinity plugin for ClickHouse** (`vertamedia-clickhouse-datasource`). Until 2026-09-08 this repo recorded _Infinity_ in `slo-baselines.md` and `ARCHITECTURE.md` — that was wrong and would have cost you the first hour. Altinity supplies the `$timeSeries` and `$timeFilter` macros every time-series panel here depends on; Infinity has no equivalent and would force hand-rolled time bucketing.

## Setup

1. **Create a Grafana Cloud account** (free tier is sufficient at this volume) and install the **Altinity plugin for ClickHouse**.

2. **Reuse the existing AE token — do not mint a second.** The `Account | Account Analytics | Read` token the alert-evaluator cron already uses is account-scoped and works here unchanged. Minting procedure, if you need a fresh one: [DEPLOY.md § C.X](DEPLOY.md). Track rotation in [SECRETS_INVENTORY.md](../../../../src/docs/operations/SECRETS_INVENTORY.md).

3. **Configure the datasource**:
   - **URL**: `https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/analytics_engine/sql`
   - **Auth**: leave every built-in auth toggle **off**. The API does not use basic auth or a TLS client cert.
   - **Custom HTTP header**: `Authorization` = `Bearer <YOUR_AE_TOKEN>`. This is the only credential path.
   - **DateTime column**: `timestamp`, type DATETIME. **The macros do not expand without this** — a panel will fail with a confusing parse error rather than a missing-column one.

4. **Import** `observability/grafana-dashboard.json`. Grafana prompts for the datasource (the JSON ships a `DS_CLICKHOUSE` placeholder rather than a hard-coded UID, so it is portable between accounts).

5. **Pick the dataset.** The `dataset` template variable at the top switches between `mcp_events` (production) and `mcp_events_staging`. Staging is near-empty by design — no cron runs there and traffic is negligible — so verify against production.

## Verification checklist — this is the acceptance test

The dashboard's SQL was executed against the real AE API before shipping, so the queries are known-valid. **What was never verified is whether Grafana renders them**, because that needs an account. Walk this list once after import:

| Panel                               | Expect                                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| Trial signups over time             | **Empty until the trial goes live in production.** Not a defect.                                    |
| Signup outcomes in window           | Empty likewise. Once live: `minted` / `reissued` are successes, everything else a refusal or fault. |
| Distinct active trials              | Empty likewise.                                                                                     |
| Per-trial call volume               | Empty likewise.                                                                                     |
| Invocations over time, by primitive | Rows for `tool_invocation`, and `resource_read` / `prompt_invocation` if either has traffic.        |
| Invocations over time, by keyOwner  | One series per team key plus `__none__` for unauthenticated/cron.                                   |
| Top tools in window                 | The tools actually being called.                                                                    |
| Status codes                        | Mostly `200`.                                                                                       |
| Tool latency percentiles            | p50/p95/p99 per tool. Compare against `/status` — same query shape, so they should agree.           |
| Outcomes by tool                    | `success` dominant; a tool appearing only as `error` is worth chasing.                              |
| Zone-1 calls over time              | Radar-refresh cadence. Cross-check against the Zone-1 spend badge on `/status`.                     |
| Inoreader calls by category         | `oauth-refresh` appears here but not in the Zone-1 panel — that is correct, it is not Zone-1.       |

### When a panel is empty

Three different causes look identical in Grafana, and only the last is a defect:

| Cause                             | How to tell                                                                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nothing emits this event type** | Should be impossible — the guard test forbids panels over the five non-emitting types. If you see one, the guard was bypassed.                  |
| **No traffic in the window**      | Widen the time range. Trial panels are expected empty until go-live; a quiet weekend empties others.                                            |
| **Broken query**                  | Grafana shows a query error, not an empty chart. Copy the SQL into the `curl` probe from [DEPLOY.md § C.X](DEPLOY.md) to see the dialect error. |

## Reading the numbers correctly

- **Every count is `sum(_sample_interval)`, never `count()`.** AE samples; an unweighted count silently under-reports. Same for `quantileWeighted` over bare `quantile`. The guard test enforces this on every panel.
- **`GROUP BY` names raw columns, never `SELECT` aliases** — the AE dialect rejects the alias. Also guard-enforced.
- **`uniq()` has no sample correction.** The _Distinct active trials_ panel is exact while the dataset is unsampled and a **lower bound** once it is not, dropping the quietest talkers first. It under-reports, never over-reports. For an exact count of live trials, use `GET /admin/oauth/m2m-clients` and count `tier === 'trial'` — AE is the history, KV is the present. Full reasoning: [ADR-0031](../../../../src/docs/adr/0031-per-client-analytics-identity-is-a-blob.md).

## What the dashboard deliberately omits

Five of the twelve event types declared in `src/metrics/_schema.ts` **emit nothing in production**. Panels over them would render empty charts that read as _good news_ — "no throttling", "all healthy" — so they are absent by design and the guard test fails if one is added:

- `rate_limit_decision` and `health_check` — declared, **no emitter anywhere**. Tracked as BL-157.
- `prompt_span`, `wrong_irl_detected`, `gate_elided` — emitter functions exist, nothing calls them.

Also omitted, for different reasons: `audit_batch` (emitted, but the pipeline is deactivated — ADR-0014), and `cron_outcome` (genuinely live, but `/status` and the seven alert rules already cover cron health).

## Relationship to `/status`

They are different instruments, not duplicates:

- **`/status`** ([STATUS_PAGE.md](STATUS_PAGE.md)) is public, precomputed by the 15-minute cron into Upstash, and answers _"is the server healthy right now"_. It never live-queries AE.
- **This dashboard** is operator-only, live-queries AE, and answers _"what has traffic been doing, and who is doing it"_.

Where they overlap — tool latency percentiles — they run the same query shape, so a disagreement means one of them is stale, not that the server changed.

## Still missing

**No alert fires on any of this.** The seven canonical rules ([alert-rules.ts](../../observability/alert-rules.ts)) do not cover trial signup volume, signup failure rate, or a dead signup endpoint. These panels are pull, not push — you have to look. Adding a signup-health rule to the existing evaluator is the natural next step and would catch the unbound-secret 503 that is currently invisible.
