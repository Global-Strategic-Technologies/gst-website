# Global Strategic Technologies — Website & MCP Server

A high-performance website for GST built with Astro and deployed to Vercel — tech brutalist design with dark mode, alternative color palettes, and a suite of interactive hub tools — plus the **GST MCP server** (`mcp-server/` workspace) that exposes the same hub capabilities to LLM clients, deployed as a Cloudflare Worker at `mcp.globalstrategic.tech`.

## Quick Start

```bash
npm install
npm run dev            # http://localhost:4321
```

## Architecture

- **Website**: Astro 7.x (static + SSR hybrid), Vite with LightningCSS transformer, deployed to Vercel (static pages + ISR for Radar)
- **MCP server** (`@gst/mcp-server` npm workspace): TypeScript MCP server — stdio locally, Cloudflare Worker remotely (staging + production); Upstash Redis for caching/rate-limiting; maintained system reference at [mcp-server/src/docs/ARCHITECTURE.md](mcp-server/src/docs/ARCHITECTURE.md)
- **Testing**: Vitest (unit/integration, both workspaces) + Playwright (E2E) + axe-core (accessibility)
- **Error Monitoring**: Sentry (privacy-first config, both surfaces)
- **Analytics**: Google Analytics 4 with per-tool event tracking across the hub

## Project Structure

```
gst-website/
├── public/                     # Static assets, favicons, manifest
├── src/                        # WEBSITE workspace
│   ├── components/             # Root components + brand/ hub/ portfolio/ radar/ techpar/
│   ├── content.config.ts       # Astro content collection (regulatory-map)
│   ├── data/                   # Structured data sources
│   │   ├── ma-portfolio/       # Portfolio engagements (projects.json, schema-validated)
│   │   ├── regulatory-map/     # Per-regulation JSON files
│   │   ├── common/             # Shared taxonomies (funding stages, stage adapters)
│   │   ├── diligence-machine/  # Questions, attention areas, wizard config
│   │   ├── infrastructure-cost-governance/
│   │   ├── techpar/            # Industry notes, recommendations, stages
│   │   └── irl/ library/ …     # IRL request definitions, library article digests
│   ├── docs/                   # Project documentation (see below)
│   ├── layouts/                # BaseLayout.astro (header, footer, palette panel)
│   ├── middleware.ts           # SSR security headers (CSP, HSTS, etc.)
│   ├── pages/                  # Routes (auto-routed): index, brand, services, about,
│   │                           #   ma-portfolio, hub/{tools,radar,library}, …
│   ├── schemas/                # Zod input schemas (shared with the MCP tools)
│   ├── scripts/                # Client-side modules (palette-manager)
│   ├── styles/                 # Global CSS (variables, palettes, typography, interactions)
│   └── utils/                  # Engine modules (techpar, ICG, diligence, tech-debt)
├── mcp-server/                 # MCP SERVER workspace (@gst/mcp-server)
│   ├── src/                    # tools/ prompts/ resources/ schemas/ lib/ observability/
│   ├── src/docs/               # Server doc tree (ARCHITECTURE.md, per-tool CONTRACT/USAGE)
│   ├── tests/                  # Server unit + integration suites
│   └── wrangler.toml           # Worker config (staging + production envs)
├── tests/                      # Website unit/ integration/ e2e/ suites
├── astro.config.mjs            # Astro + Sentry + sitemap + Vercel adapter
├── vercel.json                 # Security headers (CSP, HSTS, X-Frame-Options)
└── package.json                # Scripts, workspaces, browserslist, lint-staged
```

## Commands

| Command                      | Action                                                                             |
| :--------------------------- | :--------------------------------------------------------------------------------- |
| `npm run dev`                | Start dev server at `http://localhost:4321`                                        |
| `npm run build`              | Build production site to `./dist/`                                                 |
| `npm run preview`            | Preview production build locally                                                   |
| `npm run test:run`           | Run website unit + integration tests once                                          |
| `npm run test:mcp`           | Run the MCP server suite (delegates to the workspace)                              |
| `npm run test:docs`          | Documentation link & anchor integrity guard (required CI check)                    |
| `npm run test:e2e`           | Run E2E tests (all browsers)                                                       |
| `npm run test:all`           | Run everything (unit + integration + E2E + MCP)                                    |
| `npm run test:coverage`      | Run with coverage report                                                           |
| `npm run lint`               | ESLint                                                                             |
| `npm run lint:css`           | Stylelint (CSS + .astro scoped styles)                                             |
| `npm run radar:seed`         | Populate the local stdio MCP radar snapshot with mock data (`radar:unseed` clears) |
| `npm run setup:claude-hooks` | One-time per machine: arm the Claude Code review-gate hooks                        |

### Local Validation (matches CI)

```bash
npx astro check && npm run lint && npm run lint:css && npm run test:run
```

## Configuration Entry Points

