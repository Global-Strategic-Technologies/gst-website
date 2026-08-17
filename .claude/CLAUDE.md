# Claude Context for GST Website Project

This document provides Claude with essential context about the GST Website project, enabling it to provide more targeted and effective assistance.

**This repo is two workspaces in one** (npm workspaces): the **Astro website** (root — static site on Vercel) and the **`@gst/mcp-server`** package (`mcp-server/` — an MCP server deployed as a Cloudflare Worker at `mcp.globalstrategic.tech`). Most non-trivial work touches conventions documented in one of the two doc trees — find them before building (see 📚 Critical Documentation).

---

## 🔧 Claude Workflow Directives

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately - don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Design Review Gate (enforced by hook)

- **Every implementation plan must be reviewed by the `plan-reviewer` agent before ExitPlanMode.** The reviewer verifies the plan's claims against the actual codebase, checks convention compliance against the authoritative docs, hunts missed reuse and unverified assumptions, and writes `.claude/tasks/plan-review.json` with the plan's content hash.
- A PreToolUse hook **mechanically blocks ExitPlanMode** without a fresh approving marker bound to the current plan text. Editing the plan after review invalidates the marker (hash mismatch) — send the revised plan back to the reviewer.
- If the reviewer returns REVISE: fix the blockers/majors (or explicitly justify accepting a major), update the plan, re-review.
- **Only the user can waive this gate.** On an explicit waiver, write the marker with verdict `USER_WAIVED` and the user's quoted waiver — never fabricate a waiver or hand-write an APPROVE.
- Mechanics, marker schema, troubleshooting: [DEVELOPER_TOOLING.md § Claude Code review gates](src/docs/development/DEVELOPER_TOOLING.md). Fresh machine? Run `npm run setup:claude-hooks` once to arm the gates.

### 3. Subagent Strategy to Keep Main Context Window Clean

- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 4. Self-Improvement Loop

- After ANY correction from the user: **write it to the persistent memory system** as a `feedback` memory — one file per lesson in the memory directory, plus a one-line pointer in `MEMORY.md`. Capture the rule **and the why** so the correction survives the conversation ending.
- The `MEMORY.md` index is loaded automatically at the start of every session — that is how prior corrections are recalled without repeating them. There is no separate "review at session start" step to remember.
- Write rules for yourself that prevent the same mistake; before saving, check for an existing memory that already covers it and update that file rather than duplicating.
- **When a private lesson is really a repo convention, codify it here (or in the relevant doc) so every session sees it** — private memory is invisible to other sessions and collaborators.
- **Retired**: the old `.claude/tasks/lessons.md` learning log (removed 2026-07-19). Its still-relevant lessons were migrated to memory; the two codified ones live as Directives 11 and 13. Recover the original via `git log -- .claude/tasks/lessons.md`.

### 5. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run unit and integration tests to verify correctness
- **Do NOT run E2E tests unless explicitly told to do so** — except when the task itself is writing or fixing E2E tests, in which case running them _is_ the verification step (use `--project=chromium` for a fast single-browser check)

### 6. No Deferred Tech Debt — Fix Now, Not Later

- **If a fix can be done in this session, do it in this session.** Do not write off remaining work as "deferred to next session," "future cleanup," or "follow-up needed" when the fix is in scope and reachable.
- **Verification work counts.** A "live exercise" or "human-driven UI verification" labeled "deferred to next session" is the same anti-pattern as a code TODO. If the live exercise can't be done in-session due to a real infrastructure constraint (e.g., a long-running subprocess that pre-dates this session's commits), substitute with a comprehensive integration test that exercises the same handler code path so engineering correctness is proven now — and document the constraint transparently, not as deferred work.
- **If you discover an existing instance of deferred tech debt while working on something else** (e.g., a closure stanza in a sibling architecture doc that says "deferred to next out-of-band run"), remediate it as part of the current task. Don't carry the bad pattern forward.
- **For surfaces with active clients**: a rename, removal, or enum tightening must ship with a coordinated migration of every known caller OR a backward-compat shim at the same boundary. Confirm with the user whether active clients exist before scoping migration work — don't assume risk when the codebase is internal.
- **Reason**: deferred tech debt compounds. Each "we'll handle that later" makes the next session harder, not easier. Closing the loop in the same session that opened it is the only sustainable rhythm.

