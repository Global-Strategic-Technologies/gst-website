# UAT-02 — Regulatory map

> **Prerequisite**: [`SETUP.md`](SETUP.md) complete. **Environment**: production.
> **Input authority**: [`regulatory-map/CONTRACT.md`](../../tools/regulatory-map/CONTRACT.md)

A curated corpus of regulatory frameworks with a faceted search over it. A full pass proves the corpus is served rather than recalled — which is the entire point of the family, since a model answering "what does the EU AI Act require?" from training data will sound equally confident whether or not the answer is current.

> **Recorded runs are `local stdio`, not production.** The regulation corpus is bundled at build time with no external dependency, so these results should hold identically on the Worker. A production run is outstanding.

## Scope

| Capability               | Kind | Cases              | Contract                                              |
| ------------------------ | ---- | ------------------ | ----------------------------------------------------- |
| `list_regulation_facets` | tool | UAT-02.1           | [CONTRACT.md](../../tools/regulatory-map/CONTRACT.md) |
| `search_regulations`     | tool | UAT-02.2, UAT-02.3 | [CONTRACT.md](../../tools/regulatory-map/CONTRACT.md) |

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

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                          |
| ---------- | ------ | ----------- | ------- | ---- | ------- | ---------------------------------------------- |
| 2026-08-11 | BL-119 | local stdio | 0.48.1  | B    | Pass    | 73 jurisdictions, 4 categories, 123 frameworks |

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

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                               |
| ---------- | ------ | ----------- | ------- | ---- | ------- | --------------------------------------------------- |
| 2026-08-11 | BL-119 | local stdio | 0.48.1  | B    | Pass    | 1 match, 7 keyRequirements, three-band penalty text |

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

| Date | Tester | Env | Version | Mode | Verdict | Notes |
| ---- | ------ | --- | ------- | ---- | ------- | ----- |
|      |        |     |         |      |         |       |

---

_Last updated: 2026-08-11 (BL-119 — initial authoring; 02.1 and 02.2 executed against local stdio 0.48.1)_
