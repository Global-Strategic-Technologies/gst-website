# MCP Server Documentation

> **Audience**: engineers and senior consultants working on the `@gst/mcp-server` workspace.
>
> This is the navigator for the MCP server's internal doc surface. For the user-facing tool/resource/prompt inventory, start at [`mcp-server/README.md`](../../README.md).

The docs are organized by **what** they describe — the three MCP capability surfaces (Tools, Resources, Prompts), plus operational and testing references.

## Capability surfaces

| Area          | Doc                                          | What's there                                                                                                                                                        |
| ------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tools**     | [`tools/README.md`](tools/README.md)         | Registry of per-tool **input contracts** — the structured input every MCP tool accepts, the pattern, and per-tool `CONTRACT.md` + `USAGE.md` under `tools/<tool>/`. |
| **Resources** | [`resources/README.md`](resources/README.md) | The read-only `gst://` **URI taxonomy** — Library, Regulations, and Radar families.                                                                                 |
| **Prompts**   | [`prompts/README.md`](prompts/README.md)     | The registered-prompt pattern — typed, versioned macros that compose Tools + Resources into workflows.                                                              |

## Operations & testing

| Area           | Doc                                      | What's there                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Operations** | [`operations/`](operations/)             | Live runbooks: [`AUTH.md`](operations/AUTH.md), [`DEPLOY.md`](operations/DEPLOY.md), [`RATE_LIMITS.md`](operations/RATE_LIMITS.md), [`REMOTE_CLIENT_SETUP.md`](operations/REMOTE_CLIENT_SETUP.md), [`SENTRY_ALERT_RULES.md`](operations/SENTRY_ALERT_RULES.md), [`INOREADER_OAUTH_CONTRACT.md`](operations/INOREADER_OAUTH_CONTRACT.md). Closed-initiative trackers live in [`operations/_archive/`](operations/_archive/). |
| **Testing**    | [`testing/README.md`](testing/README.md) | What the MCP test suite covers, how to run it, and how to add a test.                                                                                                                                                                                                                                                                                                                                                       |

## Cross-tool SOP

| Doc                                                                      | What's there                                                                                                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`library/irl-tool-input-mapping.md`](library/irl-tool-input-mapping.md) | Engineering-side SOP mapping Information Request List bullets → the Hub tool / MCP prompt inputs they feed. Dual-sourced with `src/data/library/information-request-list/article.md`. |

## Planning artifacts (not here)

Architectural decision records and per-initiative plans live under [`src/docs/development/`](../../../src/docs/development/) as `MCP_SERVER_*.md`. Those are **point-in-time records** — frozen at authoring time, not maintained against later code. The docs in _this_ tree (per-tool contracts, the resource taxonomy, the prompt reference, operations runbooks) **are** maintained.

---

_Last updated: 2026-07-02 (BL-034 doc-structure pass — added this navigator + `tools/` `resources/` taxonomy)._
