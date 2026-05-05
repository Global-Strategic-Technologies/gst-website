# Remote MCP Client Setup

> **Audience**: GST team member (consumer) who wants to use the GST MCP server from a Claude / Cursor / ChatGPT client running on any machine.
>
> **Status**: BL-032 Phase 2 skeleton — bearer-token auth is in place; the remote URL still points at staging because [Phase 6 deploy](../../../../src/docs/development/MCP_SERVER_REMOTE_BL-032.md#phase-6--staging--production-deploy--verification-05-day--soak) has not run yet. The production URL (`mcp.globalstrategic.tech`) replaces the staging URL throughout this doc when Phase 6 ships.
>
> **For operators issuing keys**: see [`AUTH.md`](./AUTH.md). This doc is for the people RECEIVING those keys.

---

## TL;DR — three steps

1. **Get your key from the operator**: a token value paired with a `MCP_KEY_<INITIALS>` name, delivered via your team's agreed secure channel (1Password share, etc.)
2. **Paste the per-client config snippet below** — pick your client; copy the snippet; paste your token value where indicated
3. **Restart the client; run a smoke prompt** — see § Verify the connection

If anything goes wrong, jump to § Troubleshoot.

---

## 1. Get your API key (one-time)

Your token arrives from the operator as:

- A **name** like `MCP_KEY_RP` (the `RP` suffix is your initials — that's the `keyOwner` your requests will show up as in logs)
- A **value** like `aB3xK9...` (~43 random chars; the actual secret)

**Storage**:

- ✅ 1Password / system keychain / encrypted secret manager
- ❌ Plaintext in `~/.bashrc`, a local note file, your shell history, Slack
- ❌ A `.mcp.json` checked into git — `.mcp.json` files at the repo root are tracked by Claude Code; if your token is in one, it ends up in commit history

If you lose the token, ask the operator to rotate it (see [`AUTH.md`](./AUTH.md) § Rotate a key). Don't just request a new one alongside the old — rotate so the lost one is invalidated.

---

## 2. Paste the per-client config

The MCP endpoint URLs:

| Environment | URL                                                              | Status |
| ----------- | ---------------------------------------------------------------- | ------ |
| Staging     | `https://mcp-staging.globalstrategic.tech/mcp` _(Phase 6 wires)_ | TBD    |
| Production  | `https://mcp.globalstrategic.tech/mcp` _(Phase 6 wires)_         | TBD    |

For Phase 2 (now), the only way to exercise the remote setup is via local `wrangler dev`:

```bash
cd mcp-server
npm run dev:worker
# Worker now serves at http://localhost:8787 (or whatever wrangler picks)
```

Use `http://localhost:<port>/mcp` in the snippets below until the Phase 6 URLs land.

### Claude Desktop (macOS)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gst-tools-remote": {
      "url": "https://mcp.globalstrategic.tech/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}
```

### Claude Desktop (Windows)

Edit `%APPDATA%\Claude\claude_desktop_config.json` — same JSON shape as macOS. The path resolves to something like `C:\Users\<you>\AppData\Roaming\Claude\claude_desktop_config.json`.

### Claude Code (project-level)

Edit `.mcp.json` at the repo root:

```json
{
  "mcpServers": {
    "gst-tools-remote": {
      "url": "https://mcp.globalstrategic.tech/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}
```

> ⚠️ Don't commit `.mcp.json` if it contains your token. Either git-ignore it or use the user-level config below.

### Claude Code (user-level)

Edit `~/.claude/settings.json`'s `mcpServers` entry — same shape as project-level. This config is per-user and stays out of git.

### Cursor

Edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "gst-tools-remote": {
      "url": "https://mcp.globalstrategic.tech/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}
```

### ChatGPT (web)

ChatGPT supports remote MCP via its **Connectors** UI (Settings → Connectors → Add custom connector). Provide:

- **URL**: `https://mcp.globalstrategic.tech/mcp`
- **Auth header**: `Authorization: Bearer YOUR_TOKEN_HERE`

ChatGPT handles the connector handshake; once registered, the GST tools appear in its tool picker.

### Claude mobile

Mobile MCP support is platform-specific and may evolve; check the latest Claude mobile app's "Custom integrations" or "MCP" settings panel. Same URL + Authorization header pattern.

---

## 3. Verify the connection

Restart your client. On startup it'll attempt the MCP handshake against the configured URL.

**Quick smoke test**: ask the model to list available tools — if the GST surface registers, you'll see entries like `generate_diligence_agenda`, `search_portfolio`, `compute_techpar`, etc.

**Tool exercise**: paste this prompt into a fresh thread —

> Search GST's portfolio for healthcare engagements that touched RCM or PHI handling.

The model should call `mcp__gst__search_portfolio` and return matching anonymized engagements. If you see the tool call happen and a result come back, you're connected end-to-end.

---

## Troubleshoot

| Symptom                                                    | Likely cause                                                                                                                                    | Fix                                                                                                                                                                                             |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool list empty / no GST tools appear                      | Client didn't reach the MCP endpoint at all. Check spelling of the URL; check `Authorization` header is present in the snippet                  | Re-paste the config; restart the client. Check your client's MCP debug log if it has one                                                                                                        |
| `401 Unauthorized` on every tool call                      | Wrong / expired / mistyped token; or the operator rotated your key without telling you                                                          | Verify the token value in your config matches the value the operator gave you. If you're sure it does, ask the operator to confirm the key is still active (see `AUTH.md` § List active keys)   |
| `403 Forbidden` (Phase 5+)                                 | Your key lacks a scope that the request needs. Phase 2 always grants full scope; this only applies once BL-032.5+ ships per-key scope variation | Ask the operator to broaden your scope or use a different key. The 403 body's `missingScope` field names the missing entry                                                                      |
| `429 Too Many Requests`                                    | You hit a per-key rate limit. Phase 3 limits: 60 req/min and 1000 req/day for non-radar tools; 5 req/min and 50 req/day for radar tools         | Wait for the `Retry-After` window (returned in headers). If you're hitting limits doing legitimate work, escalate — see § When to escalate                                                      |
| `503 Service Unavailable` on radar tools                   | Inoreader API is degraded; the global circuit breaker is open. Cached results return where possible; missing-cache returns 503                  | Wait the `Retry-After` window (default 6h). Use the offline radar tool (`search_radar_offline`) if you have a local stdio MCP installed too                                                     |
| `502 Bad Gateway` / Cloudflare error page                  | Upstream (Worker isolate) crashed                                                                                                               | Retry; if persistent, escalate to operator. Check Cloudflare's status page                                                                                                                      |
| Browser console: `No 'Access-Control-Allow-Origin' header` | Your client's browser fetches from an origin that's not on the allowlist                                                                        | If you're using a web client (claude.ai, ChatGPT web), the origin is fixed. If you're an in-browser developer, the operator can add your origin to `mcp-server/src/auth/cors.ts` after auditing |

---

## Rate-limit etiquette

Full reference — per-key budget table, RFC 9331 response-header guide, circuit-breaker semantics, "what to do when 429'd" decision tree — lives in [`RATE_LIMITS.md`](./RATE_LIMITS.md). Skim it once during setup; it pays for itself the first time you see a 429.

Quick-reference summary:

| Tool family   | Per-minute | Per-day | Status                                       |
| ------------- | ---------- | ------- | -------------------------------------------- |
| General tools | 60         | 1000    | ✅ Phase 3 (active)                          |
| Radar tools   | 5          | 50      | ⏳ Phase 4 (activated when radar tools ship) |

---

## When to escalate

Contact the operator (see your team's escalation channel) when:

- You suspect your key was compromised — pasted into the wrong place, etc. → operator rotates immediately
- You're hitting rate limits doing legitimate work that the budgets don't accommodate → operator weighs adjusting the limits or escalating Inoreader's plan
- A persistent 5xx error suggests the Worker is down → operator checks `wrangler tail` + Sentry
- You suspect the production endpoint is degraded (slow, intermittent failures) → operator pulls metrics + runs incident triage (see [`DEPLOY.md`](./DEPLOY.md) § Incident triage)

---

_Last updated: 2026-05-04 (Phase 2 skeleton — production URL placeholder; Phase 6 fills in the real values)_
