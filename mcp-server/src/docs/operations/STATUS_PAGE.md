# Runbook — Status page (`/status` + `status.mcp.globalstrategic.tech`)

lastReviewedAt: 2026-08-08

Public, unauthenticated server-rendered HTML at `mcp.globalstrategic.tech/status` and, since BL-033 Slice 4, at the dedicated subdomain **`status.mcp.globalstrategic.tech`** (its root `/`). Source: `src/observability/status-page.ts` (`buildStatusHtml`). Never throws — every degraded source renders as an unknown/placeholder.

## What it shows

| Panel                                                         | Source                                       | Notes                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header badge + env/version/gitSha                             | `buildHealthPayload` (live probes)           | `version` is the deploy-injected `env.VERSION` (BL-033 Slice 4); `gitSha` the deployed commit                                                                                                                                                              |
| Substrate (Upstash, Inoreader, radar freshness, Zone-1 spend) | `buildHealthPayload`                         | freshness + spend carry **ratified-SLO badges** (12h / 70-90%)                                                                                                                                                                                             |
| SLO alerts                                                    | `mcp:alerts:last-eval` (evaluator cron)      | the 7 canonical rules, per-rule state — **four** states, see below                                                                                                                                                                                         |
| **Upstream I/O wait per tool (7d)**                           | `mcp:status:metrics:<env>` (evaluator cron)  | per-tool p50/p95/p99 + sample count, filtered at render to rows with `p99 > 0`. Two empty states: "no `tool_invocation` events" vs "_N_ tools invoked, none with measurable I/O wait" — the second is the **expected quiet-week state**, not a degradation |
| **Audit log**                                                 | `mcp:status:metrics:<env>` + audit chain tip | **hidden while the pipeline is deactivated** (ADR-0014). Gated on `env.AUDIT_QUEUE` being unbound — the same signal `handle-authenticated.ts` uses to no-op the producer — so it returns by itself on re-enable, with no code change                       |

## Data flow — precompute, not live-query

The page does **no live Analytics Engine query on the render path**. The 15-min alert-evaluator cron (`src/observability/alert-evaluator.ts`) computes the latency + audit metrics (`computeStatusMetrics`, `src/observability/status-metrics.ts`) and caches them to Upstash `mcp:status:metrics:<env>` alongside the alert summary; `/status` reads that cache (`readStatusMetrics`). This mirrors how the alert table already works, and avoids per-render AE reads (a `Cache-Control` header on a Worker `Response` does **not** edge-cache).

Consequences:

- **Staging shows "unavailable"** for the latency + audit panels — staging deliberately runs no cron (`wrangler.toml`), exactly like the existing alert table. Live verification is on **production**.
- On a fresh prod deploy the panels populate within ~15 min (first cron run). Until then: "metrics unavailable — the evaluator cron populates every 15 min".
- Requires `CF_AE_TOKEN` + `CF_ACCOUNT_ID` bound in prod (already are, for the alert evaluator). Unbound → AE query fails open → latency panel "unavailable"; the audit `lastSeq` (from Upstash) still renders.
- Since the ADR-0014 deactivation, the audit panel's AE-derived counters (24h batches/records) legitimately read 0 and `lastSeq` is static — that is the expected steady state, not a fault.

## Alert states — four, not two (BL-122)

A rule has three real outcomes, not two: it passed, it breached, or **it could not check**. The third happens when a rule's data source is unreachable (AE secrets unbound, query failed, Upstash down); rules are contractually fail-open, so they return `breached: false` — and until BL-122 that rendered as a green `ok`.

That made an unverified check indistinguishable from a passing one, which is the failure mode worth caring about: monitoring that has silently stopped monitoring, while displaying green. Those arms now set `evaluated: false`, and the page renders a distinct state.

| State        | Colour          | Meaning                                                     |
| ------------ | --------------- | ----------------------------------------------------------- |
| `ok`         | green `#0a7d4f` | Evaluated; not breached                                     |
| `unknown`    | slate `#8a9bb0` | **Could not evaluate** — data source unreachable            |
| `eval-error` | amber `#946200` | The rule's `evaluate()` threw                               |
| `BREACHED`   | red `#b3261e`   | Evaluated; breached (`breached (cooldown)` when suppressed) |

