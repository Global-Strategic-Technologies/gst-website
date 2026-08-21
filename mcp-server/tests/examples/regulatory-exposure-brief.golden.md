---
promptName: gst_regulatory_exposure_brief
version: 0.0.1
recordedAt: 2026-05-01
model: claude-opus-4-7
---

# Worked example output for `gst_regulatory_exposure_brief`

> **Historical transcript, not a current-body snapshot.** This recording predates `v0.1.0` (2026-08-20, [ADR-0019](../../../src/docs/adr/0019-irl-extract-record-subject-indexing.md)). The body now carries `irlEvidencePrecedence()`, so a run with an IRL extract record in context takes jurisdictions and data categories from that evidence, cited, before falling back to the supplied arguments. Re-recording needs a human-driven live exercise against a real MCP client, so it cannot happen in-session or in CI; `golden-snapshots.test.ts` asserts file existence, four frontmatter keys and `promptName` — never `version` or body — so the stale version above is expected and is not drift to repair.

V4 sign-off recording. Two-run cycle. The first run revealed an auditability gap (the model fell back to training-derived prose because the `SearchResult` wire shape exposed only the high-level `summary`); the second run, after enrichment, produced obligation prose grounded directly in the regulation files' authored bullets.

## Input

```json
{
  "targetJurisdictions": ["eu", "us-ca"],
  "dataCategories": ["data-privacy", "ai-governance"],
  "productType": "b2b-saas"
}
```

Tool calls observed: 4 `search_regulations` calls (one per jurisdiction × category combination). No `resources/read` calls — the prompt body's design is to use the search-result fields directly (V1 finding established Resources are not model-fetchable from prompt expansion in Claude Desktop).

## Expanded prompt body

Single text message instructing the model to: (1) call `search_regulations` per jurisdiction × category, (2) build per-framework summaries from the SEARCH-RESULT FIELDS (with `keyRequirements` as the primary source for grounded obligation prose, `scope` for applicability framing, `penalties` for the statutory band), (3) frame as a structured brief with per-jurisdiction breakdown + cross-jurisdictional themes + Open-in-Hub deep-links.

## Model output

Four frameworks identified — GDPR, EU AI Act, CCPA/CPRA, California AI Transparency Act (SB 942). Per-framework obligation paragraphs cite specifics from the enriched `SearchResult` fields:

- **GDPR penalty band** verbatim from `penalties`: `up to 4% of global annual turnover or EUR 20 million, whichever is greater`
- **EU AI Act penalty bands** verbatim: `prohibited practices up to EUR 35 million or 7% of global turnover; high-risk violations up to EUR 15 million or 3%; misinformation to authorities up to EUR 7.5 million or 1%`
- **CCPA penalty band** verbatim: `up to $7,500 per intentional violation and $2,500 per unintentional violation, plus a private right of action for breaches at $100–$750 per consumer per incident`
- **SB 942 penalty band** verbatim: `$5,000 per violation, with each day of non-compliance counted as a separate offense`

Cross-jurisdictional themes (3 patterns, each substantively reasoned):

- Theme 1: Privacy operates as a product surface, not a policy artifact (GDPR + CCPA both require machine-actionable data-subject rights)
- Theme 2: AI obligations bifurcate by output modality and risk class, not by jurisdiction
- Theme 3: **Enforcement scales with revenue in the EU and with volume in California** — concrete penalty-regime comparison only achievable post-`SearchResult` enrichment (turnover-indexed EU vs. flat-amount California)

Open-in-Hub: per-framework deep-links + 4 aggregate `filterDeeplink` URLs. EU links correctly drop the region= param (per `jurisdictionToRegion('eu') → null`); US-CA links use uppercase canonical region.

## Verification notes

Two findings closed in-branch:

1. **`SearchResult` under-exposing source data** — wire shape dropped `scope`, `keyRequirements`, `penalties` even though the underlying regulation files declared them. Closed by commit `cc3b023` (enrichment + prompt body Step 2 update + 2 unit tests). Run 1 cited training-derived statute references (e.g., "Article 28 DPA") that were accurate but not directly traceable to a SearchResult field; Run 2 cites obligations sourced from `keyRequirements` bullets and penalty bands sourced from `penalties` strings.
2. **Stale `resources/read` and `enforcementAuthority` references in the prompt body** — module-level docstring and Step 3.(2) cited paths the body design no longer used. Closed in commit `49c73ce`.

The grounding shift between Run 1 and Run 2 is the cleanest signal the enrichment worked: pattern-recognition prose became source-traceable obligation prose without any change to the prompt body's voice.
