# MCP Server Authentication

> **Audience**: operator (engineer issuing keys, onboarding OAuth clients, running revocations) + future maintainer auditing the auth surface.
>
> **Status**: dual-auth — static bearer keys (BL-032 Phase 2) AND an embedded OAuth 2.1 authorization server with M2M client_credentials (BL-033 Slice 2, 2026-07-24). Decision record: [ADR-0008](../../../../src/docs/adr/0008-mcp-oauth-embedded-authorization-server.md).
>
> **Architecture & rationale**: [`ARCHITECTURE.md` § Auth, CORS & deploy topology](../ARCHITECTURE.md#auth-cors--deploy-topology).

---

## Bearer-token model

Every team member who needs remote MCP access gets a **single bearer token** stored as a Wrangler secret named `MCP_KEY_<INITIALS>`. The Worker's auth check on every non-health, non-preflight request:

1. Reads the inbound `Authorization: Bearer <token>` header
2. Compares the token value against every `MCP_KEY_*` secret on the `env` binding
3. On match → request proceeds; the matched secret's suffix (e.g. `MCP_KEY_RP` → `RP`) becomes the **key owner** logged on the request line
4. On miss → returns `401 Unauthorized` with a structured JSON body and `WWW-Authenticate: Bearer realm="gst-mcp"` header

The full token never appears in logs, error responses, or telemetry. The `keyOwner` string (`RP`, `AB`, etc.) is the attribution surface — stable across rotations, non-sensitive.

### How bearer keys relate to OAuth (BL-033 Slice 2)

Static keys are no longer the only credential — the Worker is also its own OAuth 2.1 authorization server (see § OAuth below) — but the key roster remains **the identity substrate**: the OAuth consent page authenticates a human by their `MCP_KEY_*` value, and OAuth grants are scope-bounded by that key. Static keys stay first-class forever for headless internal consumers (website radar SSR, the latency probe) and as the delegation credential. Nothing in this section changed behavior when OAuth landed — the static path is byte-identical (dual validation is cheap-first; see [ARCHITECTURE.md § Dual auth](../ARCHITECTURE.md#dual-auth-static-bearers--oauth-21-q11q13--bl-033)).

---

## Key-naming convention

| Form                 | Example                    | Meaning                                                                                                               |
| -------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `MCP_KEY_<INITIALS>` | `MCP_KEY_RP`               | One bearer token per team member. Initials are 2-3 uppercase letters; the suffix becomes the `keyOwner` log field     |
| Token VALUE          | _opaque, ≥32 chars random_ | The actual secret; set via `wrangler secret put` from a cryptographically-random source. Never visible after creation |

**Token-value generation** (operator runs this once when issuing a key):

```bash
# 32 random bytes, base64url-encoded (no padding) — ~43 chars
openssl rand -base64 32 | tr -d '=' | tr '/+' '_-'
```

Paste the output value when `wrangler secret put MCP_KEY_<INITIALS>` prompts. Communicate the value to the team member via the agreed-upon secure channel (1Password share, etc.) — never via email, Slack DM, or any other plaintext channel.

---

## Issuance runbook

### Issue a new key

```bash
cd mcp-server

# Stage + production are separate env namespaces. Set both if the team
# member should hit production directly; staging-only for soak-week
# onboarding.
wrangler secret put MCP_KEY_<INITIALS> --env staging
# Paste the generated token value at the prompt.

wrangler secret put MCP_KEY_<INITIALS> --env production   # only after soak
```

The Worker picks up the new secret on its next deploy or on cold-start of a new isolate. If you need it active immediately on already-running isolates, redeploy:

```bash
npm run deploy:staging        # re-deploys with the new env
```

### List active keys (names only)

```bash
wrangler secret list --env staging
wrangler secret list --env production
```

The list shows secret **names**; values are never retrievable after creation. Cross-reference with the team-member roster in your secure channel of record.

### Rotate a key

There's no `wrangler secret rotate` command — rotation is delete-then-put with a new value:

```bash
wrangler secret delete MCP_KEY_<INITIALS> --env staging
wrangler secret put    MCP_KEY_<INITIALS> --env staging
# Paste the NEW token value. Old token is now invalid; team member must
# update their client config with the new value.

# Repeat for --env production.
```

The team member's old token starts returning `401 Unauthorized` immediately. They update their Claude Desktop / Claude Code / etc. config with the new token; see [`REMOTE_CLIENT_SETUP.md`](./REMOTE_CLIENT_SETUP.md).

**When to rotate**:

- Suspected token compromise (pasted into the wrong channel, etc.) — IMMEDIATELY
- Team member offboarding — IMMEDIATELY (delete, no re-issue)
- Periodic prophylactic rotation — TBD; BL-032 ships with manual rotation only. Automated quarterly rotation is a [BL-033](../../../../src/docs/development/BACKLOG.md#bl-033-mcp-server--external-pilot-phase-3) operational concern

### Revoke a key (permanent)

```bash
wrangler secret delete MCP_KEY_<INITIALS> --env staging
wrangler secret delete MCP_KEY_<INITIALS> --env production
```

The team member's token starts returning 401 immediately. No re-issue.

---

## Attribution in logs

Every authenticated request emits a structured log line with `keyOwner` set to the matched secret's suffix:

```json
{
  "timestamp": "2026-05-04T19:58:26.123Z",
  "event": "mcp.request",
  "keyOwner": "RP",
  "path": "/mcp"
}
```

`wrangler tail --env production` surfaces this stream live. The full bearer-token value is **never** included in the log line — `keyOwner` is the only attribution surface.

Failed-auth requests log without `keyOwner`:

```json
{
  "timestamp": "...",
  "event": "auth.failed",
  "path": "/mcp",
  "status": 401,
  "reason": "bearer-rejected"
}
```

The `reason` field intentionally avoids leaking which auth check failed (missing header vs. wrong scheme vs. invalid token) — clients shouldn't be able to probe the auth implementation.

### Why log only the key-owner suffix, not a token prefix

The BACKLOG originally suggested logging `key=rp_...` (a few chars of the token value) for attribution. After review: the suffix (`RP`) is **better** than a prefix (`rp_...`) because:

- Stable across rotations — same team member, same `keyOwner`, even after the secret value changes
- Non-sensitive — the env-var name is not a secret
- Always present, regardless of how the operator generated the token value (no implicit naming convention to enforce)

The BACKLOG language is a holdover; this doc supersedes it.

---

## OAuth 2.1 — client onboarding & operations (BL-033 Slice 2)

The Worker serves its own OAuth surface: `/authorize` (consent), `/token`, `/.well-known/oauth-authorization-server` + `/.well-known/oauth-protected-resource` (discovery), `/oauth/introspect`, and the admin endpoints below. All admin endpoints are gated by `Authorization: Bearer <MCP_ADMIN_KEY>` — the same single admin credential as the Inoreader re-auth flow; team keys do NOT grant admin.

### Onboard a human-consent client (pre-registered)

For clients that can't use CIMD (Claude-family clients need no registration at all — their `client_id` is a metadata-document URL the AS fetches):

```bash
# Create — returns clientId + clientSecret (secret visible ONLY in this response)
curl -s -X POST https://mcp.globalstrategic.tech/admin/oauth/clients \
  -H "Authorization: Bearer $MCP_ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"clientName":"<display name>","redirectUris":["https://client.example/callback"]}'

# List / delete
curl -s https://mcp.globalstrategic.tech/admin/oauth/clients -H "Authorization: Bearer $MCP_ADMIN_KEY"
curl -s -X DELETE https://mcp.globalstrategic.tech/admin/oauth/clients/<clientId> -H "Authorization: Bearer $MCP_ADMIN_KEY"
```

The human then adds the connector in their client; at the consent page they authenticate with their `MCP_KEY_*` value. **Issue external pilots their own narrow key first** (this section's runbooks + a `MCP_KEY_<X>_SCOPES` subset) — the key's scopes are the ceiling on every grant they can approve.

### Onboard an M2M client (headless client_credentials)

**Normal path**: `npm run provision:client -- --name "<client>" --tier free-pilot` from `mcp-server/` — it wraps this endpoint, requires an explicit tier, validates scopes against the advertised catalog, gates radar behind `--allow-radar`, and prints the onboarding email. See [PILOT_ONBOARDING.md § 1](PILOT_ONBOARDING.md). The raw contract below stays here as the reference — and is still the way to register a JWKS, which the script does not do.

```bash
curl -s -X POST https://mcp.globalstrategic.tech/admin/oauth/m2m-clients \
  -H "Authorization: Bearer $MCP_ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"name":"<client-name>","allowedScopes":["tool:*","resource:regulations:read"],"tier":"free-pilot","jwks":{"keys":[<ES256 public JWK, optional>]}}'
```

Deliver the returned `clientId` + `clientSecret` via the secure channel (or skip the secret entirely: register their ES256 public key and have them authenticate with RFC 7523 `private_key_jwt` assertions — preferred). Their pipeline then exchanges at `/token` with `grant_type=client_credentials` for a 1-hour `mcp_m2m_*` token (no refresh token — re-exchange on expiry; the official MCP SDKs' `ClientCredentialsProvider` handles this).

`allowedScopes` is the hard ceiling; radar access requires explicitly granting `tool:radar:*` / `resource:radar:read` (deliberately excluded from typical pilot grants).

**Optional `expiresAt`** (ISO-8601, BL-155): after that instant `/token` refuses the client with `invalid_client`. Omitted means never expires — every client provisioned before BL-155 has none. A time-boxed record is garbage-collected from KV 30 days after `expiresAt` (`REAP_GRACE_SECONDS` in `src/oauth/m2m-clients.ts`), long enough that a conversion or support question still finds it; the reap is derived from `expiresAt` on every write, never supplied.

### Change an M2M client's tier, scopes or expiry (in place)

```bash
# Convert a trial to paid: tier up, expiry cleared (null) — same clientId + secret keep working
curl -s -X PATCH https://mcp.globalstrategic.tech/admin/oauth/m2m-clients/<clientId> \
  -H "Authorization: Bearer $MCP_ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"tier":"paid","expiresAt":null}'
```

Any subset of `tier`, `allowedScopes`, `expiresAt` (string sets, `null` clears). `clientId` and the secret are untouched, so this is the right tool for every administrative change that is not a revocation — before BL-155 the only option was delete-and-recreate, which handed the client a new credential. `allowedScopes` is validated against the advertised catalog here (stricter than `POST`, which leaves that to the provisioning script). **The new `tier` and scopes reach the client at its next `/token` exchange** — tokens already minted carry the old claims until they lapse (≤1h), the same residual as revocation.

### Introspect a token (support/debugging)

```bash
curl -s -X POST https://mcp.globalstrategic.tech/oauth/introspect \
  -H "Authorization: Bearer $MCP_ADMIN_KEY" \
  --data-urlencode "token=<the token>"
# → {"active":true,"client_id":...,"scope":...,"exp":...} or {"active":false}
```

RFC 7662 semantics: every token problem (unknown, expired, revoked, malformed) is `{"active":false}` with 200 — no oracle. A revoked M2M client's not-yet-expired token reports inactive (record cross-check).

### Revoke OAuth access

| Target                     | Action                                                                                        | Effect                                                                                                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One human's grants         | Rotate/delete their `MCP_KEY_*` (runbooks above)                                              | Existing access tokens live ≤1h; refresh continues until the grant is replaced — for immediate kill also delete the client or have them re-consent (new grants revoke old ones per user+client) |
| One pre-registered client  | `DELETE /admin/oauth/clients/<id>`                                                            | Grants orphan; tokens die at access-token expiry (≤1h)                                                                                                                                          |
| One M2M client             | `DELETE /admin/oauth/m2m-clients/<id>`                                                        | Re-issuance blocked immediately; minted tokens carry ≤1h residual (introspection already reports them inactive)                                                                                 |
| ALL M2M tokens (emergency) | Rotate `OAUTH_M2M_SIGNING_KEY` (`wrangler secret put ... --env production`, new random value) | Every `mcp_m2m_*` token dies at the next isolate pickup                                                                                                                                         |

### Operational notes

- A newly onboarded `OAUTH:<user>` or `M2M:<NAME>` keyOwner has no trailing 7-day mean in Analytics Engine, so its first busy hour above the traffic-spike floor can fire the ticket-severity alert once — expected onboarding behavior, not an incident (same as any new static key; see the traffic-spike runbook).
- Per-client `tier` is stored on M2M records **and enforced** — tier-based rate-limit ceilings shipped in BL-033 Slice 5 (2026-07-26). See [RATE_LIMITS.md](RATE_LIMITS.md) / [ADR-0010](../../../../src/docs/adr/0010-per-client-rate-limit-tiers.md).

---

## Per-key scopes (resolved by BL-033 Slice 2)

Per-key/per-client scope variation is live across all three credential paths: `MCP_KEY_<OWNER>_SCOPES` env-var subsets for static keys, requested-∩-key-scopes for OAuth grants, and `allowedScopes` for M2M clients — one catalog, one wildcard-aware checker (see [`ARCHITECTURE.md` § Scope gating](../ARCHITECTURE.md#scope-gating)).

---

_Last updated: 2026-09-06 (BL-155 Slice 1 — `expiresAt` on M2M clients and the in-place `PATCH` runbook)_
