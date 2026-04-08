# Testing & CI/CD Documentation

Complete reference for testing setup and continuous integration on the GST Website project.

## 📚 Documentation

Start with one of these based on your needs:

- **[INDEX.md](./INDEX.md)** - Navigation guide with use-case shortcuts
- **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** - One-page cheat sheet for common tasks
- **[TEST_STRATEGY.md](./TEST_STRATEGY.md)** - Comprehensive testing approach and patterns
- **[GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md)** - How to set up CI/CD pipeline
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Solutions to common testing and CI/CD issues
- **[BRANCH_PROTECTION_CONFIG.md](./BRANCH_PROTECTION_CONFIG.md)** - GitHub branch protection rules
- **[TEST_BEST_PRACTICES.md](./TEST_BEST_PRACTICES.md)** - E2E testing best practices and red flags

## Quick Facts

- **Total Tests**: 1,250 test cases (all passing)
  - Unit/Integration: 857 tests (Vitest)
  - E2E: 393 test cases (Playwright, × 3 browsers = 1,179 test runs)
- **Test Frameworks**: Vitest + Playwright
- **CI/CD Platform**: GitHub Actions (test.yml)
- **Coverage Target**: 70%+ (currently exceeding)

## Common Commands

```bash
# Run tests locally
npm run test                   # Watch mode
npm run test:run              # Single run (unit/integration)
npm run test:e2e              # E2E tests only
npm run test:all              # Everything

# View results
npm run test:ui               # Vitest UI (unit/integration)
npm run test:e2e:ui           # Playwright UI (E2E)
npm run test:e2e:debug        # Playwright debug mode

# Coverage report
npm run test:coverage         # With coverage metrics
```

## How It Works

1. **Local Development**: Run `npm run test:all` before pushing
2. **Push to GitHub**: Triggers `test.yml` workflow automatically
3. **GitHub Actions**: Runs full test suite (1,250 test cases) on every push/PR
4. **Branch Protection**: Requires all tests to pass before merge
5. **Vercel Deployment**: Auto-deploys on successful merge to master

## Where to Find Things

| Question | Answer |
|----------|--------|
| How do I run tests? | [QUICK_REFERENCE.md](./QUICK_REFERENCE.md#available-commands) |
| How does CI/CD work? | [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md) |
| How do I write tests? | [TEST_STRATEGY.md](./TEST_STRATEGY.md) |
| Tests are failing, what do I do? | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) |
| How do branch protection rules work? | [BRANCH_PROTECTION_CONFIG.md](./BRANCH_PROTECTION_CONFIG.md) |
| What are E2E best practices? | [TEST_BEST_PRACTICES.md](./TEST_BEST_PRACTICES.md) |

For more complex questions, use [INDEX.md](./INDEX.md) to find detailed documentation.
