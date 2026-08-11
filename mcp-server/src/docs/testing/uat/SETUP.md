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

## 2. The system-prompt addendum — optional, and not a precondition

[`REMOTE_CLIENT_SETUP.md` § 4](../../operations/REMOTE_CLIENT_SETUP.md) describes a tool-routing addendum. **You do not need it to run this suite.** Install nothing; change no account settings.

An earlier revision of this document required it. That was wrong, and the reasoning is worth keeping because it applies to any test suite over an LLM surface:

- The addendum biases a model's **spontaneous** routing — whether it reaches for an MCP tool when a user asks an ambiguous domain question. Every case here names the connector in its step text, so that decision is already made by the tester.
- Prompt cases (UAT-09) invoke from the client's prompt picker. The model makes no routing choice at all, so there is nothing to bias.
- Decisive: **if a case only passes with the addendum installed, that case is testing the addendum, not the server.** Coupling them made every case depend on an account-settings change that has nothing to do with the capability under test.

Install it if you want to _additionally_ observe spontaneous routing — that is a real production concern, just a different question from the one this suite asks. If you do, note it in the run log, because it changes what a Pass means.

Mode B does not involve a model at all, so none of this applies there.

---

## 3. Verify the connection — all three surfaces

The server exposes **three** capability surfaces: tools, prompts, and resources. A client can reach one and not the others, so check all three now. Two of these steps take seconds and save hours.

**3a. Tools.** In a fresh thread:

> Using the GST connector, list the portfolio facets.

Expect a `list_portfolio_facets` call returning fifteen themes, two engagement categories, six growth stages, and a list of years.

**3b. Prompts.** Open the client's prompt picker (in Claude Desktop, the "+" menu under the connector). Expect **nine** `gst_*` prompts, no duplicates, and nothing non-`gst_` under this connector.

**3c. Resources.** Open the client's resource browser. Expect **133** resources — 4 library, 123 regulations, 6 radar.

> **Why 3b and 3c exist.** An earlier revision checked only 3a and told the tester they were "connected end to end". That is false for this server: a client reaching it through a **proxied connector surface** — a bridge or agent session that forwards tool calls only — passes 3a perfectly while seeing zero prompts and zero resources. The first UAT cycle ran that way and did not discover it until UAT-09, by which point two whole families had been recorded Blocked for a reason nobody had a name for. The symptom is _"tools work flawlessly, prompts and resources absent"_, and the verdict for the affected cases is **Blocked, not Fail** — the server is behaving correctly and your client cannot see part of it.

If 3a fails, or you get a 401, stop and work through [`REMOTE_CLIENT_SETUP.md` § Troubleshoot](../../operations/REMOTE_CLIENT_SETUP.md) — running cases against a broken connection generates noise, not findings. If 3a passes but 3b or 3c comes back empty, you can still run UAT-01 through UAT-08; record UAT-09 and UAT-10 as Blocked with the proxied-surface reason and say so up front in your report.

---

## 4. UAT hygiene

**Record the running version.** `GET https://mcp.globalstrategic.tech/health` is unauthenticated and returns `version` — the single source of truth for what is deployed. Every run-log row needs it; a verdict without a version cannot be compared against a later one.

**One fresh thread per case in Mode A.** A model that saw the answer three turns ago may recite it instead of calling the tool. That passes a case that should have failed.

**Capture evidence.** For each case, keep the tool call with its arguments and the first ~20 lines of the result. A verdict is a claim; the capture is what makes it checkable later.

**Stay inside the budget — and know that yours depends on your tier.** The figures below are per-client ceilings, not universals:

| Tier         | General /min | General /day | Radar /min | Radar /day |
| ------------ | ------------ | ------------ | ---------- | ---------- |
| `free-pilot` | 30           | 300          | 3          | 20         |
| `paid`       | 60           | 2000         | 5          | 50         |
| `enterprise` | 120          | 10000        | 10         | 150        |

A full UAT pass sits well inside every one of these — a retry loop does not. If you hit a 429, wait out the `Retry-After` window rather than hammering. A `free-pilot` credential has the tightest radar budget, so UAT-08's three calls are close to a fifth of its daily allowance.

---

## 5. Fail vs Blocked

| You observe                                        | Verdict     | Do this                                                                                                                                                                               |
| -------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The call ran; an expectation did not hold          | **Fail**    | File it, quoting case ID + version + what you saw                                                                                                                                     |
| The model never called the tool (Mode A)           | **Fail**    | The case step names the connector, so routing was not the issue — file it                                                                                                             |
| `403` naming a missing scope                       | **Blocked** | Your credential is scoped out of this capability, by design                                                                                                                           |
| `429`                                              | **Blocked** | Wait the `Retry-After` window and re-run; not a finding                                                                                                                               |
| `401` after an hour on Mode B                      | **Blocked** | Your token expired — mint a new one and re-run                                                                                                                                        |
| `503` from a radar tool                            | **Blocked** | Upstream degradation; note it and move on                                                                                                                                             |
| You could not connect at all                       | **Blocked** | Nothing about the server is under test until § 3 passes                                                                                                                               |
| Tools work, but **no prompts or resources** appear | **Blocked** | A proxied connector surface — see § 3. Affects UAT-09 and UAT-10 only; the server is fine                                                                                             |
| Prompt attach fails with a bare "failed to attach" | **Blocked** | Almost always an invalid enum, with the server's field-level reason discarded by the client. Bisect the arguments against the family's `CONTRACT.md`; retrying unchanged always fails |

Anything persistent or unexplained goes to the operator — the escalation criteria are in [`REMOTE_CLIENT_SETUP.md` § When to escalate](../../operations/REMOTE_CLIENT_SETUP.md).

---

_Last updated: 2026-08-11 (BL-119 — addendum demoted to optional; § 3 now checks all three capability surfaces; two client-shaped symptoms added to § 5. All three changes came from the cycle-1 and cycle-2 UAT runs.)_
