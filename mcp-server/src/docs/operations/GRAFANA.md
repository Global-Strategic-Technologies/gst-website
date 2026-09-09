# Runbook — Grafana dashboard (Analytics Engine)

lastReviewedAt: 2026-09-09

The MCP server's metrics dashboard. Source of truth: [`mcp-server/observability/grafana-dashboard.json`](../../../observability/grafana-dashboard.json), guarded by `tests/unit/observability/grafana-dashboard.test.ts`.

**Status**: LIVE. The Grafana Cloud account exists, the datasource is configured against the existing AE read token, and the dashboard was imported and serving production data on **2026-09-08**. This runbook is still how to (re)do the setup — an operator on a fresh account needs every step below — and the JSON in this repo remains the source of truth, so **a change here means a re-import**. The BL-158 and BL-159 rewrites were imported and probed on **2026-09-09**: all sixteen panels executed, zero merge flags, and the two BL-159 panel defects are confirmed fixed against live data. No import is outstanding.

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
   - **DateTime column**: nothing to set here. Every target in the shipped JSON already carries `dateTimeColDataType: "timestamp"` and `dateTimeType: "DATETIME"`, which is what the `$timeSeries` / `$timeFilter` macros expand against. (This step previously described it as a datasource-level setting; it is per-target. Left in place because a panel you build by hand in the UI **does** need it, and without it fails with a confusing parse error rather than a missing-column one.)

4. **Import** `observability/grafana-dashboard.json`. Grafana prompts for the datasource (the JSON ships a `DS_CLICKHOUSE` placeholder rather than a hard-coded UID, so it is portable between accounts).

5. **Pick the dataset.** The `dataset` template variable at the top switches between `mcp_events` (production) and `mcp_events_staging`. Staging is near-empty by design — no cron runs there and traffic is negligible — so verify against production.

## Verification checklist — this is the acceptance test

**The first execution against real data found two defects the guard could not — read this before trusting a panel.** The dashboard shipped 2026-09-08 verified mechanically only; within the hour of BL-155's first production mint making the trial panels non-empty, executing the SQL surfaced BL-158: five time-series panels split with `GROUP BY`, which the Altinity plugin merges into a **single** line rather than one series per value (not empty, not erroring — wrong in a way that reads as right), and a `uniq()` that is absent from Cloudflare's aggregate reference. Both are fixed: the splits are now one `sumIf()` column per value, the distinct count is the documented `count(DISTINCT blob8)`, and the guard test now pins the series shape and an aggregate allowlist so both classes fail a build rather than a panel.

The lesson stands regardless: **a query can be syntactically valid, dialect-correct, schema-bound, sample-weighted, and still answer a different question than its title claims.** Mechanical verification cannot reach that; execution can, and did, in minutes.

**Run the probe before you trust a panel.** `scripts/Probe-DashboardSql.ps1` is the one to reach for: it reads the queries out of `grafana-dashboard.json` itself, rewrites the Grafana macros, executes every one against production and reports the **column names** each returns — so it cannot drift out of step with the panels the way a hand-copied query does. It found all four BL-159 defects on its first run. `scripts/Verify-AeEmission.ps1` answers a different question (is emission working at all, over a fixed query set), and the `curl` shape in [DEPLOY.md § C.X](DEPLOY.md) is there for a single ad-hoc query.

**Check the shape, not just the row count** — that is what BL-158 turned on: a merged split still returns rows, and looks fine until you notice the legend has one entry where it should have several. BL-159 added the sharper version of the same lesson: _Status codes_ returned a perfectly healthy-looking 863 events, collapsed into a single row whose code was the empty string.

Then walk this list once after import:

