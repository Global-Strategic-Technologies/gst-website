# Input Contract: `generate_diligence_agenda`

> **Tool**: `generate_diligence_agenda` — generates a prescriptive due-diligence "Inquisitor's Script" for a target M&A or investment opportunity. Wraps the website's pure `generateScript` engine.
>
> **Sources of truth** (the contract cites these; it does not duplicate them):
>
> - **Validation**: [`src/schemas/diligence.ts`](../../../../src/schemas/diligence.ts) — `UserInputsSchema` and the `*_IDS` enum tuples
> - **Labels & per-option descriptions**: [`src/data/diligence-machine/wizard-config.ts`](../../../../src/data/diligence-machine/wizard-config.ts) — `WizardStep` definitions, lines 85–425
> - **Downstream effects**: [`src/utils/diligence-engine.ts`](../../../../src/utils/diligence-engine.ts) — `CONDITION_LABELS` (lines 333-348), `meetsMinimumBracket` (lines 74-87), `BRACKET_ORDER` constant
>
> **Version**: `v1` | **Last authored**: 2026-04-27
>
> **Registry**: see [`../contracts/README.md`](../contracts/README.md) for the "what is an input contract" narrative, the cross-tool registry, and the per-tool spec template this document follows.

---

## Field overview

The 13 inputs the tool accepts. The "Dimension label" column matches the labels emitted by the runtime trigger map (`CONDITION_LABELS`) so the contract and runtime stay aligned by construction.

| Field                 | Type         | Cardinality | Dimension label  |
| --------------------- | ------------ | ----------- | ---------------- |
| `transactionType`     | enum         | single      | Transaction Type |
| `productType`         | enum         | single      | Product Type     |
| `techArchetype`       | enum         | single      | Tech Stack       |
| `headcount`           | ordinal enum | single      | Company Size     |
| `revenueRange`        | ordinal enum | single      | Revenue          |
| `growthStage`         | enum         | single      | Growth Stage     |
| `companyAge`          | ordinal enum | single      | Company Age      |
| `geographies`         | enum array   | **multi**   | Geography        |
| `businessModel`       | enum         | single      | Business Model   |
| `scaleIntensity`      | enum         | single      | Scale Intensity  |
| `transformationState` | enum         | single      | Transformation   |
| `dataSensitivity`     | enum         | single      | Data Sensitivity |
| `operatingModel`      | enum         | single      | Operating Model  |

**All fields required.** No defaults at the engine level; if a field is missing from the payload, Zod rejects the input and the engine never runs.

**Three fields are ordinal** (`headcount`, `revenueRange`, `companyAge`) — questions can gate by _minimum threshold_ via `meetsMinimumBracket()` rather than by exact match. Example: a question with `revenueMin: "5-25m"` surfaces for any user input from `5-25m` upward.

**One field is multi-select** (`geographies`). Selecting two or more specific regions auto-syncs `multi-region` into the array via the engine's `syncMultiRegion()` helper.

---

## Per-field detail

### `transactionType`

- **Display label**: Transaction Type
- **What it asks**: What type of deal is being evaluated?

| ID                     | Label                 | Description                                           |
| ---------------------- | --------------------- | ----------------------------------------------------- |
| `full-acquisition`     | Full Acquisition      | Complete purchase of the target entity                |
| `majority-stake`       | Majority Stake        | Controlling interest with existing ownership retained |
| `business-integration` | Portfolio Integration | Merging operations of two existing entities           |
| `carve-out`            | Carve-out             | Separation of a business unit from a parent company   |
| `venture-series`       | Venture Series A/B    | Growth-stage equity investment round                  |

**Downstream effect**: Gates carve-out / integration questions (`ci-08` through `ci-10` in the carve-out / integration topic). `business-integration` and `majority-stake` surface duplicate-systems and consolidation questions; `carve-out` surfaces separation-readiness probes; `venture-series` typically surfaces fewer integration questions and more growth-stage operational ones.

---

### `productType`

- **Display label**: Product Type
- **What it asks**: What does the target company build or deliver?

