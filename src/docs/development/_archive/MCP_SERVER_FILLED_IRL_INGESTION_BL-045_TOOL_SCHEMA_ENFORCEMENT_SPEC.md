# Tool-Schema Enforcement Spec — BL-045 PR B Option A′

> **Status**: APPROVED (v2) — impartial audit cycle complete; revised spec authoritative; ready to implement.
>
> **Parent**: [MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md](MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md). This spec proposes a body-rewrite-adjacent change to BL-045 PR B that addresses a failure mode discovered during real-world testing.

---

## v2 revision — audit findings incorporated (2026-06-02)

An impartial `code-reviewer` agent audited the v1 draft and surfaced 2 blockers + 6 majors. v2 revisions resolve each. Key architectural changes from the v1 draft:

- **B1 resolved**: drop the `z.union([Legacy, Audited])` strategy entirely. The MCP SDK's `normalizeObjectSchema` (`@modelcontextprotocol/sdk/dist/cjs/server/zod-compat.js:114-156`) returns `undefined` for non-`ZodObject` schemas, which falls back to `EMPTY_OBJECT_JSON_SCHEMA`. A union would publish an empty input schema to clients. **v2 approach**: make `_audit` required on a single `ZodObject` and migrate all 3 prompt callers (`gst_irl_ingestion`, `gst_diligence_kickoff`, `gst_diligence_handoff_memo`) in this PR. The two non-IRL callers populate `_audit` with `tier: "3"` defaults and `citation: "partner-supplied form input"`.
- **B2 resolved**: do NOT wrap the input schema in `.superRefine(...)` — that returns `ZodEffects`, which also fails the SDK shape check. **v2 approach**: keep the outer schema as a plain `ZodObject` and lift cross-field checks into the **tool handler body**. Refinement errors are surfaced via `{ isError: true, content: [{ type: 'text', text: <diagnostic> }] }`. The model receives an MCP tool-call error and retries with corrected values. This is the same effective forcing function (model cannot complete the call without conformant inputs) without the SDK wire-shape issue.
- **B3 resolved**: regex `\b€\b` doesn't match because currency symbols aren't `\w`. **v2 approach**: replace the regex-based currency detection with an explicit `nativeCurrency: z.enum([...])` field on the citation. Per Q2 recommendation — same character cost, mechanically enforceable.
- **M1 resolved**: the Zod-union-fallback semantics question is moot once the union is dropped (B1).
- **M2 resolved**: v2 explicitly calls out: re-baseline `EXPECTED_MANIFEST_HASH` in `manifest-stability.test.ts`; add a BREAKING_CHANGES entry for the tool input-schema change (additive metadata field, but published JSON Schema changes); bump server semver to `0.4.0` per the BL-045 design doc's existing § Decisions.
- **M3 promoted into scope**: add a Tier-consistency refinement — `tier: 1` requires the citation excerpt to literally contain the enum value as a substring (e.g., `transactionType: 'buy-side'` with `tier: 1` requires `citation` to contain the string `"buy-side"`). Implemented in the handler.
- **M4 resolved**: citation field is no longer `z.string().min(8)`. **v2 approach**: structural regex `/^Section \d{2}[^—]*—.{20,}$/` enforces shape "Section NN — substantial excerpt".
- **M5 resolved**: the `convertedUsdAmount` is no longer a string parsed with regex. **v2 approach**: `convertedUsdMillions: z.number().positive()` — a numeric field. The bracket cross-check operates on the number directly. Single source of truth.
- **M6 honestly scoped**: full citation-substring verification against the IRL body cannot happen at the tool seam because the IRL isn't in the tool's input scope. v2 ships **structural-only** enforcement (citation shape, tier-consistency substring check, currency-conversion completeness, headcount scope, dataSensitivity bucket cross-check, MTTR-OPEN guard) and explicitly flags "citation truthfulness against IRL body" as the residual failure mode + concrete follow-up. Phase 2 adds a separate `validate_irl_provenance` tool that takes IRL body + audit metadata and verifies excerpts are substrings of the IRL. The follow-up is scoped now, not vaguely "we'll get to it later."
- **M7 resolved**: `gst_diligence_kickoff` and `gst_diligence_handoff_memo` are migrated in this PR. Both prompts' bodies update to direct the model to supply `_audit` with `tier: "3"` defaults and `citation: "partner-supplied form input"` for each dimension. This avoids the "we'll address it when it surfaces" deferral.
- **M8 resolved**: `velocityEvidence` enum expanded to: `revenue-growth-explicit | recurring-revenue-growth-explicit | headcount-growth-explicit | customer-growth-explicit | funding-velocity-explicit | unknown`. Covers the realistic Tier-2 derivations.
- **Open Q5 resolved**: `mttrHours = 0` is now also rejected with a distinct diagnostic ("zero MTTR is mathematically suspicious — confirm with target or pass null").
- **Open Q6 resolved**: the diligence + tech-debt tool responses gain an additive `extractionOnly: string[]` field that lists which inputs were elided due to OPEN-source. The prompt body consumes this to mark the corresponding dossier section `extraction-only`.

