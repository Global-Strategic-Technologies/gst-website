# ADR-0042: Tool-page client scripts live in `src/scripts/<tool>/`, not in the `.astro` page

- **Status**: Accepted (2026-09-28)
- **Source initiative**: the 2026-09-26 repo-wide tech-debt audit, batch 6 (no design doc; the audit's rulings are recorded in its PRs, #523–#527 and the batch-6 series)

## Context

Six Hub tool pages carried their whole client app as one bundled `<script>` inside the `.astro` file: the Regulatory Map (1,371 lines), the Diligence Machine (1,165), Infrastructure Cost Governance (944), the Tech Debt Calculator (683), and the two IRL tools (375, 285). Three things followed from that:

- **Nothing could import the code**, so none of its logic was unit-testable. `tests/integration/diligence-wizard-navigation.test.ts` went as far as re-implementing the wizard as a `WizardNavigationSimulator` because "the production code cannot be extracted", and its line citation into the page had already gone stale.
- **The pages ran to 2,000–3,000 lines** of markup, scoped CSS and application code together.
- **Tests that guard the code had to read `.astro` source** (`tests/unit/tool-analytics.test.ts` regex-scanned the pages for `trackEvent` calls).

Two precedents already existed. TechPar's page is one `<script>import '…/techpar-ui';</script>`, with the UI split across `src/utils/techpar-ui.ts` and `src/utils/techpar/{state,dom,chart}.ts` (moved to `src/scripts/techpar/` by this decision's final PR). And `src/scripts/ambient/` is a feature directory whose pure `build.ts` is unit-tested by `tests/unit/ambient-build.test.ts`.

## Decision

**A tool page's client script lives in `src/scripts/<tool>/`, and the page keeps a one-line side-effect import:**

```astro
<script>
  import '../../../../scripts/<tool>';
</script>
```

A bundled Astro `<script>` is already a deferred module that runs once, so moving its body into an imported module changes nothing at runtime: `DOMContentLoaded` wrappers still fire (a deferred module runs before that event — `palette-manager.ts` already relies on this), and a top-level `await` still suspends only that module. The JSON-LD `is:inline` script stays in the page.

**The directory's shape:**

- `index.ts` — wiring and init; the page's import target.
- Further modules only along a real seam (state, rendering, a separable domain). No module exists for its own sake; a small tool is just `index.ts`. Cycles are broken by passing callbacks in, as TechPar's `index.ts` does. The Regulatory Map is the counter-example: its map, panel, search and timeline all share state created after the page's top-level data fetch (the region map, the d3 selection, the active category), so they stay in one `index.ts`, with `faq-analytics.ts` split out only because it must run before that fetch.
- **`logic.ts` — the tool's DOM-free logic**, when there is any: functions that take only data (formatters, predicates, HTML-string builders, state migrations). It is unit-tested in the node environment and **counted by coverage** through the single glob `src/scripts/*/logic.ts` in `vitest.config.ts`. Everything else under `src/scripts/` is browser-only and covered by E2E. Calculation engines shared with the MCP server stay in `src/utils/` (`tech-debt-engine.ts`, `icg-engine.ts`, …).

**Rejected: `src/utils/<tool>/`, mirroring TechPar.** `src/utils/**` is in the MCP CI and production-deploy path filters (`test-mcp-server.yml`, `deploy-mcp-production.yml`) because the Worker imports engines from it. Browser-only modules there would queue an `mcp-production` approval and a staging redeploy on every website-only change. The MCP server imports none of them. TechPar's UI modules moved to `src/scripts/techpar/` in the last PR of the series, so there is one convention.

**Rejected: all of `src/scripts/**` in the coverage `include`.** It would pull DOM-bound modules such as `palette-manager.ts` into the 70% line threshold, which unit tests cannot reach without a DOM they don't have.

## Consequences

- **Guards follow the code, not the page.** `tool-analytics.test.ts` reads a tool's whole `src/scripts/<tool>/` directory, throws when the directory holds no `.ts` files, and asserts every tool yields events — so a move cannot leave a check looping over nothing.
- **The scoped-selector guard** (`tests/unit/scoped-selector-foreign-element.test.ts`) counts only the `.astro` file's own text as "renders or scripts". A scoped rule for a class that only the moved script adds is then flagged; the remedy is the guard's own (`<ancestor> :global(.cls)`, or delete a rule that never matched), never weakening the guard.
- **A new `logic.ts` meets the 70% threshold the moment it exists**, so its tests ship in the same PR.
- **One named exception to the glob:** `src/scripts/techpar/state.ts` is DOM-free and unit-tested, and was counted while it lived in `src/utils/`, so `vitest.config.ts` lists it explicitly rather than letting the move drop it from coverage.

**Code and docs that cite this decision** (keep current):

- `src/scripts/<tool>/` — one directory per tool page: tech-debt-calculator, information-request-list-{generator,extractor}, infrastructure-cost-governance, diligence-machine, regulatory-map, techpar
- `vitest.config.ts` — the `src/scripts/*/logic.ts` coverage glob and the `src/scripts/techpar/state.ts` entry
- `tests/unit/tool-analytics.test.ts` — the directory reader
- [TEST_STRATEGY.md](../testing/TEST_STRATEGY.md) § 1 and the coverage lines; [DEVELOPER_TOOLING.md](../development/DEVELOPER_TOOLING.md) § Coverage reporting; [testing/README.md](../testing/README.md)
- The `src/utils` engine headers that name "the tool page's client script" (`tech-debt-engine.ts`, `icg-engine.ts`, `techpar-engine.ts`, `diligence-url.ts`, `regulatory-map-url.ts`, `regulation-search-text.ts`)
