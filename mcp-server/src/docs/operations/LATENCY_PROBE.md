# Synthetic Latency Probe

> **Audience**: operator / engineer working the BL-033 pilot SLA ("p95 <500ms for non-radar tools") or diagnosing client-observed latency.
>
> **What it is**: `mcp-server/scripts/probe-latency.mjs` — a dependency-free Node script that issues timed MCP calls against the remote Worker and reports p50/p95/max per surface. Scheduled 4×/day from CI (`.github/workflows/latency-probe.yml`); runnable from any machine for per-region evidence.

---

## Client-observed vs server-side latency (why this exists)

Analytics Engine's `duration_ms` (emitted by `src/metrics/with-metrics.ts`) times the handler **inside** the Worker — it excludes the network path entirely. The BL-032 soak showed the gap dominates for distant clients: a GRU-region (São Paulo) operator measured **p95 ~930ms** on warm `search_radar` calls the Worker completes in tens of ms, driven by ~250ms Upstash REST round-trips from that geography (`src/docs/development/_archive/BL-032_TESTING_FINDINGS.md` T.H.4/T.H.6).

An SLA promises what the **client** experiences. This probe measures exactly that: `performance.now()` around the full request→parsed-response cycle, from wherever the script runs. It is the SLA's permanent evidence source — team usage is intermittent (quiet for weeks; see `observability/slo-baselines.md` § Window findings), so organic traffic can never calibrate or continuously prove a latency target.

## What a run does

One stateless JSON-RPC POST per call (`tools/call` — the proven `Invoke-McpRequest.ps1` shape; no session handshake), N timed samples per surface:

| Surface                 | Kind    | SLA sample | Samples/run    |
| ----------------------- | ------- | ---------- | -------------- |
| `/health`               | raw GET | yes        | N (default 10) |
| `list_portfolio_facets` | tool    | yes        | N              |
| `search_portfolio`      | tool    | yes        | N              |
| `search_regulations`    | tool    | yes        | N              |
| `search_radar`          | tool    | **no**     | fixed 2        |

`search_radar` is informative-only (the SLA scopes to non-radar tools) and capped at 2 samples/run — 8/day at the CI cadence, under the radar tier's 50/day budget. 429 (rate-limited) and 503 responses are recorded as classified outcomes and **excluded from percentiles** — a throttled response is not a latency sample. Two BL-091 caveats: (1) MCP tools return `isError` **inside HTTP 200**, so a breaker-open tool call classifies as `tool-error`, not `circuit-open`; (2) a breaker-open call with a warm cache is now a _success_ serving cached data, so those samples DO enter the percentiles — expect p50 to skew low during a breaker window, since a cache read is far faster than an upstream fetch.

> Probe-set note: the Slice 1 plan originally named `generate_diligence_agenda` as the fourth SLA surface; the implementation substituted `search_regulations` because the diligence tool requires a structured `_audit` provenance block a probe would have to fabricate, while regulations search is a clean stateless engine read with the same representativeness.

Output: a markdown summary table (stdout → CI job summary) + full JSON via `--out` (CI uploads it as a 90-day artifact named `latency-probe-<run id>`).

## Running it yourself (any region)

```bash
# Key from your password manager — env only, never inline (Directive 15).
export MCP_URL=https://mcp-staging.globalstrategic.tech   # or production
export MCP_KEY=<your MCP_KEY_* value>
node mcp-server/scripts/probe-latency.mjs --region-label gru --samples 10 --out probe-gru.json
```

`--region-label` stamps the output so runs from different geographies are comparable. **This is how the BL-033 AC's per-pilot-region measurement gets made**: when a pilot client's region is known, run the script from a machine there (or a runner in that region) and compare against the CI's `github-us` baseline. The remediation decision (move Upstash / add a KV layer / region-aware SLA — BACKLOG.md BL-033 § Pilot operations) is made from that data.

## Ad-hoc surfaces (never scheduled)

Surfaces flagged `adhoc: true` in `PROBE_SURFACES` are excluded from every run that does not name them, so the CI schedule never touches them; they are reached only with `--surfaces <a,b>`. They are **unauthenticated** — no `MCP_KEY` is needed when only ad-hoc surfaces are selected — so a run costs **no tier budget at all**, which is why a 600-request run is fine where the scheduled shape is capped. They carry their own `fixedSamples` (200) rather than widening the `--samples` cap, and a run samples the selected surfaces **round-robin** so a differential pair shares network conditions sample for sample.

