---
tool: search_regulations
version: v2
lastAuthored: 2026-05-27
schema: src/schemas/regulatory-map.ts
enumParity:
  - tableHeading: '`category` valid values'
    schemaExport: src/schemas/regulatory-map.ts#REGULATION_CATEGORY_VALUES
---

# Input Contract: `search_regulations` + `list_regulation_facets`

> **Tools**:
>
> - `search_regulations` — faceted search across the 123-framework GST Regulatory Map; returns matched frameworks with their resolved Resource URI.
> - `list_regulation_facets` — enumerates distinct jurisdictions and categories present in the dataset.
>
> Companion to the `gst://regulations/<jurisdiction>/<framework-id>` MCP Resources, which return the full per-framework JSON body.
>
> **Sources of truth** (the contract cites these; it does not duplicate them):
>
> - **Validation**: [`src/schemas/regulatory-map.ts`](../../../../../src/schemas/regulatory-map.ts) — `RegulationSchema`, `RegulationCategorySchema`, `RegulationSearchInputSchema`, `RegulationFacetsInputSchema`
> - **Framework dataset**: [`src/data/regulatory-map/*.json`](../../../../../src/data/regulatory-map/) — 123 individual JSON files, one per framework
> - **Engine / loader**: [`mcp-server/src/content/regulation-loader.ts`](../../../content/regulation-loader.ts) — URI parsing (`SUB_REGION_RE`), slug index, `loadRegulationByUri`
> - **Tool wrapper**: [`mcp-server/src/tools/regulations.ts`](../../../tools/regulations.ts) — search filtering, facet enumeration, `jurisdictionToRegion()` deep-link normalization (V2 fix: lowercase alpha-2 → uppercase alpha-3)
>
> **Used by prompts** (BL-031.75):
>
> - [`gst_target_quick_look`](../../../prompts/target-quick-look.ts) — calls `search_regulations` once per relevant data category for the supplied `hqJurisdiction`; the per-result `deeplink` field surfaces in the brief's Open-in-Hub section.
> - [`gst_regulatory_exposure_brief`](../../../prompts/regulatory-exposure-brief.ts) — calls `search_regulations` per jurisdiction × category combination; builds per-framework summaries from the enriched `SearchResult` fields (`scope` / `keyRequirements` / `penalties` — added in V4 sign-off via commit `cc3b023`) rather than calling `resources/read` (Resources are user-pinned, not model-fetchable from prompt expansion).
>
> Both prompts surface `gst://regulations/<jurisdiction>/<framework-id>` URIs as analyst-pinnable references. Adding new fields to `SearchResult`'s wire shape (e.g., for future enrichment beyond `scope`/`keyRequirements`/`penalties`) should be reflected in the regulatory-exposure-brief body's Step 2 source-grounding instruction.
>
> **Version**: `v2` | **Last authored**: 2026-05-27 (multi-value filters)
>
> **Registry**: see [`../contracts/README.md`](../README.md).

---

## `search_regulations` — field overview

| Field          | Type                        | Required | Default | Notes                                                                                                                                                                                                                                            |
| -------------- | --------------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `jurisdiction` | `string \| string[]`        | no       | —       | Exact match against parsed jurisdiction code. Accepts a single string or an array (see below).                                                                                                                                                   |
| `category`     | `enum(4) \| Array<enum(4)>` | no       | —       | One of `data-privacy`, `ai-governance`, `industry-compliance`, `cybersecurity`; or an array.                                                                                                                                                     |
| `query`        | string                      | no       | —       | Free-text substring match across `id`, `name`, `summary`                                                                                                                                                                                         |
| `limit`        | int                         | no       | 20      | Cap on returned matches; max 120. **Note the corpus is 123** — so a single call cannot return the full dataset. Deliberately unchanged in BL-112: raising the max grows an already-large response (see below), and the mirror supplies no bound. |

Filters AND across facets and OR within a facet — `{jurisdiction: ['eu','us'], category: ['data-privacy']}` returns data-privacy frameworks whose `jurisdiction ∈ {eu, us}`. Empty input (`{}`) returns the first 20 frameworks, useful as a sanity check or browse-mode call.

### Multi-value filters (v2 — added 2026-05-27)

