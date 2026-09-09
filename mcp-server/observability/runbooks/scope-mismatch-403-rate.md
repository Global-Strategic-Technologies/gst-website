# Runbook — `scope-mismatch-403-rate`

lastReviewedAt: 2026-09-09

**Trigger**: more than 5 scope-rejected (403) tool invocations per minute sustained over a 15-minute window (i.e. >75 in the window). Threshold provenance: design-doc attack-signal rule, carried into `observability/slo-baselines.md` § Phase 3 unblock criteria (signed off 2026-07-14). Severity: page — a valid bearer being used outside its scope grant is the strongest available signal of a leaked/replayed key.

**Data source**: AE SQL (`blob1='scope_denial'`, last 15 min) via the Worker's AE secrets. Fails open when unbound.

> **This rule could not fire before 2026-09-09 (BL-159).** It queried `blob1='tool_invocation' AND blob4='error' AND blob6='403'`, and was dead twice over: nothing writes `status_code` on `tool_invocation`, and the scope refusal emitted no AE event at all — only a `safeLog` line. It therefore reported a healthy `0 scope-mismatch 403s` on `/status` for its entire life, which is the most dangerous shape a monitoring defect can take, because a rule that cannot fire is indistinguishable from a rule with nothing to report. **Treat any pre-2026-09-09 quiet period as unmeasured, not as clean.** The fix added a `scope_denial` event emitted at BOTH denial paths — the plain-HTTP `/radar/snapshot` gate and the MCP `resources/read` gate. Found by executing the dashboard's SQL against production, not by review or by tests, which were green throughout.

## First 5 minutes

1. Identify the key: `Verify-AeEmission.ps1 -Env production -WindowHours 1` + `SELECT index1, blob2, sum(_sample_interval) FROM mcp_events WHERE blob1='scope_denial' AND timestamp >= NOW() - INTERVAL '1' HOUR GROUP BY index1, blob2` narrows which `keyOwner` is generating denials and which scope they are reaching for. `blob8` (`client_ref`) separates individual OAuth clients sharing a tier.
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
