/**
 * HMAC-SHA256 hex — Worker-portable WebCrypto helper (BL-155 Slice 2).
 *
 * The only prior HMAC use in this Worker is JWT-framed inside
 * `oauth/m2m-token.ts`; this is the generic form. First consumer: the
 * trial signup's per-visitor identity key, an HMAC of the full client IP.
 * Keyed rather than plain-hashed on purpose — an unkeyed SHA-256 of an IPv4
 * address is brute-forceable over the whole 2^32 space, so it would be a
 * pseudonym in name only.
 */

import { bytesToHex } from './sha256';

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToHex(new Uint8Array(sig));
}
