# ADR-0036: The M2M client record stays in Workers KV; every index it lacks lives beside it, not under it

- **Status**: Accepted (2026-09-19)
- **Source initiative**: BL-154 Slice 1 (storage-store review). No separate design doc; the plan and its three review rounds are summarised here. Raised by the BL-133 trial directive's question — _how are credentials and expiration expected to be managed?_ — whose answer is the first section below.

## Context

### How credentials and expiry are managed today (the question that opened this)

Entirely in-platform. One JSON record per client in `OAUTH_KV` at `mcp:oauth:m2m-client:<id>` (`mcp-server/src/oauth/m2m-clients.ts`), carrying `secretHash`, `tier`, `allowedScopes` and, since BL-155, an optional `expiresAt`. Expiry is **enforced at token mint** (`m2m-token.ts`, after authentication, so an expired client is told it is expired rather than unknown) and **reaped by KV** at an absolute `expiration = expiresAt + 30 days` derived on every write, which is why a trial→paid conversion that clears `expiresAt` cancels the reap for free. Records without `expiresAt` never expire and are written with no TTL. The only manual step is the _decision_ to provision: the admin API for operator-issued clients, or nothing at all for the self-serve trial. When BL-154 was filed the record had no expiry field; that sentence in the stanza is stale.

### The storage estate, from the code

| Store                               | Holds                                                                                                                                                                                           | Notes                                                                                                                                                                                                                                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`OAUTH_KV`** (Workers KV)         | The OAuth library's tokens/grants/clients; our `mcp:oauth:m2m-client:*` records; `mcp:oauth:m2m-jti:*` replay nonces (TTL 300s); one-shot consent nonces                                        | The library requires KV; splitting auth state across two stores was judged worse than the single-substrate deviation (`wrangler.toml`, ADR-0008). **`mcp:oauth:*` follows the same key-naming convention as the Upstash families but does not live there** — an easy confusion.                            |
| **Upstash Redis** (sole DB gst-mcp) | Rate-limit sliding windows, resource/radar caches, Inoreader tokens and spend, status/alert state, IRL body cache + run counters, and the BL-155 trial identity leases `mcp:trial:ident:<hmac>` | Every consumer but trial signup fails open when unbound. The designed-not-built `mcp:pay:*` family ([PAYMENTS_PLATFORM_BL-133.md § Keys](../development/PAYMENTS_PLATFORM_BL-133.md)) is specified here too, because KV's eventual consistency is inside Stripe's retry window and unsafe for idempotency. |
| **`AUDIT_R2`** + Queues             | Nothing — pipeline deactivated ([ADR-0014](0014-deactivate-audit-pipeline.md)); binding and queue resources retained for the re-enable procedure                                                | Trigger unchanged: the first client whose contract requires compliance audit capture. BL-133 already rules that a self-serve card purchase is not that client.                                                                                                                                             |
| **Analytics Engine `METRICS`**      | One data point per invocation plus `trial_signup`, `rate_limit_decision` (refusals), `oauth_consent`, IRL verdicts                                                                              | Adaptive sampling; **3-month retention** on the current plan (`wrangler.toml` § Analytics Engine). Per-client identity is a blob, never the index ([ADR-0031](0031-per-client-analytics-identity-is-a-blob.md)).                                                                                           |

No D1, no Durable Objects.

### What a self-serve roster asks of the store, and what KV can and cannot answer

| Need                              | Today                                                                  | KV alone?                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Read one client at mint           | one `get` (`m2m-token.ts`)                                             | yes — the hot path                                                                                           |
| Enumerate the roster (admin list) | `list()` per page + one `get` per key, serial (`listM2mClients`)       | yes, as an N+1 scan                                                                                          |
| Expiring-soon                     | nobody asks yet                                                        | **no index** — a full scan; `get` cannot see expiry, and `list()` exposes KV's own TTL, not the record field |
| One credential per identity       | Upstash `SET NX` lease on an HMAC of the client IP (`trial/signup.ts`) | not needed from KV — solved beside it                                                                        |
| Reverse a trial identity          | `SCAN` over `mcp:trial:ident:*` (`releaseTrialIdentity`)               | Upstash, and itself a scan by design (no reverse index written at mint)                                      |
| Payment customer → client         | designed as `mcp:pay:customer:<id>` in Upstash                         | not needed from KV — solved beside it                                                                        |
| Usage joined to a client          | AE `GROUP BY blob8` + `sum(_sample_interval)`, 3 months deep           | not a KV question                                                                                            |

