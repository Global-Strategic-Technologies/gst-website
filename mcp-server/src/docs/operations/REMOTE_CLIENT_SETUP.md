# Remote MCP Client Setup

> **Audience**: GST team member (consumer) who wants to use the GST MCP server from a Claude / Cursor / ChatGPT client running on any machine.
>
> **Status**: BL-032 production deploy shipped 2026-05-12. The canonical URL is now `https://mcp.globalstrategic.tech/mcp`. Staging (`https://mcp-staging.globalstrategic.tech/mcp`) remains for testing changes before they reach production — most consumers should point at production.
>
> **For operators issuing keys**: see [`AUTH.md`](./AUTH.md). This doc is for the people RECEIVING those keys.
>
> **Verifying that the server actually works once connected?** That is the [UAT suite](../testing/uat/README.md) — per-capability walkthroughs with expected results and run logs. Its [`SETUP.md`](../testing/uat/SETUP.md) sequences credential → connection → first tool call, and links back here for every client and troubleshooting detail this doc owns.

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

| Environment | URL                                            | Status                                      |
| ----------- | ---------------------------------------------- | ------------------------------------------- |
| Production  | `https://mcp.globalstrategic.tech/mcp`         | ✅ Live (deployed 2026-05-12) — use this    |
| Staging     | `https://mcp-staging.globalstrategic.tech/mcp` | ✅ Live — testing changes before production |

**Use the production URL unless you have a specific reason to use staging.** The snippets below all show the production URL; to point at staging, swap the host (`mcp` → `mcp-staging`) and rename the connector (e.g. `gst-mcp` → `gst-mcp-staging`).

### Claude Desktop (native Connectors — recommended)

> ✅ **The Worker speaks OAuth 2.1 natively (BL-033 Slice 2, 2026-07-24)** — Claude Desktop's Settings → Connectors UI now works directly. **The `mcp-remote` bridge is no longer required**; it remains documented in the legacy appendix below for existing configs, which keep working unchanged (dual auth — see [`ARCHITECTURE.md` § Dual auth](../ARCHITECTURE.md#dual-auth-static-bearers--oauth-21-q11q13--bl-033)).

1. **Settings → Connectors → Add custom connector**; enter `https://mcp.globalstrategic.tech/mcp` (no client ID/secret needed — Claude registers itself via CIMD).
2. A browser tab opens the Worker's consent page. **Paste your `MCP_KEY_*` value** (from your password manager) into the key field and click Approve — that one paste is how the grant knows who you are; your delegated access is bounded by your key's scopes.
3. Done. Tokens are 1-hour and refresh silently; the same connector works on claude.ai web and mobile.

To revoke your own grant: re-add the connector (a new consent replaces the old grant) or ask the operator (revocation table in [`AUTH.md`](./AUTH.md)).

### Claude Desktop (legacy `mcp-remote` bridge)

The pre-OAuth setup. Still fully supported — do not migrate working configs unless you want the native UI.

#### Step 1 — Install the `mcp-remote` bridge globally

`mcp-remote` proxies a remote HTTP/SSE MCP server as a stdio process Claude Desktop can spawn. Pre-install it globally so Claude Desktop spawns it from npm's global bin (no `npx` indirection):

```bash
npm install -g mcp-remote
```

Verify install:

```bash
# bash / zsh / Git Bash:
which mcp-remote
# PowerShell:
where.exe mcp-remote
```

