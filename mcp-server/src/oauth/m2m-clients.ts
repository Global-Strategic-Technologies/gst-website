/**
 * M2M client registry (BL-033 Slice 2) — machine clients that
 * authenticate with `grant_type=client_credentials` (a PE firm's
 * headless pipeline calling tools with no human in the loop).
 *
 * Records live in OAUTH_KV under `mcp:oauth:m2m-client:<client_id>` —
 * the same substrate as the library's own auth-code clients, but a
 * separate namespace because the library's grant model has no
 * client_credentials concept (verified against v0.8.2) and must never
 * see these records.
 *
 * Secrets: 32-byte random base64url, shown ONCE at creation; only the
 * SHA-256 hex hash is stored (high-entropy random values — a password
 * KDF like Argon2id buys nothing here; recorded as the BL-033 AC:244
 * deviation). Comparison is constant-time over the hex hashes.
 *
 * `jwks` (optional): inline JWK Set with the client's ES256 public
 * key(s) — enables RFC 7523 `private_key_jwt` client assertions, the
 * MCP client-credentials extension's recommended mode (no secret ever
 * transmitted).
 */

import type { KVNamespace } from '@cloudflare/workers-types';
import { timingSafeEqual } from '../auth/timing-safe-equal';
import { sha256Hex } from '../lib/sha256';
import { m2mKeyOwner } from './key-owner';

// Re-exported (hoisted to `src/lib/sha256.ts` in BL-033 Slice 3a so the audit
// hash chain can share it without importing the OAuth module). Existing
// importers of `sha256Hex` from this module keep working unchanged.
export { sha256Hex };

export const M2M_CLIENT_KEY_PREFIX = 'mcp:oauth:m2m-client:';

export interface M2mJwk {
  kty: string;
  crv?: string;
  x?: string;
  y?: string;
  kid?: string;
  alg?: string;
}

export interface M2mClientRecord {
  clientId: string;
  name: string;
  secretHash: string;
  jwks?: { keys: M2mJwk[] };
  allowedScopes: string[];
  tier: string;
  createdAt: string;
  /**
   * ISO-8601 instant after which the `client_credentials` grant refuses this
   * client (BL-155). **Optional, and absence means "never expires"** — every
   * operator-provisioned client predating BL-155 has no `expiresAt` and must
   * keep working, so the field cannot be made required.
   *
   * That default is deliberately the *loose* one, which makes an omission on a
   * path that intends to expire a silent, permanent credential. Any caller
   * minting a time-boxed client must set this explicitly and assert it — see
   * `SELF_SERVE_TRIAL_BL-155.md`.
   *
   * Enforced at token mint (`m2m-token.ts`), **after** the auth branches, so an
   * unauthenticated caller cannot probe client existence or expiry. The record
   * is deliberately still readable, listable and PATCHable after this instant:
   * conversion to a paid tier needs it, and reaping is the KV `expirationTtl`'s
   * job, not this field's.
   *
   * Note the ≤1h residual inherent to self-contained tokens: a token minted
   * just before `expiresAt` stays valid until the JWT itself lapses.
   */
  expiresAt?: string;
}

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface CreateM2mClientInput {
  name: string;
  allowedScopes: string[];
  tier?: string;
  jwks?: { keys: M2mJwk[] };
  /** ISO-8601 expiry; omit for a client that never expires. See `M2mClientRecord.expiresAt`. */
  expiresAt?: string;
  /**
   * Seconds after which KV **reaps the record entirely** (BL-155). Distinct
   * from `expiresAt`, which only stops the grant: this is garbage collection,
   * and it should be set to `expiresAt` plus a grace window long enough that
   * conversion and support questions still find the record. Omit for a
   * permanent record — every pre-BL-155 caller does, and keeps a record that
   * never disappears.
   */
  reapAfterSeconds?: number;
}

/** Create + persist a record; the returned clientSecret is shown once. */
export async function createM2mClient(
  kv: KVNamespace,
  input: CreateM2mClientInput
): Promise<{ record: M2mClientRecord; clientSecret: string }> {
  const clientId = `m2m_${b64url(crypto.getRandomValues(new Uint8Array(16)))}`;
  const clientSecret = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const record: M2mClientRecord = {
    clientId,
    name: input.name,
    secretHash: await sha256Hex(clientSecret),
    ...(input.jwks ? { jwks: input.jwks } : {}),
    allowedScopes: input.allowedScopes,
    tier: input.tier ?? 'free-pilot',
    createdAt: new Date().toISOString(),
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
  };
  await kv.put(
    `${M2M_CLIENT_KEY_PREFIX}${clientId}`,
    JSON.stringify(record),
    // Omitted (not `undefined`) when no reap is wanted, so the call is
    // byte-identical to the pre-BL-155 bare `put` for every existing caller.
    input.reapAfterSeconds ? { expirationTtl: input.reapAfterSeconds } : undefined
  );
  return { record, clientSecret };
}

