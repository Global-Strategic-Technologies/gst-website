/**
 * BL-045 PR B — Tool-schema enforcement for calibration clauses.
 *
 * **Why this module exists**: three rounds of body-level enforcement
 * (v2/v3/v4) failed to make the model apply BL-045's calibration clauses
 * (currency normalization, headcount scope, dataSensitivity bucket
 * boundaries, growthStage Tier discipline, MTTR-OPEN guard). Empirical
 * evidence over a real client IRL (StoreForce, 2026-06-02) showed the
 * model treats body directives as descriptive context, not as an
 * executable procedure. See the BL-045 design doc § Output structure
 * and the BL-045 review packet § Axis 1.
 *
 * **The forcing function**: tool input-schema rejection at the MCP boundary.
 * The model cannot complete a tool call without producing a conformant
 * payload; calibration clauses that go unfollowed produce a structured
 * tool error that the model retries against. This is the same architectural
 * pattern the BL-032.6 audit recommended (catch extraction errors at the
 * tool seam, not the prompt seam) — v4 evidence makes the case empirically.
 *
 * **Wire shape**: the published JSON Schema in `tools/list` shows the
 * model an `_audit` sibling field next to the 13 diligence dimensions.
 * The model emits both halves of the payload; the tool handler runs the
 * cross-field calibration checks below before invoking the agenda engine.
 *
 * **SDK constraint** (B1/B2 from the impartial audit): the MCP SDK
 * normalizes input schemas via `normalizeObjectSchema` (in
 * `@modelcontextprotocol/sdk/dist/cjs/server/zod-compat.js`), which only
 * recognizes `ZodObject`. A `z.union(...)` or a `.superRefine(...)` wrapper
 * (returning `ZodEffects`) would publish an EMPTY input schema to clients.
 * Therefore: the schema below is a plain `ZodObject`; cross-field checks
 * run in the tool handler body (`runAuditRefinements`), NOT in
 * `.superRefine`. The model still receives a structured error and retries.
 *
 * See: src/docs/development/MCP_SERVER_FILLED_IRL_INGESTION_BL-045_TOOL_SCHEMA_ENFORCEMENT_SPEC.md
 */

import { z } from 'zod';
import { UserInputsSchema } from '../../../src/schemas/diligence';
import {
  REVENUE_RANGE_IDS,
  HEADCOUNT_IDS,
} from '../../../src/data/diligence-machine/wizard-config';

// ─── Audit metadata enums ───────────────────────────────────────────────

const tierEnum = z.enum(['1', '2', '3']);

const nativeCurrencyEnum = z.enum([
  'USD',
  'CAD',
  'EUR',
  'GBP',
  'AUD',
  'JPY',
  'CHF',
  'CNY',
  'INR',
  'BRL',
  'MXN',
  'OTHER',
]);

const headcountScopeEnum = z.enum([
  'engineering-only',
  'engineering-and-product',
  'r-and-d',
  'total-company',
]);

const piiCategoryEnum = z.enum([
  'none',
  'employee-pii',
  'customer-pii-at-scale',
  'financial-transaction-metadata',
  'phi',
  'pci-card-data',
  'government-classified',
  'biometric-at-scale',
]);

const velocityEvidenceEnum = z.enum([
  'revenue-growth-explicit',
  'recurring-revenue-growth-explicit',
  'headcount-growth-explicit',
  'customer-growth-explicit',
  'funding-velocity-explicit',
  'unknown',
]);

// ─── Citation shape ─────────────────────────────────────────────────────

/**
 * Structural shape for IRL provenance citations. Per the v2 audit
 * recommendation (M4): not just `z.string().min(8)` — that's
 * trivially satisfied by `"unknown"`. The regex enforces a citation
 * actually references an IRL section + carries a substantial excerpt.
 *
 * Form: "Section NN ... — <excerpt of at least 20 chars>".
 * The `Section NN` prefix matches the IRL skeleton's section headers
 * (e.g. "Section 00 — Basics"). The em-dash + excerpt forces the model
 * to quote actual IRL content rather than a stub.
 *
 * For partner-supplied-form callers (kickoff, handoff), the form is
 * "Section --: partner-supplied form input — <field description>" with
 * the literal "--" indicating no IRL section.
 */
