# Worker boot & first-use latency — BL-149 findings

**Status**: complete, 2026-09-13 · **Initiative**: [BL-149](./BACKLOG.md) · **Harness**: [`mcp-server/scripts/measure-worker-boot.mjs`](../../../mcp-server/scripts/measure-worker-boot.mjs)

## What this answers

For six weeks a single test intermittently timed out at Vitest's 5000ms default — 26 recorded instances, almost always the first `it` in one of the 11 `unstable_dev` Worker-booting integration files. The stanza forbade raising the timeout or adding a retry and asked for measurement first, because every prior observation was **right-censored**: the test aborted _at_ 5000ms, so the true cost was known only to be "≥5s".

Two independent causes were found. Both are measured below.

## Method

`measure-worker-boot.mjs` runs outside Vitest, re-spawning itself per run so one run is one process and one workerd boot — matching Vitest's `forks` / `isolate: true` topology. Nothing it times is bounded by a timeout, so the tail is observable. It binds its own `MCP_ADMIN_KEY` / `MCP_KEY_RP` / Turnstile vars and asserts no probe got a 401, because `/admin/oauth/m2m-clients` refuses at `requireAdmin` _before_ touching KV and `/mcp` refuses at `authenticate()` before the agent path — an unauthenticated probe would time the gate and report microseconds for a subsystem it never reached.

Environment: win32, node v24.18.0, wrangler 4.131.0, vitest 5.0.0. Note the stanza's instances 1–9 are attributed to wrangler 4.125.0 / vitest 4.1.11; the flake survived both bumps.

