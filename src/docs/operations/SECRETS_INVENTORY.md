# Secrets Inventory

> **Status**: living document — update on every secret add/rotate/retire.
> **Scope**: every secret/env-var that lives in Vercel, Cloudflare Workers, or Upstash for the website + MCP Worker.
> **Sister docs**:
>
> - [`mcp-server/src/docs/operations/BL-032_8_SOAK_GATE.md`](../../../mcp-server/src/docs/operations/BL-032_8_SOAK_GATE.md) — Phase B retirement window (active 2026-05-17 → 2026-05-24)
> - [`mcp-server/src/docs/operations/DEPLOY.md`](../../../mcp-server/src/docs/operations/DEPLOY.md) § A.3 — secret rotation procedure
> - [`security/SECURITY_HEADERS.md`](../security/SECURITY_HEADERS.md) — CSP allowlist (not secrets, but adjacent)

## Why this doc exists

During the BL-032.8 cutover the secret surface temporarily doubled: legacy `INOREADER_*` (website) and new `MCP_KEY_*` (Worker) live side-by-side until the 2026-05-24 PR #140 merge retires the legacy half. The "myriad" feeling is real but bounded — this doc is the single point of truth for what's where, what's load-bearing, and what retires when.

The post-Phase-B steady state is much smaller than today's mid-cutover snapshot suggests. See the [Post-Phase-B target state](#post-phase-b-target-state-after-2026-05-24) section.

---

## At-a-glance (mid-Phase-B, 2026-05-19)

