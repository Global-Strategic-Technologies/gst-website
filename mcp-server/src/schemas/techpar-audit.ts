/**
 * BL-045 PR B Phase 2 — calibration audit for `compute_techpar`.
 *
 * **Why this exists**: the v5 SanFran run (2026-06-02) demonstrated that
 * the `generate_diligence_agenda` + `estimate_tech_debt_cost` audit
 * refinements correctly forced model corrections (CAD→USD, scope,
 * dataSensitivity bucket, MTTR-null) — but `compute_techpar` was still
 * called with ad-hoc judgments. Specifically the model:
 *
 *   - Converted CAD to USD without declaring rate or basis ("ARR ~$31.5M CAD
 *     → ~$23M USD"), no provenance footer.
 *   - Annualized R&D OpEx from a YTD figure without declaring the YTD
 *     period ("$2.42M YTD ... I'll annualize conservatively"), and the
 *     annualization shifted across runs (v2: ×4 → $9.68M; v3: ×1.2 →
 *     $2.9M; v5: ad-hoc → $3.2M). Same fixture, different judgment, swung
 *     TechPar from "Above" (R&D 31% of ARR) to "Healthy" (R&D 9.1%) to
 *     "Healthy ahead" (R&D 13.9%) — a partner-misleading shift driven by
 *     a model-judgment input no audit caught.
 *   - Hosting numbers carved from a COGS-non-headcount envelope without
 *     declaring whether the figure was hosting-only or hosting+other.
 *
 * Per CLAUDE.md § 4a (no deferred tech debt), this is addressed NOW, not
 * tracked. The same `_audit` pattern as `generate_diligence_agenda` /
 * `estimate_tech_debt_cost` applies.
 *
 * **What this module enforces**:
 *
 *   1. Single declared `monetaryBasis.currency` for all monetary inputs.
 *      If non-USD, `conversionRate` is REQUIRED. The handler cross-checks
 *      that all inputs share the same currency basis (otherwise %-of-ARR
 *      calculations are non-sensical).
 *
 *   2. Per-monetary-field `annualizationSource` enum + a citation regex
 *      identical to the diligence audit. Values:
 *        - `irl-annualized-stated` — IRL gave an annualized number
 *        - `monthly-x12` — model multiplied a monthly figure by 12
 *        - `ytd-annualized-with-period` — model annualized from YTD;
 *          REQUIRES `ytdMonths` declaration (1-11). Without this, the
 *          model's annualization assumption was invisible — exactly the
 *          v2/v3/v5 divergence root cause.
 *        - `estimated-from-headcount` — derived from team × salary
 *        - `estimated-from-anchor` — other estimation; cite the anchor
 *
 *   3. Mode consistency: `mode='quick'` requires no audit for
 *      engCost/prodCost/toolingCost (those are ignored by the engine in
 *      quick mode); `mode='deepdive'` requires them.
 *
 * Cross-checks live in the handler body (same SDK-shape constraint as
 * the diligence audit — see schemas/diligence-audit.ts module JSDoc).
 *
 * See: mcp-server/src/docs/prompts/irl-ingestion.md § Server-side enforcement
 */

import { z } from 'zod';
import { TechParMcpInputsSchema } from '../schemas';

// ─── Enums ──────────────────────────────────────────────────────────────

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

const annualizationSourceEnum = z.enum([
  'irl-annualized-stated',
  'monthly-x12',
  'ytd-annualized-with-period',
  'estimated-from-headcount',
  'estimated-from-anchor',
]);

// ─── Citation shape (same as diligence-audit) ──────────────────────────

const citationSchema = z
  .string()
  .regex(
    /^Section (\d{2}|--)[^—]*—.{20,}$/,
    'Citation must match the form "Section NN — <substantial excerpt of at least 20 characters>".'
  );

// ─── Per-field audit ────────────────────────────────────────────────────

/**
 * Phase 2A arithmetic-consistency check for YTD-annualized fields.
 *
 * **Why this exists**: the v6 SanFran run (2026-06-02) showed the
 * audit forces `ytdMonths` declaration but doesn't enforce the period is
 * correct. Model declared `ytdMonths: 4` for SanFran's Apr-2026 board
 * view (assumed calendar fiscal Jan-Apr), but the IRL's recurring-revenue
 * math (`$2.64M/mo × 3 = $7.92M ≈ $7.86M YTD stated`) implies 3 months.
 * Result: TechPar landed at 38.8% "Healthy" when the math-correct
 * ytdMonths=3 puts it at ~46% "Above" — a partner-misleading inversion.
 *
 * **The fix**: when the model declares `ytd-annualized-with-period`, it
 * must ALSO declare a `ytdMathCheck` object carrying the IRL anchors the
 * YTD claim should reconcile against. The handler computes
 * `monthlyAnchor × ytdMonths` and rejects if the result diverges from the
 * IRL-stated YTD by more than 10%. The model can lie about citations
 * (residual fabrication risk — addressed separately by the spec § M6
 * `validate_irl_provenance` tool); it cannot lie about arithmetic that
 * the handler verifies.
 */
