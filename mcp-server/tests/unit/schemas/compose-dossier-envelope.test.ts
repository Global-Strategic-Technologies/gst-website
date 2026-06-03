/**
 * Unit tests for compose_dossier_envelope (BL-045 PR B forcing-function tightening).
 *
 * Coverage targets:
 *
 * - renderMetaFence: emits a JSON code fence with all 12 fields in the
 *   design-doc-specified order; promptVersion / fillRatioStatus surface
 *   correctly.
 * - renderGapList: empty array → "No gaps surfaced this run."; populated
 *   array → numbered list with category prefixes from the enum.
 * - renderProvenanceFooter: every claim → one line with the verdict
 *   marker; verdict order matches claim order.
 * - runComposeDossierEnvelope: auto-appends provenance-gap entries for
 *   unverified claims; verified + verifiedFuzzy + partnerSupplied claims
 *   do NOT auto-append; counts in provenanceVerification sum correctly.
 * - Re-entrancy: calling the engine twice with the same input is pure.
 */

import { describe, it, expect } from 'vitest';
import {
  type ComposeDossierEnvelopeInput,
  renderGapList,
  renderMetaFence,
  renderProvenanceFooter,
  runComposeDossierEnvelope,
} from '../../../src/schemas/compose-dossier-envelope';

const SAMPLE_IRL = `# IRL — TestCo

## 00 — Basics

- Annual recurring revenue: $45.2M
- Headcount: 187
- Year-over-year growth rate: Revenue 62% YoY; headcount 55% YoY

## 02 — Software Architecture

- Engineering FTE count: 58 total
- Stack: TypeScript Node 22, Python 3.12, Aurora Postgres 15
`;

function baseInput(): ComposeDossierEnvelopeInput {
  return {
    promptName: 'gst_irl_ingestion',
    promptVersion: '0.3.0',
    modelVersion: 'claude-opus-4-7',
    mode: 'full',
    verbosity: 'verbose',
    transactionContext: 'value-creation',
    fillRatio: { percent: 92, substantiveCells: 46, totalCells: 50, status: 'ok' },
    gatesPassed: ['generate_diligence_agenda', 'compute_techpar'],
    gatesElided: [{ tool: 'search_radar', reason: 'credentials not bound', irlSection: '01' }],
    conditionalTriggersFired: ['EU_AI_ACT'],
    forceToolsApplied: [],
    claims: [
      {
        claim: 'ARR ~$45.2M',
        citation: 'Section 00 — Annual recurring revenue: $45.2M',
        tier: '1',
      },
      {
        claim: 'Engineering FTE 58',
        citation: 'Section 02 — Engineering FTE count: 58 total',
        tier: '1',
      },
    ],
    gaps: [
      {
        category: 'gate-elided',
        entry: 'search_radar elided — credentials not bound',
        irlSection: '01',
      },
    ],
    filledIrl: SAMPLE_IRL,
  };
}

describe('renderMetaFence', () => {
  it('emits a JSON code fence with all 12 design-doc fields in order', () => {
    const fence = renderMetaFence(baseInput());
    expect(fence).toMatch(/^```json\n/);
    expect(fence).toMatch(/\n```$/);
    expect(fence).toContain('"promptName": "gst_irl_ingestion"');
    expect(fence).toContain('"promptVersion": "0.3.0"');
    expect(fence).toContain('"modelVersion": "claude-opus-4-7"');
    expect(fence).toContain('"mode": "full"');
    expect(fence).toContain('"verbosity": "verbose"');
    expect(fence).toContain('"transactionContext": "value-creation"');
    expect(fence).toContain('"fixtureFillRatio": 0.92');
    expect(fence).toContain('"fixtureFillRatioStatus": "ok"');
    expect(fence).toContain('"gatesPassed"');
    expect(fence).toContain('"gatesElided"');
    expect(fence).toContain('"conditionalTriggersFired"');
    expect(fence).toContain('"forceToolsApplied"');
  });

  it('round-trips fillRatio.percent as fixtureFillRatio (percent/100)', () => {
    const fence = renderMetaFence({
      ...baseInput(),
      fillRatio: { percent: 35, substantiveCells: 17, totalCells: 50, status: 'partial' },
    });
    expect(fence).toContain('"fixtureFillRatio": 0.35');
    expect(fence).toContain('"fixtureFillRatioStatus": "partial"');
  });
});

