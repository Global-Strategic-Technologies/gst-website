# Runbook — Pilot client onboarding

lastReviewedAt: 2026-08-08

The end-to-end playbook for bringing a BL-033 external-pilot client onto the GST MCP server. It stitches together mechanics that already ship — this doc is the ordered checklist, not new capability. **Business/legal steps (NDA, DPA, kickoff) are out of engineering scope and flagged as such.**

> Provisioning is `MCP_ADMIN_KEY`-gated (production). Never inline the admin key in a shell command — use an env var. See [AUTH.md](AUTH.md) for the full auth model.

## 0. Before you provision (business — not engineering)

- [ ] **Intake received.** Today this is an email/introduction landing in the operator inbox; BL-093's request-access slice will add a form on the website that delivers into the same place. Either way the intake supplies the four things step 0 needs: name, firm, use case, contact address.
- [ ] Legal sign-off; **NDA + DPA executed** (front-loaded, amortized across pilots).
- [ ] Agree the tier (`free-pilot` / `paid` / `enterprise`) and the tool scopes the client needs.
- [ ] Agree success metrics (target ≥100 tool invocations/month per client).

## 1. Provision the client credential (engineering)

Most pilots are **M2M** (headless client_credentials — a PE firm's pipeline calling tools with no human in the loop). Human-consent OAuth clients follow the same scope model; see [AUTH.md § Onboard a human-consent client](AUTH.md).

Create the M2M client with the provisioning script. It returns the `client_secret` **once** — hand it to the client over a secure channel — and prints a ready-to-send onboarding email:

```
# From mcp-server/. Preview first; nothing is created and no key is needed:
npm run provision:client -- --name "<client-name>" --tier free-pilot --dry-run

# Then, with the admin key in the environment (never inline it — Directive 15):
npm run provision:client -- --name "<client-name>" --tier free-pilot
```

The script wraps `POST /admin/oauth/m2m-clients`; the raw curl and the JWKS-registration variant live in [AUTH.md § Onboard an M2M client](AUTH.md). Use the script by default — the admin API validates far less than the runbook assumes, and the script is where the guardrails live:

- **`allowedScopes` is the hard ceiling.** Grant the minimum the use case needs. The script defaults to `tool:*` + `resource:regulations:read` when `--scopes` is omitted, and **rejects any scope outside the advertised catalog** — the admin API does not validate scopes at all, so a typo like `tool:portfolo:*` would otherwise provision a client that can call nothing. Deliberate narrowing below the catalog takes `--unsafe-scope <scope>`. See [AUTH.md § scopes](AUTH.md).
- **Radar takes `--allow-radar`.** It is not included by `tool:*`, it shares the Inoreader Zone-1 budget, and the script blocks **both** `tool:radar:*` and `resource:radar:read` without the flag — the latter reads the same Inoreader-funded snapshot and is the easier one to grant by accident.
- **`--tier` is required.** It gates the rate-limit ceilings, which are enforced per client ([RATE_LIMITS.md](RATE_LIMITS.md), [ADR-0010](../../../../src/docs/adr/0010-per-client-rate-limit-tiers.md)). The flag is mandatory because the API treats `tier` as optional and silently resolves an absent one to `free-pilot`.
- Change tier/scopes/expiry without a new credential: `PATCH /admin/oauth/m2m-clients/<client_id>` — see [AUTH.md § Change an M2M client's tier](AUTH.md).
- Rotate/revoke: `DELETE /admin/oauth/m2m-clients/<client_id>` — the **m2m** route; `/admin/oauth/clients/<id>` is the separate provider-client route and 404s for an `m2m_*` id. Revocation has a ≤1h residual for self-contained M2M tokens — see [AUTH.md § Revoke](AUTH.md).

## 2. Client-side setup (hand-off)

The provisioning script prints a ready-to-send onboarding email covering the endpoint, client id, tier, scopes and the § 3 guarantees below. It **deliberately omits the client secret** — that value exists only in the creation response and belongs on the secure channel, not in a mail-client draft. Send the two separately.

[REMOTE_CLIENT_SETUP.md](REMOTE_CLIENT_SETUP.md) covers Claude Desktop native Connectors (OAuth), Cursor and ChatGPT. **Read before forwarding it**: it is written for a **GST team member** whose credential is an `MCP_KEY_<INITIALS>` value pasted at the consent page, and it documents **no** `client_credentials` flow or raw-HTTP path — despite older references here claiming otherwise. An external M2M pilot has a client id + secret and never has an `MCP_KEY_*`, so that guide does not describe their flow. **Send them [`testing/uat/SETUP.md`](../testing/uat/SETUP.md) instead** — its § 0b and § 1b cover the M2M credential and the `client_credentials` → bearer flow from the recipient's side, and it is client-safe by construction (the provisioning half links here rather than reproducing it). The provisioning script's generated email remains the short form; the setup doc is the long form it points at. If you need more wire detail to write into your reply, read [AUTH.md § Onboard an M2M client](AUTH.md) **yourself — it is an operator doc carrying `$MCP_ADMIN_KEY` curls and the revocation runbook, and must never be forwarded to a client.** All clients connect to `https://mcp.globalstrategic.tech/mcp`.

## 3. What the client gets — guarantees to communicate

- **Audit trail — a capability, NOT a live guarantee** ([ADR-0014](../../../../src/docs/adr/0014-deactivate-audit-pipeline.md)): the tamper-evident, hash-chained, immutable log (7-yr retention) exists as built-and-tested capability, but the capture pipeline is **deactivated** pending the first compliance-requiring client — re-enabling is a config revert plus verification ([AUDIT_LOG.md § Re-enable](AUDIT_LOG.md)). **Do not promise active audit capture in writing.** If the client's contract requires it, re-enable before kickoff; capture is then best-effort at the enqueue hop (ADR-0009's documented loss window), with the fail-closed `writeAndAwait` seam as the lever for contracted guaranteed capture. Per-client SIEM export is a later slice. See [AUDIT_LOG.md](AUDIT_LOG.md) / [ADR-0009](../../../../src/docs/adr/0009-compliance-audit-log-hash-chain.md).
- **Status transparency**: [status.mcp.globalstrategic.tech](https://status.mcp.globalstrategic.tech) — uptime, dependency health, per-tool latency, audit health. See [STATUS_PAGE.md](STATUS_PAGE.md). Note: latency is **observability, not a ratified SLA** (no pilot SLA is contractually committed — BL-033 directive).
- **Sandbox** — a synthetic-data sandbox environment (zero real client data) for integration testing is **deferred (AC 282)**; until it ships, integration is against production with a narrow-scope credential.

## 4. Kickoff + monitoring

- [ ] Joint kickoff call (business).
- [ ] If the client's contract requires audit capture: re-enable the audit pipeline per [AUDIT_LOG.md § Re-enable procedure](AUDIT_LOG.md) **before** kickoff, then confirm their first tool calls land in the audit log. Either way, confirm the calls appear on the status page's tool-latency panel (per-key attribution is via `keyOwner`).
- [ ] Track invocations/month against the success metric.

## Out of scope (deferred / business)

Pilot SLA ratification (AC 285), regional-latency remediation (283), the synthetic sandbox (282), penetration test (292), design-partner recruitment (286), MCP-directory listings (287) — all deferred per the BL-033 build-capability-don't-ratify directive or handled as business/sales.

## Escalation

Operator (RP). Client-provisioning issues → [AUTH.md](AUTH.md); connection issues → [REMOTE_CLIENT_SETUP.md](REMOTE_CLIENT_SETUP.md).
