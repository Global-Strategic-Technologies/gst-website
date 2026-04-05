# The Diligence Machine — Technical Documentation

## Overview

The Diligence Machine is a client-side wizard that generates a prescriptive technology due diligence agenda customized to a target company's profile. Users answer 10 steps of questions across deal structure, product profile, infrastructure, company scale, geography, and 5 contextual dimensions. The engine produces 15–20 high-impact questions organized by topic, plus contextual attention areas.

**Entry point**: `src/pages/hub/tools/diligence-machine/index.astro`

**Current version**: v2 (February 2026)

---

## Architecture

```
User (Wizard UI)
│
├── src/data/diligence-machine/wizard-config.ts    ← Step definitions & option labels (10 steps)
│
├── src/utils/diligence-engine.ts                  ← Core engine: filtering, pivots, overrides, balancing, output
│
├── src/data/diligence-machine/questions.ts        ← Question bank (~68 questions, 4 topics)
│
└── src/data/diligence-machine/attention-areas.ts  ← Attention area definitions (23 areas)
```

All logic runs client-side. No server calls. The engine is a pure function: `generateScript(UserInputs) → GeneratedScript`.

---

## What Changed in v2

v2 expands the wizard from 5 steps to 10, adds strategic metadata to questions, and introduces two new engine rules. All changes are backward-compatible with v1 data structures — v1 questions remain unchanged and continue to function as before.

| Area | v1 | v2 |
|------|----|----|
| Wizard steps | 5 | 10 (+5 context dimensions) |
| Question bank | ~45 questions | ~68 questions (+15 v2 questions) |
| Attention areas | 18 areas | 28 areas (+10 v2) |
| Condition dimensions | 9 fields | 14 fields (+5 new) |
| Question metadata | id, text, rationale, priority | + exitImpact, lookoutSignal, track |
| Engine rules | Filter → Balance → Group | + Archetype Pivot, Maturity Override |
| State version | `STORAGE_VERSION = 1` | `STORAGE_VERSION = 2` |
| UX | Instant output | 2-second "Analyzing" overlay + methodology section |

---

## The 10 Wizard Steps

### Steps 1–5 (v1 — unchanged)

#### Step 1: Transaction Type (`transactionType`)

Defines the deal structure. Gates carve-out/integration questions.

| Option | ID |
|--------|----|
| Full Acquisition | `full-acquisition` |
| Majority Stake | `majority-stake` |
| Business Integration | `business-integration` |
| Carve-Out | `carve-out` |
| Venture / Series | `venture-series` |

#### Step 2: Product Type (`productType`)

Determines product-specific architecture, compliance, and operations questions.

| Option | ID |
|--------|----|
| B2B SaaS | `b2b-saas` |
| B2C Marketplace | `b2c-marketplace` |
| On-Premise Enterprise | `on-premise-enterprise` |
| Deep-Tech / IP | `deep-tech-ip` |
| Tech-Enabled Service | `tech-enabled-service` |

#### Step 3: Tech Stack Archetype (`techArchetype`)

Drives infrastructure attention areas and architecture questions.

| Option | ID |
|--------|----|
| Modern Cloud-Native | `modern-cloud-native` |
| Hybrid Legacy | `hybrid-legacy` |
| Self-Managed Infrastructure | `self-managed-infra` |
| Datacenter / Vendor | `datacenter-vendor` |

#### Step 4: Company Profile (compound — 4 fields)

Scale influences operational questions, attention areas, and minimum-threshold filtering.

**Headcount** (`headcount`): `1-50`, `51-200`, `201-500`, `500+`

**Revenue Range** (`revenueRange`): `0-5m`, `5-25m`, `25-100m`, `100m+`

**Growth Stage** (`growthStage`): `early`, `scaling`, `mature`

**Company Age** (`companyAge`): `under-2yr`, `2-5yr`, `5-10yr`, `10-20yr`, `20yr+`

#### Step 5: Geography (`geographies` — multi-select)

Enables regulatory/compliance questions and region-specific attention areas.

| Option | ID |
|--------|----|
| United States | `us` |
| Canada | `canada` |
| European Union | `eu` |
| United Kingdom | `uk` |
| Latin America | `latam` |
| Africa | `africa` |
| Asia-Pacific | `apac` |
| Multi-Region | `multi-region` |

**Multi-Region auto-sync**: Selecting 2+ specific regions auto-adds `multi-region`. Selecting only 1 region removes it.

### Steps 6–10 (v2 — new context dimensions)

These 5 single-select steps sharpen question targeting by capturing business model, operational scale, modernization posture, data handling profile, and team structure.

