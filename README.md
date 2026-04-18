# Global Strategic Technologies — Website

A high-performance website for GST built with Astro 6 and deployed to Vercel. Tech brutalist design with dark mode, 6 alternative color palettes, and 5 interactive hub tools.

## Quick Start

```bash
npm install
npm run dev            # http://localhost:4321
```

## Architecture

- **Framework**: Astro 6.x (static + SSR hybrid)
- **Build**: Vite with LightningCSS transformer
- **Deploy**: Vercel (static pages + ISR for Radar)
- **Testing**: Vitest (unit/integration) + Playwright (E2E) + axe-core (accessibility)
- **Error Monitoring**: Sentry (`@sentry/astro`, privacy-first config)
- **Analytics**: Google Analytics 4 with 50+ tracked events across 5 hub tools

## Project Structure

```
gst-website/
├── public/                     # Static assets, favicons, manifest
│   └── data/                   # Runtime-fetched geodata (TopoJSON)
├── src/
│   ├── components/             # 18 root + 4 subdirectories
│   │   ├── brand/              # Brand page specimens (9 components)
│   │   ├── hub/                # Hub header + regulatory-map sub-components
│   │   ├── portfolio/          # Grid, modal, filters, sticky controls
│   │   └── radar/              # Feed items, category filter, skeleton
│   ├── content.config.ts       # Astro content collection (regulatory-map)
│   ├── data/                   # Structured data sources
│   │   ├── ma-portfolio/       # 57 validated projects (projects.json)
│   │   ├── regulatory-map/     # 120 regulation JSON files
│   │   ├── diligence-machine/  # Questions, attention areas, wizard config
│   │   ├── infrastructure-cost-governance/
│   │   └── techpar/            # Industry notes, recommendations, stages
│   ├── docs/                   # Project documentation (see below)
│   ├── layouts/                # BaseLayout.astro (header, footer, palette panel)
│   ├── middleware.ts           # SSR security headers (CSP, HSTS, etc.)
│   ├── pages/                  # 23 routes (auto-routed)
│   ├── schemas/                # Zod schemas for all 6 data sources
│   ├── scripts/                # Client-side modules (palette-manager)
│   ├── styles/                 # Global CSS (variables, palettes, typography, interactions)
│   └── utils/                  # Engine modules (techpar, ICG, diligence, tech-debt)
├── tests/
│   ├── unit/                   # Vitest unit tests
│   ├── integration/            # Vitest integration tests
│   └── e2e/                    # Playwright E2E tests
├── astro.config.mjs            # Astro + Sentry + sitemap + Vercel adapter
├── eslint.config.mjs           # ESLint flat config (typescript-eslint + astro)
├── .prettierrc.json            # Prettier config (single quotes, trailing commas)
├── .stylelintrc.json           # Stylelint config (CSS + .astro scoped styles)
├── vitest.config.ts            # Unit/integration test config
├── playwright.config.ts        # E2E test config (3 browsers)
├── sentry.client.config.ts     # Sentry client (error-only, no PII)
├── sentry.server.config.ts     # Sentry server (error-only)
├── vercel.json                 # Security headers (CSP, HSTS, X-Frame-Options)
└── package.json                # Scripts, dependencies, browserslist
```

## Commands

| Command                 | Action                                      |
| :---------------------- | :------------------------------------------ |
| `npm run dev`           | Start dev server at `http://localhost:4321` |
| `npm run build`         | Build production site to `./dist/`          |
| `npm run preview`       | Preview production build locally            |
| `npm run test:run`      | Run unit + integration tests once           |
| `npm run test:e2e`      | Run E2E tests (all browsers)                |
| `npm run test:all`      | Run everything (unit + integration + E2E)   |
| `npm run test:coverage` | Run with coverage report                    |
| `npm run lint`          | ESLint                                      |
| `npm run lint:css`      | Stylelint (CSS + .astro scoped styles)      |
| `npm run radar:seed`    | Seed dev cache with mock Radar data         |

### Local Validation (matches CI)

