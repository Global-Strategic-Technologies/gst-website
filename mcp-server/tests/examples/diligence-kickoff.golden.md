---
promptName: gst_diligence_kickoff
version: 0.0.2
recordedAt: 2026-05-02
model: claude-opus-4-7
---

# Worked example output for `gst_diligence_kickoff`

V1 sign-off recording (v0.0.1) carried forward to v0.0.2 — the BL-031.95 Phase 2.D `'unknown'` defaulting changes the wire shape (every wizard field is now optional with default `'unknown'`) and adds a low-confidence callout to the body when ≥ 7 of 13 dimensions are unknown. The fully-populated payload below produces engine output identical to the v0.0.1 baseline; the new contract makes the prompt usable at deal kickoff with only `targetName` supplied.

## Input

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

Helios Health is a fictional B2B healthtech SaaS target; the schema-valid payload covers every UserInputs field. `geographies` parsed correctly via `arrayFromWire` from commit `c88b598`.

## Expanded prompt body

Two messages: (1) the rendered text body opening with the authorial-intent line followed by Steps 1–3 (call `generate_diligence_agenda`, treat the embedded canonical Library article as authoritative for VDR taxonomy, frame the result as a one-page kickoff memo); (2) the embedded `gst://library/vdr-structure` Resource carrying the VDR Structure Guide article body (Commit 5 / V1 finding 1 fix — Resources not model-fetchable from prompt expansion, so they ship inline).

## Model output

Four-section memo for Helios Health:

1. **Target context** — single paragraph anchoring the engagement: B2B SaaS productized platform, 5–10 years old, scaling-stage, $25–100M revenue, 51–200 headcount across product-aligned teams, modern cloud-native stack mid-migration, US/EU footprint with high data sensitivity. Calls out three deal-shaping conditions: in-flight migration during a scaling window, high-sensitivity data under dual US/EU regimes, B2B SaaS moat thesis vs. AI-platform commoditization.

2. **Prioritized agenda by topic** — four topic groups with 2–7 numbered items each: Architecture (CTO/VP Eng — migration risk profile, system decomposition, DR/BC architecture, database scaling, tenancy model, IaC maturity, SLA history), Operations & Delivery (VP Eng — CI/CD cycle time, key-person dependencies, DR test, deployment frequency/rollback, on-call MTTD/MTTR), Security & Governance (CISO — SOC 2/ISO 27001 currency, GDPR posture, secrets management, security incident history, EU AI Act, data classification), Carve-out / Integration (M&A Lead — regulatory certification transferability, duplicate-system rationalization).

3. **Attention areas** — five items each with 1-line "why this matters" framing: mid-migration instability, cross-border data compliance, AI commodity risk / moat erosion, sensitive data breach liability, data classification maturity gap.

4. **Suggested VDR requests** — folder labels taken VERBATIM from the embedded Library article's canonical 9-folder taxonomy (`02 — Software Architecture`, `03 — Infrastructure & Operations`, `04 — SDLC`, `05 — Data, Analytics & AI`, `06 — Security`, `07 — People & Organization`, `08 — Corporate IT`, `09 — Governance & Compliance`). 2 concrete document requests per agenda topic + attention area, prioritized by signal-to-effort.

## Verification notes

V1 first invocation against the pre-Commit-5 binary surfaced three findings: (1) Resources not model-fetchable, (2) prompt expansion read as "uploaded document" with prompt-provenance hedging, (3) VDR taxonomy substituted with generic PE-diligence labels. All three closed by Commit 5 (`EmbeddedResource` content blocks) + the standardized authorial-intent line in every prompt body. Re-run against the post-Commit-5 binary produced this output cleanly.