#### Step 6: Business Model (`businessModel`)

Primary delivery and monetization model. Conditions questions about platform economics, services margins, and licensing structures.

| Option | ID |
|--------|----|
| Productized Platform | `productized-platform` |
| Customized Deployments | `customized-deployments` |
| Services-Led | `services-led` |
| Usage-Based | `usage-based` |
| IP Licensing | `ip-licensing` |

#### Step 7: Scale Intensity (`scaleIntensity`)

Operational scale and user volume pressure. Drives architecture scaling and observability questions.

| Option | ID |
|--------|----|
| Low | `low` |
| Moderate | `moderate` |
| High | `high` |

#### Step 8: Transformation State (`transformationState`)

Current state of technology modernization. Targets migration risk, stalled modernization, and post-migration validation questions.

| Option | ID |
|--------|----|
| Stable | `stable` |
| Mid-Migration | `mid-migration` |
| Actively Modernizing | `actively-modernizing` |
| Recently Modernized | `recently-modernized` |

#### Step 9: Data Sensitivity (`dataSensitivity`)

Sensitivity level of data the target handles. Controls data governance, classification, and retention questions.

| Option | ID |
|--------|----|
| Low | `low` |
| Moderate | `moderate` |
| High | `high` |

#### Step 10: Operating Model (`operatingModel`)

Engineering organization structure. Drives questions about team autonomy, outsourcing risk, and knowledge distribution.

| Option | ID |
|--------|----|
| Centralized Engineering | `centralized-eng` |
| Product-Aligned Teams | `product-aligned-teams` |
| Outsourced-Heavy | `outsourced-heavy` |
| Hybrid | `hybrid` |

---

## Conditional Matching System

Every question and attention area has a `conditions` object:

```typescript
conditions: {
  // v1 condition fields
  transactionTypes?: string[];         // OR within array
  productTypes?: string[];             // OR within array
  techArchetypes?: string[];           // OR within array
  growthStages?: string[];             // OR within array
  geographies?: string[];              // any match = include
  headcountMin?: string;               // ordinal "at least" threshold
  revenueMin?: string;                 // ordinal "at least" threshold
  companyAgeMin?: string;              // ordinal "at least" threshold
  excludeTransactionTypes?: string[];  // exclusion filter

  // v2 condition fields
  businessModels?: string[];           // OR within array
  scaleIntensity?: string[];           // OR within array
  transformationStates?: string[];     // OR within array
  dataSensitivity?: string[];          // OR within array
  operatingModels?: string[];          // OR within array
}
```

### Matching Rules

- **Undefined field** = wildcard (matches all inputs)
- **Array fields** = OR within the array, AND across fields
- **Ordinal thresholds** (`headcountMin`, `revenueMin`, `companyAgeMin`) = user's bracket must be at or above the minimum in the ordering
- **`excludeTransactionTypes`** = excludes the question even if all other conditions match
- v2 condition fields follow the same OR-within/AND-across pattern as v1

**Example**: A question with `productTypes: ['b2b-saas']`, `businessModels: ['productized-platform', 'usage-based']`, and `scaleIntensity: ['high']` only appears for B2B SaaS companies with either a productized or usage-based business model operating at high scale.

---

## Question Bank

### 4 Topics

| Topic | Audience | v1 Questions | v2 Questions | Total |
|-------|----------|-------------|-------------|-------|
| Architecture | CTO / VP Engineering / Senior Architect | 12 | 6 | 18 |
| Operations & Delivery | VP Engineering / VP Product | 12 | 6 | 18 |
| Carve-out / Integration | CIO / COO / CTO / PE Leadership | 12 | 0 | 12 |
| Security, Compliance & Governance | CIO / CISO / VP Security | 16 | 4 | 20 |

### Priority Levels

- **high** — Critical concerns; always appear when conditions match
- **medium** — Important but not universally applicable
- **standard** — Context-dependent; included when space permits

### Question Structure

```typescript
{
  id: string;
  topic: string;
  topicLabel: string;
  audienceLevel: string;
  text: string;           // The question itself
  rationale: string;      // Why this question matters
  priority: 'high' | 'medium' | 'standard';
  conditions: { ... };

  // v2 strategic metadata (optional — present on all 15 v2 questions)
  exitImpact?: 'Multiple Expander' | 'Valuation Drag' | 'Operational Risk';
  lookoutSignal?: string;
  track?: 'Architecture' | 'Operations' | 'Carve-out' | 'Security';
}
```

### v2 Strategic Metadata Fields

