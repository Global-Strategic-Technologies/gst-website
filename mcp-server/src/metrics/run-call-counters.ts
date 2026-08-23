/**
 * BL-121 — run-scoped durable tool-call counters.
 *
 * **The problem.** BL-071 made the server authoritative for tool-call counts
 * so the RUN-AUDIT block would stop depending on the model's memory of its
 * own behaviour. That works on stdio, where `createServer` runs once per
 * process and `InMemoryToolCallCounters` spans the whole session. On the
 * Worker it does not: `createServer` runs **per HTTP request**
 * (`src/pipeline/handle-authenticated.ts`, `src/worker.ts`), so a fresh
 * counter map is built for every call and `compose_dossier_envelope`'s
 * snapshot can only ever contain the request it is inside.
 *
 * Observed in production (Kestrel IRL, 2026-08-12): the envelope reported
 * itself as `{attempted: 1, succeeded: 0}` and `validate_irl_provenance` as
 * all-`null` — the model correctly declined to invent numbers the server could
 * not supply, which left `precheck.iterations` as a model assertion. Exactly
 * what BL-071 existed to eliminate.
 *
 * **The fix.** Accumulate the counts in Upstash under a key derived from the
 * run itself, so they survive isolate rotation the way the BL-076 IRL body
 * cache already does. See
 * `src/docs/adr/0016-run-scoped-durable-tool-call-counters.md`.
 *
 * **Why `irlBodyHash` is the run key** rather than a session id: every tool in
 * an IRL run already carries or derives it, so nothing new has to be minted or
 * threaded — and it is the *correct* scope. "These bytes" is what the audit
 * cares about; "this TCP session" is not. A consequence worth stating: if a
 * model validates one body and composes another, the keys legitimately differ
 * and the count comes up short. That is a true signal — it verified bytes it
 * did not submit — not a lost count.
 *
 * **Failure posture: quiet.** Modelled on `src/lib/inoreader-egress.ts`, whose
 * comment states the trade exactly — *"Counter is a guard rail, not auth —
 * degraded Upstash shouldn't fail user requests."* This is deliberately the
 * opposite of BL-076's body cache, which throws when Upstash is unbound: a
 * missing body corrupts the dossier, while a missing counter only weakens a
 * report. Converting an observability degradation into a failed run would be
 * the wrong trade.
 */

import { safeLog } from '../auth/safe-logger';
import { createMcpClient } from '../lib/upstash-clients';
import { IRL_BODY_CACHE_TTL_SECONDS } from '../cache/irl-body-cache';
import type { ToolCallCounterEntry, ToolCallCounterEvent } from './with-metrics';
import type { Env } from '../env';

/**
 * Upstash key prefix for run-scoped counter hashes.
 *
 * **MUST start with `mcp:`** — the shared token's ACL is scoped to
 * `+@all ~mcp:*`, and BL-076 shipped once with a non-conforming prefix and
 * spent the BL-077a/b/c diagnostic chain discovering it as `NOPERM` (see
 * `src/cache/irl-body-cache.ts` → `UPSTASH_KEY_PREFIX`). Descriptive, matching
 * the existing families (`mcp:irl-body:`, `mcp:inoreader:`, `mcp:audit:`).
 */
export const RUN_COUNTS_KEY_PREFIX = 'mcp:irl-run-counts:';

/**
 * TTL for a run's counter hash. Matched to the IRL body cache so the counter
 * never outlives the body it counts against — a run whose body has expired
 * cannot be composed anyway.
 */
export const RUN_COUNTS_TTL_SECONDS = IRL_BODY_CACHE_TTL_SECONDS;

/**
 * The four counter fields, in the order the taxonomy declares them.
 * `succeeded` is spelled differently from its event (`'success'`) — see
 * {@link eventField}.
 */
const COUNTER_FIELDS = ['attempted', 'succeeded', 'rejected', 'errored'] as const;

/**
 * Project a counter event onto its entry field.
 *
 * **The names differ**: the event enum says `'success'` while the entry field
 * says `succeeded` (`with-metrics.ts`). Writing the event name straight into
 * the hash would leave `succeeded` reading 0 forever, and every identity that
 * depends on it silently false — which is the failure class this whole module
 * exists to close. Pinned by a unit test.
 */
function eventField(event: RunCallOutcomeEvent): keyof ToolCallCounterEntry {
  return event === 'success' ? 'succeeded' : event;
}

/** Hash field name for a tool's counter, e.g. `validate_irl_provenance.succeeded`. */
function fieldFor(toolName: string, field: keyof ToolCallCounterEntry): string {
  return `${toolName}.${field}`;
}

/**
 * The OUTCOME events a durable row accepts — deliberately narrower than
 * {@link ToolCallCounterEvent}, which also carries `'attempted'`.
 *
 * `record` increments `attempted` itself alongside the outcome, so passing
 * `'attempted'` here would increment it twice: once literally and once via
 * {@link eventField}. Narrowing the parameter makes that a compile error
 * rather than a silently doubled count in an audit surface.
 */
export type RunCallOutcomeEvent = Exclude<ToolCallCounterEvent, 'attempted'>;

export interface RunCallCounters {
  /** Record one counter outcome against a run. Never throws. */
  record(runKey: string, toolName: string, event: RunCallOutcomeEvent): Promise<void>;
  /**
   * Read every counter recorded against a run.
   *
   * **`{}` means "no calls recorded"; `null` means "the store could not be
   * read".** The distinction is load-bearing — the envelope downgrades
   * `countersScope` to `'request'` on `null`, and reporting `'run'` over
   * request-scoped numbers would be a total false red. It is also easy to
   * lose: `hgetall` returns `null` for a missing key, so a naive pass-through
   * collapses both cases into `null`.
   */
  snapshot(runKey: string): Promise<Record<string, ToolCallCounterEntry> | null>;
}