### 7. Implementation Review Gate (enforced by hook)

- **Before any `git push`, the diff must be reviewed by the `code-reviewer` agent.** It reviews `master...HEAD` against repo conventions (reuse, styles, tests, MCP contracts), records the HEAD sha, and writes `.claude/tasks/impl-review.json`.
- A PreToolUse hook **mechanically blocks `git push`** unless the marker's `headSha` matches the current HEAD — commits added after the review force a re-review; a failed push retries without burning the review.
- Fix critical findings before pushing. **Only the user can waive** (verdict `USER_WAIVED` + quoted waiver — appropriate for trivial docs-only diffs the user has already authorized).
- Never push without explicit user authorization in the first place; an approved plan authorizes only the pushes it states.

### 8. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes - don't over-engineer
- Challenge your own work before presenting it

### 9. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests → then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

### 10. Technical Documentation Reference

- For API docs, framework features, or web standards: query **Context7 MCP Server** first
- Don't rely on training data alone for rapidly-evolving standards (Schema.org, Astro, etc.)
- Fallback: WebSearch/WebFetch to official documentation sources

### 11. Content Changes Must Include Test Updates

- After ANY content/copy change (brand names, headings, CTA text, labels), **grep `tests/` for every old string** before committing
- E2E tests frequently assert on visible text content — changing source without updating tests breaks CI
- Run: `grep -r "OLD_STRING" tests/` for each string replaced
- This is a **blocking step** — do not commit content changes without this check

### 12. Commit Convention

- Use conventional commits: `feat()`, `fix()`, `refactor()`, `docs()`, `chore()`, `test()`
- Scope in parentheses: `feat(design-system):`, `fix(e2e):`, `docs(brand):`
- Message body explains **why**, not what (the diff shows what)
- Group logically distinct changes into separate commits

### 13. PR Scope Must Match New Commits Only

- Feature branches cut from `master` and PR straight back to `master` — scope is simply `git log master..HEAD`
- Before creating a PR, confirm every commit on the branch belongs to this change; if the branch is stale, rebase-or-merge from `master` first rather than shipping unrelated divergence
- Never reuse a branch for a second initiative — one branch, one PR, one concern

### 14. Developer Tooling is Authoritative

- Before suggesting or implementing changes to linting, formatting, type-checking, pre-commit hooks, or CI, read [DEVELOPER_TOOLING.md](src/docs/development/DEVELOPER_TOOLING.md) first
- The authoritative local validation sequence (matches CI) is:
  ```
  npx astro check && npm run lint && npm run lint:css && npm run test:run
  ```
  If all four pass locally, CI will almost certainly pass — **for website-only changes**
- **Touching `mcp-server/`? Those four are NOT sufficient.** `astro check` type-checks the root program, whose tsconfig explicitly `exclude`s `mcp-server`, and Vitest transpiles without type-checking — so an mcp-server type error passes all four _and_ `test:mcp`, while failing CI (`test-mcp-server.yml` runs `typecheck` then `build` = `tsc --noEmit && node build.mjs`; a red run there also suppresses the staging-deploy chain). Additionally run:
  ```
  npm -w @gst/mcp-server run typecheck && npm run test:mcp && npm run test:docs
  ```
  Learned in BL-090: a two-argument call to a one-argument constructor sat green through the whole four-command sequence plus 1917 passing mcp tests
- **Every commit is auto-formatted by the husky pre-commit hook** — lint-staged runs `eslint --fix` then `prettier --write` on staged files. Your staged files may look different in the final commit than in your working tree. This is intentional and documented
- **`npm audit` policy**: production dependencies must stay at zero advisories (enforced via `--audit-level=moderate --omit=dev` in CI). Dev-only advisories are tolerated case-by-case
- **Do not add or edit hooks, lint configs, or CI jobs without updating [DEVELOPER_TOOLING.md](src/docs/development/DEVELOPER_TOOLING.md)** — the doc is the single source of truth for new contributors and future sessions
- **Do not use `git commit --no-verify`** unless you are explicitly told the change is an emergency and the user has agreed to the follow-up. CI will still enforce what the hook would have caught, so `--no-verify` only defers the problem

### 15. Shell Commands, Permissions & Secrets

