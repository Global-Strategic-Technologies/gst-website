---
tool: search_regulations
version: v1
lastAuthored: 2026-04-28
schema: src/schemas/regulatory-map.ts
---

# Input Contract: `search_regulations` + `list_regulation_facets`

> **Tools**:
>
> - `search_regulations` — faceted search across the 120-framework GST Regulatory Map; returns matched frameworks with their resolved Resource URI.
> - `list_regulation_facets` — enumerates distinct jurisdictions and categories present in the dataset.
>
> Companion to the `gst://regulations/<jurisdiction>/<framework-id>` MCP Resources, which return the full per-framework JSON body.
>
> **Sources of truth** (the contract cites these; it does not duplicate them):
>
> - **Validation**: [`src/schemas/regulatory-map.ts`](../../../../src/schemas/regulatory-map.ts) — `RegulationSchema`, `RegulationCategorySchema`, `RegulationSearchInputSchema`, `RegulationFacetsInputSchema`
> - **Framework dataset**: [`src/data/regulatory-map/*.json`](../../../../src/data/regulatory-map/) — 120 individual JSON files, one per framework
> - **Engine / loader**: [`mcp-server/src/content/regulation-loader.ts`](../../content/regulation-loader.ts) — URI parsing (`SUB_REGION_RE`), slug index, `loadRegulationByUri`
> - **Tool wrapper**: [`mcp-server/src/tools/regulations.ts`](../../tools/regulations.ts) — search filtering, facet enumeration, `jurisdictionToRegion()` deep-link normalization (V2 fix: lowercase alpha-2 → uppercase alpha-3)
>
> **Used by prompts** (BL-031.75):
>
> - [`gst_target_quick_look`](../../prompts/target-quick-look.ts) — calls `search_regulations` once per relevant data category for the supplied `hqJurisdiction`; the per-result `deeplink` field surfaces in the brief's Open-in-Hub section.
> - [`gst_regulatory_exposure_brief`](../../prompts/regulatory-exposure-brief.ts) — calls `search_regulations` per jurisdiction × category combination; builds per-framework summaries from the enriched `SearchResult` fields (`scope` / `keyRequirements` / `penalties` — added in V4 sign-off via commit `cc3b023`) rather than calling `resources/read` (Resources are user-pinned, not model-fetchable from prompt expansion).
>
> Both prompts surface `gst://regulations/<jurisdiction>/<framework-id>` URIs as analyst-pinnable references. Adding new fields to `SearchResult`'s wire shape (e.g., for future enrichment beyond `scope`/`keyRequirements`/`penalties`) should be reflected in the regulatory-exposure-brief body's Step 2 source-grounding instruction.
>
> **Version**: `v1` | **Last authored**: 2026-04-28
>
> **Registry**: see [`../contracts/README.md`](../contracts/README.md).

---

## `search_regulations` — field overview

| Field          | Type     | Required | Default | Notes                                                                          |
| -------------- | -------- | -------- | ------- | ------------------------------------------------------------------------------ |
| `jurisdiction` | string   | no       | —       | Exact match against parsed jurisdiction code                                   |
| `category`     | enum (4) | no       | —       | One of `data-privacy`, `ai-governance`, `industry-compliance`, `cybersecurity` |
| `query`        | string   | no       | —       | Free-text substring match across `id`, `name`, `summary`                       |
| `limit`        | int      | no       | 20      | Cap on returned matches; max 120                                               |

All filters are combined with AND. Empty input (`{}`) returns the first 20 frameworks, useful as a sanity check or browse-mode call.

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
  totalFrameworks: number      // total count, currently 120
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

URIs are decoupled from filenames — renaming `EU-GDPR.json` to anything else would not change `gst://regulations/eu/gdpr` because the URI is derived from the JSON's `id` field, not the filename. URI stability is enforced by [`tests/integration/resource-uri-stability.test.ts`](../../../tests/integration/resource-uri-stability.test.ts).

---

## Hidden semantics

- **Facet symmetry is not enforced**: the result of `list_regulation_facets` lists the categories _that exist in the dataset today_, not the canonical four. If a future framework introduces a fifth category, the facet list will surface it without a code change. The Zod `RegulationCategorySchema` would need an explicit update to match.
- **Empty `query` and empty `jurisdiction` semantics differ**: omitting `jurisdiction` returns all jurisdictions; passing `jurisdiction: ""` produces an empty match because the exact-match comparison fails on the empty string. Idiomatic usage: omit fields that aren't filtering rather than passing empty strings.
- **`search_regulations` does not paginate**. `limit` caps the response; `totalMatched` tells the caller how much was elided. To page through all matches, call again with progressively narrower filters rather than offsetting (no offset parameter today).

---

## Related

- Resource handler: [`mcp-server/src/resources/regulations.ts`](../../resources/regulations.ts)
- Live website: <https://globalstrategic.tech/hub/tools/regulatory-map>
- Architecture: [BL-031.5 Hub Surface Extension](../../../../src/docs/development/MCP_SERVER_HUB_SURFACE_BL-031_5.md)
