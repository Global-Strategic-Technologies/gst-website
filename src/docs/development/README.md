# Development Documentation

Strategic documentation for GST website development initiatives, tooling, and operational setup.

## Active Documents

| Doc                                                                | Purpose                                                                                                                            |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| [BACKLOG.md](./BACKLOG.md)                                         | Consolidated backlog of all open development initiatives (completed stanzas pruned — see its header note for recovery)             |
| [PAYMENTS_PLATFORM_BL-133.md](./PAYMENTS_PLATFORM_BL-133.md)       | BL-133 initiative design: Stripe Managed Payments checkout and automated MCP provisioning — designed, not yet implemented          |
| [SELF_SERVE_TRIAL_BL-155.md](./SELF_SERVE_TRIAL_BL-155.md)         | BL-155 initiative design: self-serve 3-day MCP trial gated by Turnstile, no Stripe — Slices 1 and 2b shipped; Slice 2 (mint) next  |
| [CLAUDE_DESIGN_SYNC.md](./CLAUDE_DESIGN_SYNC.md)                   | Publishing the design system to claude.ai/design: what ships, when to re-sync, and the rules that keep it from drifting            |
| [DEVELOPER_TOOLING.md](./DEVELOPER_TOOLING.md)                     | Authoritative reference for lint, format, hooks, CI, browser targets                                                               |
| [LOCALIZATION.md](./LOCALIZATION.md)                               | How the site speaks more than one language: locale registry, catalogs and staleness guard, adding a string/page/locale, draft→live |
| [LOCALIZATION_HANDOFF_BL-153.md](./LOCALIZATION_HANDOFF_BL-153.md) | BL-153 Claude Design hand-off (switcher, first-visit band, routing/SEO/persistence spec, screenshots) — open initiative doc        |
| [OPERATOR_RUNBOOK.md](./OPERATOR_RUNBOOK.md)                       | Running `gst_irl_ingestion` dossiers: run tiers, reading the VERIFY block, client-ready gating, signoff, failure recovery          |
| [IRL_PARTNER_PASTE_RUNBOOK.md](./IRL_PARTNER_PASTE_RUNBOOK.md)     | Converting a partner's filled `.xlsx` IRL to canonical markdown via `npm run irl:extract` for the partner-paste path               |
| [PERFORMANCE_OBSERVABILITY.md](./PERFORMANCE_OBSERVABILITY.md)     | Lighthouse CI on PRs, weekly dashboard at <https://performance.globalstrategic.tech>, and the workflows that run them              |
| [SENTRY_MANUAL_SETUP.md](./SENTRY_MANUAL_SETUP.md)                 | Sentry alert rules, source map upload, and consent gating setup reference                                                          |

## How to Use

- **Looking for work to do?** Read [BACKLOG.md](./BACKLOG.md) — grouped by theme, each item is a self-contained user story
- **Picking up BL-133 (payments)?** Read [PAYMENTS_PLATFORM_BL-133.md](./PAYMENTS_PLATFORM_BL-133.md) — the design is complete and reviewed; start at its "Vendor behaviour: documented, not executed" section, because the lifecycle rests on Stripe behaviour never yet exercised
- **Picking up BL-155 (self-serve trial)?** Read [SELF_SERVE_TRIAL_BL-155.md](./SELF_SERVE_TRIAL_BL-155.md) § Scope first — the initiative was rescoped to the connector flow; Slices 1 and 2b are shipped, Slice 2 (the mint endpoint) is next. It is deliberately **not** built on BL-133's payments rail
- **Configuring tooling?** Read [DEVELOPER_TOOLING.md](./DEVELOPER_TOOLING.md) first
- **Adding a string, a page, or a language?** Read [LOCALIZATION.md](./LOCALIZATION.md) — English is the schema, translations are stamped against it, and a locale goes live by one word in the registry
- **Renamed a `.brutal-*` class or a design token?** Read [CLAUDE_DESIGN_SYNC.md](./CLAUDE_DESIGN_SYNC.md) — the published design system names classes explicitly and goes stale silently
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

- **2026-07-15 → 2026-07-17 (BL-088, complete)**: all 32 closed-initiative docs distilled into the maintained surface (`mcp-server/src/docs/ARCHITECTURE.md`, [`src/docs/adr/`](../adr/README.md), doc folds, `prompts/irl-ingestion.md`) and moved to [`_archive/`](_archive/README.md) under the lifecycle above — see the [archived BL-088 record](_archive/MCP_DOCS_DISTILLATION_BL-088.md) for the disposition table and wave ledger. That reduced the directory to living reference docs only. BL-106 re-entered under step 1 on 2026-08-03 and completed the full cycle on 2026-08-04 — distilled into [ADR-0013](../adr/0013-mcp-2026-07-28-modern-only-worker.md) and `mcp-server/src/docs/ARCHITECTURE.md`, then archived. [BL-133](./PAYMENTS_PLATFORM_BL-133.md) entered under step 1 on 2026-09-01, and [BL-153's design hand-off](./LOCALIZATION_HANDOFF_BL-153.md) on 2026-09-05 (its §1–§3 already distilled into [LOCALIZATION.md](./LOCALIZATION.md) and [ADR-0030](../adr/0030-website-locale-model.md), so it archives cleanly at closure); those two are the open initiative docs here; everything else is a living reference.
- **2026-04-18**: completed initiative documents (Platform Hardening V1, Hub Tools Brutalist Migration, Site-Wide Brutalist Migration, Favicon & Icons, Design System Initiatives 1-5) were consolidated and **removed** (pre-convention). View originals via `git show` — see the note at the top of [BACKLOG.md](./BACKLOG.md) for instructions.

---

<- Back to [Master Documentation Index](../README.md)

_Last Updated: September 5, 2026 (LOCALIZATION.md added; BL-153 design hand-off entered under lifecycle step 1)_
