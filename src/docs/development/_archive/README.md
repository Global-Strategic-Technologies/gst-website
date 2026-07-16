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

_Later BL-088 waves append rows here as the distill-then-archive PRs land (see [MCP_DOCS_DISTILLATION_BL-088.md](../MCP_DOCS_DISTILLATION_BL-088.md))._
