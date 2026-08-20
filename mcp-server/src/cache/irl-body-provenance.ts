/**
 * BL-123 — server-held provenance for a cached IRL body.
 *
 * **Why this exists.** `irlSource` on `compose_dossier_envelope` is a claim the
 * MODEL makes about where the bytes came from, and its only evidence for the
 * strongest form (`partner-paste-verbatim-prepop`) is that a
 * `**Body-binding hash:**` directive appeared in the prompt body. Presence of a
 * string survives serialization, so an exported-and-replayed payload carries the
 * same evidence a fresh invocation does.
 *
 * This store records what the SERVER witnessed at the moment the body entered
 * the cache, so `compose_dossier_envelope` can cap an over-strong claim instead
 * of taking the model's word. Same conversion BL-121 made for `toolCallCounts`
 * (ADR-0016) — and for the same stated reason: model self-narration drifts.
 *
 * ─── Cap, not derive ──────────────────────────────────────────────────────
 *
 * This metadata can DISPROVE the strongest claim. It cannot substantiate the
 * weaker ones, and must never be used to try. `mintedBy: 'prepare-tool'` is
 * produced identically by (a) an interactive partner paste relayed through
 * `prepare_irl_body` and (b) a model reconstruction from an xlsx attachment —
 * the server never sees where the model got the bytes. A consumer that derived
 * `irlSource` from this record alone could never produce
 * `model-reconstruction-from-xlsx`, and would therefore hand every
 * reconstruction run a partner-paste grade, sailing it past the
 * `requireVerbatimBody` gate that exists to catch exactly that. See the cap
 * rule at the `compose_dossier_envelope` handler.
 *
 * ─── Posture: shape of the body cache, failure semantics of the counters ──
 *
 * Two impls selected by transport, like `IrlBodyCache` — because on stdio the
 * render and the compose share one process, so an in-memory map makes the cap
 * fully work there rather than permanently degraded, and makes it testable
 * without Upstash.
 *
 * But do NOT inherit the body cache's fail-fast posture. That cache throws when
 * Upstash is unbound in Worker mode because a missing body corrupts the
 * dossier. A missing provenance record does not: it only weakens an audit
 * claim, which is the counters' trade, stated at
 * `src/metrics/run-call-counters.ts` and ADR-0016 as *"a missing body corrupts
 * the dossier, while a missing counter only weakens a report."* So:
 *
 *   - **Never in-memory on the Worker** — isolates rotate between requests, so
 *     a Worker in-memory map would silently miss and downgrade honest runs.
 *     Enforced at the `createServer` wiring.
 *   - **Unbound or unreadable degrades quietly** — every method swallows its
 *     errors. A read failure returns `null`, which lands on the
 *     metadata-absent path (claim passes through, labelled unverified). It
 *     never throws, because a KV blip must not fail an envelope call.
 */

import { safeLog } from '../auth/safe-logger';
import type { CacheStore } from '../lib/upstash-cache-store';

/**
 * Who wrote the body into the cache.
 *
 * `prompt-render` is the only value that can support
 * `partner-paste-verbatim-prepop`: it means the server computed the hash from
 * an operator-supplied `filledIrl` prompt argument and populated the cache in
 * that same request, with no model emission anywhere in the path.
 */
export type IrlBodyMintedBy = 'prompt-render' | 'prepare-tool';

export interface IrlBodyProvenance {
  mintedBy: IrlBodyMintedBy;
  /** ISO-8601. Surfaces mint age so a replay against a still-live entry is visible. */
  mintedAt: string;
  byteLength: number;
  newlineCount: number;
}

/**
 * TTL matches `IRL_BODY_CACHE_TTL_SECONDS`. The record is meaningless once the
 * body it describes has expired, and outliving it would let a stale record
 * grade a body written by a later, different caller.
 */
export const IRL_BODY_PROVENANCE_TTL_SECONDS = 4 * 60 * 60;

/**
 * MUST start with `mcp:` — the shared Upstash token's ACL is scoped
 * `+@all ~mcp:*`. This is not cosmetic: BL-076 shipped a non-conforming prefix
 * and burned the entire BL-077a/b/c diagnostic chain on `NOPERM` before the
 * cause was found. See `src/cache/irl-body-cache.ts` for that history.
 */
export const IRL_BODY_PROVENANCE_KEY_PREFIX = 'mcp:irl-body-prov:';