| ID                      | Label                                   | Description                                            |
| ----------------------- | --------------------------------------- | ------------------------------------------------------ |
| `b2b-saas`              | B2B SaaS                                | Cloud-hosted software sold to businesses               |
| `b2c-marketplace`       | B2C Marketplace                         | Consumer-facing platform connecting buyers and sellers |
| `on-premise-enterprise` | On-Premise Enterprise                   | Software deployed within customer infrastructure       |
| `deep-tech-ip`          | Deep-Tech / IP                          | Technology driven by proprietary research or patents   |
| `tech-enabled-service`  | Tech-Enabled Business / Service Company | Service delivery augmented by proprietary technology   |

**Downstream effect**: Drives product-shape architecture questions. `b2b-saas` triggers tenancy questions (`arch-03`), retention-driving SLA questions (`arch-12`), and the AI Commodity Risk attention area. `b2c-marketplace` shares the SLA gating but adds different scale concerns. `deep-tech-ip` surfaces IP-handling and licensing questions; `on-premise-enterprise` surfaces deployment-model questions.

---

### `techArchetype`

- **Display label**: Tech Stack Archetype
- **What it asks**: How is the technology infrastructure provisioned?

| ID                    | Label                       | Description                                           |
| --------------------- | --------------------------- | ----------------------------------------------------- |
| `modern-cloud-native` | Modern Cloud Native         | Built on public cloud with containerization and IaC   |
| `hybrid-legacy`       | Hybrid Legacy               | Mix of cloud services and legacy on-premise systems   |
| `self-managed-infra`  | Self-Managed Infrastructure | On-premises servers owned and operated by the company |
| `datacenter-vendor`   | Datacenter Vendor           | Hardware housed in third-party data centers           |

**Downstream effect**: The archetype "pivot" — drives the largest fan-out in the engine's question set. `modern-cloud-native` and `hybrid-legacy` surface IaC maturity questions (`arch-04`); `self-managed-infra` and `datacenter-vendor` surface different operational and cost questions. The pivot also reorders priority within architecture and operations topics via `applyArchetypePivot()`.

---

### `headcount` _(ordinal)_

- **Display label**: Headcount
- **Bracket order** (low → high): `1-50` → `51-200` → `201-500` → `500+`

| ID        | Label     |
| --------- | --------- |
| `1-50`    | 1 – 50    |
| `51-200`  | 51 – 200  |
| `201-500` | 201 – 500 |
| `500+`    | 500+      |

**Downstream effect**: Ordinal — gates questions by minimum threshold via `meetsMinimumBracket('headcount', userValue, requiredMin)`. Examples: `headcountMin: "1-50"` surfaces key-person dependency questions universally (`ops-03`); `headcountMin: "51-200"` adds database scaling headroom questions (`arch-02`). At `201-500+`, organizational-complexity questions surface.

---

### `revenueRange` _(ordinal)_

- **Display label**: Revenue Range
- **Bracket order** (low → high): `0-5m` → `5-25m` → `25-100m` → `100m+`

| ID        | Label        |
| --------- | ------------ |
| `0-5m`    | $0 – $5M     |
| `5-25m`   | $5M – $25M   |
| `25-100m` | $25M – $100M |
| `100m+`   | $100M+       |

**Downstream effect**: Ordinal. `revenueMin: "5-25m"` and above surface DR/RPO/RTO questions (`arch-09`), end-to-end DR test questions (`ops-13`), and the Sensitive Data Breach Liability attention area (when paired with `dataSensitivity: high`). Higher-revenue brackets surface enterprise-tier operational questions.

---

### `growthStage`

- **Display label**: Growth Stage

| ID        | Label   |
| --------- | ------- |
| `early`   | Early   |
| `scaling` | Scaling |
| `mature`  | Mature  |

