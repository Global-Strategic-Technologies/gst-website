# UAT-02 — Regulatory map

> **Prerequisite**: [`SETUP.md`](SETUP.md) complete. **Environment**: production.
> **Input authority**: [`regulatory-map/CONTRACT.md`](../../tools/regulatory-map/CONTRACT.md)

A curated corpus of regulatory frameworks with a faceted search over it. A full pass proves the corpus is served rather than recalled — which is the entire point of the family, since a model answering "what does the EU AI Act require?" from training data will sound equally confident whether or not the answer is current.

> **Fully verified in production.** 02.1–02.3 on `0.48.2` (cycle 4) and re-swept on `0.49.0` (cycle 5); **UAT-02.4 passed on `0.49.0`**, which is the acceptance test for the alias fix cycle 4's Finding 1 exposed. The jurisdiction-scoped step returned `totalMatched: 1` where the identical call returned `[]` on `0.48.2`.

## Scope

| Capability               | Kind | Cases                        | Contract                                              |
| ------------------------ | ---- | ---------------------------- | ----------------------------------------------------- |
| `list_regulation_facets` | tool | UAT-02.1                     | [CONTRACT.md](../../tools/regulatory-map/CONTRACT.md) |
| `search_regulations`     | tool | UAT-02.2, UAT-02.3, UAT-02.4 | [CONTRACT.md](../../tools/regulatory-map/CONTRACT.md) |

---

## UAT-02.1 — Facet enumeration

**Goal**: Proves the jurisdiction vocabulary is discoverable, which is the only reliable way to know whether a jurisdiction is `gb` or `uk`, `us-ca` or `ca`.

**Input**

| Field | Required | Value for this case | Constraint a tester must respect |
| ----- | -------- | ------------------- | -------------------------------- |
| —     | —        | `{}`                | The tool accepts no arguments    |

**Steps**

1. Open a fresh thread.
2. Paste: _Using the GST connector, list the regulatory map facets._
   Mode B: call `list_regulation_facets` with `{}`.

**Expected result**

- `categories` is exactly `["ai-governance", "cybersecurity", "data-privacy", "industry-compliance"]` — four, sorted.
- `jurisdictions` holds **73** codes, including sub-national ones (`us-ca`, `ca-qc`, `us-tx`) alongside national (`eu`, `gb`, `jp`) and the pseudo-jurisdiction `global`.
- `totalFrameworks` is **123**.
- The UK is `gb`, not `uk`. California is `us-ca`, not `ca` — `ca` is Canada. Guessing either wrong returns zero matches with no error, which is why this case exists.

> **A drift note that used to live here has been retired.** The `search_regulations` description once said "120 frameworks" against a live corpus of 123; production now says 123 and the two agree. `totalFrameworks` remains authoritative if they ever diverge again.

**Failure modes**

| Symptom                            | Means                  | Do                                                          |
| ---------------------------------- | ---------------------- | ----------------------------------------------------------- |
| `totalFrameworks` differs from 123 | The corpus changed     | Not a defect — update this case and UAT-10's resource count |
| Fewer than 4 categories            | Category enum narrowed | Fail — the four are a published surface                     |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                                                                                                                                                                      |
| ---------- | ------ | ----------- | ------- | ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-11 | BL-119 | local stdio | 0.48.1  | B    | Pass    | 73 jurisdictions, 4 categories, 123 frameworks                                                                                                                                             |
| 2026-08-12 | Cowork | prod        | 0.48.2  | B    | Pass    | First production run. 73 jurisdictions (incl. sub-national `us-ca`/`ca-qc` and pseudo-jurisdiction `global`), 4 categories, 123 frameworks — agrees with UAT-10.1. UK is `gb`; no `uk` key |
| 2026-08-12 | Cowork | prod        | 0.49.0  | B    | Pass    | Cycle-5 regression sweep on `0.49.0` — 73 jurisdictions / 4 categories / 123 frameworks, identical to the `0.48.2` run                                                                     |

---

## UAT-02.2 — Filtered search returning full framework detail

**Goal**: Proves a match carries enough authored substance to answer a regulatory question directly, rather than just pointing at a name the model then describes from memory.

**Input**

| Field          | Required | Value for this case | Constraint a tester must respect                       |
| -------------- | -------- | ------------------- | ------------------------------------------------------ |
| `jurisdiction` | no       | `"eu"`              | String or array; must be a code from UAT-02.1 verbatim |
| `category`     | no       | `"ai-governance"`   | One of the four; string or array                       |
| `limit`        | no       | _omitted_           | Integer 1–120, default 20                              |

**Steps**

1. Open a fresh thread.
2. Paste: _What AI governance regulation applies in the EU? Use the GST regulatory map._
   Mode B: call `search_regulations` with `{ "jurisdiction": "eu", "category": "ai-governance" }`.

