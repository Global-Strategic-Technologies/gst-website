# Testing & CI/CD Documentation

Complete reference for testing setup and continuous integration on the GST Website project.

## By Use Case

| I need to...                  | Go to                                                         |
| ----------------------------- | ------------------------------------------------------------- |
| Get started with testing      | [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) (5 min)            |
| Run tests locally             | [QUICK_REFERENCE.md](./QUICK_REFERENCE.md#available-commands) |
| Fix failing tests             | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)                    |
| Understand the CI/CD pipeline | [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md)          |
| Write new tests               | [TEST_STRATEGY.md](./TEST_STRATEGY.md)                        |
| Follow E2E best practices     | [TEST_BEST_PRACTICES.md](./TEST_BEST_PRACTICES.md)            |
| Set up branch protection      | [BRANCH_PROTECTION_CONFIG.md](./BRANCH_PROTECTION_CONFIG.md)  |

## All Documentation

| File                                                         | Purpose                        | Read Time | Audience                 |
| ------------------------------------------------------------ | ------------------------------ | --------- | ------------------------ |
| [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)                   | Commands and common tasks      | 5 min     | Developers               |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)                   | Solutions to common issues     | 15 min    | Developers               |
| [TEST_STRATEGY.md](./TEST_STRATEGY.md)                       | Testing approach and patterns  | 30 min    | Architects, test writers |
| [TEST_BEST_PRACTICES.md](./TEST_BEST_PRACTICES.md)           | E2E patterns and anti-patterns | 15 min    | E2E test writers         |
| [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md)         | CI/CD pipeline setup           | 10 min    | DevOps, maintainers      |
| [BRANCH_PROTECTION_CONFIG.md](./BRANCH_PROTECTION_CONFIG.md) | GitHub branch rules            | 10 min    | Maintainers              |

## Quick Facts

- **Total Tests**: 906+ unit/integration (Vitest) + E2E (Playwright, 3 browsers)
- **Coverage Target**: 70%+ (threshold enforced via vitest config)
- **CI/CD**: GitHub Actions (`test.yml`) on push/PR to master
- **Accessibility**: `npm run test:a11y` — axe-core scan with ratchet

## Common Commands

```bash
npm run test:run              # Unit/integration (single run)
npm run test:e2e              # E2E tests (all browsers)
npm run test:all              # Everything
npm run test:coverage         # With coverage report
npm run test:a11y             # Accessibility scan (chromium)
```
