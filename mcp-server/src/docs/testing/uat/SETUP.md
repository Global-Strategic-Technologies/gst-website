# UAT Setup — credential to first tool call

Do this once. Every case in every [UAT document](README.md) opens by assuming it is done.

> **What this covers**: obtaining a credential, connecting a client, and confirming the connection works. It writes out only the two canonical paths in full. Anything off them — other clients, the legacy `mcp-remote` bridge, Windows config-file gotchas, the full troubleshooting matrix, rate-limit etiquette — lives in [`REMOTE_CLIENT_SETUP.md`](../../operations/REMOTE_CLIENT_SETUP.md), which owns those mechanics.

**Endpoint** (all paths, all clients): `https://mcp.globalstrategic.tech/mcp`

UAT runs against **production**. There is no synthetic sandbox — one is [deferred](../../operations/PILOT_ONBOARDING.md), so integration and acceptance testing both happen against the live service with a narrow-scope credential. Staging (`https://mcp-staging.globalstrategic.tech/mcp`) exists for testing unshipped changes; if you use it, say so in the run log, because a Pass there is not a Pass in production.

---

## 0. Get a credential

Two kinds exist, and which one you have determines everything downstream. There is no self-service path for either — both are operator-issued.

### 0a. Internal — `MCP_KEY_<INITIALS>`

For GST team members. Ask the operator for a key; you will receive two things:

- A **name** like `MCP_KEY_RP`. The suffix is your initials, and it becomes the `keyOwner` your requests appear under in logs and rate-limit accounting.
- A **value** — roughly 43 random characters. This is the secret.

Storage rules are in [`REMOTE_CLIENT_SETUP.md` § 1](../../operations/REMOTE_CLIENT_SETUP.md); the short version is a password manager, never a file in a repo. If you lose it, ask for a **rotation** rather than a second key, so the lost one stops working.

> Minting a key is a manual operator step ([`AUTH.md`](../../operations/AUTH.md) has the procedure). That manual step is exactly what a request-access front door would replace; until one exists, allow for the round trip when planning a UAT cycle.

### 0b. Pilot — M2M client credentials

For an external pilot integrating a pipeline. You will receive a **client ID** and a **client secret**, delivered separately — the secret exists only once, at creation, and never travels by email.

Two authentication modes are supported:

| Mode              | What you hold                | Notes                                                             |
| ----------------- | ---------------------------- | ----------------------------------------------------------------- |
| `client_secret`   | ID + secret                  | Simplest; the secret is a bearer-equivalent, so treat it as one   |
| `private_key_jwt` | ID + your own ES256 key pair | RFC 7523. Preferred — no shared secret leaves your infrastructure |

Your credential also carries a **tier** (which sets your rate-limit ceilings) and a **scope set** (which tools you may call). Scopes are a hard ceiling, granted narrowly on purpose:

> **Radar is excluded by default.** `tool:radar:*` and `resource:radar:read` are both withheld unless explicitly granted, because they draw on a shared upstream budget. If your credential lacks them, UAT-08 and the radar portion of UAT-10 are **Blocked**, not Failed — record them that way.

Operators provisioning a client: [`PILOT_ONBOARDING.md` § 1](../../operations/PILOT_ONBOARDING.md). That runbook and [`AUTH.md`](../../operations/AUTH.md) are operator documents carrying admin credentials and revocation procedures — do not forward either to a client.

---

## 1. Connect

### 1a. Claude Desktop — the canonical path (Mode A)

1. **Settings → Connectors → Add custom connector.** Enter `https://mcp.globalstrategic.tech/mcp`. No client ID or secret is needed; Claude registers itself.
2. A browser tab opens the consent page. **Paste your `MCP_KEY_*` value** into the key field and approve. That paste is how the grant learns who you are — your access is bounded by that key's scopes.
3. Done. Access tokens last an hour and refresh silently. The same connector works on claude.ai web and mobile.

The same connector entry works against staging; use a distinct name (`gst-mcp-staging`) so you always know which one a case ran against.

Other clients — Claude Code, Cursor, ChatGPT — take an `Authorization: Bearer` header instead of the consent flow; the config snippets are in [`REMOTE_CLIENT_SETUP.md` § 2](../../operations/REMOTE_CLIENT_SETUP.md).