const citationSchema = z
  .string()
  .regex(
    /^Section (\d{2}|--)[^—]*—.{20,}$/,
    'Citation must match the form "Section NN — <substantial excerpt of at least 20 characters>". For partner-supplied (non-IRL) callers, use "Section -- — partner-supplied form input — <description>".'
  );

// ─── Dimension audit shapes ─────────────────────────────────────────────

const dimensionAuditBaseSchema = z.object({
  tier: tierEnum.describe(
    'Tier 1 = IRL bullet states the enum value verbatim. Tier 2 = direct one-step derivation from a specific IRL bullet. Tier 3 = correlation/vibes; the value MUST be "unknown" when tier is 3.'
  ),
  citation: citationSchema.describe(
    'IRL provenance citation in the form "Section NN — <excerpt>".'
  ),
});

const revenueRangeAuditSchema = dimensionAuditBaseSchema.extend({
  nativeCurrency: nativeCurrencyEnum.describe(
    'Currency of the IRL bullet the value was derived from. If not USD, currencyConversion is required.'
  ),
  currencyConversion: z
    .object({
      nativeAmountMillions: z
        .number()
        .positive()
        .describe('Native amount in millions, e.g. 31 for "$31M CAD".'),
      usdRate: z
        .number()
        .positive()
        .describe(
          'Conversion rate from native to USD, e.g. 0.73 for CAD → USD. Approximate is fine; this is a bracketing aid, not an FX trade.'
        ),
      convertedUsdMillions: z
        .number()
        .positive()
        .describe('Resulting USD amount in millions, e.g. 22.6 for "$22.6M USD".'),
    })
    .optional()
    .describe(
      'Required when nativeCurrency != USD. Per BL-045 currency-normalization rule, non-USD ARR bullets MUST be converted to USD before bracket assignment.'
    ),
});

const headcountAuditSchema = dimensionAuditBaseSchema.extend({
  scope: headcountScopeEnum.describe(
    'Which subset of headcount the value reflects. Per BL-045, the diligence-agenda headcount field requires engineering-only scope.'
  ),
});

const dataSensitivityAuditSchema = dimensionAuditBaseSchema.extend({
  piiCategoriesPresent: z
    .array(piiCategoryEnum)
    .min(1)
    .describe(
      'PII / regulated-data categories the target handles. Drives the dataSensitivity bucket boundary check. Use ["none"] when the target handles no PII at all.'
    ),
});

const growthStageAuditSchema = dimensionAuditBaseSchema.extend({
  velocityEvidence: velocityEvidenceEnum.describe(
    'What explicit velocity signal supports the growthStage value. Per BL-045 Tier discipline, growthStage derives from velocity (revenue/recurring/headcount/customer/funding growth), NOT from transformation-program activity.'
  ),
});

/**
 * The audit metadata sibling field that every diligence-agenda call must
 * carry. Per-dimension provenance + the specific calibration fields the
 * v2/v3/v4 failure modes flagged.
 */
export const AuditMetadataSchema = z
  .object({
    transactionType: dimensionAuditBaseSchema,
    productType: dimensionAuditBaseSchema,
    techArchetype: dimensionAuditBaseSchema,
    headcount: headcountAuditSchema,
    revenueRange: revenueRangeAuditSchema,
    growthStage: growthStageAuditSchema,
    companyAge: dimensionAuditBaseSchema,
    geographies: dimensionAuditBaseSchema,
    businessModel: dimensionAuditBaseSchema,
    scaleIntensity: dimensionAuditBaseSchema,
    transformationState: dimensionAuditBaseSchema,
    dataSensitivity: dataSensitivityAuditSchema,
    operatingModel: dimensionAuditBaseSchema,
  })
  .describe(
    'Per-dimension provenance + calibration metadata. REQUIRED. Drives the tool-handler refinement checks that enforce BL-045 calibration clauses. See spec: MCP_SERVER_FILLED_IRL_INGESTION_BL-045_TOOL_SCHEMA_ENFORCEMENT_SPEC.md'
  );

