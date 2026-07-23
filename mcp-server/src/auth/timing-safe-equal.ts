/**
 * Timing-safe string equality — shared by bearer auth (`auth/bearer.ts`)
 * and admin auth (`admin/admin-auth.ts`).
 *
 * Manual constant-time XOR loop (no `crypto.subtle` involvement — the
 * workerd-only `crypto.subtle.timingSafeEqual` extension is unavailable
 * in the Node-env unit-test pool, and `crypto.subtle.digest` would force
 * async on the synchronous `authenticate()` path). Lengths are compared
 * BEFORE the loop because a length mismatch is itself a timing leak the
 * loop can't paper over; leaking length equality is the accepted
 * trade-off of this construction.
 *
 * Extracted from `admin/admin-auth.ts` (BL-047 T2) when the bearer path
 * adopted it for the BL-033 constant-time hardening AC — `auth` must not
 * depend on `admin`, so the shared primitive lives here.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
