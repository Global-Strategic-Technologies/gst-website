---
promptName: gst_diligence_handoff_memo
version: 0.0.2
recordedAt: 2026-05-02
model: claude-opus-4-7
---

# Worked example output for `gst_diligence_handoff_memo`

V8 sign-off recording (v0.0.1) carried forward to v0.0.2 — the BL-031.95 Phase 2.D `'unknown'` defaulting changes the wire shape (every wizard field is now optional with default `'unknown'`); fully-populated payloads below produce engine output identical to the v0.0.1 baseline. The new contract makes the prompt usable at deal kickoff with only `targetName` supplied; the engine widens the agenda conservatively when fields are unknown.

## Input — Trial 1 (full orchestration)

```json
{
  "targetName": "Helios Health",
  "transactionType": "majority-stake",
  "productType": "b2b-saas",
  "techArchetype": "modern-cloud-native",
  "headcount": "51-200",
  "revenueRange": "25-100m",
  "growthStage": "scaling",
  "companyAge": "5-10yr",
  "geographies": ["us", "eu"],
  "businessModel": "productized-platform",
  "scaleIntensity": "moderate",
  "transformationState": "mid-migration",
  "dataSensitivity": "high",
  "operatingModel": "product-aligned-teams"
}
```

Tool calls observed: `generate_diligence_agenda` ×1 + `search_portfolio` 2–3× (with self-correction: _"No matches on that combined string — the search is doing literal text matching. Let me try a broader search and use the engagement filter."_) + `gst://library/vdr-structure` referenced via folder labels in section 5.

## Input — Trial 2 (pre-supplied artifacts)

Same payload PLUS `agendaJson` (a representative `GeneratedScript` with 4 topics × 2 questions + 3 attention areas + triggerMap + metadata) AND `comparablesJson` (a `search_portfolio`-shaped result with 5 matches: Inspire / Ecological / Shield / Gazelle / Longhorn, each with industry / ARR / year / technologies metadata). Tool calls observed: NEITHER `generate_diligence_agenda` NOR `search_portfolio` called — model used the supplied JSON byte-for-byte. `gst://library/vdr-structure` still referenced.

## Expanded prompt body

Two messages: (1) the rendered text body. Step 1 conditionally embeds the supplied `agendaJson` directly OR instructs `generate_diligence_agenda` invocation; Step 2 conditionally embeds the supplied `comparablesJson` OR instructs `search_portfolio` invocation; Step 3 references the canonical Library article. Step 4 instructs a 6-section handoff memo with per-comparable static anchor URLs (`https://globalstrategic.tech/ma-portfolio/#<codeName-lowercase>`) per the V8 sign-off contract. (2) the embedded `gst://library/vdr-structure` Resource for the VDR taxonomy.

## Model output

Six-section handoff memo for Helios Health (sections identical between Trial 1 and Trial 2 in shape; content differs in source-grounding):

1. **Engagement context** — single paragraph anchoring the four deal-shape facts (majority-stake / mid-migration / high data sensitivity / dual US-EU geography) that thread through every subsequent section.
2. **Diligence agenda** — Trial 1: 19 prioritized topics across architecture / operations / security / carve-out, each with "what we look for here" framing. Trial 2: exactly the 8 questions from the supplied `agendaJson` (4 topics × 2), no fabrications.
3. **Attention areas** — 3-5 areas, each cross-referenced to specific comparable engagements where the same pattern surfaced.
4. **Comparable engagement library** — 5 comparables, each with codeName + 1-line why-relevant + 1-line lesson + static anchor URL of the form `https://globalstrategic.tech/ma-portfolio/#<codeName-lowercase>`. Trial 2: exactly the 5 codeNames from the supplied `comparablesJson` with industry / ARR / year metadata matching byte-for-byte.
5. **VDR follow-ups** — 16 folder mappings; canonical labels verbatim from the embedded Library article.
6. **Open questions / next steps** — 5 bullets the deal team should resolve before the next milestone. Trial 2's closing decision: _"Anchor on Gazelle if the IC wants the regulated-data scope-expansion precedent, or Inspire if the IC wants the carve-out plus IAM-remediation cost envelope. Both fit; the choice signals which value-creation thesis we're underwriting."_ — converts the supplied comparable shortlist into an IC-narrative recommendation that's not derivable from the JSON alone.

## Verification notes

Two changes shipped during V8 sign-off:

1. **Anchor-URL emission added to body Step 4(4)** (commit `e3da58e`) — original pass criterion required `/ma-portfolio/#<codeName>` anchors per comparable; body wasn't instructing the model to emit them. Added the static anchor URL instruction + a regression test that asserts `https://globalstrategic.tech/ma-portfolio/` appears in the rendered body. Anchor URLs are static (not URL-state-encoded) since Portfolio URL state is BL-031.95-deferred.

2. **Claude Desktop "Failed to attach prompt" UX gap surfaced** — informational only, no server-side fix possible. Server returns structured `-32602` "invalid params" with field-level detail (e.g., `productType: "b2b-saa"` instead of `"b2b-saas"` — a single-character form-state corruption); Desktop collapses this to a generic error message. Investigation tip: tail `mcp-server-gst.log` for the structured error before assuming a server-side bug.

The Trial 2 output verifies the optimization branch end-to-end: schema accepts pre-supplied JSON → body conditionally skips the upstream tool calls → model produces a deliverable substantively identical to Trial 1's full-orchestration path with two fewer tool calls observed. Locked by an existing unit test (`uses pre-generated artifacts directly when supplied (skips re-generation)`) plus the new anchor-URL regression test.