const ytdMathCheckSchema = z.object({
  monthlyAnchorAmount: z
    .number()
    .positive()
    .describe(
      'The monthly anchor figure from the IRL that the YTD-annualization should reconcile against (e.g., recurring revenue per month for ARR, hosting per month for infraHostingAnnual). The handler does monthlyAnchorAmount × ytdMonths and compares to ytdActualReportedAmount.'
    ),
  monthlyAnchorCitation: citationSchema.describe(
    'IRL citation for the monthly anchor (e.g., Section 00 row 10: recurring revenue $2.64M CAD/mo Apr-2026).'
  ),
  ytdActualReportedAmount: z
    .number()
    .positive()
    .describe(
      'The YTD figure the IRL actually reports (e.g., $7.86M YTD recurring). Must be in the SAME currency as monthlyAnchorAmount; handler does not auto-convert.'
    ),
  ytdActualReportedCitation: citationSchema.describe(
    'IRL citation for the reported YTD figure (e.g., Section 00 row 10: $7.86M YTD FY27 recurring).'
  ),
});

export type YtdMathCheck = z.infer<typeof ytdMathCheckSchema>;

const monetaryFieldAuditSchema = z.object({
  annualizationSource: annualizationSourceEnum.describe(
    'How was this annual figure derived? Per the fabrication guard, ad-hoc annualization is not allowed; the source must be one of the named patterns.'
  ),
  ytdMonths: z
    .number()
    .int()
    .min(1)
    .max(11)
    .optional()
    .describe(
      'Required when annualizationSource = "ytd-annualized-with-period". The number of months of YTD actuals (1-11) that were extrapolated to a full year. Example: $2.42M FY27 YTD with YTD through Apr (after Jan/Feb/Mar/Apr) = 4 months. The handler rejects ytd-annualized-with-period without ytdMonths.'
    ),
  ytdMathCheck: ytdMathCheckSchema
    .optional()
    .describe(
      'Phase 2A arithmetic consistency check. Required when annualizationSource = "ytd-annualized-with-period". Supply the IRL\'s monthly anchor + reported YTD; the handler verifies monthlyAnchor × ytdMonths matches the reported YTD within 10%, catching wrong-period declarations before they cascade into a partner-misleading dossier number.'
    ),
  citation: citationSchema.describe(
    'IRL provenance citation. Form: "Section NN — <excerpt>". For partner-supplied form input, use "Section -- — partner-supplied form input — <field>".'
  ),
});

// ─── Top-level audit ────────────────────────────────────────────────────

export const TechParAuditMetadataSchema = z
  .object({
    monetaryBasis: z
      .object({
        currency: nativeCurrencyEnum.describe(
          "The currency ALL monetary inputs (arr, infraHostingAnnual, infraPersonnel, rdOpEx, rdCapEx, and deepdive sub-fields) are denominated in. The engine's percentage calculations are internally consistent within a single currency; mixing currencies produces meaningless ratios. If the IRL is in a non-USD currency, declare it here and supply conversionRate so the partner can interpret."
        ),
        conversionRate: z
          .number()
          .positive()
          .optional()
          .describe(
            'USD conversion rate for the declared currency (e.g., 0.73 for CAD → USD). REQUIRED when currency != USD. Approximate is fine; the partner can refine in-Hub.'
          ),
        citation: citationSchema.describe(
          'Citation for the currency declaration (where in the IRL or partner input the currency was identified).'
        ),
      })
      .describe(
        'Single source of truth for the currency basis of ALL monetary inputs. Cross-checked in the handler.'
      ),
    arr: monetaryFieldAuditSchema,
    infraHostingAnnual: monetaryFieldAuditSchema,
    infraPersonnel: monetaryFieldAuditSchema,
    rdOpEx: monetaryFieldAuditSchema,
    rdCapEx: monetaryFieldAuditSchema,
    // These three describe strings state the OPPOSITE requiredness of the
    // top-level `engCost`/`prodCost`/`toolingCost` inputs, which are plain
    // required numbers (see `src/schemas/techpar.ts`). That is correct and
    // deliberate — but read out of context it looks like a contradiction, and
    // in BL-119 cycle 4 a tester read these strings as applying to the
    // top-level fields and filed the mismatch as a documentation defect. Each
    // one now names the field it governs.
    engCost: monetaryFieldAuditSchema
      .optional()
      .describe(
        'Audit provenance for `_audit.engCost` — NOT the top-level `engCost` input, which is required in both modes. Required when mode = "deepdive". Omit for "quick" mode, which rejects it.'
      ),
    prodCost: monetaryFieldAuditSchema
      .optional()
      .describe(
        'Audit provenance for `_audit.prodCost` — NOT the top-level `prodCost` input, which is required in both modes. Required when mode = "deepdive". Omit for "quick" mode, which rejects it.'
      ),
    toolingCost: monetaryFieldAuditSchema
      .optional()
      .describe(
        'Audit provenance for `_audit.toolingCost` — NOT the top-level `toolingCost` input, which is required in both modes. Required when mode = "deepdive". Omit for "quick" mode, which rejects it.'
      ),
  })
  .describe(
    'Calibration audit metadata for compute_techpar. Enforces currency-basis declaration + per-monetary-field annualization provenance.'
  );

