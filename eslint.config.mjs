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
      '.astro/**',
      '.vercel/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.cache/**',
      'node_modules/**',
      'public/**',
      // Generated / vendored
      '**/*.min.js',
      '**/*.min.css',
      // Stale one-shot migration scripts at repo root — tracked in
      // PLATFORM_HARDENING_V1.md Phase 9 backlog for deletion.
      'abbreviate-arr.js',
      'sort-projects.js',
      // astro-eslint-parser trips on this file with a spurious
      // "Declaration or statement expected" error at the <style>
      // block boundary (line 601). Other large .astro files including
      // brand.astro (3778 lines) and diligence-machine/index.astro
      // parse fine, so this is file-specific. Tracked in Phase 9 for
      // further investigation. Prettier parses it correctly.
      'src/pages/hub/tools/techpar/index.astro',
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
    files: ['tests/unit/**/*.{ts,tsx}', 'tests/integration/**/*.{ts,tsx}'],
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

  // ── Prettier compatibility: MUST be last ───────────────────────────
  prettier,
];
