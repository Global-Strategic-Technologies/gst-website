# MCP capability documentation (`/hub/mcp/docs/`)

How the public capability reference is built, how to change it, and which guard
fails when you don't. Decision record: [ADR-0023](../adr/0023-mcp-capability-docs-rendering.md).

## What the page is

Two lenses over one registry.

- **Jobs** (the default) — a collapsed index, one row per job carrying its
  title, the artifact it returns and its step count. Opening a row reveals the
  blurb and the ordered steps, each step linking to the contract of the
  capability that runs it. Was **Workflows**, four task cards, until
  [ADR-0026](../adr/0026-mcp-docs-task-lens-is-jobs.md) re-keyed the lens to the
  analyst's task; `#workflows` still lands here, since the bootstrap routes an
  unrecognised hash to the task lens.
- **Reference** — a sidebar of every tool, prompt, resource family and
  operations topic, with a contract pane per capability.

Everything on the page derives from `src/data/mcp/capabilities.ts`: the sidebar,
the group counts, the search index, the job steps, and all 34 contract
panes. Nothing hardcodes a capability name or a count.

## Anatomy

| Piece                                             | Role                                                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/data/mcp/capabilities.ts`                    | The registry. `CAPABILITIES`, `JOBS`, `DEFAULT_CAPABILITY_ID`.                                            |
| `src/utils/mcp-capability-search.ts`              | Pure: `capabilitySlug`, `capabilityAnchor`, `searchCapabilities`, `capabilityCounts`, `buildExampleCall`. |
| `src/utils/mcp-docs.ts`                           | Browser: hash sync, sidebar marker, search combobox, group jumps. DOM-only.                               |
| `src/components/hub/mcp/CapabilityContract.astro` | One contract pane.                                                                                        |
| `src/components/hub/mcp/CapabilityNav.astro`      | The sidebar, which doubles as the search index via its `data-cap-*` attributes.                           |
| `src/components/hub/mcp/JobCard.astro`            | One job row in the index: summary line plus the disclosure body.                                          |
| `src/pages/hub/mcp/docs/index.astro`              | The page: inline bootstrap, toolbar, both lenses, and the visibility CSS.                                 |

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

## Adding or changing a job

A job is an entry in `JOBS`, keyed by `JobKey`, whose steps are `capabilityId`
references. The groupings are editorial (see
[ADR-0026](../adr/0026-mcp-docs-task-lens-is-jobs.md)); the bindings are not, and
the guards below in `tests/integration/mcp-docs-parity.test.ts` hold them:

| You change                                                                       | The guard that fails                                                                                                                       |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Add a step, or a job                                                             | The exact step-count and key-count pins, which exist so a guard cannot sweep an empty set                                                  |
| Step through a capability without declaring `usedIn` on it, or the reverse       | **usedIn is two-way**: `declared [...] but stepped through by [...]`, in both directions, so a "Used in jobs" chip and a step cannot drift |
| Add a job with no `youGetBack`                                                   | The lens header promises the artifact on every row                                                                                         |
| Add a job no capability's `usedIn` names                                         | Unreachable: the chips are the only route from Reference back to Jobs                                                                      |
| Name a `documentUri` the server does not serve, or one outside its step's family | Checked against `mcp-server` source via `servedResourceUris()`                                                                             |
| Make two steps render the same family identifier                                 | Two different documents would show one label behind one anchor                                                                             |

**`npm run test:run` is not sufficient for a job change.** Adding or removing a
job or a step also trips hardcoded counts in TWO E2E files, so run:

```bash
npx playwright test hub-mcp-docs accessibility --project=chromium
```

In `tests/e2e/hub-mcp-docs.test.ts`: the row, artifact and chevron
`toHaveCount(12)`s, the open-state `rows.count()` of 12, the step
`toHaveCount(30)`, the wrap and touch-target guards' twelve-element probes, and
`expect(probed).toBe(64)` on the id-wrap sweep (30 step ids + 34 sidebar
entries). In `tests/e2e/accessibility.test.ts`: the jobs-expanded route's
`expect(opened).toBe(12)`. All are deliberate vacuity pins, not incidental
counts — each exists so a guard cannot pass over an empty or shrunken set.

Two behavioural guards live in the first file as well: **no job title wraps** at
1440/1280/1024 (the title track is fixed above 900px, so a longer title
makes a ragged row rather than resizing anything — widening the track and
re-cutting the title both satisfy it), and **no sideways scroll** at 390/480/768
with every row forced open.

That a11y route exists because the Jobs lens opens collapsed: the suite scans
the bare `/hub/mcp/docs/` twice, once as-is and once with every row opened,
since a step behind a closed disclosure is not merely passing axe but invisible
to it. A third entry scans the same page at `#cap-compute_techpar`, for the
dense contract pane.

