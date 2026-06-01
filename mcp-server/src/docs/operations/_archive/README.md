# Archived operator runbooks

Closed-initiative trackers retained for historical reference. **Do NOT treat these as current operational procedures.** Live runbooks live one directory up, in `mcp-server/src/docs/operations/`.

## Criteria for archival

A runbook lands here when ALL of the following hold:

1. The initiative it documents is **closed** (shipped + verified + sibling docs updated)
2. The procedures inside are **no longer actionable** — they describe a one-time migration / gate / verification rather than an ongoing operational pattern
3. The content has historical value (e.g., decision rationale, post-incident evidence) worth keeping searchable

If a closed initiative's runbook contains procedures that REMAIN operationally relevant (e.g., the rotation runbook from a closed substrate ticket), those procedures get migrated to the canonical operational doc instead of moving to archive.

## Index

| File                                                     | Original initiative                              | Closed     | Why kept                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`BL-032_8_SOAK_GATE.md`](BL-032_8_SOAK_GATE.md)         | BL-032.8 Phase B — Radar consumer unification    | 2026-05-27 | Detailed 10-day soak tracker; documents the operator-side decom of the legacy `gst-radar-tokens` Upstash DB + Vercel `INOREADER_*` env vars + Worker `UPSTASH_INOREADER_REST_*` / `INOREADER_REFRESH_SECRET` secrets. Useful as a template if a similar substrate migration ever recurs |
| [`BL-032_76_VERIFICATION.md`](BL-032_76_VERIFICATION.md) | BL-032.76 — MCP cron Sentry observability repair | 2026-05-27 | Post-deploy verification matrix for the structural Sentry SDK bypass on the scheduled handler; useful as a reference for how the bypass was validated (Cloudflare cron dashboard `Success` status confirmed)                                                                            |

## Current operational entry points

- [`../DEPLOY.md`](../DEPLOY.md) — deploy + secret binding + recovery
- [`../AUTH.md`](../AUTH.md) — bearer-token issuance + rotation
- [`../RATE_LIMITS.md`](../RATE_LIMITS.md) — per-key budgets + 429 envelope
- [`../REMOTE_CLIENT_SETUP.md`](../REMOTE_CLIENT_SETUP.md) — Claude Desktop client config
- [`../SENTRY_ALERT_RULES.md`](../SENTRY_ALERT_RULES.md) — operator paging
- [`../INOREADER_OAUTH_CONTRACT.md`](../INOREADER_OAUTH_CONTRACT.md) — verified upstream OAuth contract
