---
name: gst-page-content
description: >
  Use this skill when writing or editing GST website page copy — hero and
  section copy, case studies and portfolio narratives, tool descriptions,
  hub articles and perspectives, headlines, and CTAs — or whenever content
  must land for the PE / M&A executive audience. Covers audience targeting,
  brand voice, sentence and CTA formulas, and per-content-type structure.
  Contains zero styling or SEO facts: those live in the repo docs this skill
  points to, and those docs win on any conflict.
---

# GST Page Content

Content patterns and voice for GST website copy. This skill covers **what to
say and how to structure it** — never how to style or mark it up.

## Step 0 — Your contract: the repo docs win

Styling, markup, brand rulings, and SEO are owned by the authoritative docs.
Read the relevant one BEFORE writing; on any conflict with this skill, the doc wins.

- [STYLES_GUIDE.md](src/docs/styles/STYLES_GUIDE.md) — all styling: tokens, components, themes/palettes, and the in-repo control examples
- [BRAND_GUIDELINES.md](src/docs/styles/BRAND_GUIDELINES.md) — company-name rules (approved/prohibited forms), voice rulings, color hierarchy
- [VARIABLES_REFERENCE.md](src/docs/styles/VARIABLES_REFERENCE.md) — the design-token catalog
- [SEO_IMPLEMENTATION.md](src/docs/seo/SEO_IMPLEMENTATION.md) — page titles, meta descriptions, heading hierarchy, keywords

Never restate a styling or SEO fact (a size, spacing, breakpoint, class name,
asset path, or title formula) inside copy work — link the doc instead.

## Step 1 — Identify the audience

- **Primary — PE investors**: time-constrained (2–5 min visits), outcome-focused (EBITDA, revenue growth, risk), oversee portfolios with delegated technical evaluation. Expect executive summaries, quantified results (Δ notation), business outcomes before technical detail, scannable hierarchy.
- **Secondary — portfolio-company C-suite**: operational accountability, budget authority, board reporting. Expect strategic roadmaps, value-creation frameworks, risk-adjusted decision models, clear next steps.
- **Tertiary — technical leaders (CTO / VP Eng)**: implementation and architecture responsibility. Expect technical credibility, methodology transparency, tool specificity, pragmatic over theoretical.

## Step 2 — Apply the voice

- **Subject is "GST", never "We", for declarative capability statements** (BRAND_GUIDELINES § Brand Voice — "we deliver / we assess" phrasing is prohibited there). Collaborative invitations ("Let's discuss") are fine; capability claims are not.
- Authoritative without arrogance: declarative, no superlatives ("best", "leading", "premier"); let metrics speak.
- Business outcomes before technical features: "revenue growth" before "platform modernization"; "EBITDA improvement" before "cost optimization".
- Quantified and specific: "Δ$8.2M EBITDA" not "significant improvement"; "14-week implementation" not "rapid deployment"; "127 microservices" not "complex architecture".
- **Banlists** — never use: marketing jargon ("synergy", "paradigm shift", "game-changing"); buzzwords ("AI-powered", "next-generation", "cutting-edge"); hedging ("might", "could potentially", "we believe"); excessive modifiers ("extremely", "very", "highly"); acronyms without business context.

## Step 3 — Sentence & CTA formulas

- **H1**: `[Action/State] + [Business Outcome]` — "Strategic Advisory & Execution", "De-Risking High-Stakes Technology Investments".
- **H2**: `[Specific Capability] + [Target Audience Context]` — "Technical diligence and value creation execution for private equity".
- **Body**: `[Problem Context] → [Approach] → [Outcome]` — "Portfolio companies inherit complex technical debt that constrains growth. GST conducts forensic assessments of architecture, security, and scalability, then builds executable roadmaps that deliver measurable EBITDA improvement within 12–18 months."
- **CTAs**: direct action ("Schedule a Consultation") or the site's function-style invocation convention — `BOOK_CALENDAR_SLOT()` is the established form (`REQUEST_WHITEPAPER()` is illustrative of the shape, not an existing CTA). CTAs render through `src/components/CTASection.astro`, whose default button text is the function-style form — reuse that component rather than hand-rolling.

## Step 4 — Structure by content type (field lists)

- **Case study / portfolio narrative**: Client Context (industry / stage / scale) · Engagement Type · Duration · Team Size · Business Challenge (2–3 sentences: what problem, what was at stake) · Approach (3–4 bullets) · Measurable Outcomes (Δ-notation bullets) · Technical Scope (optional, non-confidential). Actual portfolio entries live in `src/data/ma-portfolio/projects.json` — create them with the `gst-ma-portfolio-card` skill, not by hand.
- **Tool / calculator description**: Purpose (one line) · Use Case (who, when, for what decision) · Inputs Required · Outputs Delivered · Methodology (brief) · Typical Results (one worked example).
- **Perspective / article**: Title · Published / reading time / category line · Executive Summary (2–3 sentences: thesis, what changed, why now) · The Context · The Implication for M&A · What to Watch (3–5 signals) · Our Take (opinionated, evidence-based).

## Step 5 — Check against exemplars

Metric presentation:

```
Δ Revenue: +$12.4M ARR (23% growth)
Δ EBITDA: +$8.2M (margin expansion from 18% to 31%)
Δ Speed: -6 months time-to-market for new features
```

Article opening (note GST-as-subject):

```
Portfolio companies integrated in 2022-2023 are now experiencing "technical
debt reckoning" as deferred architecture decisions compound. GST is tracking
a 3x increase in post-Day-100 remediation projects compared to 2019-2020
vintages. The culprit? Integration playbooks optimized for speed over
architectural integrity.
```

## Hand-offs & blocking checks

- Portfolio entries → invoke `gst-ma-portfolio-card`.
- Company-name usage → [BRAND_GUIDELINES.md](src/docs/styles/BRAND_GUIDELINES.md) § Company Name (prohibited forms exist — check before writing any name variant).
- **After ANY copy change**: grep `tests/` for every old string before committing (CLAUDE.md Directive 11) — E2E tests assert on visible text.
- **Tier A pages and chrome are localized** (BL-153): English copy goes into `src/i18n/en/<ns>.json`, not into the template, and every English edit needs the `es` / `pt-BR` catalogs revisited and re-stamped (`npm run i18n:stamp`) or `test:docs` fails on staleness. Translation register: formal address (`usted` / `você`), product and tool names stay English, no locale clichés, header labels ≤ 8 characters — see [LOCALIZATION.md § Translation workflow](src/docs/development/LOCALIZATION.md#translation-workflow).
