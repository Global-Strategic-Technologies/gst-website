# Runbook — Status page (`/status` + `status.mcp.globalstrategic.tech`)

lastReviewedAt: 2026-07-26

Public, unauthenticated server-rendered HTML at `mcp.globalstrategic.tech/status` and, since BL-033 Slice 4, at the dedicated subdomain **`status.mcp.globalstrategic.tech`** (its root `/`). Source: `src/observability/status-page.ts` (`buildStatusHtml`). Never throws — every degraded source renders as an unknown/placeholder.

## What it shows

| Panel                                                         | Source                                       | Notes                                                                                         |
| ------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Header badge + env/version/gitSha                             | `buildHealthPayload` (live probes)           | `version` is the deploy-injected `env.VERSION` (BL-033 Slice 4); `gitSha` the deployed commit |
| Substrate (Upstash, Inoreader, radar freshness, Zone-1 spend) | `buildHealthPayload`                         | freshness + spend carry **ratified-SLO badges** (12h / 70-90%)                                |
| SLO alerts                                                    | `mcp:alerts:last-eval` (evaluator cron)      | the 7 canonical rules, per-rule state                                                         |
| **Tool latency (server-side, 7d)**                            | `mcp:status:metrics:<env>` (evaluator cron)  | per-tool p50/p95/p99 + sample count                                                           |
| **Audit log**                                                 | `mcp:status:metrics:<env>` + audit chain tip | records committed (`lastSeq`), 24h batches/records, last-processed                            |

## Data flow — precompute, not live-query

The page does **no live Analytics Engine query on the render path**. The 15-min alert-evaluator cron (`src/observability/alert-evaluator.ts`) computes the latency + audit metrics (`computeStatusMetrics`, `src/observability/status-metrics.ts`) and caches them to Upstash `mcp:status:metrics:<env>` alongside the alert summary; `/status` reads that cache (`readStatusMetrics`). This mirrors how the alert table already works, and avoids per-render AE reads (a `Cache-Control` header on a Worker `Response` does **not** edge-cache).

Consequences:

- **Staging shows "unavailable"** for the latency + audit panels — staging deliberately runs no cron (`wrangler.toml`), exactly like the existing alert table. Live verification is on **production**.
- On a fresh prod deploy the panels populate within ~15 min (first cron run). Until then: "metrics unavailable — the evaluator cron populates every 15 min".
- Requires `CF_AE_TOKEN` + `CF_ACCOUNT_ID` bound in prod (already are, for the alert evaluator). Unbound → AE query fails open → latency panel "unavailable"; the audit `lastSeq` (from Upstash) still renders.

## Surface, don't ratify (BL-033 operator directive)

The **tool-latency panel renders raw p50/p95/p99 as plain values — no badges, no pass/fail threshold, no SLA.** This is deliberate: the tool/resource/prompt-latency SLO is **explicitly deferred** in `observability/slo-baselines.md` (no client traffic to calibrate against, and no pilot has contracted a latency SLA). Do NOT:

- wire the `p95 < 500ms` figure (a stray phrase in `LATENCY_PROBE.md`) into a badge/breach here;
- add a "proposed target" column;
- add a latency-breach alert rule.

Contrast the freshness/spend rows, which DO carry badges — those are signed-off SLOs. The latency numbers are observability only until a pilot conversation defines targets.

## Subdomain

`status.mcp.globalstrategic.tech` is a `custom_domain` route in `wrangler.toml` (production). `custom_domain=true` auto-provisions the DNS record + edge cert on deploy (the zone is already on Cloudflare). The fetch handler serves status at the subdomain **root** (`worker.ts` widens the `/status` check to `hostname.startsWith('status.') && pathname === '/'`, which runs before the routed-path 404 gate). The apex `mcp.globalstrategic.tech/status` keeps working.

## Related

- `AUDIT_LOG.md` — the audit pipeline whose health this page surfaces.
- `SENTRY_ALERT_RULES.md` — the alert rules whose last-run this page shows.
- `LATENCY_PROBE.md` — the client-side latency probe (CI artifact; distinct from the server-side AE p50/p95 shown here).
