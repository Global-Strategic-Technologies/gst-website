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
- **Use Context7 MCP Server** for authoritative technical documentation
- When working with standards (Schema.org, OpenGraph, JSON-LD, etc.), verify against official sources
- For API integrations, framework features, or technical specifications: query Context7 first
- Don't rely on training data alone for rapidly-evolving standards
- Example use cases:
  - Schema.org property validation for structured data
  - Current Astro/Vite API documentation
  - Web standards (HTML, CSS, JavaScript specifications)
  - Framework-specific best practices
- If Context7 is not available, use WebSearch/WebFetch as fallback for official documentation

### 8. Content Changes Must Include Test Updates
- After ANY content/copy change (brand names, headings, CTA text, labels), **grep `tests/` for every old string** before committing
- E2E tests frequently assert on visible text content — changing source without updating tests breaks CI
- Run: `grep -r "OLD_STRING" tests/` for each string replaced
- This is a **blocking step** — do not commit content changes without this check

### 9. PR Scope Must Match New Commits Only
- When `dev` has been incrementally merged to `master` via prior PRs, `git log master..dev` shows ALL divergence — not just new work
- Before creating a PR, identify the last merge point and only include commits after it
- Use `git log origin/dev..dev` to see what's actually new and unmerged

### Task Management
1. **Plan First**: Write plan to `.claude/tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review to `.claude/tasks/todo.md`
6. **Capture Lessons**: Update `.claude/tasks/lessons.md` after corrections

### Core Principles
- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

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

- **Primary Color**: #05cd99 (Teal)
- **Background Light**: #f5f5f5 (Off-white)
- **Background Dark**: #0a0a0a (Near black)
- **Font**: Helvetica Neue, Arial, sans-serif
- **Grid**: 50px checkerboard pattern background
- **Design Philosophy**: Tech brutalist with dark mode support

## 📊 Key Project Metrics

### Test Coverage
- **Total Tests**: 552 tests (100% passing)
  - **Unit/Integration Tests**: 180 tests (10 test files)
  - **E2E Tests**: 372 tests (across Chromium, Firefox, WebKit)
- **Code Coverage**: 70%+ (exceeds target)
- **CI Pipeline Time**: ~10 minutes

### Performance
- **Core Web Vitals**: Optimized (LCP, CLS, FID)
- **Bundle Size**: Optimized through Astro SSG
- **Analytics**: Google Analytics 4 integrated

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
- **Quick Reference**: [src/docs/testing/QUICK_REFERENCE.md](src/docs/testing/QUICK_REFERENCE.md) - One-page cheat sheet
- **GitHub Actions Setup**: [src/docs/testing/GITHUB_ACTIONS_SETUP.md](src/docs/testing/GITHUB_ACTIONS_SETUP.md) - How the CI/CD pipeline works
- **Test Strategy**: [src/docs/testing/TEST_STRATEGY.md](src/docs/testing/TEST_STRATEGY.md) - Comprehensive testing approach
- **CI/CD Architecture**: [src/docs/testing/CI_CD_SUMMARY.md](src/docs/testing/CI_CD_SUMMARY.md) - System architecture
- **Best Practices**: [src/docs/testing/TEST_BEST_PRACTICES.md](src/docs/testing/TEST_BEST_PRACTICES.md) - E2E testing best practices
- **Branch Protection**: [src/docs/testing/BRANCH_PROTECTION_CONFIG.md](src/docs/testing/BRANCH_PROTECTION_CONFIG.md) - GitHub rules setup
- **Testing Index**: [src/docs/testing/INDEX.md](src/docs/testing/INDEX.md) - Complete navigation guide

### Development Roadmap
- **Development Opportunities**: [src/docs/development/DEVELOPMENT_OPPORTUNITIES.md](src/docs/development/DEVELOPMENT_OPPORTUNITIES.md) - Strategic initiatives

### Analytics
- **Google Analytics Setup**: [src/docs/analytics/GOOGLE_ANALYTICS.md](src/docs/analytics/GOOGLE_ANALYTICS.md) - GA4 integration guide
- **Analytics Documentation**: [src/docs/analytics/README.md](src/docs/analytics/README.md)

## 🤖 Claude Agents

The project includes specialized agent definitions in the `.claude/agents/` directory for different roles:

### 1. Test Automation Specialist
**File**: [.claude/agents/test-automation-specialist.md](.claude/agents/test-automation-specialist.md)

Expert in comprehensive test automation strategies including:
- Unit, integration, E2E, and performance testing
- Testing pyramid design (70% unit, 20% integration, 10% E2E)
- Test data management and fixtures
- CI/CD integration with modern frameworks

**Use when**: Implementing comprehensive testing, designing test strategies, or troubleshooting test automation issues.

### 2. Test Strategy Architect
**File**: [.claude/agents/test-strategy-architect.md](.claude/agents/test-strategy-architect.md)

Comprehensive testing expert specializing in:
- Test pyramid architecture and optimization
- Coverage analysis and mutation testing
- Multi-language testing stack configuration (JS/TS, Python, Go)
- Performance and accessibility testing
- Advanced CI/CD workflows

**Use when**: Designing testing frameworks, analyzing coverage metrics, or implementing advanced testing strategies.

### 3. Code Reviewer
**File**: [.claude/agents/code-reviewer.md](.claude/agents/code-reviewer.md)

Senior code review specialist ensuring:
- Code quality and security
- Maintainability and readability
- Proper error handling
- Test coverage assessment
- No exposed secrets or API keys

**Use when**: Code review, security assessment, or quality standards checking.

### 4. JavaScript/TypeScript Expert
**File**: [.claude/agents/javascript-typescript-expert.md](.claude/agents/javascript-typescript-expert.md)

Specialized in modern JavaScript/TypeScript ecosystem:
- Architectural decisions and design patterns
- Performance optimization strategies
- Testing architecture and tool selection
- State management patterns
- Build tool and framework selection

**Use when**: Architecture decisions, performance optimization, or ecosystem guidance.

### 5. UI/UX Playwright Reviewer
**File**: [.claude/agents/ui-ux-playwright-reviewer.md](.claude/agents/ui-ux-playwright-reviewer.md)

Expert in UI/UX testing with Playwright:
- E2E test strategy for user interfaces
- Playwright best practices and patterns
- Visual regression testing
- Accessibility testing with automation

**Use when**: E2E testing strategy, Playwright implementation, or UI automation.

### 6. Performance Testing Expert
**File**: [.claude/agents/performance-testing-expert.md](.claude/agents/performance-testing-expert.md)

Specialist in performance and load testing:
- Web performance testing strategies
- Load testing and stress testing
- Performance regression detection
- Lighthouse CI integration

**Use when**: Performance optimization, load testing, or performance regression detection.

### 7. Technical Debt Analyst
**File**: [.claude/agents/technical-debt-analyst.md](.claude/agents/technical-debt-analyst.md)

Expert in identifying and addressing technical debt:
- Code complexity analysis
- Refactoring strategies
- Dependency management
- Modernization guidance

**Use when**: Refactoring, technical debt assessment, or legacy code modernization.

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
- **Validation**: 20 unit tests covering schema integrity and data quality
- **Validation**: Auto-validated on commit via CI/CD

### Content Management
- Page content is hardcoded in Astro components
- Consider Markdown files or CMS integration for dynamic content

## 📈 Recent Performance Improvements (February 2026)

✅ **LCP Optimization** - Removed lazy loading, added `fetchpriority="high"`
✅ **Network Optimization** - Added preconnect/dns-prefetch hints
✅ **Console Error Fixes** - Added null checks and error handling across 5 components

## 🔍 Code Quality Standards

### Linting & Formatting
- ESLint for code quality
- Prettier for code formatting
- Git hooks for automated checks

### Testing Standards
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

## 💡 Common Tasks & Patterns

### Adding a New Component
1. Create `.astro` file in `src/components/`
2. Follow existing component patterns
3. Add unit tests
4. If user-facing, add E2E tests

### Adding New Component Styles
1. **Read** [src/docs/styles/STYLES_GUIDE.md](src/docs/styles/STYLES_GUIDE.md) first — it covers conventions, patterns, and links to token/typography references
2. **Look up** every color, spacing, and typography value in [src/docs/styles/VARIABLES_REFERENCE.md](src/docs/styles/VARIABLES_REFERENCE.md) before using it
3. **Never hardcode colors, spacing, or font sizes**
4. Test in both light and dark themes
5. Verify responsive behavior at breakpoints
6. Run: `npm run test:all` to verify no regressions

### Updating Portfolio Data
1. Edit `src/data/ma-portfolio/projects.json`
2. Ensure schema validation passes
3. Run: `npm run test:run`
4. Commit and push

### Running Tests Before PR
```bash
npm run test:all    # Runs everything the CI runs
```

### Debugging E2E Tests
```bash
npm run test:e2e:debug    # Opens Playwright inspector
npm run test:e2e:ui       # Visual test runner
```

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

## 📞 Resources

### Internal Documentation
- **Styles**: [src/docs/styles/STYLES_GUIDE.md](src/docs/styles/STYLES_GUIDE.md) - CSS conventions, design system, anti-patterns
  - [VARIABLES_REFERENCE.md](src/docs/styles/VARIABLES_REFERENCE.md) - Design token catalog (140 variables)
  - [TYPOGRAPHY_REFERENCE.md](src/docs/styles/TYPOGRAPHY_REFERENCE.md) - Typography utilities (11 classes)
  - [BRAND_GUIDELINES.md](src/docs/styles/BRAND_GUIDELINES.md) - Brand palette, color hierarchy, voice, asset rules
- Testing: [src/docs/testing/INDEX.md](src/docs/testing/INDEX.md)
- Development: [src/docs/development/](src/docs/development/)
- Analytics: [src/docs/analytics/](src/docs/analytics/)

### External References
- [Astro Documentation](https://docs.astro.build)
- [Vitest Documentation](https://vitest.dev)
- [Playwright Documentation](https://playwright.dev)
- [Vercel Documentation](https://vercel.com/docs)

### MCP Servers (Model Context Protocol)

#### Context7 - Technical Documentation Access
- **Purpose**: Provides authoritative, up-to-date technical documentation
- **When to Use**:
  - Verifying standards compliance
  - Checking current API documentation for frameworks/libraries
  - Researching web standards and specifications
- **Setup**: If not configured, instruct user to add via:
  ```bash
  claude mcp add --header "CONTEXT7_API_KEY: YOUR_API_KEY" --transport http context7 https://mcp.context7.com/mcp
  ```
- **Example Queries**:
  - "Show me the current Astro component API"
  - "What's the correct syntax for OpenGraph meta tags?"
- **Fallback**: If Context7 unavailable, use WebSearch + WebFetch to official documentation sources

## 🎯 When Working with Claude Code

### Before Starting Work
1. Review relevant documentation in `src/docs/`
2. Consult appropriate agent if complex task
3. Consider using Todo list for multi-step tasks

### During Development
1. Make targeted changes (avoid over-engineering)
2. Add tests for new functionality
3. Run tests locally before pushing
4. Follow existing code patterns

### Before Committing
1. Run `npm run test:all` to verify nothing broke
2. Ensure code follows project standards
3. Write clear commit messages
4. Push to appropriate branch

### Agent Usage Recommendations
- **Code changes**: Use code-reviewer agent after completion
- **Testing**: Use test-automation-specialist or test-strategy-architect
- **Architecture**: Use javascript-typescript-expert
- **Performance**: Use performance-testing-expert
- **Technical Debt**: Use technical-debt-analyst
- **E2E Strategy**: Use ui-ux-playwright-reviewer

---

**Last Updated**: March 24, 2026
**Project Status**: All systems operational ✅

## 📝 Recent Updates

### February 5, 2026
- ✅ **Schema.org Compliance**: Updated all JSON-LD credentials to use official Schema.org properties
  - Replaced `offeredBy` → `publisher` (from CreativeWork)
  - Replaced `validUntil` → `expires` (from CreativeWork)
  - All 18 credentials now use standards-compliant properties
- ✅ **Context7 MCP Integration**: Added guidelines for using Context7 MCP server for technical documentation verification
