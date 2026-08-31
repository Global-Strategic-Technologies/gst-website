# ADR-0026: The task lens on `/hub/mcp/docs/` is Jobs, and there is no third tab

- **Status**: Accepted 2026-08-31; **amended 2026-08-31** twice (§ Amendment: the card became an index row; § Amendment 2: the IRL round trip became four jobs)
- **Source initiative**: A claude.ai/design handoff specifying a "Jobs" tab (bundle at `src/design_handoff_mcp_docs_jobs_tab/`, not committed). Extends [ADR-0023](0023-mcp-capability-docs-rendering.md), which established the two-lens page.

## Context

ADR-0023 shipped `/hub/mcp/docs/` as two lenses over one registry: **Workflows** ("what do I do?", four task cards) and **Reference** ("what exactly does X take and return?"). A later design handoff specified a **third** pane, Jobs, placed first, with nine cards keyed to the analyst's own task rather than to a capability chain, and one addition to the card anatomy: a **"You get back"** block naming the artifact that lands at the end.

The handoff was produced without read access to this branch, and its own fidelity notes said so. Verified against source, three of its assumptions did not hold:

1. **The card anatomy was reproduced from a screenshot.** Its measurements disagreed with the shipped component on the border (1px hairline vs 2px), the fill (`--surface-faint-bg` vs `--surface-subtle-bg` plus frosted glass), the intro column (340px vs 260px), the steps grid (`repeat(3, 1fr)` vs an `auto-fit` floor of 18.5rem derived from the longest wire id), and the step-head ink. It also specified "no shadows", which the shipped card contradicts by design: its frost edge is a `box-shadow`.
2. **The tab mechanism is not a tablist.** The handoff specified `<button role="tab">` with React state. The page uses `<a href="#…">` plus a pre-parse bootstrap writing `html[data-lens]`, so a reader without JS gets one linear document (ADR-0023).
3. **Four of the nine jobs were the four shipped workflows**, one of them (`Issue and ingest an IRL`) verbatim in both title and description — and the overlapping pairs carried **different step lists**. `Screen a target` would have existed on two tabs of the same page with two different answers, and the existing pane's heading, _"What do you need to do?"_, already asks the question the new pane's heading asks.

Two slugs in the handoff also did not resolve: `gst_information_request_list` exists in no registry, and its `gst_irl_fill → gst_irl_create` correction renamed the right prompt onto the wrong gloss, leaving the create/populate pair shifted by one step.

## Decision

**The task lens is renamed and re-keyed rather than duplicated. The page keeps two lenses: Jobs and Reference.**

