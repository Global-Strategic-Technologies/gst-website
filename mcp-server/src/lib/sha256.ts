/**
 * SHA-256 hex digest — Worker-portable WebCrypto helper.
 *
 * Hoisted from `oauth/m2m-clients.ts` (BL-033 Slice 3a) so it can be shared
 * by the audit-log hash chain (`src/audit/`) without coupling the audit
 * surface to the OAuth module. `m2m-clients.ts` re-exports it, so existing
 * call sites are unchanged.
 *
 * `crypto.subtle` runs identically in the fetch handler, the queue consumer,
 * and Node/Vitest — no `node:crypto` dependency.
 */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