```bash
npx astro check && npm run lint && npm run lint:css && npm run test:run
```

## Configuration Entry Points

| File                      | Purpose                                                                        |
| ------------------------- | ------------------------------------------------------------------------------ |
| `astro.config.mjs`        | Astro integrations (Sentry, sitemap), Vercel adapter, LightningCSS, env schema |
| `vercel.json`             | Security headers for static routes (CSP, HSTS, X-Frame-Options)                |
| `src/middleware.ts`       | Security headers for SSR routes (mirrors vercel.json)                          |
| `sentry.client.config.ts` | Client-side error monitoring (privacy-first, no PII)                           |
| `sentry.server.config.ts` | Server-side error monitoring                                                   |
| `src/content.config.ts`   | Astro content collection for regulatory-map data                               |
| `eslint.config.mjs`       | ESLint flat config with typescript-eslint and astro plugin                     |
| `.prettierrc.json`        | Code formatting (single quotes, 100 char width, trailing commas)               |
| `.stylelintrc.json`       | CSS linting with .astro scoped style support                                   |
| `vitest.config.ts`        | Unit/integration test config, path aliases, coverage thresholds                |
| `playwright.config.ts`    | E2E test config (Chromium, Firefox, WebKit)                                    |
| `.husky/pre-commit`       | Pre-commit hook: lint-staged runs ESLint, stylelint, Prettier                  |
| `package.json`            | Scripts, browserslist (LightningCSS targets), lint-staged config               |

## Design System

Desktop-first responsive design with tech brutalist aesthetic. Dark mode via `html.dark-theme` class. 6 alternative color palettes via `html.palette-N` classes.

- **Tokens**: `src/styles/variables.css` (colors, spacing, typography, transitions, z-index)
- **Conventions**: [src/docs/styles/STYLES_GUIDE.md](src/docs/styles/STYLES_GUIDE.md)
- **Brand**: [src/docs/styles/BRAND_GUIDELINES.md](src/docs/styles/BRAND_GUIDELINES.md)
- **All colors use CSS variables** — never hardcode
- **LightningCSS** handles autoprefixing, minification, and `light-dark()` compilation

## Documentation

All project documentation lives in `src/docs/` with a master index:

**[src/docs/README.md](src/docs/README.md)** — start here for any documentation need.

| Directory      | Content                                   |
| -------------- | ----------------------------------------- |
| `analytics/`   | GA4 integration, event tracking           |
| `development/` | Roadmap, tooling, initiatives             |
| `hub/`         | Hub tool technical docs                   |
| `security/`    | Headers, CSP, privacy, compliance         |
| `seo/`         | SEO implementation, JSON-LD, credentials  |
| `styles/`      | CSS conventions, tokens, brand guidelines |
| `testing/`     | Test strategy, CI/CD, troubleshooting     |

## Data Management

### Portfolio Data

57 projects in `src/data/ma-portfolio/projects.json`, validated by Zod schemas at build time and by unit tests in CI.

```bash
# Edit projects.json, then validate
npm run test:run
```

### Regulatory Map

120 regulations in `src/data/regulatory-map/`, loaded via Astro content collections with Zod schema validation.

## CI/CD

Three-job parallel-then-gate pipeline in `.github/workflows/test.yml`:

```
Lint & Type Check (~1 min)  ──┐
                               ├──> E2E Tests + axe (~17 min)
Unit & Integration (~15s)   ──┘
```

- Docs-only changes skip expensive jobs (via `dorny/paths-filter`)
- Pre-commit hooks enforce formatting locally
- Branch protection requires all three jobs to pass

## Deployment

Vercel auto-deploys on push to `master`. Preview deploys for PRs.

- **Build**: `npm run build`
- **Output**: `dist/`
- **SSR**: Radar page uses ISR (Incremental Static Regeneration)
- **Security headers**: Applied to all routes via `vercel.json` + `src/middleware.ts`
- **Environment variables**: `PUBLIC_SENTRY_DSN` (client), `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` (build-time source maps)