**`exitImpact`** — Categorizes the question's relevance to deal economics:
- **Multiple Expander** — Positive finding could increase valuation multiples
- **Valuation Drag** — Issue could reduce enterprise value
- **Operational Risk** — Concern affects post-close execution

**`lookoutSignal`** — A specific, observable indicator that suggests elevated risk. Displayed in the output below the question text when present. Examples:
- _"If DR has never been tested or last test was 12+ months ago, recovery capability is unvalidated."_
- _"If custom code exceeds 30% per deployment or there is no drift detection mechanism."_

**`track`** — Maps the question to a diligence workstream: `Architecture`, `Operations`, `Carve-out`, or `Security`. Enables grouping by functional responsibility.

---

## Selection Algorithm

### 1. Filter

All ~68 questions are filtered against user inputs via `matchesConditions()`. Typically produces ~25–35 matched questions.

### 2. Archetype Pivot (v2)

`applyArchetypePivot()` filters out questions that are exclusively cloud-native when the target uses on-premise or self-managed infrastructure:

**Trigger**: `productType === 'on-premise-enterprise'` OR `techArchetype in ['self-managed-infra', 'datacenter-vendor']`

**Action**: Remove questions whose `conditions.techArchetypes` array contains ONLY `'modern-cloud-native'`. Questions with mixed archetypes (e.g., `['modern-cloud-native', 'hybrid-legacy']`) or no archetype condition are preserved.

### 3. Balance Across Topics

`balanceAcrossTopics()` ensures representative coverage:

**Phase 1 — Minimums**: Reserve the top 3 highest-priority questions from each topic.

**Phase 2 — Fill**: From remaining candidates, fill up to 20 total questions by priority across all topics.

**Result**: 15–20 questions with guaranteed topic representation, weighted toward high-priority items.

### 4. Group & Sort

Questions are grouped by topic (Architecture → Operations → Carve-out → Security) and sorted by priority within each topic.

### 5. Maturity Override (v2)

`applyMaturityOverrides()` injects computed attention areas based on cross-field logic:

**Trigger**: `revenueRange >= '25-100m'` AND `headcount < '201-500'` AND `growthStage === 'mature'`

**Action**: Inject `attention-manual-ops-masking` area if not already present from condition matching.

**Rationale**: High revenue with low headcount in a mature company may indicate manual processes masked behind a technology facade — a pattern that simple condition arrays can't express.

---

## Attention Areas

28 attention areas are filtered independently using the same condition system. They surface structural concerns that complement the question topics.

### Categories

**Infrastructure & Modernization**
- Hardware End-of-Life Exposure — self-managed/datacenter + age 10–20yr
- Colocation Hardware Lifecycle — datacenter + age 10–20yr
- Technical Debt Accumulation — hybrid-legacy + age 5–10yr
- Legacy Vendor Lock-in — on-premise + age 10–20yr
- Mid-Migration Instability (v2) — mid-migration transformation state

**Organizational**
- Key-Person Dependencies — small teams + on-premise/self-managed
- Manual Operations Dependency — tech-enabled services + scaling/mature
- Specialized Labor Dependencies — self-managed/datacenter
- Talent Calcification (v2) — age 10–20yr + mature growth stage
- Shadow IT Sprawl (v2) — tech-enabled service + 500+ headcount

**Transaction-Specific**
- Carve-out Technology Entanglement — carve-out + hybrid-legacy
- IP Documentation Gaps — deep-tech + early stage

**Strategic / Market (v2)**
- AI Commodity Risk (Moat Erosion) — B2B SaaS
- Manual Operations Masking — revenue 25–100m+ + mature (also injected by maturity override)
- Services-Led Margin Pressure (v2) — services-led business model + revenue 5–25m

**Security & Data Governance (v2)**
- Sensitive Data Breach Liability (v2) — high data sensitivity + revenue 5–25m
- Data Classification Maturity Gap (v2) — high data sensitivity + scaling growth stage

**Scale & Technical Complexity (v2)**
- High-Scale Operational Complexity (v2) — high scale intensity + cloud-native
- Customization Debt Accumulation (v2) — customized-deployments business model + headcount 51–200

**Geographic / Regulatory**
- Cross-Border Data Compliance — EU/UK/APAC/LATAM/Africa
- Post-Brexit Data Transfer Complexity — UK
- LATAM Infrastructure Maturity — LATAM + cloud-native or hybrid-legacy
- African Regulatory Fragmentation — Africa
- Canadian Privacy Law Complexity — Canada

**Multi-Region** (triggered by `multi-region` geography)
- Cross-Border Data Transfer Complexity
- Jurisdictional Conflict Exposure
- Multi-Region Infrastructure Cost Multiplier
- Fragmented Vendor and Contract Landscape
- Regulatory Change Velocity