/**
 * The full audited input schema the diligence tool registers.
 * Plain `ZodObject` (no `.superRefine`, no `z.union`) so MCP SDK's
 * `normalizeObjectSchema` publishes the correct JSON Schema to clients.
 */
export const AuditedUserInputsSchema = UserInputsSchema.extend({
  _audit: AuditMetadataSchema,
});

export type AuditedUserInputs = z.infer<typeof AuditedUserInputsSchema>;
export type AuditMetadata = z.infer<typeof AuditMetadataSchema>;

// ─── Helper: bracket the USD amount ────────────────────────────────────

const REVENUE_BRACKET_THRESHOLDS_MILLIONS = [5, 25, 100] as const;

/**
 * Return the canonical revenueRange bracket for a USD-denominated value.
 * Within 10% of a bracket boundary → returns 'unknown' per BL-045 currency-
 * normalization rule's "prefer 'unknown' to a fragile commitment" clause.
 */
export function bracketForUsdMillions(
  usdMillions: number
): (typeof REVENUE_RANGE_IDS)[number] | 'unknown' {
  if (usdMillions <= 0) return 'unknown';
  // 10% boundary buffer
  for (const boundary of REVENUE_BRACKET_THRESHOLDS_MILLIONS) {
    const lo = boundary * 0.9;
    const hi = boundary * 1.1;
    if (usdMillions >= lo && usdMillions <= hi) return 'unknown';
  }
  if (usdMillions < 5) return '0-5m';
  if (usdMillions < 25) return '5-25m';
  if (usdMillions < 100) return '25-100m';
  return '100m+';
}

// ─── Cross-field refinement runner (handler-body) ──────────────────────

export interface AuditRefinementIssue {
  path: string[];
  message: string;
  ruleId: string;
}

/**
 * Run all BL-045 cross-field calibration checks against an audited input
 * payload. Returns an array of issues; empty array = payload conforms.
 *
 * Why this lives in the handler body and NOT in a `.superRefine`:
 * the SDK's `normalizeObjectSchema` only recognizes plain `ZodObject`s
 * for JSON Schema publication. A `.superRefine`-wrapped schema is
 * `ZodEffects` and publishes empty to clients. See module JSDoc above.
 */
