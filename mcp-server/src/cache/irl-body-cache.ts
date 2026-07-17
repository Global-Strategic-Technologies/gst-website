/**
 * BL-076 — IRL body cache for the `compose_dossier_envelope` body-by-hash
 * latency reduction.
 *
 * The model emits the IRL body once to `prepare_irl_body`, which caches it
 * keyed by the canonical 16-hex `irlBodyHash` (sha256(body).slice(0,16)).
 * `compose_dossier_envelope` then accepts only the hash and re-hydrates the
 * body from this cache — cutting ~9-80KB of model output tokens per envelope
 * call (40-80% latency reduction depending on body size; see
 * `src/docs/adr/0002-irl-body-by-hash-cache.md`).
 *
 * Two implementations:
 *   - `InMemoryIrlBodyCache` — stdio path. Process-lifetime LRU `Map`,
 *     bounded at 16 entries.
 *   - `UpstashIrlBodyCache` — Worker path. Backed by the same Upstash KV
 *     that powers BL-032.5 resource caching. Per-key TTL of 4 hours.
 *
 * Both enforce a per-entry size cap (`IRL_BODY_CACHE_MAX_BYTES`) at `.set()`
 * to protect against hostile / buggy callers OOMing the cache. The cap
 * (200KB) is ~2x the realistic upper bound of observed IRL bodies (80KB).
 *
 * Cache miss surfaces in `compose_dossier_envelope` as `Bl076BodyCacheMissError`
 * — actionable diagnostic directs the model to call `prepare_irl_body` first.
 *
 * **Worker MUST NOT fall back to in-memory** (audit R-3): Cloudflare isolates
 * rotate between requests, so an in-memory cache populated by `prepare_irl_body`
 * would silently miss on the subsequent `compose_dossier_envelope` from a
 * different isolate. The wiring at `createServer` is responsible for the
 * fail-fast-on-missing-bindings behavior; this module just provides the
 * impls.
 */

import { safeLog } from '../auth/safe-logger';
import type { CacheStore } from '../lib/upstash-cache-store';

/**
 * Per-entry body-size cap. Bodies larger than this are rejected at `.set()`
 * with a thrown error. 200KB is ~2.5x the largest observed real IRL body
 * (~80KB) — generous enough to absorb empirical variance, tight enough to
 * prevent a hostile/buggy caller from OOMing the stdio process (16 entries
 * × 200KB worst-case = 3.2MB resident, still negligible).
 */
export const IRL_BODY_CACHE_MAX_BYTES = 200_000;

/**
 * Default Upstash TTL for Worker-mode entries. 4 hours absorbs operator
 * coffee break + standup + iteration without surfacing confusing cache-miss
 * errors. Override via env-binding if production data demands tuning.
 */
export const IRL_BODY_CACHE_TTL_SECONDS = 4 * 60 * 60;

/** Stdio LRU cap. 16 entries covers a deep iteration session for one operator. */
export const IN_MEMORY_LRU_CAPACITY = 16;

/**
 * Upstash key prefix for IRL body cache entries.
 *
 * **MUST start with `mcp:`** to conform to the namespace discipline documented
 * at [`mcp-server/src/lib/upstash-cache-store.ts:12-16`]:
 *
 *   > Namespace discipline (Q13 / Path 2): this store talks ONLY to the MCP
 *   > DB via createMcpClient(env). All keys written here use the `mcp:` prefix
 *
 * The shared Upstash token has ACL scoped to `+@all ~mcp:*`. BL-076 originally
 * shipped with the prefix `gst-mcp:irl-body:` (single staging exercise on
 * 2026-06-07 surfaced `NOPERM this user has no permissions to access one of
 * the keys used as arguments` via the BL-077a/b diagnostic chain). BL-077c
 * realigns the prefix with the documented discipline.
 */
export const UPSTASH_KEY_PREFIX = 'mcp:irl-body:';

/**
 * Thrown by `IrlBodyCache.set` when the body byte-length exceeds
 * `IRL_BODY_CACHE_MAX_BYTES`. Caught in `prepare_irl_body`'s handler and
 * surfaced as a structured tool error.
 */
export class IrlBodyCacheSizeExceededError extends Error {
  readonly byteLength: number;
  readonly limit: number;
  constructor(byteLength: number) {
    super(
      `IRL body cache rejected entry: body byteLength=${byteLength} exceeds ` +
        `per-entry cap IRL_BODY_CACHE_MAX_BYTES=${IRL_BODY_CACHE_MAX_BYTES}. ` +
        `If the IRL is legitimately this large, raise the cap; otherwise trim the body.`
    );
    this.name = 'IrlBodyCacheSizeExceededError';
    this.byteLength = byteLength;
    this.limit = IRL_BODY_CACHE_MAX_BYTES;
  }
}