`jurisdiction` and `category` each accept either a single string OR an array of strings. The schema normalizes both shapes to an array internally, so the response is identical whether the caller passes `'eu'` or `['eu']`.

- **Backward compatibility**: existing string callsites (`{jurisdiction: 'eu'}`) continue to work unchanged.
- **Empty array rejects**: `{jurisdiction: []}` fails validation (`.min(1)`) because the empty array is ambiguous with "no filter."
- **Invalid category in array rejects**: `{category: ['environmental']}` fails the same way `{category: 'environmental'}` does — the array arm validates each element against the canonical enum (closes a smuggling path).
- **Multi-value `filterDeeplink` policy**: when a filter array has >1 element, the response's `filterDeeplink` **omits the corresponding URL param**. When BOTH arrays have >1 element, the deeplink collapses to the bare `https://globalstrategic.tech/hub/tools/regulatory-map/`. The "why" is the **capability-mirror invariant**: the website page uses single-select chips and cannot represent a multi-jurisdiction (or multi-category) filter in its URL state. Returning a misleading deeplink that doesn't reflect the agent's filter would silently drop user intent. Use single-value filters when you need a deeplink that mirrors the agent's filter exactly.
- **Byte-identical guarantee**: deeplinks for `jurisdiction: 'eu'` and `jurisdiction: ['eu']` are strictly equal (`===`). This is pinned by a unit test (`tests/unit/regulations.test.ts`) so any future schema refactor can't silently produce different deeplinks for the two callsite shapes.

**Why union+transform (not preprocess)**: Zod's `z.union(...).transform(...)` surfaces a clearer parse error on garbage input (`{jurisdiction: 42}` reports `invalid_union` with both arm errors), gives the handler sharp `string[] | undefined` TS inference (no `unknown` cast), and is itself pinned by an `invalid_union` error-code assertion so a future refactor to `z.preprocess` would break CI. See [`tests/unit/regulations.test.ts`](../../../../tests/unit/regulations.test.ts) under "RegulationSearchInputSchema — array filters (multi-value)".

### `jurisdiction` valid values

The 38 distinct jurisdiction codes are listed by `list_regulation_facets`. They follow two patterns:

- **2-letter country codes** (top-level): `eu`, `us`, `ca`, `gb`, `au`, `br`, `cn`, `jp`, etc.
- **2-segment sub-region codes**: `us-ca` (California), `us-co` (Colorado), `ca-ab` (Alberta), `ca-qc` (Quebec), etc. Sub-regions are detected by URI structure (`<country>-<XX>-<framework>`) for `us-` and `ca-` prefixes only.

Pass a sub-region code (`us-ca`) to filter to that state/province. Passing the parent code (`us`) does **not** include sub-region frameworks — they are scored as belonging to the sub-region jurisdiction, not the country. To get all US-related frameworks, call twice with `us` then with each sub-region, or omit the filter and post-filter client-side.

### `category` valid values

| ID                    | Coverage                                                  |
| --------------------- | --------------------------------------------------------- |
| `data-privacy`        | GDPR, CCPA, PIPEDA, LGPD, etc. — personal-data frameworks |
| `ai-governance`       | EU AI Act, US state AI bills, sector AI regulations       |
| `industry-compliance` | HIPAA, PCI DSS, SOX, financial-services frameworks        |
| `cybersecurity`       | NIST, CISA, sector security mandates                      |

### `query` semantics

Substring match (case-insensitive) against the regulation's `id`, `name`, and `summary` fields. Whitespace-tolerant — multi-word queries match if the substring appears in any of the searched fields.

---

## `search_regulations` — output shape

```ts
{
  matches: SearchResult[],
  totalMatched: number,
  returned: number
}

interface SearchResult {
  uri: string,                  // e.g. "gst://regulations/eu/gdpr"
  id: string,                   // e.g. "eu-gdpr"
  name: string,                 // human-readable framework name
  jurisdiction: string,         // parsed jurisdiction code
  category: string,             // one of the 4 categories
  effectiveDate: string,        // ISO YYYY-MM-DD
  summary: string               // 1-3 sentences
}
```

Use the `uri` from each match with `resources/read` (or with the `mcp__gst__resources_read` client API) to fetch the full framework body — `keyRequirements[]`, `penalties`, `regions[]`, etc.

---

## `list_regulation_facets` — input

`{}` (no parameters). Returns:

