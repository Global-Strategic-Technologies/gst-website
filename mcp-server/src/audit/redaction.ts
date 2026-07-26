/**
 * BL-033 Slice 3a — audit PII redaction + id minting.
 *
 * The audit AC (BACKLOG.md:262) requires the caller IP truncated for GDPR:
 * IPv4 last octet zeroed, IPv6 narrowed to its /48 routing prefix. Raw IPs
 * never enter the audit record and never reach a log (the `no-console` guard
 * on `src/auth/**` + structured `safeLog` is the house rule; audit follows it).
 */

/**
 * GDPR-truncate a caller IP. Returns `undefined` for null/empty/malformed
 * input (the header is absent off-Cloudflare, e.g. stdio / tests).
 *
 * - IPv4 `a.b.c.d` → `a.b.c.0` (last octet zeroed).
 * - IPv6 → the first three hextets (the /48 prefix) + `::` (drops interface +
 *   subnet identifiers, which is where household/device-level identity lives).
 */
export function truncateIp(ip: string | null | undefined): string | undefined {
  if (!ip) return undefined;
  const trimmed = ip.trim();
  if (!trimmed) return undefined;

  // IPv6 (contains a colon). CF-Connecting-IP may hand back a mapped or
  // compressed form; keep the leading /48 and re-anchor with `::`.
  if (trimmed.includes(':')) {
    const hextets = trimmed.split(':');
    // Reject obviously malformed input (need at least one group).
    if (hextets.length < 2) return undefined;
    const prefix = hextets.slice(0, 3).filter((h) => h.length > 0);
    if (prefix.length === 0) return undefined;
    return `${prefix.join(':')}::`;
  }

  // IPv4.
  const octets = trimmed.split('.');
  if (octets.length !== 4) return undefined;
  if (!octets.every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255)) return undefined;
  return `${octets[0]}.${octets[1]}.${octets[2]}.0`;
}

/** Per-HTTP-request correlation id. Thin wrapper so tests can spy/mock. */
export function newRequestId(): string {
  return crypto.randomUUID();
}

/** Per-invocation id — the audit chain's idempotency key. */
export function newEntryId(): string {
  return crypto.randomUUID();
}