describe('renderGapList', () => {
  it('returns the no-gaps sentinel when the array is empty', () => {
    expect(renderGapList([])).toBe('## (J) Gap list\n\n_No gaps surfaced this run._');
  });

  it('numbers entries and prefixes each with the category label', () => {
    const out = renderGapList([
      { category: 'gate-elided', entry: 'search_radar elided' },
      { category: 'extraction-only', entry: 'MTTR null — Section 04 OPEN' },
      { category: 'map-absent', entry: 'Canada AIDA not in Map' },
    ]);
    expect(out).toContain('1. **gate-elided:** search_radar elided');
    expect(out).toContain('2. **extraction-only:** MTTR null — Section 04 OPEN');
    expect(out).toContain('3. **map-absent:** Canada AIDA not in Map');
  });

  it('appends irlSection and followUp when supplied', () => {
    const out = renderGapList([
      {
        category: 'extraction-only',
        entry: 'MTTR null',
        irlSection: '04',
        followUp: 'Pull 24-month JQL series',
      },
    ]);
    expect(out).toContain('IRL section: 04');
    expect(out).toContain('**Follow-up:** Pull 24-month JQL series');
  });
});

describe('renderProvenanceFooter', () => {
  it('emits one line per claim with the verdict marker', () => {
    const verdicts = [
      { path: 'a', citation: 'x', status: 'verified' as const, matchedSpan: 'x' },
      { path: 'b', citation: 'y', status: 'unverified' as const },
    ];
    const out = renderProvenanceFooter(
      [
        { claim: 'A', citation: 'Section 00 — A excerpt', tier: '1' },
        { claim: 'B', citation: 'Section 01 — B excerpt', tier: '2' },
      ],
      verdicts
    );
    expect(out).toMatch(/^## \(K\) Provenance footer\n\n/);
    expect(out).toContain('- A ← Section 00 — A excerpt (tier 1) [✓ verified]');
    expect(out).toContain('- B ← Section 01 — B excerpt (tier 2) [✗ unverified]');
  });

  it('shows partner-supplied and fuzzy markers correctly', () => {
    const verdicts = [
      { path: 'a', citation: 'x', status: 'partner-supplied' as const },
      { path: 'b', citation: 'y', status: 'verified-fuzzy' as const, matchedSpan: 'run' },
    ];
    const out = renderProvenanceFooter(
      [
        {
          claim: 'partner-form value',
          citation: 'Section -- — partner-supplied form input — n/a',
          tier: '3',
        },
        { claim: 'fuzzy claim', citation: 'Section 02 — Engineering FTE count', tier: '2' },
      ],
      verdicts
    );
    expect(out).toContain('[◇ partner-supplied]');
    expect(out).toContain('[≈ verified (fuzzy)]');
  });
});

describe('runComposeDossierEnvelope — engine', () => {
  it('returns the three markdown blocks + verification + emitInstructions', () => {
    const result = runComposeDossierEnvelope(baseInput());
    expect(result.metaFenceMarkdown).toContain('```json');
    expect(result.gapListMarkdown).toContain('## (J) Gap list');
    expect(result.provenanceFooterMarkdown).toContain('## (K) Provenance footer');
    expect(result.emitInstructions).toContain('TRANSCRIPTION DISCIPLINE');
    expect(result.provenanceVerification.total).toBe(2);
  });

  it('verifies claims whose excerpt is in the IRL', () => {
    const result = runComposeDossierEnvelope(baseInput());
    // Both baseInput claims are verbatim in SAMPLE_IRL.
    expect(
      result.provenanceVerification.verified + result.provenanceVerification.verifiedFuzzy
    ).toBe(2);
    expect(result.provenanceVerification.unverified).toBe(0);
    expect(result.provenanceVerification.autoAppendedGaps).toBe(0);
  });

  it('auto-appends a provenance-gap entry for each unverified claim', () => {
    const input = baseInput();
    input.claims.push({
      claim: 'Fabricated NRR 220%',
      citation: 'Section 00 — Fabricated $128M ARR with 220 yoy growth never tracked',
      tier: '1',
    });
    const result = runComposeDossierEnvelope(input);
    expect(result.provenanceVerification.unverified).toBe(1);
    expect(result.provenanceVerification.autoAppendedGaps).toBe(1);
    expect(result.gapListMarkdown).toContain('**provenance-gap:** Fabricated NRR 220%');
    expect(result.gapListMarkdown).toContain('citation excerpt not found in IRL body');
  });

  it('preserves pre-existing gaps when auto-appending provenance-gap entries', () => {
    const input = baseInput();
    input.gaps.push({
      category: 'currency-assumption',
      entry: 'TechPar run in CAD basis with conversionRate 0.73',
    });
    input.claims.push({
      claim: 'Fabricated detail',
      citation: 'Section 99 — something not in the IRL anywhere at all',
      tier: '1',
    });
    const result = runComposeDossierEnvelope(input);
    // Pre-existing + auto-appended both visible in the rendered list.
    expect(result.gapListMarkdown).toContain('**gate-elided:** search_radar');
    expect(result.gapListMarkdown).toContain('**currency-assumption:** TechPar run in CAD');
    expect(result.gapListMarkdown).toContain('**provenance-gap:** Fabricated detail');
  });

  it('is pure — calling twice with the same input yields identical results', () => {
    const input = baseInput();
    const a = runComposeDossierEnvelope(input);
    const b = runComposeDossierEnvelope(input);
    expect(a).toEqual(b);
  });
});
