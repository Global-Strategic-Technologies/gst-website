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
  ComposeDossierEnvelopeInputSchema,
  IrlBodyHashMismatchError,
  computeIrlBodyHash,
  renderGapList,
  renderMetaFence,
  renderProvenanceFooter,
  runComposeDossierEnvelope,
} from '../../../src/schemas/compose-dossier-envelope';

const SERVER_CTX = { promptVersion: '0.4.0' };

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
    promptVersion: '0.4.0',
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
    irlBodyHash: computeIrlBodyHash(SAMPLE_IRL),
  };
}

describe('renderMetaFence', () => {
  it('emits a JSON code fence with all 12 design-doc fields in order', () => {
    const fence = renderMetaFence(baseInput(), SERVER_CTX.promptVersion);
    expect(fence).toMatch(/^```json\n/);
    expect(fence).toMatch(/\n```$/);
    expect(fence).toContain('"promptName": "gst_irl_ingestion"');
    expect(fence).toContain('"promptVersion": "0.4.0"');
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

  // BL-045 PR B audit BL-1: server-derived promptVersion ignores whatever
  // the model passed. v10 trace had promptVersion=0.0.2 (hallucinated);
  // the meta fence now always reflects the canonical server value.
  it('uses the server-derived promptVersion regardless of model input', () => {
    const input = baseInput();
    input.promptVersion = '99.99.99'; // hallucinated by model
    const fence = renderMetaFence(input, '0.4.0');
    expect(fence).toContain('"promptVersion": "0.4.0"');
    expect(fence).not.toContain('99.99.99');
  });

  // BL-045 PR B audit MI-1: deterministic key order is part of the source.
  it('emits keys in the fixed order (deterministic for audit comparisons)', () => {
    const fence = renderMetaFence(baseInput(), SERVER_CTX.promptVersion);
    const expectedKeys = [
      'promptName',
      'promptVersion',
      'modelVersion',
      'mode',
      'verbosity',
      'transactionContext',
      'fixtureFillRatio',
      'fixtureFillRatioStatus',
      'gatesPassed',
      'gatesElided',
      'conditionalTriggersFired',
      'forceToolsApplied',
    ];
    const positions = expectedKeys.map((k) => fence.indexOf(`"${k}":`));
    // Every key present.
    for (let i = 0; i < positions.length; i++) {
      expect(positions[i], `key missing: ${expectedKeys[i]}`).toBeGreaterThan(-1);
    }
    // Strictly increasing positions = ordered correctly.
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  it('round-trips fillRatio.percent as fixtureFillRatio (percent/100)', () => {
    const fence = renderMetaFence(
      {
        ...baseInput(),
        fillRatio: { percent: 35, substantiveCells: 17, totalCells: 50, status: 'partial' },
      },
      SERVER_CTX.promptVersion
    );
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
    const result = runComposeDossierEnvelope(baseInput(), SERVER_CTX);
    expect(result.metaFenceMarkdown).toContain('```json');
    expect(result.gapListMarkdown).toContain('## (J) Gap list');
    expect(result.provenanceFooterMarkdown).toContain('## (K) Provenance footer');
    expect(result.emitInstructions).toContain('TRANSCRIPTION DISCIPLINE');
    expect(result.provenanceVerification.total).toBe(2);
  });

  it('verifies claims whose excerpt is in the IRL', () => {
    const result = runComposeDossierEnvelope(baseInput(), SERVER_CTX);
    // Both baseInput claims are verbatim in SAMPLE_IRL.
    expect(
      result.provenanceVerification.verified + result.provenanceVerification.verifiedFuzzy
    ).toBe(2);
    expect(result.provenanceVerification.unverified).toBe(0);
    expect(result.provenanceVerification.autoAppendedGaps).toBe(0);
    expect(result.provenanceVerification.tierMismatches).toBe(0);
  });

  // BL-045 PR B audit MA-6: tier-1 unverified is now its own category
  // separate from generic provenance-gap.
  it('auto-appends a tier-mismatch entry when tier=1 claim is unverified', () => {
    const input = baseInput();
    input.claims.push({
      claim: 'Fabricated NRR 220%',
      citation: 'Section 00 — Fabricated $128M ARR with 220 yoy growth never tracked',
      tier: '1',
    });
    const result = runComposeDossierEnvelope(input, SERVER_CTX);
    expect(result.provenanceVerification.unverified).toBe(1);
    expect(result.provenanceVerification.tierMismatches).toBe(1);
    expect(result.provenanceVerification.autoAppendedGaps).toBe(1);
    expect(result.gapListMarkdown).toContain('**tier-mismatch:** Fabricated NRR 220%');
    expect(result.gapListMarkdown).toContain(
      'declared tier=1 (literal IRL bullet) but the citation excerpt is not a substring'
    );
  });

  // Tier-2 unverified stays as provenance-gap (less damning).
  it('auto-appends a provenance-gap entry when tier=2/3 claim is unverified (not tier-mismatch)', () => {
    const input = baseInput();
    input.claims.push({
      claim: 'derived MTTR estimate',
      citation: 'Section 04 — derived from sprint dashboard but excerpt not verbatim',
      tier: '2',
    });
    const result = runComposeDossierEnvelope(input, SERVER_CTX);
    expect(result.provenanceVerification.unverified).toBe(1);
    expect(result.provenanceVerification.tierMismatches).toBe(0);
    expect(result.provenanceVerification.autoAppendedGaps).toBe(1);
    expect(result.gapListMarkdown).toContain('**provenance-gap:** derived MTTR estimate');
    expect(result.gapListMarkdown).not.toContain('**tier-mismatch:**');
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
      tier: '2', // tier-2 so it goes to provenance-gap, not tier-mismatch
    });
    const result = runComposeDossierEnvelope(input, SERVER_CTX);
    expect(result.gapListMarkdown).toContain('**gate-elided:** search_radar');
    expect(result.gapListMarkdown).toContain('**currency-assumption:** TechPar run in CAD');
    expect(result.gapListMarkdown).toContain('**provenance-gap:** Fabricated detail');
  });

  it('is pure — calling twice with the same input yields identical results', () => {
    const input = baseInput();
    const a = runComposeDossierEnvelope(input, SERVER_CTX);
    const b = runComposeDossierEnvelope(input, SERVER_CTX);
    expect(a).toEqual(b);
  });
});

// BL-045 PR B audit BL-2 → ALT-1: hash-bind forcing function.
describe('runComposeDossierEnvelope — hash-bind verification', () => {
  it('rejects with IrlBodyHashMismatchError when irlBodyHash != sha256(filledIrl).slice(0,16)', () => {
    const input = baseInput();
    input.irlBodyHash = '0000000000000000'; // not the real hash
    expect(() => runComposeDossierEnvelope(input, SERVER_CTX)).toThrow(IrlBodyHashMismatchError);
  });

  it('error message names both the supplied and actual hash so the model can self-correct', () => {
    const input = baseInput();
    input.irlBodyHash = '0000000000000000';
    try {
      runComposeDossierEnvelope(input, SERVER_CTX);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(IrlBodyHashMismatchError);
      expect((err as Error).message).toContain('irlBodyHash="0000000000000000"');
      expect((err as Error).message).toContain('sha256(filledIrl).slice(0,16)=');
      expect((err as Error).message).toContain('verbatim');
    }
  });

  it('rejects paraphrased filledIrl even when hash matches the original (the v10 failure mode)', () => {
    const input = baseInput();
    // Model passes a paraphrase but copies the original hash from the body.
    input.filledIrl = 'Condensed paraphrase: ARR $45.2M, headcount 187, growth 62%.';
    // input.irlBodyHash still points at SAMPLE_IRL's hash (the body-shown value).
    expect(() => runComposeDossierEnvelope(input, SERVER_CTX)).toThrow(IrlBodyHashMismatchError);
  });

  it('accepts when filledIrl matches the hash exactly (happy path)', () => {
    // baseInput sets irlBodyHash from SAMPLE_IRL — happy path passes.
    expect(() => runComposeDossierEnvelope(baseInput(), SERVER_CTX)).not.toThrow();
  });
});

// BL-045 PR B audit BL-3 + MA-5 + MA-2: schema-layer rejection of
// out-of-enum / hallucinated values.
describe('ComposeDossierEnvelopeInputSchema — input validation', () => {
  it('rejects gatesPassed entry that is not in ORCHESTRATED_TOOLS', () => {
    const input = baseInput();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (input as any).gatesPassed = ['not_a_real_tool'];
    const parsed = ComposeDossierEnvelopeInputSchema.safeParse(input);
    expect(parsed.success).toBe(false);
  });

  it('rejects conditionalTriggersFired with a non-canonical trigger name', () => {
    const input = baseInput();
    // The v10 trace populated this with "GDPR" — schema now rejects.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (input as any).conditionalTriggersFired = ['GDPR'];
    const parsed = ComposeDossierEnvelopeInputSchema.safeParse(input);
    expect(parsed.success).toBe(false);
  });

  it('accepts the canonical conditional triggers (EU_AI_ACT, NIS2)', () => {
    const input = baseInput();
    input.conditionalTriggersFired = ['EU_AI_ACT', 'NIS2'];
    const parsed = ComposeDossierEnvelopeInputSchema.safeParse(input);
    expect(parsed.success).toBe(true);
  });

  it('rejects modelVersion sentinel hallucinations (empty / single letter / vendor-only)', () => {
    for (const bad of ['', 'x', 'claude', 'unknown', 'gpt']) {
      const input = baseInput();
      input.modelVersion = bad;
      const parsed = ComposeDossierEnvelopeInputSchema.safeParse(input);
      expect(parsed.success, `should reject modelVersion="${bad}"`).toBe(false);
    }
  });

  it('accepts canonical modelVersion shapes', () => {
    for (const good of [
      'claude-opus-4-7',
      'claude-sonnet-4-6',
      'gpt-4-turbo',
      'mistral-large-2407',
    ]) {
      const input = baseInput();
      input.modelVersion = good;
      const parsed = ComposeDossierEnvelopeInputSchema.safeParse(input);
      expect(parsed.success, `should accept modelVersion="${good}"`).toBe(true);
    }
  });

  it('rejects irlBodyHash that is not 16 lowercase hex chars', () => {
    for (const bad of ['', 'short', 'CAFEBABEDEADBEEF', 'cafebabedeadbeefcafebabedeadbeef']) {
      const input = baseInput();
      input.irlBodyHash = bad;
      const parsed = ComposeDossierEnvelopeInputSchema.safeParse(input);
      expect(parsed.success, `should reject irlBodyHash="${bad}"`).toBe(false);
    }
  });
});

// BL-045 PR B audit BL-1: promptVersion is optional + server-overridden.
describe('ComposeDossierEnvelopeInputSchema — promptVersion handling', () => {
  it('accepts inputs that omit promptVersion entirely', () => {
    const input = baseInput();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (input as any).promptVersion;
    const parsed = ComposeDossierEnvelopeInputSchema.safeParse(input);
    expect(parsed.success).toBe(true);
  });

  it('accepts inputs with a model-supplied promptVersion (then server overrides at render time)', () => {
    const input = baseInput();
    input.promptVersion = '99.99.99';
    const parsed = ComposeDossierEnvelopeInputSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    const result = runComposeDossierEnvelope(parsed.data!, SERVER_CTX);
    expect(result.metaFenceMarkdown).toContain('"promptVersion": "0.4.0"');
    expect(result.metaFenceMarkdown).not.toContain('99.99.99');
  });
});
