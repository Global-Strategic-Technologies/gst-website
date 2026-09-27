# GST Website Documentation

Master index for all project documentation.

## Directories

| Directory                      | Purpose                                                                                                                                                                                         | Entry Point                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| [adr/](adr/)                   | Architecture Decision Records — load-bearing design decisions distilled from closed initiatives                                                                                                 | [README.md](adr/README.md)                              |
| [analytics/](analytics/)       | GA4 integration, event tracking                                                                                                                                                                 | [README.md](analytics/README.md)                        |
| [architecture/](architecture/) | The whole estate — website + MCP server — mapped in the five layers of the Business Architectures article, with mermaid diagrams                                                                | [README.md](architecture/README.md)                     |
| [development/](development/)   | Roadmap, tooling, active initiatives (closed-initiative docs distill + archive per the [lifecycle](development/README.md#initiative-doc-lifecycle-convention-codified-2026-07-15-under-bl-088)) | [README.md](development/README.md)                      |
| [hub/](hub/)                   | Hub tool technical docs                                                                                                                                                                         | [README.md](hub/README.md)                              |
| [operations/](operations/)     | Secrets inventory, deploy, rotation                                                                                                                                                             | [SECRETS_INVENTORY.md](operations/SECRETS_INVENTORY.md) |
| [security/](security/)         | Headers, CSP, privacy, compliance                                                                                                                                                               | [README.md](security/README.md)                         |
| [seo/](seo/)                   | SEO implementation, JSON-LD                                                                                                                                                                     | [README.md](seo/README.md)                              |
| [styles/](styles/)             | CSS conventions, brand, tokens                                                                                                                                                                  | [README.md](styles/README.md)                           |
| [testing/](testing/)           | Test strategy, CI/CD, troubleshooting                                                                                                                                                           | [README.md](testing/README.md)                          |

### MCP server documentation

The `@gst/mcp-server` workspace maintains its **own** doc tree, not enumerated above — start at its navigator and architecture reference:

| Doc                                                                              | Purpose                                                                                                                                                   |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [mcp-server/src/docs/README.md](../../mcp-server/src/docs/README.md)             | Navigator for the server's internal docs — architecture, tools, resources, prompts, operations, testing                                                   |
| [mcp-server/src/docs/ARCHITECTURE.md](../../mcp-server/src/docs/ARCHITECTURE.md) | Maintained system reference: transport & request flow, auth/CORS/deploy topology, rate limiting, radar pipeline, observability (anchors are load-bearing) |

## Quick Navigation

| I need to...                                        | Go to                                                                                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Understand the design system                        | [styles/STYLES_GUIDE.md](styles/STYLES_GUIDE.md)                                                                                        |
| Write or fix tests                                  | [testing/TEST_BEST_PRACTICES.md](testing/TEST_BEST_PRACTICES.md)                                                                        |
| Understand CI/CD                                    | [testing/GITHUB_ACTIONS_SETUP.md](testing/GITHUB_ACTIONS_SETUP.md)                                                                      |
| Check lint/format tooling                           | [development/DEVELOPER_TOOLING.md](development/DEVELOPER_TOOLING.md)                                                                    |
| Publish the design system to claude.ai/design       | [development/CLAUDE_DESIGN_SYNC.md](development/CLAUDE_DESIGN_SYNC.md)                                                                  |
| Add a string, a page or a language                  | [development/LOCALIZATION.md](development/LOCALIZATION.md)                                                                              |
| Update SEO metadata                                 | [seo/SEO_IMPLEMENTATION.md](seo/SEO_IMPLEMENTATION.md)                                                                                  |
| Understand a hub tool                               | [hub/README.md](hub/README.md)                                                                                                          |
| Track analytics events                              | [analytics/GOOGLE_ANALYTICS.md](analytics/GOOGLE_ANALYTICS.md)                                                                          |
| Set up Sentry monitoring                            | [development/SENTRY_MANUAL_SETUP.md](development/SENTRY_MANUAL_SETUP.md)                                                                |
| Investigate a perf regression or read the dashboard | [development/PERFORMANCE_OBSERVABILITY.md](development/PERFORMANCE_OBSERVABILITY.md)                                                    |
| Understand security headers                         | [security/SECURITY_HEADERS.md](security/SECURITY_HEADERS.md)                                                                            |
| Find a secret / understand where each env var lives | [operations/SECRETS_INVENTORY.md](operations/SECRETS_INVENTORY.md)                                                                      |
| See the development roadmap                         | [development/README.md](development/README.md)                                                                                          |
| Set up branch protection                            | [testing/GITHUB_ACTIONS_SETUP.md](testing/GITHUB_ACTIONS_SETUP.md#branch-protection-rules)                                              |
| See the MCP server in a concrete scenario           | [mcp-server/src/docs/tools/diligence/USAGE.md](../../mcp-server/src/docs/tools/diligence/USAGE.md) (each tool ships its own `USAGE.md`) |
| Understand a Hub tool's input contract              | [mcp-server/src/docs/tools/README.md](../../mcp-server/src/docs/tools/README.md)                                                        |
| Understand the MCP server's internals               | [mcp-server/src/docs/ARCHITECTURE.md](../../mcp-server/src/docs/ARCHITECTURE.md)                                                        |
| See the whole estate mapped, layer by layer         | [architecture/README.md](architecture/README.md)                                                                                        |
| Look up an architecture decision (ADR)              | [adr/README.md](adr/README.md)                                                                                                          |