**Downstream effect**: Combines with other inputs to gate stage-specific questions. `scaling` paired with `dataSensitivity: high` surfaces the Data Classification Maturity Gap attention area. The `applyMaturityOverrides()` helper injects a "Manual Operations Masking" attention area for the specific pattern `revenueMin: 25-100m` + `headcount < 201` + `growthStage: mature` — high-revenue with low headcount at maturity is a reliable signal of unscalable manual processes.

---

### `companyAge` _(ordinal)_

- **Display label**: Company Age
- **Bracket order** (low → high): `under-2yr` → `2-5yr` → `5-10yr` → `10-20yr` → `20yr+`

| ID          | Label         |
| ----------- | ------------- |
| `under-2yr` | Under 2 years |
| `2-5yr`     | 2 – 5 years   |
| `5-10yr`    | 5 – 10 years  |
| `10-20yr`   | 10 – 20 years |
| `20yr+`     | 20+ years     |

**Downstream effect**: Ordinal. `companyAgeMin: "5-10yr"` and above surface technical-debt quantification questions (`ops-05`) — the rationale is that legacy debt compounds invisibly past the 5-year mark. `20yr+` surfaces deeper legacy-system replatforming probes.

---

### `geographies` _(multi-select)_

- **Display label**: Geography
- **Cardinality**: `array`, minimum 1 element.

| ID             | Label          | Description                     |
| -------------- | -------------- | ------------------------------- |
| `us`           | United States  | North American operations       |
| `canada`       | Canada         | Canadian operations             |
| `eu`           | European Union | EU member state operations      |
| `uk`           | United Kingdom | UK operations (post-Brexit)     |
| `latam`        | Latin America  | LATAM regional operations       |
| `africa`       | Africa         | African continent operations    |
| `apac`         | Asia-Pacific   | APAC regional operations        |
| `multi-region` | Multi-Region   | Operations spanning geographies |

**Hidden semantics — multi-region auto-sync**: When the user selects 2+ specific (non-`multi-region`) regions, the engine's `syncMultiRegion()` helper adds `multi-region` to the array. Callers should pass the geographies they know about; the engine fills in `multi-region` deterministically.

**Downstream effect**: `eu` triggers GDPR posture questions (`sec-05`) and EU AI Act conformity questions (`sec-17`). `uk` adds UK-GDPR / ICO posture questions. `canada` triggers the Canadian Privacy Law Complexity attention area (PIPEDA, Quebec Law 25, Alberta, BC). Multi-region selection (auto-synced or explicit) triggers the Cross-Border Data Compliance attention area and certification-transfer questions (`ci-10`).

---

### `businessModel`

- **Display label**: Business Model
- **What it asks**: What is the primary delivery and monetization model?

| ID                       | Label                  | Description                                     |
| ------------------------ | ---------------------- | ----------------------------------------------- |
| `productized-platform`   | Productized Platform   | Self-serve product with platform economics      |
| `customized-deployments` | Customized Deployments | Tailored implementations for each customer      |
| `services-led`           | Services-Led           | Professional services as primary revenue driver |
| `usage-based`            | Usage-Based            | Consumption-based pricing model                 |
| `ip-licensing`           | IP Licensing           | Revenue from intellectual property licensing    |

**Downstream effect**: Drives operational and unit-economics questions. `productized-platform` and `usage-based` surface different scaling concerns from `services-led` and `customized-deployments`. The model interacts with `scaleIntensity` and `productType` to surface the right operational-leverage questions.

---

### `scaleIntensity`

- **Display label**: Scale Intensity
- **What it asks**: What is the operational scale and user volume pressure?

| ID         | Label    | Description                                  |
| ---------- | -------- | -------------------------------------------- |
| `low`      | Low      | Internal tools or small user base            |
| `moderate` | Moderate | Thousands of users with steady growth        |
| `high`     | High     | Millions of users or high transaction volume |

**Downstream effect**: Relatively new dimension (v2 of the wizard); drives infrastructure-pressure questions and capacity-planning concerns. `high` intensity surfaces additional database-scaling and load-testing probes.

---

### `transformationState`

- **Display label**: Transformation State
- **What it asks**: What is the current state of technology modernization?

