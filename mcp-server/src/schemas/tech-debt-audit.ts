/**
 * BL-045 PR B — MTTR + incident-count fabrication guard for
 * `estimate_tech_debt_cost`.
 *
 * **The failure mode**: the StoreForce live-runs (v2/v3/v4) showed that
 * when Section 04 of the IRL marks MTTR as OPEN / "not yet tracked" /
 * sprint-scoped-only, the model substitutes a placeholder (24h, 8h, etc.)
 * rather than acknowledging the gap. The engine's linear multiplication
 * (`incidents × mttrHours × hourlyRate`) then produces an unrecoverable
 * false carrying-cost number — every "11% of ARR" or "$X.XM/yr carry"
 * claim downstream rests on the fabrication.
 *
 * **The fix**: schema-level guard. The MTTR and incidents fields become
 * nullable; the model must declare a source ("irl-stated", "irl-open",
 * "irl-absent", "irl-scope-mismatch") and the cross-check refuses
 * non-null values when the source says the IRL didn't supply them.
 * Null values are substituted as 0 inside the engine call, and the
 * tool response surfaces `extractionOnly: ['mttrHours', 'incidents']`
 * so the prompt body can render the Tech Debt section as
 * `extraction-only` and surface the gap in (J).
 *
 * Same SDK-shape constraints as `diligence-audit.ts` apply: the schema
 * is a plain `ZodObject`; the cross-check runs in the handler body.
 *
 * See: src/docs/development/MCP_SERVER_FILLED_IRL_INGESTION_BL-045_TOOL_SCHEMA_ENFORCEMENT_SPEC.md
 */

import { z } from 'zod';
import { TechDebtInputsSchema } from '../../../src/schemas/tech-debt';

const sourceEnum = z.enum(['irl-stated', 'irl-open', 'irl-absent', 'irl-scope-mismatch']);

export const TechDebtAuditMetadataSchema = z
  .object({
    mttrSource: sourceEnum.describe(
      'Provenance for the mttrHours input. "irl-stated" = IRL Section 04 gives an explicit MTTR. "irl-open" = the field is marked OPEN/"not yet tracked"/"n/a"/blank. "irl-absent" = no MTTR row exists. "irl-scope-mismatch" = IRL gives MTTR but in a wrong unit or scope (e.g., per-sprint not per-month). For irl-open/irl-absent/irl-scope-mismatch, mttrHours MUST be null.'
    ),
    incidentsSource: sourceEnum.describe(
      'Provenance for the incidents input. Same enum semantics as mttrSource. For irl-open/irl-absent/irl-scope-mismatch, incidents MUST be null.'
    ),
  })
  .describe(
    'Per the MTTR + incident-count fabrication guard, the model MUST declare the source of mttrHours and incidents. Placeholder substitution (24h, 8h, 2/mo, etc.) for IRL-OPEN fields is rejected at the schema layer.'
  );

/**
 * Audited input schema. Extends the base schema by:
 *   - Allowing mttrHours and incidents to be null (when the IRL doesn't
 *     supply them — the partner audit pass requires the value to be null
 *     in those cases).
 *   - Adding the required _audit sibling.
 *
 * Plain ZodObject (no .superRefine wrapper) so MCP SDK's
 * normalizeObjectSchema publishes the correct JSON Schema to clients.
 */
export const AuditedTechDebtInputsSchema = TechDebtInputsSchema.extend({
  mttrHours: z
    .number()
    .min(0)
    .nullable()
    .describe(
      'Mean time to resolution, hours. NULL when the IRL marks MTTR as OPEN / unfilled / sprint-scoped-only. Per the fabrication guard, placeholder substitution is forbidden; pass null and let the tool elide the field.'
    ),
  incidents: z
    .number()
    .int()
    .min(0)
    .nullable()
    .describe(
      'Production incidents per month (count). NULL when the IRL gives only a sprint-scoped dashboard count or marks the field OPEN. Per the fabrication guard, do NOT extrapolate from a non-monthly count.'
    ),
  _audit: TechDebtAuditMetadataSchema,
});

