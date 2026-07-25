/**
 * keyOwner conventions for OAuth-authenticated callers (BL-033 Slice 2).
 *
 * `keyOwner` is the per-caller attribution string that flows through the
 * whole post-auth pipeline: rate-limiter buckets, AE metrics (blob3 /
 * index1), safeLog lines, Sentry tags. Static bearer keys derive it from
 * the secret name (`MCP_KEY_RP` → `RP`); OAuth paths derive it here.
 *
 * Cardinality is deliberately bounded (the traffic-spike alert evaluates
 * per-keyOwner, and AE index cardinality should stay roster-sized):
 *   - Authorization-code grants → `OAUTH:<userId>` where userId is the
 *     team-key owner who consented (e.g. `OAUTH:RP`). One bucket per
 *     person, regardless of how many clients they connect.
 *   - client_credentials (M2M) → `M2M:<clientName>`. One bucket per
 *     registered machine client.
 *
 * Note (also in AUTH.md onboarding runbook): a brand-new keyOwner has no
 * trailing 7-day mean, so its first busy hour above the traffic-spike
 * floor can fire the ticket-severity alert once — expected onboarding
 * behavior, not an incident; identical to a new static key.
 */

export function oauthKeyOwner(userId: string): string {
  return `OAUTH:${userId}`;
}

export function m2mKeyOwner(clientName: string): string {
  // Client names are operator-chosen at registration; normalize to a
  // compact uppercase token so AE dashboards group cleanly and the
  // string is shell/log-friendly.
  return `M2M:${clientName.toUpperCase().replace(/[^A-Z0-9_-]+/g, '_')}`;
}