`JobKey` is a closed union, so a typo in `usedIn` is a type error rather than a
silent orphan.

## Example values and the Example block

Every tool argument may carry an `example`: a literal that satisfies its own
`desc`, written exactly as it appears inside the call (`"series-b"` keeps its
quotes, `18400000` does not). It renders as a copyable cell in the Arguments
table's third column, which appears only on panes where at least one argument
has one.

**Traceability is the rule, and it is why `example` is optional.** A value comes
from a UAT Input table under `mcp-server/src/docs/testing/uat/`, from a literal
call in a UAT step, or from an enum or default in the tool's `CONTRACT.md` or
Zod schema. **Where UAT and code disagree, the code wins** — the `_audit` blocks
UAT-03.1 / 04.1 / 05.1 mark required have been `.optional()` since server
0.60.0. An argument with no such source gets **no** example. An empty cell is a
correct answer; an invented value is not.

The Example block below the table has two arms, and every tool carries exactly
one (the parity suite asserts it, and asserts no non-tool carries either):

- **`exampleCall`** — an ordered list of argument names. `buildExampleCall`
  renders the call from those arguments' own `example` values, so the column and
  the block are one source shown twice and cannot drift. The empty list renders
  `list_portfolio_facets({})`, which is a complete call.
- **`example`** — a hand-authored call, for the four tools a flat generated one
  gets wrong: `fill_information_request_list_xlsx` documents `ref` /
  `fileLocation` / `comments`, which are `fills[]` sub-fields;
  `compose_dossier_envelope` documents a row naming two wire fields at once; and
  `prepare_irl_body` and `validate_irl_provenance` both key off a per-body value
  (a whole markdown body, a hash minted from it) that no literal can stand in
  for. On this arm the traceability rule still holds for every value shown, and
  a call that is deliberately incomplete says so with an ellipsis rather than
  looking complete and being rejected.

The block claims "complete and valid as written" only when `buildExampleCall`
**derives** that it is: every named argument a plain wire key resolving to a
declared argument whose example carries no placeholder marker. A capability
therefore cannot assert a claim its own data contradicts, and the hand-authored
arm is never marked runnable.

An argument named in an `exampleCall` **must** have an example — otherwise the
call would render `null` into a snippet the page invites a reader to run. That
is asserted, not assumed.

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
- **Contract selection is CSS.** Sidebar items and job steps are anchors;
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
- Cloudflare's zone-level AI-bot block sits in front of it (observed 2026-09-02):
  AI crawler and assistant user agents get a 403 there instead of the 308.
  Search crawlers are unaffected, and the canonical page on Vercel is not behind
  Cloudflare at all. Dashboard toggle, not repo state; see
  [SEO_IMPLEMENTATION.md § Crawler access on the Worker hosts](../seo/SEO_IMPLEMENTATION.md#crawler-access-on-the-worker-hosts).

The page itself carries `SoftwareApplication` and `ItemList` JSON-LD derived from
the registry, so a new capability is described to crawlers without a separate
edit: [JSON_LD_SCHEMA.md § MCP Server Schemas](../seo/JSON_LD_SCHEMA.md#mcp-server-schemas).