export interface IrlBodyProvenanceStore {
  /**
   * Record provenance for a body hash. **First-write-wins**: an existing record
   * is never overwritten.
   *
   * The rule lives here rather than in the callers because both mints target
   * the same key. A render prepop followed by the model calling
   * `prepare_irl_body` is documented benign behaviour (BL-119 cycle 5), so
   * last-write-wins would downgrade an honest prepop run for a recovery the
   * prompt itself anticipates.
   *
   * Never throws. A write failure leaves the entry absent, which degrades to
   * the unverified path rather than failing a run.
   *
   * **Returns the EFFECTIVE entry** — `existing ?? entry` — or `null` on the
   * swallowed-error path. Under first-write-wins the timestamp the caller
   * computed can differ from the one the store kept (reachably: the
   * render-time prepop may have minted first, and repeat calls inside the 4 h
   * window hit the same path), so a caller that wants to REPORT the mint time
   * must report the stored value, not its own clock. Both impls already read
   * the key inside this method, so handing it back costs zero added round
   * trips — where a post-write `read()` would add one to a path
   * `ARCHITECTURE.md § IRL body provenance` flags as cost-sensitive.
   */
  record(irlBodyHash: string, entry: IrlBodyProvenance): Promise<IrlBodyProvenance | null>;

  /** Returns null on miss or on any store error — both mean "cannot verify". */
  read(irlBodyHash: string): Promise<IrlBodyProvenance | null>;
}

/** Stdio impl. Process-lifetime, shared by the render and the compose. */
export class InMemoryIrlBodyProvenanceStore implements IrlBodyProvenanceStore {
  private readonly store = new Map<string, IrlBodyProvenance>();

  async record(irlBodyHash: string, entry: IrlBodyProvenance): Promise<IrlBodyProvenance | null> {
    // `.get()` rather than `.has()` so first-write-wins has the stored VALUE to
    // hand back, matching the Upstash impl's existing value-read.
    const existing = this.store.get(irlBodyHash);
    if (existing) return existing; // first-write-wins
    this.store.set(irlBodyHash, entry);
    return entry;
  }

  async read(irlBodyHash: string): Promise<IrlBodyProvenance | null> {
    return this.store.get(irlBodyHash) ?? null;
  }
}

/**
 * Worker impl.
 *
 * First-write-wins is a read-then-write, which is **not atomic** — the
 * underlying `CacheStore` exposes no set-if-absent. Stated rather than hidden:
 * the race needs two writers for the same body hash inside one round trip, and
 * both would be writing the same bytes, so the only divergence is `mintedBy`.
 * In the ordering that actually occurs the render prepop precedes any tool call
 * in the session, so the stronger value is already present. A lost race
 * degrades a grade; it cannot corrupt a body.
 */
export class UpstashIrlBodyProvenanceStore implements IrlBodyProvenanceStore {
  private readonly store: CacheStore;
  private readonly ttlSeconds: number;

  constructor(store: CacheStore, ttlSeconds: number = IRL_BODY_PROVENANCE_TTL_SECONDS) {
    this.store = store;
    this.ttlSeconds = ttlSeconds;
  }

  async record(irlBodyHash: string, entry: IrlBodyProvenance): Promise<IrlBodyProvenance | null> {
    const key = `${IRL_BODY_PROVENANCE_KEY_PREFIX}${irlBodyHash}`;
    try {
      const existing = await this.store.get<IrlBodyProvenance>(key);
      if (existing) return existing; // first-write-wins
      const ok = await this.store.set(key, entry, this.ttlSeconds);
      safeLog({
        event: 'bl123.provenance.record',
        key,
        outcome: ok ? 'success' : 'write-returned-false',
        success: ok,
        ...(ok ? {} : { errorCode: 'provenance-write-returned-false' }),
      });
      // A write that returned false left nothing stored — report absence rather
      // than the entry we failed to persist.
      return ok ? entry : null;
    } catch (error) {
      // Deliberately swallowed — see the posture note in the module docstring.
      safeLog({
        event: 'bl123.provenance.record',
        key,
        outcome: 'threw',
        reason: error instanceof Error ? error.message.slice(0, 300) : String(error),
        success: false,
        errorCode: 'provenance-write-threw',
      });
      return null;
    }
  }

  async read(irlBodyHash: string): Promise<IrlBodyProvenance | null> {
    const key = `${IRL_BODY_PROVENANCE_KEY_PREFIX}${irlBodyHash}`;
    try {
      return await this.store.get<IrlBodyProvenance>(key);
    } catch {
      // Unreadable and absent are the same thing to the caller: cannot verify.
      return null;
    }
  }
}
