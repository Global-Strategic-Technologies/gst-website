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

## 8. Tail and investigate (Phase 5)

_Phase 5 ships structured logs + Sentry + the `wrangler tail` cookbook._

## 9. Inoreader budget recovery (Phase 3)

_Phase 3 ships the rate-limiter + circuit-breaker; recovery procedures land alongside._

## 10. Incident triage tree (Phase 5 / Phase 6)

_Pending the observability + deploy phases._

---

_Last updated: 2026-05-04 (Phase 1 skeleton)_