```ts
{
  jurisdictions: string[],     // sorted, distinct
  categories: string[],        // sorted, the 4 canonical categories
  totalFrameworks: number      // total count, currently 123
}
```

**Why this exists separately from `search_regulations`**: discovery. An agent that doesn't know whether the UK is encoded as `uk`, `gb`, or `gbr` can call `list_regulation_facets` once at session start and avoid trial-and-error against `search_regulations`.

---

## URI taxonomy (reference)

The Resource URI format is `gst://regulations/<jurisdiction>/<framework-id>`. Parsing rules (from the `id` field in each JSON file):

| Source `id`  | Jurisdiction | Framework ID | Resource URI                   |
| ------------ | ------------ | ------------ | ------------------------------ |
| `eu-gdpr`    | `eu`         | `gdpr`       | `gst://regulations/eu/gdpr`    |
| `us-ca-ccpa` | `us-ca`      | `ccpa`       | `gst://regulations/us-ca/ccpa` |
| `ca-ab-pipa` | `ca-ab`      | `pipa`       | `gst://regulations/ca-ab/pipa` |
| `ca-cccs`    | `ca`         | `cccs`       | `gst://regulations/ca/cccs`    |
| `gb-dpa`     | `gb`         | `dpa`        | `gst://regulations/gb/dpa`     |

**Sub-region detection** uses the regex `^(us|ca)-([a-z]{2})-(.+)$` — only `us-` and `ca-` prefixes followed by a 2-letter sub-region code are treated as multi-segment jurisdictions. `ca-cccs` falls through (no second 2-letter segment) and is parsed as `ca/cccs`.

URIs are decoupled from filenames — renaming `EU-GDPR.json` to anything else would not change `gst://regulations/eu/gdpr` because the URI is derived from the JSON's `id` field, not the filename. URI stability is enforced by [`tests/integration/resource-uri-stability.test.ts`](../../../../tests/integration/resource-uri-stability.test.ts).

---

## Hidden semantics

- **Facet symmetry is not enforced**: the result of `list_regulation_facets` lists the categories _that exist in the dataset today_, not the canonical four. If a future framework introduces a fifth category, the facet list will surface it without a code change. The Zod `RegulationCategorySchema` would need an explicit update to match.
- **Empty `query` and empty `jurisdiction` semantics differ**: omitting `jurisdiction` returns all jurisdictions; passing `jurisdiction: ""` produces an empty match because the exact-match comparison fails on the empty string. Idiomatic usage: omit fields that aren't filtering rather than passing empty strings.
- **`search_regulations` does not paginate**. `limit` caps the response; `totalMatched` tells the caller how much was elided. To page through all matches, call again with progressively narrower filters rather than offsetting (no offset parameter today).
- **Response size scales steeply with `limit`, and the tool used to say otherwise.** Measured 2026-08-06 against the real corpus (envelope = both channels + framing):

  | `limit`      | envelope | vs the 143,027-char response that exceeded a real client's ceiling (BL-109) |
  | ------------ | -------- | --------------------------------------------------------------------------- |
  | 20 (default) | ~61,500  | 0.43×                                                                       |
  | 50           | ~154,000 | **1.08×**                                                                   |
  | 120 (max)    | ~355,700 | **2.49×**                                                                   |

  The description previously advised that _"the full 120-framework response fits comfortably in context — prefer broader filters"_, and `gst_irl_ingestion` Step 3 instructed a batched call at `limit: 50`. Both were corrected in BL-112. **Keep `limit` at or near its default and narrow by category; when `returned < totalMatched`, issue a second narrowed call rather than raising `limit`.** No bound was added to the schema — the capability mirror cannot supply one (the page renders a single region, the largest holding 10 frameworks, below the default of 20) and no client ceiling is documented. That decision is open; `tests/integration/tool-response-budget.test.ts` records the current size so it is visible rather than assumed.

---

## Related

- Resource handler: [`mcp-server/src/resources/regulations.ts`](../../../resources/regulations.ts)
- Live website: <https://globalstrategic.tech/hub/tools/regulatory-map>
- Architecture: [ADR-0004 — Resources surface](../../../../../src/docs/adr/0004-hub-surface-resources-import-restriction.md) · [`ARCHITECTURE.md`](../../ARCHITECTURE.md)