/**
 * Grace after `expiresAt` before KV reaps a time-boxed record (BL-155).
 * 30 days — long enough that a conversion or a support question still finds
 * the record, short enough that an unauthenticated minter cannot grow the
 * namespace without bound.
 */
export const REAP_GRACE_SECONDS = 30 * 24 * 60 * 60;

/** KV rejects an absolute `expiration` less than 60s in the future. */
const KV_MIN_EXPIRATION_LEAD_S = 60;

/**
 * Reap policy, derived rather than read back.
 *
 * BL-155's design stated two rules: a `trial`→`paid` conversion clears the reap
 * TTL, and any other PATCH preserves the remaining one. Deriving an ABSOLUTE
 * reap instant from `expiresAt` collapses both into one — the reap point is
 * always `expiresAt + grace`, so recomputing it on every write is idempotent
 * (it cannot slide), a record with no `expiresAt` simply has no reap, and
 * clearing `expiresAt` on conversion clears the reap for free.
 *
 * Why derive rather than read the existing TTL: KV's point reads (`get`,
 * `getWithMetadata`) do not expose expiration at all — only `list()` does, as an
 * absolute timestamp and only when set. So "preserve the remaining TTL" would
 * mean a list scan to recover a value that is already computable from a field
 * on the record. Derivation is not a workaround for a missing API; it is
 * strictly cheaper than the API that exists.
 */
function reapExpirationFor(record: M2mClientRecord): number | undefined {
  if (!record.expiresAt) return undefined;
  const expiresMs = Date.parse(record.expiresAt);
  if (Number.isNaN(expiresMs)) return undefined;
  const reapAtS = Math.floor(expiresMs / 1000) + REAP_GRACE_SECONDS;
  const floorS = Math.floor(Date.now() / 1000) + KV_MIN_EXPIRATION_LEAD_S;
  return Math.max(reapAtS, floorS);
}

export interface UpdateM2mClientInput {
  tier?: string;
  allowedScopes?: string[];
  /**
   * `string` sets a new expiry; **`null` clears it**, making the client
   * permanent and — via `reapExpirationFor` — cancelling its reap. Clearing is
   * what a trial→paid conversion does. `undefined` leaves it untouched.
   */
  expiresAt?: string | null;
}

/**
 * Patch tier / scopes / expiry on an existing record **in place**, keeping the
 * same `clientId` and `secretHash` so the client's credentials keep working.
 * Returns `null` when the client does not exist.
 *
 * This exists because the admin API was GET/POST/DELETE only, so changing a
 * tier meant delete-and-recreate — i.e. handing the client a new credential for
 * an administrative change. Conversion at the end of a trial is exactly that
 * case (BL-155 Slice 1).
 */
export async function updateM2mClient(
  kv: KVNamespace,
  clientId: string,
  input: UpdateM2mClientInput
): Promise<M2mClientRecord | null> {
  const existing = await getM2mClient(kv, clientId);
  if (!existing) return null;

  const updated: M2mClientRecord = {
    ...existing,
    ...(input.tier !== undefined ? { tier: input.tier } : {}),
    ...(input.allowedScopes !== undefined ? { allowedScopes: input.allowedScopes } : {}),
  };
  if (input.expiresAt === null) delete updated.expiresAt;
  else if (input.expiresAt !== undefined) updated.expiresAt = input.expiresAt;

  const expiration = reapExpirationFor(updated);
  await kv.put(
    `${M2M_CLIENT_KEY_PREFIX}${clientId}`,
    JSON.stringify(updated),
    expiration ? { expiration } : undefined
  );
  return updated;
}

export async function getM2mClient(
  kv: KVNamespace,
  clientId: string
): Promise<M2mClientRecord | null> {
  const raw = await kv.get(`${M2M_CLIENT_KEY_PREFIX}${clientId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as M2mClientRecord;
  } catch {
    return null;
  }
}

export async function listM2mClients(kv: KVNamespace): Promise<M2mClientRecord[]> {
  const listed = await kv.list({ prefix: M2M_CLIENT_KEY_PREFIX });
  const records: M2mClientRecord[] = [];
  for (const key of listed.keys) {
    const raw = await kv.get(key.name);
    if (!raw) continue;
    try {
      records.push(JSON.parse(raw) as M2mClientRecord);
    } catch {
      /* skip corrupt record; admin list should not 500 on one bad row */
    }
  }
  return records;
}

export async function deleteM2mClient(kv: KVNamespace, clientId: string): Promise<void> {
  await kv.delete(`${M2M_CLIENT_KEY_PREFIX}${clientId}`);
}

/** Constant-time secret check against the stored hash. */
export async function verifyM2mSecret(
  record: M2mClientRecord,
  providedSecret: string
): Promise<boolean> {
  const providedHash = await sha256Hex(providedSecret);
  return timingSafeEqual(providedHash, record.secretHash);
}

/** The keyOwner this client's tokens carry (bounded AE cardinality). */
export function keyOwnerFor(record: M2mClientRecord): string {
  return m2mKeyOwner(record.name);
}
