# Secrets Inventory

> **Status**: living document — update on every secret add/rotate/retire.
> **Scope**: every secret/env-var that lives in Vercel, Cloudflare Workers, or Upstash for the website + MCP Worker.
> **Sister docs**:
>
> - [`mcp-server/src/docs/operations/_archive/BL-032_8_SOAK_GATE.md`](../../../mcp-server/src/docs/operations/_archive/BL-032_8_SOAK_GATE.md) — Phase B retirement window (ran 2026-05-17 → 2026-05-27, ✅ closed; archived 2026-05-31)
> - [`mcp-server/src/docs/operations/DEPLOY.md`](../../../mcp-server/src/docs/operations/DEPLOY.md) § A.3 — secret rotation procedure
> - [`security/SECURITY_HEADERS.md`](../security/SECURITY_HEADERS.md) — CSP allowlist (not secrets, but adjacent)

## Why this doc exists

During the BL-032.8 cutover the secret surface temporarily doubled: legacy `INOREADER_*` (website) and new `MCP_KEY_*` (Worker) lived side-by-side. Post-PR #140 (merged 2026-05-27) the legacy half is fully retired — Vercel `INOREADER_*` env vars removed, Worker `UPSTASH_INOREADER_REST_*` + `INOREADER_REFRESH_SECRET` bindings deleted, and the underlying `gst-radar-tokens` Upstash database decommissioned via the Vercel↔Upstash integration disconnect. The single-source-of-truth narrative below now reflects steady state.