**Expected result**

- `totalMatched` is **1** — the EU Artificial Intelligence Act (Regulation 2024/1689).
- The match carries `uri: "gst://regulations/eu/ai-act"`, resolvable via UAT-10.
- `effectiveDate` is `2024-08-01`.
- `keyRequirements` is an array of **7** authored obligations — prohibited practices, risk management, training-data quality, transparency, human oversight, registration, and GPAI documentation. These are quotable as-is; the model should not be paraphrasing from training data.
- `penalties` states the three-band structure with figures: EUR 35M / 7% for prohibited practices, EUR 15M / 3% for high-risk violations, EUR 7.5M / 1% for incorrect information.
- `filterDeeplink` opens the Hub regulatory map with the same filter applied.

**Failure modes**

| Symptom                                    | Means                                                 | Do                                                                                               |
| ------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| The model answers without calling the tool | Addendum missing — the highest-frequency failure here | Re-check [`SETUP.md` § 2](SETUP.md); this family is the one models most often answer from memory |
| `keyRequirements` absent or empty          | Source record lost its authored detail                | Fail — the match becomes a pointer rather than an answer                                         |
| Penalty figures differ from the record     | Corpus updated                                        | Verify against the resource (UAT-10) before filing                                               |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                                                                                                                                                                     |
| ---------- | ------ | ----------- | ------- | ---- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-11 | BL-119 | local stdio | 0.48.1  | B    | Pass    | 1 match, 7 keyRequirements, three-band penalty text                                                                                                                                       |
| 2026-08-12 | Cowork | prod        | 0.48.2  | B    | Pass    | First production run. 1 match, `effectiveDate` 2024-08-01, 7 keyRequirements, all three penalty bands                                                                                     |
| 2026-08-12 | Cowork | prod        | 0.49.0  | B    | Pass    | Cycle-5 regression sweep. `totalMatched` still exactly **1** — the assertion most at risk from the alias ranking change did not move, because a facet-only query never reaches the scorer |

---

## UAT-02.3 — Multi-value filtering and the deeplink trade-off

**Goal**: Proves array filters combine in one call, and surfaces the documented consequence — that a multi-value filter cannot be represented in a deeplink.

**Input**

| Field          | Required | Value for this case     | Constraint a tester must respect                     |
| -------------- | -------- | ----------------------- | ---------------------------------------------------- |
| `jurisdiction` | no       | `["eu", "gb", "us-ca"]` | Array form; each element must be a valid code        |
| `category`     | no       | `"data-privacy"`        | Single value, so the deeplink can still represent it |

**Steps**

1. Paste: _Compare data privacy regulation across the EU, the UK and California using the GST regulatory map._
   Mode B: call `search_regulations` with `{ "jurisdiction": ["eu","gb","us-ca"], "category": "data-privacy" }`.

**Expected result**

- One call returns matches spanning all three jurisdictions — GDPR (`eu`), the UK regime (`gb`), and CCPA/CPRA (`us-ca`). The model should **not** issue three sequential calls.
- Every match has `category: "data-privacy"`.
- `filterDeeplink` **omits the jurisdiction filter** and reflects only the single-valued category. The website's chips are single-select and cannot represent a three-jurisdiction query, so the tool declines to emit a deeplink that would silently mean something narrower.

**Failure modes**

| Symptom                                         | Means                                                 | Do                                                             |
| ----------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| Three separate tool calls                       | The model is fanning out instead of batching          | Not a server defect — note it; the contract documents batching |
| `filterDeeplink` claims all three jurisdictions | The deeplink is now lying about the filter state      | Fail — a copied URL would show a different result set          |
| A jurisdiction returns nothing                  | Code typo, or genuinely no framework in that category | Cross-check the code against UAT-02.1 before filing            |

**Run log**

| Date       | Tester | Env  | Version | Mode | Verdict | Notes                                                                                                                                      |
| ---------- | ------ | ---- | ------- | ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-12 | Cowork | prod | 0.48.2  | B    | Pass    | First production run. All three jurisdictions in ONE call, no sequential fan-out; `filterDeeplink` correctly omits the jurisdiction filter |
| 2026-08-12 | Cowork | prod | 0.49.0  | B    | Pass    | Cycle-5 regression sweep — one call spanning all three jurisdictions; `filterDeeplink` still omits the multi-value jurisdiction filter     |

---

## UAT-02.4 — Free-text disambiguation: naming A must not return B

**Goal**: Proves that a query naming one framework returns **that** framework, and not a different one whose summary happens to mention it. This is the case whose absence let a real defect ship: the corpus is 123 records that cross-reference each other constantly in prose, so any framework named inside another's summary is a candidate for the same collision.