| Panel                                     | Expect                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trial signups over time                   | Live since 2026-09-08. One series per outcome — if you see a single series named `n`, you are on the pre-BL-158 JSON and the split is merged.                                                                                                                                                            |
| Signup outcomes in window                 | Live. `minted` / `reissued` are successes, everything else a refusal or fault.                                                                                                                                                                                                                           |
| Distinct active trials                    | Live. A number, not an error — if it errors, `count(DISTINCT)` is unsupported and BL-158's Defect 2 needs reopening.                                                                                                                                                                                     |
| Per-trial call volume                     | Live once a trial actually calls a tool; a minted-but-unused trial shows nothing here.                                                                                                                                                                                                                   |
| Invocations over time, by primitive       | Rows for `tool_invocation`, and `resource_read` / `prompt_invocation` if either has traffic.                                                                                                                                                                                                             |
| Top keyOwners in window                   | A **table**, one row per team key plus `__none__` for unauthenticated/cron, highest volume first. Deliberately not a timeseries: splitting one needs a column per value, and the keyOwner roster grows whenever a key is issued (BL-158).                                                                |
| Top tools in window                       | The tools actually being called.                                                                                                                                                                                                                                                                         |
| Status codes (events that record one)     | Rows keyed by (event type, code): Inoreader `200`s, any trial `503`, `429`s from rate-limit denies, `403`s from scope denials. **Until BL-159 this panel read the three request primitives, none of which write `status_code`, and returned exactly one row — the empty string — over 863 invocations.** |
| Upstream I/O wait per tool                | Only tools with a non-zero p99. A compute-only tool is absent, not zero — Workers freeze the clock outside I/O, so `duration_ms` is upstream wait, not handler time (BL-122). Empty here means no tool had measurable I/O wait; check _Top tools in window_ to tell that apart from no traffic.          |
| Outcomes by tool                          | `success` dominant; a tool appearing only as `error` is worth chasing.                                                                                                                                                                                                                                   |
| Refusals over time, by outcome            | `deny` and `throttle` only — **there is no `allow` series, by design** (ADR-0032). Empty is plausible: it means nobody hit a wall in the window.                                                                                                                                                         |
| Refusals by client and responsible bucket | Which client hit which limit. `blob8` is empty for static bearer keys — they have no per-client identity, which is not a defect.                                                                                                                                                                         |
| Trial paywall hits over time              | Live. Empty means no trial has reached for a radar tool yet — plausible, and not a defect.                                                                                                                                                                                                               |
| Which radar tools trials ask for          | The upgrade-intent ranking, not a fault list. Empty until a trial hits the paywall.                                                                                                                                                                                                                      |
| Zone-1 calls over time                    | Radar-refresh cadence. Cross-check against the Zone-1 spend badge on `/status`.                                                                                                                                                                                                                          |
| Inoreader calls by category               | `oauth-refresh` appears here but not in the Zone-1 panel — that is correct, it is not Zone-1.                                                                                                                                                                                                            |

### When a panel is empty

Three different causes look identical in Grafana, and only the last is a defect:

| Cause                             | How to tell                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nothing emits this event type** | Should be impossible — the guard test forbids panels over the four non-emitting types. If you see one, the guard was bypassed.                                                                                                                                                                                                                                                        |
| **No traffic in the window**      | Widen the time range. A quiet weekend empties several. As of 2026-09-09 the trial panels are live but thin (1 minted), and the tier-denial pair is still legitimately empty — no trial has hit the radar paywall yet.                                                                                                                                                                 |
| **Broken query**                  | Grafana shows a query error, not an empty chart. Copy the SQL into the `curl` probe from [DEPLOY.md § C.X](DEPLOY.md) to see the dialect error. Every panel has now been executed against production at least once (2026-09-09), so this is no longer the odds-on cause it was at first import — suspect a hand-edit in the Grafana UI, or a JSON change that has not been re-probed. |

**`HAVING` is confirmed working against AE (2026-09-09).** _Upstream I/O wait per tool_ uses it to drop tools with a zero p99. It shipped as the only construct in the dashboard this repo had never executed — documented in AE's `SELECT` grammar, but documented is not the same as tried — and the first probe run after import returned rows with no dialect error. **Analytics Engine accepts `HAVING`.** It parsed _and filtered semantically_, which is the stronger claim and the one actually worth recording: `search_portfolio` served 279 successful calls in that same window and is correctly absent from the panel, so the `HAVING p99 > 0` clause did its job rather than merely being tolerated. Recorded here because the absence of a construct from a vendor's examples is not evidence it is rejected, and this is now the second time that has been settled by executing rather than by reading (the first was `count(DISTINCT)`, BL-158).

The contingency is kept because it is the fallback if the dialect ever narrows: `WHERE double1 > 0` is **not equivalent — do not swap it in silently.** `HAVING` filters after aggregation, so a tool keeps every one of its calls and is judged on the p99 of all of them. `WHERE` drops the zero rows first, which for a cache-hit-heavy tool discards most of its calls and biases p50 upward — the panel would then read as "this tool is slow" when it means "this tool rarely reaches the network". If you ever make that swap, say so in the panel description.

## Reading the numbers correctly

