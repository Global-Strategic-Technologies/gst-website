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

/**
 * Shared `no-restricted-imports` pattern banning the live Inoreader client
 * from mcp-server source (ADR-0004 / BL-031.5).
 *
 * Referenced by BOTH the `mcp-server/src/**` block and the narrower
 * `mcp-server/src/prompts/**` block. The restatement is mandatory: flat config
 * REPLACES a rule's options when a later object sets the same rule id for a
 * matched file, so a prompts-scoped block that listed only its own pattern
 * would quietly drop this ban for every prompt module.
 */
const INOREADER_CLIENT_PATTERN = {
  group: [
    '**/lib/inoreader/client',
    '**/lib/inoreader/client.ts',
    '../../src/lib/inoreader/client*',
    '../../../src/lib/inoreader/client*',
  ],
  // Deliberately does NOT name `content/radar-snapshot.ts` as the alternative:
  // this message also renders inside the Worker-reachable scope below, where
  // that module is itself banned. Read through a `SnapshotReader` instead.
  message:
    'mcp-server/src/** must not import the live Inoreader client. Read cached data through a SnapshotReader (content/radar-snapshot-reader.ts) instead. See src/docs/adr/0004-hub-surface-resources-import-restriction.md.',
};

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
      // claude.ai/design sync artifacts, same rule as .wrangler above: both are
      // generated, both are gitignored, and neither is ours to lint. `ds-bundle/`
      // is the converter's output (it embeds a vendored React UMD build, which
      // alone contributed ~1,980 errors) and `.ds-sync/` is the skill's staged
      // scripts + their isolated dep tree. The authored sources under
      // `.design-sync/` ARE linted — they're hand-written and committed. They
      // are type-checked separately: the root tsconfig's `**/*` never descends
      // into dot-directories, so `astro check` does not see them; instead
      // `tests/integration/design-sync-guards.test.ts` runs
      // `tsc -p .design-sync` (BL-135). See src/docs/development/CLAUDE_DESIGN_SYNC.md.
      'ds-bundle/**',
      '.ds-sync/**',
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
  //
  // Extracted to a const because the prompts-scoped block below has to
  // restate it (flat config replaces rule options rather than merging them),
  // and two hand-maintained copies would drift.
  {
    files: ['mcp-server/src/**/*.{ts,mts}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [INOREADER_CLIENT_PATTERN] }],
    },
  },

  // ── Worker-bundle safety: no Worker-reachable module may reach the
  //    fs-backed reader ──
  // `content/radar-snapshot.ts` imports node:fs / node:path / node:url and
  // resolves its cache directory from `import.meta.url`, which is `undefined`
  // in the Worker bundle. `prompts/embed.ts` imported it, so every remote
  // `prompts/get gst_radar_brief_today` failed with a JSON-RPC -32603 while
  // stdio worked perfectly. Consumers take a `SnapshotReader` instead;
  // reaching for the fs reader directly from any of these files reopens the
  // bug class.
  //
  // This block RESTATES the Inoreader pattern above. It is not redundant: in
  // flat config, a later object setting the same rule id for a matched file
  // REPLACES the earlier options rather than merging them, so listing only the
  // radar pattern here would silently delete the ADR-0004 protection for every
  // file in scope — adding a guard while removing one.
  {
    // Scoped to every module that is reachable from the Worker and has no
    // legitimate reason to touch the fs-backed reader. `tools/_local-only.ts`
    // and `tools/radar-offline.ts` are deliberately NOT listed — they are the
    // stdio-only surface and importing it is their job.
    files: [
      'mcp-server/src/prompts/**/*.{ts,mts}',
      'mcp-server/src/resources/**/*.{ts,mts}',
      'mcp-server/src/server.ts',
      'mcp-server/src/worker.ts',
      'mcp-server/src/content/radar-snapshot-reader-worker.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            INOREADER_CLIENT_PATTERN,
            {
              // Anchored to the exact module. A bare `**/content/radar-snapshot*`
              // would also match `radar-snapshot-reader`, which `_registry.ts`
              // legitimately imports for the `SnapshotReader` type.
              //
              // The bare `./radar-snapshot` forms are load-bearing, not
              // padding: a file living INSIDE `content/` writes a sibling
              // specifier, which none of the `content/`-prefixed patterns
              // match. Without them the rule was inert on exactly the file it
              // was extended to cover (`radar-snapshot-reader-worker.ts`) —
              // and a clean lint run cannot tell "no violators" from "pattern
              // never matches", so verify this group by planting an import
              // rather than by reading green output.
              group: [
                '**/content/radar-snapshot',
                '**/content/radar-snapshot.ts',
                '../content/radar-snapshot',
                '../content/radar-snapshot.ts',
                './radar-snapshot',
                './radar-snapshot.ts',
              ],
              message:
                'Worker-reachable modules must not import content/radar-snapshot — it is node:fs-backed and throws in the Worker bundle (JSON-RPC -32603 on prompts/get). Read through a SnapshotReader instead (prompts get one from _registry.ts; the Worker builds one via createWorkerCachedSnapshotReader), or import the message constants from content/radar-messages.ts.',
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

  // ── BL-137: no bare `Buffer` / `process` / `global` in mcp-server ─────────
  // `mcp-server/src/worker.ts:1` carries
  // `/// <reference types="@cloudflare/workers-types" />`. That directive loads
  // the package's `index.d.ts`, a global SCRIPT which since 5.20260807.2
  // declares `Buffer: any`, `process: any` and `global: ServiceWorkerGlobalScope`
  // at global scope, shadowing `@types/node`. Reference directives are
  // program-wide, so every bare use of those names in a program that reaches
  // `worker.ts` loses its types — silently, because `any` never errors.
  //
  // The fix is to never rely on them as globals: `import { Buffer } from
  // 'node:buffer'` / `import process from 'node:process'` resolve to
  // `@types/node` regardless of what the ambient scope says. This block is what
  // keeps that true. It is also what makes the version pins removable — see
  // ADR-0020 and `tests/integration/workers-types-globals.test.ts`.
  //
  // TWO rules, not one, and both are required:
  //
  //   - `no-restricted-globals` covers VALUE positions only. Its implementation
  //     skips any reference whose parent is a type node
  //     (`node_modules/eslint/lib/rules/no-restricted-globals.js`), by design.
  //     Run alone over `oauth-flow.test.ts` — whose `function b64url(buf: Buffer)`
  //     was one of the two originally-broken sites — it reports NOTHING.
  //   - `no-restricted-syntax` with a `TSTypeReference` selector covers TYPE
  //     positions. Purely syntactic: it fires on `let x: Buffer` whether or not
  //     `Buffer` is imported, which is deliberate. An import fixes the value
  //     lookup; it does not make the annotation unambiguous to a reader, and the
  //     `Uint8Array` supertype is the right annotation in every site we had.
  //
  // KNOWN HOLE, recorded rather than papered over: the type-node skip list also
  // covers `TSTypeQuery` and `TSQualifiedName`, so `typeof process.env` escapes
  // both rules. No such usage exists today.
  //
  // No `mcp-server/scripts/**` carve-out is needed — the globs below are rooted
  // at `mcp-server/src` and `mcp-server/tests`, so they never reach it. (The
  // `{ts,mts}` extension does match the five `.d.mts` files that live there, so
  // the path prefix is what excludes them, not the extension.)
  //
  // Both rules were mutation-probed at authoring time: a planted value
  // reference and a planted type reference each fail `npm run lint`.
  {
    files: ['mcp-server/src/**/*.{ts,mts}', 'mcp-server/tests/**/*.{ts,mts}'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'Buffer',
          message:
            "Import it: `import { Buffer } from 'node:buffer'`. The bare global is typed `any` wherever workers-types' index.d.ts is loaded (ADR-0020). For byte length prefer `utf8ByteLength()` from src/lib/utf8-bytes.ts.",
        },
        {
          name: 'process',
          message:
            "Import it: `import process from 'node:process'` (default import — @types/node uses `export = process`). The bare global is typed `any` wherever workers-types' index.d.ts is loaded (ADR-0020).",
        },
        {
          name: 'global',
          message:
            "Don't use the `global` global — workers-types declares it as `ServiceWorkerGlobalScope`, which is not what `@types/node` means by it. Use `globalThis`.",
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "TSTypeReference > Identifier[name='Buffer']",
          message:
            'Bare `Buffer` in type position. Annotate `Uint8Array` instead (Buffer extends it, so callers are unaffected) — importing the value does not make this annotation safe to read. See ADR-0020.',
        },
        {
          selector: "TSTypeReference > Identifier[name='process']",
          message: 'Bare `process` in type position. See ADR-0020.',
        },
        {
          selector: "TSTypeReference > Identifier[name='global']",
          message: 'Bare `global` in type position. See ADR-0020.',
        },
      ],
    },
  },

  // ── Prettier compatibility: MUST be last ───────────────────────────
  prettier,
];
