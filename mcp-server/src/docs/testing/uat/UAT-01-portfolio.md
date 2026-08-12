# UAT-01 — Portfolio

> **Prerequisite**: [`SETUP.md`](SETUP.md) complete. **Environment**: production.
> **Input authority**: [`portfolio/CONTRACT.md`](../../tools/portfolio/CONTRACT.md)

The portfolio tools expose GST's anonymized M&A engagement history: a zero-argument facet enumeration and a filtered search over it. A full pass proves the simplest shape the server offers — a call with no arguments — and the pattern that matters most for every other family: **the valid filter values are discovered from the server, not memorised from documentation.** The themes come from the dataset, so a list written into a prompt goes stale the moment a project is added.

This is the shortest document in the suite and the one to run first. If UAT-01 passes, the connection is genuinely working.

> **Verified in production** (cycle 4, 2026-08-12, `0.48.2`). All three cases passed against the Worker; the earlier `local stdio` rows are kept for provenance.

## Scope

| Capability              | Kind | Cases              | Contract                                         |
| ----------------------- | ---- | ------------------ | ------------------------------------------------ |
| `list_portfolio_facets` | tool | UAT-01.1           | [CONTRACT.md](../../tools/portfolio/CONTRACT.md) |
| `search_portfolio`      | tool | UAT-01.2, UAT-01.3 | [CONTRACT.md](../../tools/portfolio/CONTRACT.md) |

---

## UAT-01.1 — Zero-argument facet enumeration

**Goal**: Proves a no-argument call works end to end, and that the filter vocabulary is served from the dataset rather than hard-coded — which is what makes UAT-01.3 possible.

**Input**

| Field | Required | Value for this case | Constraint a tester must respect |
| ----- | -------- | ------------------- | -------------------------------- |
| —     | —        | `{}`                | The tool accepts no arguments    |

**Steps**

1. Open a fresh thread.
2. Paste: _Using the GST connector, list the portfolio facets._
   Mode B: call `list_portfolio_facets` with `{}`.

**Expected call**

```json
{ "tool": "list_portfolio_facets", "arguments": {} }
```

**Expected result**

- Four keys are present: `themes`, `engagementCategories`, `growthStages`, `years`.
- `themes` holds **15** entries, sorted ascending, beginning `Education`, `Finance`, `Food & Beverage` and ending `Security`, `Software`.
- `engagementCategories` is exactly `["Buy-Side", "Sell-Side"]`.
- `growthStages` holds **6** entries in **progression** order (`GROWTH_STAGE_PROGRESSION_ORDER` in `src/utils/filterLogic.ts`, not dataset order — the dataset begins `Expansion Stage`), starting `Early-Stage Growth` and ending `Legacy System`.
- `years` is sorted **descending** — most recent first.

Write down one theme value; UAT-01.3 uses it.

**Failure modes**

| Symptom                                    | Means                                                            | Do                                                      |
| ------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------- |
| The model answers without calling the tool | The system-prompt addendum is missing or the thread is not fresh | Re-check [`SETUP.md` § 2](SETUP.md), start a new thread |
| `themes` count differs from 15             | The dataset changed — expected after a portfolio update          | Not a defect. Note the new count and update this case   |
| `401`                                      | Credential problem, not a portfolio problem                      | Blocked — see [`SETUP.md` § 5](SETUP.md)                |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                                                                                            |
| ---------- | ------ | ----------- | ------- | ---- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| 2026-08-10 | BL-119 | local stdio | 0.48.1  | B    | Pass    | 15 themes / 2 categories / 6 stages / years descending                                                           |
| 2026-08-12 | Cowork | prod        | 0.48.2  | B    | Pass    | First production run. Stages returned in progression order, not dataset order (dataset begins "Expansion Stage") |

---

## UAT-01.2 — Free-text search

**Goal**: Proves the free-text path matches across several project fields at once, not just the code name.

**Input**

| Field    | Required | Value for this case | Constraint a tester must respect                           |
| -------- | -------- | ------------------- | ---------------------------------------------------------- |
| `search` | no       | `"healthcare"`      | Case-insensitive substring match — no fuzzy, no tokenising |

**Steps**

1. Open a fresh thread.
2. Paste: _Search the GST portfolio for healthcare engagements._
   Mode B: call `search_portfolio` with `{ "search": "healthcare" }`.

**Expected call**

```json
{ "tool": "search_portfolio", "arguments": { "search": "healthcare" } }
```