See the [Post-Phase-B target state](#post-phase-b-target-state-achieved-2026-05-27) section.

---

## At-a-glance (post-Phase-B, 2026-05-27)

| Secret                                                                                           | Vercel (website)          | CF Worker (staging)   | CF Worker (production) | Notes                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------ | ------------------------- | --------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MCP_KEY_WEBSITE_RADAR`                                                                          | ✅ (sender) — all 3 envs  | ❌                    | ✅ (validator)         | **Must exist in 2 places** — two sides of the bearer check                                                                                                                                                                                                                                                      |
| `MCP_KEY_<USER>` (per-developer)                                                                 | ❌                        | ❌                    | ✅                     | Per-developer bearer; Worker-only                                                                                                                                                                                                                                                                               |
| `MCP_KEY_OPENCLAW`                                                                               | ❌                        | ❌                    | ✅                     | Tool-only client; Worker-only                                                                                                                                                                                                                                                                                   |
| `MCP_KEY_<USER>_SCOPES` (companion)                                                              | ❌                        | ❌                    | optional               | Narrow-scope grant override; only if non-default scopes needed                                                                                                                                                                                                                                                  |
| `INOREADER_APP_ID`                                                                               | ❌ removed 2026-05-27     | ✅                    | ✅                     | Vercel copies removed 2026-05-27 (PR #140 closure). Worker retains as OAuth-app identity.                                                                                                                                                                                                                       |
| `INOREADER_APP_KEY`                                                                              | ❌ removed 2026-05-27     | ✅                    | ✅                     | Vercel copies removed 2026-05-27. Worker retains.                                                                                                                                                                                                                                                               |
| `INOREADER_ACCESS_TOKEN`                                                                         | ❌ removed 2026-05-27     | ✅                    | ✅                     | Vercel copies removed 2026-05-27. Worker retains as seed (Upstash MCP DB holds the runtime-refreshed value).                                                                                                                                                                                                    |
| `INOREADER_REFRESH_TOKEN`                                                                        | ❌ removed 2026-05-27     | ✅                    | ✅                     | Vercel copies removed 2026-05-27. Worker retains as seed.                                                                                                                                                                                                                                                       |
| `INOREADER_REDIRECT_URI`                                                                         | n/a                       | ❌                    | ✅                     | BL-047 T2 — production-only by Inoreader-tier constraint (single registered redirect URI). Value: `https://mcp.globalstrategic.tech/admin/inoreader/reauth/callback`. Required for both `/oauth2/auth` URL build AND `/oauth2/token` POST body (OAuth 2.0 byte-exact match)                                     |
| `MCP_ADMIN_KEY`                                                                                  | ❌                        | optional              | ✅                     | BL-047 T2 — admin gate for `/admin/inoreader/reauth/*`. Single secret distinct from the `MCP_KEY_*` team-key family; constant-time compared at the in-browser login form. Rotate via `wrangler secret put MCP_ADMIN_KEY --env production` (no downtime — only consulted on re-auth)                             |
| `INOREADER_REFRESH_SECRET`                                                                       | ❌ removed 2026-05-27     | ❌ removed 2026-05-27 | ❌ removed 2026-05-27  | All copies removed 2026-05-27 — BL-039 fallback secret obsoleted by Phase B.                                                                                                                                                                                                                                    |
| `INOREADER_REFRESH_URL`                                                                          | n/a                       | ❌ retired            | ❌ retired             | Removed from wrangler.toml in PR #140 — the route it pointed at was deleted.                                                                                                                                                                                                                                    |
| `UPSTASH_MCP_REST_URL`                                                                           | ❌                        | ✅                    | ✅                     | MCP-DB endpoint; Worker-only                                                                                                                                                                                                                                                                                    |
| `UPSTASH_MCP_REST_TOKEN`                                                                         | ❌                        | ✅                    | ✅                     | MCP-DB write token                                                                                                                                                                                                                                                                                              |
| `UPSTASH_INOREADER_REST_URL`                                                                     | ❌                        | ❌ removed 2026-05-27 | ❌ removed 2026-05-27  | Worker copies removed 2026-05-27 — legacy `gst-radar-tokens` DB access; the DB itself was decommissioned the same day via Vercel↔Upstash integration disconnect.                                                                                                                                                |
| `UPSTASH_INOREADER_REST_TOKEN`                                                                   | ❌                        | ❌ removed 2026-05-27 | ❌ removed 2026-05-27  | Worker copies removed 2026-05-27.                                                                                                                                                                                                                                                                               |
| `KV_URL` / `KV_REST_API_URL` / `KV_REST_API_TOKEN` / `KV_REST_API_READ_ONLY_TOKEN` / `REDIS_URL` | ❌ removed 2026-05-27     | ❌                    | ❌                     | Auto-named by the Vercel Upstash integration (set 78 days prior); reached the legacy `gst-radar-tokens` DB. Removed 2026-05-27 via integration disconnect (single dashboard action also deleted the underlying DB).                                                                                             |
| `PUBLIC_SENTRY_DSN`                                                                              | ✅ — Production + Preview | ❌                    | ❌                     | Website Sentry DSN (browser-readable, hence `PUBLIC_` prefix)                                                                                                                                                                                                                                                   |
| `SENTRY_DSN`                                                                                     | ❌                        | ✅ (MCP prj)          | ✅ (MCP prj)           | Worker Sentry DSN — different Sentry project from website                                                                                                                                                                                                                                                       |
| `SENTRY_AUTH_TOKEN`                                                                              | ✅ — Production (website) | ❌ (BL-037)           | ❌ (BL-037)            | Build-time source-map upload. Website side already wired; MCP Worker side comes with BL-037.                                                                                                                                                                                                                    |
| `SENTRY_ORG` / `SENTRY_PROJECT`                                                                  | ✅ — Production (website) | ❌ (BL-037)           | ❌ (BL-037)            | Companion to `SENTRY_AUTH_TOKEN`; website side already wired                                                                                                                                                                                                                                                    |
| `CF_AE_TOKEN`                                                                                    | ❌                        | ❌                    | ✅ (optional)          | BL-032.75 Phase 3 — AE SQL read token for the alert-evaluator cron (`Account \| Account Analytics \| Read`). Dedicated Worker mint (`gst-mcp-ae-read-worker`) separate from the operator pull token (`gst-mcp-ae-read`); rotate annually per DEPLOY.md § C.X. Optional: AE-backed rules fail open when unbound. |
| `CF_ACCOUNT_ID`                                                                                  | ❌                        | ❌                    | ✅ (optional)          | Companion to `CF_AE_TOKEN` — Cloudflare account id, treated as a secret to keep it out of the repo. Same optional/fail-open semantics.                                                                                                                                                                          |
| `GOOGLE_ANALYTICS_ID`                                                                            | ✅                        | ❌                    | ❌                     | Website-only; baked at build                                                                                                                                                                                                                                                                                    |
| `PUBLIC_*`                                                                                       | ✅ (varies)               | ❌                    | ❌                     | Public-by-design vars (CDN URLs, feature flags); not secrets technically                                                                                                                                                                                                                                        |

### Legend

- ✅ load-bearing — required for current code path
- ⚠️ legacy — present but slated for removal on the indicated date
- ❌ not bound to this store
- ❌ (PR #N) — was bound but removed by PR #N

---

## The one legitimate duplication

`MCP_KEY_WEBSITE_RADAR` lives in **both** Vercel env (website sends it as `Authorization: Bearer <key>` from SSR) and Cloudflare Worker secrets (Worker validates incoming requests against the matching value). This is a shared secret — both sides of a bearer-token check. It cannot be "deduplicated"; it can only be _auto-propagated_.

Today the propagation is manual. The mitigation backlog is captured in BL-XXX-secret-sync (see [Future work](#future-work)).

---

## Post-Phase-B target state (achieved 2026-05-27)

PR #140 merged 2026-05-27 and operator-side cleanup ran the same day. Current state:

**Vercel (website)** — total **1** MCP-related secret:

- `MCP_KEY_WEBSITE_RADAR` — the bearer the website sends to `mcp.globalstrategic.tech/radar/snapshot`

Plus website-specific (`GOOGLE_ANALYTICS_ID`, `PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` for website source-map uploads, other `PUBLIC_*` vars). **Zero `INOREADER_*` vars. Zero `KV_*` vars. Zero `REDIS_URL`.** The website is a pure downstream consumer of the Worker.

**Cloudflare Worker (production)** — sole Inoreader-OAuth holder, sole Upstash-MCP writer:

- `MCP_KEY_<USER>` × N (per-team-member bearers)
- `MCP_KEY_OPENCLAW`
- `MCP_KEY_WEBSITE_RADAR` (+ optional `_SCOPES` companion)
- `INOREADER_APP_ID`, `INOREADER_APP_KEY`, `INOREADER_REFRESH_TOKEN`, `INOREADER_ACCESS_TOKEN` (initial seed; refreshed at runtime)
- `UPSTASH_MCP_REST_URL`, `UPSTASH_MCP_REST_TOKEN`
- `SENTRY_DSN` (MCP project)

**Cloudflare Worker (staging)** — same shape minus the runtime cron (PR #143 removed `[env.staging.triggers]`).

**Upstash** — sole MCP DB (`gst-mcp`); the legacy `gst-radar-tokens` DB was decommissioned 2026-05-27 via the Vercel↔Upstash integration disconnect (single dashboard action removed the 5 `KV_*` / `REDIS_URL` env vars from Vercel AND deleted the underlying database — Vercel collapsed the two-step into one).

That's the steady state. From this point on, every secret in this table is single-purpose, lives in exactly one store (except `MCP_KEY_WEBSITE_RADAR`), and has a documented rotation procedure.

---

## Per-store: where each store lives and how to read/write

### Vercel (website env vars)

**Location**: Vercel Dashboard → `gst-website` project → **Settings → Environment Variables**, or via CLI from the website repo root.

**Read** (all envs, pulls to local file — _treat as secret_, delete after use):

```powershell
vercel env pull .env.vercel.local --environment=production --yes
(Select-String -Path .env.vercel.local -Pattern '^MCP_KEY_WEBSITE_RADAR=').Line
Remove-Item .env.vercel.local
```

**Write**:

```powershell
vercel env add MCP_KEY_WEBSITE_RADAR production
# Interactive: pastes value; prompts for environment.
```

**Remove**:

```powershell
vercel env rm MCP_KEY_WEBSITE_RADAR production
```

Vercel has three environments per project (`production`, `preview`, `development`) — each `vercel env` command targets one at a time. The website's runtime SSR uses `production`; PR previews use `preview`.

### Cloudflare Worker (wrangler secrets)

**Location**: stored on Cloudflare; managed via `wrangler` CLI from `mcp-server/`. Two envs: `staging`, `production`.

**Read** (lists secret names only — Cloudflare never returns values):

```powershell
Set-Location c:\Code\gst-website\mcp-server
npx wrangler secret list --env production
```

**Write** (interactive — prompts for value):

```powershell
npx wrangler secret put MCP_KEY_WEBSITE_RADAR --env production
```

**Remove**:

```powershell
npx wrangler secret delete MCP_KEY_WEBSITE_RADAR --env production
```

Non-secret variables (URLs, feature flags) live in `wrangler.toml` under `[env.<name>.vars]` and `[vars]` — those are checked into git. Anything sensitive must be a `secret`, never a `var`.

### Upstash (DB connection strings + tokens)

**Location**: Upstash console → Redis → `gst-mcp` DB (the only DB post-Phase-B) → **REST** tab.

Two endpoints:

- `UPSTASH_REDIS_REST_URL` — the API URL
- `UPSTASH_REDIS_REST_TOKEN` — the bearer for that URL (multiple tokens supported; we use the default "primary" token)

These get _consumed_ by the Worker as `UPSTASH_MCP_REST_URL` / `UPSTASH_MCP_REST_TOKEN`. To rotate, regenerate the token in the Upstash console then `wrangler secret put` the new value to both envs.

Upstash tokens are bearer-style — anyone with the token has full DB access. Treat as production secrets.

### Sentry (DSN + auth token)

**DSN** (the runtime ingest URL): Sentry → Project → **Settings → Client Keys (DSN)**. One DSN per project. The website + MCP Worker use different Sentry projects (`gst-website` and `GST-MCP-SERVER`) so the DSNs differ — _this is correct_, not a duplication.

**Auth token** (build-time, for source-map upload): not bound yet. BL-037 Phase A will add `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` so source maps upload during `wrangler deploy`. Until then, MCP source maps don't upload — stack traces in Sentry remain minified.

---

## Source of truth per secret

When values disagree across stores (the situation that caused today's confusion), the table below says which store is canonical and how to recover the others.

| Secret                          | Canonical store         | Why                                                                                                                                                                                                                                                                                                                                                                                                                        | Recovery if other stores drift                                          |
| ------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `MCP_KEY_WEBSITE_RADAR`         | Cloudflare Worker prod  | The Worker validates incoming bearer; Vercel mirrors it as the sender                                                                                                                                                                                                                                                                                                                                                      | `vercel env add` matching the Worker                                    |
| `MCP_KEY_<USER>` / `OPENCLAW`   | Cloudflare Worker prod  | Worker-only; no mirror to maintain                                                                                                                                                                                                                                                                                                                                                                                         | n/a                                                                     |
| `INOREADER_*` (Inoreader OAuth) | Cloudflare Worker prod  | Post-Phase-B the Worker is sole OAuth holder; refresh tokens rotate at Worker runtime                                                                                                                                                                                                                                                                                                                                      | Manual rotation via Inoreader dev console + `wrangler secret put`       |
| `UPSTASH_MCP_REST_*`            | Upstash console         | The DB regenerates tokens; Worker holds copies                                                                                                                                                                                                                                                                                                                                                                             | Regenerate in Upstash → `wrangler secret put` both envs                 |
| `SENTRY_DSN` (each project)     | Sentry project settings | Sentry owns it; build env mirrors                                                                                                                                                                                                                                                                                                                                                                                          | Copy from Sentry → `vercel env add` / `wrangler secret put`             |
| `CLOUDFLARE_AE_READ_TOKEN`      | Cloudflare API tokens   | ✅ **Minted 2026-05-29** (Phase 1 verification — rotates annually). Read-only token for Account Analytics; consumed by `mcp-server/scripts/Verify-AeEmission.ps1` today and by Grafana / `/status` page when Phase 3 lands. Procedure: [`mcp-server/src/docs/operations/DEPLOY.md` § C.X — Analytics Engine SQL query](../../../mcp-server/src/docs/operations/DEPLOY.md#cx--analytics-engine-sql-query-bl-03275-phase-3). | Re-mint via Cloudflare dashboard → API Tokens (annual rotation cadence) |

**Rule of thumb**: if a Vercel and Worker value disagree, the Worker wins for shared-secret cases (`MCP_KEY_WEBSITE_RADAR`); the upstash provider wins for everything else (Sentry DSN, Upstash token, Inoreader OAuth).

---

## Upstash ACL users (BL-041)

The Worker's bound `UPSTASH_MCP_REST_TOKEN` is minted from a scoped ACL user, **not** the default admin token. The default token remains in 1Password as break-glass only — never bound to a Worker secret in steady state.

**Procedure for minting + rotating scoped tokens**: [`mcp-server/src/docs/operations/DEPLOY.md` § A.3.5 — Upstash ACL hardening](../../../mcp-server/src/docs/operations/DEPLOY.md#a35--upstash-acl-hardening-bl-041).

**ACL strings** (verified live against the Upstash console 2026-05-30 — see DEPLOY.md § A.3.5 "Upstash ACL parser limits" callout for the empirical deviations from documented Redis 7 syntax):

| Username           | Bound to             | Permissions (ACL string)                               | 1Password item                            |
| ------------------ | -------------------- | ------------------------------------------------------ | ----------------------------------------- |
| `default`          | Break-glass only     | Full admin (factory default)                           | "Upstash gst-mcp — default (break-glass)" |
| `mcp-worker-rw`    | Worker (both envs)   | `on ~mcp:* ~"" +@read +@write +@scripting -@dangerous` | "Upstash gst-mcp ACL — mcp-worker-rw"     |
| `mcp-readonly-ops` | Operator triage only | `on ~mcp:* +@read -@dangerous`                         | "Upstash gst-mcp ACL — mcp-readonly-ops"  |

The `~""` clause on `mcp-worker-rw` permits the empty-string sentinel that `@upstash/ratelimit` v2 sliding-window passes as `dynamicLimitKey` when `dynamicLimits` is disabled — required for the rate-limiter to function under the scoped token. See DEPLOY.md § A.3.5 for the technical rationale.

**Verification** (post-rotation): `mcp-server/scripts/Test-UpstashAcl.ps1` exit code 0 + `/health.aclSelfCheck.status: 'ok'` against the freshly deployed Worker. Both gate the rotation as complete.

### MFA enforcement log

> Operator Phase D of BL-041 — **✅ Completed 2026-05-30**. Upstash's account-level "MFA Requirement" setting is account-wide (not per-member); enabling it forces 2FA on every login for every team member regardless of SSO provider. Re-verify on every team-membership change (add/remove operator) — confirm the new member completes their TOTP setup before granting Upstash access.

| Date       | Scope                | Mechanism                                                | Verified by                                                                                                                      |
| ---------- | -------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-30 | Upstash account-wide | Account-level TOTP via Upstash "MFA Requirement" setting | RP — confirmed via Upstash console "Security Configuration Complete" panel: ✅ Setup Redis ACL + ✅ MFA Requirement both checked |

**Out of scope** (Upstash paid-plan features — not part of BL-041; may file as a separate ticket if BL-033 external pilot's compliance review requires them):

- IP Allowlist — restricts Upstash connections to listed source IPs. Cloudflare Workers don't have stable egress IPs, so this would require either a paid Cloudflare egress feature or moving to a Worker→Upstash architecture where the IP is fixed
- Protect Credentials — additional credential management features
- Encryption at Rest — substrate-level disk encryption
- SOC-2 — formal SOC-2 attestation tier

---

## Decommission schedule

| Date           | Status       | Action                                                                              | Vars removed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------- | ------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2026-05-27** | ✅ Completed | PR #140 merge + Vercel & Worker secret cleanup                                      | **Vercel** (`vercel env rm`): `INOREADER_APP_ID`, `INOREADER_APP_KEY`, `INOREADER_ACCESS_TOKEN`, `INOREADER_REFRESH_TOKEN`, `INOREADER_REFRESH_SECRET` — 5 distinct vars (Vercel's CLI removes from all environments per call; 5 calls cleared all 14 logical envvar+env entries). **Worker** (`wrangler secret delete --env <name>`): `INOREADER_REFRESH_SECRET` (× 2 envs = 2) + `UPSTASH_INOREADER_REST_URL` + `UPSTASH_INOREADER_REST_TOKEN` (× 2 envs = 4) = **6 Worker removals**.              |
| **2026-05-27** | ✅ Completed | Vercel↔Upstash integration disconnect (combined disconnect+DB-delete via dashboard) | **Vercel**: 5 vars from the Upstash integration (`KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `REDIS_URL`) × 3 envs auto-removed by the integration disconnect. **Upstash**: `gst-radar-tokens` database deleted in the same dashboard action (Vercel's UI now collapses disconnect+delete into one button when the integration has a single attached DB; safe to use given Phase B's `/health` had already confirmed substrate independence from the legacy DB). |
| TBD            | Pending      | BL-037 Phase A delivery                                                             | _Adds_ `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` to MCP Worker build env (website side is already wired).                                                                                                                                                                                                                                                                                                                                                                                 |

Operator walkthrough for the 2026-05-27 cleanup: [`mcp-server/src/docs/operations/_archive/BL-032_8_SOAK_GATE.md` § Pre-merge operator tasks](../../../mcp-server/src/docs/operations/_archive/BL-032_8_SOAK_GATE.md) (now closed; archived 2026-05-31 as historical reference).

---

## Rotation procedure (generic)

Per-secret rotation steps live in [`mcp-server/src/docs/operations/DEPLOY.md`](../../../mcp-server/src/docs/operations/DEPLOY.md) § A.3. Summary of the generic flow:

1. Generate new value at the canonical store (Cloudflare for `MCP_KEY_*`; Upstash console for `UPSTASH_*`; Inoreader dev console for `INOREADER_APP_*`).
2. Push to every dependent store **in this order**: validators before senders. For `MCP_KEY_WEBSITE_RADAR`: update the Worker first (validator), then update Vercel (sender). Reverse order causes a window where the website sends the old key while the Worker only accepts the new one → website outage.
3. Confirm propagation by running the [active verification block in the soak gate doc (archived)](../../../mcp-server/src/docs/operations/_archive/BL-032_8_SOAK_GATE.md#active-verification-one-time-recommend-day-3-or-4).
4. Update this document if the secret set, location, or canonical store changed.

---

## Adding a new secret

1. Decide which stores need it (most often: only one).
2. If it's a **shared secret** (validator + sender), follow the rotation order rule above when first introducing it.
3. Add the secret via the appropriate `secret put` / `env add` command.
4. Add a row to the [at-a-glance table](#at-a-glance-post-phase-b-2026-05-27).
5. If it's load-bearing for runtime, add an entry to the [Per-secret canonical detail](#source-of-truth-per-secret) section.

---

## Future work

- **BL-XXX-secret-sync** (proposed, not filed yet): a `scripts/secrets/sync.ts` driven from a source-of-truth file (encrypted in repo or 1Password / op-cli) that propagates each secret to its dependent stores. Eliminates manual fan-out for `MCP_KEY_WEBSITE_RADAR` and any future shared secrets. Estimated effort: 1-2 days. Trigger to prioritize: a second shared secret enters the system, or this doc has > 3 entries with `Vercel + Worker` columns.

- **`PUBLIC_*` audit**: confirm every `PUBLIC_*` var in Vercel is genuinely public-by-design (browser-readable). Add a check to lint pipeline that rejects unprefixed secret names in client-bundled code.

---

_Last updated: 2026-05-31 — BL-034 documentation cleanup pass (broken anchor fix + footer date refresh + soak-gate link rerouted through `_archive/`). Original draft 2026-05-19 during BL-032.8 Phase B soak Day 3, rewritten same-day against the authoritative `vercel env ls` + `wrangler secret list` output to correct several initial-draft misattributions (Vercel-side Upstash bindings are `KV__`+`REDIS*URL`from the Vercel Upstash integration, not`UPSTASH_INOREADER_REST\*_`; `INOREADER*FOLDER_PREFIX`was never bound on Vercel;`INOREADER_REFRESH_SECRET` is Production + Preview only; website-side Sentry source-map upload vars ARE already wired).*