| File                       | Purpose                                                                        |
| -------------------------- | ------------------------------------------------------------------------------ |
| `astro.config.mjs`         | Astro integrations (Sentry, sitemap), Vercel adapter, LightningCSS, env schema |
| `vercel.json`              | Security headers for static routes (CSP, HSTS, X-Frame-Options)                |
| `src/middleware.ts`        | Security headers for SSR routes (mirrors vercel.json)                          |
| `sentry.client.config.ts`  | Client-side error monitoring (privacy-first, no PII)                           |
| `sentry.server.config.ts`  | Server-side error monitoring                                                   |
| `src/content.config.ts`    | Astro content collection for regulatory-map data                               |
| `mcp-server/wrangler.toml` | Cloudflare Worker config (staging + production environments)                   |
| `eslint.config.mjs`        | ESLint flat config with typescript-eslint and astro plugin                     |
| `.prettierrc.json`         | Code formatting (single quotes, 100 char width, trailing commas)               |
| `.stylelintrc.json`        | CSS linting with .astro scoped style support                                   |
| `vitest.config.ts`         | Website unit/integration test config, path aliases, coverage thresholds        |
| `playwright.config.ts`     | E2E test config (Chromium, Firefox, WebKit)                                    |
| `.husky/pre-commit`        | Pre-commit hook: lint-staged runs ESLint, stylelint, Prettier                  |
| `package.json`             | Scripts, workspaces, browserslist (LightningCSS targets), lint-staged config   |

## Design System

Desktop-first responsive design with tech brutalist aesthetic. Dark mode via `html.dark-theme` class; alternative color palettes via `html.palette-N` classes.

- **Tokens**: `src/styles/variables.css` (colors, spacing, typography, transitions, z-index)
- **Conventions**: [src/docs/styles/STYLES_GUIDE.md](src/docs/styles/STYLES_GUIDE.md)
- **Brand**: [src/docs/styles/BRAND_GUIDELINES.md](src/docs/styles/BRAND_GUIDELINES.md)
- **All colors use CSS variables** — never hardcode
- **LightningCSS** handles autoprefixing, minification, and `light-dark()` compilation

## Documentation

Website documentation lives in `src/docs/` with a master index; the MCP server maintains its own doc tree.

**[src/docs/README.md](src/docs/README.md)** — start here for any website-side documentation need.
**[mcp-server/src/docs/README.md](mcp-server/src/docs/README.md)** — the MCP server docs home (architecture, tools, resources, prompts, operations).

| Directory      | Content                                                           |
| -------------- | ----------------------------------------------------------------- |
| `adr/`         | Architecture Decision Records (distilled from closed initiatives) |
| `analytics/`   | GA4 integration, event tracking                                   |
| `development/` | Roadmap (BACKLOG.md), tooling, runbooks                           |
| `hub/`         | Hub tool technical docs                                           |
| `operations/`  | Secrets inventory                                                 |
| `security/`    | Headers, CSP, privacy, compliance                                 |
| `seo/`         | SEO implementation, JSON-LD, credentials                          |
| `styles/`      | CSS conventions, tokens, brand guidelines                         |
| `testing/`     | Test strategy, CI/CD, troubleshooting                             |

## Data Management

### Portfolio Data

Portfolio engagements live in `src/data/ma-portfolio/projects.json`, validated by Zod schemas at build time and by unit tests in CI. **Prepend** new entries — the UI renders in file order.

```bash
# Edit projects.json, then validate
npm run test:run
```

### Regulatory Map

Per-regulation JSON files in `src/data/regulatory-map/`, loaded via Astro content collections with Zod schema validation (and served as MCP Resources by the server).

## CI/CD

Website pipeline (`.github/workflows/test.yml`) is a parallel-then-gate design; the MCP server suite runs in its own workflow (`test-mcp-server.yml`) in parallel:

```
Lint & Type Check  ──┐
                      ├──> E2E Tests + axe
Unit & Integration ──┘        (docs-integrity + MCP suite run in parallel workflows)
```

- Docs-only changes skip the expensive website jobs (via `dorny/paths-filter`); the docs-integrity workflow always runs
- Pre-commit hooks enforce formatting locally
- Branch protection requires: **E2E Tests (Playwright)**, **Unit & Integration Tests**, **Lint & Type Check**, **Verify doc links**

## Deployment

- **Website**: Vercel auto-deploys on push to `master`; preview deploys for PRs. Build `npm run build`, output `dist/`. Radar page uses ISR. Security headers via `vercel.json` + `src/middleware.ts`. Env vars: `PUBLIC_SENTRY_DSN` (client), `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` (build-time source maps)
- **MCP Worker**: fully CI/CD — staging auto-deploys on a green MCP test run; production deploys gated by the `mcp-production` GitHub Environment approval; manual rollback workflow. See [mcp-server/src/docs/operations/DEPLOY.md](mcp-server/src/docs/operations/DEPLOY.md)