- `WORKFLOWS` becomes `JOBS`, `WorkflowKey` becomes `JobKey` (four keys become nine), `WorkflowCard.astro` becomes `JobCard.astro`, `.mdoc-flow*` becomes `.mdoc-job*`, and the lens is `#jobs` / `data-lens="jobs"`.
- The nine jobs subsume the four workflows. Where a job and a workflow disagreed on steps, the union was taken rather than either list: `Map the regulatory exposure` keeps the shipped `gst://regulations/…` step _and_ gains the handoff's `list_regulation_facets`.
- **"You get back" is kept**, and it is why this is a re-keying rather than a re-sort. It does not fight the shared component: the card is one component parameterised by content, and the block is an additive element in the intro column. (That intro column is gone as of § Amendment; the block became the right half of the index row's summary, which is where a reader now meets it without opening anything — and its "YOU GET BACK" caption came off there, since the lens header already says it once and nine repetitions of a self-evident column label are noise. The artifact itself, which is the part that earns the lens, stays on every row.)
- `#workflows` needs no redirect: the bootstrap's fallback branch already routes every unrecognised hash to the task lens, so old links land on the right pane.

**Rejected: adding Jobs as a third tab (the handoff as drawn).** It would have shipped four duplicated cards and, worse, two contradicting step lists for the same job on one page. A reader meeting both has no way to tell which is current. The handoff itself flagged the nine groupings as "an editorial layer, not a registry fact" and invited revision.

**Rejected: a third tab carrying only the five genuinely new jobs.** No contradictions, but the pane becomes an arbitrary remainder — a reader looking for "screen a target" would not find it on the tab that asks what job they are doing.

**Rejected: the handoff's measurements wherever they disagreed with the shipped component**, per the handoff's own instruction. The 260px column and the 18.5rem track floor in particular carry recorded CI history ([ADR-0024](0024-pin-the-brand-typeface.md)); 17rem was a real failure.

## Consequences

- **`usedIn` became a two-way invariant.** Nine jobs meant the "Used in jobs" chips had to be re-derived; at this decision 23 capabilities declared `usedIn` where 13 had (28 after Amendment 2). A new parity guard asserts the declared set equals the set of jobs actually stepping through that capability, in both directions, so a chip and a step cannot drift. Two further guards assert every job names what it returns and every job is reachable from some contract. All three were mutation-tested.
- **Copy here is em-dash-free**, like the rest of the registry — `mcp-docs-parity.test.ts` walks `JOBS` under the same guard, so the handoff's prose was rewritten rather than pasted.
- **The counts line stays derived.** `capabilityCounts(CAPABILITIES)` already yields the handoff's "16 tools · 133 resources · 12 prompts" (resources being summed family sizes, 4 + 123 + 6); nothing was hardcoded.
- **Responsive behaviour is inherited, not re-solved.** The handoff was pinned to 1800px and left this open; the shared component's ≤768px collapse already handles it. **This stopped holding at § Amendment**: the collapse belonged to the CARD, and the index row that replaced it overflowed 390px by 267px until it was given its own narrow rules. The lesson kept: inheriting a solved responsive story only works while the shape is the same shape.
- Cites this decision: `src/data/mcp/capabilities.ts`, `src/components/hub/mcp/JobCard.astro`, `src/pages/hub/mcp/docs/index.astro`, [hub/MCP_CAPABILITY_DOCS.md](../hub/MCP_CAPABILITY_DOCS.md).
- **Revisit trigger**: the nine groupings are editorial. If readers arrive with a job not on the list, or two cards are never distinguished in practice, re-cut them — the registry binding is to `capabilityId`, so the titles and blurbs are free to move.

## Amendment 2026-08-31 — the job card is an index row

**The lens shipped as nine stacked cards and ran 3,282px.** The height was not
coming from the nine cards; it was coming from the **260px intro column**. The
blurb wrapped to five lines in it while the steps beside it occupied 79px, so
the right half of most cards was empty and 2-step jobs left a third step track
unused as well. Horizontal emptiness is free; vertical emptiness is a scroll.

Four layouts were built as a design canvas at the same 1264px content column
with the same nine jobs and the same tokens, and measured against each other
rather than estimated. The figures below are like-for-like across the four
(each includes the lens header and the page's 48px padding):

| Layout                          | Height    | vs. today |
| ------------------------------- | --------- | --------- |
| Nine stacked cards (as shipped) | 3,282px   | —         |
| **Index, open on demand**       | **765px** | **-77%**  |
| Full-width rows                 | 2,259px   | -31%      |
| Two-up cards                    | 2,211px   | -33%      |

**Decision: the index.** Each job states its title and its artifact on one 48px
row: a 47px summary plus its hairline, and 46px/45px once the padding moved onto
the spacing scale (Amendment 2). The two measurements are a pixel apart and
worth keeping straight, since `.mdoc-job__sum` is what the touch floor applies
to and `.mdoc-job` is what the list height is made of. All nine fit one screen;
the blurb and the steps open underneath in a native `<details>`. At the time of
this amendment the collapsed lens measured **591px** at 1440px, the nine-row
list being 433px of it: 9 x 48 plus the one pixel of `border-top` that
`.mdoc-jobs` draws above the first row, so the top row is bounded like the rest.
§ Amendment 2 took it to 711px across twelve rows. Nothing is deleted, only deferred. Rows open
CLOSED — the collapsed index is the point, and opening one arbitrarily would
imply it is special.

`<details>` rather than a script, because the page's no-JS doctrine (ADR-0023)
holds either way and a native disclosure carries the button role and
`aria-expanded` for free.

**Rejected: two-up cards**, and instructively so. It is the obvious move and it
buys almost nothing over simply reflowing one card, because halving the width
doubles the wrapping; its gain is also desktop-only, reverting below ~1200px.
**Full-width rows** is the fallback if hiding steps ever proves wrong: less
gain, but nothing hidden.

**Two defects found and fixed in the same change, both by measurement:**

1. **The narrow widths were broken.** At 390px the summary row overflowed
   itself by 315px, the wire ids by 229px and the page by 267px — a
   horizontally scrolling document. The summary now stacks the artifact under
   the name at 900px and below, and the steps grid reuses the card's own proven
   `18.5rem` auto-fit floor and its ≤768px id-wrapping reversal verbatim rather
   than inventing a second responsive story. `tests/e2e/hub-mcp-docs.test.ts`
   asserts no sideways scroll at 390/480/768 with every row forced open, and a
   44px floor on the summary at 1440/768/390.
2. **Two steps shared one identifier and one anchor.** `Review the
architecture` and `Handover an assessment` mean different Library articles,
   but the registry documents resource FAMILIES, so both rendered
   `gst://library/…` and both linked to `#cap-gst-library`. `JobStep.documentUri`
   now carries the one document a resource step means: the step DISPLAYS it and
   still links to the family pane, which names it in its returns list. Rejected
   the thorough alternative — per-document capability entries — as ADR-sized: it
   would move the sidebar, the parity guard and the `133 resources` derivation
   to solve a labelling problem. Omitted where a step genuinely means the whole
   family, which the regulatory job does.

Three jobs were also renamed in this round: `Find the precedent` to
`Find comparables`, `Track the market` to `Check the news`, and
`Hand the file over` to `Handover an assessment`.

**Consequences.** The frost went with the box — a row this short is not an elevated
surface (STYLES_GUIDE § Frosted Glass). The disclosure indicator is the brand
`.delta-chevron`; the utility's `<details>` branch already owns the rotation,
the collapsed muting and the palette response, so this component styles none of
it. It first shipped with a hand-rolled chevron SVG, which was wrong twice
over: a non-brand mark, and a second implementation of a documented shared
utility whose muted-when-closed and teal-when-open states it did not reproduce.

**One deliberate deviation, position only.** STYLES_GUIDE § Delta Chevron and
BRAND_GUIDELINES § Delta Icon Usage Rules both place the toggle inline-END, and
every other disclosure on the site follows that. In this lens it LEADS the row:
nine rows read as an index, and in an index the disclosure is what a reader aims
at before reading the row, the way a list marker is. The utility itself is
untouched — only the grid slot and its `margin-left` are this component's
business — and `tests/e2e/hub-mcp-docs.test.ts` pins the leading position so it
is not silently "corrected" back to the site default. Two parity guards were added and
mutation-tested: every `documentUri` must be a URI the server serves under the
family it hangs off, and no two steps may render one family identifier. Whether
a given resource step OUGHT to name a document or means its family stays an
authored judgement, the same accepted trade as the glosses.

## Amendment 2026-08-31 (2) — the IRL round trip is four jobs, not one

`Issue and ingest an IRL` was one row carrying four prompt steps. Those four
steps were **four separate undertakings that happen to share a document**:

| Job           | Input the reader has                     | What lands                                  |
| ------------- | ---------------------------------------- | ------------------------------------------- |
| `irl-issue`   | Nothing yet                              | The blank workbook to send                  |
| `irl-fill`    | A data room, filings, an earlier session | The same workbook, answered and sourced     |
| `irl-extract` | A filled workbook                        | A portable record that outlives the session |
| `irl-sweep`   | A filled workbook                        | The (A) to (J) dossier                      |

They run days apart, on different inputs, often for different people, and only
the last one produced the artifact the single row advertised. A reader with a
filled workbook in hand had to open a job that opened with "issue the blank
request list" to discover that three quarters of it was already behind them.
That is the failure the `youGetBack` column exists to prevent, and the merged
row was defeating it: one line named one artifact for four deliverables.

**Consequences.**

- **Nine jobs became twelve; 25 steps became 30.** Five capabilities joined the
  lens with the split, all previously carrying no `usedIn` at all:
  `generate_information_request_list_xlsx` and `list_irl_requests` under
  `irl-issue`, `fill_information_request_list_xlsx` under `irl-fill`, and
  `gst_irl_ingestion` and `validate_irl_provenance` under `irl-sweep`. The
  instrumented ingestion prompt in particular was reachable from no job before,
  which is the sort of gap a merged row hides.
- **`prepare_irl_body` and `compose_dossier_envelope` were deliberately left
  out.** Both are pipeline internals the ingestion prompt drives, and
  `compose_dossier_envelope`'s own contract says so. `prepare_irl_body` looks
  like it belongs to `irl-extract` and does not: the extract prompt's contract
  states it calls nothing, which is the property that makes the record portable,
  so listing a tool under it would have contradicted the pane the step links to.
- **`irl-extract` is a one-step job, and that is the honest shape.** The step
  badge is now pluralised, since "1 steps" was the only thing standing between
  the registry and an accurate row.
- **The lens grew 591px to 711px at 1440px** (twelve 46px rows, each a 45px
  summary plus its hairline, so the row list is 553px: 12 x 46 plus the list's
  own `border-top`), and the last row now sits 1,034px down the document, so it
  no longer clears the fold on a 900px-tall viewport as the nine did. Accepted: the
  cut against the cards it replaced is still 78%, and three more rows a reader
  can act on beat one row that answers a quarter of the question. Re-measured,
  not estimated.
- **The meta descriptions are now derived from `JOBS.length`.** They said
  "nine analyst jobs" in prose and went stale the moment the split landed, which
  is precisely the drift the counts row is derived to avoid.
- **The title column went 380px to 430px** when the four `irl-*` jobs were
  retitled a round later (`Populate a request list from available information`
  is 420px of ink, and `Create an information request list for a company` 404px).
  Third widening, 340 to 380 to 430, and each one was caught by the wrap guard
  rather than by eye. The width comes out of the artifact column's slack, which
  still runs 714px at 1440 against a widest artifact line of 555px, and that is
  the column that should absorb it: it wraps to two lines gracefully, where a
  wrapped title makes the row ragged. `Find comparables` became `Find comparable
engagements` in the same pass.
- **Measure title ink on the LIVE element.** A detached clone carrying the same
  `className` does not inherit Astro's scoped rules, which are attribute
  selectors, so it falls back to the body font and reported these titles 40px to
  60px too wide. Set `white-space: nowrap; width: max-content` on the real node
  instead.
- **The row's spacing moved onto the token scale**, and the touch floor became
  a declaration rather than a by-product. The summary carried `padding: 13px`,
  picked to land the summary on 47px, and the stacked tier a `row-gap: 6px`; both
  sit above STYLES_GUIDE's sub-4px micro-spacing exception. At `--spacing-md`
  and `--spacing-xs` the summary is 45px, which clears WCAG 2.5.5's 44px by a
  single pixel: too thin a margin to leave implicit, so
  `min-height: var(--touch-target-min)` now states it. `min-height`, not
  `height`, since a fixed height would not clip an overflowing row so much as
  let it spill across the next row's rule.
- **Revisit trigger, unchanged in kind.** If `irl-issue` and `irl-fill` are
  never chosen apart in practice, merge them back. The registry binds on
  `capabilityId`, so the grouping stays free to move.
