/**
 * Worker environment bindings — deliberately housed OUTSIDE `worker.ts`.
 *
 * WHY THIS FILE EXISTS: `worker.ts:1` carries
 * `/// <reference types="@cloudflare/workers-types" />`. That directive loads
 * the package's `index.d.ts`, a GLOBAL SCRIPT which declares `Buffer`,
 * `process` and `global` at global scope (as `any`, `any`, and
 * `ServiceWorkerGlobalScope`), shadowing the `@types/node` versions. Reference
 * directives are program-wide, so ANY TypeScript program that reaches
 * `worker.ts` inherits the shadowing — silently, because `any` never errors.
 *
 * The website's root program reaches mcp-server through
 * `tests/integration/techpar-mcp-wizard-roundtrip.test.ts` → `tools/techpar.ts`
 * → … → `import type { Env }`. While `Env` lived in `worker.ts` that chain
 * dragged the poisoned globals into the Astro program. Housing `Env` here
 * severs the single inbound edge: nothing under `src/` imports from
 * `./worker` any more.
 *
 * `worker.ts` re-exports this type so the mcp-server test suite (which is not
 * in the root program) keeps importing `Env` from `../../src/worker`
 * unchanged. The boundary is enforced mechanically by
 * `tests/integration/mcp-root-program-boundary.test.ts`.
 *
 * Workers types are referenced here through a SCOPED `import type` from
 * `@cloudflare/workers-types`, which resolves to `index.ts` — a module, not a
 * global script, and therefore harmless. See ADR-0020.
 */

import type {
  AnalyticsEngineDataset,
  KVNamespace,
  Queue,
  R2Bucket,
} from '@cloudflare/workers-types';
import type { AuditEntry } from './audit/entry';

/**
 * Worker environment bindings.
 *
 * `MCP_KEY_<INITIALS>` secrets enumerate at runtime (see auth/bearer.ts) — the
 * `[key: string]: unknown` index signature lets the bearer module iterate any
 * additional `MCP_KEY_*` entries without requiring a typed declaration here.
 * Wrangler-issued secrets that are NOT bearer keys (Upstash, Inoreader,
 * Sentry) carry the typed declarations below.
 */
export interface Env {
  // Bearer keys — one per team member; enumerated at runtime via Object.entries
  // so this list doesn't need updating when a new MCP_KEY_<INITIALS> ships.
  // Listed explicitly only for the soak-week initial roster (Q11/Q13 — just RP).
  MCP_KEY_RP?: string;

  // BL-032.8 Phase 3 — narrow-scope bearer for the website's `/hub/radar`
  // SSR consumer. Carries only `resource:radar:read` via the companion
  // `MCP_KEY_WEBSITE_RADAR_SCOPES` env var (JSON-encoded scope array, per
  // bearer.ts:120 contract). Same key-discovery loop as the full MCP keys;
  // the scope subset narrows the grant. See:
  // mcp-server/src/docs/ARCHITECTURE.md § Bearer scope resolution (per-key subsets)
  MCP_KEY_WEBSITE_RADAR?: string;
  MCP_KEY_WEBSITE_RADAR_SCOPES?: string;

  // Upstash Redis — single MCP DB (post-BL-032.8 Phase B). All Inoreader-related
  // state (OAuth tokens, rate-limit counters, circuit breaker, status cache,
  // radar caches) lives under the `mcp:*` namespace in this database. The
  // historical website-shared "Inoreader DB" (`inoreader:*` keys, Read-Only
  // token, `UPSTASH_INOREADER_REST_*` bindings) was retired in Phase B
  // alongside the website's direct Inoreader client. See upstash-clients.ts.
  UPSTASH_MCP_REST_URL?: string;
  UPSTASH_MCP_REST_TOKEN?: string;

  // Inoreader OAuth — Worker is sole refresh-writer post-BL-032.8 Phase B.
  // `INOREADER_APP_ID` + `INOREADER_APP_KEY` identify the registered Inoreader
  // app to the OAuth endpoint. `INOREADER_ACCESS_TOKEN` /
  // `INOREADER_REFRESH_TOKEN` are env-var fallbacks for the Upstash-stored
  // tokens (read priority: `mcp:inoreader:*` MCP DB → these env vars).
  // See `inoreader-token-store.ts` for the read cascade.
  INOREADER_APP_ID?: string;
  INOREADER_APP_KEY?: string;
  INOREADER_ACCESS_TOKEN?: string;
  INOREADER_REFRESH_TOKEN?: string;
  // BL-047 T2 — Worker-served re-auth flow. Single registered redirect
  // URI per Inoreader-tier constraint; production-only. Bound via
  // `wrangler secret put INOREADER_REDIRECT_URI --env production` to
  // `https://mcp.globalstrategic.tech/admin/inoreader/reauth/callback`.
  // Required for both `/oauth2/auth` URL minting AND the
  // `/oauth2/token` exchange POST body (OAuth 2.0 § 4.1.3 byte-exact
  // match — mismatch yields `invalid_grant`).
  INOREADER_REDIRECT_URI?: string;
  // BL-047 T2 — admin gate for the in-browser re-auth flow. Single
  // secret distinct from the `MCP_KEY_*` team-key family; team bearers
  // do NOT grant admin access. Operator types/pastes this into the
  // `/admin/inoreader/reauth/start` HTML form; constant-time compared.
  MCP_ADMIN_KEY?: string;