export function runAuditRefinements(payload: AuditedUserInputs): AuditRefinementIssue[] {
  const issues: AuditRefinementIssue[] = [];

  // ─── 1. Currency normalization (BL-045 BLOCKING rule) ────────────
  const rrAudit = payload._audit.revenueRange;
  const rrValue = payload.revenueRange;
  if (rrAudit.nativeCurrency !== 'USD' && !rrAudit.currencyConversion) {
    issues.push({
      path: ['_audit', 'revenueRange', 'currencyConversion'],
      ruleId: 'BL-045-CURRENCY-CONVERSION-REQUIRED',
      message:
        `_audit.revenueRange.nativeCurrency = "${rrAudit.nativeCurrency}" but currencyConversion was not supplied. ` +
        `Per BL-045 currency-normalization rule, non-USD ARR bullets MUST be converted to USD before bracket assignment. ` +
        `Supply currencyConversion: { nativeAmountMillions, usdRate, convertedUsdMillions }. ` +
        `Worked example: "$31M CAD" → { nativeAmountMillions: 31, usdRate: 0.73, convertedUsdMillions: 22.6 } ⇒ revenueRange: "5-25m".`,
    });
  }

  // ─── 2. revenueRange bracket cross-check ─────────────────────────
  if (rrAudit.currencyConversion && rrValue !== 'unknown') {
    const expected = bracketForUsdMillions(rrAudit.currencyConversion.convertedUsdMillions);
    if (expected !== rrValue) {
      if (expected === 'unknown') {
        issues.push({
          path: ['revenueRange'],
          ruleId: 'BL-045-REVENUE-BRACKET-BOUNDARY',
          message:
            `revenueRange = "${rrValue}" but the supplied USD conversion ($${rrAudit.currencyConversion.convertedUsdMillions}M USD) falls within 10% of a bracket boundary. ` +
            `Per BL-045 currency-normalization rule's "prefer 'unknown' to a fragile commitment" clause, set revenueRange = "unknown" and surface the currency / conversion question in (J) gap list.`,
        });
      } else {
        issues.push({
          path: ['revenueRange'],
          ruleId: 'BL-045-REVENUE-BRACKET-MISMATCH',
          message:
            `revenueRange = "${rrValue}" but the supplied USD conversion ($${rrAudit.currencyConversion.convertedUsdMillions}M USD) lands in bracket "${expected}". ` +
            `Re-bracket on the USD amount: ${rrAudit.currencyConversion.convertedUsdMillions}M USD ⇒ "${expected}".`,
        });
      }
    }
  }

  // ─── 3. Headcount scope (BL-045 BLOCKING rule) ───────────────────
  const hcAudit = payload._audit.headcount;
  const hcValue = payload.headcount;
  if (hcValue !== 'unknown' && hcAudit.scope !== 'engineering-only') {
    issues.push({
      path: ['_audit', 'headcount', 'scope'],
      ruleId: 'BL-045-HEADCOUNT-SCOPE-REQUIRED',
      message:
        `_audit.headcount.scope = "${hcAudit.scope}" but BL-045 requires "engineering-only". ` +
        `The diligence-agenda headcount field is ENGINEERING headcount, not total company headcount or R&D+Product. ` +
        `Re-extract from the engineering-specific bullet (e.g. "Engineering ~N"). ` +
        `If the IRL distinguishes "Engineering ~N1" from "R&D + Product ~N2" or "Total HC ~N3", use N1. ` +
        `If the IRL doesn't separate engineering from total, set headcount = "unknown" and scope = "${hcAudit.scope}".`,
    });
  }

  // ─── 4. dataSensitivity bucket cross-check (BL-045 NEW rule) ─────
  const dsAudit = payload._audit.dataSensitivity;
  const dsValue = payload.dataSensitivity;
  const cats = dsAudit.piiCategoriesPresent;
  const highCats = ['phi', 'pci-card-data', 'government-classified', 'biometric-at-scale'];
  const moderateCats = ['customer-pii-at-scale', 'financial-transaction-metadata'];
  const hasHigh = cats.some((c) => highCats.includes(c));
  const hasModerate = cats.some((c) => moderateCats.includes(c));

  if (dsValue === 'high' && !hasHigh) {
    issues.push({
      path: ['dataSensitivity'],
      ruleId: 'BL-045-DATASENSITIVITY-HIGH-REQUIRES-REGULATED',
      message:
        `dataSensitivity = "high" REQUIRES at least one of [phi, pci-card-data, government-classified, biometric-at-scale]. ` +
        `Got piiCategoriesPresent = [${cats.join(', ')}]. ` +
        `Per BL-045 bucket boundaries: employee PII alone is "low"; customer PII at scale is "moderate"; "high" is reserved for regulated categories.`,
    });
  }
  if (dsValue === 'moderate' && !hasModerate && !hasHigh) {
    issues.push({
      path: ['dataSensitivity'],
      ruleId: 'BL-045-DATASENSITIVITY-MODERATE-REQUIRES-CUSTOMER-PII',
      message:
        `dataSensitivity = "moderate" REQUIRES at least one of [customer-pii-at-scale, financial-transaction-metadata]. ` +
        `Got piiCategoriesPresent = [${cats.join(', ')}]. ` +
        `Per BL-045 bucket boundaries: employee PII alone is "low", not "moderate". Re-bucket to "low" or supply a customer-PII evidence category.`,
    });
  }
  if (dsValue === 'low' && hasHigh) {
    issues.push({
      path: ['dataSensitivity'],
      ruleId: 'BL-045-DATASENSITIVITY-LOW-INCOMPATIBLE-WITH-REGULATED',
      message:
        `dataSensitivity = "low" is incompatible with piiCategoriesPresent = [${cats.join(', ')}]. ` +
        `Categories phi, pci-card-data, government-classified, or biometric-at-scale require dataSensitivity = "high".`,
    });
  }

  // ─── 5. growthStage Tier discipline (BL-045 BLOCKING rule) ───────
  const gsAudit = payload._audit.growthStage;
  const gsValue = payload.growthStage;
  if (gsValue !== 'unknown' && gsAudit.velocityEvidence === 'unknown') {
    issues.push({
      path: ['_audit', 'growthStage', 'velocityEvidence'],
      ruleId: 'BL-045-GROWTHSTAGE-VELOCITY-REQUIRED',
      message:
        `growthStage = "${gsValue}" requires velocityEvidence != "unknown". ` +
        `Per BL-045 growthStage Tier-discipline rule, growthStage derives from velocity (revenue/recurring-revenue/headcount/customer/funding growth %), NOT from transformation-program activity. ` +
        `If the IRL doesn't supply explicit velocity signal, set growthStage = "unknown" (Tier 3) rather than inferring from transformation activity.`,
    });
  }

  // ─── 6. Tier-consistency check (M3 from audit) ───────────────────
  // For tier-1 dimensions, the citation excerpt must literally contain the
  // enum value as a substring. (e.g. transactionType=buy-side with tier=1
  // requires "buy-side" to appear in the citation text.)
  // For dimensions whose value is 'unknown', tier must be 3.
  const dims = [
    ['transactionType', payload.transactionType, payload._audit.transactionType],
    ['productType', payload.productType, payload._audit.productType],
    ['techArchetype', payload.techArchetype, payload._audit.techArchetype],
    ['headcount', payload.headcount, payload._audit.headcount],
    ['revenueRange', payload.revenueRange, payload._audit.revenueRange],
    ['growthStage', payload.growthStage, payload._audit.growthStage],
    ['companyAge', payload.companyAge, payload._audit.companyAge],
    ['businessModel', payload.businessModel, payload._audit.businessModel],
    ['scaleIntensity', payload.scaleIntensity, payload._audit.scaleIntensity],
    ['transformationState', payload.transformationState, payload._audit.transformationState],
    ['dataSensitivity', payload.dataSensitivity, payload._audit.dataSensitivity],
    ['operatingModel', payload.operatingModel, payload._audit.operatingModel],
  ] as const;

  for (const [dimName, dimValue, dimAudit] of dims) {
    if (dimValue === 'unknown' && dimAudit.tier !== '3') {
      issues.push({
        path: ['_audit', dimName, 'tier'],
        ruleId: 'BL-045-TIER-3-REQUIRED-FOR-UNKNOWN',
        message:
          `${dimName} = "unknown" requires _audit.${dimName}.tier = "3". ` +
          `Got tier = "${dimAudit.tier}". The "unknown" sentinel is the Tier-3 (correlation/vibes) escape; mark it as such.`,
      });
    }
    if (
      dimAudit.tier === '1' &&
      dimValue !== 'unknown' &&
      !dimAudit.citation.toLowerCase().includes(String(dimValue).toLowerCase())
    ) {
      issues.push({
        path: ['_audit', dimName, 'tier'],
        ruleId: 'BL-045-TIER-1-LITERAL-MISMATCH',
        message:
          `${dimName} = "${dimValue}" with tier = "1" (literal) but the citation does not contain the literal enum value. ` +
          `Tier 1 means the IRL bullet states the enum value verbatim. If the value was derived from a different bullet (e.g. "B2B SaaS multi-year subscription" → "productized-platform"), set tier = "2" instead.`,
      });
    }
  }

  // ─── 7. Geographies dimension is an array; tier-consistency special-case
  const geoAudit = payload._audit.geographies;
  const geoValue = payload.geographies;
  if (geoValue.length === 1 && geoValue[0] === 'unknown' && geoAudit.tier !== '3') {
    issues.push({
      path: ['_audit', 'geographies', 'tier'],
      ruleId: 'BL-045-TIER-3-REQUIRED-FOR-UNKNOWN',
      message: `geographies = ["unknown"] requires _audit.geographies.tier = "3". Got tier = "${geoAudit.tier}".`,
    });
  }

  return issues;
}