/**
 * Upstash-backed implementation. One Redis hash per run, one field per
 * tool+counter, `HINCRBY` per event.
 *
 * A hash (rather than a key per counter) keeps the read to a single `HGETALL`
 * and the TTL to a single key, and `HINCRBY` is atomic per field — so two
 * concurrent tool calls cannot lose an increment the way a read-modify-write
 * would. That matters in one direction specifically: a lost increment
 * *under*-reports, which fails a run that was fine.
 */
export class UpstashRunCallCounters implements RunCallCounters {
  private readonly redis: NonNullable<ReturnType<typeof createMcpClient>>;

  constructor(redis: NonNullable<ReturnType<typeof createMcpClient>>) {
    this.redis = redis;
  }

  /**
   * Build from env, or `null` when Upstash isn't bound.
   *
   * Uses `retry: false` — two fetch attempts, no backoff sleep, against an SDK
   * default of six attempts and `exp(0..4)*50` = 4,289 ms of sleep. During a
   * brownout that default would sit on the response path of every instrumented
   * call, which is a degraded Upstash degrading the run.
   *
   * **This bounds the retry budget, not total latency.** Two fetch latencies
   * still land on the response path, awaited at wrapper exit, so a *hung*
   * Upstash delays an IRL tool call rather than being invisible to it. The
   * per-request client makes a construction-time `AbortSignal.timeout` the
   * wrong instrument — the signal would start counting at `createServer`, not
   * at the write, and would abort spuriously on any tool that ran longer than
   * the budget, silently losing counts on exactly the slow calls most worth
   * counting. Recorded as a bounded residual instead of met with a mechanism
   * that trades a delay for a lost count; fail-quiet still holds, since an
   * aborted or failed fetch lands in `record`'s catch.
   */
  static fromEnv(env: Env): UpstashRunCallCounters | null {
    const redis = createMcpClient(env, { retry: false });
    return redis ? new UpstashRunCallCounters(redis) : null;
  }

  async record(runKey: string, toolName: string, event: RunCallOutcomeEvent): Promise<void> {
    const key = `${RUN_COUNTS_KEY_PREFIX}${runKey}`;
    try {
      // ONE pipelined round trip, not three. Three sequential awaits would put
      // ~3 RTTs on the response path of every instrumented call, which quietly
      // undoes the `retry: false` reasoning above — that setting exists to keep
      // a degraded Upstash off this path, and it cannot do that if the healthy
      // path already costs three.
      //
      // Atomicity is the second reason: `attempted` and the outcome move
      // together, so they cannot tear. Their agreement with the outcome sum
      // (`attempted === succeeded + rejected + errored`) is then a real
      // integrity check on the row rather than a race with itself.
      //
      // ALWAYS re-issue EXPIRE, never only on first write — inherited from the
      // BL-032.75 audit fix C1 on the egress counter, where the "only set TTL
      // when INCR returns 1" optimisation left keys permanent whenever an
      // isolate died between the two calls. Idempotent and ~free inside the tx.
      const tx = this.redis.multi();
      tx.hincrby(key, fieldFor(toolName, 'attempted'), 1);
      tx.hincrby(key, fieldFor(toolName, eventField(event)), 1);
      tx.expire(key, RUN_COUNTS_TTL_SECONDS);
      await tx.exec();
    } catch {
      safeLog({
        event: 'bl121.run-counters.write-failed',
        tool: toolName,
        success: false,
        errorCode: 'run-counter-write',
      });
    }
  }

  async snapshot(runKey: string): Promise<Record<string, ToolCallCounterEntry> | null> {
    try {
      const raw = await this.redis.hgetall<Record<string, string | number>>(
        `${RUN_COUNTS_KEY_PREFIX}${runKey}`
      );
      // `hgetall` returns null for a MISSING key — that is "no calls recorded",
      // not "unreadable". Collapsing the two is the trap this contract exists
      // to avoid; only the catch below may return null.
      if (raw == null) return {};
      return projectHash(raw);
    } catch {
      safeLog({
        event: 'bl121.run-counters.read-failed',
        success: false,
        errorCode: 'run-counter-read',
      });
      return null;
    }
  }
}

/**
 * Turn a flat `{"<tool>.<field>": n}` hash into the per-tool entry shape,
 * defaulting every field so a partially-written row still reads as a complete
 * entry (`attempted` present, outcomes zero) rather than `undefined`.
 *
 * Unknown fields are ignored rather than throwing: a future counter field
 * deployed ahead of a reader must not break the read path.
 */
function projectHash(raw: Record<string, string | number>): Record<string, ToolCallCounterEntry> {
  const out: Record<string, ToolCallCounterEntry> = {};
  for (const [rawField, rawValue] of Object.entries(raw)) {
    const sep = rawField.lastIndexOf('.');
    if (sep <= 0) continue;
    const toolName = rawField.slice(0, sep);
    const field = rawField.slice(sep + 1) as keyof ToolCallCounterEntry;
    if (!COUNTER_FIELDS.includes(field)) continue;
    const entry = (out[toolName] ??= { attempted: 0, succeeded: 0, rejected: 0, errored: 0 });
    const n = typeof rawValue === 'number' ? rawValue : Number.parseInt(rawValue, 10);
    if (Number.isFinite(n)) entry[field] = n;
  }
  return out;
}
