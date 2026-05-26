# MCP Server — Production Observability Maturity (BL-032.75)

> **Backlog initiative**: [BL-032.75: MCP Server — Production Observability Maturity](BACKLOG.md#bl-03275-mcp-server--production-observability-maturity)
>
> **Predecessors**:
>
> - [MCP_SERVER_ARCHITECTURE_BL-031.md](MCP_SERVER_ARCHITECTURE_BL-031.md) — overall MCP architecture, repo placement, lifecycle. Read first.
> - [BL-032 in BACKLOG.md](BACKLOG.md#bl-032-mcp-server--internal-remote-phase-2) — the remote substrate whose observability this initiative extends.
> - [MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md) — Tools+Resources+Prompts surface this initiative observes. ✅ Shipped 2026-05-13 (BL-032.5 Phase 4 manifest discipline + Cron triggers live).
> - [BL-032.7 in BACKLOG.md](BACKLOG.md#bl-0327-mcp-server--inoreader-substrate-safety--observability) — ✅ Shipped 2026-05-16. Delivered three observability primitives this initiative would otherwise have had to build: unified `handleInoreaderFailure`, 429 X-Reader-\* headers as Sentry structured tags (`inoreader.zone1.usage` / `.limit` / `.reset_after_seconds`), and day-counter accuracy (success-only increments).
> - [MCP_SERVER_RADAR_UNIFICATION_BL-032_8.md](MCP_SERVER_RADAR_UNIFICATION_BL-032_8.md) — Phase A ✅ shipped 2026-05-17 (PR #139); Phase B pending merge on PR #140. Surfaced the Inoreader **spend-accounting day-counter completeness gap** (Day-5 soak finding, 2026-05-21) — folded into this initiative as a sub-deliverable; see BACKLOG entry § "Inoreader spend accounting" for the 200-line scoping note.
>
> **Sequel**: [BL-033 in BACKLOG.md](BACKLOG.md#bl-033-mcp-server--external-pilot-phase-3) — the contractual-SLA phase that this initiative makes operationally defensible.
>
> **Scope**: this document covers [BL-032.75](BACKLOG.md#bl-03275-mcp-server--production-observability-maturity) — extending the structured-logs + `/health` baseline from BL-032 into a full observability surface (SLO dashboards, alerting, anomaly detection, error-budget tracking) that lets GST commit to the contractual uptime/latency SLAs BL-033 requires.
>
> **Status**: Open — partial substrate shipped via adjacent initiatives (see Predecessors + § "What's already in place" below). The remaining work is typed metric emitters → Cloudflare Analytics Engine → Grafana dashboards → alert wiring + runbooks. Two sub-deliverables added since original filing: K-section evidence-driven mitigations (BACKLOG, 2026-05-12; partially shipped) and the Inoreader spend-accounting day-counter gap (BACKLOG, 2026-05-21; not yet started — blocks meaningful budget-burn dashboards).

---

## Context

### What's already in place (as of 2026-05-25)

The original 2026-04-25 version of this doc accurately described the BL-032 baseline ("structured JSON logs + `/health` + Sentry"). Five weeks of adjacent shipping have substantially extended that baseline. Before scoping new work, here's the current substrate:

**BL-032.7** (✅ shipped 2026-05-16, `302c625` / `bba2a46` / `2597854`):

- `handleInoreaderFailure` unified — cron, search_radar, and get_latest_insights all route Inoreader failures through one module that opens the circuit breaker, increments the day-counter only on success (T.Z.1), and emits a Sentry capture with severity. Replaces three independent failure paths that drifted in spec.
- **429 X-Reader-\* headers as Sentry structured tags** (T.Z.3): `inoreader.zone1.usage`, `inoreader.zone1.limit`, `inoreader.reset_after_seconds`, plus a 200-char body excerpt in `extra`. Sentry-UI RCA on a rate-limit event is now a 30-second tag read instead of a multi-hour Inoreader-dashboard hunt.
- `captureMessage` wired into auth-fail and inoreader-rate-limit paths (T.E.11 / T.E.12 closure) so probe bursts and breaker-open events emit Sentry breadcrumbs without burning quota.

**BL-032.8 Phase A** (✅ shipped 2026-05-17, PR #139):

- `/health` extended with `inoreaderObservedAt` / `inoreaderObservedSecondsAgo` / `inoreaderObservedSource` so operators can confirm the last successful Inoreader call without leaving the endpoint. Soak-validated.
- mcp-health stale-while-OK semantics (PR #152) — the health probe distinguishes "Inoreader unreachable right now" from "Inoreader fine; observed N seconds ago via cron." Prevents spurious /health 503s under transient upstream blips.
- `SECRETS_INVENTORY.md` (PR #149) — operator runbook for which secret lives where, which DB, which environment.

**Cron observability** (✅ shipped 2026-05-25, `0.3.12` + `0.3.13`):

- `Sentry.withMonitor` wraps every cron firing — emits `in_progress` / `ok` / `error` check-ins to Sentry Crons. Monitor auto-creates on first check-in. **Caveat**: the Sentry Crons dashboard surface is uneven on free-tier accounts; the operator-facing visibility is currently on Cloudflare's cron dashboard, with Sentry Issues view receiving the exception capture on failure. Resolving full Sentry Crons UI visibility is a sub-deliverable here (paid-tier evaluation or alternate Sentry account).
- Outer try/catch around the IIFE swallows Sentry-plumbing throws (flushSentry rejection, ingest network blip) so `ctx.waitUntil` resolves cleanly regardless of Sentry-side failures. Cloudflare's cron-dashboard `Success` / `Error` status is now load-bearing-correct.

**BL-032.5 Phase 4 manifest discipline** (✅ shipped 2026-05-13):

- Tool / Resource / Prompt registry produces a deterministic manifest hash; CI test fails on any drift. Already gives us "what's exposed" attestation; trivially extends to "what's measured" once metric emitters land.

### What's still missing

The work in this initiative is the bridge from "we have rich captures + a /health endpoint" to "we have an operations posture." Specifically:

- **Typed metric emitters** — Sentry tags + safeLog give us debugging signal per event but no aggregated time-series. Cloudflare Analytics Engine binding is the missing piece; once wired, every existing safeLog can dual-emit a structured event for SQL-queryable rollups.
- **SLO definitions** with budgets and burn rates, per Tool / per Resource / per Prompt — calibrated against the 5 weeks of post-BL-032 production traffic we now have.
- **Dashboards** for latency histograms, error rates, traffic by key, Inoreader budget burn-down, radar snapshot freshness. Grafana Cloud free-tier sufficient at projected volume.
- **Alerting integrations** so problems wake someone up at 80% budget exhaustion, not at 100%. PagerDuty for hard pages, Slack for tickets.
- **Anomaly detection** to surface abuse patterns (one key bursting 50× normal traffic) before rate limits paper over them.
- **Inoreader spend-accounting fix** (sub-deliverable from BL-032.8 Day-5 soak, BACKLOG 2026-05-21) — day-counter undercounts by 15-25% because it only tracks cron-radar fetches; OAuth refresh + live-tool refresh + cache-miss live-radar all bypass it. Until this is fixed, the "alert at 70% budget" SLO from this doc's § 2 is structurally unmeasurable. Blocking dependency for any meaningful budget-burn dashboard.
- **K-section tool-description tightening** (sub-deliverable from BL-032 K-section soak, BACKLOG 2026-05-12) — partially shipped (search_regulations, search_portfolio, ICG, REMOTE_CLIENT_SETUP addendum). One open item: `generate_diligence_agenda` USAGE RULE elevation for the `'unknown'` sentinel discipline.
- **Result-shape enrichments** (sub-deliverable, BACKLOG 2026-05-12) — three open items: `oldestItemDaysAgo` on radar tools, `triggerQuestionAnswered` on ICG recommendations, fix accounting math on ICG `answeredCount`.
- **Status page** that BL-033 publishes to clients.

None of this is novel. Cloudflare's Analytics Engine + Grafana + a Slack webhook covers the metrics-and-alerting stack at near-zero marginal cost. The work is in (1) closing the spend-accounting gap so the dashboards are honest, (2) choosing the right SLO targets against measured baselines, and (3) wiring the alerts so they fire before incidents become outages.

---

## Why this earns its own initiative (rather than living inside BL-032 or BL-033)

**Not BL-032** because BL-032's job is to ship the remote substrate. Asking it to also ship a complete observability stack would push it from a one-week milestone into multi-week territory and risk neither piece landing.

**Not BL-033** because by then the SLAs are already contractually committed. SLO baselines need to come from real production traffic, which means BL-032 must already be running and producing data before the SLOs can be defined. Putting observability inside BL-033 would force "guess at SLO targets, then commit to them in legal paper" which is exactly the sequence that produces broken contracts.

**Its own initiative** because:

1. The competency is operations engineering — different from the "build the auth surface" or "build the audit log" focus of the bracket initiatives
2. The work is sequenced by **measured production data**, not by code dependencies — running BL-032/BL-032.5 in production for 1-2 weeks is a prerequisite, and that wait is hard to schedule inside a single milestone
3. The output is dashboards + runbooks + alert rules, not server code — review and approval pattern is different
4. The downstream value (BL-033 can sign SLAs from a place of measured baselines) is concrete and worth a separately-tracked deliverable

---

## What "good observability" looks like for an MCP server

Three layers, each with a clear purpose:

### 1. Metrics — what's happening, in numbers

Per-Tool / per-Resource / per-Prompt counters and histograms emitted to Cloudflare Analytics Engine (built into Workers; SQL-queryable; free tier covers projected traffic). The "Already emitted?" column reflects what BL-032 / BL-032.7 / BL-032.8 already write — typically via `safeLog` or Sentry tags. The 032.75 work formalizes these as **typed metric emitters** that dual-write to Analytics Engine for SQL rollups:

| Metric                           | Type      | Dimensions                                                               | Already emitted?                                                 | Purpose                                              |
| -------------------------------- | --------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------- |
| `mcp_tool_invocations_total`     | Counter   | `tool`, `key_prefix`, `success`                                          | Partial — safeLog has all dims; no aggregation surface           | Volume by tool and outcome                           |
| `mcp_tool_duration_ms`           | Histogram | `tool`                                                                   | Partial — durationMs in safeLog                                  | Latency distribution per tool                        |
| `mcp_resource_reads_total`       | Counter   | `resource_uri_prefix` (e.g. `gst://library/`), `cache_status` (hit/miss) | No                                                               | Resource access volume + cache effectiveness         |
| `mcp_prompt_invocations_total`   | Counter   | `prompt_name`, `key_prefix`                                              | No                                                               | Prompt usage by name                                 |
| `mcp_prompt_tool_fanout`         | Histogram | `prompt_name`                                                            | No                                                               | Tools invoked per prompt — tracks orchestration cost |
| `mcp_rate_limit_decisions_total` | Counter   | `key_prefix`, `decision` (allow/throttle/deny)                           | Partial — limiter logs allow/throttle; no aggregation            | Rate-limit pressure by key                           |
| `mcp_inoreader_calls_total`      | Counter   | `source` (cron/tool/oauth), `status_code`                                | **Blocked** — depends on spend-accounting fix (see below)        | Daily Inoreader budget burn                          |
| `mcp_radar_snapshot_age_seconds` | Gauge     | —                                                                        | Yes — `/health.radarSnapshotAgeSeconds`                          | How stale is the radar snapshot?                     |
| `mcp_health_check_duration_ms`   | Histogram | `dependency` (redis/inoreader)                                           | No                                                               | Health-check latency by dependency                   |
| `mcp_cron_outcome_total`         | Counter   | `cron_slug`, `outcome` (success/error/skipped-circuit/skipped-budget)    | Partial — Sentry Crons check-ins (free-tier visibility variable) | Cron firing observability                            |

**`mcp_inoreader_calls_total` blocker**: the existing day-counter only tracks cron-path radar fetches, missing OAuth refresh + live-tool radar + cache-miss live-radar calls. Day-counter and Inoreader's Developer Console diverged by 15-25% during the BL-032.8 Day-5 soak (2026-05-21). Until the spend-accounting fix lands (per BACKLOG § "Inoreader spend accounting"), this metric reports a structurally-low number and the "alert at 70% budget" SLO below cannot fire honestly. **This is Phase 0 of the execution plan, ahead of typed emitters.**

### 2. SLOs — what the metrics MUST do

| SLO                                 | Target                       | Window          | Burn-rate alerts                    |
| ----------------------------------- | ---------------------------- | --------------- | ----------------------------------- |
| Non-radar Tool availability         | 99.5% successful invocations | rolling 30 days | 14.4× burn → page; 6× burn → ticket |
| Non-radar Tool latency p95          | <500ms                       | rolling 7 days  | breach for 1h → ticket; 6h → page   |
| Radar Tool latency p95 (cold cache) | <2000ms                      | rolling 7 days  | breach for 1h → ticket              |
| Radar Tool latency p95 (warm cache) | <200ms                       | rolling 7 days  | breach for 1h → ticket              |
| Resource read latency p95           | <300ms                       | rolling 7 days  | breach for 1h → ticket              |
| Health endpoint availability        | 99.9%                        | rolling 30 days | breach immediately → page           |
| Inoreader daily budget consumption  | <180/200 calls               | per UTC day     | 70% → ticket; 90% → page            |
| Radar snapshot freshness            | <90 minutes (Cron is hourly) | continuous      | breach for 30 min → page            |

These are **calibrated against measured baselines**, not aspirational. Until BL-032 has been live for two weeks, the targets above are placeholders — the first deliverable of BL-032.75 is to run an SLO-baselining sprint that replaces them with real numbers.

### 3. Alerting — who gets paged when

| Channel                              | Purpose                                                                                                          | Routing                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `#mcp-alerts` (Slack)                | Tickets, low-urgency breaches, daily digest                                                                      | All eng                                                 |
| Email digest (daily)                 | Yesterday's traffic by tool, top users by `key_prefix`, any SLO breaches                                         | All eng + senior consultants                            |
| PagerDuty (or equivalent)            | Hard pages: health endpoint down, Inoreader budget at 90%, radar snapshot >2h stale, traffic spike >10× baseline | On-call rotation (single eng for now; expand at BL-033) |
| Email to compliance contact (BL-033) | Audit log integrity check failures                                                                               | Quarterly automated                                     |

---

## Stack choice

| Component              | Choice                                                                                                                          | Rationale                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Metrics store**      | Cloudflare Analytics Engine                                                                                                     | Native to Workers, SQL-queryable, free tier covers projected volume, zero infrastructure to maintain                                                                                                                                                                                                                                                                                                  |
| **Dashboards**         | Grafana Cloud (free tier) with Cloudflare Analytics datasource                                                                  | Industry-standard panels, alert engine, no self-hosting; pre-built MCP-server dashboard committed to the repo as JSON                                                                                                                                                                                                                                                                                 |
| **Alerting**           | Grafana alerts → Slack webhook + PagerDuty                                                                                      | Cheapest path, works today; revisit if Grafana free tier becomes insufficient                                                                                                                                                                                                                                                                                                                         |
| **Error tracking**     | Sentry (already wired in BL-032; cron `withMonitor` check-ins live since 0.3.12)                                                | Existing, no migration cost. **Open**: Sentry Crons dashboard UI visibility is uneven on free-tier accounts (verified 2026-05-25). Until resolved, Cloudflare's cron dashboard is the primary success/error surface for cron firings; Sentry Issues view receives exception captures. Sub-deliverable: evaluate Sentry Team tier (~$26/mo, gives full Crons UI) vs continuing dual-surface operation. |
| **Status page**        | `https://status.mcp.globalstrategic.tech` (Cloudflare Pages, simple static site reading from Analytics Engine via signed query) | Same domain control story as the rest; BL-033 makes this client-facing                                                                                                                                                                                                                                                                                                                                |
| **Tracing (deferred)** | None for BL-032.75                                                                                                              | OpenTelemetry-on-Workers exists but adds complexity; revisit if a specific debugging case demands it                                                                                                                                                                                                                                                                                                  |

---

## Repo placement

`mcp-server/` workspace continues. New top-level directory `mcp-server/observability/` for dashboard JSON, alert rules, runbook templates. No separate repo — the configuration is part of the deployment artifact and benefits from being version-controlled alongside the code it observes.

```
mcp-server/
├── src/
│   └── metrics/                    # NEW — typed metric emitters
│       ├── counters.ts
│       ├── histograms.ts
│       └── _index.ts
├── observability/                  # NEW — config-as-code for dashboards / alerts
│   ├── grafana-dashboard.json      # MCP-server dashboard, importable into Grafana
│   ├── alert-rules.yaml            # Alert definitions (SLO breaches, anomalies)
│   ├── runbooks/                   # Markdown runbooks linked from alerts
│   │   ├── inoreader-budget-exhausted.md
│   │   ├── radar-snapshot-stale.md
│   │   ├── health-check-failing.md
│   │   └── traffic-spike-detected.md
│   └── slo-baselines.md            # Living document — the measured baselines that justify each SLO target
└── tests/
    └── metrics-emission.test.ts    # NEW — asserts every Tool/Resource/Prompt path emits the expected metric
```

---

## Implementation Plan

### Phase 0 — unblock dishonest signals (week 1, ~1.5 days)

The spend-accounting gap below would silently corrupt every Inoreader-related dashboard and the "alert at 70% budget" SLO. Land it before any typed-emitter work so the baselining sprint runs against accurate data.

1. **Inoreader egress wrapper** — create `mcp-server/src/lib/inoreader-egress.ts` with `fetchInoreaderZone1(env, url, init, category)` where `category: 'cron-radar' | 'live-radar' | 'oauth-refresh'`. Helper increments BOTH a single global counter (`mcp:inoreader:zone1-spend:<YYYY-MM-DD>`) AND a per-category counter. Refactor 3 call sites: `inoreader-client.ts::fetchAllStreams|fetchAnnotatedItems|fetchTagList` (cron-radar / live-radar via `opts.source`), and `inoreader-oauth.ts::refreshAccessToken` (oauth-refresh).
2. Update cron soft-cap in `radar-refresh.ts:187` from `counter + 6 > 94` to `counter + 7 > 94` (or `> 88` for a more conservative cap; document choice in inline comment).
3. Delete old `mcp:inoreader:day-counter:<YYYY-MM-DD>` keys + `incrementDayCounter` / `readDayCounter`. Migration note in `DEPLOY.md` flagging unused Upstash keys for manual cleanup.
4. `/health` gains `inoreaderSpend: { total: number, byCategory: { 'cron-radar': N, 'live-radar': N, 'oauth-refresh': N } }`.
5. Test coverage (per BACKLOG § "Acceptance criteria for this sub-deliverable"): 200 response increments both counters; network error / 5xx do NOT increment; 429 increments (debated semantic — pin a choice in the test); TTL set on first-write.
6. Soak: 7-day stability window post-deploy; day-of-deploy projection (4 cron × 7 calls = 28/day) should match Inoreader Developer Console within ±1 call/day. If it doesn't reconcile, there's a fourth egress point.

Full scoping is in BACKLOG § "Inoreader spend accounting — day-counter completeness gap"; this phase implements it.

### Phase 1 — instrumentation (week 2)

Partial credit already exists — `safeLog` emits the right shape, Sentry tags carry rich context. Phase 1 formalizes the second-emission to Cloudflare Analytics Engine so the data becomes SQL-queryable.

1. Add typed metric emitters in `mcp-server/src/metrics/` so every Tool, Resource, and Prompt path emits a `tool_invocation`, `resource_read`, or `prompt_invocation` event with the dimensions listed above. Emitters dual-write: existing `safeLog` continues, new `analytics.write(event)` lands the same data structured for Workers Analytics Engine.
2. Wire Cloudflare Analytics Engine binding in `wrangler.toml`; bind to `env.METRICS`. Provision the dataset.
3. Wrap the existing tool/resource/prompt registry decorators so emission happens automatically — no per-handler boilerplate. The BL-032.5 manifest hash test already enumerates registered surfaces; extend that pattern to assert each emits at least one metric event in a representative invocation.
4. Add Vitest test asserting every registered Tool/Resource/Prompt produces at least one metric event with the cardinality budget per dimension documented in `metrics/_index.ts` and enforced by CI cap.

### Phase 2 — baselining (week 3-4)

1. Deploy instrumented build to production; let it run with normal team usage for 10-14 days
2. Pull traffic data weekly via the Workers Analytics SQL API; produce `slo-baselines.md` documenting measured p50/p95/p99 per tool, per resource, per prompt
3. Set initial SLO targets at p95-baseline × 1.5 (a 50% buffer above measured) — generous, becomes tightenable once stable
4. Senior-engineer review of baselines + targets; sign-off

### Phase 3 — dashboards + alerts (week 4-5)

1. Author `grafana-dashboard.json` covering: traffic, latency histograms, error rates, rate-limit pressure, Inoreader budget burn-down, radar snapshot age
2. Author `alert-rules.yaml` covering every SLO from the table above
3. Wire Slack webhook + PagerDuty integration; test with a deliberate alert injection
4. Author runbooks for the four canonical alerts (Inoreader budget exhausted, radar stale, health failing, traffic spike)
5. Status page (read-only) deployed at `https://status.mcp.globalstrategic.tech` showing per-tool availability + the daily Inoreader budget consumption

### Verification

1. `cd mcp-server && npm run build && npm test` — green; metrics-emission tests pass.
2. From repo root: `npx astro check && npm run lint && npm run lint:css && npm run test:run` — still green.
3. Deploy to production, confirm metric events landing in Cloudflare Analytics Engine via SQL probe (`SELECT count() FROM mcp_events WHERE timestamp > now() - INTERVAL 1 HOUR`).
4. Import `grafana-dashboard.json`, confirm all panels render against the live data source.
5. Trigger a synthetic SLO breach (e.g. inject 5% error rate via a feature flag); confirm Grafana alert fires within 5 min and lands in Slack.
6. Trigger a synthetic Inoreader-budget alarm by setting the daily-budget counter to 180; confirm both ticket-level (Slack) and page-level (PagerDuty at 90%) alerts route correctly.
7. Confirm the on-call rotation receives a test page and the runbook link in the alert resolves to the correct markdown file.
8. Two-week post-deploy review: are SLOs being met? Are alerts firing on the right things and quiet on noise? Tighten or loosen baselines accordingly.

### Risks & mitigations

| Risk                                                                                | Mitigation                                                                                                                                                                             |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alert fatigue from poorly-calibrated thresholds                                     | The 10-14 day baselining sprint is non-negotiable; targets set against measured p95 × 1.5 buffer; review and re-tune at 2-week mark                                                    |
| Cardinality explosion on metric dimensions (e.g. `key_prefix` × `tool` × `success`) | Cardinality budget per metric documented in `metrics/_index.ts`; CI test caps emission cardinality                                                                                     |
| Cloudflare Analytics Engine free-tier quota exhaustion                              | Monitor own metrics emission rate; document the upgrade path ($25/mo paid tier covers 100M events/mo, ~30× expected volume)                                                            |
| Runbooks drift out of sync with reality                                             | Each runbook has a `lastReviewedAt` field; CI fails if any runbook is over 6 months stale OR if the alert that links to it has changed since the runbook's last review                 |
| On-call rotation insufficient (single engineer)                                     | Acceptable through BL-032.75 internal use; BL-033's pilot SLA requires either a second on-call rotation or a contracted on-call escalation — that decision belongs to BL-033, not here |
| Grafana Cloud free-tier limits (3 users, 10k metrics series)                        | Monitor; the volume here fits comfortably; upgrade path is $19/user/mo if exceeded                                                                                                     |
| Status page exposes information that should stay internal                           | Initial status page is internal-IP-restricted; BL-033 reviews and chooses what becomes externally visible (typically: tool availability yes, key-level traffic no)                     |

### Out of scope (deferred)

- Distributed tracing (OpenTelemetry on Workers) — adds value for complex request flows; defer until a specific debugging case demands it
- Synthetic monitoring (external probes hitting `/health` and core tools every 60s from multiple regions) — useful for true uptime measurement; defer to BL-033 when SLA reporting is contractual
- Per-client usage dashboards (clients see their own traffic) — BL-033 product decision
- Cost observability (Cloudflare/Upstash/Sentry billing dashboards) — separate concern, low priority while spend is under $100/mo
- Audit-log integrity dashboards — that surface belongs to BL-033's compliance-grade audit log, not here
- ML-based anomaly detection beyond simple z-score / threshold rules — premature

---

## How this enables BL-033

BL-033 commits to a contractual SLA. By the time BL-033 enters legal review:

- Every SLO target in BL-033's pilot SLA can cite the measured baseline that justifies it, with at least 30 days of production data
- Every alert that would fire under a contracted SLA breach is wired and tested
- The status page that pilots will read for outage transparency exists and is populated with real data
- The on-call rotation (or its contracted alternative) is operating, not aspirational
- Runbooks for the canonical alert types exist and have been exercised at least once

That moves the BL-033 conversation from "we will commit to 99.5% uptime" (aspirational) to "we have run at 99.6% measured over 60 days; the SLA matches operational reality" (defensible). The pilot legal review becomes substantially less risky because the operational claim is backed by historical data.

---

_Last updated: 2026-05-25 — brought current with BL-032.7 (✅ 2026-05-16), BL-032.8 Phase A (✅ 2026-05-17), and today's cron Sentry observability (0.3.12 + 0.3.13). Added Phase 0 for the BL-032.8 Day-5 spend-accounting fix as a prerequisite to honest budget-burn dashboards. Metrics table annotated with "already emitted?" column. Stack-choice table flags Sentry Crons free-tier visibility caveat. Phase 1 acknowledged for partial credit from existing `safeLog` + Sentry tags. Phases 2-3 shifted by one week to accommodate Phase 0._

_Originally filed: 2026-04-25._