/**
 * Audited input schema. Extends the base TechParMcpInputsSchema with the
 * required `_audit` sibling. Plain ZodObject (no .superRefine) so MCP SDK's
 * normalizeObjectSchema publishes the correct JSON Schema to clients.
 */
export const AuditedTechParInputsSchema = TechParMcpInputsSchema.extend({
  _audit: TechParAuditMetadataSchema,
});

export type AuditedTechParInputs = z.infer<typeof AuditedTechParInputsSchema>;
export type TechParAuditMetadata = z.infer<typeof TechParAuditMetadataSchema>;

// ─── Cross-field refinement runner ──────────────────────────────────────

export interface TechParAuditIssue {
  path: string[];
  message: string;
  ruleId: string;
}

export function runTechParAuditRefinements(payload: AuditedTechParInputs): TechParAuditIssue[] {
  const issues: TechParAuditIssue[] = [];
  const audit = payload._audit;

  // ─── 1. Currency conversion required when non-USD ────────────────
  if (audit.monetaryBasis.currency !== 'USD' && !audit.monetaryBasis.conversionRate) {
    issues.push({
      path: ['_audit', 'monetaryBasis', 'conversionRate'],
      ruleId: 'BL-045-TECHPAR-CURRENCY-CONVERSION-REQUIRED',
      message:
        `_audit.monetaryBasis.currency = "${audit.monetaryBasis.currency}" but conversionRate was not supplied. ` +
        `Per the currency-normalization rule (extended to TechPar in Phase 2), non-USD inputs MUST carry a conversionRate so the partner can interpret the engine's dollar outputs. ` +
        `Supply conversionRate (e.g., 0.73 for CAD → USD).`,
    });
  }

  // ─── 2. YTD annualization requires ytdMonths declaration ─────────
  const monetaryFields = [
    ['arr', audit.arr],
    ['infraHostingAnnual', audit.infraHostingAnnual],
    ['infraPersonnel', audit.infraPersonnel],
    ['rdOpEx', audit.rdOpEx],
    ['rdCapEx', audit.rdCapEx],
  ] as const;

  for (const [fieldName, fieldAudit] of monetaryFields) {
    if (
      fieldAudit.annualizationSource === 'ytd-annualized-with-period' &&
      fieldAudit.ytdMonths === undefined
    ) {
      issues.push({
        path: ['_audit', fieldName, 'ytdMonths'],
        ruleId: 'BL-045-TECHPAR-YTD-MONTHS-REQUIRED',
        message:
          `_audit.${fieldName}.annualizationSource = "ytd-annualized-with-period" but ytdMonths was not supplied. ` +
          `Per the anti-fabrication guard, ad-hoc YTD annualization (where the period is implicit in the model's judgment) is the root cause of the cross-run swings observed for compute_techpar inputs. ` +
          `Supply ytdMonths (1-11) so the annualization is auditable.`,
      });
    }
    // Phase 2A: ytdMathCheck required + arithmetic consistency
    if (fieldAudit.annualizationSource === 'ytd-annualized-with-period') {
      if (!fieldAudit.ytdMathCheck) {
        issues.push({
          path: ['_audit', fieldName, 'ytdMathCheck'],
          ruleId: 'BL-045-TECHPAR-YTD-MATH-CHECK-REQUIRED',
          message:
            `_audit.${fieldName}.annualizationSource = "ytd-annualized-with-period" but ytdMathCheck was not supplied. ` +
            `Per Phase 2A, the ytdMonths declaration MUST be cross-validated against an IRL anchor. Supply ytdMathCheck: { monthlyAnchorAmount, monthlyAnchorCitation, ytdActualReportedAmount, ytdActualReportedCitation }. ` +
            `Example for SanFran ARR: { monthlyAnchorAmount: 2640000, monthlyAnchorCitation: "Section 00 row 10 — Recurring $2.64M CAD/mo Apr-2026", ytdActualReportedAmount: 7860000, ytdActualReportedCitation: "Section 00 row 10 — $7.86M YTD FY27 recurring" } — the handler then verifies monthlyAnchor × ytdMonths matches reportedYTD within 10%.`,
        });
      } else if (fieldAudit.ytdMonths !== undefined) {
        const expected = fieldAudit.ytdMathCheck.monthlyAnchorAmount * fieldAudit.ytdMonths;
        const reported = fieldAudit.ytdMathCheck.ytdActualReportedAmount;
        const pctOff = Math.abs(expected - reported) / reported;
        if (pctOff > 0.1) {
          const expectedDisplay = expected.toLocaleString('en-US', { maximumFractionDigits: 0 });
          const reportedDisplay = reported.toLocaleString('en-US', { maximumFractionDigits: 0 });
          const pctDisplay = (pctOff * 100).toFixed(1);
          // Compute a hint: what ytdMonths value would make the math balance within 10%?
          const hintMonths = Math.round(reported / fieldAudit.ytdMathCheck.monthlyAnchorAmount);
          issues.push({
            path: ['_audit', fieldName, 'ytdMonths'],
            ruleId: 'BL-045-TECHPAR-YTD-ARITHMETIC-INCONSISTENT',
            message:
              `_audit.${fieldName}.ytdMonths = ${fieldAudit.ytdMonths} is INCONSISTENT with the supplied ytdMathCheck anchors. ` +
              `Math: monthlyAnchorAmount (${fieldAudit.ytdMathCheck.monthlyAnchorAmount.toLocaleString('en-US')}) × ytdMonths (${fieldAudit.ytdMonths}) = ${expectedDisplay}. ` +
              `But ytdActualReportedAmount = ${reportedDisplay} (${pctDisplay}% off). ` +
              `Per the Phase 2A arithmetic-consistency rule, the discrepancy must be ≤ 10%. ` +
              `Hint: ytdMonths = ${hintMonths} would balance the math (the IRL's monthly × ${hintMonths} ≈ the reported YTD). ` +
              `Re-check the YTD period — common errors: assuming calendar fiscal year when the company uses a non-calendar fiscal year (e.g., FY27 starting Feb), or confusing "YTD through month N" with "N months elapsed in fiscal year."`,
          });
        }
      }
    }
  }

  // ─── 3. Mode consistency: quick vs deepdive audit fields ─────────
  if (payload.mode === 'deepdive') {
    if (!audit.engCost) {
      issues.push({
        path: ['_audit', 'engCost'],
        ruleId: 'BL-045-TECHPAR-DEEPDIVE-AUDIT-REQUIRED',
        message: `mode = "deepdive" requires _audit.engCost. The engine synthesizes rdOpEx from engCost + prodCost + toolingCost in deepdive mode; each component needs its annualization provenance.`,
      });
    }
    if (!audit.prodCost) {
      issues.push({
        path: ['_audit', 'prodCost'],
        ruleId: 'BL-045-TECHPAR-DEEPDIVE-AUDIT-REQUIRED',
        message: `mode = "deepdive" requires _audit.prodCost.`,
      });
    }
    if (!audit.toolingCost) {
      issues.push({
        path: ['_audit', 'toolingCost'],
        ruleId: 'BL-045-TECHPAR-DEEPDIVE-AUDIT-REQUIRED',
        message: `mode = "deepdive" requires _audit.toolingCost.`,
      });
    }
    // Same ytdMonths check for deepdive fields
    const deepdiveFields = [
      ['engCost', audit.engCost],
      ['prodCost', audit.prodCost],
      ['toolingCost', audit.toolingCost],
    ] as const;
    for (const [fieldName, fieldAudit] of deepdiveFields) {
      if (!fieldAudit) continue;
      if (
        fieldAudit.annualizationSource === 'ytd-annualized-with-period' &&
        fieldAudit.ytdMonths === undefined
      ) {
        issues.push({
          path: ['_audit', fieldName, 'ytdMonths'],
          ruleId: 'BL-045-TECHPAR-YTD-MONTHS-REQUIRED',
          message:
            `_audit.${fieldName}.annualizationSource = "ytd-annualized-with-period" but ytdMonths was not supplied. ` +
            `Supply ytdMonths (1-11).`,
        });
      }
      // Phase 2A arithmetic check for deepdive fields too
      if (fieldAudit.annualizationSource === 'ytd-annualized-with-period') {
        if (!fieldAudit.ytdMathCheck) {
          issues.push({
            path: ['_audit', fieldName, 'ytdMathCheck'],
            ruleId: 'BL-045-TECHPAR-YTD-MATH-CHECK-REQUIRED',
            message: `_audit.${fieldName}.annualizationSource = "ytd-annualized-with-period" but ytdMathCheck was not supplied.`,
          });
        } else if (fieldAudit.ytdMonths !== undefined) {
          const expected = fieldAudit.ytdMathCheck.monthlyAnchorAmount * fieldAudit.ytdMonths;
          const reported = fieldAudit.ytdMathCheck.ytdActualReportedAmount;
          const pctOff = Math.abs(expected - reported) / reported;
          if (pctOff > 0.1) {
            const hintMonths = Math.round(reported / fieldAudit.ytdMathCheck.monthlyAnchorAmount);
            issues.push({
              path: ['_audit', fieldName, 'ytdMonths'],
              ruleId: 'BL-045-TECHPAR-YTD-ARITHMETIC-INCONSISTENT',
              message:
                `_audit.${fieldName}.ytdMonths = ${fieldAudit.ytdMonths} is INCONSISTENT with the supplied ytdMathCheck anchors. ` +
                `Math: ${fieldAudit.ytdMathCheck.monthlyAnchorAmount.toLocaleString('en-US')} × ${fieldAudit.ytdMonths} = ${expected.toLocaleString('en-US', { maximumFractionDigits: 0 })} vs reported ${reported.toLocaleString('en-US')} (${(pctOff * 100).toFixed(1)}% off). ` +
                `Hint: ytdMonths = ${hintMonths} would balance the math.`,
            });
          }
        }
      }
    }
  } else {
    // quick mode — sub-fields should NOT be supplied (the engine ignores
    // them; supplying audit metadata for ignored fields would mislead the
    // reviewer).
    if (audit.engCost || audit.prodCost || audit.toolingCost) {
      issues.push({
        path: ['_audit'],
        ruleId: 'BL-045-TECHPAR-QUICK-MODE-AUDIT-OVERSPECIFIED',
        message: `mode = "quick" but _audit.engCost / prodCost / toolingCost was supplied. The engine ignores those inputs in quick mode; audit metadata for ignored inputs is misleading. Either set mode = "deepdive" (then the components are used) or omit the sub-field audits.`,
      });
    }
  }

  return issues;
}