- **Check `Top keyOwners` before reading any other number.** On 2026-09-09 it showed `PROBE` accounting for **all 863** tool invocations in the window — i.e. the entire dashboard was describing the synthetic latency probe, with no client tool calls at all. That is not a fault, it is the thin-traffic reality the 2026-07-14 baseline recorded, but it changes what every latency and volume panel _means_. A p99 over probe traffic is a statement about the probe's route, not about a client's experience. See [LATENCY_PROBE.md](LATENCY_PROBE.md).
- **Every count is `sum(_sample_interval)`, never `count()`.** AE samples; an unweighted count silently under-reports. Same for `quantileWeighted` over bare `quantile`. The guard test enforces this on every panel.
- **`GROUP BY` names raw columns, never `SELECT` aliases** — the AE dialect rejects the alias. Also guard-enforced.
- **A distinct count has no sample correction.** The _Distinct active trials_ panel uses `count(DISTINCT blob8)` — which is **not** the corrected `count()` above: that one is the plain row counter, this one counts distinct values and cannot be weighted back, because sampling drops whole rows. So the panel is exact while the dataset is unsampled and a **lower bound** once it is not, dropping the quietest talkers first. It under-reports, never over-reports. For an exact count of live trials, use `GET /admin/oauth/m2m-clients` and count `tier === 'trial'` — AE is the history, KV is the present. Full reasoning: [ADR-0031](../../../../src/docs/adr/0031-per-client-analytics-identity-is-a-blob.md).

## What the dashboard deliberately omits

Four of the fourteen event types declared in `src/metrics/_schema.ts` **emit nothing in production**. Panels over them would render empty charts that read as _good news_ — "all healthy" — so they are absent by design and the guard test fails if one is added:

- `health_check` — declared, **no emitter anywhere**. `/status` health comes from live probes, not AE. Tracked as BL-157.
- `prompt_span`, `wrong_irl_detected`, `gate_elided` — emitter functions exist, nothing calls them. Also BL-157.

Also omitted, for different reasons: `audit_batch` (emitted, but the pipeline is deactivated — ADR-0014), and `cron_outcome` (genuinely live, but `/status` and the seven alert rules already cover cron health).

**`rate_limit_decision` left this list on 2026-09-08** — BL-157 wired its emitter. One thing about it is deliberately partial, and the panels will look wrong if you don't know it: it is emitted **only on refusal**, never on `allow`, so there is no allow series and no exact denial _rate_. An `allow` event would fire on every authenticated request and push this dataset toward sampling, which silently degrades the distinct-count panel above. Reasoning, rejected alternatives and revisit triggers: [ADR-0032](../../../../src/docs/adr/0032-rate-limit-decisions-emit-only-on-refusal.md). A separate guard fails the build if a panel ever filters on `'allow'`, since that series would be permanently empty and read as "nothing is getting through".

## Relationship to `/status`

They are different instruments, not duplicates:

- **`/status`** ([STATUS_PAGE.md](STATUS_PAGE.md)) is public, precomputed by the 15-minute cron into Upstash, and answers _"is the server healthy right now"_. It never live-queries AE.
- **This dashboard** is operator-only, live-queries AE, and answers _"what has traffic been doing, and who is doing it"_.

Where they overlap — upstream I/O wait per tool — they measure the same thing and filter to the same rows (non-zero p99), so a disagreement means one is stale rather than that the server changed. They do it at different layers, which matters if you are debugging the pair: `/status` filters at render and keeps the unfiltered rows so it can distinguish "no invocations at all" from "traffic existed, none measurable"; the dashboard filters in SQL via `HAVING` and cannot, which is why its panel description points at the neighbouring panel instead.

## Still missing

**No alert fires on any of this.** The seven canonical rules ([alert-rules.ts](../../observability/alert-rules.ts)) do not cover trial signup volume, signup failure rate, or a dead signup endpoint. These panels are pull, not push — you have to look. Adding a signup-health rule to the existing evaluator is the natural next step and would catch the unbound-secret 503 that is today merely **un-alerted** rather than invisible. It is visible on two panels right now: the 2026-09-09 probe run showed `unavailable: 2` at status 503 against `minted: 1` (operator test traffic — see immediately below, and do not read it as a past outage).

**Read that example carefully, because it is also the warning.** Those two 503s were the operator's own integration testing, not an outage — and **nothing in the event says so.** A `503` from a deliberately-unbound secret and a `503` from a real one are the same row here. Signup is unauthenticated, so there is no caller identity to exclude on the way the traffic-spike rule excludes `keyOwner = 'PROBE'`. Any signup-health rule therefore needs either a test-only marker on the request or an explicit acceptance that it will page on hand-tests, and its threshold must not be calibrated from the go-live window at all.