### Relevance Levels

- **high** — Structural risks affecting valuation or integration
- **medium** — Important considerations, not deal-breaking
- **low** — Context-specific concerns

Attention areas are sorted by relevance in the output.

---

## Decision Impact Reference

### v1 Dimensions

| User Decision | Questions Affected | Attention Areas Triggered |
|---|---|---|
| **Carve-out** | Carve-out/integration topic questions enabled | Carve-out entanglement (if hybrid-legacy) |
| **B2B SaaS** | Multi-tenant architecture, SaaS ops | AI Commodity Risk / Moat Erosion (v2) |
| **Deep-Tech / IP** | Data pipelines, SBOM | IP docs gaps (if early-stage) |
| **Tech-Enabled Service** | Automation ratio, outsourcing | Manual ops dependency (if scaling/mature), Shadow IT Sprawl (if 500+) |
| **Hybrid Legacy** | Legacy coupling, tech debt | Tech debt accumulation |
| **Self-Managed Infra** | Scaling limits, cloud migration; archetype pivot filters cloud-only Qs | HW end-of-life, key-person, labor specialist |
| **Datacenter / Vendor** | Scaling limits, cloud migration; archetype pivot filters cloud-only Qs | Colo HW lifecycle, labor specialist |
| **51–200 headcount** | Observability, access control | — |
| **201–500 headcount** | Platform engineering | — |
| **5–25M revenue** | DR/BC planning | — |
| **25–100M revenue** | Third-party assessments, BC/DR testing | Manual ops masking (if mature + low headcount) |
| **5–10yr age** | Tech debt, legacy coupling | Tech debt accumulation |
| **10–20yr age** | Legacy/modernization questions | HW end-of-life, legacy vendor lock-in, Talent Calcification (if mature) |
| **EU/UK** | GDPR, post-Brexit data transfer, EU AI Act (v2) | Cross-border compliance, Brexit data |
| **LATAM** | LGPD compliance | LATAM infrastructure maturity |
| **Africa** | POPIA, local DPA | African regulatory fragmentation |
| **Canada** | PIPEDA, Quebec Law 25 | Canadian privacy complexity |
| **Multi-Region** | All geographic compliance questions | 5 multi-region attention areas |

### v2 Context Dimensions

| User Decision | Questions Affected | Attention Areas Triggered |
|---|---|---|
| **Productized Platform** | Platform economics, deployment consistency | — |
| **Customized Deployments** | Config drift, custom code ratio | Customization Debt Accumulation (if 51–200 headcount) |
| **Services-Led** | Services margin, product/services revenue ratio | Services-Led Margin Pressure (if revenue 5–25m) |
| **Usage-Based** | Metering integrity, billing accuracy | — |
| **IP Licensing** | IP protection, assignment clauses | — |
| **Low Scale Intensity** | Internal tools assessment | — |
| **Moderate Scale Intensity** | Standard scalability assessment | — |
| **High Scale Intensity** | Auto-scaling, elasticity assessment | High-Scale Operational Complexity (if cloud-native) |
| **Stable** (transformation) | Maintenance posture evaluation | — |
| **Mid-Migration** | Migration risk, rollback plans | Mid-Migration Instability |
| **Actively Modernizing** | Modernization progress, stall indicators | — |
| **Recently Modernized** | Stabilization validation | — |
| **Low Data Sensitivity** | Basic data handling review | — |
| **Moderate Data Sensitivity** | Standard data protection assessment | — |
| **High Data Sensitivity** | Data classification, retention policies | Sensitive Data Breach Liability (if revenue 5–25m), Data Classification Gap (if scaling) |
| **Outsourced-Heavy** | IP ownership, institutional knowledge | — |
| **Product-Aligned Teams** | Governance fragmentation, shared standards | — |

---

## Output Structure

```typescript
interface GeneratedScript {
  topics: {
    topicId: string;
    topicLabel: string;
    audienceLevel: string;
    questions: {
      id: string;
      text: string;
      rationale: string;
      priority: 'high' | 'medium' | 'standard';
      // v2 fields (optional)
      exitImpact?: 'Multiple Expander' | 'Valuation Drag' | 'Operational Risk';
      lookoutSignal?: string;
      track?: 'Architecture' | 'Operations' | 'Carve-out' | 'Security';
    }[];
  }[];
  attentionAreas: {
    id: string;
    title: string;
    description: string;
    relevance: 'high' | 'medium' | 'low';
  }[];
  metadata: {
    totalQuestions: number;
    generatedAt: string;
    inputSummary: {
      // v1 fields
      transactionType: string;
      productType: string;
      techArchetype: string;
      headcount: string;
      revenueRange: string;
      growthStage: string;
      companyAge: string;
      geographies: string[];
      // v2 fields
      businessModel: string;
      scaleIntensity: string;
      transformationState: string;
      dataSensitivity: string;
      operatingModel: string;
    };
  };
}
```

