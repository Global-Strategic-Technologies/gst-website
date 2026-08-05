// ESLint flat config for the GST website.
//
// Starts at "recommended" strictness for JS, TS, and Astro — aims to
// catch real bugs without drowning the initial rollout in violations.
// Stricter type-aware rules (no-unsafe-*, strict-boolean-expressions,
// no-misused-promises) can be layered on later as a Phase 9 item once
// the baseline is clean.
//
// Formatting rules are owned by Prettier; eslint-config-prettier is
// loaded last to disable any ESLint rules that would conflict.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import prettier from 'eslint-config-prettier';

export default [
  // ── Ignores (replaces .eslintignore in flat config) ───────────────
  {
    ignores: [
      'dist/**',
      '**/dist/**',
      '.astro/**',
      '**/.astro/**',
      '.vercel/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.cache/**',
      // Wrangler's build cache. `unstable_dev` (the Worker integration tests)
      // writes bundled Worker output here, so after any `npm run test:mcp` these
      // generated files contributed ~2,650 errors to `npm run lint` — one of the
      // four authoritative validation commands. Not style debt: it made the
      // command unusable, and it concretely buried a real single-line error in
      // `mcp-server/src/schemas.ts` during BL-108. Generated output is never
      // ours to lint.
      '**/.wrangler/**',
      'node_modules/**',
      '**/node_modules/**',
      'public/**',
      // Generated / vendored
      '**/*.min.js',
      '**/*.min.css',
      // CommonJS config files (Lighthouse CI)
      '**/*.cjs',
    ],
  },

  // ── Base JS recommended ────────────────────────────────────────────
  js.configs.recommended,

  // ── TypeScript recommended ─────────────────────────────────────────
  ...tseslint.configs.recommended,

  // ── Rule adjustments applied everywhere ────────────────────────────
  {
    rules: {
      // Respect `_`-prefixed names as intentionally unused.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // ── Astro recommended ──────────────────────────────────────────────
  ...astro.configs.recommended,

  // ── Per-file overrides ─────────────────────────────────────────────
  {
    // Config files and standalone Node scripts (including scripts/).
    // These run under Node and use globals like process, console, fetch.
    files: [
      '**/*.{cjs,mjs}',
      'scripts/**/*.{js,mjs,ts}',
      'vitest.config.ts',
      'playwright.config.ts',
      'eslint.config.mjs',
    ],
    languageOptions: {
      globals: {
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        TextDecoder: 'readonly',
        AbortSignal: 'readonly',
      },
    },
  },
  {
    // Test files routinely use `any` for mocks, request bodies, etc.
    // Relax no-explicit-any from error to off for tests only.
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Vitest globals (describe, it, expect, beforeAll, afterEach, vi)
    // are declared via the "vitest/globals" types entry in tsconfig
    // but ESLint also needs them declared to avoid no-undef.
    files: [
      'tests/unit/**/*.{ts,tsx}',
      'tests/integration/**/*.{ts,tsx}',
      'mcp-server/tests/**/*.{ts,tsx}',
    ],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
        afterAll: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
      },
    },
  },
  {
    // Browser globals for client-side scripts and .astro files
    files: ['src/**/*.{ts,tsx,astro}', 'src/**/*.js', 'tests/e2e/**/*.ts'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        console: 'readonly',
        HTMLElement: 'readonly',
        HTMLAnchorElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        CustomEvent: 'readonly',
        Event: 'readonly',
        MouseEvent: 'readonly',
        KeyboardEvent: 'readonly',
        Element: 'readonly',
        Node: 'readonly',
        NodeList: 'readonly',
        Window: 'readonly',
        Document: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        IntersectionObserver: 'readonly',
        ResizeObserver: 'readonly',
        MutationObserver: 'readonly',
      },
    },
  },

  // ── Ban process.env in application code (use astro:env instead) ────
  {
    files: ['src/**/*.{ts,tsx,astro}'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Use astro:env/server or astro:env/client imports instead of process.env. ' +
            'See DEVELOPER_TOOLING.md § Environment variables.',
        },
      ],
    },
  },

  // ── Inoreader budget protection (BL-031.5) ─────────────────────────
  // The local MCP server MUST NOT make live Inoreader API calls — they
  // would burn the shared 200 req/day budget. Radar tools/resources read
  // exclusively from the seeded snapshot. Enforced structurally here:
  // mcp-server/src/** cannot import the live client.
  {
    files: ['mcp-server/src/**/*.{ts,mts}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/lib/inoreader/client',
                '**/lib/inoreader/client.ts',
                '../../src/lib/inoreader/client*',
                '../../../src/lib/inoreader/client*',
              ],
              message:
                'mcp-server/src/** must not import the live Inoreader client. Read from the cached snapshot via mcp-server/src/content/radar-snapshot.ts instead. See src/docs/adr/0004-hub-surface-resources-import-restriction.md.',
            },
          ],
        },
      ],
    },
  },

  // ── BL-032 Phase 2: Worker code path must use safeLog() ──────────
  // Cloudflare's `wrangler tail` and Sentry both surface anything written
  // to console.log / console.error. A careless console.log(request.headers)
  // on a Worker fetch handler dumps the Authorization header to those
  // streams. The safe-logger module accepts only structured fields and
  // auto-redacts known-sensitive keys; this rule forces its use.
  //
  // Exempt: src/index.ts (stdio entrypoint — stdout is reserved for MCP
  // protocol traffic, so console.error to stderr is the correct diagnostic
  // channel; no Authorization headers exist on the stdio path).
  // Exempt: src/auth/safe-logger.ts (the one file that wraps console.log
  // — uses an `eslint-disable-next-line no-console` at the call site).
  {
    files: ['mcp-server/src/worker.ts', 'mcp-server/src/auth/**/*.ts'],
    rules: {
      'no-console': 'error',
    },
  },

  // ── GoogleAnalytics: gtag pattern requires `arguments`, not rest-spread ────
  // gtag.js's runtime monkey-patches dataLayer.push and inspects pushed values,
  // requiring the Arguments object specifically. A real Array (rest-spread)
  // silently routes through a code path that does NOT execute the gtag command,
  // so no /g/collect beacons fire. The component also has an inline
  // `eslint-disable-next-line prefer-rest-params` directive on the gtag function
  // for in-file discoverability — this file-level off is the second line of
  // defense. See:
  //   - src/components/GoogleAnalytics.astro (the canonical pattern)
  //   - tests/integration/google-analytics-wiring.test.ts (the regression test)
  //   - commits 9bce902 (fix) and 26abba3 (test)
  {
    files: ['src/components/GoogleAnalytics.astro'],
    rules: {
      'prefer-rest-params': 'off',
    },
  },

  // ── Prettier compatibility: MUST be last ───────────────────────────
  prettier,
];