export function formatTechParAuditIssues(issues: TechParAuditIssue[]): string {
  const lines = [
    'TechPar calibration audit FAILED. The tool call was rejected. Fix the following and retry:',
  ];
  for (const issue of issues) {
    lines.push('');
    lines.push(`  [${issue.ruleId}] ${issue.path.join('.')}`);
    lines.push(`    ${issue.message}`);
  }
  lines.push('');
  lines.push(
    'After correcting each issue, retry the tool call with the conformant payload. The TechPar engine produces ratios (percentages of ARR) — those ratios are only meaningful when all monetary inputs share a declared currency basis with auditable annualization.'
  );
  return lines.join('\n');
}

// ─── Helper: Tier-3 partner-supplied audit defaults ────────────────────

/**
 * Build a partner-supplied audit metadata payload for callers that pass
 * TechPar inputs from form fields rather than an IRL. Currency is declared
 * USD (the partner picked USD-denominated inputs from the form);
 * annualizationSource is declared as irl-annualized-stated (we assume the
 * partner picked annual figures from the form).
 *
 * Used by prompts that don't ingest a structured IRL.
 */
export function buildPartnerSuppliedTechParAudit(mode: 'quick' | 'deepdive'): TechParAuditMetadata {
  const baseCitation =
    'Section -- — partner-supplied form input — value sourced from prompt form, no IRL provenance available';
  const baseField = {
    annualizationSource: 'irl-annualized-stated' as const,
    citation: baseCitation,
  };
  const base: TechParAuditMetadata = {
    monetaryBasis: {
      currency: 'USD' as const,
      citation: baseCitation,
    },
    arr: baseField,
    infraHostingAnnual: baseField,
    infraPersonnel: baseField,
    rdOpEx: baseField,
    rdCapEx: baseField,
  };
  if (mode === 'deepdive') {
    base.engCost = baseField;
    base.prodCost = baseField;
    base.toolingCost = baseField;
  }
  return base;
}
