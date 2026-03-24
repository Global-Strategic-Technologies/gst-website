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
- **Do NOT run E2E tests unless explicitly told to do so**

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

---

## 📋 Project Overview

**GST Website** - A modern, high-performance static site for Global Strategic Technologies built with Astro and deployed to Vercel.

- **Framework**: Astro 5.16+
- **Build Tool**: Vite
- **Deployment**: Vercel
- **Testing**: Vitest (unit/integration) + Playwright (E2E)
- **Package Manager**: npm
- **Node Version**: 18+ (LTS)

## 🎨 Design System

- **Design Philosophy**: Tech brutalist with dark mode support
- **All design tokens** (colors, spacing, typography, transitions): [src/docs/styles/VARIABLES_REFERENCE.md](src/docs/styles/VARIABLES_REFERENCE.md)
- **Conventions and patterns**: [src/docs/styles/STYLES_GUIDE.md](src/docs/styles/STYLES_GUIDE.md)

## 🗂️ Project Structure

```
gst-website/
├── public/                    # Static assets
├── src/
│   ├── components/           # Astro components
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   ├── Hero.astro
│   │   ├── StatsBar.astro
│   │   ├── CTASection.astro
│   │   └── ThemeToggle.astro
│   ├── data/                 # Project/portfolio data
│   │   └── ma-portfolio/
│   │       └── projects.json # 51 validated projects
│   ├── docs/                 # Strategic documentation
│   │   ├── testing/          # Test strategy & CI/CD docs
│   │   ├── development/      # Development roadmap
│   │   └── analytics/        # GA4 integration guides
│   ├── layouts/              # Page layouts
│   │   └── BaseLayout.astro
│   ├── pages/                # Route files (auto-routed)
│   │   └── index.astro
│   └── styles/               # Global CSS
│       └── global.css
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

### Testing & CI/CD
- **Start here**: [src/docs/testing/INDEX.md](src/docs/testing/INDEX.md) — use-case-based navigation to all testing docs
- **Writing or fixing E2E tests**: read [src/docs/testing/TEST_BEST_PRACTICES.md](src/docs/testing/TEST_BEST_PRACTICES.md) first — 25 documented anti-patterns and their fixes
- **Writing new tests**: read [src/docs/testing/TEST_STRATEGY.md](src/docs/testing/TEST_STRATEGY.md) for test patterns by component type
- **Tests failing**: check [src/docs/testing/TROUBLESHOOTING.md](src/docs/testing/TROUBLESHOOTING.md) before debugging manually

### Development Roadmap
- **Development Opportunities**: [src/docs/development/DEVELOPMENT_OPPORTUNITIES.md](src/docs/development/DEVELOPMENT_OPPORTUNITIES.md) - Strategic initiatives

### Analytics
- **Google Analytics Setup**: [src/docs/analytics/GOOGLE_ANALYTICS.md](src/docs/analytics/GOOGLE_ANALYTICS.md) - GA4 integration guide
- **Analytics Documentation**: [src/docs/analytics/README.md](src/docs/analytics/README.md)

## 🤖 Claude Agents

Specialized agents in `.claude/agents/`. Use the right agent for the task:

| Agent | Use When |
|-------|----------|
| **code-reviewer** | After code changes — quality, security, maintainability |
| **javascript-typescript-expert** | Architecture decisions, performance optimization |
| **test-automation-specialist** | Implementing tests, designing test strategies |
| **test-strategy-architect** | Test pyramid design, coverage analysis, CI/CD workflows |
| **ui-ux-playwright-reviewer** | E2E test strategy, Playwright patterns |
| **performance-testing-expert** | Load testing, performance regression detection |
| **technical-debt-analyst** | Refactoring, complexity analysis, debt reduction |

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
- **Content**: 51 active projects with validated schema
- **Fields**: id, codeName, industry, theme, summary, arr, arrNumeric, currency, growthStage, year, technologies
- **Validation**: Unit tests covering schema integrity; auto-validated on commit via CI/CD

### Content Management
- Page content is hardcoded in Astro components
- Consider Markdown files or CMS integration for dynamic content

## 🔍 Code Quality Standards

### Linting & Formatting
- ESLint for code quality
- Prettier for code formatting
- Git hooks for automated checks

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
- **Dark theme must work automatically** — use variables, no `body.dark-theme` specific colors
- **Responsive design desktop-first** — base styles for desktop, `max-width` breakpoints for smaller screens
- **No hardcoded transitions** — use `--transition-fast`, `--transition-normal`, or `--transition-slow`
- **Brand decisions** (color hierarchy, semantic colors, voice, asset rules): [src/docs/styles/BRAND_GUIDELINES.md](src/docs/styles/BRAND_GUIDELINES.md)

### Performance Standards
- Core Web Vitals optimization
- Bundle size optimization
- Image optimization
- CSS/JS minification

## 🔐 Security Considerations

- Input validation on all user inputs
- XSS prevention through proper escaping
- CSRF protection for forms
- No secrets in version control
- Environment variables for sensitive data

## 🚢 Deployment

**Platform**: Vercel
- Automatic deployment on push to `master`
- Preview deployments for PRs
- Integrates with GitHub Actions

**Build Settings**:
- Build Command: `npm run build`
- Output Directory: `dist`

## 💡 Common Tasks

### Adding a New Component
1. Create `.astro` file in `src/components/`
2. Follow existing component patterns and CSS Styling Standards (above)
3. Add unit tests; if user-facing, add E2E tests
4. Test in both light and dark themes at desktop, 768px, and 480px

### Updating Portfolio Data
1. Edit `src/data/ma-portfolio/projects.json`
2. Run: `npm run test:run` to validate schema
3. Commit and push

## 🆘 Troubleshooting

### Tests Failing in CI but Passing Locally
1. Check for flaky tests in E2E suite
2. Review timing/wait conditions
3. See [TEST_BEST_PRACTICES.md](src/docs/testing/TEST_BEST_PRACTICES.md)

### Performance Issues
1. Profile with Chrome DevTools
2. Check [DEVELOPMENT_OPPORTUNITIES.md](src/docs/development/DEVELOPMENT_OPPORTUNITIES.md)
3. Review Lighthouse metrics

### Build Failures
1. Check `npm run build` output
2. Verify all dependencies installed
3. Clear `.astro` cache and rebuild

---

**Last Updated**: March 24, 2026
