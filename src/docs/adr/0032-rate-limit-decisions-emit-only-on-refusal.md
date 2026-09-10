# ADR-0032: Rate-limit decisions are emitted only on refusal, never on allow

- **Status**: Accepted (2026-09-08, `@gst/mcp-server@0.63.0`) · re-validated 2026-09-09 (BL-158): the distinct-actives query this trade protects is now spelled `count(DISTINCT blob8)`; the trade is unchanged, because the missing sample correction is a property of distinct counting, not of the function's name.
- **Source initiative**: BL-157 (declared-but-dead AE event types), surfaced while standing up the Grafana dashboard for BL-155's self-serve trial

## Context

`rate_limit_decision` was declared in [`metrics/_schema.ts`](../../../mcp-server/src/metrics/_schema.ts) with outcomes `allow` / `throttle` / `deny` and **no emitter anywhere**. Every throttle and every 429 the server had ever issued existed only as a `safeLog` line on stdout — visible while someone held a `wrangler tail` open, and nowhere afterwards. BL-157's own stanza names the emission policy as the decision that must be made before any wiring, because the three outcomes are not the same volume class.

Two facts constrain the choice:

1. **`allow` fires on every authenticated request.** Every other emitted event type in the schema is per tool call, per cron run, or per batch. An `allow` event is per _request_, including `initialize` and `tools/list` — a different order of magnitude, and the only one of the three that is not self-limiting.
2. **[ADR-0031](0031-per-client-analytics-identity-is-a-blob.md) put a `count(DISTINCT blob8)` query on this same dataset.** Cloudflare Analytics Engine samples under load and publishes sample corrections for `count`, `sum`, `avg` and the quantiles — but that `count` is the plain **row counter** (`count()` → `sum(_sample_interval)`), and **`count(DISTINCT x)` is a different aggregate with no correction**: a distinct-count over dropped rows cannot be weighted back. A sampled distinct count silently degrades to a lower bound, dropping the quietest talkers first. The _Distinct active trials_ panel is exactly that query.

So the volume question is not about storage cost. Emitting `allow` would raise the row rate on a dataset carrying a metric that cannot be corrected for sampling, in order to record a metric that can be reconstructed without it.

## Decision

**Emit `rate_limit_decision` only on refusal — `deny` and `throttle`. Never `allow`.**

`throttle` is defined as `minRemainingRatio <= SOFT_LIMIT_RATIO` (0.2), i.e. some bucket is ≥80% spent. This is not a new notion: it is the existing soft-limit signal that already drives the client-facing `notifications/message` warning. The number was a bare literal in `metrics/with-metrics.ts` and prose in three JSDoc blocks; this change makes it one exported constant in [`ratelimit/tiers.ts`](../../../mcp-server/src/ratelimit/tiers.ts) with both consumers reading it, so the metric and the warning the client actually received can never disagree about what "near the limit" means.

It lives in `tiers.ts` rather than `limiter.ts`, where the ratio is computed, because `with-metrics.ts` deliberately mirrors `RateLimitCheck` locally to keep the `@upstash/ratelimit` dependency out of the metrics module. Importing the constant from `limiter.ts` would have defeated that decoupling.

**Rejected: emit all three.** The straightforward option, and the one the schema's own outcome list implies. Rejected on the ADR-0031 interaction above — it trades a recoverable metric for an unrecoverable one.

**Rejected: emit all three, `allow` sampled 1-in-N.** Superficially the best of both. Rejected because AE has no client-side sampling primitive today (no emit site in `src/metrics/` does 1-in-N), so this means hand-rolling a counter whose interaction with AE's _own_ `_sample_interval` correction would have to be reasoned about at every query — two sampling layers, one of them undocumented in the dashboard SQL. The complexity is real and the payoff is a denominator that is mostly reconstructable.

**Rejected: delete the declaration.** BL-157 offers this as a legitimate outcome for a dead type. Rejected because the trial's limits (15/min, 100/day) are unproven numbers going live to strangers, and "are trials hitting the ceiling" is the question that decides whether they are right.

## Consequences

**The denominator is an upper bound, not an exact figure.** Attempts ≈ `tool_invocation` + `resource_read` + `prompt_invocation` + denies. This **undercounts** non-tool authenticated traffic — `initialize`, `tools/list` — which passes the limiter and emits no invocation. A stated "denial rate" is therefore slightly high. For the operational question the panels exist to answer (_is this client hitting the wall_) the absolute deny count suffices without a denominator at all.

**Refusal volume is bounded by the limiter itself**, which is precisely the property `allow` lacks. A `deny` requires an exhausted window; a `throttle` requires a bucket already ≥80% spent. The upper bound is not trivial, though, and is worth stating honestly: `minRemainingRatio` is the minimum across _all_ buckets, so once a **day** bucket crosses 80% it stays crossed for the rest of the window — an internal-tier key can emit on the order of ~200 `throttle` events in a day. Still two orders of magnitude below `allow`, and concentrated on exactly the clients worth looking at.

**`allow` remains in `OUTCOME_VALUES`.** Deliberately not removed: the value is legal in the schema, it is simply never written. Removing it would make re-introducing the policy a schema migration rather than a code change. The guard against accidental use is at the two places it could go wrong — the emitter's TypeScript signature accepts only `'deny' | 'throttle'`, and `grafana-dashboard.test.ts` fails on any panel filtering `rate_limit_decision` on `'allow'`, since such a panel would render a permanently empty series that reads as "nothing is being allowed through".

**Citing code and docs** (keep current): [`metrics/pipeline-events.ts`](../../../mcp-server/src/metrics/pipeline-events.ts), [`pipeline/handle-authenticated.ts`](../../../mcp-server/src/pipeline/handle-authenticated.ts), [`ratelimit/tiers.ts`](../../../mcp-server/src/ratelimit/tiers.ts) (`SOFT_LIMIT_RATIO`), the dashboard's "Rate-limit pressure and tier gates" row and its text panel, [`GRAFANA.md`](../../../mcp-server/src/docs/operations/GRAFANA.md), [`RATE_LIMITS.md`](../../../mcp-server/src/docs/operations/RATE_LIMITS.md).

**Revisit triggers.** Re-open this decision if either holds:

1. **AE sampling is observed on the production dataset** — check `_sample_interval > 1` in any query result. At that point `count(DISTINCT blob8)` is already degraded and the reason for withholding `allow` is weaker, not stronger; the response is to reconsider ADR-0031's distinct-count approach, then this.
2. **An exact denial rate is genuinely needed** — e.g. a customer commitment on availability, or a limits change whose evaluation depends on the true denominator rather than the deny count. Sampled `allow` becomes worth its complexity at that point.

## Related

Same-day companion decision: `tier_denial` was added as a **separate event type** rather than a `tool_invocation` outcome. The tier gate returns before any tool wrapper runs, so no invocation exists to carry it; and folding a commercial refusal into `tool_invocation`'s error count would corrupt the input to the `scope-mismatch-403-rate` alert rule, which reads exactly that. Its `name` carries the refused tool — the upgrade-intent signal.
