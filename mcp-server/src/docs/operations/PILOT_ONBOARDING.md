# Runbook — Pilot client onboarding

lastReviewedAt: 2026-07-26

The end-to-end playbook for bringing a BL-033 external-pilot client onto the GST MCP server. It stitches together mechanics that already ship — this doc is the ordered checklist, not new capability. **Business/legal steps (NDA, DPA, kickoff) are out of engineering scope and flagged as such.**

> Provisioning is `MCP_ADMIN_KEY`-gated (production). Never inline the admin key in a shell command — use an env var. See [AUTH.md](AUTH.md) for the full auth model.

## 0. Before you provision (business — not engineering)

- [ ] Legal sign-off; **NDA + DPA executed** (front-loaded, amortized across pilots).
- [ ] Agree the tier (`free-pilot` / `paid` / `enterprise`) and the tool scopes the client needs.
- [ ] Agree success metrics (target ≥100 tool invocations/month per client).

## 1. Provision the client credential (engineering)

Most pilots are **M2M** (headless client_credentials — a PE firm's pipeline calling tools with no human in the loop). Human-consent OAuth clients follow the same scope model; see [AUTH.md § Onboard a human-consent client](AUTH.md).

Create the M2M client (returns the `client_secret` **once** — hand it to the client over a secure channel):

```
curl -sS -X POST https://mcp.globalstrategic.tech/admin/oauth/m2m-clients \
  -H "Authorization: Bearer $MCP_ADMIN_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"name":"<client-name>","allowedScopes":["tool:*","resource:regulations:read"],"tier":"free-pilot"}'
```

- **`allowedScopes` is the hard ceiling.** Grant the minimum the use case needs. Radar is **not** included by `tool:*` for pilots — it requires explicitly adding `tool:radar:*` (it shares the Inoreader Zone-1 budget, so grant it deliberately). See [AUTH.md § scopes](AUTH.md).
- **`tier`** gates the rate-limit ceilings (per-client tiers are a separate BL-033 slice; the field is stored now).
- Rotate/revoke: `DELETE /admin/oauth/clients/<client_id>` (revocation has a ≤1h residual for self-contained M2M tokens — see [AUTH.md § Revoke](AUTH.md)).

## 2. Client-side setup (hand-off)

Point the client at [REMOTE_CLIENT_SETUP.md](REMOTE_CLIENT_SETUP.md) — the consumer-facing guide for Claude Desktop native Connectors (OAuth), Cursor, ChatGPT, and raw HTTP. They connect to `https://mcp.globalstrategic.tech/mcp`.

## 3. What the client gets — guarantees to communicate

- **Audit trail**: every tool call is written to a tamper-evident, hash-chained, immutable log (7-yr retention). Per-client SIEM export is a later slice; the guarantee exists now. See [AUDIT_LOG.md](AUDIT_LOG.md) / [ADR-0009](../../../../src/docs/adr/0009-compliance-audit-log-hash-chain.md).
- **Status transparency**: [status.mcp.globalstrategic.tech](https://status.mcp.globalstrategic.tech) — uptime, dependency health, per-tool latency, audit health. See [STATUS_PAGE.md](STATUS_PAGE.md). Note: latency is **observability, not a ratified SLA** (no pilot SLA is contractually committed — BL-033 directive).
- **Sandbox** — a synthetic-data sandbox environment (zero real client data) for integration testing is **deferred (AC 282)**; until it ships, integration is against production with a narrow-scope credential.

## 4. Kickoff + monitoring

- [ ] Joint kickoff call (business).
- [ ] Confirm the client's first tool calls land in the audit log and appear on the status page's tool-latency panel (per-key attribution is via `keyOwner`).
- [ ] Track invocations/month against the success metric.

## Out of scope (deferred / business)

Pilot SLA ratification (AC 285), regional-latency remediation (283), the synthetic sandbox (282), penetration test (292), design-partner recruitment (286), MCP-directory listings (287) — all deferred per the BL-033 build-capability-don't-ratify directive or handled as business/sales.

## Escalation

Operator (RP). Client-provisioning issues → [AUTH.md](AUTH.md); connection issues → [REMOTE_CLIENT_SETUP.md](REMOTE_CLIENT_SETUP.md).
