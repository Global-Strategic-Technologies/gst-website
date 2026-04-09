# Testing & CI/CD Documentation Index

Navigation guide to all testing and continuous integration documentation.

## 📖 By Use Case

### "I'm new to this project's testing setup"
1. Start: [README.md](./README.md) - Overview (5 min)
2. Then: [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) - Common commands (5 min)
3. Deep dive: [TEST_STRATEGY.md](./TEST_STRATEGY.md) - Comprehensive guide (30 min)

### "I need to run tests locally"
→ [QUICK_REFERENCE.md](./QUICK_REFERENCE.md#available-commands) - Commands section

### "Tests failed, I need to fix them"
→ [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Complete troubleshooting guide

### "I want to understand the CI/CD pipeline"
→ [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md) - Complete setup guide

### "I'm writing new tests"
→ [TEST_STRATEGY.md](./TEST_STRATEGY.md) - Test patterns by component

### "I need to understand E2E testing best practices"
→ [TEST_BEST_PRACTICES.md](./TEST_BEST_PRACTICES.md) - Patterns and anti-patterns

### "I'm setting up branch protection on GitHub"
→ [BRANCH_PROTECTION_CONFIG.md](./BRANCH_PROTECTION_CONFIG.md) - Step-by-step guide

### "I want an architecture overview"
→ [CI_CD_SUMMARY.md](./CI_CD_SUMMARY.md) - System architecture

## 📚 All Documentation Files

| File | Purpose | Read Time | Audience |
|------|---------|-----------|----------|
| [README.md](./README.md) | Overview & quick facts | 5 min | Everyone |
| [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) | Commands & common tasks | 5 min | Developers |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Solutions to common issues | 15 min | Developers with problems |
| [TEST_STRATEGY.md](./TEST_STRATEGY.md) | Testing approach & patterns | 30 min | Architects, test writers |
| [TEST_BEST_PRACTICES.md](./TEST_BEST_PRACTICES.md) | E2E patterns & anti-patterns | 15 min | E2E test writers |
| [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md) | CI/CD pipeline setup | 10 min | DevOps, maintainers |
| [CI_CD_SUMMARY.md](./CI_CD_SUMMARY.md) | Architecture & integration | 10 min | Architects |
| [BRANCH_PROTECTION_CONFIG.md](./BRANCH_PROTECTION_CONFIG.md) | GitHub branch rules | 10 min | Maintainers |

## 📊 Test Suite Status

- **Total**: 800+ tests (100% passing)
  - **Unit/Integration**: 22 files
  - **E2E**: 24 files × 3 browsers
- **Coverage**: 70%+ (exceeds target)
- **Framework**: Vitest + Playwright
- **CI/CD**: GitHub Actions (test.yml)

---

**For step-by-step getting started, see [README.md](./README.md).**
