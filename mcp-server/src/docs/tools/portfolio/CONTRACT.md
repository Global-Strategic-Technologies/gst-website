---
tool: search_portfolio
version: v1
lastAuthored: 2026-05-03
schema: mcp-server/src/schemas.ts
enumParity:
  - tableHeading: '`engagement`'
    schemaExport: src/schemas/portfolio.ts#ENGAGEMENT_CATEGORY_VALUES
---

# Input Contract: `search_portfolio` + `list_portfolio_facets`

> **Tools**: `search_portfolio` (text + chip filters → match list + deeplink) and the companion `list_portfolio_facets` (zero-arg facet enumeration).
>
> **Sources of truth** (the contract cites these; it does not duplicate them):
>
> - **Validation**: [`mcp-server/src/schemas.ts`](../../../schemas.ts) — `SearchPortfolioInputSchema`, `ListPortfolioFacetsInputSchema`
> - **Project shape**: [`src/schemas/portfolio.ts`](../../../../../src/schemas/portfolio.ts) — `ProjectSchema`, `EngagementCategorySchema`, `GrowthStageSchema`
> - **Filter engine**: [`src/utils/filterLogic.ts`](../../../../../src/utils/filterLogic.ts) — `filterProjects`, `getUnique*` helpers; the same code path the website uses (`PortfolioHeader.astro` script block)
> - **URL encoder**: [`src/utils/portfolio-url.ts`](../../../../../src/utils/portfolio-url.ts) — `serializeToParams` / `deserializeFromParams`. Imported by both the website page (hydrates filters from URL on init; writes URL on each change) and the MCP wrapper (`buildPortfolioDeeplink`); single source of truth for portfolio URL state.
> - **Bundled dataset**: [`src/data/ma-portfolio/projects.json`](../../../../../src/data/ma-portfolio/projects.json) — anonymized engagements, validated against `ProjectsArraySchema` at MCP-server module init.
>
> **Used by prompts** (BL-031.75): [`gst_comparable_engagements_memo`](../../../prompts/) — composes a 1-page memo of comparable past engagements anchored on a free-text theme; calls `search_portfolio` ONCE with a batched theme array (BL-064) and synthesises the memo from the matched `summary` / `challenge` / `solution` fields.
>
> **Version**: `v1` | **Last authored**: 2026-05-03
>
> **Registry**: see [`../contracts/README.md`](../README.md) for the "what is an input contract" narrative, the cross-tool registry, and the per-tool spec template.

---

## `search_portfolio` — field overview

| Field        | Type                                              | Cardinality | Required | Default |
| ------------ | ------------------------------------------------- | ----------- | -------- | ------- |
| `search`     | string (free-text, case-insensitive)              | single      | no       | _empty_ |
| `theme`      | string (one of `themes` facet, or `"all"`)        | single      | no       | `"all"` |
| `engagement` | string (`"Buy-Side"` \| `"Sell-Side"` \| `"all"`) | single      | no       | `"all"` |

