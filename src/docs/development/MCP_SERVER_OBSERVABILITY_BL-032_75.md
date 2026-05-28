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
> **Status**: In progress (~25% shipped). Phase 0 (spend-accounting), K-section mitigations, and BL-032.76 cron Sentry repair are all ✅ shipped (see Predecessors + § "What's already in place"). Remaining work: typed metric emitters → Cloudflare Analytics Engine → Grafana dashboards → alert wiring + runbooks (Phases 1-3 below). The Phase 1-3 plan was rewritten 2026-05-27 after an adversarial audit surfaced three substrate-fit blockers and six maintainability concerns — see § "2026-05-27 Phase 1-3 plan revision" near the foot of this doc for the changelog. Phase 1 design + scaffolding can start NOW in parallel with the Phase 0 soak (2026-05-26 → ~2026-06-02); only the `inoreader_calls_total` emitter is gated on soak reconciliation.

---

## Context

### What's already in place (as of 2026-05-27)

The original 2026-04-25 version of this doc accurately described the BL-032 baseline ("structured JSON logs + `/health` + Sentry"). Five weeks of adjacent shipping have substantially extended that baseline. Before scoping new work, here's the current substrate:

**BL-032.7** (✅ shipped 2026-05-16, `302c625` / `bba2a46` / `2597854`):

- `handleInoreaderFailure` unified — cron, search_radar, and get_latest_insights all route Inoreader failures through one module that opens the circuit breaker, increments the day-counter only on success (T.Z.1), and emits a Sentry capture with severity. Replaces three independent failure paths that drifted in spec.
- **429 X-Reader-\* headers as Sentry structured tags** (T.Z.3): `inoreader.zone1.usage`, `inoreader.zone1.limit`, `inoreader.reset_after_seconds`, plus a 200-char body excerpt in `extra`. Sentry-UI RCA on a rate-limit event is now a 30-second tag read instead of a multi-hour Inoreader-dashboard hunt.
- `captureMessage` wired into auth-fail and inoreader-rate-limit paths (T.E.11 / T.E.12 closure) so probe bursts and breaker-open events emit Sentry breadcrumbs without burning quota.

