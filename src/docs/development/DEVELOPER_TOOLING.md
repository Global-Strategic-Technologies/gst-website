# Developer Tooling

Project-specific reference for the quality tooling installed during Phase 2 of [PLATFORM_HARDENING_V1.md](./PLATFORM_HARDENING_V1.md). Covers what runs when, how to run things manually, where the configuration lives, and how to resolve the most common failure modes.

> This is a reference, not a tutorial. If you need to learn what Prettier or ESLint _are_, read their upstream docs. This document describes how **this specific project** uses them.

---

## Quick reference

| Need                                   | Command                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| Start the dev server                   | `npm run dev`                                                                |
| Run unit and integration tests (once)  | `npm run test:run`                                                           |
| Run unit and integration tests (watch) | `npm run test`                                                               |
| Run tests with coverage                | `npm run test:coverage`                                                      |
| Run E2E tests                          | `npm run test:e2e` (Chromium only: `npm run test:e2e -- --project=chromium`) |
| Type-check the whole project           | `npx astro check`                                                            |
| Lint all JS/TS/Astro                   | `npm run lint`                                                               |
| Lint and auto-fix                      | `npm run lint:fix`                                                           |
| Lint CSS and Astro scoped styles       | `npm run lint:css`                                                           |
| Format all files                       | `npm run format`                                                             |
| Check formatting without writing       | `npm run format:check`                                                       |
| Build for production                   | `npm run build`                                                              |
| Preview the production build           | `npm run preview`                                                            |

**Authoritative local validation sequence** (what CI runs, in the same order):

```bash
npx astro check      # type errors
npm run lint         # ESLint (JS/TS/Astro)
npm run lint:css     # stylelint (CSS)
npm run test:run     # Vitest unit + integration
```

If all four pass locally, CI will almost certainly pass too.

---

## What runs automatically

### On every `git commit`

