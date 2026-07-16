# Development Documentation

Strategic documentation for GST website development initiatives, tooling, and operational setup.

## Active Documents

| Doc                                                            | Purpose                                                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [BACKLOG.md](./BACKLOG.md)                                     | Consolidated backlog of all open development initiatives (completed stanzas pruned — see its header note for recovery)    |
| [DEVELOPER_TOOLING.md](./DEVELOPER_TOOLING.md)                 | Authoritative reference for lint, format, hooks, CI, browser targets                                                      |
| [OPERATOR_RUNBOOK.md](./OPERATOR_RUNBOOK.md)                   | Running `gst_irl_ingestion` dossiers: run tiers, reading the VERIFY block, client-ready gating, signoff, failure recovery |
| [IRL_PARTNER_PASTE_RUNBOOK.md](./IRL_PARTNER_PASTE_RUNBOOK.md) | Converting a partner's filled `.xlsx` IRL to canonical markdown via `npm run irl:extract` for the partner-paste path      |
| [PERFORMANCE_OBSERVABILITY.md](./PERFORMANCE_OBSERVABILITY.md) | Lighthouse CI on PRs, weekly dashboard at <https://performance.globalstrategic.tech>, and the workflows that run them     |
| [SENTRY_MANUAL_SETUP.md](./SENTRY_MANUAL_SETUP.md)             | Sentry alert rules, source map upload, and consent gating setup reference                                                 |

## How to Use

- **Looking for work to do?** Read [BACKLOG.md](./BACKLOG.md) — grouped by theme, each item is a self-contained user story
- **Configuring tooling?** Read [DEVELOPER_TOOLING.md](./DEVELOPER_TOOLING.md) first
- **Running a client-facing dossier?** Read [OPERATOR_RUNBOOK.md](./OPERATOR_RUNBOOK.md); to prepare the partner-paste input, [IRL_PARTNER_PASTE_RUNBOOK.md](./IRL_PARTNER_PASTE_RUNBOOK.md)
- **Investigating a performance regression or adding a perf-budgeted page?** Read [PERFORMANCE_OBSERVABILITY.md](./PERFORMANCE_OBSERVABILITY.md)
- **Setting up Sentry?** Read [SENTRY_MANUAL_SETUP.md](./SENTRY_MANUAL_SETUP.md)
- **Writing CSS?** Start at [../styles/README.md](../styles/README.md)
- **Writing tests?** Start at [../testing/README.md](../testing/README.md)

## Initiative-doc lifecycle (convention, codified 2026-07-15 under BL-088)

Initiative design docs (`MCP_SERVER_*_BL-0XX.md` and kin) are **point-in-time records**: they guide an implementation, then freeze. To keep this directory a living-documents-only surface:

1. **While open**: the initiative doc lives here, linked from its BACKLOG stanza.
2. **At closure** (same PR as the closure stanza): **distill** any still-load-bearing content into the maintained surface — architecture facts into [`mcp-server/src/docs/ARCHITECTURE.md`](../../../mcp-server/src/docs/ARCHITECTURE.md), decision rationale into an ADR under [`src/docs/adr/`](../adr/), tool/prompt specifics into the relevant `CONTRACT.md`/`USAGE.md`/README — and **repoint** every code/config/doc reference to the new home.
3. **Then archive**: `git mv` the original to [`_archive/`](_archive/README.md) verbatim and add an index row. Archiving is the _last_ step of distillation, never a substitute for it.

The `_archive/` README carries the admission criteria and the frozen-links policy. Recovery of anything pre-convention: `git log -- src/docs/development/`.

## Archived

- **2026-07-15 (BL-088)**: closed-initiative docs began moving to [`_archive/`](_archive/README.md) under the lifecycle above — see [MCP_DOCS_DISTILLATION_BL-088.md](./MCP_DOCS_DISTILLATION_BL-088.md) for the disposition table and wave ledger.
- **2026-04-18**: completed initiative documents (Platform Hardening V1, Hub Tools Brutalist Migration, Site-Wide Brutalist Migration, Favicon & Icons, Design System Initiatives 1-5) were consolidated and **removed** (pre-convention). View originals via `git show` — see the note at the top of [BACKLOG.md](./BACKLOG.md) for instructions.

---

<- Back to [Master Documentation Index](../README.md)

_Last Updated: July 15, 2026 (BL-088 PR 1 — lifecycle convention + archive wave)_