---

## Engine Pipeline (v2)

```
1. Filter questions by matchesConditions()
2. Apply archetype pivot (filter cloud-native Qs when on-prem/self-managed)
3. Balance across topics (15-20, min 3 per topic)
4. Group by topic and sort by priority
5. Filter attention areas by matchesConditions()
6. Apply maturity overrides (inject computed areas)
7. Sort areas by relevance (high → medium → low)
8. Return GeneratedScript with 13-field metadata
```

---

## UX Enhancements (v2)

### Analyze Overlay

When the user clicks "Generate", a 2-second overlay with a spinner and "Analyzing Deal Parameters..." text is displayed before rendering results. This is purely cosmetic — the engine runs instantly — but provides a perceived-value pause that reinforces the output's sophistication.

### Exit Impact Badges

v2 questions display colored badges next to the priority badge:
- **Multiple Expander** — green-tinted badge
- **Valuation Drag** — amber/yellow badge
- **Operational Risk** — red-tinted badge

### Lookout Signals

When a v2 question has a `lookoutSignal`, it appears as a distinct paragraph below the question text and above the rationale. Provides specific, observable indicators that suggest elevated risk. Styled with a warning indicator.

### Methodology Section

A static methodology section appears in the output after the attention areas, explaining the deterministic question-selection approach. Included in both screen and print output.

---

## State Management

- Wizard state (current step, selections) persists to `localStorage` under key `diligence-machine-state`
- **State version**: `STORAGE_VERSION = 2` — v1 state is discarded on load (version mismatch triggers reset)
- State restores on page reload, including compound field selections, geography multi-select, and all v2 single-select steps
- Restart clears localStorage and resets all UI state
- `highestStepReached` is tracked to allow revisiting completed steps via progress bar clicks

---

## Test Coverage

| Test File | Tests | Purpose |
|-----------|-------|---------|
| `tests/unit/diligence-engine.test.ts` | Engine logic | `matchesConditions()`, `meetsMinimumBracket()`, `sortByPriority()`, `balanceAcrossTopics()`, `groupByTopic()`, `generateScript()`, `syncMultiRegion()`, `applyArchetypePivot()`, `applyMaturityOverrides()`, v2 condition dimensions |
| `tests/unit/diligence-questions.test.ts` | Data validation | Question/area structure, ID formats, condition validity against wizard options, v2 metadata validation, wizard config integrity |
| `tests/integration/diligence-wizard-navigation.test.ts` | Navigation | 10-step progress bar, forward/back/segment clicks, state persistence, edge cases |

**Total**: 409 tests passing (all 3 files combined with broader test suite)

---

## Key Files

| File | Purpose |
|------|---------|
| `src/pages/hub/tools/diligence-machine/index.astro` | Page component, 10-step wizard UI, output rendering (incl. exitImpact badges, lookoutSignal), analyze overlay, methodology section, print styles |
| `src/utils/diligence-engine.ts` | Core engine: `generateScript()`, `matchesConditions()`, `balanceAcrossTopics()`, `applyArchetypePivot()`, `applyMaturityOverrides()`, `syncMultiRegion()` |
| `src/data/diligence-machine/wizard-config.ts` | 10 step definitions, option labels, `BRACKET_ORDER`, `getOptionLabel()` helper |
| `src/data/diligence-machine/questions.ts` | Question bank (~68 questions) with conditions, priorities, and v2 metadata |
| `src/data/diligence-machine/attention-areas.ts` | Attention area definitions (23 areas) with conditions and relevance |

---

## v1 Design Reference

The v1 design established the core architecture that v2 extends:

- **5-step wizard**: Transaction type → Product type → Tech archetype → Company profile → Geography
- **~45 questions** across 4 topics with priority-weighted selection
- **18 attention areas** filtered by the same condition system
- **9 condition dimensions** (transactionTypes, productTypes, techArchetypes, growthStages, geographies, headcountMin, revenueMin, companyAgeMin, excludeTransactionTypes)
- **Simple pipeline**: Filter → Balance → Group → Sort areas
- **State version 1** (no highestStepReached tracking, no v2 inputs)

All v1 questions, attention areas, and conditions remain in the codebase unchanged. v2 is purely additive.