Claude Code's permission matcher evaluates compound commands **per-subcommand** (separators: `&&`, `||`, `;`, `|`, `&`, and newlines): a chained command runs without prompting when every subcommand matches an allow rule or is built-in read-only (`ls`, `cat`, `cd`, `grep`, read-only `git`, …). The curated allowlist lives in the gitignored [`.claude/settings.local.json`](.claude/settings.local.json) (the same file carrying the review-gate hook registration) as **broad family prefix rules** — `Bash(git *)`, `Bash(npm *)`, PowerShell mirrors, plus a small deny set (sudo, catastrophic `rm -rf` shapes, `git push --force`) that always overrides allows.

**Rules:**

- **Compound commands are fine** when every part is an allowlisted family or read-only — use them where they read naturally (e.g. `git add X && git commit -F msg.txt` for atomic sequences).
- **A permission prompt now signals a genuinely novel command family.** Prefer proposing a durable family rule (`Bash(<tool> *)`) for the user to add over accumulating one-shot exact approvals — exact strings with embedded paths/SHAs/messages rarely recur and bloat the settings file (a 2026-07-22 cleanup removed ~250 dead one-shot entries).
- **Quoted multiline content fragments matching** (observed behavior, 2026-07 investigation) — newlines act as subcommand separators, so an inline multiline `-m "…"` commit message will prompt. Use `git commit -F <file>` with the message written via the Write tool.
- **Env-var prefixes on non-safe variables aren't stripped**: `FOO=bar cmd` prompts even when `cmd` is allowed. Set env inside scripts, or use an env-override the script reads.
- **Never inline raw secrets in any shell command** (yours or ones you ask the user to run) — use env-var references so tokens stay out of scrollback, history, and transcripts. `wrangler secret put` reads from stdin.
- **Prefer dedicated tools over shell pipelines.** `Grep` for content search, `Glob` for file patterns, `Read` for file contents — these bypass the shell entirely and are always allowed.
- **Never attempt to work around a deny rule** — a denied shape is an operator decision, not an obstacle.

