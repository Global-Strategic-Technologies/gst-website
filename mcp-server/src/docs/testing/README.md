# MCP Server — Testing

Vitest suite for the `@gst/mcp-server` workspace. Proves engine parity and schema integrity for the tools exposed over the MCP stdio transport: `generate_diligence_agenda`, `search_portfolio`, `list_portfolio_facets`.

The workspace is self-contained — its tests, coverage thresholds, and CI workflow are independent of any consuming project.

---

## What's covered today

| Area                       | File                           | Asserts                                                                                                                       |
| -------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Input contract (diligence) | `tests/unit/diligence.test.ts` | `UserInputsSchema` accepts the canonical 13-field payload, rejects bad enums, rejects payloads missing required fields        |
| Engine wrapper (diligence) | `tests/unit/diligence.test.ts` | `generateScript` returns non-empty `topics`, JSON-serializable output, well-formed `attentionAreas`, varies with input        |
| Dataset bundle integrity   | `tests/unit/portfolio.test.ts` | `ProjectsArraySchema.parse(projectsRaw)` succeeds at module init; project count regression-locked; non-empty `technologies[]` |
| Search input contract      | `tests/unit/portfolio.test.ts` | `SearchPortfolioInputSchema` defaults applied, `limit` clamped to (0, 61], empty input accepted                               |
| Filter parity              | `tests/unit/portfolio.test.ts` | `filterProjects` honors `search`, `theme`, and `engagement` predicates                                                        |
| Facet determinism          | `tests/unit/portfolio.test.ts` | themes sorted ascending, years descending, dedup invariants for engagement categories and growth stages                       |

---

## How to run

All scripts are defined in this workspace's [`package.json`](../../../package.json) and assume the repo-root `npm install` has already been run (the workspace install hoists shared deps into the top-level `node_modules`).

```bash
# From the workspace directory:
npm test            # vitest run, single pass
npm run test:watch  # watch mode for local development
npm run typecheck   # strict tsc --noEmit across the import graph
npm run build       # tsc + esbuild bundle to dist/

# From the repo root (equivalent):
npm -w @gst/mcp-server run test
```

A passing local run finishes in well under 5 seconds (pure-function suite, no I/O, no browser).

---

## Coverage

- Provider: `v8`
- Reporters: `text`, `json`, `json-summary`, `html`
- Thresholds: 70% across `lines`, `branches`, `functions`, `statements` — vitest fails the run if any metric falls below
- Scope: `src/**/*.ts` (excludes `src/index.ts`, the stdio bootstrap — it is exercised by the binary smoke test in CI, not by unit tests)
- Output: `coverage/` (gitignored)

The `coverage-summary.json` reporter is enabled so CI can post per-run metrics to the workflow run page.

---

## File organization

```
mcp-server/
├── src/             # source under test
│   └── docs/
│       └── testing/
│           └── README.md  # this file
├── tests/
│   ├── unit/        # current — pure-function wrapper tests
│   └── integration/ # reserved for future MCP-protocol-level tests
├── vitest.config.ts # globs: tests/unit/**, tests/integration/**
└── package.json
```

The `tests/integration/` directory is pre-declared in [`vitest.config.ts`](../../../vitest.config.ts) so future protocol-level tests (spinning up the stdio transport in-process, exercising tool-registration discovery, asserting JSON-RPC responses) can drop in without a config change.

---

## How to add a new test

1. Create `tests/unit/<feature>.test.ts`. Vitest globals (`describe`, `it`, `expect`) are enabled in [`vitest.config.ts`](../../../vitest.config.ts) — no imports needed for the test runner itself.
2. Follow the AAA pattern: arrange → act → assert. One observable behavior per `it` block.
3. Test the **public surface** — input schema parsing, output shape, JSON-serializability, error paths. Avoid asserting on internals; the wrappers must stay swappable.
4. Avoid mocking the engines being wrapped. Direct calls keep the suite honest about parity — if the engine drifts, the test fails immediately.
5. Run `npm test` to confirm green; `npm run typecheck` to confirm types.

### Minimal template

```typescript
import { someEngine } from '../../../src/utils/some-engine';
import { SomeInputSchema } from '../../src/schemas';

describe('SomeInputSchema (tool input contract)', () => {
  it('rejects an unknown enum with a structured error', () => {
    const result = SomeInputSchema.safeParse({ field: 'invalid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['field']);
    }
  });
});

describe('some_tool (engine parity)', () => {
  it('serializes cleanly to JSON', () => {
    const out = someEngine(validInput);
    expect(() => JSON.stringify(out)).not.toThrow();
  });
});
```

---

## CI

Every push and PR that touches `mcp-server/**` or any of the workspace's transitive imports runs the dedicated **MCP Server Test Suite** workflow at [`.github/workflows/test-mcp-server.yml`](../../../../.github/workflows/test-mcp-server.yml).

The workflow:

1. Checks out, installs deps, runs `typecheck` → `build` → `vitest --coverage`
2. Posts a coverage summary table (Statements / Branches / Functions / Lines) to the run page
3. Smoke-tests the bundled binary by piping closed stdin and asserting clean exit
4. Uploads `mcp-server/coverage/` as the `mcp-server-coverage` artifact (7-day retention)

It runs in parallel to other workflows on the same commit. A failure here is exclusively attributable to the workspace — there is no cross-contamination from unrelated suites.

Editing only documentation under `mcp-server/**/*.md` does not trigger this workflow (excluded by the path filter).

---

## Why no E2E or integration tests yet

The current MCP surface is three pure-function wrappers over already-tested engines. Asserting on the wrappers' inputs, outputs, and JSON-serializability is sufficient for engine-parity claims.

A future MCP-protocol-level integration suite is anticipated alongside the Resources (BL-031.5) and Prompts (BL-031.75) primitives — at that point the protocol surface becomes large enough that a direct stdio harness is warranted. The placeholder `tests/integration/` directory is already wired into the vitest include glob for that work.