export type AuditedTechDebtInputs = z.infer<typeof AuditedTechDebtInputsSchema>;
export type TechDebtAuditMetadata = z.infer<typeof TechDebtAuditMetadataSchema>;

// ─── Cross-field refinement runner ──────────────────────────────────────

export interface TechDebtAuditIssue {
  path: string[];
  message: string;
  ruleId: string;
}

const NULL_REQUIRING_SOURCES = ['irl-open', 'irl-absent', 'irl-scope-mismatch'] as const;
type NullRequiringSource = (typeof NULL_REQUIRING_SOURCES)[number];

function requiresNull(source: TechDebtAuditMetadata['mttrSource']): source is NullRequiringSource {
  return (NULL_REQUIRING_SOURCES as readonly string[]).includes(source);
}

export function runTechDebtAuditRefinements(payload: AuditedTechDebtInputs): TechDebtAuditIssue[] {
  const issues: TechDebtAuditIssue[] = [];

  // ─── MTTR null-when-OPEN guard ──────────────────────────────────────
  if (requiresNull(payload._audit.mttrSource) && payload.mttrHours !== null) {
    issues.push({
      path: ['mttrHours'],
      ruleId: 'BL-045-MTTR-NULL-REQUIRED-FOR-OPEN-SOURCE',
      message:
        `_audit.mttrSource = "${payload._audit.mttrSource}" requires mttrHours = null. ` +
        `Got mttrHours = ${payload.mttrHours}. Per the MTTR-OPEN guard, ` +
        `placeholder substitution (24h, 8h, etc.) is forbidden — pass null, mark the section ` +
        `extraction-only, surface in (J) gap list. A fabricated MTTR passes through the engine's ` +
        `linear multiplier and produces an unrecoverable false carrying-cost number.`,
    });
  }

  // ─── MTTR = 0 placeholder catch (Q5 from audit) ────────────────────
  if (payload._audit.mttrSource === 'irl-stated' && payload.mttrHours === 0) {
    issues.push({
      path: ['mttrHours'],
      ruleId: 'BL-045-MTTR-ZERO-SUSPICIOUS',
      message:
        `mttrHours = 0 with mttrSource = "irl-stated" is mathematically suspicious — ` +
        `incident-cost is computed as incidents × mttrHours × hourlyRate, so zero MTTR ` +
        `produces zero incident cost regardless of incident count. ` +
        `Either confirm the IRL explicitly states "MTTR: 0h" (rare; near-instant rollback architectures) ` +
        `or set mttrSource = "irl-open" / "irl-absent" and mttrHours = null.`,
    });
  }

  // ─── Incidents null-when-OPEN guard ────────────────────────────────
  if (requiresNull(payload._audit.incidentsSource) && payload.incidents !== null) {
    issues.push({
      path: ['incidents'],
      ruleId: 'BL-045-INCIDENTS-NULL-REQUIRED-FOR-OPEN-SOURCE',
      message:
        `_audit.incidentsSource = "${payload._audit.incidentsSource}" requires incidents = null. ` +
        `Got incidents = ${payload.incidents}. Per the fabrication guard, do NOT extrapolate ` +
        `from a sprint-scoped dashboard or substitute a placeholder; pass null, mark the section ` +
        `extraction-only, surface in (J) with the concrete JQL/data-pull needed.`,
    });
  }

  return issues;
}

export function formatTechDebtAuditIssues(issues: TechDebtAuditIssue[]): string {
  const lines = [
    'Tech Debt calibration audit FAILED. The tool call was rejected. Fix the following and retry:',
  ];
  for (const issue of issues) {
    lines.push('');
    lines.push(`  [${issue.ruleId}] ${issue.path.join('.')}`);
    lines.push(`    ${issue.message}`);
  }
  lines.push('');
  lines.push(
    'After correcting each issue, retry the tool call with the conformant payload. ' +
      'For OPEN-source fields, pass the numeric field as null — the tool will elide it from the engine ' +
      'computation and surface extractionOnly in the response so the dossier section is correctly ' +
      'marked extraction-only.'
  );
  return lines.join('\n');
}