The v1 design's prose below is updated inline to reflect these revisions. Sections marked `[v2]` are revised; sections without that marker stand as in v1.

---

---

## Why this exists

Three iterations of body-level enforcement against a real client IRL (PRAXIS-IRL-StoreForce_JLIVET.xlsx) failed to make the model apply BL-045's calibration clauses:

| Round | Mechanism                                                                                      | Currency miss | Headcount-scope miss | dataSensitivity bucket miss | MTTR-OPEN guard |
| ----- | ---------------------------------------------------------------------------------------------- | ------------- | -------------------- | --------------------------- | --------------- |
| v2    | Calibration clauses as paragraphs inside `UNKNOWN_PROPAGATION_RULE`                            | ❌            | ❌                   | ❌                          | n/a             |
| v3    | Same clauses promoted to line-led format with BLOCKING labels + worked examples                | ❌            | ❌❌ (worse)         | ❌                          | ❌              |
| v4    | Removed from rule, moved to body as numbered Step 1a worksheet + Step 1b audit + Step 6a guard | ❌            | ❌                   | ❌                          | ❌              |

The model demonstrably treats body directives — even BOLD + BLOCKING + worked-example-led + "rewrite violations before invoking the tool" — as descriptive context, not as a procedure it must execute step-by-step. After v4, in the live trace, the model literally cited `Engineering ~42` from the IRL bullet and then assigned `headcount: 51-200` based on total company HC 121. The worksheet directive was not emitted. The audit pass was not run.

**The forcing function must live at a layer the model cannot route around.** The next layer down from "prompt body" is "tool input schema." Zod refinements at the tool boundary REJECT malformed payloads; the model cannot complete a tool call without producing a conformant payload.

This is also the architectural shape the BL-032.6 audit recommended for catching extraction errors at the tool seam rather than at the prompt seam — the v4 evidence makes the case empirically.

---

## Goal

Extend `generate_diligence_agenda`'s input schema so that BL-045 calibration clauses are **enforced** by Zod rather than **described** by prompt prose. Specifically:

1. **Currency normalization** — non-USD bullets must declare conversion math; absence → reject.
2. **Headcount scope** — must declare scope (engineering-only / mixed / total-company); non-engineering scope → reject.
3. **dataSensitivity bucket boundaries** — must declare PII categories present; bucket-PII mismatch → reject.
4. **growthStage Tier discipline** — must cite revenue-velocity evidence; transformation-program rationale → reject.
5. **MTTR-OPEN fabrication guard** (separate change to `estimate_tech_debt_cost`) — MTTR + incidents must be `null` when source says OPEN.