/**
 * Format the audit issues as a single string the model can read and act on.
 * Used by tool handlers to render `{ isError: true, content: [{ type: 'text', text: <here> }] }`.
 */
export function formatAuditIssues(issues: AuditRefinementIssue[]): string {
  const lines = [
    'BL-045 calibration audit FAILED. The tool call was rejected. Fix the following issues and retry:',
  ];
  for (const issue of issues) {
    lines.push('');
    lines.push(`  [${issue.ruleId}] ${issue.path.join('.')}`);
    lines.push(`    ${issue.message}`);
  }
  lines.push('');
  lines.push(
    'After correcting each issue, retry the tool call with the conformant payload. ' +
      'See the BL-045 design doc (extraction-rules.ts) for the full calibration rule prose.'
  );
  return lines.join('\n');
}

// Stub uses of imports kept for tree-shaking visibility / explicit dep.
// (These constants are referenced via type-level imports elsewhere; the
// explicit value imports above prevent dead-code elimination of the
// schema constants when the bundle is built.)
void HEADCOUNT_IDS;
void REVENUE_RANGE_IDS;

// ─── Helpers — Tier-3 audit defaults ───────────────────────────────────

/**
 * Build an audit metadata payload that satisfies the schema AND passes
 * cross-field refinements for the given input values.
 *
 * Tier defaults to `'3'` (partner-supplied form input — no IRL provenance).
 * For input values that are `'unknown'`, tier is correctly `'3'`. For
 * non-`'unknown'` values, the helper supplies the dimension-specific
 * metadata that satisfies cross-checks:
 *   - revenueRange: nativeCurrency = USD (so no conversion check fires)
 *   - headcount: scope = engineering-only (so scope check passes)
 *   - dataSensitivity: piiCategoriesPresent matched to the value (so
 *     bucket cross-check passes — e.g., 'high' → ['phi'])
 *   - growthStage: velocityEvidence = revenue-growth-explicit (so
 *     Tier-discipline check passes)
 *
 * For Tier-1 dimensions where the value is non-`'unknown'`, the citation
 * includes the value literally to satisfy the Tier-1 substring check —
 * the helper raises tier to 3 instead to avoid forcing artificial citations.
 *
 * Use cases:
 *   - Engine-pipeline tests that exercise the handler without re-stating
 *     audit metadata per case.
 *   - Prompt callers that don't ingest a structured IRL
 *     (`gst_diligence_kickoff`, `gst_diligence_handoff_memo`): the model
 *     supplies user-form values + Tier-3 audit defaults so the tool call
 *     succeeds. Per the M7 finding of the impartial audit (deferring
 *     non-IRL callers is wrong), both kickoff and handoff supply this
 *     default and explicitly mark each dimension as Tier 3.
 */
