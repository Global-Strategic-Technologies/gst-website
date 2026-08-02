# MCP Server Documentation

> **Audience**: engineers and senior consultants working on the `@gst/mcp-server` workspace.
>
> This is the navigator for the MCP server's internal doc surface. For the user-facing tool/resource/prompt inventory, start at [`mcp-server/README.md`](../../README.md). For website-side documentation (styles, testing, SEO, analytics, security, roadmap), start at the [repo documentation master index](../../../src/docs/README.md).

The docs are organized by **what** they describe — the system architecture, the three MCP capability surfaces (Tools, Resources, Prompts), plus operational and testing references.

## Architecture

| Area             | Doc                                  | What's there                                                                                                                                                                                          |
| ---------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Architecture** | [`ARCHITECTURE.md`](ARCHITECTURE.md) | The maintained system reference: system shape, remote transport & request flow, auth/CORS/deploy topology, rate limiting & Inoreader budget, Resources/Prompts wiring, radar pipeline, observability. |

## Capability surfaces

| Area          | Doc                                          | What's there                                                                                                                                                                                                    |
| ------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tools**     | [`tools/README.md`](tools/README.md)         | Registry of per-tool **input contracts** — the structured input every MCP tool accepts, the pattern, and per-tool `CONTRACT.md` + `USAGE.md` under `tools/<tool>/`.                                             |
| **Resources** | [`resources/README.md`](resources/README.md) | The read-only `gst://` **URI taxonomy** — Library, Regulations, and Radar families.                                                                                                                             |
| **Prompts**   | [`prompts/README.md`](prompts/README.md)     | The registered-prompt pattern — typed, versioned macros that compose Tools + Resources into workflows. Complex prompts get a per-prompt companion doc ([`prompts/irl-ingestion.md`](prompts/irl-ingestion.md)). |

## Operations & testing

| Area           | Doc                                      | What's there                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Operations** | [`operations/`](operations/)             | Live runbooks: [`AUTH.md`](operations/AUTH.md), [`PILOT_ONBOARDING.md`](operations/PILOT_ONBOARDING.md), [`DEPLOY.md`](operations/DEPLOY.md), [`RATE_LIMITS.md`](operations/RATE_LIMITS.md), [`REMOTE_CLIENT_SETUP.md`](operations/REMOTE_CLIENT_SETUP.md), [`AUDIT_LOG.md`](operations/AUDIT_LOG.md), [`STATUS_PAGE.md`](operations/STATUS_PAGE.md), [`LATENCY_PROBE.md`](operations/LATENCY_PROBE.md), [`SENTRY_ALERT_RULES.md`](operations/SENTRY_ALERT_RULES.md), [`INOREADER_OAUTH_CONTRACT.md`](operations/INOREADER_OAUTH_CONTRACT.md). Closed-initiative trackers live in [`operations/_archive/`](operations/_archive/). |
| **Testing**    | [`testing/README.md`](testing/README.md) | What the MCP test suite covers, how to run it, and how to add a test.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## Cross-tool SOP

| Doc                                                                      | What's there                                                                                                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`library/irl-tool-input-mapping.md`](library/irl-tool-input-mapping.md) | Engineering-side SOP mapping Information Request List bullets → the Hub tool / MCP prompt inputs they feed. Dual-sourced with `src/data/library/information-request-list/article.md`. |

## Planning artifacts (not here)

Per-initiative plans are **point-in-time records** — frozen at authoring time, not maintained against later code. Closed initiatives' docs are distilled into the maintained surface (this tree, headed by [`ARCHITECTURE.md`](ARCHITECTURE.md)) and then archived at [`src/docs/development/_archive/`](../../../src/docs/development/_archive/README.md) per the [initiative-doc lifecycle](../../../src/docs/development/README.md); any still-open initiative docs remain under [`src/docs/development/`](../../../src/docs/development/). The docs in _this_ tree (the architecture reference, per-tool contracts, the resource taxonomy, the prompt reference, operations runbooks) **are** maintained.

---

_Last updated: 2026-07-18 (docs-wiring pass — added backlink to the repo documentation master index). Prior: 2026-07-17 (BL-088 PR 2 — added `ARCHITECTURE.md` + lifecycle pointer); 2026-07-02 (BL-034 doc-structure pass)._
