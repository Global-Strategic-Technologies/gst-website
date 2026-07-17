# BL-088 — Development-Docs Distillation & Cleanse

> **Backlog initiative**: [BL-088 in BACKLOG.md](BACKLOG.md#bl-088-development-docs-distillation--cleanse)
>
> **Status**: In progress — PR 1 (archive wave) landed 2026-07-15; PR 2 (ARCHITECTURE.md), PR 3a (ADR scaffolding + ADR-0001/2/3), and PR 3b (ADR-0004–0007) landed 2026-07-17. PRs 4–5 pending.
>
> **Lifecycle note**: this doc is itself a point-in-time initiative record and follows the convention it creates — at BL-088 closure (PR 5) it moves to [`_archive/`](_archive/README.md).

## Problem

`src/docs/development/` accumulated 39 flat files (~2.4 MB) where 32 closed-initiative narratives — some 100–300 KB each — drowned the 7 living reference docs. The initiative docs were written to guide implementation; the implementations shipped; the narratives stayed, degrading discoverability for humans and agents alike. Simultaneously, load-bearing design rationale (architecture shape, decision records) exists **only** inside those frozen narratives, cited by ~100 path-bearing references from live code, config, tests, and operational docs.

## Solution shape

**Distill, repoint, archive, codify** — extend the doc system's existing conventions rather than inventing new ones:

1. **Distill** still-load-bearing content into the maintained surface:
   - NEW `mcp-server/src/docs/ARCHITECTURE.md` — system shape, transport, auth/CORS boundary, rate limiting + circuit breaker, caching, radar pipeline, observability, deploy topology. Replaces ~380 KB of frozen prose (BL-031, BL-032, BL-032.5, BL-032.75, BL-032.8 design docs).
   - NEW `src/docs/adr/` — lightweight decision records (Status/Context/Decision/Consequences/Source): 0001 stage-taxonomy adapter (BL-031.87) · 0002 body-by-hash cache (BL-076) · 0003 xlsx canonicalization hash-bind (BL-049) · 0004 hub-surface import restriction (BL-031.5) · 0005 URL-state deeplink contract (BL-031.95) · 0006 Inoreader zone1 budget + circuit breaker (BL-032.5 findings) · 0007 registered-prompt pattern (BL-031.75).
   - Folds: contracts-pattern rationale (BL-031.85) → `mcp-server/src/docs/tools/README.md`; IRL-family rationale (BL-043) → `mcp-server/src/docs/library/irl-tool-input-mapping.md`; NEW per-prompt doc `mcp-server/src/docs/prompts/irl-ingestion.md` ← BL-045 design doc + its tool-schema-enforcement spec (the spec is cited as design authority by three live audit schemas).
2. **Repoint** every living reference to the NEW home (never the archive) — except pointers to archive-only records, which repoint to their `_archive/` path.
3. **Archive** all originals verbatim in [`_archive/`](_archive/README.md) (mirrors `mcp-server/src/docs/operations/_archive/`: admission criteria + index + frozen-links policy).
4. **Codify** the lifecycle so the pile never re-accumulates — see [`README.md § Initiative-doc lifecycle`](README.md).

## Disposition table

**Archive-only (16) — moved + repointed in PR 1 (2026-07-15, ~30 references)**: BL-032_TESTING_FINDINGS, MCP_SERVER_REMOTE_BL-032_TESTING, MCP_SERVER_REMOTE_BL-032_25, MCP_SERVER_REMOTE_BL-032_5_TESTING, MCP_SERVER_OPENCLAW_DEMO_BL-032_6, MCP_SERVER_OPENCLAW_HANDOVER_BL-032_6, MCP_SERVER_DEMO_SCRIPT_BL-032_6, MCP_SERVER_ARCHITECTURE_BL-031_tests, MCP_SERVER_CI_CD_DEPLOY_BL-037, MCP_SERVER_IRL_INGESTION_SIMPLIFICATION_BL-086, MCP_SERVER_FILLED_IRL_INGESTION_BL-045_REVIEW_PACKET, MCP_SERVER_IRL_GENERATOR_BL-044, MCP_SERVER_PROMPT_ARG_CACHE_PREPOP_BL-079, MCP_SERVER_VDR_AUDIT_TIERS_BL-036, MCP_SERVER_RATE_LIMIT_TIER_BL-038, IMMEDIATE_NEXT_STEPS.

**Distill then archive (16 sources → PRs 2–4)**:

| Source                                                                 | Distills into                                     | PR  |
| ---------------------------------------------------------------------- | ------------------------------------------------- | --- |
| MCP_SERVER_ARCHITECTURE_BL-031.md                                      | ARCHITECTURE.md § System shape                    | 2   |
| MCP_SERVER_REMOTE_BL-032.md                                            | ARCHITECTURE.md § Transport/Auth/Deploy           | 2   |
| MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md                        | ARCHITECTURE.md § Resources/Prompts wiring        | 2   |
| MCP_SERVER_OBSERVABILITY_BL-032_75.md                                  | ARCHITECTURE.md § Observability                   | 2   |
| MCP_SERVER_RADAR_UNIFICATION_BL-032_8.md                               | ARCHITECTURE.md § Radar pipeline                  | 2   |
| MCP_SERVER_STAGE_ADAPTER_BL-031_87.md                                  | ADR-0001                                          | 3a  |
| MCP_SERVER_COMPOSE_BODY_BY_HASH_BL-076.md                              | ADR-0002                                          | 3a  |
| MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md                         | ADR-0003                                          | 3a  |
| MCP_SERVER_HUB_SURFACE_BL-031_5.md                                     | ADR-0004                                          | 3b  |
| MCP_SERVER_HUB_URL_STATE_BL-031_95.md                                  | ADR-0005                                          | 3b  |
| BL-032_5_TESTING_FINDINGS.md                                           | ADR-0006                                          | 3b  |
| MCP_SERVER_PROMPTS_BL-031_75.md                                        | ADR-0007                                          | 3b  |
| MCP_SERVER_CONTRACTS_BL-031_85.md                                      | tools/README.md fold                              | 4   |
| MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md                          | irl-tool-input-mapping.md fold                    | 4   |
| MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md                              | NEW prompts/irl-ingestion.md                      | 4   |
| MCP_SERVER_FILLED_IRL_INGESTION_BL-045_TOOL_SCHEMA_ENFORCEMENT_SPEC.md | NEW prompts/irl-ingestion.md § schema enforcement | 4   |

## Link policies (accepted)

- **Frozen links inside archived docs**: preserved verbatim; may not resolve from `_archive/`. Declared in the archive README.
- **Interim cross-wave breakage**: between wave PRs, still-live later-wave docs may contain broken relative links to already-archived siblings (e.g. the BL-045 design doc links its archived review packet until PR 4 lands). Fully resolved when PR 5 closes the initiative.
- **Repoint direction**: living references → new distilled home; only archive-record pointers (changelogs, repro scripts, evidence citations) → `_archive/` paths.

## PR ledger

| PR  | Scope                                                                                                            | Status             |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1   | `_archive/` scaffolding + 16 archive-only moves + ~30 repoints + dead-anchor fixes + conventions + BL-088 filing | ✅ 2026-07-15      |
| 2   | ARCHITECTURE.md from 5 sources; archive them; repoint 42 refs + fix 2 stale claims (DEPLOY Q4, PERF_OBS row)     | ✅ 2026-07-17      |
| 3a  | ADR scaffolding (`src/docs/adr/` README + TEMPLATE) + ADR-0001/2/3; archive 3 sources; repoint 19 refs           | ✅ 2026-07-17      |
| 3b  | ADR-0004/5/6/7; archive 4 sources; repoint 27 refs incl. eslint message + golden-fixture prose                   | ✅ 2026-07-17      |
| 4   | tools/README + irl-mapping folds; NEW prompts/irl-ingestion.md; archive 4 sources; repoint                       | pending (~1.5–2 d) |
| 5   | Master-index adr/ row; final sweep grep; BL-088 closure; archive this doc                                        | pending (~0.5 d)   |

**Per-PR verification**: re-grep each filename repo-wide immediately before moving (classifications drift); post-move grep → zero hits outside `_archive/` + archive index (+ `.claude/settings*.json` stale allowlist strings, harmless); every new/edited link target exists; full local gate (`astro check`, lint, lint:css, `test:run`) + mcp gate (`typecheck`, `test:mcp`) when mcp-server files are touched; golden-fixture edits must change comments only, never assertions.
