# Archived initiative documents

Closed-initiative planning artifacts moved out of the active `src/docs/development/` surface. This directory mirrors the convention established by [`mcp-server/src/docs/operations/_archive/`](../../../../mcp-server/src/docs/operations/_archive/README.md).

## Admission criteria

A document lands here when **all three** hold:

1. **The initiative is closed** — shipped + verified, its BACKLOG stanza resolved, sibling docs updated.
2. **Its content is no longer actionable** — it guided a one-time implementation, migration, exercise, or verification; it is not an ongoing reference or procedure.
3. **It retains historical value** — decision rationale, audit evidence, exercise transcripts, or post-incident records worth keeping greppable without a `git log` excavation.

**If a closed doc still contains operationally relevant procedures or load-bearing design rationale, that content is migrated into the canonical maintained doc (or an ADR under `src/docs/adr/`) FIRST — archiving is the last step of distillation, never a substitute for it.** See the lifecycle convention in [`../README.md`](../README.md).

## Frozen-links policy

Archived documents are **point-in-time records, preserved verbatim**. Their internal relative links reflect their _original_ location (`src/docs/development/`) and may not resolve from this directory — including links to `BACKLOG.md`, to other archived siblings, and to since-moved docs. Do not "fix" them; consult git history at the original path if provenance matters.

## Index