`unknown` is muted rather than alarming — nothing is known to be wrong, but nothing was verified. **It must never render green**; a test asserts all four colours differ.

`eval-error` and `unknown` stay separate because they are different faults: one is a bug in the rule, the other is an unreachable dependency.

**Alerting is unchanged.** `breached` stays `false` in the unknown case, so no Sentry event fires and a blind check never pages. Display-only. Consequence worth knowing: if AE is misconfigured, several rows go `unknown` at once — the page looks worse without the server having got worse.

## Surface, don't ratify (BL-033 operator directive)

**Still in force.** The panel survived BL-122, so this rule is load-bearing rather than moot.

The **I/O-wait panel renders raw p50/p95/p99 as plain values — no badges, no pass/fail threshold, no SLA.** This is deliberate: the tool/resource/prompt-latency SLO is **explicitly deferred** in `observability/slo-baselines.md`. Do NOT:

- wire the `p95 < 500ms` figure (a stray phrase in `LATENCY_PROBE.md`) into a badge/breach here;
- add a "proposed target" column;
- add a latency-breach alert rule.

Contrast the freshness/spend rows, which DO carry badges — those are signed-off SLOs. The I/O-wait numbers are observability only until a pilot conversation defines targets.

## What the number actually is (BL-122)

`duration_ms` is `Date.now() - startedAt` around the handler (`src/metrics/with-metrics.ts`), and **Cloudflare Workers freeze the clock outside I/O** as a Spectre mitigation — per Cloudflare's security model, `Date.now()` _"returns the time of the last I/O [and] does not advance during code execution"_. So the panel measures the wall time a handler spent **blocked on Upstash / Inoreader**, never its compute. A handler that touches no network scores exactly `0` however much work it does — `generate_information_request_list_xlsx` builds an entire spreadsheet and reports 0 ms.

There is no workaround: Workers provide no unfrozen timer, so `performance.now()` behaves identically.

**Why omission beats showing `0`.** Ten of fifteen tools read 0 with healthy sample counts (measured 2026-08-13: `search_regulations` 326 samples, 0 ms). Published as-is they read as broken instrumentation or as "instant", and both readings are wrong. Filtering on `p99 > 0` publishes only rows where the metric means something.

**The filter is on the measurement, not a tool list.** The query is `GROUP BY blob2` with no tool list anywhere in the code, so a hardcoded allowlist would need hand-maintaining and would drift the first time a tool gained or lost an I/O path. `p99` rather than `p50` — a tool that only reaches the network on a cache miss has `p50 = 0` and a real `p99`, and must survive.

**It is applied at render, never inside `computeToolLatency`.** `toolLatency === []` has to keep meaning exactly one thing — no `tool_invocation` events in the window — because the empty-state copy asserts it. Filtering at compute time would overload `[]` to also mean "traffic existed, none of it measurable", and the page would claim zero invocations in a window that had hundreds. Keeping the unfiltered rows in scope is also what lets the two empty states differ.

## Subdomain

`status.mcp.globalstrategic.tech` is a `custom_domain` route in `wrangler.toml` (production). `custom_domain=true` auto-provisions the DNS record + edge cert on deploy (the zone is already on Cloudflare). The fetch handler serves status at the subdomain **root** (`worker.ts` widens the `/status` check to `hostname.startsWith('status.') && pathname === '/'`, which runs before the routed-path 404 gate). The apex `mcp.globalstrategic.tech/status` keeps working.

## Related

- `AUDIT_LOG.md` — the audit pipeline whose historical state this page surfaces (deactivated 2026-08-08, ADR-0014; the runbook holds the re-enable procedure).
- `SENTRY_ALERT_RULES.md` — the alert rules whose last-run this page shows.
- `LATENCY_PROBE.md` — the client-side latency probe (CI artifact; distinct from the server-side AE p50/p95 shown here).
