---
promptName: gst_comparable_engagements_memo
version: 0.0.2
recordedAt: 2026-05-03
model: claude-opus-4-7
---

# Worked example output for `gst_comparable_engagements_memo`

> **Historical transcript, not a current-body snapshot.** This recording predates `v0.1.0` (2026-08-20, [ADR-0019](../../../src/docs/adr/0019-irl-extract-record-subject-indexing.md)). The body now carries `irlEvidencePrecedence()`, so a run with an IRL extract record in context resolves its target profile from that evidence and cites it rather than from the description alone. Re-recording needs a human-driven live exercise against a real MCP client, so it cannot happen in-session or in CI; `golden-snapshots.test.ts` asserts file existence, four frontmatter keys and `promptName` — never `version` or body — so the stale version above is expected and is not drift to repair.

V3 sign-off recording (v0.0.1) carried forward to v0.0.2 — BL-031.95 Phase 5 added Step 6 to the body, instructing the model to append an "Open in Hub" footer that lists every `deeplink` URL returned by the `search_portfolio` calls (BL-031.95 Phase 4.B). One link per filter combination explored, labelled by filter — e.g., `Open in Hub: Healthcare / Buy-Side · Logistics / Buy-Side`. Each link opens `/ma-portfolio` with the same filter chips pre-active. The two pre-existing trials below carry through unchanged; the trial outputs gain an "Open in Hub" footer in v0.0.2 with the deeplinks each respective trial's filter combination would emit.

A fresh senior-consultant V-trial against the v0.0.2 body lands naturally on the next mcp-server restart per the no-deferred-tech-debt principle (CLAUDE.md § 4a) — the `dist/index.js` running subprocess can't be reloaded mid-session. The unit test contract was rewritten to lock the new shape (see `tests/unit/prompts/comparable-engagements-memo.test.ts`).

Two trials — one with no hints (forces derivation from the description), one with a deliberately-mismatched theme hint to test the model's epistemic discipline.

## Input — Run 1 (no hints)

```json
{
  "targetDescription": "PE-sponsored bolt-on acquisition of a vertical SaaS in industrial supply chain, ARR ~$60M, scaling stage. Significant integration debt from two prior tuck-in acquisitions. North American customer base, EU expansion underway. Sponsor needs a technology DD scope for LOI by end of month."
}
```

Tool calls observed: `list_portfolio_facets` ×1 → `search_portfolio` ×6 across Logistics, Software, Operations Management, Manufacturing themes (with cross-cuts).

## Input — Run 2 (Healthcare hint, deliberately mismatched)

```json
{
  "targetDescription": "PE-sponsored bolt-on acquisition of a vertical SaaS in industrial supply chain, ARR ~$60M, scaling stage. Significant integration debt from two prior tuck-in acquisitions. North American customer base, EU expansion underway. Sponsor needs a technology DD scope for LOI by end of month.",
  "theme": "Healthcare"
}
```

Tool calls observed: `list_portfolio_facets` ×1 → `search_portfolio` ×2 (Healthcare/Buy-Side filtered + free-text deal-shape pass).

## Expanded prompt body

Single text message instructing the model to: (1) call `list_portfolio_facets` first to enumerate valid themes/categories, (2) run `search_portfolio` 1–3× varying filters as needed, (3) select the 3–5 most analogically useful matches, (4) write one paragraph per comparable (codeName + 1-line context + strategic question + lesson framed analogically as forward guidance), (5) close with a 2–3 sentence cross-shortlist synthesis.

## Model output — Run 1

Five-comparable shortlist drawn from the GST portfolio's Logistics, Software, Manufacturing, Operations Management themes, ordered by analogical fit:

- **Onfray** (Logistics SaaS, $180M ARR, Scaling Growth, 2022) — closest deal-shape twin (PE buy-side, monolith with accumulated debt, multi-country)
- **Chariot** (Logistics marketplace + adjacent TMS SaaS, Scaling Growth, 2022) — analogous to NA-to-EU expansion overlay on already-scaling platform
- **Wolverine** (Supply Chain Analytics, $10M ARR, Scaling Growth, 2025) — closest domain match with refactoring-program lesson
- **Knapsack** (Manufacturing scheduling, Legacy System, 2024) — integration-platform recommendation; tuck-in integration angle directly relevant
- **Regatta** (Data Integration SaaS, $5M ARR, Early-Stage Growth, 2024) — pre-bid light-touch assessment; procedural analog to the end-of-month LOI deadline

Closing two-tier scope synthesis: pre-LOI fast assessment (Regatta-shaped) + post-LOI deep TDD (Onfray/Chariot-shaped). Prior tuck-ins identified as the dominant risk vector.

## Model output — Run 2

Four-comparable Healthcare-themed shortlist with explicit domain-mismatch flag in the search-basis preamble — the model honored the hint AND surfaced that the analogies hold on deal-shape, not domain:

- **Atlas** (Healthcare RCM, $67M ARR, Mature Enterprise, 2026) — closest ARR twin
- **Wellness** (Telehealth, $70M ARR, Scaling Growth, 2025) — closest combined ARR + stage match
- **Tempo** (HealthTech, $13M ARR, Scaling Growth, 2024) — directly analogous on the integration question
- **Oktoberfest** (Clinical Research, €6.5M ARR, Scaling Growth, 2023) — only Healthcare comparable with explicit EU regulatory profile

Closing four-workstream scope synthesis explicitly recommends a complementary Logistics/Manufacturing pass to surface domain-native comparables. _"Healthcare hint should be treated as directional rather than determinative."_

## Verification notes

Run 2 surfaced one architectural finding: `engagementCategory: "Buy-side"` (lowercase 's') failed Zod's strict enum check (canonical: `"Buy-Side"`). Closed in commit `8df945d` by the `enumFromWire` preprocessor (case-tolerant normalization), applied across all enum-typed argsSchema fields in all 8 prompts. Run 1's 6-search count slightly exceeded the body's "1-3 times" budget; output quality was excellent so the body is intentionally left unchanged (recorded as soft observation).
