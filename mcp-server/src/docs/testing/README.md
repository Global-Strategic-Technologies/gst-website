# MCP Server — Testing

This directory covers two bands of testing, which answer different questions:

- **Automated** — the Vitest suite, described by the rest of this file. Proves the _code_ is correct, on every push, with no human involved.
- **Human acceptance** — [`uat/README.md`](uat/README.md). Proves the _deployed server_ does what it claims, from a real client, with a person driving it and recording a verdict against a build. Start at [`uat/SETUP.md`](uat/SETUP.md).

The two do not overlap. A green Vitest run says the handlers behave; it says nothing about whether a connected Claude client can obtain a credential, reach the Worker, and get a usable answer. That is what the UAT suite is for.

---

## Automated suite

Vitest suite for the `@gst/mcp-server` workspace. Proves engine parity and schema integrity for the tools exposed over the MCP transports — **17 tools** as of 0.47.0 (15 on the Worker, plus `search_radar_offline` and `search_radar_cache` registered only on stdio). `protocol-roundtrip.test.ts` holds the authoritative name list; this line named three of them and had done so for many releases (corrected under BL-112).

Two suites are worth knowing about before adding a tool, because both fail when a new tool ignores them:

- **`tests/integration/protocol-roundtrip.test.ts`** — the tool/prompt/Resource inventory and the response-envelope contract.
- **`tests/integration/tool-response-budget.test.ts`** — every registered tool's response **size**. A tool with no budget entry fails the suite, so a new tool cannot ship without a size decision. See [ADR-0011 § Note 2026-08-06](../../../../src/docs/adr/0011-tool-response-channel-policy.md) for why budgets are policy rather than client limits.

The workspace is self-contained — its tests, coverage thresholds, and CI workflow are independent of any consuming project.

---

## What's covered today

| Area                       | File                           | Asserts                                                                                                                       |
| -------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Input contract (diligence) | `tests/unit/diligence.test.ts` | `UserInputsSchema` accepts the canonical 13-field payload, rejects bad enums, rejects payloads missing required fields        |
| Engine wrapper (diligence) | `tests/unit/diligence.test.ts` | `generateScript` returns non-empty `topics`, JSON-serializable output, well-formed `attentionAreas`, varies with input        |
| Dataset bundle integrity   | `tests/unit/portfolio.test.ts` | `ProjectsArraySchema.parse(projectsRaw)` succeeds at module init; project count regression-locked; non-empty `technologies[]` |
| Search input contract      | `tests/unit/portfolio.test.ts` | `SearchPortfolioInputSchema` defaults applied, empty input accepted (no `limit` — removed in BL-031.95)                       |
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
│   ├── unit/        # 108 files — engines, schemas, wrappers, metrics, cache
│   └── integration/ # 41 files — protocol round-trips, Worker boot, auth, OAuth
├── vitest.config.ts # globs: tests/unit/**, tests/integration/**
└── package.json
```

Both directories are declared in [`vitest.config.ts`](../../../vitest.config.ts). `tests/integration/` was originally a placeholder for anticipated protocol-level work; that work has long since landed — it now holds protocol round-trips, `unstable_dev` Worker-boot suites (auth, CORS, rate limiting, OAuth, protocol era), and contract-parity guards.

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

## Integration coverage

_(This section previously read "Why no E2E or integration tests yet" and described the MCP surface as "three pure-function wrappers". It was written before Resources, Prompts, the remote transport, OAuth and the tier system landed, and had been stale for some time — corrected under BL-106.)_

The integration suite covers three bands:

- **Protocol round-trips** — an in-process server + client pair exercising tool / resource / prompt discovery and JSON-RPC responses (`protocol-roundtrip`, `prompts-args-shape`, `resource-uri-stability`).
- **Worker boot** — real `unstable_dev` Workers asserting the HTTP edge: auth, CORS, rate limiting, OAuth flows, the radar snapshot endpoint, and protocol-era behaviour (`protocol-era-worker`).
- **Contract guards** — manifest-hash stability and CONTRACT.md/USAGE.md parity, which fail on registry drift rather than on behaviour.

There is still no browser E2E here; the website workspace owns that (Playwright), and this package has no browser surface.

Human verification of the deployed surface lives in [`uat/`](uat/README.md) — outside the Vitest suite by nature, since it exercises a real client against production rather than code in a runner.
