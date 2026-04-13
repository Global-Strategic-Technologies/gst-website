# Development Documentation

This directory contains strategic documentation for ongoing and proposed development initiatives.

## Contents

### [DEVELOPMENT_OPPORTUNITIES.md](./DEVELOPMENT_OPPORTUNITIES.md)

Strategic roadmap of development initiatives focused on:

- **Performance monitoring** (Lighthouse CI integration)
- **Test automation** (E2E and unit tests)
- **Code quality** (Error handling validation)

### [HUB_TOOLS_UX_UNIFICATION.md](./HUB_TOOLS_UX_UNIFICATION.md)

Cross-tool UX unification roadmap — identifies reusable UI patterns (copy feedback, benchmark tables, export bars, collapsibles, dark theme variables) for unification across all five hub tools.

### [TECH_DEBT_CALC_ROADMAP.md](./TECH_DEBT_CALC_ROADMAP.md)

Improvement roadmap for the Tech Debt Cost Calculator (17 initiatives across 7 priority tiers).

### [DYNAMIC_VISUAL_EFFECTS.md](./DYNAMIC_VISUAL_EFFECTS.md)

Exploration initiative evaluating whether ambient animated effects (grid pulses, floating particles, glow shifts) could enhance the homepage hero section without conflicting with the tech-brutalist brand identity. Includes 5 candidate effects ranked by brand alignment, evaluation criteria, and a time-boxed prototype plan.

### [PLATFORM_HARDENING_V1.md](./PLATFORM_HARDENING_V1.md)

8-phase platform hardening initiative to support the next 6 months of business growth. Covers data validation (Zod schemas), CI/CD (ESLint, pre-commit hooks, 3-job pipeline), CSS architecture (Astro scoped styles migration), test coverage & accessibility (axe-core), SEO, tool analytics standardization, error monitoring (Sentry), security headers, and documentation normalization. ~24-29 working days total effort.

### [BUSINESS_ENABLEMENT_V1.md](./BUSINESS_ENABLEMENT_V1.md)

Post-hardening follow-on initiative (~4 days) covering business-facing capabilities that require vendor selection and legal review: Cookie Consent / GDPR compliance (custom banner with GA4 Consent Mode) and Email Capture (footer signup form with Zod validation). Depends on Platform Hardening V1 being complete.

Each roadmap includes:

- Current state assessment with strengths and known issues
- Prioritized initiatives with effort/impact ratings
- Implementation notes and dependency maps

## Quick Summary

### Platform Initiatives

| Initiative                | Priority    | Effort                    | Start           |
| ------------------------- | ----------- | ------------------------- | --------------- |
| Lighthouse CI             | High        | 2-3h                      | Next            |
| E2E Image Tests           | High        | 30m                       | Next            |
| Unit Error Tests          | Medium      | 1-2h                      | Soon            |
| Perf Dashboard            | Low         | 1-2h                      | Later           |
| Dynamic Visual Effects    | Low         | 2-4h prototype            | Exploratory     |
| **Platform Hardening V1** | **High**    | **24-29 days (8 phases)** | **In Progress** |
| Business Enablement V1    | Medium-High | 4 days (2 initiatives)    | Post-hardening  |

### Hub Tools Control Consolidation

| Initiative                    | Phase | Effort | Impact |
| ----------------------------- | ----- | ------ | ------ |
| Copy-to-clipboard utility     | A     | Low    | High   |
| Benchmark table CSS           | A     | Low    | Medium |
| TechPar benchmark markers     | B     | Small  | Low    |
| Export action bar             | B     | Medium | Medium |
| Collapsible sections          | C     | Low    | Medium |
| Dark theme variable migration | C     | Medium | Medium |

## Recent Performance Improvements

The following optimizations were completed in February 2026:

✅ **LCP Optimization** - Removed lazy loading, added `fetchpriority="high"`
✅ **Network Optimization** - Added preconnect/dns-prefetch hints
✅ **Console Error Fixes** - Added null checks and error handling across 5 components

See [DEVELOPMENT_OPPORTUNITIES.md](./DEVELOPMENT_OPPORTUNITIES.md) for details.

## How to Use This Directory

- **For new features:** Check "Development Opportunities" for related initiatives
- **For performance work:** Reference implementation examples and testing patterns
- **For maintenance:** Use as historical record of strategic decisions

## Contributing

When adding new initiatives:

1. Add a new section to DEVELOPMENT_OPPORTUNITIES.md
2. Follow the template: Overview → Problem → Solution → ROI
3. Include implementation checklist and success metrics
4. Update the summary table

---

_Last Updated: April 9, 2026_
