# Development Documentation

This directory contains strategic documentation for ongoing and proposed development initiatives.

## Contents

### [DEVELOPMENT_OPPORTUNITIES.md](./DEVELOPMENT_OPPORTUNITIES.md)

Strategic roadmap of development initiatives focused on:
- **Performance monitoring** (Lighthouse CI integration)
- **Test automation** (E2E and unit tests)
- **Code quality** (Error handling validation)

### [TECHPAR_ROADMAP.md](./TECHPAR_ROADMAP.md)

Improvement roadmap for the TechPar technology cost benchmarking tool (19 initiatives across 8 priority tiers):
- **Shareable state & export** (URL encoding, copy summary, print stylesheet)
- **Data persistence** (localStorage session continuity)
- **Scenario comparison** (baseline snapshot & delta overlay)
- **Labeling & benchmark accuracy** (chart labels, dated sources, CapEx benchmarks)
- **Currency support, chart improvements, workbench integration, architecture**

### [TECH_DEBT_CALC_ROADMAP.md](./TECH_DEBT_CALC_ROADMAP.md)

Improvement roadmap for the Tech Debt Cost Calculator (17 initiatives across 7 priority tiers).

Each roadmap includes:
- Current state assessment with strengths and known issues
- Prioritized initiatives with effort/impact ratings
- Implementation notes and dependency maps

## Quick Summary

### Platform Initiatives

| Initiative | Priority | Effort | Start |
|-----------|----------|--------|-------|
| Lighthouse CI | High | 2-3h | Next |
| E2E Image Tests | High | 30m | Next |
| Unit Error Tests | Medium | 1-2h | Soon |
| Perf Dashboard | Low | 1-2h | Later |

### TechPar (Highest-ROI Cluster)

| Initiative | Priority | Effort | Impact |
|-----------|----------|--------|--------|
| URL-encoded state | P1 | S | High |
| Copy link button | P1 | XS | High |
| Plain-text export | P1 | XS | High |
| Print stylesheet | P1 | XS | Medium |
| localStorage persistence | P2 | S | High |
| Scenario comparison | P3 | M | High |

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

*Last Updated: March 19, 2026*