type DimsInput = Omit<AuditedUserInputs, '_audit'>;

export function buildPartnerSuppliedAudit(inputs: DimsInput): AuditMetadata {
  const baseCitation =
    'Section -- — partner-supplied form input — value sourced from prompt form, no IRL provenance available';
  const base = { tier: '3' as const, citation: baseCitation };

  // dataSensitivity matched categories — defensible "what the partner
  // implicitly claims when they pick that bucket from a form".
  const dsCategories: AuditMetadata['dataSensitivity']['piiCategoriesPresent'] =
    inputs.dataSensitivity === 'high'
      ? ['phi']
      : inputs.dataSensitivity === 'moderate'
        ? ['customer-pii-at-scale']
        : inputs.dataSensitivity === 'low'
          ? ['employee-pii']
          : ['none'];

  const growthVelocity: AuditMetadata['growthStage']['velocityEvidence'] =
    inputs.growthStage === 'unknown' ? 'unknown' : 'revenue-growth-explicit';

  return {
    transactionType: base,
    productType: base,
    techArchetype: base,
    headcount: { ...base, scope: 'engineering-only' },
    revenueRange: { ...base, nativeCurrency: 'USD' },
    growthStage: { ...base, velocityEvidence: growthVelocity },
    companyAge: base,
    geographies: base,
    businessModel: base,
    scaleIntensity: base,
    transformationState: base,
    dataSensitivity: { ...base, piiCategoriesPresent: dsCategories },
    operatingModel: base,
  };
}
