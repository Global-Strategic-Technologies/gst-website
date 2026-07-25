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

import { timingSafeEqual } from '../auth/timing-safe-equal';
import { m2mKeyOwner } from './key-owner';

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
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
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
  };
  await kv.put(`${M2M_CLIENT_KEY_PREFIX}${clientId}`, JSON.stringify(record));
  return { record, clientSecret };
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
