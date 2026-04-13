# Development Documentation

Strategic documentation for ongoing, proposed, and completed development initiatives.

## Initiative Roadmap

| Initiative                   | Status                    | Effort                  | Doc                                                          |
| ---------------------------- | ------------------------- | ----------------------- | ------------------------------------------------------------ |
| **Platform Hardening V1**    | **In Progress** (Phase 9) | ~25-30 days (9 phases)  | [PLATFORM_HARDENING_V1.md](./PLATFORM_HARDENING_V1.md)       |
| Business Enablement V1       | Proposed (post-hardening) | ~4 days                 | [BUSINESS_ENABLEMENT_V1.md](./BUSINESS_ENABLEMENT_V1.md)     |
| Hub Tools UX Unification     | Proposed                  | Medium                  | [HUB_TOOLS_UX_UNIFICATION.md](./HUB_TOOLS_UX_UNIFICATION.md) |
| Dynamic Visual Effects       | Exploratory               | 2-4h prototype          | [DYNAMIC_VISUAL_EFFECTS.md](./DYNAMIC_VISUAL_EFFECTS.md)     |
| BIMI Visual Trust            | Proposed                  | Depends on trademark    | [BIMI_VISUAL_TRUST.md](./BIMI_VISUAL_TRUST.md)               |
| MCP Server Initiative        | Proposed                  | TBD                     | [MCP_SERVER_INITIATIVE.md](./MCP_SERVER_INITIATIVE.md)       |
| Tech Debt Calculator Roadmap | Evergreen                 | 17 items across 7 tiers | [TECH_DEBT_CALC_ROADMAP.md](./TECH_DEBT_CALC_ROADMAP.md)     |

**Dependency chain**: Platform Hardening V1 → Business Enablement V1 → all other initiatives can proceed independently.

## Reference Docs

| Doc                                                                          | Purpose                                                                                                                 |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [DEVELOPER_TOOLING.md](./DEVELOPER_TOOLING.md)                               | Authoritative reference for lint, format, hooks, CI, Sentry, browser targets                                            |
| [DEVELOPMENT_OPPORTUNITIES.md](./DEVELOPMENT_OPPORTUNITIES.md)               | Evergreen backlog of testing, performance, and quality initiatives                                                      |
| [PERFORMANCE_FUTURE_INITIATIVES.md](./PERFORMANCE_FUTURE_INITIATIVES.md)     | Deferred performance optimizations (CSS splitting, build tooling). See also DEVELOPMENT_OPPORTUNITIES for related items |
| [DESIGN_SYSTEM_FUTURE_INITIATIVES.md](./DESIGN_SYSTEM_FUTURE_INITIATIVES.md) | Design system maturity items (opacity scales, border variables, accessibility)                                          |
| [FAVICON_AND_ICONS.md](./FAVICON_AND_ICONS.md)                               | Favicon/icon system across browsers, iOS, Android, PWA                                                                  |
| [STYLES_REMEDIATION_ROADMAP.md](../styles/STYLES_REMEDIATION_ROADMAP.md)     | Tracked CSS improvements (12 initiatives with status)                                                                   |

## Archived (Completed)

These documents record completed initiatives retained for historical context:

| Doc                                                                    | Completed                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| [HUB_TOOLS_BRUTALIST_MIGRATION.md](./HUB_TOOLS_BRUTALIST_MIGRATION.md) | April 2026 — migrated 5 hub tools to brutalist design system |
| [SITE_WIDE_BRUTALIST_MIGRATION.md](./SITE_WIDE_BRUTALIST_MIGRATION.md) | April 2026 — extended brutalist design to all site pages     |

## How to Use

- **Starting work?** Check the Initiative Roadmap for active and proposed items
- **Configuring tooling?** Read [DEVELOPER_TOOLING.md](./DEVELOPER_TOOLING.md) first
- **Writing CSS?** Start at [../styles/README.md](../styles/README.md)
- **Writing tests?** Start at [../testing/README.md](../testing/README.md)

---

_Last Updated: April 13, 2026_