| Secret                                                                                           | Vercel (website)                 | CF Worker (staging) | CF Worker (production) | Notes                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------ | -------------------------------- | ------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MCP_KEY_WEBSITE_RADAR`                                                                          | ✅ (sender) — all 3 envs         | ❌                  | ✅ (validator)         | **Must exist in 2 places** — two sides of the bearer check                                                                                                                                                                                                              |
| `MCP_KEY_<USER>` (per-developer)                                                                 | ❌                               | ❌                  | ✅                     | Per-developer bearer; Worker-only                                                                                                                                                                                                                                       |
| `MCP_KEY_OPENCLAW`                                                                               | ❌                               | ❌                  | ✅                     | Tool-only client; Worker-only                                                                                                                                                                                                                                           |
| `MCP_KEY_<USER>_SCOPES` (companion)                                                              | ❌                               | ❌                  | optional               | Narrow-scope grant override; only if non-default scopes needed                                                                                                                                                                                                          |
| `INOREADER_APP_ID`                                                                               | ⚠️ legacy — all 3 envs           | ✅                  | ✅                     | **Vercel copies retire 2026-05-24** (PR #140 cleanup)                                                                                                                                                                                                                   |
| `INOREADER_APP_KEY`                                                                              | ⚠️ legacy — all 3 envs           | ✅                  | ✅                     | **Vercel copies retire 2026-05-24**                                                                                                                                                                                                                                     |
| `INOREADER_ACCESS_TOKEN`                                                                         | ⚠️ legacy — all 3 envs           | ✅                  | ✅                     | **Vercel copies retire 2026-05-24**                                                                                                                                                                                                                                     |
| `INOREADER_REFRESH_TOKEN`                                                                        | ⚠️ legacy — all 3 envs           | ✅                  | ✅                     | **Vercel copies retire 2026-05-24**                                                                                                                                                                                                                                     |
| `INOREADER_REFRESH_SECRET`                                                                       | ⚠️ legacy — Production + Preview | ⚠️ legacy           | ⚠️ legacy              | **All copies retire 2026-05-24** — BL-039 fallback secret. Worker sends as Bearer; Vercel website validates incoming POSTs from Worker.                                                                                                                                 |
| `INOREADER_REFRESH_URL`                                                                          | n/a                              | ⚠️ wrangler.toml    | ⚠️ wrangler.toml       | **Retires 2026-05-24** — Worker reads it but the route gets deleted                                                                                                                                                                                                     |
| `UPSTASH_MCP_REST_URL`                                                                           | ❌                               | ✅                  | ✅                     | MCP-DB endpoint; Worker-only                                                                                                                                                                                                                                            |
| `UPSTASH_MCP_REST_TOKEN`                                                                         | ❌                               | ✅                  | ✅                     | MCP-DB write token                                                                                                                                                                                                                                                      |
| `UPSTASH_INOREADER_REST_URL`                                                                     | ❌                               | ⚠️ legacy           | ⚠️ legacy              | **Worker copies retire 2026-05-24** — legacy `gst-radar-tokens` DB read-only access. Never bound on Vercel directly.                                                                                                                                                    |
| `UPSTASH_INOREADER_REST_TOKEN`                                                                   | ❌                               | ⚠️ legacy           | ⚠️ legacy              | **Worker copies retire 2026-05-24**                                                                                                                                                                                                                                     |
| `KV_URL` / `KV_REST_API_URL` / `KV_REST_API_TOKEN` / `KV_REST_API_READ_ONLY_TOKEN` / `REDIS_URL` | ⚠️ legacy — all 3 envs           | ❌                  | ❌                     | Auto-named by the **Vercel Upstash integration** (set 70 days ago); these are how the website's old `inoreader/client.ts` reached the legacy `gst-radar-tokens` DB. **Vercel copies retire when the Upstash integration is disconnected (2026-05-26 post-merge step).** |
| `PUBLIC_SENTRY_DSN`                                                                              | ✅ — Production + Preview        | ❌                  | ❌                     | Website Sentry DSN (browser-readable, hence `PUBLIC_` prefix)                                                                                                                                                                                                           |
| `SENTRY_DSN`                                                                                     | ❌                               | ✅ (MCP prj)        | ✅ (MCP prj)           | Worker Sentry DSN — different Sentry project from website                                                                                                                                                                                                               |
| `SENTRY_AUTH_TOKEN`                                                                              | ✅ — Production (website)        | ❌ (BL-037)         | ❌ (BL-037)            | Build-time source-map upload. Website side already wired; MCP Worker side comes with BL-037.                                                                                                                                                                            |
| `SENTRY_ORG` / `SENTRY_PROJECT`                                                                  | ✅ — Production (website)        | ❌ (BL-037)         | ❌ (BL-037)            | Companion to `SENTRY_AUTH_TOKEN`; website side already wired                                                                                                                                                                                                            |
| `GOOGLE_ANALYTICS_ID`                                                                            | ✅                               | ❌                  | ❌                     | Website-only; baked at build                                                                                                                                                                                                                                            |
| `PUBLIC_*`                                                                                       | ✅ (varies)                      | ❌                  | ❌                     | Public-by-design vars (CDN URLs, feature flags); not secrets technically                                                                                                                                                                                                |

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

## Post-Phase-B target state (after 2026-05-24)

When PR #140 merges and the pre-merge operator tasks complete:

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

**Upstash** — sole MCP DB (`gst-mcp`); the legacy `gst-radar-tokens` DB is deleted 2026-05-26 (48h after PR #140 merge — see soak gate doc).

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

| Secret                          | Canonical store         | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Recovery if other stores drift                                          |
| ------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `MCP_KEY_WEBSITE_RADAR`         | Cloudflare Worker prod  | The Worker validates incoming bearer; Vercel mirrors it as the sender                                                                                                                                                                                                                                                                                                                                                                                           | `vercel env add` matching the Worker                                    |
| `MCP_KEY_<USER>` / `OPENCLAW`   | Cloudflare Worker prod  | Worker-only; no mirror to maintain                                                                                                                                                                                                                                                                                                                                                                                                                              | n/a                                                                     |
| `INOREADER_*` (Inoreader OAuth) | Cloudflare Worker prod  | Post-Phase-B the Worker is sole OAuth holder; refresh tokens rotate at Worker runtime                                                                                                                                                                                                                                                                                                                                                                           | Manual rotation via Inoreader dev console + `wrangler secret put`       |
| `UPSTASH_MCP_REST_*`            | Upstash console         | The DB regenerates tokens; Worker holds copies                                                                                                                                                                                                                                                                                                                                                                                                                  | Regenerate in Upstash → `wrangler secret put` both envs                 |
| `SENTRY_DSN` (each project)     | Sentry project settings | Sentry owns it; build env mirrors                                                                                                                                                                                                                                                                                                                                                                                                                               | Copy from Sentry → `vercel env add` / `wrangler secret put`             |
| `CLOUDFLARE_AE_READ_TOKEN`      | Cloudflare API tokens   | ❌ **Not yet minted** — BL-032.75 Phase 3 will mint. Read-only token for Account Analytics; consumed by Grafana / `/status` page to query `mcp_events`. Filed here pre-emptively so the inventory is the single source of truth when Phase 3 lands. Procedure documented in [`mcp-server/src/docs/operations/DEPLOY.md` § C.X — Analytics Engine SQL query](../../../mcp-server/src/docs/operations/DEPLOY.md#cx--analytics-engine-sql-query-bl-03275-phase-3). | Re-mint via Cloudflare dashboard → API Tokens (annual rotation cadence) |

**Rule of thumb**: if a Vercel and Worker value disagree, the Worker wins for shared-secret cases (`MCP_KEY_WEBSITE_RADAR`); the upstream provider wins for everything else (Sentry DSN, Upstash token, Inoreader OAuth).

---

## Decommission schedule

| Date           | Action                                                              | Vars removed                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **2026-05-24** | PR #140 merge + Vercel & Worker secret cleanup                      | **Vercel** (`vercel env rm` per env): `INOREADER_APP_ID`, `INOREADER_APP_KEY`, `INOREADER_ACCESS_TOKEN`, `INOREADER_REFRESH_TOKEN` (× 3 envs = 12) + `INOREADER_REFRESH_SECRET` (× 2 envs = 2) = **14 Vercel removals**. **Worker** (`wrangler secret delete --env <name>`): `INOREADER_REFRESH_SECRET` (× 2 envs = 2) + `UPSTASH_INOREADER_REST_URL` + `UPSTASH_INOREADER_REST_TOKEN` (× 2 envs = 4) = **6 Worker removals**. |
| **2026-05-26** | 48h post-merge gate: optional Vercel Upstash integration disconnect | **Vercel**: 5 vars from the Upstash integration (`KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `REDIS_URL`) × 3 envs = **15 removals** (handled by the integration disconnect, not individual `vercel env rm` calls). Upstash: **delete `gst-radar-tokens` database** entirely.                                                                                                             |
| TBD            | BL-037 Phase A delivery                                             | _Adds_ `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` to MCP Worker build env (website side is already wired).                                                                                                                                                                                                                                                                                                          |