| ID                     | Label                | Description                                            |
| ---------------------- | -------------------- | ------------------------------------------------------ |
| `stable`               | Stable               | No active modernization; current stack is maintained   |
| `mid-migration`        | Mid-Migration        | Actively transitioning between technology stacks       |
| `actively-modernizing` | Actively Modernizing | Systematic upgrade of architecture and tooling         |
| `recently-modernized`  | Recently Modernized  | Major modernization completed within past 12–18 months |

**Downstream effect**: Gates migration-risk questions and replatforming-state probes. `mid-migration` and `actively-modernizing` surface dual-system reconciliation questions; `recently-modernized` surfaces post-migration debt and rollback questions; `stable` surfaces fewer transformation-specific probes but doesn't gate them off entirely.

---

### `dataSensitivity`

- **Display label**: Data Sensitivity
- **What it asks**: What is the sensitivity level of the data the target handles?

| ID         | Label    | Description                                                   |
| ---------- | -------- | ------------------------------------------------------------- |
| `low`      | Low      | Non-sensitive operational data                                |
| `moderate` | Moderate | Business-sensitive data with standard protection requirements |
| `high`     | High     | PII, PHI, financial data, or regulated data categories        |

**Downstream effect**: When `high`, surfaces the data-classification framework question (`sec-18`) and elevates the Sensitive Data Breach Liability attention area (when paired with `revenueMin: 5-25m+`). Combines with `growthStage: scaling` to surface the Data Classification Maturity Gap attention area. `low` and `moderate` gate these questions and attention areas off.

---

### `operatingModel`

- **Display label**: Operating Model
- **What it asks**: How is the engineering organization structured?

| ID                      | Label                   | Description                                           |
| ----------------------- | ----------------------- | ----------------------------------------------------- |
| `centralized-eng`       | Centralized Engineering | Single engineering org with unified leadership        |
| `product-aligned-teams` | Product-Aligned Teams   | Autonomous squads aligned to product areas            |
| `outsourced-heavy`      | Outsourced-Heavy        | Significant reliance on external development partners |
| `hybrid`                | Hybrid                  | Mix of internal teams and outsourced capabilities     |

**Downstream effect**: Drives org-structure questions about velocity, ownership, and key-person risk. `outsourced-heavy` surfaces vendor-dependency and IP-ownership probes; `product-aligned-teams` surfaces squad-effectiveness and cross-team-coordination questions; `centralized-eng` surfaces leadership-bench-depth probes.

---

## Output shape (for reference)

The tool returns a `GeneratedScript` envelope:

```typescript
{
  topics: Topic[];          // 4 topic groups: architecture, operations, carve-out, security
  attentionAreas: AttentionArea[];  // proactive risk callouts, sorted by relevance
  triggerMap: Record<string, string[]>;  // questionId -> dimension labels (from CONDITION_LABELS)
  metadata: {
    totalQuestions: number;
    generatedAt: string;
    inputSummary: UserInputs;  // echoes back the inputs received
  };
}
```

The `triggerMap`'s dimension labels are sourced from the engine's `CONDITION_LABELS` map — the same labels in the [Field overview](#field-overview) table above. If the runtime output disagrees with this contract, the runtime is canonical.

---

## Related

- [`USAGE.md`](./USAGE.md) — end-to-end walkthrough using this contract for a hypothetical TDD scenario
- [`../contracts/README.md`](../contracts/README.md) — registry of all per-tool input contracts; what an input contract is; the IRL forward-look
- [BL-031 in BACKLOG.md](../../../../src/docs/development/BACKLOG.md#bl-031-mcp-server--internal-prototype-phase-1) — the initiative that ships the underlying tool
- [BL-031.85 in BACKLOG.md](../../../../src/docs/development/BACKLOG.md#bl-03185-mcp-server--tool-input-contracts) — the initiative that ships this contract
- [`MCP_SERVER_CONTRACTS_BL-031_85.md`](../../../../src/docs/development/MCP_SERVER_CONTRACTS_BL-031_85.md) — architecture & design rationale for the contracts pattern
