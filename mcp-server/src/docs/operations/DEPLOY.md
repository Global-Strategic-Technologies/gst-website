# MCP Server Deploy Runbook

> **Status**: Phase 1 skeleton — only § 1 (Prereqs) is authored. Sections 2-10 land in their respective phases per the [BL-032 architecture doc § DEPLOY.md outline](../../../../src/docs/development/MCP_SERVER_REMOTE_BL-032.md#deploymd-outline-operator-step-by-step). Until the full runbook is in place, defer to that outline + the per-phase commit messages.
>
> **Audience**: operator (engineer running `wrangler deploy` against staging or production) + future maintainer. The team-member-consumer step-by-step lives at [`REMOTE_CLIENT_SETUP.md`](./REMOTE_CLIENT_SETUP.md) (lands Phase 2).

---

## 1. Prereqs (one-time)

These check-and-confirm steps happen ONCE per operator. After this section, the operator can run `wrangler deploy --env staging|production`.

### 1.1 Cloudflare account access

- [ ] You have a Cloudflare account with Workers enabled. Free tier is sufficient for BL-032 traffic volumes (BACKLOG: ~100k req/day on free tier covers any plausible team usage). Paid plan becomes necessary for [BL-032.5](../../../../src/docs/development/MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md)'s Cron Triggers; for BL-032 itself, free tier is fine
- [ ] `wrangler whoami` resolves to your Cloudflare email — if not, run `wrangler login` (browser-based OAuth flow)
- [ ] You have `Edit Cloudflare Workers` permission on the account that owns `globalstrategic.tech` — confirm via the Cloudflare dashboard's **Account Members** page

### 1.2 DNS zone ownership

- [ ] The `globalstrategic.tech` zone is on Cloudflare DNS (confirmed during BL-032 planning per [Q10](../../../../src/docs/development/MCP_SERVER_REMOTE_BL-032.md#q10-dns-provisioning--mcpglobalstrategictech--out-of-band)). The website's Vercel deployment is fronted by this same Cloudflare DNS
- [ ] You have access to the Cloudflare zone's **DNS** tab (needed in Phase 6 to add the `mcp.globalstrategic.tech` Worker custom-domain binding)

### 1.3 Upstash project access

- [ ] You have access to the Upstash Redis project that backs the website's ISR cache (Inoreader OAuth tokens + radar response cache). The same project is shared with the MCP Worker per [Q13's resolution](../../../../src/docs/development/MCP_SERVER_REMOTE_BL-032.md#q13-upstash-project-sharing-new). Access path: Vercel dashboard → Storage tab → click through to the linked Upstash project
- [ ] You can generate a new REST token in the Upstash console — Phase 4 issues an `mcp-worker`-scoped token (separate from the website's), stored as the `UPSTASH_REDIS_REST_TOKEN` Wrangler secret

### 1.4 Inoreader credentials access

- [ ] You can read the website's Vercel env vars containing the Inoreader OAuth credentials (`INOREADER_APP_ID`, `INOREADER_APP_KEY`, `INOREADER_ACCESS_TOKEN`, `INOREADER_REFRESH_TOKEN`). Access path: `vercel env pull` from the project directory, OR the Vercel dashboard → Project Settings → Environment Variables
- [ ] These values get **copied** (not shared) to the Worker via `wrangler secret put` in Phase 4. Both Vercel and Cloudflare end up holding the same values; the Worker is a **read-only** consumer of the OAuth tokens — token refresh remains the website's responsibility (see [Q4 / Q13 resolutions](../../../../src/docs/development/MCP_SERVER_REMOTE_BL-032.md#q4-inoreader-client-refactor--fork-or-generalize))

### 1.5 Sentry project

- [ ] A separate Sentry project exists for the MCP Worker (separate from the website's project, per [Q6](../../../../src/docs/development/MCP_SERVER_REMOTE_BL-032.md#q6-sentry-on-cloudflare-workers--sentrycloudflare-or-sentrynode)). Phase 5 wires the project's DSN as the `SENTRY_DSN` Wrangler secret; runtime errors are tagged `service:mcp-server`

### 1.6 Initial bearer-key roster

- [ ] Decide who gets a `MCP_KEY_<INITIALS>` secret issued at first deploy. BL-032 baseline is **just the operator** for the one-week soak; full team rollout happens after the soak proves the surface stable. Per-key naming convention is documented in [`AUTH.md`](./AUTH.md) (lands Phase 2)

### 1.7 Local validation gate

Before any `wrangler deploy`, verify locally:

```bash
cd mcp-server
npm test                         # all tests green (320+ vitest)
npm run typecheck                # tsc --noEmit clean
npx wrangler deploy --dry-run --env staging   # bundle builds successfully
```

If any of these fail, **do not deploy** — fix locally first.

---

## 2. Pre-deploy local checks (Phase 1+ — partial; full check sequence Phase 6)

> **Phase 1 status**: the local validation gate in § 1.7 is the only check needed for Phase 1. Sections 2-10 below are placeholders for the runbook content that lands as each subsequent phase ships.

## 3. Deploy to staging (Phase 6)

_Pending Phase 6 — deploy + soak._

## 4. Deploy to production (Phase 6)

_Pending Phase 6 — deploy + soak._

## 5. Add a new team-member key (Phase 2 / Phase 6)

_Phase 2 documents the bearer-token model in [`AUTH.md`](./AUTH.md); Phase 6 documents the operational onboarding sequence here._

## 6. Rotate a key (Phase 2 / Phase 6)

_Phase 2 documents the rotation runbook in [`AUTH.md`](./AUTH.md); Phase 6 references it here._

## 7. Rollback (Phase 6)

_Pending Phase 6 — once the staging→production deploy flow is established._

## 8. Tail and investigate

`wrangler tail --env production` (or `--env staging`) attaches to the Worker's structured-log stream in real time. Every authenticated request emits one JSON line via `safeLog`; failures emit additional context. Common patterns:

```bash
# Live tail — every event, formatted JSON one-per-line.
wrangler tail --env production

# Filter to a specific keyOwner:
wrangler tail --env production --search '"keyOwner":"RP"'

# Filter to failed auth bursts:
wrangler tail --env production --search '"event":"auth.failed"'

# Filter to rate-limit hits:
wrangler tail --env production --search '"event":"ratelimit.exceeded"'
```

Common fingerprints and what they mean:

| Log signature                                              | Means                                                                                              | First action                                                                                                                         |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `"event":"auth.failed","reason":"bearer-rejected"`         | Wrong/missing/stale token. Could be one user with a stale config OR a probe-and-bail attempt.      | Check Sentry for the alert rule "Bearer auth failure burst." If sustained from one keyOwner, ping that team-member to confirm config |
| `"event":"ratelimit.exceeded","reason":"tier=minute"`      | One key burst-called too fast. Per-minute (60) cap hit                                             | Usually self-recovers in 60s; check if the keyOwner has a runaway agent loop                                                         |
| `"event":"ratelimit.exceeded","reason":"tier=day"`         | One key consumed the full daily budget                                                             | Inspect what the user did; if legitimate, consider raising their cap (see RATE_LIMITS.md)                                            |
| `"event":"ratelimit.skipped","reason":"upstash-not-bound"` | Upstash creds missing or unreachable at request time                                               | Check Wrangler secrets; check Upstash status page                                                                                    |
| `"event":"mcp.request","success":false`                    | Tool invocation completed with a 4xx status. Most often: invalid input or tool-side error envelope | Check the structured `errorCode` field                                                                                               |
| Sentry: any `error.unhandled` from a Worker isolate        | Unexpected throw in handler code path                                                              | Check the stacktrace; usually indicates a bug. Capture, fix, ship                                                                    |
| `errorCode:"inoreader-rate-limit"`                         | Inoreader returned 429 — circuit breaker just opened                                               | See § 9 below                                                                                                                        |

`/health` reports the cached subsystem status (Q8 — never burns Inoreader budget). Useful as a pre-investigation sanity check:

```bash
curl https://mcp.globalstrategic.tech/health | jq
```

Surfaces `redis` reachability, last observed `inoreader` status (`ok` / `degraded` / `unknown`), `inoreaderObservedAt` timestamp, and the aggregate `ok` flag.

---

## 9. Inoreader budget recovery

The radar tools share a 6-hour global circuit breaker (Phase 3 substrate, Phase 4c trigger — see [RATE_LIMITS.md](./RATE_LIMITS.md) § Circuit breaker for the full design). When Inoreader returns 429:

1. The first radar-tool call to see it sets `mcp:radar:circuit-open` in Upstash with a 6h TTL
2. All subsequent radar-tool calls (any key) read the flag and return `503 Service Unavailable` with `Retry-After`
3. Non-radar tools are unaffected
4. The breaker auto-closes via TTL expiry — no manual intervention required for normal recovery

### When NOT to manually reset

If the breaker just opened, **don't reset it**. Inoreader's budget hasn't recovered; you'll trigger another 429 within seconds, burning more of the next day's budget. Wait for the TTL to expire.

### When manual reset is OK

Inoreader's status page reports the platform recovered within minutes (rare). The breaker would auto-close in 6h, but you want radar tools back ASAP.

```bash
# Connect to Upstash via the REST API or console and delete the key:
curl -X POST "$UPSTASH_REDIS_REST_URL/del/mcp:radar:circuit-open" \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN"
```

The next radar-tool call will hit Inoreader; if it succeeds, the breaker stays closed; if Inoreader still 429s, it re-opens with a fresh 6h TTL.

### When the budget itself is the problem

If radar tools 429 repeatedly across the team — and Inoreader's status page is fine — the issue is GST's daily budget exhaustion. Check the budget envelope in [`src/docs/hub/RADAR.md` § Budget envelope](../../../../src/docs/hub/RADAR.md):

- Website ISR: ~28 calls/day (Vercel-hosted, fixed at 6h ISR)
- MCP per-key: capped at 50/day per key by the rate-limiter
- BL-032.5 Cron snapshot (when shipped): ~24 calls/day

At typical usage, total is well under 200/day. If the per-key cap isn't sufficient (regularly hitting 50 mid-day for legitimate work), escalate to Inoreader's paid tier — the per-day ceiling raises cleanly without affecting any other operational decision.

---

## 10. Incident triage tree

A bounded decision tree for "the MCP is broken" reports. Walk through these in order:

1. **Is the Worker reachable at all?**
   - `curl https://mcp.globalstrategic.tech/health` — does it respond at all?
   - **5xx or timeout** → Worker isolate is crashing or Cloudflare's edge is having issues. Check Cloudflare's status page; check Sentry for unhandled exceptions; if needed, `wrangler rollback --env production` to the previous deploy
   - **200 with `ok: false`** → Worker is up but a subsystem is degraded. Continue to step 2

2. **Which subsystem is degraded?** Read the `/health` JSON:
   - `redis: 'degraded'` → Upstash unreachable or misconfigured. Check Upstash status; check Wrangler secrets via `wrangler secret list --env production`; verify `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set. Worker still serves auth + non-radar tools (rate-limit just falls open with a warning); radar tools may degrade when their cache writes fail
   - `inoreader: 'degraded'` → Last Inoreader call failed (429, 5xx, or timeout). See § 9 — usually circuit-breaker handling is correct; investigate if alerts surface this for >1 hour
   - `inoreader: 'unknown'` with no recent radar traffic → Not a problem. If radar traffic is expected and `inoreaderObservedAt` is null after 30+ min, something's wrong with the radar tools' status reporting (check Sentry)

3. **Are users seeing 401s but the operator confirms keys are configured?**
   - Possibly a key was deleted/rotated. Run `wrangler secret list --env production`; cross-reference your team-member-roster
   - If keys are present and correct, check `wrangler tail` for the specific 401 reason — `Missing Authorization header`, `Bearer scheme`, `Empty Bearer token`, or `Invalid Bearer token` each have different fixes

4. **Are users seeing 429s on legitimate work?**
   - One user → check their tool-call pattern; if they're authoring an agent loop, raise the budget temporarily or have them switch to `search_radar_offline` (stdio-only, doesn't count against the budget)
   - All users → see § 9 ("When the budget itself is the problem")

5. **Worker is up, subsystems are healthy, users still complain something doesn't work.**
   - Look at the actual MCP error envelopes the user is seeing — they carry structured `error` codes that map directly to causes in [USAGE_REMOTE.md](./REMOTE_CLIENT_SETUP.md#troubleshoot)
   - If the symptom is "wrong tool result" or "schema validation error," it's an MCP protocol or tool-handler bug. Reproduce locally with `wrangler dev`; check Sentry for relevant traces

### When to escalate

- **Sustained 5xx rate** (>1% over 15 min) → page oncall, consider `wrangler rollback`
- **Inoreader budget exhausted >24h** → escalate to paid Inoreader tier
- **Suspected key compromise** (one keyOwner shows traffic from unexpected origins) → rotate the key immediately per [AUTH.md § Rotate a key](./AUTH.md#rotate-a-key)
- **Cloudflare platform issues** → can't fix; communicate to users; Cloudflare's SLA covers it

The MCP server's blast radius is bounded — it's an internal tool, BL-033 hasn't shipped external clients yet, and nothing about the website depends on it. An outage is inconvenient, not contractual. That calculus changes when [BL-033](../../../../src/docs/development/BACKLOG.md#bl-033-mcp-server--external-pilot-phase-3) ships.

---

_Last updated: 2026-05-04 (Phase 5 — sections 8-10 authored)_