Operator walkthrough for the 2026-05-24 cleanup: [`mcp-server/src/docs/operations/BL-032_8_SOAK_GATE.md` § Pre-merge operator tasks](../../../mcp-server/src/docs/operations/BL-032_8_SOAK_GATE.md#pre-merge-operator-tasks-run-on-2026-05-24-before-clicking-merge).

---

## Rotation procedure (generic)

Per-secret rotation steps live in [`mcp-server/src/docs/operations/DEPLOY.md`](../../../mcp-server/src/docs/operations/DEPLOY.md) § A.3. Summary of the generic flow:

1. Generate new value at the canonical store (Cloudflare for `MCP_KEY_*`; Upstash console for `UPSTASH_*`; Inoreader dev console for `INOREADER_APP_*`).
2. Push to every dependent store **in this order**: validators before senders. For `MCP_KEY_WEBSITE_RADAR`: update the Worker first (validator), then update Vercel (sender). Reverse order causes a window where the website sends the old key while the Worker only accepts the new one → website outage.
3. Confirm propagation by running the [active verification block in the soak gate doc](../../../mcp-server/src/docs/operations/BL-032_8_SOAK_GATE.md#active-verification-one-time-recommend-day-3-or-4).
4. Update this document if the secret set, location, or canonical store changed.

---

## Adding a new secret

1. Decide which stores need it (most often: only one).
2. If it's a **shared secret** (validator + sender), follow the rotation order rule above when first introducing it.
3. Add the secret via the appropriate `secret put` / `env add` command.
4. Add a row to the [at-a-glance table](#at-a-glance-mid-phase-b-2026-05-19).
5. If it's load-bearing for runtime, add an entry to the [Per-secret canonical detail](#source-of-truth-per-secret) section.

---

## Future work

- **BL-XXX-secret-sync** (proposed, not filed yet): a `scripts/secrets/sync.ts` driven from a source-of-truth file (encrypted in repo or 1Password / op-cli) that propagates each secret to its dependent stores. Eliminates manual fan-out for `MCP_KEY_WEBSITE_RADAR` and any future shared secrets. Estimated effort: 1-2 days. Trigger to prioritize: a second shared secret enters the system, or this doc has > 3 entries with `Vercel + Worker` columns.

- **`PUBLIC_*` audit**: confirm every `PUBLIC_*` var in Vercel is genuinely public-by-design (browser-readable). Add a check to lint pipeline that rejects unprefixed secret names in client-bundled code.

---

_Last updated: 2026-05-19 — created during BL-032.8 Phase B soak, Day 3. Initial draft was rewritten same-day against the authoritative `vercel env ls` + `wrangler secret list` output to correct several initial-draft misattributions (Vercel-side Upstash bindings are `KV__`+`REDIS*URL`from the Vercel Upstash integration, not`UPSTASH_INOREADER_REST\*_`; `INOREADER*FOLDER_PREFIX`was never bound on Vercel;`INOREADER_REFRESH_SECRET` is Production + Preview only; website-side Sentry source-map upload vars ARE already wired).*
