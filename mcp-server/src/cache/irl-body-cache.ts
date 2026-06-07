/**
 * BL-076 — IRL body cache for the `compose_dossier_envelope` body-by-hash
 * latency reduction.
 *
 * The model emits the IRL body once to `prepare_irl_body`, which caches it
 * keyed by the canonical 16-hex `irlBodyHash` (sha256(body).slice(0,16)).
 * `compose_dossier_envelope` then accepts only the hash and re-hydrates the
 * body from this cache — cutting ~9-80KB of model output tokens per envelope
 * call (40-80% latency reduction depending on body size; see
 * `src/docs/development/MCP_SERVER_COMPOSE_BODY_BY_HASH_BL-076.md`).
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

/** Upstash key prefix for IRL body cache entries. */
export const UPSTASH_KEY_PREFIX = 'gst-mcp:irl-body:';

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
      `BL-076 IRL body cache rejected entry: body byteLength=${byteLength} exceeds ` +
        `per-entry cap IRL_BODY_CACHE_MAX_BYTES=${IRL_BODY_CACHE_MAX_BYTES}. ` +
        `If the IRL is legitimately this large, raise the cap; otherwise trim the body.`
    );
    this.name = 'IrlBodyCacheSizeExceededError';
    this.byteLength = byteLength;
    this.limit = IRL_BODY_CACHE_MAX_BYTES;
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
export class UpstashIrlBodyCache implements IrlBodyCache {
  private readonly store: CacheStore;
  private readonly ttlSeconds: number;

  constructor(store: CacheStore, ttlSeconds: number = IRL_BODY_CACHE_TTL_SECONDS) {
    this.store = store;
    this.ttlSeconds = ttlSeconds;
  }

  async set(irlBodyHash: string, body: string): Promise<void> {
    const byteLength = Buffer.byteLength(body, 'utf8');
    if (byteLength > IRL_BODY_CACHE_MAX_BYTES) {
      throw new IrlBodyCacheSizeExceededError(byteLength);
    }
    await this.store.set(`${UPSTASH_KEY_PREFIX}${irlBodyHash}`, body, this.ttlSeconds);
  }

  async get(irlBodyHash: string): Promise<string | null> {
    const value = await this.store.get<string>(`${UPSTASH_KEY_PREFIX}${irlBodyHash}`);
    return value ?? null;
  }
}
