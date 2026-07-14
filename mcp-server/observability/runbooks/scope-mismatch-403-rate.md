# Runbook — `scope-mismatch-403-rate`

lastReviewedAt: 2026-07-14

**Trigger**: more than 5 scope-rejected (403) tool invocations per minute sustained over a 15-minute window (i.e. >75 in the window). Threshold provenance: design-doc attack-signal rule, carried into `observability/slo-baselines.md` § Phase 3 unblock criteria (signed off 2026-07-14). Severity: page — a valid bearer being used outside its scope grant is the strongest available signal of a leaked/replayed key.

**Data source**: AE SQL (`blob1='tool_invocation' AND blob4='error' AND blob6='403'`, last 15 min) via the Worker's AE secrets. Fails open when unbound.

## First 5 minutes

1. Identify the key: `Verify-AeEmission.ps1 -Env production -WindowHours 1` + an AE query grouped by `index1` narrows which `keyOwner` is generating 403s.
2. Distinguish the two causes:
   - **Leaked/probing key** — a narrow-scope bearer (e.g. `MCP_KEY_WEBSITE_RADAR`, radar-read-only) invoking non-radar tools. This is the attack case.
   - **Deployment skew** — a legitimate client whose expected scopes were tightened in a recent deploy (check `git log` on `auth/scopes.ts` / recent BREAKING_CHANGES entries).
3. Check `wrangler tail` for the `auth.scope-rejected` safeLog lines (path + tool detail).

## Recovery

- Attack case: rotate the implicated key immediately (`wrangler secret put MCP_KEY_<X> --env production`); for the website radar key also update the Vercel env binding (see `src/docs/operations/SECRETS_INVENTORY.md`).
- Skew case: restore the scope grant or ship the client-side migration; the 403s stop on their own.
- Either way the 403s themselves are the system working — nothing was accessed.

## Escalation

Operator (RP). Sustained unattributable probing → consider Cloudflare WAF rules at the zone level.
