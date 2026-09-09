# ADR-0031: Per-client analytics identity lives in an AE blob, never in the index

- **Status**: Accepted (2026-09-08)
- **Source initiative**: BL-155 (self-serve 3-day MCP trial) — design doc [`../development/SELF_SERVE_TRIAL_BL-155.md`](../development/SELF_SERVE_TRIAL_BL-155.md)

## Context

BL-155 ships a self-serve trial that mints a credential for a stranger with no operator in the loop. The operator asked how many trials are being created and used. An audit of the codebase established:

- **Trial usage was already queryable, but only in aggregate.** Every trial record is `name: 'trial'`, so `keyOwnerFor` collapses every trial to the single string `OAUTH:M2M:TRIAL`, which lands in `blob3` and `index1` of every invocation event. `WHERE index1='OAUTH:M2M:TRIAL'` works — but "how many _distinct_ trials are calling" had no answer, because no per-client dimension existed anywhere in Analytics Engine.
- **Trial creation had no durable observability at all.** `trial/signup.ts` emitted only through `safeLog`, which is one `console.log` — visible solely while a `wrangler tail` was attached.

That constant `keyOwner` is not an accident. [`auth/bearer.ts`](../../../mcp-server/src/auth/bearer.ts) and [`oauth/key-owner.ts`](../../../mcp-server/src/oauth/key-owner.ts) record the reason: keep the AE index **roster-sized**. Analytics Engine permits exactly one index per data point (`AE_LIMITS.MAX_INDEXES_PER_CALL`), the index is the sampling key, and [`observability/alert-rules.ts`](../../../mcp-server/src/observability/alert-rules.ts)'s `traffic-spike-detected` rule groups `tool_invocation` by `index1`. A per-client index would multiply that cardinality by the number of live trials and change what the alert measures.

So the requirement ("tell trials apart") and the existing decision ("keep the index small") appear to collide.

## Decision

**The per-client identity is `blob8` (`client_ref`), and is never promoted to `index1`.**

`index1` remains the roster-sized `keyOwner`. Blob cardinality does not drive AE's sampling key, so the two requirements do not actually collide — the collision is only apparent if you assume a dimension must be an index to be queryable. Blobs are groupable and filterable in AE SQL.

The value has **one canonical form, `OAUTH:<clientId>`** — exactly `AuthSuccess.rateLimitSubject`, which already existed and needed no new derivation. An earlier draft of the implementation had the mint path writing a bare `m2m_…` while usage events wrote the prefixed form; that would have produced two disjoint value spaces and silently broken the mint→usage join the dimension exists to enable. A test pins the two ends together.

**Alternatives rejected:**

- **Promote `client_ref` to `index1`.** Rejected: blows up the sampling-key cardinality and changes what `traffic-spike-detected` measures. This is the "obvious improvement" a future reader will reach for, which is why it is called out in the schema docblock as well as here.
- **Give each trial its own `keyOwner`.** Same problem one layer up, and it would also fragment the rate-limiter buckets and the Sentry tags, which are deliberately roster-sized for the same reason.
- **Derive distinct actives from the R2 audit log instead.** Possible but useless operationally: R2 objects are keyed by `envName/tsIso/seq`, so answering the question means scanning objects rather than running a query.

### The limitation this decision accepts, stated plainly

Distinct actives is `uniq(blob8)`. Cloudflare publishes sample corrections for exactly four aggregates — `count() → sum(_sample_interval)`, `sum(x) → sum(x*_sample_interval)`, `avg`, and the weighted quantiles (this repo uses `quantileWeighted`, per `status-metrics.ts`). **`uniq` is not among them, and cannot be**: a distinct-count over rows that were dropped by sampling cannot be recovered by weighting the survivors.

Therefore:

- `uniq(blob8)` is **exact while the dataset is unsampled, and a lower bound once it is not.**
- Trial volume is low by construction (15/min, 100/day, 72h lifetime), which is the regime where AE does not sample. So the query is exact today.
- When sampling does engage it drops the **quietest talkers first** — precisely the population a distinct-actives count is asking about. The number degrades exactly where it is most interesting.
- The error is one-directional: it under-reports. It cannot manufacture a false farming alarm.
- **For any question that is really about volume, use `GROUP BY blob8` + `sum(_sample_interval)`, which IS sample-correct**, and follows the convention every existing query in `alert-rules.ts` and `status-metrics.ts` already uses.
- The **exact** count of live trials is not an AE question at all: it is `GET /admin/oauth/m2m-clients` counting `tier === 'trial'`. AE holds the history and the behaviour; KV is ground truth for "right now".

### Signup events

`trial_signup` is added to `EVENT_TYPES` with one outcome per branch of `handleTrialSignup`, so a new branch cannot ship unobserved (the guard rejects an outcome absent from `OUTCOME_VALUES`). It is the only event type emitted from an **unauthenticated public path**, which is why its `keyOwner` is the constant trial owner rather than a caller identity: at emit time there usually is no caller. `client_ref` is set only on `minted`, `reissued` and `expired` — the branches where a client actually exists. Attaching one to a pre-mint failure would fabricate a trial and pollute `uniq(blob8)`.

## Consequences

- **Not a new exposure class.** `client_ref` is the client _identifier_, never the client secret, and it already appeared in `safeLog` lines and R2 audit entries. Nothing newly sensitive reaches AE.
- **Cites this decision** (keep current): [`metrics/_schema.ts`](../../../mcp-server/src/metrics/_schema.ts) (`MetricEvent.client_ref`), [`metrics/with-metrics.ts`](../../../mcp-server/src/metrics/with-metrics.ts) (`MetricsContext.clientRef`), [`server.ts`](../../../mcp-server/src/server.ts) (`ServerFactoryOptions.clientRef`), [`pipeline/handle-authenticated.ts`](../../../mcp-server/src/pipeline/handle-authenticated.ts), [`trial/signup.ts`](../../../mcp-server/src/trial/signup.ts), [`ARCHITECTURE.md`](../../../mcp-server/src/docs/ARCHITECTURE.md) and [`operations/DEPLOY.md`](../../../mcp-server/src/docs/operations/DEPLOY.md) column maps, [`operations/AUTH.md`](../../../mcp-server/src/docs/operations/AUTH.md) query cookbook.
- **The roster-sized-index reasoning in `bearer.ts` / `key-owner.ts` / `safe-logger.ts` still stands** and was updated to point here rather than reading as a flat prohibition on per-client analytics.
- **Revisit trigger**: if `mcp_events` starts sampling (trial traffic grows by orders of magnitude, or another high-volume event type shares the index), `uniq(blob8)` stops being exact. At that point either move distinct-actives to a purpose-built counter (an Upstash HLL or a KV census snapshot) or accept the lower bound explicitly in whatever surface reports it. Do not "fix" it by promoting the blob to the index.
- **Not covered here**: `rate_limit_decision` is declared in `EVENT_TYPES` with `allow|throttle|deny` outcomes and has **no emitter anywhere**, so throttles reach AE for no tier at all. Filed separately — wiring it requires choosing a sampling policy for an event that fires on every request, which is a different decision from this one.
