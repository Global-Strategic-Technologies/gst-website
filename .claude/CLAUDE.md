# Claude Context for GST Website Project

This document provides Claude with essential context about the GST Website project, enabling it to provide more targeted and effective assistance.

---

## 🔧 Claude Workflow Directives

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately - don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy to Keep Main Context Window Clean

- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop

- After ANY correction from the user: update `.claude/tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run unit and integration tests to verify correctness
- **Do NOT run E2E tests unless explicitly told to do so** — except when the task itself is writing or fixing E2E tests, in which case running them _is_ the verification step (use `--project=chromium` for a fast single-browser check)

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes - don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests → then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

### 7. Technical Documentation Reference

- For API docs, framework features, or web standards: query **Context7 MCP Server** first
- Don't rely on training data alone for rapidly-evolving standards (Schema.org, Astro, etc.)
- Fallback: WebSearch/WebFetch to official documentation sources

### 8. Content Changes Must Include Test Updates

- After ANY content/copy change (brand names, headings, CTA text, labels), **grep `tests/` for every old string** before committing
- E2E tests frequently assert on visible text content — changing source without updating tests breaks CI
- Run: `grep -r "OLD_STRING" tests/` for each string replaced
- This is a **blocking step** — do not commit content changes without this check

### 9. Commit Convention

- Use conventional commits: `feat()`, `fix()`, `refactor()`, `docs()`, `chore()`, `test()`
- Scope in parentheses: `feat(design-system):`, `fix(e2e):`, `docs(brand):`
- Message body explains **why**, not what (the diff shows what)
- Group logically distinct changes into separate commits

### 10. PR Scope Must Match New Commits Only

- When `dev` has been incrementally merged to `master` via prior PRs, `git log master..dev` shows ALL divergence — not just new work
- Before creating a PR, identify the last merge point and only include commits after it
- Use `git log origin/dev..dev` to see what's actually new and unmerged

### 11. Developer Tooling is Authoritative

- Before suggesting or implementing changes to linting, formatting, type-checking, pre-commit hooks, or CI, read [DEVELOPER_TOOLING.md](../src/docs/development/DEVELOPER_TOOLING.md) first
- The authoritative local validation sequence (matches CI) is:
  ```
  npx astro check && npm run lint && npm run lint:css && npm run test:run
  ```
  If all four pass locally, CI will almost certainly pass
- **Every commit is auto-formatted by the husky pre-commit hook** — lint-staged runs `eslint --fix` then `prettier --write` on staged files. Your staged files may look different in the final commit than in your working tree. This is intentional and documented
- **`npm audit` policy**: production dependencies must stay at zero advisories (enforced via `--audit-level=moderate --omit=dev` in CI). Dev-only advisories are tolerated case-by-case
- **Do not add or edit hooks, lint configs, or CI jobs without updating [DEVELOPER_TOOLING.md](../src/docs/development/DEVELOPER_TOOLING.md)** — the doc is the single source of truth for new contributors and future sessions
- **Do not use `git commit --no-verify`** unless you are explicitly told the change is an emergency and the user has agreed to the follow-up. CI will still enforce what the hook would have caught, so `--no-verify` only defers the problem

### 12. One Command Per Bash Call (Avoid Permission-Prompt Thrash)

Claude Code's permission matcher evaluates the ENTIRE command string against the `allow` list in [`.claude/settings.local.json`](../.claude/settings.local.json). A compound command like `cd X && npm run Y | tee Z` is ONE string that matches no wildcard, even when every individual command (`cd`, `npm run`, `tee`) is pre-approved. The result: a permission prompt for work the user already authorized.

**Rules:**

- **Never chain with `&&`, `||`, or `;`** across Bash tool calls. Use one call per command and let prior calls complete naturally.
- **Pipes are permitted only when the entire pipeline fits a single allow-list pattern.** `git log --oneline | head -20` works because `Bash(git *)` covers it and `head` is pre-approved too; but in practice most pipes mix tool families (e.g. `npm run X | tee /tmp/Y`) and trip the matcher. When in doubt, write to a file via the Write tool or split into two Bash calls.
- **Prefer dedicated tools over shell pipelines.** `Grep` for content search, `Glob` for file patterns, `Read` for file contents — these bypass the shell entirely and are always allowed.
- **Redirections and env-prefixes count.** `cmd > /tmp/out.txt`, `FOO=bar cmd`, `cmd 2>&1 | tail -5` are all compound strings to the matcher. Sidestep by writing the output via the Write tool, or by running the base command and parsing the result in the next call.
- **Exception — genuine sequential coupling.** If two commands MUST be atomic (e.g. `git add X && git commit -m …` where the user explicitly authorized one combined action), keep them together. The cost of one prompt is lower than the cost of a half-applied state.

This rule exists to reduce user prompt fatigue. A single compound command that thrashes the approval loop is worse than three clean calls that just work.

---

## 📋 Project Overview

**GST Website** - A modern, high-performance static site for Global Strategic Technologies built with Astro and deployed to Vercel.

- **Framework**: Astro 6.x
- **Build Tool**: Vite
- **Deployment**: Vercel
- **Testing**: Vitest (unit/integration) + Playwright (E2E)
- **Package Manager**: npm
- **Node Version**: 22+ (LTS)

## 🎨 Design System

- **Design Philosophy**: Tech brutalist with dark mode support and frosted-glass aesthetic
- **All design tokens** (colors, spacing, typography, transitions): [src/docs/styles/VARIABLES_REFERENCE.md](src/docs/styles/VARIABLES_REFERENCE.md)
- **Conventions and patterns**: [src/docs/styles/STYLES_GUIDE.md](src/docs/styles/STYLES_GUIDE.md)
- **Brand decisions** (color hierarchy, palettes, voice, asset rules): [src/docs/styles/BRAND_GUIDELINES.md](src/docs/styles/BRAND_GUIDELINES.md)
- **Palette system**: 6 alternative color palettes in `src/styles/palettes.css` — applied to `<html>` via class, persisted in localStorage
- **Delta icon**: Use `DeltaIcon.astro` component (inline SVG with `currentColor`) — never `<img>` tags

## 🗂️ Project Structure

```
gst-website/
├── public/                    # Static assets (favicon, images, manifest)
│   └── data/                 # Runtime-fetched data (TopoJSON, regulation JSON)
├── src/
│   ├── components/           # Astro components
│   │   ├── DeltaIcon.astro   # Palette-aware inline SVG delta (use instead of <img>)
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   ├── Hero.astro
│   │   ├── ThemeToggle.astro
│   │   ├── SEO.astro
│   │   ├── GoogleAnalytics.astro
│   │   ├── Breadcrumb.astro
│   │   ├── ... (14 root components)
│   │   ├── brand/            # Brand page components (PalettePanel, ColorSpecimens)
│   │   ├── hub/              # Hub page components (HubHeader, tool sub-components)
│   │   ├── portfolio/        # M&A portfolio components (grid, modal, filters)
│   │   └── radar/            # Radar feed components (FyiItem, CategoryFilter)
│   ├── data/                 # Structured data
│   │   ├── ma-portfolio/
│   │   │   └── projects.json # 57 validated projects
│   │   ├── palettes.ts       # Shared palette metadata (names, concepts, tips)
│   │   ├── diligence-machine/# Attention areas, questions, wizard config
│   │   ├── infrastructure-cost-governance/  # Domains, recommendations
│   │   ├── techpar/          # Industry notes, recommendations, stages
│   │   └── regulatory-map/   # 120 regulation JSON files
│   ├── scripts/              # Client-side TypeScript modules
│   │   └── palette-manager.ts# Site-wide palette switching, color editing, panel controls
│   ├── docs/                 # Strategic documentation
│   │   ├── testing/          # Test strategy & CI/CD docs
│   │   ├── development/      # Development roadmap
│   │   ├── analytics/        # GA4 integration guides
│   │   ├── styles/           # CSS conventions, brand guidelines, variable reference
│   │   ├── hub/              # Hub tool technical docs (Radar, DM, RegMap)
│   │   └── seo/              # SEO implementation, JSON-LD, credentials
│   ├── layouts/              # Page layouts
│   │   └── BaseLayout.astro  # Includes Header, Footer, PalettePanel, theme/palette init
│   ├── pages/                # Route files (auto-routed)
│   │   ├── index.astro       # Homepage
│   │   ├── brand.astro       # Brand style reference (palette explorer, specimens)
│   │   ├── hub/              # Hub gateway + 6 tool pages + library articles
│   │   └── ...               # services, about, ma-portfolio, privacy, terms
│   └── styles/               # Global CSS (import order matters)
│       ├── variables.css     # Design tokens (:root + html.dark-theme)
│       ├── palettes.css      # 6 alternative palette definitions (html.palette-N)
│       ├── typography.css    # Semantic text utility classes
│       ├── interactions.css  # Interactive state patterns (hover, focus, chevron)
│       └── global.css        # Layout, components, responsive — imports all above
├── .claude/
│   ├── agents/               # Claude agent definitions
│   └── ...
├── tests/                    # Test files
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .github/workflows/        # CI/CD pipelines
├── vitest.config.ts          # Vitest configuration
├── playwright.config.ts      # Playwright configuration
├── astro.config.mjs          # Astro configuration
├── package.json
└── README.md
```

## 🚀 Key Development Commands

```bash
# Development
npm run dev                    # Start dev server (http://localhost:4321)
npm run build                  # Build for production
npm run preview               # Preview production build locally