**Precondition checked**: `OAUTH_KV` is bound in the staging env `unstable_dev` uses ([wrangler.toml:222-224](../../../mcp-server/wrangler.toml#L222)), so the KV probe reaches `listM2mClients` rather than the not-bound 503 branch.

## Cause 1 — the first request pays for the module graph, and no test budgets it

`unstable_dev` resolves once workerd is **spawned**. The first `worker.fetch()` then pays module-graph JIT and instantiation. `beforeAll` carries an explicit `60_000`; an `it` carries the 5000ms default. A file that leaves that cost unpaid bills it to its first test.

**50 isolated runs, cold (no warm-up):**

| checkpoint                     | p50        | p95        | p99        | max        | > 5000ms  |
| ------------------------------ | ---------- | ---------- | ---------- | ---------- | --------- |
| `unstable_dev` resolve         | 354.9      | 421.4      | 449.6      | 449.6      | 0/50      |
| **first `/health`**            | **7450.6** | **7865.9** | **8103.4** | **8103.4** | **48/50** |
| first `/mcp` (after the above) | 99.1       | 129.5      | 208.7      | 208.7      | 0/50      |
| first KV (after the above)     | 1216.0     | 1533.0     | 1724.8     | 1724.8     | 0/50      |
| any later fetch                | 15.1       | 19.0       | 25.4       | 25.4       | 0/50      |
| `stop()`                       | 92.2       | 130.8      | 144.9      | 144.9      | 0/50      |

The boot is not the problem — it is a third of a second. The first _request_ is the problem, and it exceeded the default in 48 of 50 runs.

**It is not about `/health`.** Permuting the probe order (10 runs) moves the cost to whatever runs first: KV probed first took **8318ms p50 (10/10 over 5000ms)** and `/health` afterwards took 18ms. The cost belongs to the first request, whichever endpoint that is.

**50 isolated runs, warm (the fix simulated):**

| checkpoint                                 | p50    | p95    | p99    | max    | > 5000ms |
| ------------------------------------------ | ------ | ------ | ------ | ------ | -------- |
| warm-up, inside the 60s `beforeAll` budget | 7354.5 | 7813.0 | 7974.9 | 7974.9 | 50/50    |
| first `/health` **in a test**              | 46.2   | 63.9   | 66.6   | 66.6   | **0/50** |
| first `/mcp`                               | 84.8   | 104.4  | 110.0  | 110.0  | 0/50     |
| first KV                                   | 1161.5 | 1405.7 | 1591.6 | 1591.6 | 0/50     |

Every test-visible checkpoint lands two orders of magnitude under the default. The cost does not shrink — it moves to the phase that already budgets 60s for it.

### The answer was in the repo

[`ratelimit.test.ts`](../../../mcp-server/tests/integration/ratelimit.test.ts) has described this mechanism, and the fix, in a comment since it was written. Exactly 4 of the 11 Worker-booting files fetched inside `beforeAll`, and on a machine where the other 7 failed **deterministically**, those 4 were the only ones that passed — an 11-of-11 correlation:

| file                                                                                                               | fetched in `beforeAll`? | passed?   |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------- | --------- |
| `oauth-flow`, `oauth-m2m`, `oauth-trial-consent`, `ratelimit`                                                      | yes                     | yes (4/4) |
| `auth`, `cors`, `oauth-introspection`, `oauth-metadata`, `protocol-era-worker`, `trial-signup`, `worker-roundtrip` | no                      | no (0/7)  |

The defect was never that the fix was unknown. It was that the fix was applied to four files and never generalised.

## Cause 2 — accumulated local `.wrangler` state, which is why this was always machine-dependent

Warming alone did not fix `trial-signup.test.ts`. Its fourth case — BL-149 instance 18's victim — still timed out. Decomposing that case:

| step                                 | bloated `.wrangler` (223 MB) | fresh `.wrangler` |
| ------------------------------------ | ---------------------------- | ----------------- |
| KV list (`/admin/oauth/m2m-clients`) | 1196 ms                      | **31 ms**         |
| `POST /trial/signup`                 | 75 ms                        | 63 ms             |
| KV list again                        | 3731 ms                      | **29 ms**         |

The local dev state directory had grown to **223 MB**, 192 MB of it a miniflare observability trace store accumulating since 2026-08-05. First-KV-touch across the 50-run arms shows the same thing: **1216 ms p50 bloated vs 72.7 ms p50 fresh**.

This is the missing half of the stanza's history, and it explains what six weeks of instances could not:

- **Why it is machine-dependent and worsens over time.** The state grows with every local run. The stanza's "the rate is not stable between sessions — machine state matters" is literally true, and the state is on disk.
- **Why CI has never failed this way.** CI starts from a clean checkout every run, so cause 2 cannot exist there and cause 1 is paid on faster hardware.
- **Why the rate rose sharply in September.** More local runs, more accumulation.

Cause 1's magnitude is also state-sensitive, though it never disappears: 20 runs after purging the directory still measured **6112 ms p50, 19/20 over 5000 ms**. Quote it as "seconds, essentially always over the default", not as a single number.

## Teardown (the stanza's open question)

The stanza asked whether `stop()` resolving means the runtime and port are actually released. Measured as two separate signals, because on Windows a successful rebind does not prove the child was reaped:

- **Port released after `stop()` resolved: 50/50, 10/10, 20/20** across all arms.
- **workerd processes still visible after stop: 0–2**, transient, settling to 0 between runs.

No stranded runtime, no unreleased port. **H3 (carryover from the previous file) is ruled out**, and the criterion is met rather than waved through.

## Conclusions

1. **Cause 1 is fixed in code** — all 11 Worker-booting files now warm inside `beforeAll` via [`tests/helpers/warm-worker.ts`](../../../mcp-server/tests/helpers/warm-worker.ts). No timeout was raised and no retry was added; the 5000ms default remains a live signal, and a _warm_ fetch exceeding it is now a genuine regression.
2. **Cause 2 is operational** — purge `mcp-server/.wrangler` when local Worker tests get slow. Recorded in [TROUBLESHOOTING.md](../testing/TROUBLESHOOTING.md).
3. **The runner is not implicated.** The flake survived Vitest 4 → 5 (instances 23–26) and reproduces with no test runner in the process at all.

## Verification of the fix on the reproducing machine

Before: 7 files, 8 failing tests, deterministic. After: those 7 files 21/21 green (3 runs each), then the full suite **2883/2883 green three times consecutively**, plus a green `--coverage` run (87.9% lines).
