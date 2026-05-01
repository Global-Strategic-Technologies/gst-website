---
promptName: gst_vdr_audit
version: 0.0.1
recordedAt: 2026-05-01
model: claude-opus-4-7
---

# Worked example output for `gst_vdr_audit`

V5 sign-off recording. Two trials (one-shot + interactive) plus a Tier 1 follow-up that addressed the senior-consultant critique that folder-name-only input produced a "checklist generator" rather than a real audit.

## Input — Trial (a) one-shot mode (free-text `vdrInventory`)

```
01_Corporate_Overview
02_Financial_Statements
03_Customer_Contracts
04_IP_and_Patents
05_Engineering_Org_Chart
06_Tech_Stack_Inventory
07_Vendor_Agreements
08_HR_and_Compensation
09_Marketing_Materials
10_Legal_Holds
```

A representative target VDR list that maps imperfectly onto the canonical 9-folder taxonomy. Designed to exercise Direct hits, Partials, Gaps, and Out-of-scope content.

## Input — Trial (b) interactive mode

Empty payload. Model recognized the empty input, asked the user to paste their VDR list, then produced an identical audit when the user pasted the same list as Trial (a).

## Input — Trial (c) Tier 1 (structured `vdrFolders` with optional file lists)

```json
{
  "vdrFolders": [
    { "name": "01_Corporate_Overview" },
    { "name": "02_Financial_Statements" },
    {
      "name": "06_Tech_Stack_Inventory",
      "files": ["stack-overview-v17.pdf", "README_FINAL_REVISED.docx"]
    },
    { "name": "06_Security", "files": ["pen-test-executive-summary-2022.pdf"] },
    {
      "name": "07_Vendor_Agreements",
      "files": ["aws-mssa-2024.pdf", "datadog-msa-2025.pdf", "snowflake-msa-2025.pdf"]
    }
  ]
}
```

## Expanded prompt body

Two messages: (1) the rendered text body (one of three branches based on input shape — `vdrFolders` structured, `vdrInventory` free-text, or interactive); (2) the embedded `gst://library/vdr-structure` Resource carrying the VDR Structure Guide article body for the canonical folder taxonomy.

## Model output

**Trial (a) and (b) — folder-only audit (identical when the same inventory was supplied):**

Three-section deliverable:

- **Mapping table** — 9 rows (one per canonical folder) × Direct/Partial/Gap status. Out-of-scope target folders routed off (Corporate Overview → legal track, Financial Statements → financial diligence, Customer Contracts → commercial DD, Marketing Materials → commercial DD).
- **Gaps with concrete document requests** — for each Gap or Partial canonical folder, a "what we expect to find here" 1-liner plus 3 specific document requests (e.g., Security Gap → pen-test, SOC 2 / ISO 27001 with remediation status, incident history + IR + BCP/DR).
- **Prioritized 7-item request list** — ordered by signal-to-effort, with rationale per item linking back to the gap it closes.

**Trial (c) — Tier 1 enriched audit:**

Same three-section deliverable PLUS a 4th Quality Flag column in the mapping table:

- **`06_Tech_Stack_Inventory`**: Quality flag — "Two files only — `stack-overview-v17.pdf` (v17 versioning suggests uncontrolled iteration; no date) and `README_FINAL_REVISED.docx` (classic stale-versioning anti-pattern; generic placeholder name). Folder is materially too thin to cover architecture diagrams, data model, APIs, code-quality, or test coverage."
- **`06_Security`**: Quality flag — "Single artifact: `pen-test-executive-summary-2022.pdf`. Pen test is **~3-4 years stale** (2022, current date May 2026). No policies, no incident history, no access-control documentation, no BC/DR, no compliance certifications, no vulnerability management cadence."
- **`07_Vendor_Agreements`**: NO Quality flag — three contracts named clearly per vendor, all recent dates (AWS MSSA 2024, Datadog MSA 2025, Snowflake MSA 2025). Implied infrastructure presence flagged as in-scope diligence signal even though the folder routes to commercial DD.

**Bonus findings unprompted by the body design** — emerged organically from contents-grounded reasoning:

1. **Prefix collision detection** — caught that the target uses `06_` for both `06_Tech_Stack_Inventory` AND `06_Security`, called out structural sort-order ambiguity.
2. **Implied-stack inference from out-of-scope content** — recognized that AWS / Datadog / Snowflake vendor contracts carry inferential value for in-scope tracks (Infrastructure, Data) even though the folder is out-of-scope.
3. **Taxonomy extension proposal grounded in cross-deal frequency** — proposed a new canonical folder `10 — Vendor & Licensing Agreements` per the body's existing "extend if worth doing for ≥3 deals" rule.

**Auditor's note (closing synthesis):** _"Multiple Library-documented anti-patterns: stale versioning (`_v17`, `_FINAL_REVISED`), generic placeholders (`README.docx`), prefix collisions (two `06_` folders), an undated 4-year-old pen test, and 6 of 9 canonical folders entirely missing. Consistent with a rushed or incomplete VDR assembly. Recommend flagging operational-discipline concern in the IOI-stage memo and using the Section 4 list as the opening request volley."_

## Verification notes

V5 sign-off triggered the Tier 1 expansion (commit `776317d`) — `vdrFolders: [{ name, files? }]` argument with conditional Step 2b in the body when at least one folder has files. The substantive critique that this prompt produced a "checklist generator" rather than a real audit is closed by Tier 1: file-level signal moves the prompt from "structural mapping" to "contents-grounded judgment." Tiers 2–6 (file metadata, comparable cross-reference, VDR provider API integration, audit deltas, sell-side workflow flip) are deferred to BL-036.