**BL-032.8 Phase A** (✅ shipped 2026-05-17, PR #139):

- `/health` extended with `inoreaderObservedAt` / `inoreaderObservedSecondsAgo` / `inoreaderObservedSource` so operators can confirm the last successful Inoreader call without leaving the endpoint. Soak-validated.
- mcp-health stale-while-OK semantics (PR #152) — the health probe distinguishes "Inoreader unreachable right now" from "Inoreader fine; observed N seconds ago via cron." Prevents spurious /health 503s under transient upstream blips.
- `SECRETS_INVENTORY.md` (PR #149) — operator runbook for which secret lives where, which DB, which environment.

**BL-032.76 cron Sentry SDK bypass** (✅ shipped 2026-05-27, PR #175 commit `2016bac`, runbook PR #177 commit `5ead623`):

- The `@sentry/cloudflare` SDK's auto-wrap on the scheduled handler was producing false `Exception Thrown` reports on Cloudflare's cron-events dashboard (every firing flagged Error despite the work succeeding). The fix split the default export so `withSentry` wraps only `fetch`; the scheduled handler owns its own check-in lifecycle via direct envelope POSTs to Sentry (`mcp-server/src/observability/sentry-envelope.ts`, 208 LOC).
- `postSentryCheckIn('in_progress')` → work → `postSentryCheckIn('ok' | 'error')` pattern, with `postSentryEvent` on the error branch; full Sentry Crons UI visibility now works (the prior "Sentry Crons free-tier visibility uneven" caveat is resolved — the issue was the SDK transport, not the tier).
- Empirical confirmation (2026-05-27): Cloudflare cron-events dashboard now reports `Success` on natural firings; `BL-032_76_VERIFICATION.md` operator runbook covers the 5-point verification surface (Cloudflare dashboard, Sentry Crons, Sentry Issues, `/health`, `wrangler tail`).
- 19 new envelope unit tests + rewritten `worker-scheduled.test.ts` with explicit regression guard (asserts handler passed to `withSentry` has NO `scheduled` key) — prevents a future contributor from re-adding SDK wrapping to the cron path.

**BL-032.75 Phase 0 spend-accounting** (✅ shipped 2026-05-26, `inoreader-egress.ts` 333 LOC, 25 unit tests):

- New `mcp-server/src/lib/inoreader-egress.ts` exports `fetchInoreaderTracked(env, url, init, category)` wrapping `singleFetch` (the one chokepoint — catches 401-retries + internal fan-out). Five categories: `'cron-radar' | 'live-radar' | 'http-radar-snapshot' | 'oauth-refresh' | '401-retry'`.
- Header-derived `X-Reader-Zone1-Usage` is the authoritative spend signal; Upstash counter is a pre-flight cap guard with daily-debounced drift detection (one Sentry event per UTC day per drifted day).
- `/health.inoreaderSpend = { total, byCategory }` returns the breakdown — operator visibility without leaving the endpoint.
- **Soak in progress**: 7-day parallel-soak window (2026-05-26 → ~2026-06-02) running new counter ALONGSIDE old `mcp:inoreader:day-counter:*`; daily reconciliation against Inoreader Developer Console. Post-soak cleanup PR (deletes old keys) gates Phase 1's `inoreader_calls_total` emitter going live.
- Post-implementation audit + 5 architectural fixes (always-`EXPIRE` for TTL atomicity, MGET for `/health` batch read, exhaustive `sourceToCategory` switch, dedicated `egressSource` log field, daily drift debounce). Full design recap retained in § "Phase 0" below for posterity.

**K-section evidence-driven mitigations** (✅ shipped 2026-05-12 → 2026-05-27):

- Tool description tightening: `'unknown'` sentinel discipline on `generate_diligence_agenda` (`diligence.ts:28-55`); `search_regulations` authoritative-source priority + efficiency tip; `search_portfolio` buy-side/sell-side phrasing; ICG structure-discovery (`answers: {}` for shape questions).
- Result-shape enrichments: `oldestItemDaysAgo` on `search_radar` + `get_latest_insights` (`radar-live.ts:218,257`); `triggerQuestionAnswered` on ICG recommendations (commit `005e0fe`); ICG accounting-math fix dropping unknown-question-id increments (commit `2b4c3fe`).
- Connector-level system-prompt addendum (`REMOTE_CLIENT_SETUP.md § 4`) — Claude Desktop / Claude Code / Cursor / ChatGPT paste-block biasing the opening framing toward MCP-tool-naming language.
- `search_regulations.jurisdiction` + `.category` accept arrays (Zod union+transform; commit `283cf37`) — closes the K.2.c.4 11-call fan-out finding.
- `Sentry.captureMessage` (now `captureMessageEnvelope` post-BL-032.76) wired into auth-fail + Inoreader-rate-limit paths.

**`/health` write-then-delete probe** (✅ shipped 2026-05-27, commit `b2d79d0`):

- `probeMcp` in `health.ts` writes a per-call-unique `mcp:health:probe:<uuid>` key with 60s TTL then best-effort DELs it. Catches T.X.2-style Read-only-token bugs that the prior GET-only probe missed.

**BL-032.5 Phase 4 manifest discipline** (✅ shipped 2026-05-13):

- Tool / Resource / Prompt registry produces a deterministic manifest hash; CI test fails on any drift. Already gives us "what's exposed" attestation; trivially extends to "what's measured" once metric emitters land. **Per BL-032.5 final reconciliation (2026-05-27)**: Resources, Prompts, scope-gating (`mcp-server/src/auth/scopes.ts`), and per-Resource caching (`mcp-server/src/lib/resource-cache.ts`) are all live; BL-032.5 is closed out as ✅ shipped.

### What's still missing

The work in this initiative is the bridge from "we have rich captures + a /health endpoint" to "we have an operations posture." With Phase 0 + K-section + BL-032.76 + BL-032.5 shipped, the remaining scope is concretely:

- **Post-Phase-0 cleanup PR** — delete the old `mcp:inoreader:day-counter:*` Upstash keys + remove `incrementDayCounter`/`readDayCounter` from `radar-refresh.ts`. Gates on the 7-day soak passing reconciliation (~2026-06-02). Small standalone PR; sequenced between Phase 0 soak close and Phase 1 ship.
- **Typed metric emitters → Analytics Engine** — Sentry tags + safeLog give per-event debugging signal but no aggregated time-series. Cloudflare Analytics Engine binding is the missing piece; once wired, every existing safeLog can dual-emit a structured event for SQL-queryable rollups. **Substrate-fit note**: AE is positional-columnar (`blob1..blob20` / `double1..double20` / `index1` sampling key), NOT Prometheus-style named series — the schema decision (one dataset, column map) is the single largest design call in Phase 1 and is made in `mcp-server/src/metrics/_schema.ts` before any emitter is written.
- **SLO definitions** with budgets and burn rates, per Tool / per Resource / per Prompt — calibrated against the production traffic we now have post-BL-032. **Calibration rule per metric kind**: latency uses `p95-baseline × 1.5`; availability uses Service-Level-Indicator floor relative to error budget (e.g. 99.5% target ≈ 0.5% error budget over rolling 30 days); throughput uses headroom-percentage rather than absolute thresholds. The blanket "× 1.5 buffer" from the original plan was a latency-only rule.
- **Dashboards** for latency histograms, error rates, traffic by key, Inoreader budget burn-down, radar snapshot freshness. Grafana Cloud free-tier sufficient at projected volume.
- **Alerting integrations** so problems wake someone up at 80% budget exhaustion, not at 100%. PagerDuty for hard pages, Slack for tickets. **Canonical alert set expanded from 4 to 7** post-audit: budget-exhausted, snapshot-stale, health-failing, traffic-spike, **scope-mismatch 403 rate** (attack signal), **OAuth refresh failure rate** (silent auth decay), **Sentry envelope POST failure rate** (loss of visibility into visibility).
- **Anomaly detection** to surface abuse patterns (one key bursting 50× normal traffic) before rate limits paper over them.
- **Status page** that BL-033 publishes to clients. **Architecture revised** post-audit: rendered through the Worker at `/status` (server-side query against AE), not a static Cloudflare Pages site with a signed AE query (the latter requires embedding a query-signing secret in static markup — secret-in-static-site footgun).

None of this is novel. Cloudflare's Analytics Engine + Grafana + a Slack webhook covers the metrics-and-alerting stack at near-zero marginal cost. The remaining work is in (1) closing out the Phase 0 soak and old-counter cleanup, (2) standing up the typed emitters against the right AE column schema, (3) choosing SLO targets against measured baselines with calibration rules that respect metric kind, and (4) wiring the alerts so they fire before incidents become outages.

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

Per-Tool / per-Resource / per-Prompt counters and histograms emitted to Cloudflare Analytics Engine (built into Workers; SQL-queryable; free tier covers projected traffic). The "Already emitted?" column reflects what BL-032 / BL-032.7 / BL-032.8 / Phase 0 already write — typically via `safeLog`, Sentry tags, or `/health` fields. The 032.75 Phase 1 work formalizes these as **typed metric events** written to a single AE dataset with a fixed column map:

| Logical event                | Type              | Dimensions                                                               | Already emitted?                                               | Purpose                                          |
| ---------------------------- | ----------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------ |
| `tool_invocation`            | Counter+Histogram | `tool_name`, `keyOwner`, `success`, `duration_ms`                        | Partial — safeLog has all dims; no aggregation surface         | Volume + latency by tool and outcome             |
| `resource_read`              | Counter           | `resource_uri_prefix` (e.g. `gst://library/`), `cache_status` (hit/miss) | No                                                             | Resource access volume + cache effectiveness     |
| `prompt_invocation`          | Counter           | `prompt_name`, `keyOwner`                                                | No                                                             | Prompt usage by name                             |
| `prompt_span` _(see note)_   | Event             | `prompt_name`, `correlation_id`, `tool_name`, `seq`, `duration_ms`       | No                                                             | Per-tool-step inside a prompt — poor-man's trace |
| `rate_limit_decision`        | Counter           | `keyOwner`, `decision` (allow/throttle/deny)                             | Partial — limiter logs allow/throttle; no aggregation          | Rate-limit pressure by key                       |
| `inoreader_call`             | Counter           | `category` (see Phase 0 enum), `status_code`                             | ✅ **Phase 0 shipped** — `/health.inoreaderSpend.byCategory`   | Daily Inoreader budget burn                      |
| `radar_snapshot_age_seconds` | Gauge             | —                                                                        | Yes — `/health.radarSnapshotAgeSeconds`                        | How stale is the radar snapshot?                 |
| `health_check_duration_ms`   | Histogram         | `dependency` (mcp/inoreader)                                             | No                                                             | Health-check latency by dependency               |
| `cron_outcome`               | Counter           | `cron_slug`, `outcome` (success/error/skipped-circuit/skipped-budget)    | ✅ — Sentry Crons check-ins via envelope POSTs (BL-032.76 fix) | Cron firing observability                        |

**Note on `prompt_span`**: `prompt_invocation` alone tells us how often prompts run but not which downstream tool slowed the chain when one is reported as slow. `prompt_span` is a per-step event with a shared `correlation_id` linking all tools invoked by one prompt firing — a poor-man's trace at ~10% the cost of OpenTelemetry-on-Workers. If it proves redundant after the first month of production data, drop it; if a real prompt incident takes >2h to root-cause from `prompt_invocation` alone, this is the upgrade target.

**`inoreader_call` unblocked**: Phase 0 (✅ shipped 2026-05-26) closed the 15-25% undercount gap. The `inoreader_call` emitter in Phase 1 reads from the same `inoreader-egress.ts` chokepoint that `/health.inoreaderSpend` already drains — single source of truth. **Gating**: the emitter goes live only AFTER the Phase 0 soak passes reconciliation (~2026-06-02) so we don't ship a dashboard against under-soaked data.

#### Analytics Engine column map (pinned: 6 blobs / 2 doubles / 1 index)

Cloudflare Analytics Engine is **positional-columnar**, not Prometheus-style named-series. The substrate provides `blob1..blob20` (strings, ≤16 KB per data point in total), `double1..double20` (numbers), and `index1` (one high-cardinality sampling key, ≤96 bytes). Each `writeDataPoint` may use up to 20 blobs + 20 doubles + 1 index; a Worker invocation may emit ≤250 data points total. One dataset, 6 blob slots + 2 double slots + the index used (remaining slots reserved for future event-type additions; reserving them now lets us add fields without a schema migration):

| Column    | Field            | Notes                                                                                                                                                                                                                                                                                                 |
| --------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blob1`   | `event_type`     | Discriminator: `tool_invocation` / `resource_read` / `prompt_invocation` / `prompt_span` / `rate_limit_decision` / `inoreader_call` / `health_check` / `cron_outcome`                                                                                                                                 |
| `blob2`   | `name`           | Tool name, resource URI prefix, prompt name, cron slug — depending on `event_type`                                                                                                                                                                                                                    |
| `blob3`   | `keyOwner`       | Stripped suffix of `MCP_KEY_*` (e.g. `"RP"`); null when not applicable. **No hashing required** — `keyOwner` is already PII-free and bounded by the number of issued keys (<10 today). Reuses the existing `safeLog.LogEvent.keyOwner` field; Phase 1 does NOT introduce a new attribution primitive. |
| `blob4`   | `outcome`        | `success` / `error` / category-specific (`hit` / `miss` / `allow` / `throttle` / `deny`)                                                                                                                                                                                                              |
| `blob5`   | `correlation_id` | Used only by `prompt_span`; null elsewhere                                                                                                                                                                                                                                                            |
| `blob6`   | `status_code`    | HTTP-ish status as string (avoids type-coercion ambiguity in queries)                                                                                                                                                                                                                                 |
| `double1` | `duration_ms`    | Numeric duration; 0 for counter-only events                                                                                                                                                                                                                                                           |
| `double2` | `seq`            | Used only by `prompt_span` (step index 0..N); 0 elsewhere                                                                                                                                                                                                                                             |
| `index1`  | `keyOwner`       | AE's sampling-key column. Mirrored from `blob3` so AE samples by tenant when scaling. Well under the 96-byte cap.                                                                                                                                                                                     |

**Why one dataset, not one-per-event-family**: AE's per-call shape (20 blobs + 20 doubles + 1 index) and per-invocation cap (250 data points) are generous; a single dataset trades query complexity (every query has `WHERE blob1 = '<event_type>'`) for cleaner write-path, uniform schema discipline, and zero risk of dimension-explosion via duplicated columns across families. Splitting into 8 family-specific datasets would need 8 bindings, 8 snapshot tests, and 8 SQL surfaces.

This column map lives in `mcp-server/src/metrics/_schema.ts` as the **single source of truth** for emitters, runtime cardinality guards, vitest fixtures, Grafana SQL queries, and status-page queries. A `schema.test.ts` snapshot test pins the map so any change forces deliberate review; changing the map is a breaking change to every downstream consumer.

### 2. SLOs — what the metrics MUST do

| SLO                                 | Target (placeholder)         | Window          | Calibration rule                    | Burn-rate alerts                    |
| ----------------------------------- | ---------------------------- | --------------- | ----------------------------------- | ----------------------------------- |
| Non-radar Tool availability         | 99.5% successful invocations | rolling 30 days | Availability floor (error-budget %) | 14.4× burn → page; 6× burn → ticket |
| Non-radar Tool latency p95          | <500ms                       | rolling 7 days  | `p95-baseline × 1.5`                | breach for 1h → ticket; 6h → page   |
| Radar Tool latency p95 (cold cache) | <2000ms                      | rolling 7 days  | `p95-baseline × 1.5`                | breach for 1h → ticket              |
| Radar Tool latency p95 (warm cache) | <200ms                       | rolling 7 days  | `p95-baseline × 1.5`                | breach for 1h → ticket              |
| Resource read latency p95           | <300ms                       | rolling 7 days  | `p95-baseline × 1.5`                | breach for 1h → ticket              |
| Health endpoint availability        | 99.9%                        | rolling 30 days | Availability floor                  | breach immediately → page           |
| Inoreader Zone-1 daily consumption  | <80/100 calls                | per UTC day     | Headroom-percentage (20% floor)     | 70% → ticket; 90% → page            |
| Radar snapshot freshness            | <8h (Cron is 6-hourly)       | continuous      | `2 × cron-interval`                 | breach for 2h → page                |

**Note**: cron cadence is `0 */6 * * *` (every 6h), not hourly as the prior plan assumed; the freshness SLO and snapshot-stale alert thresholds derive from that cadence. Inoreader daily quota default is 100 calls (Zone-1), confirmed against Inoreader rate-limiting docs during Phase 0 implementation.

**Calibration rules — explicit because "× 1.5 buffer" doesn't fit every metric kind**:

- **Latency SLOs** (`tool_invocation`, `resource_read`, `health_check_duration`): target = `p95-baseline × 1.5`. The 50% buffer absorbs natural variance without false alerts; tightenable post-stability.
- **Availability SLOs** (`tool_invocation` success rate, `/health` availability): target = explicit floor (e.g. 99.5%, 99.9%) tracked as **error-budget consumption** over the window. Burn-rate alerts at 14.4× (fast-burn → page) and 6× (slow-burn → ticket) per the Google SRE multi-window multi-burn-rate playbook.
- **Throughput / budget SLOs** (`inoreader_call` daily total): target = **headroom percentage** floor (e.g. ≥20% headroom against the daily Inoreader quota). Quota-relative, not absolute — survives Inoreader plan upgrades.
- **Freshness SLOs** (`radar_snapshot_age_seconds`): target = `2 × cron-interval` ceiling. Single-multiplier rule survives cron-cadence changes; alert fires after one missed firing AND change-window grace.

These targets are **placeholders** — the first deliverable of Phase 2 is to run an SLO-baselining sprint that replaces them with measured numbers + senior-engineer sign-off.

### 3. Alerting — who gets paged when

| Channel                              | Purpose                                                                | Routing                                                 |
| ------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| `#mcp-alerts` (Slack)                | Tickets, low-urgency breaches, daily digest                            | All eng                                                 |
| Email digest (daily)                 | Yesterday's traffic by tool, top users by `keyOwner`, any SLO breaches | All eng + senior consultants                            |
| PagerDuty (or equivalent)            | Hard pages — see canonical alert list below                            | On-call rotation (single eng for now; expand at BL-033) |
| Email to compliance contact (BL-033) | Audit log integrity check failures                                     | Quarterly automated                                     |

**Canonical alert set (7 alerts, expanded from 4 post-audit)**:

| Alert                                       | Trigger                                                                          | Severity                                    | Runbook                                |
| ------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------- |
| `inoreader-budget-exhausted`                | Daily Zone-1 usage >70% (ticket) / >90% (page)                                   | Ticket → Page                               | `inoreader-budget-exhausted.md`        |
| `radar-snapshot-stale`                      | `radar_snapshot_age_seconds` > `2 × cron-interval`                               | Page after 2h breach                        | `radar-snapshot-stale.md`              |
| `health-check-failing`                      | `/health` 5xx for 5 consecutive minutes                                          | Immediate page                              | `health-check-failing.md`              |
| `traffic-spike-detected`                    | `tool_invocation` per-key rate >10× rolling baseline                             | Ticket (escalate if sustained)              | `traffic-spike-detected.md`            |
| `scope-mismatch-403-rate` _(new)_           | `tool_invocation.success=false` with 403 status >5/min                           | Ticket — attack signal                      | `scope-mismatch-403-rate.md`           |
| `oauth-refresh-failure-rate` _(new)_        | `inoreader_call` category=`oauth-refresh` error rate >20% over 1h                | Page — silent auth decay                    | `oauth-refresh-failure-rate.md`        |
| `sentry-envelope-post-failure-rate` _(new)_ | Internal counter (post-BL-032.76) of failed `postSentryEvent` calls >10% over 1h | Ticket — loss of visibility into visibility | `sentry-envelope-post-failure-rate.md` |

---

## Stack choice

| Component                   | Choice                                                                                                                  | Rationale                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Metrics store**           | Cloudflare Analytics Engine                                                                                             | Native to Workers, SQL-queryable, free tier covers projected volume, zero infrastructure to maintain                                                                                                                                                                                                                               |
| **Dashboards**              | Grafana Cloud (free tier) with Cloudflare Analytics datasource                                                          | Industry-standard panels, alert engine, no self-hosting; pre-built MCP-server dashboard committed to the repo as JSON                                                                                                                                                                                                              |
| **Alerting**                | Grafana alerts → Slack webhook + PagerDuty                                                                              | Cheapest path, works today; revisit if Grafana free tier becomes insufficient                                                                                                                                                                                                                                                      |
| **Error tracking**          | Sentry (BL-032; envelope POSTs via BL-032.76, not SDK auto-instrumentation on the cron path)                            | Existing project; cron path uses direct envelope POSTs via `postSentryEvent` / `postSentryCheckIn` to avoid the SDK's `wrapScheduledHandler` rejection that caused false `Exception Thrown` reports on Cloudflare's cron dashboard. Sentry Crons UI is fully functional through the envelope check-ins.                            |
| **Status page**             | `https://status.mcp.globalstrategic.tech` — **rendered through the existing Worker at `/status`**, server-side AE query | Earlier plan proposed a static Cloudflare Pages site signing AE queries client-side; that requires embedding a query-signing secret in static markup (secret-in-static-site footgun). Worker-rendered avoids the auth-boundary problem, allows server-side caching, and stays on the same domain. BL-033 makes this client-facing. |
| **Tracing (light)**         | `prompt_span` correlation events (Phase 1)                                                                              | Per-tool-step events inside a prompt firing, all sharing one `correlation_id`. ~10% the cost of OpenTelemetry-on-Workers; gives "which downstream tool slowed this prompt" without the OTel SDK weight. Drop if redundant after one month of production data.                                                                      |
| **Tracing (deferred)**      | OpenTelemetry-on-Workers                                                                                                | Revisit only if a prompt incident takes >2h to root-cause from `prompt_invocation` + `prompt_span` alone.                                                                                                                                                                                                                          |
| **Metric sink abstraction** | `MetricSink` interface (`AnalyticsEngineSink` prod, `InMemorySink` tests)                                               | ~30 LOC; makes vitest assertions trivially clean (assert on `sink.events[]` rather than mocking the CF binding) and provides a zero-cost insurance policy against vendor lock-in. Forward-thinking maintainability call.                                                                                                           |

---

## Repo placement

`mcp-server/` workspace continues. New top-level directory `mcp-server/observability/` for dashboard JSON, alert rules, runbook templates. No separate repo — the configuration is part of the deployment artifact and benefits from being version-controlled alongside the code it observes.

```
mcp-server/
├── src/
│   ├── metrics/                    # NEW — typed metric emitters
│   │   ├── _schema.ts              # Single source of truth — AE column map + event-type enum + cardinality budget
│   │   ├── _index.ts               # Re-exports + the with-metrics HOF that wraps registry invokes
│   │   ├── with-metrics.ts         # HOF: wraps a Tool/Resource/Prompt handler; emits one event per invoke
│   │   ├── prompt-span.ts          # Helper: emits correlation-id-linked per-step events inside a prompt fanout
│   │   ├── sinks/
│   │   │   ├── _interface.ts       # MetricSink interface
│   │   │   ├── analytics-engine.ts # Production sink (writes to env.METRICS)
│   │   │   └── in-memory.ts        # Test sink (collects events into an array)
│   │   └── guard.ts                # Runtime cardinality guard — rejects unknown dims, truncates oversize strings
│   └── worker.ts                  # EDIT — add a `/status` GET branch into the existing switch-based dispatcher; small inline handler (~30 LOC). No new `routes/` directory; this codebase uses a single switch-style worker entrypoint (worker.ts:132-260) and convention is to keep it that way until the file grows large enough to split.
├── observability/                  # NEW — config-as-code for dashboards / alerts
│   ├── grafana-dashboard.json      # MCP-server dashboard, importable into Grafana
│   ├── alert-rules.yaml            # 7 alert definitions (SLO breaches + attack-signal + visibility-loss)
│   ├── runbooks/                   # Markdown runbooks linked from alerts (one per alert)
│   │   ├── inoreader-budget-exhausted.md
│   │   ├── radar-snapshot-stale.md
│   │   ├── health-check-failing.md
│   │   ├── traffic-spike-detected.md
│   │   ├── scope-mismatch-403-rate.md
│   │   ├── oauth-refresh-failure-rate.md
│   │   └── sentry-envelope-post-failure-rate.md
│   └── slo-baselines.md            # Living document — measured baselines + calibration rules per metric kind
└── tests/
    ├── unit/metrics/
    │   ├── with-metrics.test.ts    # NEW — HOF emits the right event with the right dims
    │   ├── guard.test.ts           # NEW — cardinality guard rejects unknown dims, truncates strings >N chars
    │   ├── sinks/
    │   │   └── in-memory.test.ts   # NEW — sink contract conformance
    │   └── schema.test.ts          # NEW — AE column-map snapshot test (catches accidental schema drift)
    └── integration/
        └── metrics-emission.test.ts # NEW — asserts every registered Tool/Resource/Prompt emits ≥1 event (uses InMemorySink)
```

---

## Implementation Plan

### Pre-implementation verified facts (2026-05-27 — do not re-litigate during coding)

These were verified against Cloudflare docs + the live codebase via an impartial-agent audit on 2026-05-27. Locked-in so Phase 1 starts with zero ambiguity:

| Question                                                              | Verified answer                                                                                                                                                                                                                                                                                                                                                                                                           | Source                                                                                                                                 |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Does Analytics Engine require Workers Paid?                           | **No.** AE works on the Workers **Free** plan with 100k data-point writes/day + 10k read queries/day. Paid raises to 10M writes/mo + 1M reads/mo, then $0.25/M writes + $1.00/M reads.                                                                                                                                                                                                                                    | [developers.cloudflare.com/analytics/analytics-engine/pricing/](https://developers.cloudflare.com/analytics/analytics-engine/pricing/) |
| AE retention                                                          | **3 months** (90 days) on every plan tier — quoted verbatim from limits doc.                                                                                                                                                                                                                                                                                                                                              | [developers.cloudflare.com/analytics/analytics-engine/limits/](https://developers.cloudflare.com/analytics/analytics-engine/limits/)   |
| AE per-call shape                                                     | Up to **20 blobs + 20 doubles + 1 index** per `writeDataPoint`. Blob fields ≤16 KB total per data point; index ≤96 bytes.                                                                                                                                                                                                                                                                                                 | Same limits doc                                                                                                                        |
| AE per-invocation cap                                                 | **250 data points / Worker invocation.** Our highest-volume path (a tool fanout in a prompt firing) emits at most ~10 events — orders of magnitude under the cap.                                                                                                                                                                                                                                                         | Same limits doc                                                                                                                        |
| `writeDataPoint` shape                                                | `env.METRICS.writeDataPoint({ blobs: [...strings], doubles: [...numbers], indexes: [...] })`. Non-blocking; never `await`.                                                                                                                                                                                                                                                                                                | [workers/examples/analytics-engine](https://developers.cloudflare.com/workers/examples/analytics-engine)                               |
| `wrangler.toml` binding                                               | `[[analytics_engine_datasets]] binding = "METRICS" dataset = "mcp_events"` works on Free + Paid alike.                                                                                                                                                                                                                                                                                                                    | Same examples doc                                                                                                                      |
| `keyOwner` is already in `safeLog.LogEvent` and per-request available | Confirmed: `mcp-server/src/auth/safe-logger.ts:43-44` (`keyOwner?: string`); `worker.ts:264-304` resolves it on every request from `authenticate(request, env)`. Already passed into the per-request `tagRequest(auth.keyOwner, url.pathname)` Sentry scope.                                                                                                                                                              | Code                                                                                                                                   |
| Per-request `createServer` already exists with an options bag         | Confirmed: `mcp-server/src/server.ts:71` — `createServer(env: Env = {}, ctx: ServerContext = {})` where `ServerContext` is `{ scopes?, radarSource? }`. Extending with `metricsSink?: MetricSink` + `keyOwner?: string` is backward-compatible; stdio path (`index.ts`) passes neither and defaults to a no-op sink. Worker builds the server fresh per-request (`worker.ts:412`), so closures capture per-request state. | Code                                                                                                                                   |
| `singleFetch` is still the Inoreader chokepoint                       | Confirmed at `mcp-server/src/lib/inoreader-client.ts:202`. Phase 0's wrapper attaches here; Phase 1's `inoreader_call` emitter reads from `inoreader-egress.ts` (same chokepoint).                                                                                                                                                                                                                                        | Code                                                                                                                                   |
| 5 Inoreader egress categories                                         | Confirmed at `mcp-server/src/lib/inoreader-egress.ts:83-89`: `cron-radar`, `live-radar`, `http-radar-snapshot`, `oauth-refresh`, `401-retry` (only `oauth-refresh` is `zone1: false`).                                                                                                                                                                                                                                    | Code                                                                                                                                   |
| Cron cadence                                                          | `0 */6 * * *` (every 6h) — `mcp-server/wrangler.toml:132`. SLO freshness threshold + snapshot-stale alert derive from this cadence (`2 × interval = 12h`).                                                                                                                                                                                                                                                                | Code                                                                                                                                   |
| `cron_outcome` already in Sentry via envelope check-ins               | Confirmed at `worker.ts:194-217` (BL-032.76 envelope path). Phase 1 chooses: dual-write to AE for unified dashboard SQL OR query Sentry Crons directly. **Decision**: dual-write — keeps the AE column-map uniform and avoids a second query surface in Grafana.                                                                                                                                                          | Code                                                                                                                                   |

### Design-resolved items (concrete answers, not "tbd" elisions)

The audit flagged several items the plan glossed as one-liners. Concrete designs below:

**1. `keyOwner` propagation through `with-metrics` HOF** — solved by the existing per-request `createServer` pattern. The Worker builds the MCP server fresh on every fetch (`worker.ts:412`), already passing `{ scopes: auth.scopes, radarSource: 'worker' }`. Extend to `{ scopes, radarSource, keyOwner: auth.keyOwner, metricsSink }`. `withMetrics(handler)` reads `keyOwner` + `metricsSink` from the closure context captured at registration time. **No AsyncLocalStorage, no new request-context primitive** — the existing closure pattern is sufficient.

**2. `MetricSink` API surface through `createServer`** — backward-compatible options-bag extension to `ServerContext`. `createServer(env, ctx?)` where `ctx?: { scopes?, radarSource?, keyOwner?, metricsSink? }`. Stdio `index.ts` continues to call `createServer()` with no args; the resulting server uses `InMemorySink` (default) or a no-op sink — emission becomes a tested behavior in stdio runs even when no AE binding exists. Worker passes the production `AnalyticsEngineSink(env.METRICS)`.

**3. Grafana → AE datasource path** — **no first-class "Cloudflare Analytics Engine" Grafana plugin exists.** AE is queried via Cloudflare's SQL API: `POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/analytics_engine/sql` with `Authorization: Bearer <CF_API_TOKEN>` (token needs `Account Analytics:Read` permission). Use Grafana's [Infinity datasource plugin](https://github.com/grafana/grafana-infinity-datasource) — supports custom auth headers, JSON/SQL responses. Provision: (a) create a CF API token scoped to `Account Analytics:Read` only; (b) store it as a Grafana datasource-config secret; (c) point Infinity at the SQL API URL; (d) configure each panel to send the SQL query in the request body. Token rotation: documented in DEPLOY.md § new "Grafana → AE token rotation" sub-section.

**4. `/status` page IP-restriction** — two viable mechanisms, pick during Phase 3:

- **Option A (recommended, zero new infra)**: `cf-connecting-ip` allowlist inside the `/status` branch of `worker.ts`. Add an `env.STATUS_ALLOWED_IPS` secret (comma-separated CIDR list, parsed once per request). Internal-only initially; opening it externally later is a one-line config change.
- **Option B (zero-trust hand-off)**: Cloudflare Access policy on the `/status` path. Requires Cloudflare Access subscription (Free tier covers up to 50 users — fits internal team). More secure (SSO-gated) but adds a new service surface. Recommended when BL-033 demands per-user audit log on status-page access.
- Default to A for Phase 3; revisit at BL-033 hand-off.

**5. Sentry-envelope-post-failure-rate counter location** — the audit correctly flagged the circular-dependency risk (a counter for "we lost Sentry visibility" can't itself live in Sentry). Solution: counter lives in **Upstash** (`mcp:sentry-envelope:failures:<UTC-date>` + `mcp:sentry-envelope:posts:<UTC-date>`, same TTL pattern as the Phase 0 spend counters). `postSentryEvent`/`postSentryCheckIn` in `sentry-envelope.ts` increment both keys on fetch result. Grafana queries Upstash directly via a separate Infinity datasource pointed at the Upstash REST API, OR `/health` surfaces the daily ratio and Grafana scrapes `/health`. **Decision**: surface in `/health.sentryEnvelope = { posts: N, failures: N, failureRate: F }` and let the existing `/health` polling cadence carry it — avoids a second Grafana datasource.

**6. Backwards-compat with stdio path** — `createServer()` (no args) still works. `InMemorySink` is the default when `ctx.metricsSink` is undefined. Stdio runs collect events into memory; tests assert on them. No AE binding required.

**7. CI/CD obligations** — Phase 1 adds: `schema.test.ts` snapshot pin; `metrics-emission.test.ts` integration test asserting every registered Tool/Resource/Prompt emits ≥1 event. Phase 3 adds: `alert-rules.yaml` schema validation (yamllint + a custom check that every alert has a runbook link); `lastReviewedAt` frontmatter staleness check (CI fails if any runbook >6 months stale OR if its linking alert has changed since last review). Folded into the existing GitHub Actions matrix; no new workflow file.

### Phase 0 — unblock dishonest signals (✅ SHIPPED 2026-05-26)

The spend-accounting gap below would silently corrupt every Inoreader-related dashboard and the "alert at 70% budget" SLO. Landed before any typed-emitter work so the baselining sprint runs against accurate data.

**Status (2026-05-27)**: code shipped (`inoreader-egress.ts` 333 LOC, 25 unit tests + 5 architectural audit-fix commits). **Soak in progress** — 7-day parallel-soak window (2026-05-26 → ~2026-06-02) running the new counter alongside the old `mcp:inoreader:day-counter:*` for daily reconciliation against Inoreader Developer Console. Post-soak cleanup PR (delete old keys) is sequenced between soak close and Phase 1 PR ship.

**Revised after adversarial review 2026-05-26.** Original plan wrapped at the three public reader functions, mislabeled OAuth as Zone-1, and reinvented spend tracking that Inoreader already returns in response headers. Revisions below address those gaps. Open questions from the review have been answered against the codebase and Inoreader's docs — answers locked in below so Step 1 starts with zero ambiguity.

**Pre-implementation facts (answered 2026-05-26 — do not re-litigate during coding):**

| Question                                             | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Source                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Is `singleFetch` the chokepoint?                     | Yes — only one `fetch(` call in `inoreader-client.ts` ([line 171](mcp-server/src/lib/inoreader-client.ts#L171)). `authenticatedFetch` calls it twice on 401-retry (once at [line 205](mcp-server/src/lib/inoreader-client.ts#L205), again via `retryWithFreshConfig` at [line 236](mcp-server/src/lib/inoreader-client.ts#L236)). Wrap `singleFetch` and both retry legs are counted.                                                                                                                                                                                                                                                                                                                                                                  | Code read                                                                                   |
| HTTP-call count per cron run                         | **6 Zone-1 calls**: `fetchAllStreams` = 1 tag-list + 4 folder fetches (4 GST-prefixed folders: pe-ma, enterprise-tech, ai-automation, security) = 5, plus `fetchAnnotatedItems` = 1. Plus 0–1 OAuth refresh (not Zone-1, see below).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | [`inoreader-client.ts:381-385`](mcp-server/src/lib/inoreader-client.ts#L381-L385) docstring |
| Is `/oauth2/token` Zone-1?                           | **No — exempt.** Inoreader's docs Zone table lists endpoints under `/reader/api/0/*` (e.g. `/reader/api/0/token` is a CSRF token, Zone-1). `/oauth2/token` lives in a separate URL space (`/oauth2/*`) and is not classified in either Zone table. Tag as a distinct category `'oauth-refresh'` and EXCLUDE from Zone-1 spend totals; report separately.                                                                                                                                                                                                                                                                                                                                                                                               | https://www.inoreader.com/developers/rate-limiting (Zone table) — confirmed 2026-05-26      |
| Does a 429 response count against Zone-1?            | **Yes.** Inoreader returns `X-Reader-Zone1-Usage` populated on 429 responses (code comment at [`inoreader-client.ts:69-70`](mcp-server/src/lib/inoreader-client.ts#L69-L70): "All five fields are present on a typical 429"). To stay synchronized with Inoreader's own counter, our wrapper MUST increment on 429.                                                                                                                                                                                                                                                                                                                                                                                                                                    | Code comment + parser at [line 297](mcp-server/src/lib/inoreader-client.ts#L297)            |
| Header name for authoritative spend                  | `X-Reader-Zone1-Usage`, parsed at [`inoreader-client.ts:258`](mcp-server/src/lib/inoreader-client.ts#L258). Daily quota default `X-Reader-Zone1-Limit: 100` (Custom plans higher).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Code + docs confirmed                                                                       |
| Does `/radar/snapshot` SSR call carry `opts.source`? | **No.** [`worker.ts:382`](mcp-server/src/worker.ts#L382) invokes `readWireLive(env)` / `readFyiLive(env, 30)` with no opts — defaults to `'live-tool'` at [`radar-live-store.ts:103,160`](mcp-server/src/content/radar-live-store.ts#L103). SSR cache-miss bursts are currently indistinguishable from MCP-tool live calls. Fix: pass `{ source: 'http-snapshot' }` from worker.ts:382 + widen `InoreaderObservedSource` at [`observability/inoreader-status.ts:43`](mcp-server/src/observability/inoreader-status.ts#L43) from `'cron' \| 'live-tool'` to add `'http-snapshot'`. Backward-compatible widening but `inoreader-status` persists to Upstash — downstream readers must accept the new value (it's an internal enum, no external clients). | Code trace                                                                                  |

**~~Prerequisite gate (blocking)~~ — SUPERSEDED 2026-05-27 by BL-032.76:** the SDK was the failure surface, not the DSN. BL-032.76's envelope path (`postSentryEvent` / `postSentryCheckIn` in `sentry-envelope.ts`) bypasses the SDK entirely on the cron path; Sentry-side observability is now reliable end-to-end. This Phase 0 prerequisite no longer applies (kept here as historical context for future-you reading the doc).

1. **Inoreader egress wrapper at `singleFetch`, not at the three public functions.** Create `mcp-server/src/lib/inoreader-egress.ts` exporting `fetchInoreaderTracked(env, url, init, category)` (zone-agnostic name — see finding F3 below). Wrap `singleFetch` in `inoreader-client.ts` so every outbound HTTP request is counted exactly once, INCLUDING the 401-retry that `authenticatedFetch` issues internally (`inoreader-client.ts` retry path) — public-function-level wrapping would undercount that retry and also miss the tag-list fetch that `fetchAllStreams` makes internally before fanning out to N folder fetches. Separately wrap the OAuth POST in `inoreader-oauth.ts::refreshAccessToken`.

   Category enum: `'cron-radar' | 'live-radar' | 'http-radar-snapshot' | 'oauth-refresh' | '401-retry'`. The two new entries vs the original plan:
   - `'http-radar-snapshot'` — the website's SSR endpoint at `worker.ts:357-403` (`GET /radar/snapshot`) calls `readWireLive`/`readFyiLive` on the same path as live-radar tools. Categorize separately so SSR cache-miss bursts don't mask MCP-tool traffic in the dashboard. Plumb via `opts.source` from the request handler.
   - `'401-retry'` — the retry inside `authenticatedFetch` is a real outbound HTTP that counts against Inoreader's quota; treat it as its own category so reconciliation surfaces auth-churn separately from real traffic.

2. **Use response headers as the authoritative spend signal.** Every authenticated Inoreader response returns `X-Reader-Zone1-Usage` (parsed in `inoreader-client.ts:249-262`). Inoreader is the source of truth — the Upstash counter is redundant for dashboard reporting and would drift from the headers. Revised design:
   - Header-derived `zone1Usage` is the dashboard truth (emitted via `/health.inoreaderSpend.observed`).
   - Upstash counter is repurposed as a **pre-flight cap guard only**: incremented per call, read by the soft-cap check, and reconciled against headers at the end of each cron run. A reconciliation drift of >2 in either direction logs a Sentry message (`inoreader.spend.drift`).
   - Counter key remains `mcp:inoreader:zone1-spend:<YYYY-MM-DD>` for backward symmetry but is now an INTERNAL guard, not a reporting source.

3. **OAuth tagged as `'oauth-refresh'`, excluded from Zone-1 totals.** Resolved by pre-implementation fact-check (see table above): `/oauth2/token` is not classified in Inoreader's Zone tables. The wrapper around `refreshAccessToken` tags the call as `'oauth-refresh'` and is reported separately in `/health.inoreaderSpend.byCategory` but NOT summed into `total` or compared against `X-Reader-Zone1-Usage`. Code comment at the wrapper site cites https://www.inoreader.com/developers/rate-limiting (Zone table) with the verified-on date.

4. **Cron soft-cap stays at 6.** Per pre-implementation count: 1 tag-list + 4 folder fetches + 1 annotated-items = 6 Zone-1 calls per cron run. Keep `radar-refresh.ts:187` at `counter + 6 > 94`. Replace the existing inline comment with line citations: `// fetchAllStreams = 1 tag-list (inoreader-client.ts:398) + 4 folder fetches (4 GST-* folders, inoreader-client.ts:381-385) + fetchAnnotatedItems = 6 Zone-1 calls/cron`. If folder count ever changes (new GST-prefix added), the constant must be updated — flag in a test that asserts `fetchAllStreams` HTTP call count matches the cap math.

5. **Do NOT delete the old day-counter in this PR.** Run the new wrapper PARALLEL to the existing `incrementDayCounter` / `readDayCounter` for one 7-day soak. If the new counter reconciles with headers AND with the old day-counter within tolerance, file a follow-up PR to remove the old keys. Combining "new instrumentation" + "delete old guard" in one PR leaves zero budget protection if the new wrapper has a bug. Export `mcp:inoreader:day-counter:*` historical values to a JSON snapshot before any deletion (one-way door — historical record is irrecoverable once gone).

6. **`/health` gains** `inoreaderSpend: { observed: number, counter: number, drift: number, byCategory: { 'cron-radar': N, 'live-radar': N, 'http-radar-snapshot': N, 'oauth-refresh': N, '401-retry': N } }` where `observed` is the latest `X-Reader-Zone1-Usage` header, `counter` is the Upstash total, and `drift = counter - observed`.

7. **Test coverage** (per BACKLOG § "Acceptance criteria for this sub-deliverable"):
   - 200 response increments counter + parses header
   - Network error / 5xx does NOT increment counter
   - **429 increment**: 429 DOES increment (resolved by pre-implementation fact-check — Inoreader counts the 429 itself in `X-Reader-Zone1-Usage`; staying in sync requires we count it too). Test pins this behavior.
   - 401-retry counts as TWO increments under the `'401-retry'` category for the retry leg
   - TTL set on first-write
   - Drift calculation correct when header and counter disagree

8. **Soak: 7-day stability window post-deploy.** Daily reconciliation: header-observed Zone-1 usage vs Upstash counter vs Inoreader Developer Console should agree within ±1 call/day. If the three don't reconcile, there's a fifth egress point not yet categorized.

Full scoping is in BACKLOG § "Inoreader spend accounting — day-counter completeness gap"; this phase implements it.

#### Post-implementation audit + design fixes (2026-05-26)

The Phase 0 code passed initial review (792 → 804 tests green, typecheck clean) but a second adversarial pass surfaced 11 correctness issues — 3 critical (would corrupt the soak-window data this PR exists to gather), 5 significant, 3 minor. Rather than patch each finding in isolation, the fixes were designed as one coherent architectural pass with these guiding principles:

- **Single source of truth** — category enum + Zone-1 membership in ONE map; everything else derived. Adding a 6th category becomes a one-line change.
- **Eventually-consistent TTL** — accept that two-op `INCR`+`EXPIRE` sequences can be interrupted by isolate eviction; always re-issue `EXPIRE` on every `INCR` so the next successful sequence repairs prior partial-fails. Cheaper and simpler than Lua / pipeline atomics.
- **TypeScript exhaustiveness** — `default → 'live-radar'` swallow case in `sourceToCategory` replaced with `const _exhaustive: never = source;` so a future `InoreaderObservedSource` widening becomes a compile error rather than a silent miscategorization.
- **Best-effort discipline preserved** — no path throws, including the new debounce + MGET paths.
- **Pure helpers** for parsing / mapping; side effects isolated to `recordInoreaderEgress` so every behavior is unit-testable.

| Audit issue                                                                                           | Severity              | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Where                                        |
| ----------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| TTL race: `INCR` then `EXPIRE` not atomic; isolate eviction between them leaves key permanent         | Critical              | Always re-issue `EXPIRE` on every `INCR`. Idempotent and ~free; next successful call repairs prior partial-fails.                                                                                                                                                                                                                                                                                                                                    | `inoreader-egress.ts::recordInoreaderEgress` |
| 401-retry sequence produces spurious drift warnings                                                   | Critical (downgraded) | **Dissolved into the daily-debounce fix below.** The math reconciles when local + observed both reflect post-401 state (Inoreader's `X-Reader-Zone1-Usage` on a 401 is post-401, matching our just-incremented counter). Any residual noise from 401-retry races is absorbed by the daily debounce; no special-case branch on `status === 401`. Document the analysis in commit message; revisit only if production data shows real false positives. | (analysis only)                              |
| Empty `X-Reader-Zone1-Usage` header (`""`) parsed as `0` → drift floods                               | Critical              | Extract pure `parseZone1UsageHeader(res)` helper with trim + non-empty + `isFinite` + `n >= 0` guards. Returns `undefined` for `""`, `"  "`, `"abc"`, `"-1"`.                                                                                                                                                                                                                                                                                        | `inoreader-client.ts`                        |
| `sourceToCategory` `default → 'live-radar'` swallows future enum additions silently                   | Significant           | Drop default; exhaustive switch with `const _exhaustive: never = source;`.                                                                                                                                                                                                                                                                                                                                                                           | `radar-live-store.ts::sourceToCategory`      |
| `/health` does 6 sequential Upstash GETs (~8.6k extra reads/day for a polled endpoint)                | Significant           | `MGET` for all 7 counter keys (total + 5 categories — wait, total + 5 = 6) in one round-trip.                                                                                                                                                                                                                                                                                                                                                        | `inoreader-egress.ts::readInoreaderSpend`    |
| `safeLog.tool` field overloaded with non-tool values (`'tag-list'`, `'folder:GST-Foo'`)               | Significant           | Add dedicated `egressSource?: string` to `LogEvent`; egress module uses it instead of `tool`. Downstream Sentry queries filtering `tool = "search_radar"` get clean results.                                                                                                                                                                                                                                                                         | `safe-logger.ts` + `inoreader-egress.ts`     |
| Drift `captureMessage` fires per-call on a drifted day (~100+ Sentry events)                          | Significant           | Daily debounce: `mcp:inoreader:drift-alerted:<UTC-date>` SET-NX-EX flag. Single atomic Upstash op; `captureMessage` fires once per UTC day per drifted day. Counters keep the operator-visible truth in `/health`.                                                                                                                                                                                                                                   | `inoreader-egress.ts`                        |
| BL-039 fallback path (`triggerWebsiteRefresh`) makes uncounted Inoreader calls                        | Significant           | Document the gap in module header. Estimated <5/day under steady state; retired entirely in BL-032.8 Phase B (PR #140). Gap closes naturally on Phase B merge — no instrumentation work for a path being deleted.                                                                                                                                                                                                                                    | `inoreader-egress.ts` docstring              |
| Spread-conditional idiom verbosity (`...(v ? { v } : {})`)                                            | Minor                 | Keep — `exactOptionalPropertyTypes` is enabled in the mcp-server tsconfig (verified). Without the spread, `undefined` would propagate as a literal field.                                                                                                                                                                                                                                                                                            | (no change)                                  |
| Category list duplicated between `INOREADER_EGRESS_CATEGORIES` array and the `byCategory` initializer | Minor                 | Derive `byCategory` initializer from the `CATEGORIES` const-record via typed `Object.keys` + `reduce`.                                                                                                                                                                                                                                                                                                                                               | `inoreader-egress.ts`                        |
| `'oauth-refresh'` docstring doesn't justify the network-abort skip                                    | Minor                 | Comment-only — make explicit that the network-abort branch skips per-category recording too (consistent with the design: "nothing reached Inoreader, nothing was counted by them").                                                                                                                                                                                                                                                                  | `inoreader-oauth.ts`                         |

**Implementation order (5 atomic commits):**

1. `feat(mcp): unify category metadata + always-EXPIRE + MGET + daily drift debounce` — the big robustness pass. Touches `inoreader-egress.ts` only (plus test updates).
2. `fix(mcp): defensive X-Reader-Zone1-Usage header parsing` — extract `parseZone1UsageHeader` helper; new unit tests for the helper.
3. `refactor(mcp): exhaustive switch in sourceToCategory` — `radar-live-store.ts`; tiny change, compile-time safety.
4. `feat(mcp): dedicated egressSource log field` — `safe-logger.ts` adds field; `inoreader-egress.ts` uses it.
5. `docs(mcp): document BL-039 fallback gap + OAuth abort case` — comments only.

**Things this design explicitly chooses NOT to do:**

- **No pipeline / Lua atomic primitives** for the counter updates. Cost/complexity not justified at current scale (~30 successful calls/day total). The egress module carries a note: "If Phase 1 (Analytics Engine) increases counter volume by 10×, revisit pipelining for round-trip reduction."
- **No skip-drift-on-401 special case.** S4 daily debounce makes it unnecessary; the math reconciles when both local counter and observed header are post-401. If production data shows real noise, add the skip then.
- **No backfill of the old `day-counter:*` keys with new-counter math.** Soak window runs them in parallel; old counter removal is the follow-up PR.
- **No instrumentation of the BL-039 fallback path.** It's being retired in Phase B; instrumenting it is throwaway work.

**Net effect:** ~150 production-line change, ~120 test-line change. All 11 audit items closed (one by rationale, ten by code). The architecture stays single-chokepoint with one source of truth, eventually-consistent TTL, exhaustive switches, and pure parsing helpers — designed for easy extension when business requirements evolve (new category, new debounce window, new spend-dashboard category-of-categories).

#### Phase 0 risks (one-way doors)

| One-way door                                                                  | Mitigation                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deleting `mcp:inoreader:day-counter:*` Upstash keys                           | Export to JSON snapshot before deletion. Defer deletion to a follow-up PR after 7-day soak (Step 5).                                                                                                                               |
| Category enum locks dashboard/alert schema                                    | Enum expanded pre-merge to include `'http-radar-snapshot'` and `'401-retry'` (Step 1). Adding more later requires coordinated dashboard + alert-rule update.                                                                       |
| Helper name implies zone classification                                       | Renamed `fetchInoreaderTracked` (was `fetchInoreaderZone1`). Avoids baking an unverified zone label into every call site.                                                                                                          |
| OAuth misclassification inflates spend dashboards                             | Resolved pre-implementation: `/oauth2/token` confirmed not in Inoreader's Zone table; tagged `'oauth-refresh'` and excluded from Zone-1 totals (Step 3).                                                                           |
| `InoreaderObservedSource` widening breaks Upstash-persisted state             | Enum widening (adding `'http-snapshot'`) is backward-compatible at the type level; persisted records with old values still parse. Confirm no downstream reader uses exhaustive switch without a default — grep before merging.     |
| TTL atomicity assumption — Worker isolate evicted between `INCR` and `EXPIRE` | Always re-issue `EXPIRE` on every `INCR` (post-audit fix). Eventually-consistent TTL; next successful call repairs prior partial-fail. ~30 extra Upstash ops/day at current scale (free-tier headroom orders of magnitude larger). |
| Drift-detection alert flood when counter and header diverge persistently      | Daily debounce via `mcp:inoreader:drift-alerted:<UTC-date>` SET-NX-EX flag (post-audit fix). One Sentry event per UTC day per drifted day; counters still reflect truth in `/health`.                                              |

### Sequencing (revised 2026-05-27 after Phase 1-3 plan audit)

The original sequencing serialized everything behind the Phase 0 soak. The revised plan parallelizes Phase 1 design + scaffolding (which has no data dependency on the soak) with the soak window itself; only the `inoreader_call` emitter is gated on soak reconciliation.

| Step                                                         | When                     | Effort                | Blocking?                                     |
| ------------------------------------------------------------ | ------------------------ | --------------------- | --------------------------------------------- |
| **1**: Phase 1 design + AE schema + scaffolding              | Now (parallel with soak) | 3-4 days engineering  | No — independent of soak outcome              |
| **2**: Phase 1 emitters (7 of 8) + `with-metrics` HOF        | Now → ~2026-06-01        | folded into Step 1    | No                                            |
| **3**: Phase 0 soak passes reconciliation                    | ~2026-06-02              | (calendar wait)       | Gates Step 4 only                             |
| **4**: Wire `inoreader_call` emitter + ship Phase 1 PR       | ~2026-06-02              | 0.5 day               | —                                             |
| **5**: Post-Phase-0 cleanup PR (delete old day-counter keys) | ~2026-06-03              | 0.5 day standalone PR | Sequence between Phase 0 close + Phase 1 ship |
| **6**: Phase 2 baselining                                    | 2026-06-03 → 2026-06-10  | 7 days calendar wait  | Phase 1 must be deployed                      |
| **7**: Phase 3 dashboards + alerts                           | 2026-06-10 → ~2026-06-17 | 4-5 days engineering  | Phase 2 baselines + senior-engineer sign-off  |

**Notes on the revised timeline**:

- **Baseline window 7 days, not 10-14**: internal-only traffic with known usage patterns captures weekly seasonality in 7 days; longer just delays Phase 3 without buying meaningful signal. If post-baseline data looks noisy, extend; don't pre-budget for it.
- **BL-041 (Upstash ACL + MFA)** is independent infrastructure hardening; it stays on its own track and does NOT interleave.
- **3 BL-032.5-deferred ACs**: the `prompt_invocation` emitter (Phase 1 Step 4) covers the count + per-key breakdown the deferred `prompt_invocations_total` AC asked for; **`notifications/message` breaking-change push is a category error to fold here** — it's an MCP-protocol surface, not a metric; punt to BL-033; **`GET /prompts/<name>/scopes`** introspection also belongs in BL-033.

### Phase 1 — instrumentation (~4 days engineering across the soak window)

Partial credit already exists — `safeLog` emits the right shape, Sentry tags carry rich context, `/health.inoreaderSpend` is live. Phase 1 formalizes the second-emission to Cloudflare Analytics Engine so the data becomes SQL-queryable.

**Critical first decision — AE column map** (`mcp-server/src/metrics/_schema.ts`): decided in this doc above (§ "Analytics Engine column map"). All emitter signatures, the runtime guard, vitest fixtures, Phase 3 Grafana SQL, and the `/status` page derive from it. Make this decision concrete BEFORE writing any emitter; reverting it is a breaking change to every downstream consumer.

**Implementation order**:

1. **AE schema + sink interface** (~0.5 day): `_schema.ts` exports the column-map const, event-type enum, and per-event cardinality budget. `sinks/_interface.ts` defines `interface MetricSink { write(event: MetricEvent): void }`. `sinks/analytics-engine.ts` implements the production sink (writes to `env.METRICS`). `sinks/in-memory.ts` implements the test sink (collects events into an array). Vitest contract tests cover both sinks.
2. **Runtime cardinality guard** (~0.5 day): `guard.ts` enforces the schema at runtime — rejects events whose `event_type` is not in the enum, rejects unknown blob/double slots, truncates string blobs >256 chars (configurable per slot), and rejects values that would push the per-call payload past AE substrate limits (16 KB blob total, 96 byte index). Pairs with a CI test that enumerates registered dims against `_schema.ts`. Static enumeration catches the obvious cases; runtime enforces it holds against conditional emissions. **Note**: `keyOwner` doesn't need hashing — it's already PII-free and bounded.
3. **`with-metrics` HOF** (~1 day): single-chokepoint wrapper at the registry invoke layer (same pattern as Phase 0's `singleFetch` chokepoint). `registerTool(name, handler)` → `registerTool(name, withMetrics(handler))` at registry-build time; handlers stay focused on domain logic. **Important**: this is a higher-order function, NOT a JS/TS decorator — Workers don't have first-class decorator runtime support, and the Tool/Resource/Prompt registries in this codebase are object-registries, not class-based. The HOF approach gives every benefit a decorator would without the syntax-class refactor.
4. **Per-event emitters** (~1.5 days, includes `prompt_span`): `with-metrics.ts` knows how to map a Tool invoke → `tool_invocation` event, a Resource read → `resource_read` event, etc. The Prompt path additionally instruments fan-out via `prompt-span.ts` (one event per downstream tool step, sharing a `correlation_id`).
5. **Cloudflare Analytics Engine binding in `wrangler.toml`** (~0.25 day):
   ```toml
   [[analytics_engine_datasets]]
   binding = "METRICS"
   dataset = "mcp_events"
   ```
6. **`inoreader_call` emitter** (~0.5 day, **gated on Phase 0 soak passing**): wraps the `recordInoreaderEgress` call in `inoreader-egress.ts` so every counter increment also writes an AE event. Single source of truth — the `/health.inoreaderSpend` numbers and the AE events derive from the same chokepoint.
7. **Vitest coverage** (sized into each step above): `with-metrics.test.ts` for the HOF; `guard.test.ts` for cardinality enforcement; `in-memory.test.ts` for sink conformance; `schema.test.ts` snapshot-pin of the column map; `metrics-emission.test.ts` integration test asserting every registered Tool/Resource/Prompt emits ≥1 event via `InMemorySink` injection.

**Test pattern** (illustrative, for `metrics-emission.test.ts`):

```ts
const sink = new InMemorySink();
const server = createServer(env, { metricsSink: sink });
await invokeTool(server, 'search_radar', { tier: 'wire' });
expect(sink.events).toContainEqual(
  expect.objectContaining({
    blob1: 'tool_invocation',
    blob2: 'search_radar',
    blob4: 'success',
  })
);
```

### Phase 2 — baselining (7 days calendar wait + ~1 day engineering)

1. Deploy instrumented build to production at end of Phase 1.
2. Let it run with normal team usage for **7 days** (revised from 10-14; internal-only traffic captures weekly seasonality in 7 days).
3. Pull traffic data via the Workers Analytics SQL API; produce `mcp-server/observability/slo-baselines.md` documenting measured p50/p95/p99 per Tool / Resource / Prompt + Inoreader spend by category.
4. Apply the **per-metric-kind calibration rules** documented in § 2 above (latency `× 1.5`, availability error-budget floor, throughput headroom percentage, freshness `2 × cron-interval`) to produce initial SLO targets.
5. Senior-engineer review + sign-off captured in `slo-baselines.md`.

### Phase 3 — dashboards + alerts (~4-5 days engineering)

1. **`grafana-dashboard.json`** — traffic, latency histograms, error rates, rate-limit pressure, Inoreader budget burn-down, radar snapshot age, cache hit rate. Single-dataset SQL queries against `mcp_events` with `WHERE blob1 = '<event_type>'` filters.
2. **`alert-rules.yaml`** — all 7 canonical alerts (budget, snapshot, health, traffic, scope-403, oauth-failure, sentry-envelope-failure) with the calibrated SLO thresholds from Phase 2.
3. **Slack webhook + PagerDuty integration**: wire both; test-fire each alert via synthetic SLO breach (e.g. feature flag injecting 5% error rate, manual counter bump to trigger budget alert).
4. **7 runbooks under `observability/runbooks/`** (one per canonical alert): each has a `lastReviewedAt` frontmatter field; CI test fails if any runbook is >6 months stale OR if the linking alert rule has changed since `lastReviewedAt`.
5. **Status page at `https://status.mcp.globalstrategic.tech`** — **rendered through the existing Worker at `/status`** (server-side AE query, server-side cache, no client-side secret embedding). Initially IP-restricted to internal; BL-033 reviews and chooses what becomes externally visible.

### Documentation, testing, and operational obligations

Beyond the per-phase verification steps below, each phase carries documentation + test obligations that must be honored before the phase ships:

**Phase 1 documentation obligations**:

- **`mcp-server/README.md`** — append an "Observability" section: how to add a new metric event (add to `_schema.ts`, add to event-type enum, run tests); how to add a new dimension (update column-map note); how to add a new sink (implement `MetricSink` interface).
- **`mcp-server/src/metrics/_schema.ts`** — JSDoc on the column-map const explaining the positional-AE model (so the next contributor doesn't try to add a 9th `blob` mid-numbering).
- **`mcp-server/src/docs/operations/DEPLOY.md`** — add an "Analytics Engine binding rotation" section in case the dataset name ever needs to change.
- **CLAUDE.md `# auto memory` / project docs** — no update required; the conventions are repo-local and the schema doc is self-explanatory.

**Phase 1 testing obligations**:

- 100% line coverage on `metrics/` (it's a thin module; 100% is cheap and prevents accidental cardinality regressions).
- Schema snapshot test (`schema.test.ts`) — pinned snapshot of the column map; any change to event types or column positions trips the snapshot, forcing a deliberate review.
- Integration test asserts every registered Tool / Resource / Prompt emits ≥1 event under representative input.
- **Backwards-compatibility test**: assert that `safeLog` continues to emit alongside metric events (dual-write contract; doesn't break existing Sentry/log-based debugging).

**Phase 2 documentation obligations**:

- `slo-baselines.md` is a **living document** — append a "Calibration history" section logging every SLO target change with date + rationale + linking commit.
- Per-metric calibration rules from § 2 above are reproduced as a header in `slo-baselines.md` so future contributors don't have to cross-reference this doc.

**Phase 3 documentation obligations**:

- Each runbook has a fixed shape: **Symptom** / **Diagnosis** / **Mitigation (immediate)** / **Resolution (root-cause)** / **Postmortem template link**. CI test asserts the shape.
- `mcp-server/observability/README.md` — operator-facing index of dashboards, alerts, runbooks, status-page URL, on-call escalation contacts.
- Update `DEPLOY.md` § C with a new sub-section linking to the runbook directory + a "first-time on-call setup" checklist (Slack join, PagerDuty pager registration, dashboard bookmark).

**Operational obligations** (post-deploy, before declaring Phase 3 done):

- Test-fire each of the 7 canonical alerts at least once; record evidence (Slack message link + PagerDuty incident ID) in the corresponding runbook.
- Confirm Grafana Cloud free-tier headroom: dashboard refresh latency <2s; events/mo well under the 10M cap; document the AE retention story (90 days free tier) in `slo-baselines.md` with the planned $25/mo upgrade trigger for BL-033 if a longer retroactive analysis window is wanted.

### Verification

1. From `mcp-server/`: run `npm run build`, then `npm test` — green; metrics-emission tests pass. (Don't chain with `&&`; each invocation is a separate Bash tool call per CLAUDE.md Directive 12.)
2. From repo root: run `npx astro check`, then `npm run lint`, then `npm run lint:css`, then `npm run test:run` — all green. (Same: separate invocations, not a chained pipeline.)
3. Deploy to production, confirm metric events landing in Cloudflare Analytics Engine via SQL probe (`SELECT count() FROM mcp_events WHERE timestamp > now() - INTERVAL 1 HOUR`).
4. Import `grafana-dashboard.json`, confirm all panels render against the live data source.
5. Trigger a synthetic SLO breach (e.g. inject 5% error rate via a feature flag); confirm Grafana alert fires within 5 min and lands in Slack.
6. Trigger a synthetic Inoreader-budget alarm by setting the daily-budget counter to 180; confirm both ticket-level (Slack) and page-level (PagerDuty at 90%) alerts route correctly.
7. Confirm the on-call rotation receives a test page and the runbook link in the alert resolves to the correct markdown file.
8. Two-week post-deploy review: are SLOs being met? Are alerts firing on the right things and quiet on noise? Tighten or loosen baselines accordingly.

### Risks & mitigations

| Risk                                                                         | Mitigation                                                                                                                                                                           |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Alert fatigue from poorly-calibrated thresholds                              | The 7-day baselining sprint is non-negotiable; per-metric calibration rules (latency × 1.5; availability error-budget; throughput headroom; freshness 2× cron-interval); 2-week tune |
| AE schema lock-in (changing the column map is breaking for every downstream) | Schema decided + pinned via snapshot test BEFORE first emitter ships; column-map JSDoc explains positional-AE model; any change is a deliberate review with snapshot update          |
| Cardinality explosion on metric dimensions                                   | Two-layer defense: CI test enumerates registered dims against `_schema.ts`; runtime `guard.ts` rejects unknown dims + truncates strings >256 chars + samples `keyOwner` via `index1` |
| Cloudflare Analytics Engine free-tier quota exhaustion                       | Monitor own metrics emission rate; 90-day retention on free tier documented; $25/mo upgrade trigger captured in `slo-baselines.md` for BL-033 when longer retroactive window needed  |
| AE 25 events/sec/dataset write ceiling                                       | Single-dataset schema concentrates writes but stays well under ceiling at projected volume; if exceeded, split by event-family (would require new schema decision)                   |
| Runbooks drift out of sync with reality                                      | Each runbook has a `lastReviewedAt` frontmatter field; CI fails if any runbook is >6 months stale OR if the linking alert rule has changed since the runbook's last review           |
| On-call rotation insufficient (single engineer)                              | Acceptable through BL-032.75 internal use; BL-033's pilot SLA requires a second on-call rotation or a contracted on-call escalation — that decision belongs to BL-033, not here      |
| Grafana Cloud free-tier limits (3 users, 10k metrics series)                 | Monitor; the volume here fits comfortably; upgrade path is $19/user/mo if exceeded                                                                                                   |
| Status page exposes information that should stay internal                    | Status page rendered through the Worker at `/status` (server-side query, no client-secret embedding); initially IP-restricted; BL-033 chooses externally-visible surface             |
| Vendor lock-in to Cloudflare Analytics Engine                                | `MetricSink` interface allows alternative sinks (Prometheus remote-write, Datadog, etc.) to be added without touching emitters; ~30 LOC insurance                                    |
| `prompt_span` proves redundant in production                                 | Documented drop trigger: if `prompt_invocation` alone is sufficient for the first month of incidents, remove `prompt_span` (event-type enum allows clean deprecation)                |

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

**Note on retention vs measurement window**: the live SLO definitions in § 2 use rolling 30-day windows (fits comfortably inside AE's 3-month retention). For the "measured over 60 days" BL-033 claim, two paths: (a) snapshot weekly SLO numbers into a separate Upstash key or git-tracked `slo-history.md` for a long-term audit trail (recommended — survives AE retention rotation and is contract-grade evidence); (b) upgrade to Workers Paid + extended retention only if BL-033's pilot legal review wants the raw AE data instead of the rollup. Default to (a); revisit (b) at BL-033 hand-off.

---

_2026-05-27 (later) — Verification pass against impartial-agent audit of the 2026-05-27 plan revision. Verified facts (now in § "Pre-implementation verified facts" above): AE works on Workers Free plan (100k writes/day + 10k reads/day + 3-month retention; Paid raises to 10M writes/mo); `writeDataPoint({blobs, doubles, indexes})` shape correct; per-call cap is 20+20+1 with 16 KB blob payload + 96-byte index; per-Worker-invocation cap is 250 data points (NOT the stale "25 events/sec/dataset" claim removed from the doc); `singleFetch` chokepoint + 5 egress categories + `0 */6 * * *` cron all confirmed live; `createServer(env, ctx)` already accepts an options bag and the Worker already builds the MCP server per-request with closures capturing per-request state — so `keyOwner` + `metricsSink` propagation needs no AsyncLocalStorage and no new request-context primitive. Substituted `keyOwner` for the audit-fictional `key_prefix` hash (`keyOwner` already exists in `safeLog.LogEvent.keyOwner` and is PII-free + bounded). Pinned AE column map to 6 blobs + 2 doubles + 1 index (`blob1=event_type` / `blob3=keyOwner` / `index1=keyOwner` mirror for sampling). Concrete design fixes for the audit's "elided one-liners": Grafana → AE via the [Infinity datasource plugin](https://github.com/grafana/grafana-infinity-datasource) pointed at `POST /accounts/{id}/analytics_engine/sql`; `/status` IP-restriction via `cf-connecting-ip` allowlist (Option A — zero new infra) with Cloudflare Access as a documented Option B for BL-033; Sentry-envelope-post-failure-rate counter lives in Upstash (`mcp:sentry-envelope:failures:<date>`) and is surfaced via `/health.sentryEnvelope` to avoid the audit's circular-dependency footgun; Phase 1 verification commands de-chained (CLAUDE.md Directive 12 compliance); status page implementation lives in the existing switch-based `worker.ts` (no new `routes/` directory — that was a file-layout fiction). Phase 0 SENTRY_DSN prerequisite gate marked superseded by BL-032.76. 60-day BL-033 SLO claim now footnoted: rollup to `slo-history.md` rather than relying on AE retention. Net effect: every "verify before plan mode" item from the audit is now answered in-doc, with file/line evidence; the doc is ready to drive the Phase 1 implementation as-is._

_2026-05-27 — Phase 1-3 plan revision after adversarial audit. Blockers fixed: dropped the "decorator" framing in favor of `withMetrics` HOF at the registry invoke layer (same single-chokepoint pattern Phase 0 validated); decided AE column map up-front in `_schema.ts` (positional `blob1..blob6` / `double1..double2` / `index1=keyOwner`, one dataset, event-type discriminator in `blob1`); unblocked Phase 1 design + scaffolding to run in parallel with the Phase 0 soak (only the `inoreader_call` emitter is soak-gated). Majors fixed: added runtime cardinality `guard.ts` alongside CI enumeration; moved `keyOwner` into AE's `index1` sampling column; punted `notifications/message` breaking-change push to BL-033 (it's MCP-protocol, not metric); added `MetricSink` interface with `InMemorySink` for tests; added `prompt_span` correlation event as a poor-man's trace; revised status-page architecture to render through the Worker at `/status` (no client-secret embedding). Worth-knowing: per-metric calibration rules replace the blanket "× 1.5 buffer"; baseline window shortened from 10-14 to 7 days; canonical alert set expanded from 4 to 7 (added scope-mismatch 403 rate, OAuth refresh failure rate, Sentry envelope POST failure rate); AE 90-day retention documented with $25/mo upgrade trigger for BL-033. Other status updates baked in: BL-032.5 reconciled to ✅ shipped (Resources / Prompts / scope catalog / per-Resource cache live); BL-032.76 cron Sentry SDK bypass shipped + empirically verified (Cloudflare cron dashboard now reports `Success`); K-section result-shape enrichments fully closed; `/health` write-then-delete probe shipped. The "Sentry Crons UI uneven on free tier" caveat removed — BL-032.76 envelope path proved it was an SDK issue, not a tier issue._

_Last updated: 2026-05-26 (later — post-implementation audit fixes). Phase 0 code committed across 8 atomic commits + 5 audit-fix commits. Post-implementation adversarial review surfaced 11 correctness issues (3 critical, 5 significant, 3 minor); all 11 closed (one by documented rationale, ten by code). Key architectural decisions: single `CATEGORIES` const-record as source of truth; eventually-consistent TTL via always-`EXPIRE`; daily debounce of drift Sentry events; pure `parseZone1UsageHeader` helper guards against empty / non-numeric / negative header values; `sourceToCategory` switch made exhaustive via `never` check; dedicated `egressSource` log field replaces `tool`-field overloading; `/health` uses MGET (1 round-trip vs 6); BL-039 fallback gap documented (retires in Phase B). Net: ~150 production-line + ~120 test-line change._

_Earlier 2026-05-26 — Phase 0 revised after pre-implementation adversarial review. Wrap relocated from 3 public functions to `singleFetch` chokepoint (catches 401-retries + internal fan-out). Helper renamed `fetchInoreaderTracked` (zone-agnostic). Category enum expanded to include `'http-radar-snapshot'` (SSR endpoint at `worker.ts:357-403`) and `'401-retry'` (the retry inside `authenticatedFetch`). Response-header `X-Reader-Zone1-Usage` promoted to authoritative spend signal; Upstash counter demoted to pre-flight cap guard with drift detection. Day-counter deletion moved to follow-up PR after 7-day soak. OAuth zone classification gated on Inoreader docs verification. Prerequisite: SENTRY_DSN rotation verification (≥2 cron-success captures) before Step 1. Effort revised 1.5d → 2.5–3d._

_Previously: 2026-05-25 — brought current with BL-032.7 (✅ 2026-05-16), BL-032.8 Phase A (✅ 2026-05-17), and today's cron Sentry observability (0.3.12 + 0.3.13). Added Phase 0 for the BL-032.8 Day-5 spend-accounting fix as a prerequisite to honest budget-burn dashboards. Metrics table annotated with "already emitted?" column. Stack-choice table flags Sentry Crons free-tier visibility caveat. Phase 1 acknowledged for partial credit from existing `safeLog` + Sentry tags. Phases 2-3 shifted by one week to accommodate Phase 0._

_Originally filed: 2026-04-25._
