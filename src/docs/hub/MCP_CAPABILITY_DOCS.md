# MCP capability documentation (`/hub/mcp/docs/`)

How the public capability reference is built, how to change it, and which guard
fails when you don't. Decision record: [ADR-0023](../adr/0023-mcp-capability-docs-rendering.md).

## What the page is

Two lenses over one registry.

- **Workflows** (the default) — four task cards, each step linking to the
  capability that runs it.
- **Reference** — a sidebar of every tool, prompt, resource family and
  operations topic, with a contract pane per capability.

Everything on the page derives from `src/data/mcp/capabilities.ts`: the sidebar,
the group counts, the search index, the workflow steps, and all 34 contract
panes. Nothing hardcodes a capability name or a count.

## Anatomy

| Piece                                             | Role                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/data/mcp/capabilities.ts`                    | The registry. `CAPABILITIES`, `WORKFLOWS`, `DEFAULT_CAPABILITY_ID`.                   |
| `src/utils/mcp-capability-search.ts`              | Pure: `capabilitySlug`, `capabilityAnchor`, `searchCapabilities`, `capabilityCounts`. |
| `src/utils/mcp-docs.ts`                           | Browser: hash sync, sidebar marker, search combobox, group jumps. DOM-only.           |
| `src/components/hub/mcp/CapabilityContract.astro` | One contract pane.                                                                    |
| `src/components/hub/mcp/CapabilityNav.astro`      | The sidebar, which doubles as the search index via its `data-cap-*` attributes.       |
| `src/components/hub/mcp/WorkflowCard.astro`       | One workflow card.                                                                    |
| `src/pages/hub/mcp/docs/index.astro`              | The page: inline bootstrap, toolbar, both lenses, and the visibility CSS.             |

The page imports `src/styles/components/filter.css` itself. That sheet is
code-split rather than site-wide (see the roster comment in `global.css`), and
without the import the search field and every chip render as unstyled markup.

## Adding or changing a capability

1. Add the entry to `CAPABILITIES` in registry order (the sidebar renders in file
   order, grouped). Write the contract **from** `mcp-server/src/docs/tools/*/CONTRACT.md`
   and the prompt modules, for a prospect rather than an engineer.
2. Run `npm run test:run`. `tests/integration/mcp-docs-parity.test.ts` fails until
   the registry matches the server: the Tools group must equal the registered
   tool set in both directions, Prompts likewise, and orchestration lists for
   `gst_irl_sweep` and `gst_target_quick_look` must equal their source literals.
3. Run `npx playwright test hub-mcp-docs --project=chromium`. Sidebar and pane
   counts are pinned there, including in a JS-disabled context.

Adding a tool or prompt to the server **without** touching this registry fails
step 2. That is the intended coupling.

## Copy rules

Machine-checked over the registry's string values, so they cannot quietly lapse:

- **No em dashes.** Operator preference, shared with `/hub/mcp/`.
- **No uptime figure, availability percentage, or SLA claim.** No pilot rate or
  availability commitment is contractually made.
- **No `docs.mcp.` link.** `/hub/mcp/docs/` is the one published address; the
  subdomain is an alias that only redirects. A second name in copy is how two
  addresses drift apart.
- **Rate ceilings are always tunable and non-contractual.** Every tool's
  availability line carries the framing, so a reader meets it wherever they land.
- **Nothing operator-only.** No admin endpoints, key rotation, storage internals,
  or deployment tooling. Reviewed against `AUTH.md` and `DEPLOY.md`.

Two content decisions worth knowing before you edit:

- **`gst_irl_ingestion` is published as coexisting with `gst_irl_sweep`, never as
  deprecated.** The server makes no removal commitment, so neither does the page.
- **Audit-log guarantees are deliberately absent** even though BL-093 AC 1 lists
  them: the audit pipeline is not live (ADR-0014).

## How the page renders (and why it looks odd in devtools)

Every pane and both lenses are in the HTML, **visible by default**. An
`is:inline` bootstrap that runs before the panes are parsed adds `js` to
`<html>` and writes `data-lens` / `data-cap`; the page's CSS keyed on those
attributes then shows one lens, and `:target` shows one contract.

Consequences to keep in mind when changing it:

- **With JS off the page is one long reference document.** That is the intended
  reading, not a degraded one, and the E2E asserts it.
- **Contract selection is CSS.** Sidebar items and workflow steps are anchors;
  the browser does the reveal. `mcp-docs.ts` only keeps `data-cap` in step,
  marks the selected item, and runs the search. If a pane stops appearing, look
  at the cascade before the script.
- **Do not re-hide via `<noscript>`.** Astro's `scopedStyleStrategy` defaults to
  `'attribute'`, adding `+1` specificity to scoped rules, so an unscoped
  override loses and no-JS readers get a near-empty page.
- **A hash naming no pane falls back to the default contract.** The bootstrap
  cannot check (the panes do not exist yet), so the module does.
- **The argument table overrides `.brutal-bench-table` deliberately.** That
  component uppercases the first cell and right-aligns the last in bold mono,
  which suits a benchmark matrix and destroys an argument table, since wire
  argument names are case-contractual. The overrides are qualified by the table
  class to win a (0,2,1) cascade.

## The `docs.mcp.globalstrategic.tech` alias

Served by the MCP Worker, not Vercel: `mcp-server/wrangler.toml` declares it as a
`custom_domain` production route (DNS and certificate provisioned on deploy), and
`worker.ts` 308s every path on that host to the canonical page.

- The host branch **must** run before `/health`, `/status` and the OAuth surface,
  all of which dispatch on path alone. `mcp-server/tests/unit/dispatch/host-route.test.ts`
  asserts both the behavior and that ordering against `worker.ts` source.
- No staging counterpart, matching the status subdomain: the alias is first
  exercised in production, after the gated `mcp-production` deploy.
- Never link it, and never point the redirect at a hash or query URL: permanent
  redirects are cached hard and durably by browsers.