| Surface                     | What it exercises                                                                                                                                 | Expected status  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `token-unknown-client-cold` | `POST /token` (`grant_type=client_credentials`) with a fresh unknown `client_id` per call — exactly one `OAUTH_KV.get`, an origin miss every time | 401 (counted ok) |
| `token-unknown-client-warm` | Same, one unknown id for the whole run — reads after the first hit KV's edge cache, the path a real mint takes                                    | 401 (counted ok) |
| `server-json`               | `GET /server.json` — pure compute, the comparator                                                                                                 | 200              |

The p50 gap between a token surface and `server-json` is the client-observed cost of the KV read on the M2M mint path. In the `--out` JSON, `samplesPerSurface` is keyed by surface name, since ad-hoc surfaces carry their own count rather than `--samples`. Added for [ADR-0036](../../../../src/docs/adr/0036-client-records-stay-in-kv.md), which records the 2026-09-19 numbers (warm ≈ +10 ms, cold ≈ +98 ms):

```bash
export MCP_URL=https://mcp-staging.globalstrategic.tech
node mcp-server/scripts/probe-latency.mjs --surfaces token-unknown-client-cold,token-unknown-client-warm,server-json --region-label <where-you-are> --out probe.json
```

## CI schedule & region caveat

`latency-probe.yml` runs at `30 */6 * * *` — 30 minutes after the Worker's radar-refresh cron, so radar samples hit a warm cache (steady-state numbers; no Inoreader Zone-1 burn from cache misses). GitHub-hosted runners are **US-region**: the scheduled run is a continuous US-client baseline and regression tripwire, not a substitute for per-region measurement. The workflow is deliberately not a required status check.

> **Traffic-shape change, 2026-09-20 (BL-154).** Round-robin sampling replaced serial surface-after-surface probing for **every** run, not only `--surfaces` ones. Per-surface aggregation and the result shape are unchanged, but the scheduled baseline's request ordering is not what produced the pre-2026-09-20 numbers in [`observability/slo-baselines.md`](../../../observability/slo-baselines.md). Read a p50/p95 discontinuity across that date as the ordering change before reading it as a regression.

## Budget math (change the cadence consciously)

At the default cadence (4 runs/day × ~32 authenticated tool calls): ~130 general-tier calls/day (13% of the 1000/day per-key cap; 42/min burst is under the 60/min cap), ~8 radar calls/day (16% of 50/day), and roughly 600 Upstash rate-limiter commands/day against the shared 10k/day free-tier ceiling — the probe is effectively one more light operator. A max manual dispatch (`--samples 30` → ~92 sequential authenticated calls) can brush the 60/min sliding window on a fast connection; expect some `rate-limited` outcomes in that shape — they're shed from percentiles by design, not a defect. Full tier reference: [`RATE_LIMITS.md`](./RATE_LIMITS.md). Ad-hoc surfaces are outside this math entirely: they authenticate as nobody and hit no limiter, so their 200-sample counts spend nothing.

## Operational notes

- **Key**: the probe authenticates as `MCP_KEY_PROBE` (keyOwner `PROBE`) — issued per [`AUTH.md`](./AUTH.md), stored as the `MCP_PROBE_KEY` GitHub Actions secret. Its traffic is separable in every AE query by `keyOwner = 'PROBE'`.
- **Alerting**: `PROBE` is exempted from the `traffic-spike-detected` rule (`src/observability/alert-rules.ts` `SYNTHETIC_KEY_OWNERS`) — a probe run's ~32 calls/h exceeds the rule's 30/h floor by design. See the [runbook](../../../observability/runbooks/traffic-spike-detected.md) § Exemption.
- **Failure semantics**: the script exits non-zero only when _every_ sample fails (probe misconfigured or Worker down). Partial degradation is data, not a CI failure.
- **Related**: server-side baselines + SLO targets live in [`observability/slo-baselines.md`](../../../observability/slo-baselines.md). Both surfaces coexist and measure genuinely different things — state the contrast precisely (BL-122):
  - `/status` shows **in-handler I/O wait**, for I/O-bound tools only. Workers freeze the clock outside I/O, so it cannot see compute at all, and rows with no measurable wait are omitted rather than shown as `0` (see [`STATUS_PAGE.md`](./STATUS_PAGE.md)).
  - **This probe** shows **client-observed round-trip**, network included, measured from Node where the clock is real. It is therefore the _only_ source that sees compute time, which makes it the calibration source for any future latency SLO.

---

_Created 2026-07-23 (BL-033 Slice 1) — first durable replacement for the ad-hoc soak-era `Measure-McpLatency` harness._
