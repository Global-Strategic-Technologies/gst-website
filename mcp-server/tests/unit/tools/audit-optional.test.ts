/**
 * 0.60.0 — `_audit` is OPTIONAL on the three audit-bearing analysis tools.
 *
 * The trust-the-operator posture (gst_irl_sweep) calls
 * `generate_diligence_agenda` / `compute_techpar` / `estimate_tech_debt_cost`
 * with bare engine inputs and no `_audit` block. This suite pins the
 * three-part contract of that change:
 *
 *   1. A payload WITHOUT `_audit` parses and the handler returns engine
 *      output (no rejection loop).
 *   2. No audit-derived response keys appear when `_audit` is absent
 *      (`monetaryBasis`, `mttrSource`, `incidentsSource`) — the keys are
 *      omitted, not emitted as undefined.
 *   3. A payload WITH `_audit` is still validated — the calibration
 *      refinements run exactly as before when the block is supplied.
 *
 * The wire-level half (tools/list JSON Schema no longer lists `_audit`
 * under `required`) is pinned in
 * `tests/integration/protocol-roundtrip.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { AuditedUserInputsSchema } from '../../../src/schemas/diligence-audit';
import { AuditedTechParInputsSchema } from '../../../src/schemas/techpar-audit';
import { AuditedTechDebtInputsSchema } from '../../../src/schemas/tech-debt-audit';
import { handleDiligenceTool } from '../../../src/tools/diligence';
import { handleTechparTool } from '../../../src/tools/techpar';
import { handleTechDebtTool } from '../../../src/tools/tech-debt';

// ─── Bare payloads (no _audit) ──────────────────────────────────────────

const DILIGENCE_BARE = {
  transactionType: 'unknown',
  productType: 'b2b-saas',
  techArchetype: 'unknown',
  headcount: 'unknown',
  revenueRange: '25-100m',
  growthStage: 'unknown',
  companyAge: 'unknown',
  geographies: ['us', 'eu'],
  businessModel: 'unknown',
  scaleIntensity: 'unknown',
  transformationState: 'unknown',
  dataSensitivity: 'low',
  operatingModel: 'unknown',
} as const;

const TECHPAR_BARE = {
  arr: 27_500_000,
  stage: 'pe',
  mode: 'deepdive',
  capexView: 'gaap',
  growthRate: 10,
  exitMultiple: 12,
  infraHostingAnnual: 3_500_000,
  infraPersonnel: 900_000,
  rdOpEx: 0,
  rdCapEx: 0,
  engFTE: 42,
  engCost: 3_900_000,
  prodCost: 580_000,
  toolingCost: 77_000,
} as const;

const TECH_DEBT_BARE = {
  teamSize: 42,
  salary: 129_000,
  maintenanceBurdenPct: 30,
  deployFrequency: 'Quarterly+',
  incidents: 2,
  mttrHours: 6,
  remediationBudget: 150_000,
  arr: 27_500_000,
  remediationPct: 50,
  contextSwitchOn: true,
} as const;

describe('0.60.0 — _audit is optional (schema layer)', () => {
  it('generate_diligence_agenda parses a bare payload', () => {
    expect(AuditedUserInputsSchema.safeParse(DILIGENCE_BARE).success).toBe(true);
  });

  it('compute_techpar parses a bare payload', () => {
    expect(AuditedTechParInputsSchema.safeParse(TECHPAR_BARE).success).toBe(true);
  });

  it('estimate_tech_debt_cost parses a bare payload', () => {
    expect(AuditedTechDebtInputsSchema.safeParse(TECH_DEBT_BARE).success).toBe(true);
  });
});

describe('0.60.0 — bare handler calls return engine output with no audit-derived keys', () => {
  it('generate_diligence_agenda succeeds without _audit', async () => {
    const parsed = AuditedUserInputsSchema.parse(DILIGENCE_BARE);
    const result = await handleDiligenceTool(parsed);
    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
  });

  it('compute_techpar succeeds without _audit and omits monetaryBasis', async () => {
    const parsed = AuditedTechParInputsSchema.parse(TECHPAR_BARE);
    const result = await handleTechparTool(parsed);
    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
    expect(result.structuredContent).not.toHaveProperty('monetaryBasis');
  });

  it('estimate_tech_debt_cost succeeds without _audit and omits the source keys', async () => {
    const parsed = AuditedTechDebtInputsSchema.parse(TECH_DEBT_BARE);
    const result = await handleTechDebtTool(parsed);
    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
    expect(result.structuredContent).not.toHaveProperty('mttrSource');
    expect(result.structuredContent).not.toHaveProperty('incidentsSource');
  });
});

describe('0.60.0 — a SUPPLIED valid _audit still yields the audit-derived response keys', () => {
  it('estimate_tech_debt_cost returns mttrSource/incidentsSource when a valid _audit is supplied', async () => {
    const parsed = AuditedTechDebtInputsSchema.parse({
      ...TECH_DEBT_BARE,
      _audit: { mttrSource: 'irl-stated', incidentsSource: 'irl-stated' },
    });
    const result = await handleTechDebtTool(parsed);
    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
    const out = result.structuredContent as Record<string, unknown>;
    expect(out.mttrSource).toBe('irl-stated');
    expect(out.incidentsSource).toBe('irl-stated');
  });

  it('compute_techpar returns monetaryBasis when a valid _audit is supplied', async () => {
    const audited = {
      annualizationSource: 'irl-annualized-stated',
      citation: 'Section 00 — figure stated as an annualized amount in the board deck',
    };
    const parsed = AuditedTechParInputsSchema.parse({
      ...TECHPAR_BARE,
      _audit: {
        monetaryBasis: {
          currency: 'USD',
          citation: 'Section 00 — all monetary figures stated in USD in the board deck',
        },
        arr: audited,
        infraHostingAnnual: audited,
        infraPersonnel: audited,
        rdOpEx: audited,
        rdCapEx: audited,
        engCost: audited,
        prodCost: audited,
        toolingCost: audited,
      },
    });
    const result = await handleTechparTool(parsed);
    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
    const out = result.structuredContent as { monetaryBasis?: { currency: string } };
    expect(out.monetaryBasis?.currency).toBe('USD');
  });
});

describe('0.60.0 — a SUPPLIED _audit block is still validated', () => {
  it('estimate_tech_debt_cost still rejects a non-null value under an OPEN source', async () => {
    const parsed = AuditedTechDebtInputsSchema.parse({
      ...TECH_DEBT_BARE,
      _audit: { mttrSource: 'irl-open', incidentsSource: 'irl-stated' },
    });
    const result = await handleTechDebtTool(parsed);
    expect(result.isError).toBe(true);
  });

  it('compute_techpar still rejects a non-USD basis without a conversion rate', async () => {
    const parsed = AuditedTechParInputsSchema.parse({
      ...TECHPAR_BARE,
      mode: 'quick',
      _audit: {
        monetaryBasis: {
          currency: 'CAD',
          citation: 'Section 00 — recurring revenue stated in CAD per the board deck',
        },
        arr: {
          annualizationSource: 'irl-annualized-stated',
          citation: 'Section 00 — ARR stated as an annualized figure in the board deck',
        },
        infraHostingAnnual: {
          annualizationSource: 'irl-annualized-stated',
          citation: 'Section 03 — hosting spend stated annually in the P&L detail',
        },
        infraPersonnel: {
          annualizationSource: 'irl-annualized-stated',
          citation: 'Section 03 — infra personnel cost stated annually in the P&L',
        },
        rdOpEx: {
          annualizationSource: 'irl-annualized-stated',
          citation: 'Section 02 — R&D operating expense stated annually in the P&L',
        },
        rdCapEx: {
          annualizationSource: 'irl-annualized-stated',
          citation: 'Section 03 — no material infrastructure capex flagged in the P&L',
        },
      },
    });
    const result = await handleTechparTool(parsed);
    expect(result.isError).toBe(true);
  });
});
