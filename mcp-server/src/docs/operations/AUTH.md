# MCP Server Authentication

> **Audience**: operator (engineer issuing/rotating bearer keys) + future maintainer auditing the auth surface.
>
> **Status**: BL-032 Phase 2 — bearer-token model in place; OAuth gates [BL-033](../../../../src/docs/development/BACKLOG.md#bl-033-mcp-server--external-pilot-phase-3).
>
> **Architecture & rationale**: [`MCP_SERVER_REMOTE_BL-032.md`](../../../../src/docs/development/MCP_SERVER_REMOTE_BL-032.md) (see Q11 / Q13).

---

## Bearer-token model

Every team member who needs remote MCP access gets a **single bearer token** stored as a Wrangler secret named `MCP_KEY_<INITIALS>`. The Worker's auth check on every non-health, non-preflight request:

1. Reads the inbound `Authorization: Bearer <token>` header
2. Compares the token value against every `MCP_KEY_*` secret on the `env` binding
3. On match → request proceeds; the matched secret's suffix (e.g. `MCP_KEY_RP` → `RP`) becomes the **key owner** logged on the request line
4. On miss → returns `401 Unauthorized` with a structured JSON body and `WWW-Authenticate: Bearer realm="gst-mcp"` header

The full token never appears in logs, error responses, or telemetry. The `keyOwner` string (`RP`, `AB`, etc.) is the attribution surface — stable across rotations, non-sensitive.

### Why bearer tokens, not OAuth (yet)

For an internal team of ≤10, `wrangler secret put` is the simplest safe revocation surface. OAuth 2.1 with PKCE is mandatory for **external** clients (BL-033) but adds an authorization-server dependency, browser-based consent UI, and PKCE flows that don't pay for themselves at this scale. See [BL-032 doc § Why API key, not OAuth](../../../../src/docs/development/BACKLOG.md#bl-032-mcp-server--internal-remote-phase-2) for the full rationale.

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

## Forward-looking — per-key scopes (BL-033)

BL-032 issues each key with the full tool/resource/prompt scope set. Per-key scope variation (e.g., a sales-associate teammate gets a key without `tool:radar:*`) is a [BL-032.5](../../../../src/docs/development/MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md) infrastructure concern (the catalog gets defined) and a [BL-033](../../../../src/docs/development/BACKLOG.md#bl-033-mcp-server--external-pilot-phase-3) product surface (per-client variation goes live). The bearer-token model carries forward unchanged — only the scope-checking layer at the request boundary changes.

---

_Last updated: 2026-05-04 (Phase 2)_