The [husky](https://typicode.github.io/husky) pre-commit hook ([.husky/pre-commit](../../../.husky/pre-commit)) runs [lint-staged](https://github.com/lint-staged/lint-staged), which applies the configured commands **only to the files you staged** (not your whole codebase). This keeps the hook fast — typically under 2 seconds.

The flow:

```
git commit -m "..."
  │
  ├─▶ .husky/pre-commit runs: npx lint-staged
  │
  ├─▶ lint-staged reads staged files and matches them against
  │    the globs in package.json's "lint-staged" config
  │
  ├─▶ For *.{ts,tsx,mjs,cjs,js}:
  │     1. eslint --fix   (auto-fix lint violations)
  │     2. prettier --write (reformat)
  │
  ├─▶ For *.astro:
  │     1. eslint --fix    (JS/TS in frontmatter + script tags)
  │     2. stylelint --fix (scoped <style> blocks)
  │     3. prettier --write
  │
  ├─▶ For *.css:
  │     1. stylelint --fix
  │     2. prettier --write
  │
  ├─▶ For *.{json,md,yaml,yml}:
  │     1. prettier --write
  │
  ├─▶ If any command fails (e.g., ESLint finds a non-fixable error),
  │    the commit is ABORTED and lint-staged restores the original
  │    state from a stash
  │
  ├─▶ If all commands succeed, lint-staged re-stages the cleaned
  │    files so the commit captures the fixed version
  │
  └─▶ Git proceeds with the commit
```

**Important**: the hook runs **before** the commit is recorded. A file you staged with double-quotes and 4-space indent may end up in the commit with single-quotes and 2-space indent — that's Prettier doing its job between the stash and the record. If you see your commit look different than your working tree expected, that's why.

### On every push and PR to `master`

The GitHub Actions workflow [.github/workflows/test.yml](../../../.github/workflows/test.yml) runs a 3-job parallel-then-gate pipeline:

```
┌───────────────────────────────────────────────────────────────┐
│                                                                │
│   changes (gate job, ~5s)                                      │
│    │                                                            │
│    │ Detects whether the PR touches any non-docs files using   │
│    │ dorny/paths-filter@v3. Outputs `code: true | false`.      │
│    ▼                                                            │
│                                                                │
│   ┌─ Lint & Type Check ──────────┐                             │
│   │  astro check                  │                             │
│   │  eslint .                     │ runs in parallel            │
│   │  stylelint                    │ with the tests job          │
│   │  npm audit --omit=dev         │                             │
│   │  (~30-60s when code changed)  │                             │
│   └───────────────┐                                             │
│                   │                                             │
│   ┌─ Unit & Integration Tests ─┐  │                             │
│   │  vitest run --coverage     │  │                             │
│   │  (~15-30s when code        │  │                             │
│   │   changed)                 │  │                             │
│   └────────────────┬───────────┘  │                             │
│                    │                ▼                           │
│                    └────────────────┬────────┐                  │
│                                      │        │                 │
│                                      ▼        │                 │
│                   ┌─ E2E Tests (Playwright) ──┴─┐               │
│                   │  build                        │              │
│                   │  playwright test              │              │
│                   │  (~17 minutes when code       │              │
│                   │   changed)                    │              │
│                   └───────────────────────────────┘              │
│                                                                  │
│   Docs-only changes (code: false): each job runs a trailing      │
│   "Skipped" step that reports success, so branch protection      │
│   requirements are satisfied without burning CI minutes.         │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

All three jobs are **required status checks** on the `master` branch protection ruleset — a PR cannot merge until all three report success.

---

## Tools installed

| Tool                                                                               | Role                                                                                                                              | Config file                                                                                |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [Prettier](https://prettier.io/)                                                   | Opinionated code formatter. Normalizes whitespace, quote style, trailing commas, line wrapping. Does NOT change program behavior. | [.prettierrc.json](../../../.prettierrc.json), [.prettierignore](../../../.prettierignore) |
| [ESLint](https://eslint.org/)                                                      | Lint JS, TS, and Astro files. Catches real bugs (unused vars, unsafe types, dead code) — not style.                               | [eslint.config.mjs](../../../eslint.config.mjs)                                            |
| [typescript-eslint](https://typescript-eslint.io/)                                 | ESLint plugin that adds TypeScript-aware rules                                                                                    | (extends from eslint.config.mjs)                                                           |
| [eslint-plugin-astro](https://github.com/ota-meshi/eslint-plugin-astro)            | ESLint plugin for `.astro` file parsing and rules                                                                                 | (extends from eslint.config.mjs)                                                           |
| [eslint-config-prettier](https://github.com/prettier/eslint-config-prettier)       | Disables ESLint rules that would conflict with Prettier's formatting                                                              | (extends from eslint.config.mjs)                                                           |
| [stylelint](https://stylelint.io/)                                                 | Lint CSS files AND scoped `<style>` blocks inside `.astro` files (via postcss-html custom syntax)                                 | [.stylelintrc.json](../../../.stylelintrc.json)                                            |
| [postcss-html](https://github.com/ota-meshi/postcss-html)                          | PostCSS custom syntax used by stylelint to parse `<style>` blocks inside `.astro` files                                           | (referenced from .stylelintrc.json `overrides`)                                            |
| [stylelint-config-html](https://github.com/ota-meshi/stylelint-config-html)        | Shared stylelint config for HTML-like files; provides the `/astro` sub-export used in the `.astro` override                       | (referenced from .stylelintrc.json `overrides`)                                            |
| [@astrojs/check](https://docs.astro.build/en/reference/cli-reference/#astro-check) | TypeScript type-check for `.astro` files (`astro check`)                                                                          | [tsconfig.json](../../../tsconfig.json)                                                    |
| [husky](https://typicode.github.io/husky)                                          | Installs git hooks automatically on `npm install`                                                                                 | [.husky/pre-commit](../../../.husky/pre-commit)                                            |
| [lint-staged](https://github.com/lint-staged/lint-staged)                          | Scope git-hook commands to only the staged files (keeps hooks fast)                                                               | `package.json` → `"lint-staged"`                                                           |
| [prettier-plugin-astro](https://github.com/withastro/prettier-plugin-astro)        | Prettier plugin for parsing `.astro` files                                                                                        | (referenced from .prettierrc.json)                                                         |

---

## Configuration file locations

| File                                                              | Purpose                                                                                         |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [package.json](../../../package.json)                             | `scripts`, `devDependencies`, `lint-staged`, `overrides`, `prepare`                             |
| [.prettierrc.json](../../../.prettierrc.json)                     | Prettier formatting rules (2-space, single quotes, 100-char line width, etc.)                   |
| [.prettierignore](../../../.prettierignore)                       | Files and directories Prettier will not touch (generated output, lock files, hand-curated data) |
| [eslint.config.mjs](../../../eslint.config.mjs)                   | ESLint flat config — recommended rules + overrides for tests, node scripts, and browser globals |
| [.stylelintrc.json](../../../.stylelintrc.json)                   | CSS lint rules                                                                                  |
| [tsconfig.json](../../../tsconfig.json)                           | TypeScript config, including the `@/*` → `src/*` path alias                                     |
| [.husky/pre-commit](../../../.husky/pre-commit)                   | Single line: `npx lint-staged`                                                                  |
| [.github/workflows/test.yml](../../../.github/workflows/test.yml) | CI pipeline (3 jobs + changes gate)                                                             |

---

## Prettier style (this project)

Configured in [.prettierrc.json](../../../.prettierrc.json):

| Setting          | Value      | Effect                                                                       |
| ---------------- | ---------- | ---------------------------------------------------------------------------- |
| `singleQuote`    | `true`     | `'hello'` not `"hello"`                                                      |
| `trailingComma`  | `"es5"`    | Trailing commas where legal in ES5 (arrays, objects)                         |
| `printWidth`     | `100`      | Wraps long lines at 100 characters                                           |
| `tabWidth`       | `2`        | 2-space indentation                                                          |
| `semi`           | `true`     | Always use semicolons                                                        |
| `arrowParens`    | `"always"` | `(x) => x`, not `x => x`                                                     |
| `bracketSpacing` | `true`     | `{ a: 1 }`, not `{a: 1}`                                                     |
| `endOfLine`      | `"lf"`     | Unix line endings (matters on Windows — git's autocrlf should not undo this) |

### What Prettier will NOT format

See [.prettierignore](../../../.prettierignore) for the full list. Notable entries:

- **Hand-curated data files**: `src/data/ma-portfolio/projects.json`, `src/data/canada-provinces.json`
- **Regulatory map content collection**: `src/data/regulatory-map/` (120 JSON files curated manually)
- **Lock files**: `package-lock.json`
- **Generated output**: `dist/`, `.astro/`, `.vercel/`, `coverage/`, `playwright-report/`, `test-results/`

### Known gap — the full-codebase Prettier sweep is deferred

Phase 2 Commit 4 added `.prettierrc.json` but deliberately did NOT run `prettier --write .` on the codebase. Instead, the pre-commit hook formats files incrementally as they're touched. `npm run format:check` currently fails on a large number of legacy files and is therefore NOT wired into CI.

**A full `prettier --write .` sweep is tracked as a Phase 9 backlog item** in [PLATFORM_HARDENING_V1.md](./PLATFORM_HARDENING_V1.md). Once the legacy files are swept, `format:check` will be added to the `lint-and-typecheck` CI job.

Until then: if you want a specific file or directory formatted, run `npx prettier --write <path>` manually.

---

## ESLint configuration notes

The [eslint.config.mjs](../../../eslint.config.mjs) uses the modern **flat config** format (not the legacy `.eslintrc`). Key points:

- **Strictness level**: "recommended" only — starts conservative to avoid drowning the initial rollout in violations. Stricter type-aware rules (`no-unsafe-assignment`, `strict-boolean-expressions`, etc.) can be layered on later.
- **`_`-prefixed names are allowed unused**: `const [_, value] = pair` and `function handler(_event, data)` are both fine. Matches standard Node/TS idiom.
- **Test files get `no-explicit-any: 'off'`**: test fixtures legitimately use `any` for mocks and untyped request bodies.
- **Browser globals are declared per-directory**: `window`, `document`, `navigator`, DOM types — all available in `src/**` and `tests/e2e/**` without import.
- **Node globals are declared for scripts**: `process`, `console`, `fetch`, `Buffer` — available in `scripts/**`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.mjs`.

### Ignored files

The following files are explicitly excluded from linting:

- Build output: `dist/`, `.astro/`, `.vercel/`, `coverage/`, `playwright-report/`, `test-results/`, `.cache/`, `node_modules/`, `public/`
- Minified vendor assets: `**/*.min.js`, `**/*.min.css`
- Stale one-shot migration scripts at repo root: `abbreviate-arr.js`, `sort-projects.js` (tracked in Phase 9 backlog for deletion)
- `src/pages/hub/tools/techpar/index.astro` — `astro-eslint-parser` emits a spurious parsing error at the `<style>` block boundary on this one file. Other large `.astro` files (including the 3778-line `brand.astro`) parse cleanly. Tracked in Phase 9 backlog for investigation.

---

## stylelint configuration notes

[.stylelintrc.json](../../../.stylelintrc.json) uses a **base config** (for plain `.css` files) plus a dedicated **`.astro` override** that enables stylelint to parse `<style>` blocks inside Astro components.

### How .astro scoped-style linting works

The `.astro` override uses two packages:

- **[postcss-html](https://github.com/ota-meshi/postcss-html)** — a PostCSS custom syntax that knows how to skip frontmatter and HTML, pluck out `<style>` contents, and hand them to stylelint for parsing
- **[stylelint-config-html/astro](https://github.com/ota-meshi/stylelint-config-html)** — a shared stylelint config that registers the Astro-specific file type and wires up defaults

The override block in `.stylelintrc.json`:

```json
"overrides": [
  {
    "files": ["**/*.astro"],
    "extends": ["stylelint-config-standard", "stylelint-config-html/astro"],
    "customSyntax": "postcss-html",
    "rules": { /* same rule set as base config */ }
  }
]
```

The base rules are duplicated inside the `.astro` override because stylelint's `extends` + `overrides` interaction does not inherit rules from the parent config. Keep the two rule sets in sync when editing.

### Running stylelint

```bash
npm run lint:css           # lint src/**/*.{css,astro}
npx stylelint "src/**/*.{css,astro}" --fix   # auto-fix what can be fixed
```

The pre-commit hook runs `stylelint --fix` on staged `.css` and `.astro` files. `.astro` files ALSO pass through `eslint --fix` and `prettier --write` in the same hook.

### `@layer` support

The base and override configs both register `layer` as an allowed at-rule (`at-rule-no-unknown: [true, { "ignoreAtRules": ["import", "layer"] }]`) so CSS cascade layer declarations parse cleanly. This supports the `@layer reset, tokens, utilities, components, theme, overrides;` scheme introduced in Phase 3 commit 0b.

### Complexity rules in the `.astro` override

Phase 3 commit 0c enabled a tighter complexity rule set in the `.astro` override only. These rules are too noisy for legacy `global.css` but are cheap wins in naturally bounded scoped blocks:

- `max-nesting-depth: [3, { ignoreAtRules: [media, supports, container] }]` — prevents deeply nested scoped rules; `@media`, `@supports`, and `@container` don't count toward the depth since they're conditional wrappers, not selector nesting
- `selector-max-compound-selectors: 4` — caps the number of compound selectors in any single selector (e.g., `.a .b .c .d .e` would fail)
- `declaration-block-no-shorthand-property-overrides` — flags patterns like `background-color: red; background: blue;` where the longhand is silently overwritten
- `shorthand-property-no-redundant-values` — flags `padding: 0 0 4px 0` (redundant trailing `0`) and similar; auto-fixable
- `declaration-block-no-redundant-longhand-properties` — flags patterns where multiple longhand declarations could be consolidated into a shorthand

Two rules from the original Phase 3 plan — `selector-max-specificity: "0,3,0"` and `no-descending-specificity: true` — were deferred to Phase 9 backlog (item #7) because they surfaced ~100 pre-existing violations in monolithic hub tool files. Those will be addressed once the Phase 3 main migration (commits 5-10c) has relocated most offending selectors out of those files.

### Latent specimen-override disables in global.css

[src/styles/global.css](../../styles/global.css) contains two `stylelint-disable no-duplicate-selectors` blocks around the brand-page specimen section (search/filter cluster and stats/cta cluster). These specimens deliberately re-declare production component styles. Phase 3 commits 10a/10b/10c will move them into `brand.astro` scoped styles (with a `.brand-specimen` guard), at which point the disable comments should be removed.

---

## npm audit policy

Phase 2 CI runs:

```bash
npm audit --audit-level=moderate --omit=dev
```

**Why `--omit=dev`**: dev-only advisories (e.g., `@astrojs/check` → `yaml-language-server` → `yaml`) affect local development tooling but never reach users. Production dependencies must stay at zero advisories; dev-only moderate advisories are tolerated and revisited case-by-case.

**Current production state**: zero vulnerabilities (verified post-Phase-2).

**Package overrides** — see [package.json](../../../package.json) `overrides` block:

- `path-to-regexp: 6.3.0` — forces the patched version across the dependency tree to close `GHSA-9wv6-86v2-598j` without a destructive `@astrojs/vercel` downgrade. Re-evaluate when `@vercel/routing-utils` ships a clean upgrade path.

---

## Common workflows

### "I want to format the whole codebase right now"

```bash
npm run format
```

Be aware this will produce a large diff against the current state. The expected place to do this is as a single standalone commit during the Phase 9 sweep, not piecemeal during feature work.

### "My commit was rejected by the pre-commit hook"

1. **Read the error** — the hook shows which command failed and which file triggered it
2. **Common causes**:
   - **ESLint found a non-auto-fixable violation**: open the file, fix the violation, re-stage, re-commit
   - **Prettier failed to parse your file**: syntax error in the code, fix it
   - **stylelint found a CSS error**: same remediation as ESLint
3. **`lint-staged` has already rolled back the stash**, so your working tree is back to its pre-commit state. No changes were lost.

### "CI fails but it passes locally"

Run the exact CI sequence locally:

```bash
npm ci                   # clean install from lockfile (matches CI)
npx astro check
npm run lint
npm run lint:css
npm audit --audit-level=moderate --omit=dev
npm run test:run
```

If all six pass, the failure is likely E2E-only or environment-specific. Check:

- Playwright browser version mismatch (CI uses `npx playwright install --with-deps`)
- Timezone or locale dependency (CI runs in UTC)
- Network requests the test accidentally makes (all production traffic should be mocked)

### "I need to temporarily skip the hook"

**Don't.** The hook exists for a reason. If you genuinely have an emergency:

```bash
git commit --no-verify -m "emergency: ..."
```

Then immediately follow up with a normal commit that fixes whatever the hook would have caught. CI will still enforce everything the hook enforces, plus tests, so `--no-verify` only defers the problem by ~1 minute.

### "I need to update a dependency and the override blocks it"

The `overrides` block in `package.json` pins `path-to-regexp: 6.3.0`. If you upgrade `@astrojs/vercel` to a version whose transitive `path-to-regexp` is already 6.3.0+ or later, you can delete the override. Verify by running `npm audit --omit=dev` after the upgrade — if it stays at zero vulnerabilities, the override is safe to remove.

### "I want to run tests only for one file"

```bash
npx vitest run tests/unit/filterLogic.test.ts
```

Or pass a name pattern:

```bash
npx vitest run -t "categorizeGrowthStage"
```

### "I want to see the coverage report locally"

```bash
npm run test:coverage
# Then open coverage/index.html in a browser
```

---

## Post-merge manual steps for Phase 2

Two manual steps are required to complete Phase 2. Both are documented in [PLATFORM_HARDENING_V1.md § Phase 2 Post-Merge Manual Steps](./PLATFORM_HARDENING_V1.md#post-merge-manual-steps). Summary:

1. **Update branch protection ruleset** to add `Lint & Type Check` to the required-checks list on ruleset 12237842. Must happen AFTER the Phase 2 PR merges to master. Full `gh` CLI recipe in the hardening doc.
2. **Verify `astro dev` no longer emits the `[content] Content config not loaded` warning** — resolved by adding an empty `src/content.config.ts`, but only verifiable on a fresh dev server startup.

---

## Related documentation

- [PLATFORM_HARDENING_V1.md](./PLATFORM_HARDENING_V1.md) — the initiative that introduced this tooling
- [TEST_STRATEGY.md](../testing/TEST_STRATEGY.md) — test patterns by component type
- [TEST_BEST_PRACTICES.md](../testing/TEST_BEST_PRACTICES.md) — E2E anti-patterns
- [STYLES_GUIDE.md](../styles/STYLES_GUIDE.md) — CSS conventions (enforced by stylelint)

---

**Last Updated**: April 11, 2026 (Phase 2 of PLATFORM_HARDENING_V1)
