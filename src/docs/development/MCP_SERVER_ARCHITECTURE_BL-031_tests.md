# MCP Server — BL-031 Test Surface Completion

> **Backlog initiative**: [BL-031: MCP Server — Internal Prototype (Phase 1)](BACKLOG.md#bl-031-mcp-server--internal-prototype-phase-1)
>
> **Scope**: this document captures the design and rationale for closing the three open acceptance-criteria gaps in BL-031, so the initiative can be marked Complete with all 11 boxes ticked. The original architecture and tool-surface design lives in [MCP_SERVER_ARCHITECTURE_BL-031.md](MCP_SERVER_ARCHITECTURE_BL-031.md) — read that first if you have not.
>
> **Predecessor**: [MCP_SERVER_ARCHITECTURE_BL-031.md](MCP_SERVER_ARCHITECTURE_BL-031.md) — the original Phase 1 architecture, file layout, and tool-registration design. This document extends, does not replace, that design.
>
> **Sibling reference**: [`mcp-server/src/docs/testing/README.md`](../../../mcp-server/src/docs/testing/README.md) — workspace-level testing conventions; describes the `tests/unit/` and `tests/integration/` split this document operationalizes.
>
> **Status**: Open, ready for implementation. This work has no open dependencies.

---

## Context

BL-031 is feature-complete: the local stdio MCP server is built, three tools (`generate_diligence_agenda`, `search_portfolio`, `list_portfolio_facets`) are registered, the binary smoke test passes, the unit-test suite passes, the live MCP exercise from any Claude client returns parity with the website wizard, and the deliberate-bad-input rejection path returns a clean structured error envelope (verified live this session with `transactionType: "blow-job"` returning `Invalid option: expected one of...`).

But three of the eleven [BL-031 acceptance criteria](BACKLOG.md#bl-031-mcp-server--internal-prototype-phase-1) are not yet _literally_ satisfied by an artifact in the repo:

1. **AC #9 — "Vitest unit tests for the tool handlers using the SDK's in-memory test transport"** is not done. The current `tests/unit/*.test.ts` files exercise the Zod schemas and engines directly — they do not go through the MCP protocol layer. The AC's wording is specific about the transport.
2. **AC #10 — "Manual smoke test recorded in the README"** is partially satisfied. The workspace README has a `Smoke test (manual parity check)` _procedure_ (here is what to do) but no _recorded result_ (here is what we got when we did it). The AC says "recorded".
3. **AC #11 — "Repo-root `npm run lint` and `npx astro check` continue to pass"** is unverified in the current branch state. Last green at session start; many edits have landed since (regulatory-map fix, vitest config additions, test-file moves, new docs, root-`package.json` script additions). The work is probably fine but has no fresh evidence.

Closing these three gaps is the difference between "the feature works" and "the AC is literally satisfied". This document captures the design decisions for the test surface, the SDK constraint that shapes them, and the convention compliance that justifies the approach.

### The SDK constraint that shapes the design

The pinned `@modelcontextprotocol/server@2.0.0-alpha.2` package does **not** export an in-memory test transport. Available transport classes:

- `StdioServerTransport` — production
- `WebStandardStreamableHTTPServerTransport` — production
- (no `InMemoryTransport`, no `createTransportPair`, no `LoopbackTransport`)

The original AC was written assuming the SDK would ship a test helper. The v2-alpha doesn't yet. But the `Transport` _interface_ is exported (in `node_modules/@modelcontextprotocol/server/dist/index-Bhfkexnj.d.mts:9114-9165`), so we vendor a minimal paired-pipe implementation that satisfies the interface.

This is honest: we do not pretend the SDK provides what it doesn't, and we do not skip the AC by claiming the unit tests are "close enough". We meet the spirit of the AC ("test through the protocol layer") with a small, auditable test helper.

---

## Test design — protocol roundtrip via paired Transport

The test surface adds two artifacts to the workspace:

### `tests/helpers/paired-transport.ts` — the vendored Transport pair

A ~30-line file that implements the SDK's `Transport` interface as two paired halves. Each half holds a reference to the other; `send()` on one side enqueues the message into the other's `onmessage` callback via `queueMicrotask` (preserving JSON-RPC's async ordering invariants without making the helper synchronous).

```typescript
import type { JSONRPCMessage, Transport, TransportSendOptions } from '@modelcontextprotocol/server';

class PairedHalf implements Transport {
  private partner: PairedHalf | null = null;
  onmessage?: (msg: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  link(partner: PairedHalf): void {
    this.partner = partner;
  }
  async start(): Promise<void> {
    /* no-op */
  }
  async send(message: JSONRPCMessage, _opts?: TransportSendOptions): Promise<void> {
    queueMicrotask(() => this.partner?.onmessage?.(message));
  }
  async close(): Promise<void> {
    this.partner = null;
    this.onclose?.();
  }
}

export function createPairedTransports(): { server: PairedHalf; client: PairedHalf } {
  const server = new PairedHalf();
  const client = new PairedHalf();
  server.link(client);
  client.link(server);
  return { server, client };
}
```

The helper is deliberately minimal:

- No serialization step — both ends share an in-process JS reference, so `JSONRPCMessage` flows by reference. The SDK never touches the network layer in tests.
- No fault injection — tests assert on success paths and SDK-emitted error envelopes, not transport-layer failures (those belong to BL-032+).
- No `sessionId` or `setProtocolVersion` overrides — the SDK accepts the default `undefined` per the optional-field semantics in the `Transport` interface.

### `tests/integration/protocol-roundtrip.test.ts` — the roundtrip suite

Covers the three AC-required cases (happy path, invalid input, empty result) for each of the three registered tools, plus the MCP `initialize` handshake that must succeed before `tools/call` is dispatched. ~9 cases:

| Case                                                  | Tool                        | Expected                                                                                                                            |
| ----------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `initialize` handshake completes                      | (protocol)                  | Server returns `protocolVersion`, `capabilities.tools`, server info; no error envelope                                              |
| `tools/list` returns three tools                      | (registry)                  | Response includes `generate_diligence_agenda`, `search_portfolio`, `list_portfolio_facets` with their JSON-Schema input definitions |
| `generate_diligence_agenda` happy path                | `generate_diligence_agenda` | `result.content[0].type === 'text'`, parsed JSON has non-empty `topics`, `metadata.totalQuestions > 0`                              |
| `search_portfolio` happy path                         | `search_portfolio`          | `result.content[0]` parses to `{ matches: [...], totalMatched: 42, returned: 3 }` for `{ search: "platform", limit: 3 }`            |
| `list_portfolio_facets` happy path                    | `list_portfolio_facets`     | `result.content[0]` parses to `{ themes: [15], engagementCategories: [2], growthStages: [6], years: [5] }`                          |
| `generate_diligence_agenda` invalid input — bad enum  | `generate_diligence_agenda` | Response is a JSON-RPC error or `result.isError === true` with field-named error message; engine never invoked                      |
| `search_portfolio` invalid input — `limit` exceeds 61 | `search_portfolio`          | Response is structured error citing the `limit` constraint                                                                          |
| `list_portfolio_facets` accepts an empty input object | `list_portfolio_facets`     | No error envelope despite no fields supplied (input schema is empty object)                                                         |
| `search_portfolio` empty result — `search: "zxqzxq"`  | `search_portfolio`          | `result.content[0]` parses to `{ matches: [], totalMatched: 0, returned: 0 }`; no error                                             |

Each case follows AAA (arrange → act → assert) and asserts on the **JSON-RPC envelope shape** (`result.content[]`, `result.isError`, error `code` / `message`) — not on engine internals. This is the protocol-layer verification the AC asks for.

### Server bootstrap refactor — extract `createServer()` factory

To make the registered server testable without spinning up `StdioServerTransport`, `mcp-server/src/index.ts` factors into:

- `mcp-server/src/server.ts` — exports `createServer(): McpServer` that instantiates the server, registers all three tools, and returns the configured instance (no transport connected).
- `mcp-server/src/index.ts` — calls `createServer()`, then `connect(new StdioServerTransport())`, then logs the connection. Behavior unchanged for the binary; the smoke test (`node mcp-server/dist/index.js < /dev/null` printing `[gst-mcp] connected on stdio`) still passes byte-for-byte.

Tests import `createServer` and connect to a `PairedHalf` instead of stdio.

This is a 10-line move. No new dependencies. The `dist/index.js` produced by `npm run build` continues to be a runnable CLI binary.

---

## Test conventions — compliance verification

Three convention sources govern this work. The planned test surface complies with each:

### 1. Workspace testing README — [`mcp-server/src/docs/testing/README.md`](../../../mcp-server/src/docs/testing/README.md)

| Convention                                                                                                        | Source line | Compliance                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/integration/` reserved for "future MCP-protocol-level tests"                                               | line 63     | New file lives at `tests/integration/protocol-roundtrip.test.ts` — exactly the slot the workspace docs anticipated                      |
| The integration directory is "pre-declared in `vitest.config.ts` so future protocol-level tests can drop in"      | line 68     | No vitest config change needed — `tests/integration/**/*.test.ts` is already in the include glob                                        |
| Vitest globals enabled — no `import { describe, it, expect } from 'vitest'`                                       | line 74     | The new test file uses globals only; aligns with both the workspace config and site anti-pattern #9                                     |
| AAA pattern — one observable behavior per `it` block                                                              | line 75     | Each of the ~9 cases follows arrange (set up server + transport pair) → act (send `tools/call`) → assert (envelope shape)               |
| Test the public surface, not internals                                                                            | line 76     | Assertions are on JSON-RPC envelope structure (`result.content[]`, `result.isError`, error codes) — not on engine state or wrapper code |
| Avoid mocking the engines being wrapped                                                                           | line 77     | `createServer()` registers the real handlers; `generateScript` and `filterProjects` run unmocked; parity is enforced by construction    |
| Anticipated future use case: "spinning up the stdio transport in-process, exercising tool-registration discovery" | line 68     | The `tools/list` case exercises tool-registration discovery; the rest exercise the in-process protocol roundtrip                        |

### 2. Site test strategy — [`src/docs/testing/TEST_STRATEGY.md`](../testing/TEST_STRATEGY.md)

| Convention                                                | Compliance                                                                                                                                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test pyramid: 60–70% unit, 15–20% integration, 10–15% E2E | The workspace currently has 24 unit + 0 integration tests; this work adds ~9 integration tests, moving the workspace toward the recommended ratio without introducing E2E    |
| AAA pattern (Arrange / Act / Assert)                      | Every test case is structured this way                                                                                                                                       |
| Test behavior, not implementation                         | Assertions on JSON-RPC envelope (the _behavior_ the protocol commits to), not on internal state of the `McpServer` instance                                                  |
| Use fixtures for test data                                | The valid 13-field payload from `tests/unit/diligence.test.ts` is reused (and could be extracted to `tests/fixtures/` if a third test file references it; out of scope here) |
| Run tests in <5s for unit, <15s for integration           | Pure-function suite, no I/O, in-process transport — projected runtime <100ms per integration case                                                                            |
| Coverage target ≥ 70%                                     | Workspace already at threshold; new tests add coverage to the registration and handler paths previously only exercised by direct calls                                       |

### 3. Site anti-patterns — [`src/docs/testing/TEST_BEST_PRACTICES.md`](../testing/TEST_BEST_PRACTICES.md)

The integration suite avoids every anti-pattern the doc enumerates that applies to vitest unit/integration tests:

| Anti-pattern                                                                 | Avoided by                                                                                                                                                                       |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------- |
| #1 — False-positive assertions (`toBeGreaterThanOrEqual(0)`, `value          |                                                                                                                                                                                  | true`) | All assertions specify the expected value or shape exactly |
| #2 — Testing UI presence, not behavior                                       | (N/A — no UI; behavior is the JSON-RPC envelope)                                                                                                                                 |
| #3 — Placeholder timeouts instead of state waits                             | No `setTimeout` or `waitForTimeout`. `queueMicrotask` ordering in `PairedHalf.send` is sufficient for the request-response cycle                                                 |
| #9 — Importing `describe`/`it`/`expect` from `'vitest'` when `globals: true` | Only `import { vi }` if mocks are needed (currently no mocks); the rest are globals                                                                                              |
| #10 — Top-level `beforeEach`/`afterEach` outside a `describe` block          | The `beforeEach` that sets up `server`/`client` lives inside `describe('protocol roundtrip', () => { ... })`                                                                     |
| #16 — `page.$$` snapshot queries (Playwright)                                | (N/A — vitest, not Playwright)                                                                                                                                                   |
| #17 — `page.evaluate(() => el.click())` without waiting for DOM reaction     | (N/A — vitest, not Playwright)                                                                                                                                                   |
| #26 — Source-side readiness signals emitted before all handlers are bound    | `createServer()` registers ALL three tools synchronously and returns the configured instance; tests connect AFTER registration is complete. No premature-readiness race possible |

The integration suite is opinion-aligned with the doc's "Red Flags — Tests to Fix" list (`expect(value || true)`, arbitrary `waitForTimeout`, etc.) — none apply.

### One pattern this work introduces that isn't in the existing convention docs

**The `tests/helpers/` directory.** The site's TEST*STRATEGY mentions `tests/fixtures/` for test data; the workspace testing README doesn't address helpers explicitly. Placing `paired-transport.ts` in `tests/helpers/` (rather than `tests/fixtures/` or co-located with the test file) is a small extension of the documented convention. The justification: the file is a \_test helper* (executable code that supports tests), not a _fixture_ (static data). Once this lands, a one-line addition to the workspace testing README's "File organization" section will codify the pattern for future helpers.

---

## File layout (extends [BL-031](MCP_SERVER_ARCHITECTURE_BL-031.md))

```
mcp-server/
├── src/
│   ├── index.ts                                  # refactored — calls createServer(), connects stdio
│   ├── server.ts                                 # NEW — exports createServer() factory
│   ├── tools/                                    # unchanged
│   ├── schemas.ts                                # unchanged
│   └── docs/
│       └── testing/
│           └── README.md                         # may gain a one-line note about tests/helpers/
└── tests/
    ├── helpers/
    │   └── paired-transport.ts                   # NEW — ~30-line PairedTransport
    ├── unit/                                     # unchanged
    │   ├── diligence.test.ts
    │   └── portfolio.test.ts
    └── integration/                              # NEW directory (was reserved, now populated)
        └── protocol-roundtrip.test.ts            # NEW — ~9 cases
```

## Critical files to read or modify

| File                                                                                            | Action                                                                                          | Why                                                                                 |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [`mcp-server/src/index.ts`](../../../mcp-server/src/index.ts)                                   | Refactor — extract registration into `createServer()`; main() calls factory then connects stdio | Allows tests to acquire the same configured server without spawning a child process |
| `mcp-server/src/server.ts` (new)                                                                | Create — exports `createServer()`                                                               | Single source of registration logic, used by both binary and tests                  |
| `node_modules/@modelcontextprotocol/server/dist/index-Bhfkexnj.d.mts:9114-9165`                 | Read only — `Transport` interface contract                                                      | Drives the `PairedHalf` implementation                                              |
| `mcp-server/tests/helpers/paired-transport.ts` (new)                                            | Create — implements `Transport` in two paired halves                                            | The vendored substitute for the in-memory transport the SDK does not yet ship       |
| `mcp-server/tests/integration/protocol-roundtrip.test.ts` (new)                                 | Create — ~9 cases per the table above                                                           | The protocol-layer verification AC #9 requires                                      |
| [`mcp-server/README.md`](../../../mcp-server/README.md)                                         | Edit — add "Last verified: <date>" recorded smoke stanza                                        | Closes AC #10                                                                       |
| [BACKLOG.md § BL-031](BACKLOG.md#bl-031-mcp-server--internal-prototype-phase-1)                 | Edit — Status: Complete with date; tick all 11 AC boxes; fix `57 projects` → `61 projects`      | Reflects the completed state; closes the hygiene gap                                |
| Repo-root validation: `npx astro check && npm run lint && npm run lint:css && npm run test:run` | Run — confirm green                                                                             | Closes AC #11                                                                       |

## Verification

Run order, with explicit pass criteria for each step:

1. **Refactor + factory extraction lands cleanly**

   ```bash
   npm -w @gst/mcp-server run typecheck
   npm -w @gst/mcp-server run build
   node mcp-server/dist/index.js < /dev/null
   ```

   Pass: typecheck green; binary still prints `[gst-mcp] connected on stdio` on closed stdin.

2. **PairedTransport + integration suite passes**

   ```bash
   npm -w @gst/mcp-server run test
   ```

   Pass: 24 unit tests + ~9 integration tests = ~33 green; coverage threshold (70% lines/branches/functions/statements) maintained.

3. **Recorded smoke stanza added to README**
   Pass: `mcp-server/README.md` Smoke test section contains a dated "Last verified" block with concrete output values (topic count, totalMatched, the `Invalid option` rejection text).

4. **Repo-root validation runs green**

   ```bash
   npx astro check && npm run lint && npm run lint:css && npm run test:run
   ```

   Pass: all four commands exit zero.

5. **Live MCP exercise unchanged**
   Re-run `mcp__gst__list_portfolio_facets`, `mcp__gst__search_portfolio` (`{search: "platform", limit: 3}` → 42 total / 3 returned), `mcp__gst__generate_diligence_agenda` (canonical payload → 20 questions / 4 attention areas).
   Pass: outputs identical to the recorded smoke values.

6. **BACKLOG entry updated**
   Pass: `git diff src/docs/development/BACKLOG.md` shows exactly three changes (Status field; 11 checkbox ticks; "57 projects" → "61 projects") and nothing else.

7. **AC compliance audit**
   Re-read [BL-031 acceptance criteria](BACKLOG.md#bl-031-mcp-server--internal-prototype-phase-1):
   - AC #9: `tests/integration/protocol-roundtrip.test.ts` exists, uses `PairedTransport`, covers happy path / invalid input / empty result for all three tools.
   - AC #10: README has "Last verified: April 27, 2026" with recorded output evidence.
   - AC #11: validation command output captured.

## Risks & mitigations

| Risk                                                                                                                        | Mitigation                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The SDK's `Transport` interface evolves between v2.0.0-alpha.2 and v2.0.0 stable, breaking the vendored `PairedHalf`        | The interface is small (5 methods, 3 callbacks) and reflects the JSON-RPC framing the MCP spec already commits to. If new required methods land, the helper gets ~5 lines of additions. CI will fail loudly on a type error. Track the SDK's release notes; reconsider vendoring if the SDK ships a real test transport. |
| The integration suite drifts from the binary behavior because the binary uses `StdioServerTransport` and tests don't        | The `createServer()` factory is the single registration site. Both binary and test consume it. Drift is structurally impossible without a deliberate code change to one path that doesn't propagate to the other — which would also fail the binary smoke test in CI                                                     |
| `queueMicrotask` ordering differs between Node versions and produces flaky tests                                            | `queueMicrotask` is part of the standard since Node 14; semantics are stable. The MCP protocol does not impose synchronous ordering. If a flake appears, it is almost certainly a real ordering bug surfaced by the test, not a helper bug                                                                               |
| The `tests/helpers/` directory pattern is undocumented; future contributors place helpers elsewhere                         | Add a one-line note to the workspace testing README's "File organization" section after this work lands. Cheap, prevents drift                                                                                                                                                                                           |
| AC #11 (`npm run lint && npx astro check`) fails because of unrelated drift in the current branch                           | Running the full validation sequence catches it; fix root causes (per CLAUDE.md's "no `--no-verify`" rule). If a regression is unrelated to BL-031 work, log it and decide scope: roll into this PR, or surface as a separate follow-up                                                                                  |
| The recorded smoke stanza grows stale (next contributor changes a tool's output without updating the date-stamped evidence) | The stanza is dated. A new contributor who notices the "Last verified" date is months old should re-run the smoke and update the date — that's the discipline. Cheap regression check: a future CI step could parse the date and warn if >180 days old (out of scope)                                                    |

## Out of scope (deferred to BL-031.5 / BL-031.75 / BL-032)

- **Tests for MCP Resources primitive** — BL-031.5 introduces Resources; the integration suite there will exercise `resources/list` and `resources/read`. The `PairedTransport` helper is reusable as-is; no new transport work needed.
- **Tests for MCP Prompts primitive** — BL-031.75 introduces Prompts; same as above (reusable transport, new test cases).
- **HTTP-transport roundtrip tests** — BL-032 introduces `WebStandardStreamableHTTPServerTransport`; testing that surface needs different harness work (real HTTP, request/response framing).
- **Adoption metrics for BL-031 outcomes** — the four target outcomes in the BACKLOG entry's Outcomes section (100% team adoption, ≥5 uses/week, zero divergence reports, foundation validated) are post-ship usage observations. They are not artifact-verifiable from the codebase. Not closing them here is intentional.
- **Replacing the unit tests with integration tests** — the existing `tests/unit/*.test.ts` files cover schema and engine concerns at a different abstraction. Integration tests do not subsume them. Both layers stay.
- **A formal `package` test for `@modelcontextprotocol/client@2.0.0-alpha.x`** — the workspace deliberately does not depend on the client package. Crafting JSON-RPC envelopes manually is sufficient for protocol-roundtrip verification and avoids pinning a second alpha package.

---

_Last updated: 2026-04-27_
