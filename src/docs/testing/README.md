# Testing & CI/CD Documentation

What to test at each tier, where tests live, and what E2E does in CI. Commands, the full CI pipeline and the required checks are owned by [DEVELOPER_TOOLING.md](../development/DEVELOPER_TOOLING.md); these docs link there rather than repeat it.

## By Use Case

| I need to...              | Go to                                                                        |
| ------------------------- | ---------------------------------------------------------------------------- |
| Run tests locally         | [§ Common commands](#common-commands) below                                  |
| Fix failing tests         | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)                                   |
| Understand what CI runs   | [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md)                         |
| Check the required checks | [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md#branch-protection-rules) |
| Write new tests           | [TEST_STRATEGY.md](./TEST_STRATEGY.md)                                       |
| Follow E2E best practices | [TEST_BEST_PRACTICES.md](./TEST_BEST_PRACTICES.md)                           |

## All Documentation

| File                                                 | Purpose                                                 | Audience                |
| ---------------------------------------------------- | ------------------------------------------------------- | ----------------------- |
| [TEST_STRATEGY.md](./TEST_STRATEGY.md)               | What to test at each tier, and the patterns for each    | Test writers            |
| [TEST_BEST_PRACTICES.md](./TEST_BEST_PRACTICES.md)   | Numbered catalog of E2E anti-patterns and their fixes   | E2E test writers        |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)           | Solutions to common failures, local and CI              | Developers              |
| [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md) | The workflows, which checks are required, what E2E does | Developers, maintainers |

## Quick Facts

- **Unit and integration**: Vitest, Node environment, globals on (`vitest.config.ts`). Do not write value imports from `'vitest'` — ESLint bans them; a type-only import is fine.
- **Coverage**: 70% line threshold over `src/utils/**`, `src/data/**/*.ts`, `src/scripts/*/logic.ts` and `src/scripts/techpar/state.ts`, with browser-only modules excluded (the list is in `vitest.config.ts`).
- **E2E**: Playwright with chromium, firefox and webkit projects. Local `npm run test:e2e` runs all three. The required CI job runs chromium only; the full three-browser run is the manual `test-cross-browser.yml` workflow.
- **Accessibility**: `npm run test:a11y` — axe-core scan with ratchet, plus the orphan-class scan (BL-116: every DOM class needs a CSS rule or a reasoned `ALLOWED_UNSTYLED` entry). See [DEVELOPER_TOOLING § Accessibility testing](../development/DEVELOPER_TOOLING.md#accessibility-testing).

## Common commands

```bash
npm run test:run                          # Unit + integration, once (site only)
npm test                                  # Same, in watch mode
npm run test:ui                           # Vitest UI in the browser
npm run test:coverage                     # With coverage report (coverage/index.html)
npx vitest run tests/unit/filterLogic.test.ts   # One file
npx vitest run -t "categorizeGrowthStage"       # Tests whose name matches

npm run test:e2e                          # E2E, all three browsers
npm run test:e2e -- --project=chromium    # E2E, chromium only (what CI's required job runs)
npm run test:e2e:ui                       # Playwright UI mode
npm run test:e2e:debug                    # Playwright Inspector, step by step
npx playwright show-report                # Open the last HTML report
npm run test:a11y                         # Accessibility scan (chromium)

npm run test:docs                         # Docs guards (links, anchors, parity) — a required check
npm run test:mcp                          # MCP server workspace suite
npm run test:all                          # test:run + test:e2e + test:mcp
```

Run E2E only when the change calls for it (see `.claude/CLAUDE.md` Directive 5). The pre-push validation sequence is in [DEVELOPER_TOOLING § Quick reference](../development/DEVELOPER_TOOLING.md#quick-reference).

## Layout

```
tests/
├── unit/          # Fast, isolated, mocked — pure functions, engines, data validation
├── integration/   # Guards and contracts over real files: docs links, token parity,
│   │              #   CSS rules, workflow structure, MCP registry, i18n catalogs
│   └── helpers/   # astro-markup, css-parse, mcp-registry, workflow-parse
├── e2e/           # Playwright specs — critical user journeys, one file per page or feature
│   ├── helpers/   # a11y, theme, palette, storage-baseline, radar, portfolio, …
│   ├── global-setup.ts / global-teardown.ts
└── __mocks__/     # Stubs for astro:env/server, astro:env/client, astro:middleware
```

There is no `tests/fixtures/` or `tests/visual/`. Every E2E context starts from the baseline `storageState` in `tests/e2e/helpers/storage-baseline.ts` (palette 0, light theme, ambient motion off), so no spec depends on the date's rotated look.

## Workspace test suites

The MCP server (`mcp-server/`) ships a separate vitest suite that lives outside this site's test pipeline. It runs in its own GitHub Actions workflow ([`.github/workflows/test-mcp-server.yml`](../../../.github/workflows/test-mcp-server.yml)) and is invoked locally via `npm run test:mcp` (also chained into `npm run test:all`). For its conventions, coverage targets, file layout, and how to add new tests, see [mcp-server/src/docs/testing/README.md](../../../mcp-server/src/docs/testing/README.md).

---

<- Back to [Master Documentation Index](../README.md)
