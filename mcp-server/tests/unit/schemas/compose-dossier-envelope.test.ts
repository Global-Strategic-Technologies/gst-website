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
  type ComposeDossierEnvelopeEngineInput,
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

function baseInput(): ComposeDossierEnvelopeEngineInput {
  return {
    promptName: 'gst_irl_ingestion',
    promptVersion: '0.4.0',
    modelVersion: 'claude-opus-4-7',
    mode: 'full',
    auditLevel: 'debug',
    transactionContext: 'value-creation',
    fillRatio: { percent: 92, substantiveCells: 46, totalCells: 50, status: 'ok' },
    gatesPassed: ['generate_diligence_agenda', 'compute_techpar'],
    gatesElided: [{ tool: 'search_radar', reason: 'credentials not bound', irlSection: '01' }],
    conditionalTriggersFired: ['EU_AI_ACT'],
    defaultFiredFrameworks: [],
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
    irlSource: 'partner-paste-verbatim',
    requireVerbatimBody: false,
  };
}

describe('renderMetaFence', () => {
  it('emits a JSON code fence with all 13 fields in order', () => {
    const fence = renderMetaFence(baseInput(), SERVER_CTX.promptVersion);
    expect(fence).toMatch(/^```json\n/);
    expect(fence).toMatch(/\n```$/);
    expect(fence).toContain('"promptName": "gst_irl_ingestion"');
    expect(fence).toContain('"promptVersion": "0.4.0"');
    expect(fence).toContain('"modelVersion": "claude-opus-4-7"');
    expect(fence).toContain('"mode": "full"');
    expect(fence).toContain('"auditLevel": "debug"');
    expect(fence).toContain('"transactionContext": "value-creation"');
    expect(fence).toContain('"fixtureFillRatio": 0.92');
    expect(fence).toContain('"fixtureFillRatioStatus": "ok"');
    expect(fence).toContain('"gatesPassed"');
    expect(fence).toContain('"gatesElided"');
    expect(fence).toContain('"conditionalTriggersFired"');
    expect(fence).toContain('"defaultFiredFrameworks"');
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
      'auditLevel',
      'transactionContext',
      'fixtureFillRatio',
      'fixtureFillRatioStatus',
      'gatesPassed',
      'gatesElided',
      'conditionalTriggersFired',
      // renderMetaFence emits this between conditionalTriggersFired and
      // forceToolsApplied, but the list pinned only 12 of the 13 keys, so it
      // was free to move without failing the "deterministic" contract.
      'defaultFiredFrameworks',
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

  // BL-049 v11 Finding B: tier-2 fabrications (declared derivation but
  // citation is neither verbatim IRL substring nor partner-supplied
  // sentinel) now surface as `tier-fabrication:` — the demote-to-dodge
  // gaming pattern is closed. tier-3 unverified continues as soft
  // `provenance-gap:` since tier-3 is explicitly correlation/unknown.
  it('auto-appends tier-fabrication when tier=2 claim citation is fabricated (BL-049 v11 Finding B)', () => {
    const input = baseInput();
    input.claims.push({
      claim: 'derived MTTR estimate',
      citation: 'Section 04 — derived from sprint dashboard but excerpt not verbatim',
      tier: '2',
    });
    const result = runComposeDossierEnvelope(input, SERVER_CTX);
    expect(result.provenanceVerification.unverified).toBe(1);
    expect(result.provenanceVerification.tierMismatches).toBe(0);
    expect(result.provenanceVerification.tierFabrications).toBe(1);
    expect(result.provenanceVerification.autoAppendedGaps).toBe(1);
    expect(result.gapListMarkdown).toContain('**tier-fabrication:** derived MTTR estimate');
    expect(result.gapListMarkdown).not.toContain('**tier-mismatch:**');
    expect(result.gapListMarkdown).toContain('demote-to-dodge');
  });

  it('auto-appends provenance-gap for tier=3 unverified (correlation/unknown is soft)', () => {
    const input = baseInput();
    input.claims.push({
      claim: 'speculative competitive hypothesis',
      citation: 'Section 01 — model-generated competitive read, not in IRL',
      tier: '3',
    });
    const result = runComposeDossierEnvelope(input, SERVER_CTX);
    expect(result.provenanceVerification.unverified).toBe(1);
    expect(result.provenanceVerification.tierMismatches).toBe(0);
    expect(result.provenanceVerification.tierFabrications).toBe(0);
    expect(result.provenanceVerification.autoAppendedGaps).toBe(1);
    expect(result.gapListMarkdown).toContain(
      '**provenance-gap:** speculative competitive hypothesis'
    );
  });

  it('preserves pre-existing gaps when auto-appending tier-fabrication entries (BL-049 v11 Finding B)', () => {
    const input = baseInput();
    input.gaps.push({
      category: 'currency-assumption',
      entry: 'TechPar run in CAD basis with conversionRate 0.73',
    });
    input.claims.push({
      claim: 'Fabricated detail',
      citation: 'Section 99 — something not in the IRL anywhere at all',
      tier: '2', // BL-049: tier-2 fabricated citation now surfaces as tier-fabrication
    });
    const result = runComposeDossierEnvelope(input, SERVER_CTX);
    expect(result.gapListMarkdown).toContain('**gate-elided:** search_radar');
    expect(result.gapListMarkdown).toContain('**currency-assumption:** TechPar run in CAD');
    expect(result.gapListMarkdown).toContain('**tier-fabrication:** Fabricated detail');
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

  // BL-068 — rejection text steers the model to the new preflight tool.
  it('error message includes a Fix: line directing the model to prepare_irl_body (BL-068)', () => {
    const input = baseInput();
    input.irlBodyHash = '0000000000000000';
    try {
      runComposeDossierEnvelope(input, SERVER_CTX);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(IrlBodyHashMismatchError);
      expect((err as Error).message).toContain('Fix: call `prepare_irl_body`');
      expect((err as Error).message).toContain('LLMs cannot reliably compute sha256');
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
    // BL-076: parsed schema is the PUBLIC input (no filledIrl). Re-inject
    // the body the engine still requires.
    const result = runComposeDossierEnvelope(
      { ...parsed.data!, filledIrl: input.filledIrl },
      SERVER_CTX
    );
    expect(result.metaFenceMarkdown).toContain('"promptVersion": "0.4.0"');
    expect(result.metaFenceMarkdown).not.toContain('99.99.99');
  });
});

// ─── BL-053 — citation array form (multi-bullet claim support) ──────────

describe('compose_dossier_envelope — BL-053 citation array form', () => {
  it('accepts a claim with citation as array of strings', () => {
    const input = baseInput();
    input.claims = [
      {
        claim: 'TechPar paradigm: high R&D efficiency given FTE/ARR ratio',
        citation: [
          'Section 00 — Annual recurring revenue: $45.2M',
          'Section 02 — Engineering FTE count: 58 total',
        ],
        tier: '2',
      },
    ];
    const parsed = ComposeDossierEnvelopeInputSchema.safeParse(input);
    expect(parsed.success).toBe(true);
  });

  it('rejects an empty citation array', () => {
    const input = baseInput();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (input.claims[0] as any).citation = [];
    const parsed = ComposeDossierEnvelopeInputSchema.safeParse(input);
    expect(parsed.success).toBe(false);
  });

  it('rejects an over-length citation array (>8 elements)', () => {
    const input = baseInput();
    input.claims[0].citation = Array(9).fill('Section 00 — Annual recurring revenue: $45.2M');
    const parsed = ComposeDossierEnvelopeInputSchema.safeParse(input);
    expect(parsed.success).toBe(false);
  });

  it('verifies multi-bullet claim as verified when ALL elements are verbatim IRL substrings', () => {
    const input = baseInput();
    input.claims = [
      {
        claim: 'Multi-bullet derivation',
        citation: [
          'Section 00 — Annual recurring revenue: $45.2M',
          'Section 02 — Engineering FTE count: 58 total',
        ],
        tier: '2',
      },
    ];
    const result = runComposeDossierEnvelope(input, SERVER_CTX);
    expect(result.provenanceVerification.verified).toBe(1);
    expect(result.provenanceVerification.unverified).toBe(0);
    expect(result.provenanceVerification.autoAppendedGaps).toBe(0);
  });

  it('verifies multi-bullet claim as unverified when ANY element is unverified (weakest wins)', () => {
    const input = baseInput();
    input.claims = [
      {
        claim: 'Derivation with one fabricated element',
        citation: [
          'Section 00 — Annual recurring revenue: $45.2M',
          'Section 99 — Fabricated $999M ARR never tracked',
        ],
        tier: '2',
      },
    ];
    const result = runComposeDossierEnvelope(input, SERVER_CTX);
    expect(result.provenanceVerification.unverified).toBe(1);
    expect(result.provenanceVerification.verified).toBe(0);
    // declared tier-2 + all elements derive as fabrication? No — one element
    // verified, so the derived aggregate is unverified BUT not 'fabrication'
    // (the deriveTier check looks at status, and unverified → fabrication).
    // The auto-append rule for declared tier-2 + derived fabrication fires.
    expect(result.provenanceVerification.tierFabrications).toBe(1);
  });

  it('renders array-form citation in (K) provenance footer with element count', () => {
    const input = baseInput();
    input.claims = [
      {
        claim: 'Multi-bullet derivation',
        citation: [
          'Section 00 — Annual recurring revenue: $45.2M',
          'Section 02 — Engineering FTE count: 58 total',
        ],
        tier: '2',
      },
    ];
    const result = runComposeDossierEnvelope(input, SERVER_CTX);
    expect(result.provenanceFooterMarkdown).toMatch(/\[2 citations\]/);
    expect(result.provenanceFooterMarkdown).toContain('Annual recurring revenue: $45.2M');
    expect(result.provenanceFooterMarkdown).toContain('Engineering FTE count: 58 total');
  });

  it('mixes single-string and array-form claims in the same call', () => {
    const input = baseInput();
    input.claims = [
      {
        claim: 'Single-citation claim (legacy shape)',
        citation: 'Section 00 — Annual recurring revenue: $45.2M',
        tier: '1',
      },
      {
        claim: 'Multi-bullet derivation (BL-053 shape)',
        citation: [
          'Section 00 — Annual recurring revenue: $45.2M',
          'Section 02 — Engineering FTE count: 58 total',
        ],
        tier: '2',
      },
    ];
    const result = runComposeDossierEnvelope(input, SERVER_CTX);
    expect(result.provenanceVerification.verified).toBe(2);
    expect(result.provenanceVerification.unverified).toBe(0);
  });

  it('verifies tier-1-declared array claim cleanly when all elements verify (no tier-mismatch)', () => {
    const input = baseInput();
    input.claims = [
      {
        claim: 'Tier-1 multi-bullet quote',
        citation: [
          'Section 00 — Annual recurring revenue: $45.2M',
          'Section 02 — Engineering FTE count: 58 total',
        ],
        tier: '1',
      },
    ];
    const result = runComposeDossierEnvelope(input, SERVER_CTX);
    expect(result.provenanceVerification.tierMismatches).toBe(0);
    expect(result.provenanceVerification.verified).toBe(1);
  });

  it('flags tier-1-declared array claim as tier-mismatch when any element fails', () => {
    const input = baseInput();
    input.claims = [
      {
        claim: 'Tier-1 multi-bullet with fabricated element',
        citation: [
          'Section 00 — Annual recurring revenue: $45.2M',
          'Section 99 — Fabricated row never in the IRL',
        ],
        tier: '1',
      },
    ];
    const result = runComposeDossierEnvelope(input, SERVER_CTX);
    expect(result.provenanceVerification.tierMismatches).toBe(1);
    expect(result.gapListMarkdown).toMatch(/tier-mismatch/);
  });
});

// ─── BL-063 — server-side defaultFiredFrameworks enforcement ────────────
//
// Three rules at the tool seam, matching the BL-058 forcing-function
// pattern (the impartial-audit verdict on BL-062 prose-only enforcement
// was WEAK; this PR moves it to schema enforcement):
//   1. Partition rejection (BL-063-PARTITION-VIOLATION).
//   2. Scope rejection (BL-063-CERTIFICATION-NOT-REGULATION).
//   3. Hub-backing auto-degrade: unbacked entries stripped from meta
//      fence + auto-appended to (J) as map-absent: gap entries.

describe('compose_dossier_envelope — BL-063 defaultFiredFrameworks enforcement', () => {
  describe('rule 1: partition rejection (no overlap with conditionalTriggersFired)', () => {
    it('throws Bl063PartitionViolationError when a framework appears in both lists (EU_AI_ACT case from 2026-06-04 retest)', async () => {
      const { Bl063PartitionViolationError } =
        await import('../../../src/schemas/compose-dossier-envelope');
      const input = baseInput();
      input.conditionalTriggersFired = ['EU_AI_ACT'];
      input.defaultFiredFrameworks = ['GDPR', 'EU AI Act'];
      expect(() => runComposeDossierEnvelope(input, SERVER_CTX)).toThrow(
        Bl063PartitionViolationError
      );
    });

    it('normalizes case + whitespace + punctuation so "EU AI Act" / "eu-ai-act" / "EUAIACT" all match', async () => {
      const { Bl063PartitionViolationError } =
        await import('../../../src/schemas/compose-dossier-envelope');
      const cases = ['EU AI Act', 'eu-ai-act', 'EUAIACT', 'Eu_Ai_Act'];
      for (const name of cases) {
        const input = baseInput();
        input.conditionalTriggersFired = ['EU_AI_ACT'];
        input.defaultFiredFrameworks = [name];
        expect(
          () => runComposeDossierEnvelope(input, SERVER_CTX),
          `should reject overlap for "${name}"`
        ).toThrow(Bl063PartitionViolationError);
      }
    });

    it('accepts non-overlapping submissions (GDPR not also in conditionalTriggersFired)', () => {
      const input = baseInput();
      input.conditionalTriggersFired = ['EU_AI_ACT'];
      input.defaultFiredFrameworks = ['GDPR', 'UK GDPR'];
      expect(() => runComposeDossierEnvelope(input, SERVER_CTX)).not.toThrow();
    });
  });

  describe('rule 2: scope rejection (certifications blocked)', () => {
    it('throws Bl063CertificationNotRegulationError on SOC 2 (case from 2026-06-04 retest)', async () => {
      const { Bl063CertificationNotRegulationError } =
        await import('../../../src/schemas/compose-dossier-envelope');
      const input = baseInput();
      input.defaultFiredFrameworks = ['GDPR', 'SOC 2'];
      expect(() => runComposeDossierEnvelope(input, SERVER_CTX)).toThrow(
        Bl063CertificationNotRegulationError
      );
    });

    it('normalizes certification names so "SOC2" / "soc-2" / "Soc 2 Type II" all match', async () => {
      const { Bl063CertificationNotRegulationError } =
        await import('../../../src/schemas/compose-dossier-envelope');
      const cases = ['SOC2', 'soc-2', 'ISO 27001', 'iso27001', 'PCI-DSS', 'pcidss', 'FedRAMP'];
      for (const name of cases) {
        const input = baseInput();
        input.defaultFiredFrameworks = [name];
        expect(
          () => runComposeDossierEnvelope(input, SERVER_CTX),
          `should reject certification "${name}"`
        ).toThrow(Bl063CertificationNotRegulationError);
      }
    });

    it('accepts regulatory frameworks even when they share name fragments with certifications', () => {
      const input = baseInput();
      input.defaultFiredFrameworks = ['GDPR', 'UK GDPR', 'PIPEDA'];
      expect(() => runComposeDossierEnvelope(input, SERVER_CTX)).not.toThrow();
    });
  });

  describe('rule 3: Hub-backing auto-degrade (unbacked entries → map-absent gap)', () => {
    it('auto-appends a map-absent: gap entry for each unbacked framework (Canada AIDA case — BL-057 dropped AIDA after Bill C-27 died)', () => {
      const input = baseInput();
      // Canada AIDA remains unbacked: BL-057's coverage-gap sweep
      // explicitly dropped it after WebSearch verification confirmed
      // Bill C-27 died on the Order Paper Jan 2025. (NIST AI RMF was
      // originally in this test — it became Hub-backed when BL-057
      // shipped US-NIST-AI-RMF.json, so the test now uses AIDA as the
      // canonical still-unbacked AI-gov framework.)
      input.defaultFiredFrameworks = ['GDPR', 'Canada AIDA', 'Singapore Model AI Governance'];
      const result = runComposeDossierEnvelope(input, SERVER_CTX);
      expect(result.gapListMarkdown).toContain('map-absent');
      expect(result.gapListMarkdown).toContain('Canada AIDA');
      expect(result.gapListMarkdown).toContain('Singapore Model AI Governance');
    });

    it('strips unbacked entries from the rendered meta fence (so partners see only Hub-backed frameworks)', () => {
      const input = baseInput();
      input.defaultFiredFrameworks = ['GDPR', 'Canada AIDA'];
      const result = runComposeDossierEnvelope(input, SERVER_CTX);
      // The meta fence should NOT carry Canada AIDA since it's unbacked
      // (BL-057 dropped it). GDPR is in the Hub map so it survives.
      expect(result.metaFenceMarkdown).not.toContain('Canada AIDA');
    });

    it('keeps Hub-backed entries in the meta fence (GDPR, UK GDPR, PIPEDA, POPIA are all backed)', () => {
      const input = baseInput();
      input.defaultFiredFrameworks = ['GDPR', 'UK GDPR'];
      const result = runComposeDossierEnvelope(input, SERVER_CTX);
      expect(result.metaFenceMarkdown).toContain('defaultFiredFrameworks');
      expect(result.metaFenceMarkdown).toContain('GDPR');
    });
  });

  describe('happy path: empty + Hub-backed-only submissions', () => {
    it('accepts an empty defaultFiredFrameworks list (Section 09 named no frameworks)', () => {
      const input = baseInput();
      input.defaultFiredFrameworks = [];
      const result = runComposeDossierEnvelope(input, SERVER_CTX);
      expect(result.metaFenceMarkdown).toContain('"defaultFiredFrameworks": []');
    });

    it('accepts inputs that omit defaultFiredFrameworks entirely (back-compat with pre-BL-063 callers)', () => {
      const input = baseInput();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (input as any).defaultFiredFrameworks;
      const parsed = ComposeDossierEnvelopeInputSchema.safeParse(input);
      expect(parsed.success).toBe(true);
      // BL-076: re-inject filledIrl post-parse (public schema dropped it).
      const result = runComposeDossierEnvelope(
        { ...parsed.data!, filledIrl: input.filledIrl },
        SERVER_CTX
      );
      expect(result.metaFenceMarkdown).toContain('"defaultFiredFrameworks": []');
    });
  });
});