> History: this directive previously mandated one-command-per-Bash-call on the premise that the matcher evaluated the entire command string as one unit. That premise was retired 2026-07-22 — current Claude Code matches per-subcommand (<https://code.claude.com/docs/en/permissions.md>), and the allowlist was rebuilt from dead exact strings to family rules, so natural compound commands no longer thrash the approval loop.

---

## 📋 Project Overview

**GST Website** — a modern, high-performance static site for Global Strategic Technologies, plus the GST MCP server exposing the Hub tools to LLM clients.

- **Website**: Astro 7.x + Vite, static output, deployed to Vercel
- **MCP server** (`mcp-server/`, workspace `@gst/mcp-server`): TypeScript MCP server; runs over stdio locally and as a **Cloudflare Worker** remotely (staging + production); Upstash Redis for caching/rate-limiting; Sentry + custom observability
- **Testing**: Vitest (unit/integration, both workspaces) + Playwright (E2E, website)
- **Package Manager**: npm (workspaces: `.` and `mcp-server`)
- **Node Version**: 22+ (LTS)

## 🎨 Design System

- **Design Philosophy**: Tech brutalist with dark mode support and frosted-glass aesthetic
- **Start here for any styling work**: [src/docs/styles/STYLES_GUIDE.md](src/docs/styles/STYLES_GUIDE.md) — the single entry point; it links the token catalog ([VARIABLES_REFERENCE.md](src/docs/styles/VARIABLES_REFERENCE.md)) and brand decisions ([BRAND_GUIDELINES.md](src/docs/styles/BRAND_GUIDELINES.md))
- **Palette system**: alternative color palettes in `src/styles/palettes.css` — applied to `<html>` via class, persisted in localStorage
- **Delta icon**: Use `DeltaIcon.astro` component (inline SVG with `currentColor`) — never `<img>` tags
- **Published downstream to claude.ai/design**: the tokens + `.brutal-*` vocabulary are synced to a Claude Design project so the design agent builds on-brand UI — see [CLAUDE_DESIGN_SYNC.md](src/docs/development/CLAUDE_DESIGN_SYNC.md). **Renaming a class or token means re-syncing**; it goes stale silently. Never hand-write React versions of `.astro` components for it

## 🗂️ Project Structure

Deliberately shallow — for full detail use the two doc-tree indexes ([src/docs/README.md](src/docs/README.md), [mcp-server/src/docs/README.md](mcp-server/src/docs/README.md)). Counts are omitted on purpose; they rot.

```
gst-website/
├── src/                        # WEBSITE workspace (Astro)
│   ├── components/             # Root components (DeltaIcon, Header, Hero, SEO, …)
│   │   └── brand/ hub/ portfolio/ radar/ techpar/   # Feature component dirs
│   ├── data/                   # Structured data
│   │   ├── ma-portfolio/projects.json   # Portfolio entries (see 📊 Data Management)
│   │   ├── common/             # Shared taxonomies (funding stages, stage adapters)
│   │   ├── diligence-machine/ infrastructure-cost-governance/ techpar/
│   │   ├── regulatory-map/     # Per-regulation JSON files
│   │   └── palettes.ts         # Palette metadata
│   ├── pages/                  # Routes: index, brand, services, about, ma-portfolio,
│   │   └── hub/                #   privacy, terms, 404/500 + hub/{tools/,radar/,library/}
│   ├── schemas/                # Zod input schemas shared with the MCP tools
│   ├── scripts/                # Client-side TS (palette-manager, …)
│   ├── styles/                 # variables.css → typography → interactions → palettes →
│   │   └── components/         #   global.css + extracted component modules
│   ├── layouts/BaseLayout.astro
│   ├── docs/                   # WEBSITE doc tree (adr/ analytics/ development/ hub/
│   │                           #   operations/ security/ seo/ styles/ testing/)
│   └── utils/                  # Engine modules for Hub tools (TechPar, ICG, Tech Debt)
├── mcp-server/                 # MCP SERVER workspace (@gst/mcp-server)
│   ├── src/tools/ prompts/ resources/ schemas/ lib/ observability/ auth/ cache/
│   ├── src/docs/               # SERVER doc tree — ARCHITECTURE.md is the maintained
│   │                           #   system reference; tools/<tool>/CONTRACT.md + USAGE.md
│   ├── tests/                  # Server unit + integration suites (run: npm run test:mcp)
│   ├── observability/          # SLO baselines, runbooks, alert evaluator scripts
│   └── wrangler.toml           # Worker config (staging + production envs)
├── tests/                      # Website unit/ integration/ e2e/ suites
├── .claude/                    # CLAUDE.md, PERMISSIONS.md, agents/, skills/, hooks/
├── .github/workflows/          # CI/CD (see DEVELOPER_TOOLING.md for the pipeline map)
└── public/                     # Static assets (+ runtime-fetched data)
```

## 🚀 Key Development Commands

The **authoritative command table** (all scripts, both workspaces) lives in [DEVELOPER_TOOLING.md § Quick reference](src/docs/development/DEVELOPER_TOOLING.md). Daily drivers:

```bash
npm run dev                    # Dev server (http://localhost:4321)
npm run build                  # Production build
npm run test:run               # Website unit + integration (once)
npm run test:mcp               # MCP server suite (delegates to the workspace)
npm run test:docs              # Docs guards: link/anchor integrity + VARIABLES_REFERENCE↔variables.css parity + design-sync name/ROOTS parity (required CI check)
npm run test:e2e               # Playwright E2E (only when told — see Directive 5)
npm run lint / lint:css        # ESLint / stylelint
npm run setup:claude-hooks     # One-time per machine: arm the review-gate hooks
npm run radar:seed / unseed    # Populate/clear the local stdio MCP radar snapshot (mock data, no API calls)
npm run radar:stub             # Serve a fake /radar/snapshot for the WEBSITE (different consumer from radar:seed)
```

## 📚 Critical Documentation

**Master index**: [src/docs/README.md](src/docs/README.md) — links to every documentation directory with use-case navigation. Start here when looking for any website-side project documentation.

### MCP Server & Architecture Decisions

The `@gst/mcp-server` workspace has its **own** maintained doc tree — the website master index above does not contain it. Start there for anything server-side:

- **MCP server docs home**: [mcp-server/src/docs/README.md](mcp-server/src/docs/README.md) — navigator for the server's internal doc surface (tools, resources, prompts, operations, testing)
- **System architecture (maintained reference)**: [mcp-server/src/docs/ARCHITECTURE.md](mcp-server/src/docs/ARCHITECTURE.md) — system shape, remote transport & request flow, auth/CORS/deploy topology, rate limiting, radar pipeline, observability. Code comments cite its anchors — treat them as load-bearing
- **Architecture Decision Records**: [src/docs/adr/README.md](src/docs/adr/README.md) — load-bearing design decisions distilled from closed initiatives. **Making a new architectural decision? Write an ADR for it in the same PR** (see [adr/TEMPLATE.md](src/docs/adr/TEMPLATE.md))

### Developer Tooling (Lint, Format, Hooks, CI)

- **Authoritative reference**: [src/docs/development/DEVELOPER_TOOLING.md](src/docs/development/DEVELOPER_TOOLING.md) — quick-reference table of all scripts, pre-commit hook flow, CI pipeline diagram, config file locations, review-gate mechanics, troubleshooting
- **When to read it**: before touching `.prettierrc.json`, `eslint.config.mjs`, `.stylelintrc.json`, `tsconfig.json`, `.husky/*`, `.github/workflows/*.yml`, `.claude/hooks/*`, or the `scripts` / `lint-staged` / `overrides` sections of `package.json`

### Testing & CI/CD

- **Start here**: [src/docs/testing/README.md](src/docs/testing/README.md) — use-case-based navigation to all testing docs
- **Writing or fixing E2E tests**: read [src/docs/testing/TEST_BEST_PRACTICES.md](src/docs/testing/TEST_BEST_PRACTICES.md) first — a numbered catalog of documented anti-patterns that cause flaky failures, with fixes
- **Writing new tests**: read [src/docs/testing/TEST_STRATEGY.md](src/docs/testing/TEST_STRATEGY.md) for test patterns by component type
- **Tests failing**: check [src/docs/testing/TROUBLESHOOTING.md](src/docs/testing/TROUBLESHOOTING.md) before debugging manually

### Development Roadmap

- **Development Backlog**: [src/docs/development/BACKLOG.md](src/docs/development/BACKLOG.md) - All open initiatives consolidated with user stories (open + deferred/candidate items only; completed stanzas are pruned — recover via `git log`)
- **Initiative-doc lifecycle**: closed-initiative design docs are distilled into maintained docs/ADRs, then archived — see [src/docs/development/README.md § Initiative-doc lifecycle](src/docs/development/README.md). Never leave a closed initiative's doc in the active directory; never archive without distilling first.
- **Sentry Setup**: [src/docs/development/SENTRY_MANUAL_SETUP.md](src/docs/development/SENTRY_MANUAL_SETUP.md) - Alert rules, source maps, consent gating

### Security

- **Security headers & CSP**: [src/docs/security/SECURITY_HEADERS.md](src/docs/security/SECURITY_HEADERS.md) — header inventory, CSP allowlist, how to add external services
- **Before adding any external script, API, or embed**: check the CSP allowlist and update both `vercel.json` and `src/middleware.ts`
- **Secrets**: never inline in shell commands or chat (Directive 15); inventory at [src/docs/operations/SECRETS_INVENTORY.md](src/docs/operations/SECRETS_INVENTORY.md)

### Analytics

- **Google Analytics Setup**: [src/docs/analytics/GOOGLE_ANALYTICS.md](src/docs/analytics/GOOGLE_ANALYTICS.md) - GA4 integration guide
- **Analytics Documentation**: [src/docs/analytics/README.md](src/docs/analytics/README.md)

## 🤖 Claude Agents

Specialized agents in `.claude/agents/`. Use the right agent for the task:

| Agent                            | Use When                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| **plan-reviewer**                | MANDATORY before ExitPlanMode (Directive 2) — adversarial design review, writes plan-review marker |
| **code-reviewer**                | MANDATORY before `git push` (Directive 7) — reviews the diff, writes impl-review marker            |
| **javascript-typescript-expert** | Architecture decisions, performance optimization                                                   |
| **test-automation-specialist**   | Implementing tests, designing test strategies                                                      |
| **test-strategy-architect**      | Test pyramid design, coverage analysis, CI/CD workflows                                            |
| **ui-ux-playwright-reviewer**    | E2E test strategy, Playwright patterns                                                             |
| **performance-testing-expert**   | Load testing, performance regression detection                                                     |
| **technical-debt-analyst**       | Refactoring, complexity analysis, debt reduction                                                   |

### Claude Skills

Repo skills in `.claude/skills/` (single `SKILL.md` with YAML frontmatter; keep them procedural and pointer-based — never restate styling facts a doc owns): **gst-page-content** (page copy: audience, voice, sentence/CTA formulas, content-type structure — styling defers to STYLES_GUIDE), **gst-ma-portfolio-card** (insert portfolio entries into `projects.json`), **get-api-docs** (fetch third-party API docs via chub). Adding or changing a skill? Update this roster line in the same PR.

## 🔄 Git Workflow

### Branch Strategy (trunk-based)

- **`master` is the trunk** — production-ready; every PR targets it directly
- **Feature branches** cut from `master`, named with a CI-covered family prefix: `feat/`, `fix/`, `feature/`, `docs/`, `chore/` (these families are wired into the CI push-trigger lists — a new prefix family must be added there too, see DEVELOPER_TOOLING.md)
- **`dev` is retired** (dormant since 2026-05-31) — do not branch from or merge to it
- **Merge commits, never squash** — PR merges use "Create a merge commit"
- **Never `git push` without explicit user authorization** — an approved plan authorizes only the pushes it states; pushes are additionally gated by Directive 7

### PR Requirements

- Required status checks (branch ruleset): **E2E Tests (Playwright)**, **Unit & Integration Tests**, **Lint & Type Check**, **Verify doc links** — plus branch up-to-date (strict policy). A PR stuck BLOCKED after "Update branch": close + reopen (see DEVELOPER_TOOLING.md § push-trigger notes)
- Review gates (Directives 2 & 7) precede the PR; CI enforces the rest

## 📊 Data Management

### Portfolio Data

- **Source**: `src/data/ma-portfolio/projects.json` — validated by schema-integrity unit tests (`npm run test:run`), which are the authoritative field list
- **PREPEND new entries** (don't append) — the UI renders in file order with no sort; newest belongs on top
- **Update flow**: edit → `npm run test:run` → commit. Push/PR only with user authorization (Directive 7)

## 🔍 Code Quality Standards

### Testing Standards

- **Doc pointers**: see 📚 Testing & CI/CD above — TEST_STRATEGY for what to write, TEST_BEST_PRACTICES before touching E2E
- **Unit**: fast, isolated, mocked · **Integration**: real dependencies, isolated data · **E2E**: critical user journeys only
- **Coverage**: 70% line threshold on the covered scopes (see `vitest.config.ts` / mcp-server config for exact include lists)
- **Never bump a timeout to fix a failing/flaky test** — diagnose the root cause. Known benign flake: the FIRST mcp-server test run of a day can time out on workerd cold-start; rerun before investigating — but **capture the failing test name before you rerun**, because a green rerun destroys the only evidence. An unreproduced single-test failure (`1 failed | 1973 passed`, BL-106, 2026-08-04) is still open for exactly that reason
- **Pre-existing test debt is not a free pass** — small failing tests in your touched area get fixed in the current PR, not waved through
- **Playwright: never set `permissions` at project level** in `playwright.config.ts` — desktop permissions crash mobile device contexts; grant per-test with `context.grantPermissions()` guarded by `browserName`

### CSS Styling Standards

- **Before writing or modifying any CSS**, read [src/docs/styles/STYLES_GUIDE.md](src/docs/styles/STYLES_GUIDE.md) — the single entry point for all styling conventions (tokens catalog: [VARIABLES_REFERENCE.md](src/docs/styles/VARIABLES_REFERENCE.md))
- **All colors, spacing, font sizes, and transitions come from the design system** — CSS variables and utility classes only; never hardcode values
- **Dark theme must work automatically** — use variables; the selector is `html.dark-theme`, not `body.dark-theme`
- **Palette overrides** in `palettes.css` — applied to `<html>` via class (like dark-theme); see BRAND_GUIDELINES.md § Alternative Palette System
- **Delta icons**: use `DeltaIcon.astro` component — never `<img>` tags (cannot inherit palette/theme colors via `currentColor`)
- **Buttons include frosted-glass** by default (`backdrop-filter: blur(2px)`, semi-transparent backgrounds) — see STYLES_GUIDE.md § Frosted Glass
- **Responsive design desktop-first** — base styles for desktop, `max-width` breakpoints for smaller screens
- **Astro `<style>` is scoped by default** — extracting markup into a sibling component silently breaks any class selector targeting it from the source file; restyle in the new component (or use `:global()` deliberately)
- **Renaming a `.brutal-*` class or a design token? It has a downstream consumer** — the design system is published to claude.ai/design and names classes explicitly, so a rename silently produces unstyled output there. Re-sync per [CLAUDE_DESIGN_SYNC.md](src/docs/development/CLAUDE_DESIGN_SYNC.md)

## 🚢 Deployment

- **Website**: Vercel — auto-deploys on push to `master`, preview deploys for PRs. Build `npm run build`, output `dist`. Trailing-slash canonicalization lives in `vercel.json` (`trailingSlash: true`) — NOT in `astro.config.mjs` (`'always'` breaks the dev server)
- **MCP Worker**: fully CI/CD — **staging auto-deploys** on a green MCP test run from a same-repo push (`deploy-mcp-staging.yml`; fork `pull_request` runs are refused — BL-111); **production** deploys on master merges touching Worker source, gated by the `mcp-production` GitHub Environment approval, latest-wins concurrency (`deploy-mcp-production.yml`); manual rollback via `rollback-mcp.yml`. **Never instruct anyone to manually rebuild/redeploy the Worker** — merge and let the pipeline run. Details: [mcp-server/src/docs/operations/DEPLOY.md](mcp-server/src/docs/operations/DEPLOY.md)

## 💡 Common Tasks

### Adding a New Component

1. Create `.astro` file in `src/components/`
2. Follow existing component patterns and CSS Styling Standards (above)
3. Add unit tests; if user-facing, add E2E tests
4. Test in both light and dark themes at desktop, 768px, and 480px

### Adding a New Page

1. **Model page**: [src/pages/hub/index.astro](src/pages/hub/index.astro) — copy its shape (BaseLayout + composed components), don't hand-roll structure. The **in-repo control examples** for every component/token are [src/pages/brand.astro](src/pages/brand.astro) + [src/components/brand/](src/components/brand/) (see STYLES_GUIDE § In-repo control examples)
2. Design-system tokens only — no hardcoded colors, spacing, font sizes (stylelint enforces colors; see STYLES_GUIDE)
3. Verify in light AND dark theme AND all 6 palettes (PalettePanel pop-out from /brand — see BRAND_GUIDELINES § Alternative Palette System)
4. Desktop-first responsive: base styles for desktop, `max-width` overrides at 768px and 480px
5. Page copy: use the `gst-page-content` skill (audience, voice, structure)
6. Add E2E coverage per [TEST_STRATEGY.md](src/docs/testing/TEST_STRATEGY.md); ensure the route is covered by `tests/e2e/accessibility.test.ts`

### Working with Palettes

1. Palette definitions: `src/styles/palettes.css` (CSS variable overrides per `html.palette-N`)
2. Palette metadata: `src/data/palettes.ts` (names, concepts, token tips)
3. Palette JS logic: `src/scripts/palette-manager.ts` (switching, color editing, panel controls)
4. To add a new palette: add `--altN-*` variables in `palettes.css` (light + dark), add `html.palette-N` override block, add entry to `palettes.ts`
5. PalettePanel renders site-wide from `BaseLayout.astro`; visible on `/brand` always, other pages via pop-out toggle

### Updating Portfolio Data

1. Edit `src/data/ma-portfolio/projects.json` — **prepend** the new entry (see 📊 Data Management)
2. Run: `npm run test:run` to validate schema
3. Commit; push/PR only with user authorization

### Extending an MCP Tool

1. Read the tool's `CONTRACT.md` + `USAGE.md` under `mcp-server/src/docs/tools/<tool>/` and [ARCHITECTURE.md](mcp-server/src/docs/ARCHITECTURE.md)
2. **Tool↔prompt parity**: extending a tool's inputs must also extend its companion `gst_*` prompt (wire-shape adapters) and self-document id/enum args in `.describe()` so a cold LLM call can discover valid values
3. Run `npm run test:mcp` (contract-parity and prompt-compat tests enforce much of this)

---

**Last Updated**: July 19, 2026 — full accuracy overhaul + review-gate directives (2 & 7) added; directives renumbered 1–15 (old 4a→6, old 5–12 → 8–15)