# Testing
npm run test                   # Run tests in watch mode
npm run test:run              # Run all tests once
npm run test:coverage         # Run with coverage report
npm run test:e2e              # Run E2E tests
npm run test:e2e:ui           # E2E tests with visual UI
npm run test:e2e:debug        # E2E tests with debugger
npm run test:all              # Run all tests (unit + integration + E2E)
npm run test:ui               # Visual test UI

# Radar (see src/docs/hub/RADAR.md § Working Offline)
npm run radar:seed            # Seed dev cache with mock data for offline/rate-limited dev
npm run radar:unseed          # Clear seeded mock data, return to live API

# Other
npm run astro                 # Run Astro CLI
```

## 📚 Critical Documentation

**Master index**: [src/docs/README.md](src/docs/README.md) — links to all 6 documentation directories with use-case navigation. Start here when looking for any project documentation.

### Developer Tooling (Lint, Format, Hooks, CI)

- **Authoritative reference**: [src/docs/development/DEVELOPER_TOOLING.md](src/docs/development/DEVELOPER_TOOLING.md) — quick-reference table of all scripts, pre-commit hook flow, CI pipeline diagram, config file locations, troubleshooting
- **When to read it**: before touching `.prettierrc.json`, `eslint.config.mjs`, `.stylelintrc.json`, `tsconfig.json`, `.husky/*`, `.github/workflows/test.yml`, or the `scripts` / `lint-staged` / `overrides` sections of `package.json`
- **Local validation command** (matches CI): `npx astro check && npm run lint && npm run lint:css && npm run test:run`

### Testing & CI/CD

- **Start here**: [src/docs/testing/README.md](src/docs/testing/README.md) — use-case-based navigation to all testing docs
- **Writing or fixing E2E tests**: read [src/docs/testing/TEST_BEST_PRACTICES.md](src/docs/testing/TEST_BEST_PRACTICES.md) first — 25 documented anti-patterns and their fixes
- **Writing new tests**: read [src/docs/testing/TEST_STRATEGY.md](src/docs/testing/TEST_STRATEGY.md) for test patterns by component type
- **Tests failing**: check [src/docs/testing/TROUBLESHOOTING.md](src/docs/testing/TROUBLESHOOTING.md) before debugging manually

### Development Roadmap

- **Platform Hardening V1**: [src/docs/development/PLATFORM_HARDENING_V1.md](src/docs/development/PLATFORM_HARDENING_V1.md) - 9-phase foundation initiative (complete)
- **Business Enablement V1**: [src/docs/development/BUSINESS_ENABLEMENT_V1.md](src/docs/development/BUSINESS_ENABLEMENT_V1.md) - Next steps: Cookie Consent, Email Capture, light-dark() migration
- **Development Opportunities**: [src/docs/development/DEVELOPMENT_OPPORTUNITIES.md](src/docs/development/DEVELOPMENT_OPPORTUNITIES.md) - Strategic initiatives + deferred performance work
- **Sentry Setup**: [src/docs/development/SENTRY_MANUAL_SETUP.md](src/docs/development/SENTRY_MANUAL_SETUP.md) - Alert rules, source maps, consent gating

### Security

- **Security headers & CSP**: [src/docs/security/SECURITY_HEADERS.md](src/docs/security/SECURITY_HEADERS.md) — header inventory, CSP allowlist, how to add external services
- **Before adding any external script, API, or embed**: check the CSP allowlist and update both `vercel.json` and `src/middleware.ts`

### Analytics

- **Google Analytics Setup**: [src/docs/analytics/GOOGLE_ANALYTICS.md](src/docs/analytics/GOOGLE_ANALYTICS.md) - GA4 integration guide
- **Analytics Documentation**: [src/docs/analytics/README.md](src/docs/analytics/README.md)

## 🤖 Claude Agents

Specialized agents in `.claude/agents/`. Use the right agent for the task:

| Agent                            | Use When                                                |
| -------------------------------- | ------------------------------------------------------- |
| **code-reviewer**                | After code changes — quality, security, maintainability |
| **javascript-typescript-expert** | Architecture decisions, performance optimization        |
| **test-automation-specialist**   | Implementing tests, designing test strategies           |
| **test-strategy-architect**      | Test pyramid design, coverage analysis, CI/CD workflows |
| **ui-ux-playwright-reviewer**    | E2E test strategy, Playwright patterns                  |
| **performance-testing-expert**   | Load testing, performance regression detection          |
| **technical-debt-analyst**       | Refactoring, complexity analysis, debt reduction        |

## 🔄 Git Workflow

### Branch Strategy

- **Main Branch**: `master` (production-ready)
- **Development Branch**: `dev` (active development)
- **Feature Branches**: Created from `dev`, merged back via PR

### PR Requirements

- All tests must pass (unit, integration, E2E)
- Code review required
- Coverage thresholds must be met (70%+)
- CI/CD checks must pass

## 📊 Data Management

### Portfolio Data

- **Source**: `src/data/ma-portfolio/projects.json`
- **Content**: 57 active projects with validated schema
- **Fields**: id, codeName, industry, theme, summary, arr, arrNumeric, currency, growthStage, year, technologies
- **Validation**: Unit tests covering schema integrity; auto-validated on commit via CI/CD

## 🔍 Code Quality Standards

### Testing Standards

- **Before writing or fixing E2E tests**, read [src/docs/testing/TEST_BEST_PRACTICES.md](src/docs/testing/TEST_BEST_PRACTICES.md) — it documents 25 anti-patterns that cause flaky failures
- **Before writing new tests**, read [src/docs/testing/TEST_STRATEGY.md](src/docs/testing/TEST_STRATEGY.md) for the correct test type and patterns
- **Unit Tests**: Fast, isolated, mocked dependencies
- **Integration Tests**: Real dependencies, isolated data
- **E2E Tests**: Critical user journeys only
- **Coverage Target**: 70%+ line coverage minimum

### CSS Styling Standards

- **Before writing or modifying any CSS**, read [src/docs/styles/STYLES_GUIDE.md](src/docs/styles/STYLES_GUIDE.md) — it is the single entry point for all styling conventions and links to the other style docs when needed
- **Before choosing any color, spacing, or typography value**, look it up in [src/docs/styles/VARIABLES_REFERENCE.md](src/docs/styles/VARIABLES_REFERENCE.md) — never guess or hardcode
- **All colors must use CSS variables** — never hardcode color values
- **All spacing must use the spacing scale** (`--spacing-xs` through `--spacing-3xl`)
- **All font sizes must use typography utilities** (`.heading-*`, `.text-*`, `.label-*`) or variables
- **Dark theme must work automatically** — use variables; the selector is `html.dark-theme`, not `body.dark-theme`
- **Palette overrides** in `palettes.css` — applied to `<html>` via class (like dark-theme); see BRAND_GUIDELINES.md § Alternative Palette System
- **Delta icons**: use `DeltaIcon.astro` component — never `<img>` tags (cannot inherit palette/theme colors via `currentColor`)
- **Buttons include frosted-glass** by default (`backdrop-filter: blur(2px)`, semi-transparent backgrounds) — see STYLES_GUIDE.md § Frosted Glass
- **Responsive design desktop-first** — base styles for desktop, `max-width` breakpoints for smaller screens
- **No hardcoded transitions** — use `--transition-fast`, `--transition-normal`, or `--transition-slow`
- **Brand decisions** (color hierarchy, semantic colors, palettes, voice, asset rules): [src/docs/styles/BRAND_GUIDELINES.md](src/docs/styles/BRAND_GUIDELINES.md)

## 🚢 Deployment

Vercel — auto-deploys on push to `master`, preview deploys for PRs. Build: `npm run build`, output: `dist`.

## 💡 Common Tasks

### Adding a New Component

1. Create `.astro` file in `src/components/`
2. Follow existing component patterns and CSS Styling Standards (above)
3. Add unit tests; if user-facing, add E2E tests
4. Test in both light and dark themes at desktop, 768px, and 480px

### Working with Palettes

1. Palette definitions: `src/styles/palettes.css` (CSS variable overrides per `html.palette-N`)
2. Palette metadata: `src/data/palettes.ts` (names, concepts, token tips)
3. Palette JS logic: `src/scripts/palette-manager.ts` (switching, color editing, panel controls)
4. To add a new palette: add `--altN-*` variables in `palettes.css` (light + dark), add `html.palette-N` override block, add entry to `palettes.ts`
5. PalettePanel renders site-wide from `BaseLayout.astro`; visible on `/brand` always, other pages via pop-out toggle

### Updating Portfolio Data

1. Edit `src/data/ma-portfolio/projects.json`
2. Run: `npm run test:run` to validate schema
3. Commit and push

---

**Last Updated**: April 17, 2026
