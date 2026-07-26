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

`search_radar` is informative-only (the SLA scopes to non-radar tools) and capped at 2 samples/run — 8/day at the CI cadence, under the radar tier's 50/day budget. 429 (rate-limited) and 503 (circuit-open) responses are recorded as classified outcomes and **excluded from percentiles** — a throttled response is not a latency sample.

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

## CI schedule & region caveat

`latency-probe.yml` runs at `30 */6 * * *` — 30 minutes after the Worker's radar-refresh cron, so radar samples hit a warm cache (steady-state numbers; no Inoreader Zone-1 burn from cache misses). GitHub-hosted runners are **US-region**: the scheduled run is a continuous US-client baseline and regression tripwire, not a substitute for per-region measurement. The workflow is deliberately not a required status check.

## Budget math (change the cadence consciously)

At the default cadence (4 runs/day × ~32 authenticated tool calls): ~130 general-tier calls/day (13% of the 1000/day per-key cap; 42/min burst is under the 60/min cap), ~8 radar calls/day (16% of 50/day), and roughly 600 Upstash rate-limiter commands/day against the shared 10k/day free-tier ceiling — the probe is effectively one more light operator. A max manual dispatch (`--samples 30` → ~92 sequential authenticated calls) can brush the 60/min sliding window on a fast connection; expect some `rate-limited` outcomes in that shape — they're shed from percentiles by design, not a defect. Full tier reference: [`RATE_LIMITS.md`](./RATE_LIMITS.md).

## Operational notes

- **Key**: the probe authenticates as `MCP_KEY_PROBE` (keyOwner `PROBE`) — issued per [`AUTH.md`](./AUTH.md), stored as the `MCP_PROBE_KEY` GitHub Actions secret. Its traffic is separable in every AE query by `keyOwner = 'PROBE'`.
- **Alerting**: `PROBE` is exempted from the `traffic-spike-detected` rule (`src/observability/alert-rules.ts` `SYNTHETIC_KEY_OWNERS`) — a probe run's ~32 calls/h exceeds the rule's 30/h floor by design. See the [runbook](../../../observability/runbooks/traffic-spike-detected.md) § Exemption.
- **Failure semantics**: the script exits non-zero only when _every_ sample fails (probe misconfigured or Worker down). Partial degradation is data, not a CI failure.
- **Related**: server-side latency baselines + SLO targets live in [`observability/slo-baselines.md`](../../../observability/slo-baselines.md). As of BL-033 Slice 4, `/status` surfaces **server-side** per-tool p50/p95 (in-Worker `duration_ms` from AE — see [`STATUS_PAGE.md`](./STATUS_PAGE.md)); this probe's **client-observed** RTT (network-inclusive) remains a CI artifact only, not surfaced on `/status` (a different measurement — client round-trip vs in-Worker handler).

---

_Created 2026-07-23 (BL-033 Slice 1) — first durable replacement for the ad-hoc soak-era `Measure-McpLatency` harness._