The empty input `{}` returns every project in the dataset. Supplying any combination of the three fields narrows the result. The schema accepts no other fields — see [Capability-mirror invariant](#capability-mirror-invariant).

---

## Per-field detail

### `search`

- **Display label**: Search
- **What it asks**: Free-text query matched against `codeName`, `industry`, `summary`, and the `technologies` array (joined and lowercased).
- **Mirrors**: the search input on `/ma-portfolio` (placeholder `"Name, industry, or technology..."`, debounced 300 ms client-side). The MCP wrapper applies the same `String.prototype.includes` substring match — no token / phrase parsing, no fuzzy matching.

**Downstream effect**: when supplied, `filterProjects` excludes any project whose `createSearchableText(project)` does not include the lowercased query as a substring.

### `theme`

- **Display label**: Theme
- **What it asks**: Which Theme chip is active.
- **Valid values**: any value listed under `themes` in `list_portfolio_facets` output, or `"all"` to skip. The full set is data-driven from `getUniqueThemes(PROJECTS)` and changes whenever `projects.json` is updated.
- **Mirrors**: the Theme chip row in the `/ma-portfolio` filter drawer.

**Downstream effect**: when not `"all"`, `filterProjects` excludes projects whose `theme !== input.theme` (strict equality).

### `engagement`

- **Display label**: Engagement
- **What it asks**: Which engagement-category chip is active.
- **Valid values**: one of the values below (from `ENGAGEMENT_CATEGORY_VALUES`), or `"all"` to skip. The live set is also surfaced data-driven via `list_portfolio_facets`.`engagementCategories`.
- **Mirrors**: the Engagement chip row in the `/ma-portfolio` filter drawer.

| ID          | Meaning                                  |
| ----------- | ---------------------------------------- |
| `Buy-Side`  | Advisory on the acquiring side of a deal |
| `Sell-Side` | Advisory on the divesting side of a deal |

**Downstream effect**: when not `"all"`, `filterProjects` excludes projects whose `engagementCategory !== input.engagement` (strict equality).

---

## `list_portfolio_facets` — field overview

Zero arguments. The MCP tool returns the four facet dimensions present in the bundled dataset:

```typescript
{
  themes: string[],                  // sorted ascending
  engagementCategories: string[],    // sorted ascending; subset of ENGAGEMENT_CATEGORY_VALUES
  growthStages: string[],            // dataset-order (currently 6 canonical stages)
  years: number[],                   // sorted descending
}
```

`growthStages` and `years` are not filterable at the website surface today — they are exposed for orientation (the analyst can decide which `theme` / `engagement` combination to ask about). If a future website filter ships for either dimension, the `search_portfolio` schema gains a matching field in lockstep — see [Capability-mirror invariant](#capability-mirror-invariant).

---

## Output shape — `search_portfolio`

```typescript
{
  matches: Project[],                  // every project that passes the three filters
  totalMatched: number,                // === matches.length
  returned: number,                    // === matches.length (no `limit`; mirrors the website)
  deeplink: string,                    // e.g. "https://globalstrategic.tech/ma-portfolio?search=cloud&eng=Buy-Side"
}
```

**`deeplink`**: a URL that opens `/ma-portfolio` with the same three filters pre-applied. The website page (`PortfolioHeader.astro`) imports the same encoder via `src/utils/portfolio-url.ts` and hydrates from the URL on init; round-trip parity is verified by the integration test ([`mcp-server/tests/integration/portfolio-handler.test.ts`](../../../../tests/integration/portfolio-handler.test.ts)).

**Empty-result path**: `matches: []`, `totalMatched: 0`, `returned: 0` — same shape as a populated result. The deeplink is still emitted (a copied URL with no matches still lands on the correct filtered view; the website renders a "no projects match your filters" message in the same DOM state).

---

## Capability-mirror invariant

**The MCP tool's input schema mirrors the website's filter UI exactly.**

The `/ma-portfolio` page surfaces three filter controls (the search input + Theme chip row + Engagement chip row in [`src/components/portfolio/PortfolioHeader.astro`](../../../../../src/components/portfolio/PortfolioHeader.astro) + [`src/components/portfolio/FilterDrawer.astro`](../../../../../src/components/portfolio/FilterDrawer.astro)). Pre-BL-031.95-Phase-4.A, the MCP tool also accepted a `limit` field (default 20); the website renders every project always (CSS `display: none` hides filtered-out cards), so a tool-level `limit` had no website counterpart and was removed under the capability-mirror invariant.

The website page does not (today) surface filters for `growthStage`, `year`, `industry`, `engagementType`, or any free-text against `challenge` / `solution`. Those fields are visible on individual cards / modals but not used as filter axes; the MCP tool follows suit. If a future website filter ships for any of those dimensions, the encoder + decoder + tool input schema grow in lockstep with the website surface.

---

## Hidden semantics

- **`search` is a substring match**, not a fuzzy or token match. Querying `"cloud"` will not match `"cloudy"` — actually it will, because `includes` returns true for any substring containment. Querying `"cloud computing"` will match only items whose `searchableText` contains those exact 14 characters in that exact order. This is the same behaviour as the website's input.
- **Chip availability** is a website-only concept. The website's `updateAvailableChips()` greys out chip values that would yield zero matches given the OTHER active filters (cross-dimensional availability) and may auto-reset a chip if it becomes unavailable. The MCP tool does NOT apply this dampening — it filters strictly by the three input values and returns whatever matches. A caller asking for a `theme` × `engagement` combination that the website would auto-reset will simply get an empty `matches` array. The corresponding deeplink lands on the empty-state view (the website resets the unavailable chip on hydration so the URL state stays self-consistent on visit).
- **Dataset is bundled at build time.** Updates to `src/data/ma-portfolio/projects.json` require an `npm run build` of the MCP server before they appear in tool output. This is a deliberate trade-off — see file-level docstring in `mcp-server/src/tools/portfolio.ts`.

---

## Related

- Tool wrapper: [`mcp-server/src/tools/portfolio.ts`](../../../tools/portfolio.ts)
- Filter engine: [`src/utils/filterLogic.ts`](../../../../../src/utils/filterLogic.ts)
- URL encoder: [`src/utils/portfolio-url.ts`](../../../../../src/utils/portfolio-url.ts)
- Walkthrough: [`USAGE.md`](./USAGE.md)
- Live website: <https://globalstrategic.tech/ma-portfolio>
- Architecture: [ADR-0005 — Hub URL-state deep-link contract](../../../../../src/docs/adr/0005-hub-url-state-deeplink-contract.md) (Phase 4 closure history: [archived design doc](../../../../../src/docs/development/_archive/MCP_SERVER_HUB_URL_STATE_BL-031_95.md))
- Integration test: [`mcp-server/tests/integration/portfolio-handler.test.ts`](../../../../tests/integration/portfolio-handler.test.ts)