| File | Original initiative | Closed | Why kept |
| --- | --- | --- | --- |
| [BL-032_TESTING_FINDINGS.md](BL-032_TESTING_FINDINGS.md) | BL-032 soak (Sections A–K) | 2026-05-13 | Full soak-week evidence record; T.A.15/T.H.4/T.H.6 findings still cited by the BL-033 stanza |
| [MCP_SERVER_REMOTE_BL-032_TESTING.md](MCP_SERVER_REMOTE_BL-032_TESTING.md) | BL-032 soak playbook | 2026-05-13 | The Section A–K test-design record behind the findings doc |
| [MCP_SERVER_REMOTE_BL-032_25.md](MCP_SERVER_REMOTE_BL-032_25.md) | BL-032.25 go-live triage bucket | 2026-07-14 | §-by-§ closure stanzas incl. the benchmark-audit spike record |
| [MCP_SERVER_REMOTE_BL-032_5_TESTING.md](MCP_SERVER_REMOTE_BL-032_5_TESTING.md) | BL-032.5 verification playbook | 2026-05-13 | Companion to `mcp-server/scripts/Test-Bl0325.ps1` |
| [MCP_SERVER_OPENCLAW_DEMO_BL-032_6.md](MCP_SERVER_OPENCLAW_DEMO_BL-032_6.md) | BL-032.6 OpenClaw demo | 2026-05 | Demo exercise transcript + evaluation record |
| [MCP_SERVER_OPENCLAW_HANDOVER_BL-032_6.md](MCP_SERVER_OPENCLAW_HANDOVER_BL-032_6.md) | BL-032.6 OpenClaw handover | 2026-05 | Handover context for the demo surface |
| [MCP_SERVER_DEMO_SCRIPT_BL-032_6.md](MCP_SERVER_DEMO_SCRIPT_BL-032_6.md) | BL-032.6 demo script | 2026-05 | Scenario 7 record cited by BREAKING_CHANGES 0.3.2–0.3.6 stanzas |
| [MCP_SERVER_ARCHITECTURE_BL-031_tests.md](MCP_SERVER_ARCHITECTURE_BL-031_tests.md) | BL-031 test architecture | 2026-04-27 | Paired-transport test-design rationale (superseded by `mcp-server/src/docs/testing/README.md`) |
| [MCP_SERVER_CI_CD_DEPLOY_BL-037.md](MCP_SERVER_CI_CD_DEPLOY_BL-037.md) | BL-037 CI/CD deploy workflows | 2026-05-31 | Phase D sketch still referenced by the deferred BL-048 stanza |
| [MCP_SERVER_IRL_INGESTION_SIMPLIFICATION_BL-086.md](MCP_SERVER_IRL_INGESTION_SIMPLIFICATION_BL-086.md) | BL-086 Option D prompt simplification | 2026-06-30 | § L3–L5 is the reserved BL-087 scope |
| [MCP_SERVER_FILLED_IRL_INGESTION_BL-045_REVIEW_PACKET.md](MCP_SERVER_FILLED_IRL_INGESTION_BL-045_REVIEW_PACKET.md) | BL-045 senior-consultant review packet | 2026-07-15 (disposition banner) | 36-cell review matrix, retained should a formal content review ever be scheduled |
| [MCP_SERVER_IRL_GENERATOR_BL-044.md](MCP_SERVER_IRL_GENERATOR_BL-044.md) | BL-044 xlsx generator | 2026-05-24 | Library-choice rationale (xlsx-js-style) cited by BREAKING_CHANGES 0.3.5/0.3.7 |
| [MCP_SERVER_PROMPT_ARG_CACHE_PREPOP_BL-079.md](MCP_SERVER_PROMPT_ARG_CACHE_PREPOP_BL-079.md) | BL-079 body-delivery design | 2026-06-07 | Part A/B design record cited by BREAKING_CHANGES |
| [MCP_SERVER_VDR_AUDIT_TIERS_BL-036.md](MCP_SERVER_VDR_AUDIT_TIERS_BL-036.md) | BL-036 gst_vdr_audit retirement | 2026-05-31 | Tier sketches retained with closure banner as institutional reference |
| [MCP_SERVER_RATE_LIMIT_TIER_BL-038.md](MCP_SERVER_RATE_LIMIT_TIER_BL-038.md) | BL-038 radar rate-limit tier | 2026-05-31 | Tier-design record cited by BREAKING_CHANGES |
| [IMMEDIATE_NEXT_STEPS.md](IMMEDIATE_NEXT_STEPS.md) | BL-032 → BL-033 sequencing snapshot | 2026-07-14 (all phases complete) | Point-in-time record of the go-live phase ordering and gate decisions |
| [MCP_SERVER_ARCHITECTURE_BL-031.md](MCP_SERVER_ARCHITECTURE_BL-031.md) | BL-031 MCP internal prototype | 2026-04-27 | Original architecture rationale; distilled into `mcp-server/src/docs/ARCHITECTURE.md` § System shape (BL-088 PR 2) |
| [MCP_SERVER_REMOTE_BL-032.md](MCP_SERVER_REMOTE_BL-032.md) | BL-032 internal remote (Worker) | 2026-05-13 | Q1–Q13 decision records; distilled into `ARCHITECTURE.md` §§ Transport / Auth / Rate limiting (BL-088 PR 2) |
| [MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md) | BL-032.5 Resources + Prompts on remote | 2026-05-13 | Caching/scope/manifest/cron design; distilled into `ARCHITECTURE.md` § Resources & Prompts (BL-088 PR 2) |
| [MCP_SERVER_OBSERVABILITY_BL-032_75.md](MCP_SERVER_OBSERVABILITY_BL-032_75.md) | BL-032.75 observability maturity | 2026-07-14 | Phase 0–3 design incl. AE schema + alerting rationale; distilled into `ARCHITECTURE.md` § Observability (BL-088 PR 2) |
| [MCP_SERVER_RADAR_UNIFICATION_BL-032_8.md](MCP_SERVER_RADAR_UNIFICATION_BL-032_8.md) | BL-032.8 radar single-caller unification | 2026-05-27 | Phase 1–3 design incl. single-flight OAuth + scope resolution; distilled into `ARCHITECTURE.md` § Radar pipeline (BL-088 PR 2) |
| [MCP_SERVER_STAGE_ADAPTER_BL-031_87.md](MCP_SERVER_STAGE_ADAPTER_BL-031_87.md) | BL-031.87 stage-taxonomy adapter | 2026-05-02 | Pattern-selection analysis (Adapter vs Proxy/Bridge/normalization); distilled into [ADR-0001](../../adr/0001-stage-taxonomy-adapter.md) (BL-088 PR 3a) |
| [MCP_SERVER_SPEC_2026_07_28_ALIGNMENT_BL-106.md](MCP_SERVER_SPEC_2026_07_28_ALIGNMENT_BL-106.md) | BL-106 `2026-07-28` spec alignment | 2026-08-04 | Per-delta disposition table for the whole spec revision (the record of what was declined and why, useful at the next revision); the five conclusions implementation overturned, kept deliberately rather than edited out. Decisions distilled into [ADR-0013](../../adr/0013-mcp-2026-07-28-modern-only-worker.md); deferrals extracted to BL-107 |
| [MCP_SERVER_COMPOSE_BODY_BY_HASH_BL-076.md](MCP_SERVER_COMPOSE_BODY_BY_HASH_BL-076.md) | BL-076 body-by-hash latency reduction | 2026-06-07 | Latency forensics + cache design + audit findings; distilled into [ADR-0002](../../adr/0002-irl-body-by-hash-cache.md) (BL-088 PR 3a) |
| [MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md](MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md) | BL-049 xlsx canonicalization / hash-bind | 2026-07-09 | **The revisit blueprint** for the deferred server-side xlsx path (re-engage triggers in [ADR-0003](../../adr/0003-irl-xlsx-canonicalization-hash-bind.md)); v11/v12 empirical traces (BL-088 PR 3a) |
| [MCP_SERVER_HUB_SURFACE_BL-031_5.md](MCP_SERVER_HUB_SURFACE_BL-031_5.md) | BL-031.5 Resources surface extension | 2026-04-28 | Resources design + import-restriction rationale; distilled into [ADR-0004](../../adr/0004-hub-surface-resources-import-restriction.md) + `ARCHITECTURE.md` (BL-088 PR 3b) |
| [MCP_SERVER_HUB_URL_STATE_BL-031_95.md](MCP_SERVER_HUB_URL_STATE_BL-031_95.md) | BL-031.95 URL-state / deep-link surface | 2026-05-03 | Per-phase encoder closures + capability-mirror decisions; distilled into [ADR-0005](../../adr/0005-hub-url-state-deeplink-contract.md) (BL-088 PR 3b) |
| [BL-032_5_TESTING_FINDINGS.md](BL-032_5_TESTING_FINDINGS.md) | BL-032.5 live-service soak findings | 2026-05-18 | § T.Y/T.Z empirical traces (429 episodes, budget forensics) behind [ADR-0006](../../adr/0006-inoreader-zone1-budget-protection.md) (BL-088 PR 3b) |
| [MCP_SERVER_PROMPTS_BL-031_75.md](MCP_SERVER_PROMPTS_BL-031_75.md) | BL-031.75 consultant prompt library | 2026-05-01 | Planning artifact + V1–V8 verification design; decision distilled into [ADR-0007](../../adr/0007-registered-prompt-pattern.md); mechanics live in `mcp-server/src/docs/prompts/README.md` (BL-088 PR 3b) |
| [MCP_SERVER_CONTRACTS_BL-031_85.md](MCP_SERVER_CONTRACTS_BL-031_85.md) | BL-031.85 tool input contracts | 2026-05-02 | Contracts-pattern design; surviving rationale folded into `mcp-server/src/docs/tools/README.md` (BL-088 PR 4) |
| [MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md](MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md) | BL-043 IRL canonical article + Resource | 2026-05-22 | IRL design decisions; surviving rationale folded into the irl-tool-input-mapping SOP § Design provenance (BL-088 PR 4) |
| [MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md](MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md) | BL-045 IRL-ingestion harden + rename | 2026-06-03 (truth-passed 2026-07-15) | v0.1.0-era design + operator decisions; distilled into `mcp-server/src/docs/prompts/irl-ingestion.md` (BL-088 PR 4) |
| [MCP_SERVER_FILLED_IRL_INGESTION_BL-045_TOOL_SCHEMA_ENFORCEMENT_SPEC.md](MCP_SERVER_FILLED_IRL_INGESTION_BL-045_TOOL_SCHEMA_ENFORCEMENT_SPEC.md) | BL-045 `_audit` schema-enforcement spec | 2026-06-02 (0.4.0) | The StoreForce empirical pivot from body coaching to schema enforcement; distilled into `prompts/irl-ingestion.md` § Server-side enforcement (BL-088 PR 4) |
| [MCP_DOCS_DISTILLATION_BL-088.md](MCP_DOCS_DISTILLATION_BL-088.md) | BL-088 development-docs distillation | 2026-07-17 | The initiative that built this archive — disposition table, link policies, and 5-wave PR ledger; the first doc to complete the lifecycle it defined |

_BL-088 completed all five waves 2026-07-17 — every closed-initiative doc is distilled and archived; the full disposition record is [MCP_DOCS_DISTILLATION_BL-088.md](MCP_DOCS_DISTILLATION_BL-088.md) in this directory. Future closures append rows here per the [initiative-doc lifecycle](../README.md)._