### 1b. Bearer token — the wire path (Mode B)

This is the path for an M2M credential, and the fallback for anyone re-checking a case without a client in the loop.

1. **Exchange your credentials for an access token** at the `/token` endpoint with `grant_type=client_credentials`. You get back an `mcp_m2m_*` token valid for **one hour**.
2. **There is no refresh token.** When it expires, request another. A UAT pass that runs longer than an hour needs a fresh token partway through — plan for it rather than reading the resulting 401 as a defect.
3. **Call the endpoint** with that token as `Authorization: Bearer <token>`.

To drive individual tool calls from a terminal, `mcp-server/scripts/Invoke-McpRequest.ps1` posts a single JSON-RPC request and prints the result. It reads the token from the `MCP_KEY` environment variable — the name predates M2M and reads as static-keys-only, but an `mcp_m2m_*` token goes in the same variable and works identically. The script does **not** perform the `/token` exchange; mint the token first.

Never paste a token into a shell command directly — use the environment variable, so it stays out of your shell history.

---

## 2. Install the system-prompt addendum (Mode A only)

[`REMOTE_CLIENT_SETUP.md` § 4](../../operations/REMOTE_CLIENT_SETUP.md) labels this optional. **For UAT it is required**, and the reason is specific: without it, models answer GST-domain questions from training knowledge or conversation memory instead of calling the tools. A case then fails because the model never routed to the server — which tells you nothing about whether the server works, and wastes the run.

Copy the block from that section into your client's system prompt or custom instructions, then start a new conversation. The addendum has to be in place before the first message of a thread.

Mode B does not involve a model, so this step does not apply.

---

## 3. Verify the connection

Every case assumes this passes. In a fresh thread:

> Using the GST connector, list the portfolio facets.

Expect a `list_portfolio_facets` call returning fifteen themes, two engagement categories, six growth stages, and a list of years. If you see the tool call happen and a result come back, you are connected end to end.

If the tool list is empty, the model answers without calling anything, or you get a 401, stop here and work through [`REMOTE_CLIENT_SETUP.md` § Troubleshoot](../../operations/REMOTE_CLIENT_SETUP.md) — running cases against a broken connection generates noise, not findings.

---

## 4. UAT hygiene

**Record the running version.** `GET https://mcp.globalstrategic.tech/health` is unauthenticated and returns `version` — the single source of truth for what is deployed. Every run-log row needs it; a verdict without a version cannot be compared against a later one.

**One fresh thread per case in Mode A.** A model that saw the answer three turns ago may recite it instead of calling the tool. That passes a case that should have failed.

**Capture evidence.** For each case, keep the tool call with its arguments and the first ~20 lines of the result. A verdict is a claim; the capture is what makes it checkable later.

**Stay inside the budget.** General tools allow 60 requests/minute and 1000/day; radar tools allow 5/minute and 50/day. A full UAT pass sits well inside that — a retry loop does not. If you hit a 429, wait out the `Retry-After` window rather than hammering.

---

## 5. Fail vs Blocked

| You observe                               | Verdict     | Do this                                                     |
| ----------------------------------------- | ----------- | ----------------------------------------------------------- |
| The call ran; an expectation did not hold | **Fail**    | File it, quoting case ID + version + what you saw           |
| The model never called the tool (Mode A)  | **Fail**    | Confirm § 2 landed first — if it did not, fix and re-run    |
| `403` naming a missing scope              | **Blocked** | Your credential is scoped out of this capability, by design |
| `429`                                     | **Blocked** | Wait the `Retry-After` window and re-run; not a finding     |
| `401` after an hour on Mode B             | **Blocked** | Your token expired — mint a new one and re-run              |
| `503` from a radar tool                   | **Blocked** | Upstream degradation; note it and move on                   |
| You could not connect at all              | **Blocked** | Nothing about the server is under test until § 3 passes     |

Anything persistent or unexplained goes to the operator — the escalation criteria are in [`REMOTE_CLIENT_SETUP.md` § When to escalate](../../operations/REMOTE_CLIENT_SETUP.md).

---

_Last updated: 2026-08-10 (BL-119 — initial authoring)_