/**
 * BL-077a — thrown by `UpstashIrlBodyCache.set` when the underlying Upstash
 * KV write fails OR a read-after-write probe shows the entry isn't readable.
 *
 * Pre-BL-077a, `CacheStore.set` swallowed Upstash errors and returned `false`,
 * and `UpstashIrlBodyCache.set` ignored the return value — silently failed
 * writes produced confusing downstream `Bl076BodyCacheMissError` on the next
 * `compose_dossier_envelope` call. This class converts the silent failure
 * into a structured rejection at `prepare_irl_body` time so the operator
 * sees the actual problem.
 *
 * The `cause` field carries one of:
 *   - `'write-returned-false'`: `CacheStore.set` swallowed an Upstash error
 *     and returned `false`. Most likely root causes: auth/rate-limit/quota.
 *   - `'readback-null'`: `CacheStore.set` returned `true` but a subsequent
 *     `CacheStore.get` on the same key returned `null`. Catches envelope-
 *     shape bugs (JSON wrap/unwrap mismatch) and cross-region consistency
 *     gaps in the substrate.
 *   - `'readback-mismatch'`: read-back returned a value, but it isn't equal
 *     to the body that was written. Catches serialization corruption.
 */
export class IrlBodyCacheWriteFailedError extends Error {
  readonly irlBodyHash: string;
  readonly cause: 'write-returned-false' | 'readback-null' | 'readback-mismatch';
  constructor(
    irlBodyHash: string,
    cause: 'write-returned-false' | 'readback-null' | 'readback-mismatch'
  ) {
    const reasonText: Record<typeof cause, string> = {
      'write-returned-false':
        'underlying CacheStore.set returned false (Upstash auth/rate-limit/quota or transient KV failure)',
      'readback-null':
        'write returned true but read-after-write probe returned null (envelope-shape mismatch or cross-region consistency gap)',
      'readback-mismatch':
        'read-after-write probe returned a value that does not match the body that was written (serialization corruption)',
    };
    super(
      `IRL body cache write FAILED for irlBodyHash="${irlBodyHash}": ${reasonText[cause]}. ` +
        `Run \`wrangler tail\` against the staging Worker during the next prepare_irl_body call to see the ` +
        `\`bl077.cache.set\` safeLog event with the resolved Upstash key + outcome. Retry prepare_irl_body ` +
        `to re-attempt; if the error persists, file a follow-up with the wrangler-tail output.`
    );
    this.name = 'IrlBodyCacheWriteFailedError';
    this.irlBodyHash = irlBodyHash;
    this.cause = cause;
  }
}

/**
 * Public cache interface. Both implementations are async-shaped so callers
 * don't have to branch on which substrate is in play; the stdio path
 * resolves promises synchronously in practice.
 */
export interface IrlBodyCache {
  /**
   * Store the body keyed by its 16-hex `irlBodyHash`. Idempotent — same
   * hash + same bytes is a no-op overwrite (deterministic by construction:
   * the hash IS sha256(body).slice(0,16)). Throws `IrlBodyCacheSizeExceededError`
   * if the body exceeds the per-entry cap.
   */
  set(irlBodyHash: string, body: string): Promise<void>;

  /**
   * Retrieve the body. Returns `null` on cache miss; the caller (typically
   * the `compose_dossier_envelope` handler) throws `Bl076BodyCacheMissError`
   * with an actionable diagnostic directing the model to call
   * `prepare_irl_body` first.
   */
  get(irlBodyHash: string): Promise<string | null>;
}

/**
 * In-process LRU. Used in stdio mode (single Claude Desktop session per
 * process; the cache and the conversation share a lifecycle).
 *
 * Eviction policy: insertion-order LRU. On `set()` of a new key when at
 * capacity, evict the oldest entry. On `get()` hit, move the entry to the
 * back (most-recently-used). `Map` insertion-order iteration makes this
 * cheap.
 */
export class InMemoryIrlBodyCache implements IrlBodyCache {
  private readonly store = new Map<string, string>();
  private readonly capacity: number;

  constructor(capacity: number = IN_MEMORY_LRU_CAPACITY) {
    this.capacity = capacity;
  }

  async set(irlBodyHash: string, body: string): Promise<void> {
    const byteLength = Buffer.byteLength(body, 'utf8');
    if (byteLength > IRL_BODY_CACHE_MAX_BYTES) {
      throw new IrlBodyCacheSizeExceededError(byteLength);
    }
    // If the key already exists, delete first so re-insertion lands at the
    // tail (most-recently-used) and the LRU ordering stays correct.
    if (this.store.has(irlBodyHash)) {
      this.store.delete(irlBodyHash);
    } else if (this.store.size >= this.capacity) {
      // Evict the oldest entry (the first key in insertion order).
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) {
        this.store.delete(oldest);
      }
    }
    this.store.set(irlBodyHash, body);
  }

  async get(irlBodyHash: string): Promise<string | null> {
    const body = this.store.get(irlBodyHash);
    if (body === undefined) return null;
    // Refresh LRU ordering: re-insert at the tail.
    this.store.delete(irlBodyHash);
    this.store.set(irlBodyHash, body);
    return body;
  }

  /** Test-only inspection helper. NOT part of the IrlBodyCache contract. */
  size(): number {
    return this.store.size;
  }
}