> **Why this case exists.** Until `0.49.0`, `search_regulations` scored free-text against `id`, `name` and `summary` only — never against the curated `aliases`. A summary mention scores 5 and a non-match scores 0, so `"Colorado AI Act"` returned **`us-nist-ai-rmf`** (a voluntary federal framework with no statutory penalties, whose summary reads "notably the Colorado AI Act") in place of a Colorado statute carrying **$20,000 per violation**. `"EU AI Act"` failed the same way, returning the Korean AI Basic Act. A confident wrong answer is harder to catch than a stated gap — the previous behaviour at least told a partner the framework was missing. UAT cycle 4 found this by probing one record five ways; this case makes it a standing check.

**Input**

| Field          | Required | Value for this case | Constraint a tester must respect                           |
| -------------- | -------- | ------------------- | ---------------------------------------------------------- |
| `query`        | yes      | see steps           | Free text; the point is to use the **common short form**   |
| `jurisdiction` | no       | `"us-co"`           | Only in step 3, to isolate whether the record is reachable |

**Steps**

Four calls. Run them as separate calls, not one conversation turn — step 3 is diagnostic and only means something on its own.

1. `search_regulations` with `{ "query": "Colorado AI Act" }`
2. `search_regulations` with `{ "query": "EU AI Act" }`
3. `search_regulations` with `{ "query": "Colorado AI Act", "jurisdiction": "us-co" }`
4. `search_regulations` with `{ "query": "CAIA" }`

**Expected result**

- Step 1 returns **`us-co-ai-act`** first — the Colorado Artificial Intelligence Act (SB 24-205). `us-nist-ai-rmf` may also appear, lower down, on its summary mention; that is correct and is not a defect. What matters is the ordering.
- Step 2 returns **`eu-ai-act`** first — the EU Artificial Intelligence Act (Regulation 2024/1689).
- Step 3 returns **exactly one** match, `us-co-ai-act`. An empty result here is the decisive signal that the alias is not in the index at all, rather than merely outranked — that is what it returned before the fix.
- Step 4 returns **`us-co-ai-act`**. `CAIA` normalizes to exactly four characters, the minimum length the alias matcher accepts, so this is the boundary value: it is the first thing to break if that floor is ever tightened.
- In every step, the framework named by the query outranks any framework that merely mentions it.
- **`totalMatched` stays small: 2, 2, 1 and 1 for steps 1–4** (observed on `0.49.0`). Record the number even when the ordering is right. This case is a _positive_ assertion — it checks that the named framework ranks first — and ordering alone cannot detect the opposite failure: an alias matcher loosened until everything matches everything would still rank the named framework first, inside a match set of dozens. A `totalMatched` that has grown by an order of magnitude is the tell, and it is the only one this case has. Treat a large jump as a finding even if every ordering assertion passes.

**Failure modes**

| Symptom                                                           | Means                                                                             | Do                                                                                                   |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Step 1 returns `us-nist-ai-rmf` first                             | The alias regression is back, or the build predates `0.49.0`                      | Check `/health` for the running version before filing; if it is `0.49.0`+, **Fail** — this is severe |
| Step 3 returns `matches: []`                                      | Aliases are not reachable through the free-text index                             | **Fail** — the same shape as the original defect                                                     |
| Step 4 returns nothing while steps 1–2 pass                       | The min-length floor was tightened past 4                                         | **Fail** — and note that `gdpr` is the other query sitting on that boundary                          |
| Ordering is right but `totalMatched` jumped an order of magnitude | The matcher was loosened; ordering alone cannot detect this                       | **Finding**, even with four green steps. Record the counts and compare against 2 / 2 / 1 / 1         |
| A named framework appears but below one that only mentions it     | Ranking regression rather than an index gap                                       | **Fail**, and record both scores' ordering — the distinction guides the fix                          |
| The model answers from memory without calling                     | Addendum missing — this family is the one models most often answer from knowledge | Re-check [`SETUP.md` § 2](SETUP.md); not a server defect                                             |

**Run log**

| Date       | Tester | Env  | Version | Mode | Verdict | Notes                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ------ | ---- | ------- | ---- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-12 | Cowork | prod | 0.49.0  | B    | Pass    | **First execution in any environment — the acceptance test for the `0.49.0` alias fix.** All four steps: `us-co-ai-act` first, `eu-ai-act` first, jurisdiction-scoped `totalMatched: 1` (was `[]` on `0.48.2` — the decisive assertion), `CAIA` resolving at the 4-char boundary. `totalMatched` 2 / 2 / 1 / 1. Tester also confirmed `gdpr` still returns `eu-gdpr` first, so both boundary queries hold |

---

_Last updated: 2026-08-12 (BL-119 cycle 4 — 02.1–02.3 executed against production 0.48.2; UAT-02.4 authored as the regression case for the alias defect, pending a `0.49.0` deploy)_