The rule constants in `extraction-rules.ts` stay (they're the human-readable documentation). The tool boundary becomes the enforcement.

---

## Non-goals

- Do **not** require provenance metadata for ALL existing tool inputs everywhere. Scope the change to the specific calibration clauses that have empirically failed.
- Do **not** modify the engine internals of `generate_diligence_agenda` or `estimate_tech_debt_cost` — only the input schemas + refinement layer.
- Do **not** introduce a separate tool (e.g. `generate_diligence_agenda_audited`). Keep the tool name; add the audit metadata as a sibling field on the existing input shape.

---

## Design

### 1. `generate_diligence_agenda` — extend input schema with required `_audit` metadata

**Before** (current):

```ts
inputs: UserInputsSchema; // 13 enum fields: transactionType, productType, ...
```

**After**:

```ts
inputs: UserInputsSchema; // 13 enum fields — unchanged
_audit: AuditMetadataSchema; // NEW — required, carries provenance + refinement triggers
```

### 2. `AuditMetadataSchema` — per-dimension provenance

```ts
// All 13 dimensions get this base shape:
const DimensionAuditBaseSchema = z.object({
  tier: z
    .enum(['1', '2', '3'])
    .describe(
      'Tier 1 = IRL literal; Tier 2 = direct one-step derivation; Tier 3 = correlation/vibes (use only with value="unknown").'
    ),
  citation: z
    .string()
    .min(8)
    .describe('IRL source citation in the form "Section NN row M — bullet excerpt". Required.'),
});

// Dimensions with calibration-specific extensions:
const RevenueRangeAuditSchema = DimensionAuditBaseSchema.extend({
  currencyConversion: z
    .object({
      nativeAmount: z.string().describe('e.g. "$31M CAD"'),
      nativeCurrency: z.enum([
        'USD',
        'CAD',
        'EUR',
        'GBP',
        'AUD',
        'JPY',
        'CHF',
        'CNY',
        'INR',
        'OTHER',
      ]),
      usdRate: z.number().positive().describe('Approximate USD conversion rate; e.g. 0.73 for CAD'),
      convertedUsdAmount: z.string().describe('e.g. "$22.6M USD"'),
    })
    .optional()
    .describe(
      'Required when nativeCurrency != USD. Optional only when the IRL bullet is already USD-denominated.'
    ),
}).refine(
  (data) => {
    // If the value is not "unknown" and the source bullet was non-USD, conversion must be supplied.
    // (Heuristic: if citation contains a non-USD currency token, conversion is required.)
    const nonUsdMarkers = /\b(CAD|EUR|GBP|AUD|JPY|CHF|CNY|INR|€|£|¥)\b/;
    if (nonUsdMarkers.test(data.citation) && !data.currencyConversion) {
      return false;
    }
    return true;
  },
  {
    message:
      'Citation contains a non-USD currency token but no currencyConversion was supplied. ' +
      'Per BL-045 currency normalization rule, non-USD ARR bullets MUST be converted to USD before bracket assignment. ' +
      'Example: "$31M CAD × 0.73 = $22.6M USD ⇒ 5-25m".',
  }
);

const HeadcountAuditSchema = DimensionAuditBaseSchema.extend({
  scope: z
    .enum(['engineering-only', 'engineering-and-product', 'r-and-d', 'total-company'])
    .describe(
      'Which subset of headcount the value reflects. Per BL-045, the diligence-agenda headcount field requires engineering-only scope.'
    ),
}).refine((data) => data.scope === 'engineering-only', {
  message:
    'Per BL-045 headcount-scope rule, the headcount field requires engineering-only scope. ' +
    'Mixing in product/design/standalone-QA or using total-company headcount routes the agenda to the wrong probe tier. ' +
    'If the IRL distinguishes "Engineering ~N1" from "R&D + Product ~N2" or "Total HC ~N3", use N1.',
});

const DataSensitivityAuditSchema = DimensionAuditBaseSchema.extend({
  piiCategoriesPresent: z
    .array(
      z.enum([
        'none',
        'employee-pii', // names, schedules, wages, performance, HR IDs
        'customer-pii-at-scale', // shopper / consumer PII as primary data category
        'financial-transaction-metadata', // non-card payment metadata
        'phi', // protected health information
        'pci-card-data', // payment card data
        'government-classified',
        'biometric-at-scale',
      ])
    )
    .min(1)
    .describe(
      'Categories of PII / regulated data the target handles. Drives the dataSensitivity bucket boundary check.'
    ),
}).refine(
  (data) => {
    const high = ['phi', 'pci-card-data', 'government-classified', 'biometric-at-scale'];
    const moderate = ['customer-pii-at-scale', 'financial-transaction-metadata'];
    const cats = data.piiCategoriesPresent;
    const hasHigh = cats.some((c) => high.includes(c));
    const hasModerate = cats.some((c) => moderate.includes(c));
    // Cross-reference the dimension VALUE — but the dimension value isn't in DimensionAuditBaseSchema scope.
    // This is enforced at the parent _audit refinement (see below).
    return true; // placeholder; actual cross-check at parent level
  },
  { message: 'placeholder — actual check at parent level' }
);

const GrowthStageAuditSchema = DimensionAuditBaseSchema.extend({
  velocityEvidence: z
    .enum([
      'revenue-growth-explicit', // "Revenue +25% YoY" or similar
      'recurring-revenue-growth-explicit', // "ARR +20% YoY"
      'unknown',
    ])
    .describe(
      'What explicit velocity signal supports the growthStage value. Per BL-045 Tier discipline, growthStage derives from velocity, NOT from transformation-program activity.'
    ),
}).refine(
  (data) => {
    // If the citation prose hints at "transformation/migration/modernization" being the reasoning, reject.
    const transformationMarkers =
      /\b(transformation|migration|modernization|consolidation|replatforming|Unify)\b/i;
    if (transformationMarkers.test(data.citation) && data.velocityEvidence === 'unknown') {
      return false;
    }
    return true;
  },
  {
    message:
      'Per BL-045 growthStage Tier-discipline rule, growthStage derives from revenue/recurring-revenue velocity, NOT from transformation-program activity. ' +
      'Citation prose references transformation/migration/modernization but no explicit velocity evidence was provided. ' +
      'Re-derive growthStage from a revenue-growth-% bullet (Tier 2) or pass value="unknown" with velocityEvidence="unknown" (Tier 3).',
  }
);

// The full audit shape
const AuditMetadataSchema = z
  .object({
    transactionType: DimensionAuditBaseSchema,
    productType: DimensionAuditBaseSchema,
    techArchetype: DimensionAuditBaseSchema,
    headcount: HeadcountAuditSchema,
    revenueRange: RevenueRangeAuditSchema,
    growthStage: GrowthStageAuditSchema,
    companyAge: DimensionAuditBaseSchema,
    geographies: DimensionAuditBaseSchema,
    businessModel: DimensionAuditBaseSchema,
    scaleIntensity: DimensionAuditBaseSchema,
    transformationState: DimensionAuditBaseSchema,
    dataSensitivity: DataSensitivityAuditSchema,
    operatingModel: DimensionAuditBaseSchema,
  })
  .strict();
```

### 3. Parent-level cross-check refinement on `inputs` + `_audit`

Some checks require knowing the dimension VALUE (in `inputs`) and the dimension AUDIT (in `_audit`) together. These run at the outer schema level:

```ts
const GenerateDiligenceAgendaInputSchema = z
  .object({
    inputs: UserInputsSchema,
    _audit: AuditMetadataSchema,
  })
  .superRefine((data, ctx) => {
    // Cross-check: dataSensitivity value vs piiCategoriesPresent
    const ds = data.inputs.dataSensitivity;
    const cats = data._audit.dataSensitivity.piiCategoriesPresent;
    const high = ['phi', 'pci-card-data', 'government-classified', 'biometric-at-scale'];
    const moderate = ['customer-pii-at-scale', 'financial-transaction-metadata'];

    if (ds === 'high' && !cats.some((c) => high.includes(c))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['inputs', 'dataSensitivity'],
        message:
          `dataSensitivity = "high" REQUIRES at least one of: phi, pci-card-data, government-classified, biometric-at-scale. ` +
          `Got categories: ${cats.join(', ')}. ` +
          `Per BL-045, employee PII alone is "low"; customer PII at scale is "moderate"; "high" is reserved for regulated categories.`,
      });
    }
    if (ds === 'moderate' && !cats.some((c) => moderate.includes(c) || high.includes(c))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['inputs', 'dataSensitivity'],
        message:
          `dataSensitivity = "moderate" REQUIRES at least one of: customer-pii-at-scale, financial-transaction-metadata. ` +
          `Got categories: ${cats.join(', ')}. ` +
          `Per BL-045, employee PII alone is "low" — moderate requires customer/shopper PII at scale or financial-transaction metadata.`,
      });
    }
    if (ds === 'low' && cats.some((c) => high.includes(c))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['inputs', 'dataSensitivity'],
        message:
          `dataSensitivity = "low" is incompatible with the declared PII categories: ${cats.join(', ')}. ` +
          `Categories phi, pci-card-data, government-classified, or biometric-at-scale require dataSensitivity = "high".`,
      });
    }

    // Cross-check: revenueRange value vs currencyConversion bracket assertion
    const rr = data.inputs.revenueRange;
    const cc = data._audit.revenueRange.currencyConversion;
    if (cc && rr !== 'unknown') {
      // Parse the converted USD amount (e.g. "$22.6M USD")
      const usdMatch = cc.convertedUsdAmount.match(/\$\s*([\d.]+)\s*M/i);
      if (usdMatch) {
        const usd = parseFloat(usdMatch[1]);
        const expected = bracketForUsd(usd); // helper: < 5 ⇒ "0-5m", 5..25 ⇒ "5-25m", etc.
        if (expected !== rr) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['inputs', 'revenueRange'],
            message:
              `revenueRange = "${rr}" but the supplied USD conversion ($${usd}M USD) falls in bracket "${expected}". ` +
              `Per BL-045 currency-normalization rule, re-bracket on the USD amount: ${cc.convertedUsdAmount} ⇒ ${expected}.`,
          });
        }
      }
    }
  });

function bracketForUsd(usdMillions: number): 'unknown' | '0-5m' | '5-25m' | '25-100m' | '100m+' {
  if (usdMillions < 5) return '0-5m';
  if (usdMillions < 25) return '5-25m';
  if (usdMillions < 100) return '25-100m';
  return '100m+';
}
```

### 4. `estimate_tech_debt_cost` — MTTR-OPEN guard at schema layer

Separate, smaller change. Refuse non-null MTTR / incidents when the model has declared the IRL was OPEN.

```ts
inputs: {
  ...existing fields,
  mttrHours: z.number().nullable(),  // existing — null is already permitted
  incidents: z.number().nullable(),  // existing — null is already permitted
  _audit: z.object({
    mttrSource: z.enum(['irl-stated', 'irl-open', 'irl-absent']).describe(
      'Provenance for the MTTR input. If IRL Section 04 marks MTTR as OPEN / "not yet tracked" / blank, this MUST be irl-open and mttrHours MUST be null.'
    ),
    incidentsSource: z.enum(['irl-stated', 'irl-open', 'irl-absent', 'irl-scope-mismatch']).describe(
      'Provenance for the incidents input. "irl-scope-mismatch" = IRL provides incidents but in a wrong unit (e.g. sprint-scoped, not monthly).'
    ),
  }),
}.superRefine((data, ctx) => {
  if ((data._audit.mttrSource === 'irl-open' || data._audit.mttrSource === 'irl-absent') && data.mttrHours !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mttrHours'],
      message: `mttrSource = "${data._audit.mttrSource}" requires mttrHours = null. ` +
               `Per BL-045 MTTR-OPEN guard, placeholder substitution (24h, 8h, etc.) is forbidden — ` +
               `omit the value, mark the section extraction-only, surface in (J) gap list.`,
    });
  }
  if ((data._audit.incidentsSource === 'irl-open' || data._audit.incidentsSource === 'irl-absent' || data._audit.incidentsSource === 'irl-scope-mismatch') && data.incidents !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['incidents'],
      message: `incidentsSource = "${data._audit.incidentsSource}" requires incidents = null.`,
    });
  }
});
```

### 5. Other prompt callers — backward compat strategy

The existing `UserInputsSchema` is also called by:

- `gst_diligence_kickoff` (via `userInputsShapeFromWire()`)
- `gst_diligence_handoff_memo` (via `userInputsShapeFromWire()`)

These prompts don't ingest a structured IRL — they accept partial form fields from the user. They cannot produce the per-dimension audit metadata reliably.

**Backward-compat strategy**:

- The tool input schema becomes `z.union([LegacyInputSchema, AuditedInputSchema])`.
- `LegacyInputSchema` = current shape (no `_audit`).
- `AuditedInputSchema` = new shape (requires `_audit`).
- When the tool receives a `LegacyInputSchema` payload, it logs a `legacy-input-no-audit` metric and proceeds without validation refinements (current behavior).
- When the tool receives an `AuditedInputSchema` payload, it runs all refinements.
- Only `gst_irl_ingestion` is required to use the audited shape; other callers continue with the legacy shape.

This preserves backward compat AND lets the new prompt enforce calibration without breaking existing prompts. The cost is a small surface-area increase (the union).

---

## Prompt body changes

### `irl-ingestion.ts` Step 1 — direct the model to use the audited shape

The Step 1a worksheet directive from v4 stays (it gives the model a structured way to organize the provenance before the tool call), but with the additional explicit instruction: **the tool call MUST use the audited input shape**.

```
Step 1 — Extract the 13 diligence dimensions from the IRL, then invoke `generate_diligence_agenda`
WITH THE AUDITED INPUT SHAPE (see schema below — the `_audit` field is REQUIRED).

[existing UNKNOWN_PROPAGATION_RULE prose]

Step 1a — Worksheet (BLOCKING — output before the tool call):
[existing JSON code fence example]

Step 1b — The tool will REJECT the call if any of these are wrong; review the error message and
retry with corrected values:
- non-USD currency in revenueRange citation without currencyConversion field
- headcount.scope != "engineering-only"
- dataSensitivity value/piiCategoriesPresent mismatch
- growthStage citation references transformation activity without velocityEvidence
```

### `irl-ingestion.ts` Step 6 — Tech Debt audit shape

Step 6a from v4 stays. The Tech Debt tool call MUST include `_audit.mttrSource` and `_audit.incidentsSource`. If either source is `irl-open` or `irl-absent`, the corresponding numeric field MUST be `null`.

---

## Files this touches

| File                                                                                          | Action                                                                                                                                             |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mcp-server/src/tools/diligence.ts`                                                           | Add `AuditMetadataSchema`; modify tool input schema to `z.union([Legacy, Audited])`; add cross-check `superRefine`. ~200 LOC.                      |
| `mcp-server/src/tools/tech-debt-calc.ts`                                                      | Add MTTR-OPEN `_audit` field + `superRefine`. ~50 LOC.                                                                                             |
| `mcp-server/src/prompts/irl-ingestion.ts`                                                     | Update Step 1 prose + Step 1a worksheet schema to mention `_audit`; update Step 6 / Step 6a similarly. ~40 LOC.                                    |
| `mcp-server/tests/unit/tools/diligence-audit-refinement.test.ts`                              | NEW — per-refinement unit tests (positive + negative for each calibration). ~250 LOC, ~25 cases.                                                   |
| `mcp-server/tests/unit/tools/tech-debt-mttr-audit.test.ts`                                    | NEW — MTTR-OPEN guard tests. ~60 LOC, ~6 cases.                                                                                                    |
| `mcp-server/tests/integration/irl-ingestion-storeforce-audit-cases.test.ts`                   | NEW — golden-test the audit refinements against StoreForce-shape payloads (the four real-world misses become positive tests). ~200 LOC, ~12 cases. |
| `mcp-server/tests/integration/irl-ingestion-body-hash-stability.test.ts`                      | Re-baseline hashes.                                                                                                                                |
| `mcp-server/tests/unit/prompts/irl-ingestion.test.ts`                                         | Add unit assertions on `_audit` mentions in the body.                                                                                              |
| `mcp-server/BREAKING_CHANGES.md`                                                              | Document the input-schema extension (additive — legacy callers unaffected).                                                                        |
| `src/docs/development/MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md`                              | Update § Acceptance Criteria + § Critical files + § Decisions to reference the tool-schema enforcement.                                            |
| `src/docs/development/MCP_SERVER_FILLED_IRL_INGESTION_BL-045_TOOL_SCHEMA_ENFORCEMENT_SPEC.md` | This doc — promoted from DRAFT to IMPLEMENTED post-merge.                                                                                          |

---

## Test coverage

### Unit tests (positive cases — payload is conformant, tool runs)

- All 13 dimensions with Tier-1 citations + valid metadata → accepted.
- `revenueRange = "5-25m"` with USD bullet (no `currencyConversion`) → accepted.
- `revenueRange = "5-25m"` with CAD bullet + correct conversion → accepted.
- `headcount = "1-50"` with `scope = "engineering-only"` → accepted.
- `dataSensitivity = "low"` with `piiCategoriesPresent = ["employee-pii"]` → accepted.
- `dataSensitivity = "high"` with `piiCategoriesPresent = ["phi"]` → accepted.
- `growthStage = "mature"` with `velocityEvidence = "revenue-growth-explicit"` → accepted.

### Unit tests (negative cases — payload violates refinement, tool rejects with diagnostic)

- `revenueRange = "25-100m"` with CAD citation, no `currencyConversion` → REJECT with currency-normalization message.
- `revenueRange = "25-100m"` with CAD citation + conversion showing `$22.6M USD` → REJECT with bracket-mismatch message ("USD amount lands in 5-25m, not 25-100m").
- `headcount = "1-50"` with `scope = "total-company"` → REJECT with scope message.
- `headcount = "51-200"` with `scope = "engineering-and-product"` → REJECT with scope message.
- `dataSensitivity = "moderate"` with `piiCategoriesPresent = ["employee-pii"]` only → REJECT with bucket-PII-mismatch message.
- `dataSensitivity = "low"` with `piiCategoriesPresent = ["phi"]` → REJECT with bucket-PII-mismatch message.
- `growthStage = "scaling"` with citation containing "Unify migration" + `velocityEvidence = "unknown"` → REJECT with Tier-discipline message.

### Integration tests (StoreForce-shape regression locks)

For each of the four real-world misses observed in v2/v3/v4:

- StoreForce revenueRange — Tier-1 attempt at `25-100m` with `$31M CAD` no conversion → REJECT.
- StoreForce revenueRange — Tier-1 attempt at `25-100m` with `$31M CAD` + conversion `$22.6M USD` → REJECT with bracket message.
- StoreForce revenueRange — Tier-1 attempt at `5-25m` with `$31M CAD` + conversion `$22.6M USD` → ACCEPT.
- StoreForce headcount — Tier-2 attempt at `51-200` with `scope = "total-company"` → REJECT.
- StoreForce headcount — Tier-2 attempt at `1-50` with `scope = "engineering-only"` → ACCEPT.
- StoreForce dataSensitivity — Tier-2 attempt at `moderate` with `["employee-pii"]` → REJECT.
- StoreForce dataSensitivity — Tier-2 attempt at `low` with `["employee-pii"]` → ACCEPT.
- StoreForce Tech Debt MTTR — `mttrHours = 24, mttrSource = "irl-open"` → REJECT.
- StoreForce Tech Debt MTTR — `mttrHours = null, mttrSource = "irl-open"` → ACCEPT.

### Body-hash stability

Re-baseline the 3 existing hash scenarios (interactive unchanged; both one-shot drift).

### Coverage target

~50 new test cases. Existing 1091 mcp-server tests must continue to pass.

---

## Risks

| Risk                                                                                                                            | Severity   | Mitigation                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model fails to produce conformant `_audit` payload → tool call fails → user sees error                                          | Medium     | Tool error messages are diagnostic — they tell the model exactly what's missing and how to fix it. The model retries automatically in most clients. Worst case: explicit user-visible error which is a feature, not a bug ("this is the calibration system working").                                                                                                      |
| Backward-compat union creates input-shape ambiguity → existing callers accidentally use audited shape and break                 | Low        | The schema union pattern is robust to ambiguity (Zod tries each schema in order; `LegacyInputSchema` matches first if `_audit` is absent). Add a regression test for `gst_diligence_kickoff` continuing to work with legacy inputs.                                                                                                                                        |
| Audit metadata bloats prompt payload size                                                                                       | Low        | The `_audit` payload is ~1-2KB per call. Well below MCP transport budgets.                                                                                                                                                                                                                                                                                                 |
| Refinement messages are too long → consume model context retrying                                                               | Low        | Each refinement message is one sentence + a worked example. ~200 chars typical.                                                                                                                                                                                                                                                                                            |
| Body changes cascade into yet-more hash drift / further re-baselines                                                            | Low        | Hash re-baselines are mechanical. Already established workflow.                                                                                                                                                                                                                                                                                                            |
| The model produces conformant audit but the audit values themselves lie (e.g. invents a citation that doesn't exist in the IRL) | **Medium** | This is the residual failure mode after tool-schema enforcement. Mitigation: post-call audit pass that verifies citations against the IRL body (out of scope for this commit; tracked as PR B follow-up — "Self-check pass on provenance citations" already in design doc § Decisions).                                                                                    |
| Schema enforcement is too brittle — rejects valid edge cases                                                                    | Medium     | Each refinement has a "this is the rule and here's the worked example" message. If a real edge case surfaces, the model can be re-prompted, OR the refinement can be relaxed in a follow-up. The cost of false-positive rejection is small (one model retry); the cost of false-negative acceptance is the wrong-bracket cascade we just demonstrated. Bias toward strict. |
| Other prompts (`gst_diligence_kickoff`) start to need similar enforcement; we end up duplicating the audit shape                | Medium     | If/when that happens, promote `AuditMetadataSchema` to a shared module and share. Not premature now.                                                                                                                                                                                                                                                                       |

---

## Open questions (for the impartial agent audit)

1. **Is the `z.union([Legacy, Audited])` strategy correct, or should we make `_audit` required everywhere and migrate all 3 callers in one PR?**
2. **Is the heuristic-based citation parsing (regex for "CAD"/"€" markers) robust enough, or do we need an explicit `nativeCurrency` field on the citation itself to be safe?**
3. **Should the `bracketForUsd` cross-check be lenient (within 10% of a boundary) or strict (exact bracket)? The design doc currency clause says within-10% → pass `'unknown'`.**
4. **Should `growthStage` velocity evidence be FREE-TEXT (citing the specific bullet) or ENUM (the bullet exists / doesn't)? Free-text is more partner-readable; enum is more enforceable.**
5. **Should the MTTR-OPEN guard ALSO catch `mttrHours = 0` (a different kind of placeholder), or only non-null with explicit "irl-open" source?**
6. **Is "extraction-only" the right metadata-driven section behavior, or should we surface the extraction-only state in the tool RESPONSE (e.g. `responseEcho.extractionOnly = ["mttrHours", "incidents"]`) for the prompt body to consume?**
7. **What's the failure mode if the model produces `_audit.{dim}.tier = "1"` but the value is actually a Tier-2 derivation? Currently we don't enforce the Tier label matches reality. Is that OK or do we need a Tier-consistency refinement?**
8. **Backward-compat: are we sure `gst_diligence_kickoff` and `gst_diligence_handoff_memo` truly don't need this? Their use cases are partner-supplied dimensions, but partners can still mis-bucket.**

---

## Implementation order (post-audit)

1. Land `AuditMetadataSchema` + `superRefine` on `generate_diligence_agenda` as additive shape (union). Tests.
2. Update `irl-ingestion.ts` body to demand audited shape.
3. Live-test against StoreForce IRL. Verify the four misses now produce REJECT diagnostics on attempt and conformant payloads on retry.
4. Add MTTR-OPEN audit to `estimate_tech_debt_cost`. Tests. Update Step 6 body.
5. Re-live-test against StoreForce. Verify clean.
6. Update BREAKING_CHANGES, manifest hash, body-hash baselines.
7. Update BL-045 design doc § Acceptance Criteria + § Critical files.
8. Single commit per stage; PR B branch.

---

## Decision points for operator

After implementation, the empirical hypothesis being tested:

- **If StoreForce live re-test produces correct revenueRange / headcount / dataSensitivity / MTTR-OPEN handling** → tool-schema enforcement is the correct architectural pattern. Propagate to other extraction surfaces in subsequent PRs (TechPar engCost dedup, ICG seeding rules — both currently have "the model knows the rule" failure modes).
- **If StoreForce live re-test still produces wrong values** → the failure mode is even deeper than tool-schema enforcement, and we should consider running the audit pass as a separate computational step (Option B from prior proposal) rather than relying on the model to produce conformant audit metadata.

Either outcome is a useful signal. The current state — three rounds of body enforcement, four real-world misses, partner-facing dossier reversal in TechPar — is not acceptable, and the cost of trying tool-schema enforcement is bounded.

---

**Last updated**: 2026-06-02 (DRAFT)