/**
 * Upstash-backed cache. Used in Worker mode — Cloudflare isolates rotate
 * between requests, so cross-call state MUST live in shared KV.
 *
 * Wraps the existing `CacheStore` (BL-032.5 substrate) with the BL-076
 * key prefix + TTL policy + size-cap enforcement.
 *
 * Fail-open on Upstash errors: `set()` swallows them (the next `get()` will
 * miss and surface `Bl076BodyCacheMissError`, prompting the model to retry
 * `prepare_irl_body`); `get()` returns `null` on any error (same retry path).
 * Bubbling Upstash exceptions would convert a transient KV blip into a
 * hard tool failure, which is worse than the cache miss the retry handles.
 */
/**
 * Monotonically-incrementing identifier assigned to each `UpstashIrlBodyCache`
 * instance at construction. Surfaces in `safeLog` events so a `wrangler tail`
 * session can correlate `set` and `get` events across Worker isolates and
 * confirm both prepare and compose are talking to the same logical store.
 * Audit alt root cause #1 (different store instances) is diagnosed by
 * comparing `storeId` across the prepare and compose log lines.
 */
let upstashIrlBodyCacheInstanceCounter = 0;

export class UpstashIrlBodyCache implements IrlBodyCache {
  private readonly store: CacheStore;
  private readonly ttlSeconds: number;
  /** Stable id for this instance — only meaningful within one isolate's lifetime; surfaces in logs. */
  readonly storeId: number;

  constructor(store: CacheStore, ttlSeconds: number = IRL_BODY_CACHE_TTL_SECONDS) {
    this.store = store;
    this.ttlSeconds = ttlSeconds;
    this.storeId = ++upstashIrlBodyCacheInstanceCounter;
  }

  async set(irlBodyHash: string, body: string): Promise<void> {
    const byteLength = Buffer.byteLength(body, 'utf8');
    if (byteLength > IRL_BODY_CACHE_MAX_BYTES) {
      throw new IrlBodyCacheSizeExceededError(byteLength);
    }
    const key = `${UPSTASH_KEY_PREFIX}${irlBodyHash}`;
    // BL-077a — check the boolean return value (pre-BL-077a we ignored it
    // and writes failed silently). CacheStore.set wraps Upstash errors in
    // try/catch and returns false on failure.
    const writeOk = await this.store.set(key, body, this.ttlSeconds);
    if (!writeOk) {
      safeLog({
        event: 'bl077.cache.set',
        outcome: 'write-returned-false',
        storeId: this.storeId,
        key,
        byteLength,
        ttlSeconds: this.ttlSeconds,
        success: false,
        errorCode: 'cache-write-returned-false',
      });
      throw new IrlBodyCacheWriteFailedError(irlBodyHash, 'write-returned-false');
    }
    // BL-077a — read-after-write probe. One extra GET on the same key to
    // confirm the value is readable. Catches envelope-shape mismatches
    // (CacheStore wraps in `{storedAt, data}` and JSON.stringify's; if get
    // can't unwrap, returns null) and any cross-region consistency gap
    // present at the substrate. Cost: one extra Upstash round-trip per
    // prepare_irl_body call (~50-100ms). Acceptable as a one-off diagnostic;
    // remove after root cause is fixed.
    const readback = await this.store.get<string>(key);
    if (readback === null || readback === undefined) {
      safeLog({
        event: 'bl077.cache.set',
        outcome: 'readback-null',
        storeId: this.storeId,
        key,
        byteLength,
        ttlSeconds: this.ttlSeconds,
        success: false,
        errorCode: 'cache-readback-null',
      });
      throw new IrlBodyCacheWriteFailedError(irlBodyHash, 'readback-null');
    }
    if (readback !== body) {
      safeLog({
        event: 'bl077.cache.set',
        outcome: 'readback-mismatch',
        storeId: this.storeId,
        key,
        byteLength,
        readbackByteLength: Buffer.byteLength(readback, 'utf8'),
        ttlSeconds: this.ttlSeconds,
        success: false,
        errorCode: 'cache-readback-mismatch',
      });
      throw new IrlBodyCacheWriteFailedError(irlBodyHash, 'readback-mismatch');
    }
    safeLog({
      event: 'bl077.cache.set',
      outcome: 'success',
      storeId: this.storeId,
      key,
      byteLength,
      ttlSeconds: this.ttlSeconds,
      success: true,
    });
  }

  async get(irlBodyHash: string): Promise<string | null> {
    const key = `${UPSTASH_KEY_PREFIX}${irlBodyHash}`;
    const value = await this.store.get<string>(key);
    if (value === null || value === undefined) {
      safeLog({
        event: 'bl077.cache.get',
        outcome: 'miss',
        storeId: this.storeId,
        key,
        success: false,
        errorCode: 'cache-miss',
      });
      return null;
    }
    safeLog({
      event: 'bl077.cache.get',
      outcome: 'hit',
      storeId: this.storeId,
      key,
      byteLength: Buffer.byteLength(value, 'utf8'),
      success: true,
    });
    return value;
  }
}