**Measured shape, not speed** (local `getPlatformProxy()` KV and D1 — both miniflare/SQLite, so timings are deliberately not reported; N = 1500 records, a third time-boxed): point read is 1 op on either store; full roster is **2 `list` + 1500 `get`** on KV vs one `SELECT` on D1; expiring-within-3-days is the same **2 + 1500** scan on KV vs one indexed `WHERE`. The same run showed that before this ADR's fix, `listM2mClients` stopped after the first `list()` page and would have silently returned 1000 of the 1500.

### The one number that could be measured, and the two that could not

**Instrument limit, stated first.** The two properties that decide KV-vs-relational on the mint path are production KV's edge cache and D1's single-primary routing. Neither is measurable without a D1 binding on a deployed Worker, which is outside the operator's authorisation for this review (local + read-only staging). So D1's number below is Cloudflare's documented behaviour, not a measurement, and this ADR says so wherever it leans on it.

**KV on the real mint path — measured against staging.** `mcp-server/scripts/probe-latency.mjs` gained three ad-hoc surfaces for this (`--surfaces`, never scheduled, unauthenticated, so zero tier budget): `token-unknown-client-cold` (`POST /token`, `grant_type=client_credentials`, a fresh unknown `client_id` per call → exactly one `OAUTH_KV.get` before any limiter, a 401 by contract, no write), `token-unknown-client-warm` (same, one unknown id for the whole run, so reads after the first hit KV's edge cache — Cloudflare caches negative lookups too), and `server-json` (`GET /server.json`, pure compute — the comparator). 200 samples each, round-robin so all three see the same network, from the operator's workstation to `mcp-staging.globalstrategic.tech`, 2026-09-19:

| Surface                     | p50 ms    | p95 ms | max   | Δ p50 vs comparator |
| --------------------------- | --------- | ------ | ----- | ------------------- |
| `server-json`               | **79.0**  | 92.9   | 323.1 | —                   |
| `token-unknown-client-warm` | **89.6**  | 105.3  | 323.5 | **+10.6 ms**        |
| `token-unknown-client-cold` | **176.6** | 203.4  | 736.0 | **+97.6 ms**        |

Reproduced: an earlier two-surface run gave cold 176.7 vs 86.2 (+90.5), and a scratch fixed-id run gave 93.1 vs 83.4 (+9.7) with a 657 ms first sample — the origin miss — followed by 90–100 ms reads. The effect-size rule set before running (a delta inside the comparator's own p50–p95 spread would have been "not resolvable client-side") was met by a wide margin in both directions.

Reading: **the read a real mint pays is the warm one** — an existing client's key is edge-cached for 60 s after first touch (KV's default `cacheTtl`; `getM2mClient` passes none, so the default is what this relies on) and re-warmed by every mint — and it costs about **10 ms** client-observed. The cold number is what a client pays once per colo per minute of inactivity, and it is the floor a relational store would have to beat _everywhere_, not just near its primary.

**D1, from the documentation (unmeasured).** "D1 routes all queries (both read and write) to a specific database instance in one location in the world, known as the primary database instance." Read replication (Sessions API) lowers read latency only for callers near a replica and adds a bookmark protocol to the mint path. BL-033's open latency finding is the closest thing the estate has to a regional measurement: a single Upstash REST round-trip from São Paulo costs ~250 ms. A D1 primary in one region would put the same shape of cost on every mint from every other region.

## Decision

**The M2M client record stays in `OAUTH_KV`. Every query the roster needs and KV cannot index is answered by a structure _beside_ the record — Upstash for uniqueness and reverse lookups, Analytics Engine for usage — never by moving the record. No new store is adopted.**

Both outcomes were admissible going in; the evidence chose this one:

1. The hot path is one edge-cached read at ~10 ms. Nothing relational can match that globally without replicas, and replicas reintroduce the consistency question KV already answers with self-contained tokens (`m2m-token.ts` § why tokens are self-contained).
2. Every index-shaped need that has actually appeared — one-per-identity, customer→client, usage-by-client — was met beside the record, by a store that already existed, before this review. The record itself is only ever read by id.
3. The queries KV genuinely cannot serve (expiring-soon, per-customer listing) have **no consumer yet**. Building a store for them now is the speculative optimisation the standing directive forbids.
4. The OAuth library requires KV for its own state. A second auth substrate would mean two consistency models inside one `/token` handler.

**Rejected**

- **D1 as the system of record.** Single-primary routing puts a cross-region round-trip on every mint that is not near the primary; read replication mitigates reads but adds session bookkeeping to the mint path for a query that is a point read by id. It would also be the estate's second auth substrate. Reconsider only on trigger 2 below, and measure it then with a real binding — this ADR could not.
- **Durable Objects per client.** Also single-location per object; solves coordination, which the record does not need.
- **Moving the record to Upstash.** Ruled out already for the library's state (ADR-0008) and, for ours, by the same GRU round-trip evidence that motivates BL-033's open KV-layer proposal for the _other_ direction.
- **A KV "index" written beside the record** (e.g. `mcp:oauth:m2m-expiring:<bucket>`). KV's ~60 s cross-location visibility makes a hand-rolled secondary index inconsistent with the record it points at; Upstash already holds the indexes that exist and has the atomic primitives (`SET NX`, `SADD`) they rely on.

**Adjacent questions settled in the same pass**

- **R2 and the Queues stay retained-but-unbound.** ADR-0014's trigger stands and BL-133 has already ruled the self-serve purchase out of it.
- **Upstash and a new store would not overlap, because there is no new store.** BL-133's `mcp:pay:*` family in Upstash is consistent with this decision: the client record is the one thing in KV; everything that indexes it lives in Upstash.
- **Analytics Engine can carry the usage-evidence _shape_ BL-145 might want, not the depth.** `GROUP BY blob8` with sample correction gives volume per client, exact while unsampled ([ADR-0031](0031-per-client-analytics-identity-is-a-blob.md)), but only three months deep and never joinable to the record. BL-145's stanza asks for conversation evidence and an operator-cost measurement, not telemetry, so nothing is blocked today. If a durable usage ledger is ever needed it is a **separate** decision (trigger 3), not a reason to move the client record.
- **BL-048's secret-manager choice** is untouched; **BL-033's regional-RTT AC** is related evidence, not decided here.

**Fixed while looking**

- `listM2mClients` ignored `list_complete`/`cursor`, so one `list()` page was the whole roster. It now follows the cursor; pinned by a paged-KV test in `tests/unit/oauth/m2m-clients.test.ts`.

## Consequences

- **Cites this decision**: `mcp-server/src/oauth/m2m-clients.ts` (the `listM2mClients` docblock, which records the N+1 shape as the accepted cost), `mcp-server/wrangler.toml` § Workers KV, `mcp-server/src/docs/operations/LATENCY_PROBE.md` § Ad-hoc surfaces, [`src/docs/architecture/2-operational.md`](../architecture/2-operational.md) (the storage-estate diagram is drawn from this ADR's inventory).
- **Accepted trade-offs**: the admin roster is an N+1 scan whose cost is now computable — 2 `list` + N `get`, ~100 ms per uncached `get` from a cold colo — so at a roster of a few hundred it is seconds, and at a few thousand it is the trigger below. Expiring-soon has no query at all until someone needs one. `releaseTrialIdentity`'s `SCAN` stays by design.
- **Revisit triggers** (any one re-opens this ADR; the first two would want the D1 measurement this review could not make):
  1. An operator or admin surface needs an expiring-soon or per-customer query. Nothing asks today; the first consumer is the trigger, and the shape above says what it will cost on KV at that roster size.
  2. A second product on the payments rail needs a **join** across client record, customer and usage that Upstash keys cannot express.
  3. BL-145 or a client contract needs usage evidence older than AE's 3-month retention — a durable usage store, decided on its own.
  4. ADR-0014's audit trigger fires.
- **Reproducing the measurement**: `MCP_URL=https://mcp-staging.globalstrategic.tech node mcp-server/scripts/probe-latency.mjs --surfaces token-unknown-client-cold,token-unknown-client-warm,server-json --region-label <where-you-are> --out probe.json` — no key needed, no tier budget spent.