Should print a path like `~/.npm-global/bin/mcp-remote` (macOS/Linux) or `C:\Users\<you>\AppData\Roaming\npm\mcp-remote.cmd` (Windows). **This path must not contain spaces** — Windows users on the default `C:\Program Files\nodejs\` install can otherwise trip a known cmd.exe gotcha (see "Windows gotchas" below).

#### Step 2 — Locate the config file

| Platform                         | Path                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| macOS                            | `~/Library/Application Support/Claude/claude_desktop_config.json`                                                              |
| Linux                            | `~/.config/Claude/claude_desktop_config.json`                                                                                  |
| Windows — direct installer       | `%APPDATA%\Claude\claude_desktop_config.json` (resolves to `C:\Users\<you>\AppData\Roaming\Claude\claude_desktop_config.json`) |
| Windows — Microsoft Store / MSIX | `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json`                            |

> **MSIX vs direct installer**: if `Test-Path "$env:APPDATA\Claude"` is `False` on Windows but Claude Desktop is clearly installed and running, you have the MSIX (Store) variant. The Store sandbox redirects `%APPDATA%\Claude` writes into the per-package LocalCache. Use the second path. If you're unsure, search both:
>
> ```powershell
> Get-ChildItem -Path "$env:APPDATA","$env:LOCALAPPDATA" -Directory -Recurse -Depth 4 -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq "Claude" -and $_.Parent.Name -match "Roaming|Claude_" }
> ```

The file may not exist yet on first MCP setup; create the directory + file as needed.

#### Step 3 — Add the GST connector entry

```json
{
  "mcpServers": {
    "gst-mcp": {
      "command": "mcp-remote",
      "args": [
        "https://mcp.globalstrategic.tech/mcp",
        "--header",
        "Authorization: Bearer YOUR_TOKEN_HERE"
      ]
    }
  }
}
```

> Replace `YOUR_TOKEN_HERE` with your `MCP_KEY_<INITIALS>` value (from your password manager). To also configure a staging connector for testing un-shipped changes, add a second entry `"gst-mcp-staging"` with the `mcp-staging.globalstrategic.tech` URL — same shape, distinct connector name. Most consumers only need the production entry.

If the file already had `mcpServers` entries (other MCP servers configured), **merge** by adding `gst-mcp` as a sibling key — don't overwrite the file content.

#### Step 4 — Quit + restart Claude Desktop

Right-click the Claude Desktop tray icon → **Quit** (NOT just close window — Claude Desktop runs in tray after window close). Re-launch from Start menu / launcher / Applications. Config is read once at launch.

#### Step 5 — Verify

The Connectors menu (chat input "+" → Connectors) should now show an enabled `gst-mcp` entry with an `Add from gst-mcp` submenu listing the GST tools/prompts.

Smoke prompt in a fresh conversation:

> _Using gst-mcp, list the GST portfolio facets._

(Naming the connector explicitly avoids ambiguity if you also have a local stdio `gst` connector or a `gst-mcp-staging` entry.) Expected: Claude calls `list_portfolio_facets` and returns the deduplicated themes / engagement categories from the GST M&A dataset.

#### Windows gotchas

Windows operators commonly hit four issues; each has a targeted workaround:

1. **`%APPDATA%\Claude\` doesn't exist** — you have the MSIX/Store variant. Use the LocalCache path from the table above.

2. **`'C:\Program' is not recognized as a command`** when Claude Desktop tries to spawn the bridge. Cause: Claude Desktop resolves `npx` to `C:\Program Files\nodejs\npx.cmd` and passes the unquoted path through `cmd /C`, which mis-parses the space. Fix: use the globally-installed `mcp-remote` directly (from npm's spaceless global bin) — that's why Step 1 says install globally rather than relying on `npx -y mcp-remote` in the config args.

3. **Could not load app settings → "Unexpected token", "{...}" is not valid JSON** when restarting Claude Desktop after editing the config in PowerShell. Cause: PowerShell 5.1's `Set-Content -Encoding utf8` writes a UTF-8 BOM at the file start; Claude Desktop's JSON parser rejects it. Fix: write via .NET's `WriteAllText` with no-BOM encoding:

   ```powershell
   $path = "<full path to claude_desktop_config.json>"
   $json = @'
   { ... your JSON content ... }
   '@
   [System.IO.File]::WriteAllText($path, $json, [System.Text.UTF8Encoding]::new($false))
   ```

   Verify no BOM: `[System.IO.File]::ReadAllBytes($path)[0..2]` should print `123, 10, 32` (`{`, newline, space) — NOT `239, 187, 191` (BOM bytes).

4. **Connector shows "Server disconnected"** in Claude Desktop's UI even though the config looks correct. Click **Open developer settings** in the error banner — it exposes the actual stderr from the failed spawn. Most common: PATH issues, Program-Files-space breakage, or stale token. Cross-check with a manual bridge test from a separate terminal:
   ```bash
   mcp-remote https://mcp.globalstrategic.tech/mcp --header "Authorization: Bearer YOUR_TOKEN_HERE"
   ```
   If this prints "Connected to remote server using StreamableHTTPClientTransport" and "Proxy established successfully," the bridge itself is fine and the issue is Claude Desktop's spawn config or restart.

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

## 4. Optional system-prompt addendum (recommended)

> **Why this exists**: Without explicit guidance, agents frequently bypass the GST MCP tools — substituting training knowledge, web search, or cross-chat conversation memory for any question that looks "general-domain" (regulatory, M&A, portfolio, ICG framework, diligence). BL-032's Section K soak ([`BL-032_TESTING_FINDINGS.md`](../../../../src/docs/development/_archive/BL-032_TESTING_FINDINGS.md) § K) isolated the precise trigger: Claude's **first response sentence** decides the path — "I'll search past conversations" commits to the memory path; "I'll pull this from the GST toolchain" commits to the MCP path. K.2.e.5 confirmed identical conversation state with identical contaminated memory routes correctly when the opening framing names an MCP tool. The model does not course-correct mid-response, so biasing the opening sentence is the highest-leverage intervention.

Paste the block below into your client's system prompt / profile / custom instructions. After saving, restart the client OR start a new conversation — the addendum has to be present before the user's first message in a thread.

```text
GST MCP tool routing — opening-sentence bias

For any question about GST's portfolio, engagements, radar / market intelligence,
regulatory analysis, technology paradigms (TechPar), infrastructure cost governance
(ICG), due diligence, technical debt, intake / information request lists, or
populated-IRL ingestion:

1. Your FIRST sentence must explicitly reference the MCP tool you intend to call
   (e.g., "I'll query search_portfolio...", "Let me pull this via the GST toolchain
   using search_regulations..."). Do NOT open with "I'll search past conversations",
   "Let me check my memory", or "Based on what I know about...". Conversation memory
   and training knowledge are NOT authoritative for GST data — the MCP tools are.

2. Call the GST tool or prompt FIRST, even when the prompt doesn't explicitly mention
   GST. The GST surface is the authoritative source for these topic areas.

3. For structure-discovery questions ("what does the ICG framework cover?",
   "what fields does the diligence wizard accept?"), call the relevant tool with
   empty / minimal args rather than describing the framework from memory. Empty-args
   calls are supported and return the canonical taxonomy.

4. For the diligence agenda specifically: when a dimension is not directly stated
   by the user OR a literal one-to-one extraction from their words, pass 'unknown'.
   Indirect inference (productType → businessModel; growthStage → scaleIntensity;
   techArchetype → transformationState) is forbidden. The 'unknown' sentinel widens
   the agenda conservatively; that is the supported design.

5. When a task matches a published GST Prompt's purpose, INVOKE THE PROMPT rather
   than orchestrating its underlying tool calls ad-hoc. Specifically:
   - Intake / pre-diligence ask to a target: invoke `gst_information_request_list`
   - Ingesting a populated IRL and producing the full platform-sweep dossier:
     invoke `gst_irl_ingestion`
   - Drafting a buy-side / sell-side handoff memo: invoke `gst_diligence_handoff_memo`
   - Target snapshot / quick-look: invoke `gst_target_quick_look`
   - Diligence kickoff agenda from sales notes: invoke `gst_diligence_kickoff`
   - Comparable-engagements memo from the GST portfolio: invoke `gst_comparable_engagements_memo`
   - Cross-jurisdictional regulatory exposure brief: invoke `gst_regulatory_exposure_brief`
   - Architecture review across the four-layer framework: invoke `gst_architecture_layer_review`
   - Today's GST radar briefing in GST Take voice: invoke `gst_radar_brief_today`
   GST Prompts orchestrate the tools with the right sequence, conditionals, and
   output structure; re-deriving from tools loses that discipline.
```

Where to paste:

| Client         | Location                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------- |
| Claude Desktop | Settings → Profile → "What personal preferences should Claude consider in responses?"       |
| Claude Code    | `CLAUDE.md` at the repo root (project-level) OR `~/.claude/CLAUDE.md` (user-level)          |
| Cursor         | Workspace `.cursorrules`                                                                    |
| ChatGPT (web)  | Settings → Personalization → Custom Instructions → "How would you like ChatGPT to respond?" |

**Validation prompt** — run this in a fresh thread after saving:

> A founder just sent me their pitch — they're a $15M-ARR Series B AI-tooling company looking for tech advisory. Pull any radar items + past engagements that would inform whether this is a fit, and tell me if I should take the call.

Expect Claude's opening sentence to explicitly name `search_portfolio` and `search_radar` (or `search_radar_offline` on a local stdio connector). If it opens with "I'll search past conversations" or "Based on what I know," the addendum didn't land — verify the system prompt actually saved and the conversation is fresh.

---

## Troubleshoot

| Symptom                                                    | Likely cause                                                                                                                                                                                                                                                          | Fix                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool list empty / no GST tools appear                      | Client didn't reach the MCP endpoint at all. Check spelling of the URL; check `Authorization` header is present in the snippet                                                                                                                                        | Re-paste the config; restart the client. Check your client's MCP debug log if it has one                                                                                                                                                                                      |
| `401 Unauthorized` on every tool call                      | Wrong / expired / mistyped token; or the operator rotated your key without telling you                                                                                                                                                                                | Verify the token value in your config matches the value the operator gave you. If you're sure it does, ask the operator to confirm the key is still active (see `AUTH.md` § List active keys)                                                                                 |
| `403 Forbidden` (Phase 5+)                                 | Your key lacks a scope that the request needs. Phase 2 always grants full scope; this only applies once BL-032.5+ ships per-key scope variation                                                                                                                       | Ask the operator to broaden your scope or use a different key. The 403 body's `missingScope` field names the missing entry                                                                                                                                                    |
| `429 Too Many Requests`                                    | You hit a per-key rate limit. Phase 3 limits: 60 req/min and 1000 req/day for non-radar tools; 5 req/min and 50 req/day for radar tools                                                                                                                               | Wait for the `Retry-After` window (returned in headers). If you're hitting limits doing legitimate work, escalate — see § When to escalate                                                                                                                                    |
| `503 Service Unavailable` on radar tools                   | Inoreader API is degraded; the global circuit breaker is open. Cached results return where possible; missing-cache returns 503                                                                                                                                        | Cached results come back flagged `liveInfo.degraded: true` — usually just use them (up to 6h old; `fetchedAt` gives the age). A hard 503 means nothing was cached: wait the `Retry-After` window, or use `search_radar_offline` if you have a local stdio MCP                 |
| `token-stale` error envelope from radar tools              | The Inoreader OAuth access token in Upstash has expired. Per the Path 2 / Q4 invariant, the website is the sole refresh-writer — the Worker can't refresh on its own. Mitigated long-term by BL-039 (Worker-as-refresh-writer) and BL-032.5 (Worker Cron pre-warming) | Visit `https://globalstrategic.tech/hub/radar` in a browser; the page's ISR triggers a refresh that writes a new access token to Upstash within ~10s. Retry the radar tool call after that. Documented as the operator recovery procedure in [`DEPLOY.md` § C.5](./DEPLOY.md) |
| `502 Bad Gateway` / Cloudflare error page                  | Upstream (Worker isolate) crashed                                                                                                                                                                                                                                     | Retry; if persistent, escalate to operator. Check Cloudflare's status page                                                                                                                                                                                                    |
| Browser console: `No 'Access-Control-Allow-Origin' header` | Your client's browser fetches from an origin that's not on the allowlist                                                                                                                                                                                              | If you're using a web client (claude.ai, ChatGPT web), the origin is fixed. If you're an in-browser developer, the operator can add your origin to `mcp-server/src/auth/cors.ts` after auditing                                                                               |

---

## Rate-limit etiquette

Full reference — per-key budget table, RateLimit response-header guide, circuit-breaker semantics, "what to do when 429'd" decision tree — lives in [`RATE_LIMITS.md`](./RATE_LIMITS.md). Skim it once during setup; it pays for itself the first time you see a 429.

Quick-reference summary:

| Tool family   | Per-minute | Per-day | Status                                                                                                                                       |
| ------------- | ---------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| General tools | 60         | 1000    | ✅ Active in production (BL-032 Phase 3)                                                                                                     |
| Radar tools   | 5          | 50      | ⚠️ Documented; enforcement tracked under [BL-038 (archived)](../../../../src/docs/development/_archive/MCP_SERVER_RATE_LIMIT_TIER_BL-038.md) |

---

## When to escalate

Contact the operator (see your team's escalation channel) when:

- You suspect your key was compromised — pasted into the wrong place, etc. → operator rotates immediately
- You're hitting rate limits doing legitimate work that the budgets don't accommodate → operator weighs adjusting the limits or escalating Inoreader's plan
- A persistent 5xx error suggests the Worker is down → operator checks `wrangler tail` + Sentry
- You suspect the production endpoint is degraded (slow, intermittent failures) → operator pulls metrics + runs incident triage (see [`DEPLOY.md`](./DEPLOY.md) § Incident triage)

---

_Last updated: 2026-07-24 (BL-033 Slice 2 — Claude Desktop native Connectors via the Worker's own OAuth; `mcp-remote` bridge demoted to legacy appendix, still supported)_