**Expected result**

- `totalMatched` equals `returned`, and both equal `matches.length` — this tool has no `limit`, so it returns everything that matched.
- At least one match has `theme` **other than** `Healthcare` — the query matched its `industry` or `summary` text instead. This is the observation that proves the search is multi-field: a `Finance`-themed match appears because its summary mentions healthcare transactions.
- Every match carries `codeName`, `industry`, `theme`, `summary`, `technologies[]`, `engagementCategory`.
- `deeplink` is `https://globalstrategic.tech/ma-portfolio?search=healthcare`.
- Opening that deeplink lands on the portfolio page with the same search pre-applied.

**Failure modes**

| Symptom                               | Means                                              | Do                                                     |
| ------------------------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| Every match has `theme: "Healthcare"` | Search may have narrowed to the theme field only   | Fail — the multi-field match is the point of this case |
| `matches: []`                         | Substring genuinely absent, or a typo in the query | Re-run with the exact string before filing             |
| `deeplink` opens an unfiltered page   | URL-encoder drift between the tool and the website | Fail — the round-trip is a contract                    |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                                                                                                                    |
| ---------- | ------ | ----------- | ------- | ---- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-10 | BL-119 | local stdio | 0.48.1  | B    | Pass    | 7 matches; one `Finance`-themed match confirmed the multi-field behaviour                                                                |
| 2026-08-12 | Cowork | prod        | 0.48.2  | B    | Pass    | First production run. `totalMatched` 7 == returned 7; `Eagle` (theme `Finance`) matched on its summary — the multi-field assertion holds |

---

## UAT-01.3 — Faceted filtering with a discovered value

**Goal**: Proves the two tools compose — a value read out of UAT-01.1 filters correctly here — and that the deeplink reflects the full filter state, not just the search box.

**Input**

| Field        | Required | Value for this case | Constraint a tester must respect                                             |
| ------------ | -------- | ------------------- | ---------------------------------------------------------------------------- |
| `theme`      | no       | `"Healthcare"`      | Must be a value from UAT-01.1 verbatim, or an array of them. Default `"all"` |
| `engagement` | no       | `"Buy-Side"`        | `"Buy-Side"`, `"Sell-Side"`, or `"all"`. Default `"all"`                     |

Both fields accept a single string **or** an array; both default to `"all"` when omitted. A value not in the facet list is not an error — it simply matches nothing, which is why taking the value from UAT-01.1 rather than from memory is the whole discipline.

**Steps**

1. Open a fresh thread.
2. Paste: _Using the GST connector, show me Buy-Side healthcare engagements from the portfolio._
   Mode B: call `search_portfolio` with `{ "theme": "Healthcare", "engagement": "Buy-Side" }`.

**Expected call**

```json
{
  "tool": "search_portfolio",
  "arguments": { "theme": "Healthcare", "engagement": "Buy-Side" }
}
```

**Expected result**

- **Every** match has `theme: "Healthcare"` **and** `engagementCategory: "Buy-Side"` — both filters are strict equality, unlike UAT-01.2's substring match.
- The result set differs from UAT-01.2's: filtering by theme is not the same as searching for the word.
- `deeplink` is `https://globalstrategic.tech/ma-portfolio?theme=Healthcare&eng=Buy-Side` — note `eng`, not `engagement`.
- Opening that deeplink shows both chips already active.

**Failure modes**

| Symptom                                 | Means                                                                 | Do                                                |
| --------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------- |
| `matches: []`                           | The theme string does not match a facet value exactly (case, spacing) | Re-copy it from UAT-01.1 output before filing     |
| A match violates one of the two filters | Filter predicate drift                                                | Fail — quote the offending `codeName`             |
| Deeplink omits a filter                 | Encoder no longer serialises the full state                           | Fail — the deeplink is the handoff to the website |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                                                                                                                                                   |
| ---------- | ------ | ----------- | ------- | ---- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-10 | BL-119 | local stdio | 0.48.1  | B    | Pass    | 7 matches, all Healthcare + Buy-Side; deeplink carried both params                                                                                                      |
| 2026-08-12 | Cowork | prod        | 0.48.2  | B    | Pass    | First production run. 7 matches, every one strictly Healthcare + Buy-Side; 3 overlap with 01.2, so the facet genuinely narrows. Deeplink uses `eng=`, not `engagement=` |

---

_Last updated: 2026-08-10 (BL-119 — initial authoring; all three cases executed against 0.48.1)_