  // BL-033 Slice 2 — OAuth substrate. `OAUTH_KV` is the Workers KV
  // namespace backing @cloudflare/workers-oauth-provider (token/secret
  // hashes, grants, client records) plus our `mcp:oauth:m2m-client:*`
  // records and one-shot consent/jti nonces. `OAUTH_M2M_SIGNING_KEY`
  // signs the self-contained HS256 M2M access tokens (`mcp_m2m_*`).
  // `OAUTH_PROVIDER` is injected by the provider into handlers it
  // invokes (consent/default handler) — never bound via wrangler.
  OAUTH_KV?: KVNamespace;
  OAUTH_M2M_SIGNING_KEY?: string;

  // Sentry — new project for service:mcp-server (Q6).
  SENTRY_DSN?: string;

  // BL-032.75 Phase 3 — Analytics Engine SQL read access for the alert
  // evaluator cron. `CF_AE_TOKEN` is a Cloudflare API token scoped to
  // `Account | Account Analytics | Read` ONLY (mint per DEPLOY.md § C.X;
  // recommend a dedicated Worker mint, tracked as `gst-mcp-ae-read-worker`,
  // so operator + Worker tokens rotate independently). `CF_ACCOUNT_ID` is
  // the Cloudflare account id — treated as a secret to keep it out of the
  // repo. Both optional: when unbound, AE-backed alert rules fail open
  // (evaluate as non-breach with the gap recorded) and the Upstash/health
  // rules still run. Set via `wrangler secret put <NAME> --env production`.
  CF_AE_TOKEN?: string;
  CF_ACCOUNT_ID?: string;

  // Build provenance — short SHA injected by `scripts/deploy.mjs` via
  // `wrangler deploy --var GIT_SHA:<sha>`. Surfaced on /health so operators
  // can verify which commit is running on the edge after a deploy.
  // Falls back to 'unknown' when missing (e.g., local `wrangler dev` runs).
  GIT_SHA?: string;

  // Environment discriminator — `'staging'` / `'production'` (or `'dev'`
  // under `wrangler dev`). Bound in `wrangler.toml` per `[env.<name>]`
  // block. BL-041 follow-up: prepends this to per-deploy Upstash state
  // keys (e.g. `mcp:acl-selfcheck:result:<env>:<gitSha>`) so both envs
  // can share the MCP DB without their per-deploy state colliding.
  // Falls back to `'unknown'` when missing — keeps the key shape stable
  // for local runs but flags the gap in case env binding is forgotten.
  ENV_NAME?: string;

  // Sentry release identifier — injected by `scripts/deploy.mjs` via
  // `wrangler deploy --var SENTRY_RELEASE:<sha>`. Tells Sentry which
  // uploaded source-map bundle matches the running Worker so stack traces
  // resolve to original TypeScript instead of minified `dist/index.js`.
  // Matches GIT_SHA value by convention; separate Env field so the Sentry
  // SDK's `release` option reads from a Sentry-namespaced var.
  SENTRY_RELEASE?: string;

  // Deployed package.json version — injected by `scripts/deploy.mjs` via
  // `wrangler deploy --var VERSION:<v>` (BL-033 Slice 4). Surfaced on /health
  // + /status as the single source of truth for the running version. Falls
  // back to the `VERSION` literal in health.ts for local `wrangler dev` /
  // tests where this var is unbound — replacing the old hand-bumped-const
  // drift where /health reported a stale version while GIT_SHA was fresh.
  VERSION?: string;

  // Cloudflare Analytics Engine binding — typed-metric emission target
  // (BL-032.75 Phase 1). Bound per environment in wrangler.toml:
  //   - top-level (`wrangler dev`): dataset `mcp_events_dev`
  //   - env.staging: `mcp_events_staging`
  //   - env.production: `mcp_events`
  // When unbound (some test contexts), worker.ts falls back to a NoopSink
  // so emission becomes a no-op rather than throwing.
  METRICS?: AnalyticsEngineDataset;

  // BL-033 Slice 3a — compliance audit-log bindings. AUDIT_QUEUE is
  // intentionally UNBOUND in all envs since 2026-08-08 (ADR-0014: pipeline
  // deactivated until the first compliance-requiring client) → audit emission
  // is a no-op (fetch path skips the sink; the queue consumer never fires).
  // The optional types stay so re-enable is a config-only wrangler.toml
  // revert. AUDIT_R2 remains bound (historical chain; inert without a
  // consumer). See operations/AUDIT_LOG.md.
  //   - AUDIT_QUEUE: producer binding; the fetch handler enqueues one
  //     `AuditEntry` per tool call off the latency path.
  //   - AUDIT_R2: immutable/versioned bucket the queue consumer hash-chains
  //     entries into (`audit/<env>/<yyyy>/<mm>/<dd>/<paddedSeq>.json`).
  AUDIT_QUEUE?: Queue<AuditEntry>;
  AUDIT_R2?: R2Bucket;

  // Forward-compat: any additional MCP_KEY_* secrets get matched by name.
  [key: string]: unknown;
}
