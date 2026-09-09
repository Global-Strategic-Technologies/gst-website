/**
 * BL-157 — AE emitters for the two pipeline refusals that reached nothing but
 * `safeLog` (i.e. nothing, unless someone held a `wrangler tail` open).
 *
 * Both fire from `pipeline/handle-authenticated.ts` on paths that return
 * EARLY — before the request's `AnalyticsEngineSink` is constructed, and
 * before any tool wrapper runs. That is why these take `env` and build their
 * own sink, following the `trial/signup.ts` idiom rather than the
 * `irl-ingestion-events.ts` one (which takes a `MetricsContext` carrying a
 * sink that, here, does not exist yet).
 *
 * **Emission policy — refusals only, never `allow`.** `rate_limit_decision`
 * would otherwise fire on every authenticated request, a volume class nothing
 * else in the schema occupies, and more rows means Cloudflare samples the
 * dataset sooner. ADR-0031 put a `count(DISTINCT blob8)` query on this same
 * dataset, and a distinct-count has NO sample correction (the corrected
 * `count` is the row counter, not this) — so emitting `allow` would trade a metric
 * that can be reconstructed (attempts ≈ invocations + denies) for one that
 * cannot. Full reasoning and the rejected alternatives: ADR-0032.
 *
 * Refusal volume is bounded by the limiter itself, which is the property
 * `allow` lacks: a `deny` requires an exhausted window, and a `throttle`
 * requires a bucket already ≥80% spent.
 */
import { AnalyticsEngineSink, emit } from './_index';
import type { Env } from '../env';
import type { CheckResult } from '../ratelimit/limiter';

/** Shared caller attribution. `keyOwner` → `index1`; `clientRef` → blob8. */
interface Attribution {
  readonly keyOwner: string;
  /**
   * Canonical `OAUTH:<clientId>` — `AuthSuccess.rateLimitSubject`, the same
   * value `handle-authenticated.ts` passes as `clientRef` to the server. It
   * MUST be passed through verbatim: ADR-0031 makes this the only column that
   * tells two trials apart, since `keyOwner` is the constant
   * `OAUTH:M2M:TRIAL` for every one of them. Undefined for callers that have
   * no per-client identity (static bearer keys).
   */
  readonly clientRef?: string;
}

/**
 * One `rate_limit_decision` event. Emitted only on refusal — see the module
 * docblock for why `allow` is deliberately absent.
 *
 * `responsibleTier` is the bucket the operator should act on, and it is
 * filled ASYMMETRICALLY by design:
 *
 *   - on `deny` it is `CheckResult.tier` — the bucket that actually refused;
 *   - on `throttle` it is `CheckResult.nearestLimit.tier` — the bucket
 *     proportionally closest to its cliff, which `limiter.ts` notes is NOT
 *     necessarily the binding one (a minute bucket at 50/60 can bind while a
 *     day bucket at 100/1000 is proportionally closer).
 *
 * Both answer the same operator question — *which window do I widen* — which
 * is why the asymmetry is correct rather than merely tolerated. A
 * `GROUP BY blob2` that ignores `blob4` mixes the two meanings; the dashboard
 * panel groups by both.
 */
export function emitRateLimitDecision(
  env: Env,
  args: Attribution & {
    readonly outcome: 'deny' | 'throttle';
    readonly responsibleTier: CheckResult['tier'];
  }
): void {
  if (!env.METRICS) return;
  emit(new AnalyticsEngineSink(env.METRICS), {
    event_type: 'rate_limit_decision',
    name: args.responsibleTier,
    keyOwner: args.keyOwner,
    outcome: args.outcome,
    // A denied request IS a 429. A throttled one proceeds, and its real status
    // is not knowable here — recording a speculative '200' would be a lie the
    // dashboard could not distinguish from a measured one.
    ...(args.outcome === 'deny' ? { status_code: '429' } : {}),
    ...(args.clientRef ? { client_ref: args.clientRef } : {}),
  });
}

/**
 * One `tier_denial` event: a trial identity was refused a radar tool by
 * `pipeline/tier-gate.ts`.
 *
 * `status_code` is '200' rather than a 4xx, and that is not a mistake — the
 * gate returns a JSON-RPC `-32002` error inside an HTTP 200, deliberately, so
 * the caller reads it as a legible refusal rather than a broken connection
 * (`tier-gate.ts` records the reasoning). Recording the transport status
 * honestly is what lets this be told apart from a scope 403 later.
 */
export function emitTierDenial(env: Env, args: Attribution & { readonly toolName: string }): void {
  if (!env.METRICS) return;
  emit(new AnalyticsEngineSink(env.METRICS), {
    event_type: 'tier_denial',
    // The refused tool — an open enum, like `tool_invocation.name`. This is
    // the field that carries the commercial signal: WHICH gated capability
    // trials keep reaching for.
    name: args.toolName,
    keyOwner: args.keyOwner,
    outcome: 'denied',
    status_code: '200',
    ...(args.clientRef ? { client_ref: args.clientRef } : {}),
  });
}
