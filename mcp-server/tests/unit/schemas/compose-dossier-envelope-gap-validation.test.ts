/**
 * BL-068 — server-side validation of model-supplied `map-absent:` claims
 * in `compose_dossier_envelope`'s `gaps` array.
 *
 * The 2026-06-05 live exercise produced 4 model-supplied `map-absent:`
 * claims with only 1 backing `search_regulations` call, including 2
 * confirmed false positives (NIST AI RMF + Australia Privacy Act are
 * both in the Hub registry under `US-NIST-AI-RMF.json` and
 * `AU-PRIVACY-ACT.json`). These tests assert that those false-positive
 * claims are rejected at the tool boundary with a structured error
 * naming the matching Hub framework, AND that legitimate `map-absent:`
 * claims (truly absent frameworks) still pass through.
 *
 * Known false-negative documented in the test: "UK GDPR" → "UK Data
 * Protection Act 2018" equivalence is not caught by the bidirectional
 * substring rule. This will be covered by a future regulatory-map
 * alias work, not BL-068.
 */

import { describe, it, expect } from 'vitest';
import {
  Bl068MapAbsentFalsePositiveError,
  Bl070VerbatimBodyRequiredError,
  ComposeDossierEnvelopeInputSchema,
  type ComposeDossierEnvelopeEngineInput,
  type ComposeDossierEnvelopeInput,
  computeIrlBodyHash,
  deriveFillRatio,
  findFalsePositiveMapAbsentClaims,
  runComposeDossierEnvelope,
} from '../../../src/schemas/compose-dossier-envelope';

const SERVER_CTX = { promptVersion: '0.4.0' };

const SAMPLE_IRL = `# IRL — TestCo

## 00 — Basics

- Annual recurring revenue: $45.2M
- Headcount: 187

## 02 — Software Architecture

- Engineering FTE count: 58 total
`;

function baseInput(
  gaps: ComposeDossierEnvelopeInput['gaps'] = [],
  irlSource: ComposeDossierEnvelopeInput['irlSource'] = 'partner-paste-verbatim'
): ComposeDossierEnvelopeEngineInput {
  return {
    promptName: 'gst_irl_ingestion',
    promptVersion: '0.4.0',
    modelVersion: 'claude-opus-4-7',
    mode: 'full',
    auditLevel: 'debug',
    transactionContext: 'value-creation',
    fillRatio: { percent: 92, substantiveCells: 46, totalCells: 50, status: 'ok' },
    gatesPassed: [],
    gatesElided: [],
    conditionalTriggersFired: [],
    defaultFiredFrameworks: [],
    forceToolsApplied: [],
    claims: [
      {
        claim: 'ARR ~$45.2M',
        citation: 'Section 00 — Annual recurring revenue: $45.2M',
        tier: '1',
      },
    ],
    gaps,
    filledIrl: SAMPLE_IRL,
    irlBodyHash: computeIrlBodyHash(SAMPLE_IRL),
    irlSource,
    requireVerbatimBody: false,
  };
}

describe('findFalsePositiveMapAbsentClaims', () => {
  it('flags NIST AI Risk Management Framework (US-NIST-AI-RMF.json)', () => {
    const offenders = findFalsePositiveMapAbsentClaims([
      {
        category: 'map-absent',
        entry:
          'NIST AI Risk Management Framework — named in Section 09 but absent from the Hub regulatory map.',
      },
    ]);
    expect(offenders).toHaveLength(1);
    expect(offenders[0].matchedHub).toMatch(/NIST/i);
  });

  it('flags GDPR (EU-GDPR.json — short-name acronym matches via substring)', () => {
    const offenders = findFalsePositiveMapAbsentClaims([
      {
        category: 'map-absent',
        entry: 'GDPR — claim text after em-dash.',
      },
    ]);
    expect(offenders).toHaveLength(1);
    expect(offenders[0].matchedHub).toMatch(/GDPR/i);
  });

  it('does NOT flag a truly-absent framework', () => {
    const offenders = findFalsePositiveMapAbsentClaims([
      {
        category: 'map-absent',
        entry:
          'Canada AIDA — Bill C-27 died on Order Paper; framework does not exist as enacted law.',
      },
    ]);
    expect(offenders).toHaveLength(0);
  });

  it('ignores non-map-absent gap entries', () => {
    const offenders = findFalsePositiveMapAbsentClaims([
      { category: 'tier-mismatch', entry: 'NIST AI RMF tier mismatch' },
      { category: 'gate-elided', entry: 'NIST AI RMF — gate elided' },
    ]);
    expect(offenders).toHaveLength(0);
  });

  it('collects ALL false positives (no short-circuit on first match)', () => {
    const offenders = findFalsePositiveMapAbsentClaims([
      { category: 'map-absent', entry: 'NIST AI Risk Management Framework — absent' },
      { category: 'map-absent', entry: 'GDPR — absent' },
      { category: 'map-absent', entry: 'Canada AIDA — absent' },
    ]);
    expect(offenders).toHaveLength(2);
    const matchedHubs = offenders.map((o) => o.matchedHub.toLowerCase());
    expect(matchedHubs.some((h) => h.includes('nist'))).toBe(true);
    expect(matchedHubs.some((h) => h.includes('gdpr'))).toBe(true);
  });

  // BL-073 — three frameworks that previously failed substring matching
  // are now caught via curated aliases (exact-equality on normalized form).
  it('BL-073: catches "UK GDPR" via alias on GB-DPA', () => {
    const offenders = findFalsePositiveMapAbsentClaims([
      { category: 'map-absent', entry: 'UK GDPR — claimed absent' },
    ]);
    expect(offenders).toHaveLength(1);
    expect(offenders[0].matchedHub).toMatch(/UK Data Protection Act 2018/i);
  });

  it('BL-073: catches "Australia Privacy Act" via alias on AU-PRIVACY-ACT', () => {
    const offenders = findFalsePositiveMapAbsentClaims([
      { category: 'map-absent', entry: 'Australia Privacy Act — claimed absent' },
    ]);
    expect(offenders).toHaveLength(1);
    expect(offenders[0].matchedHub).toMatch(/Privacy Act 1988/i);
  });

  it('BL-073: catches "EU AI Act" via alias on EU-AI-ACT', () => {
    const offenders = findFalsePositiveMapAbsentClaims([
      { category: 'map-absent', entry: 'EU AI Act — claimed absent' },
    ]);
    expect(offenders).toHaveLength(1);
    expect(offenders[0].matchedHub).toMatch(/EU Artificial Intelligence Act/i);
  });

  it('BL-073: alias matching is exact-equality on normalized form (not substring)', () => {
    // "Australian Privacy" → normalized "australianprivacy" — a TRUE substring of
    // the "Australian Privacy Act" alias on AU-PRIVACY-ACT.
    // Under exact-equality alias matching this MUST NOT match. Under substring
    // alias matching it WOULD match. This locks in the safer exact-equality semantics.
    // (The canonical name "Privacy Act 1988 (as amended 2024)" normalized doesn't
    // include "australianprivacy" either, so canonical path stays silent.)
    const offenders = findFalsePositiveMapAbsentClaims([
      { category: 'map-absent', entry: 'Australian Privacy — partial claim' },
    ]);
    expect(offenders).toHaveLength(0);
  });

  it('BL-073: canonical-name substring path unchanged (NIST AI RMF still matches)', () => {
    // Regression guard — BL-073 is additive. Previously-matching names via the
    // canonical-substring path must continue to match.
    const offenders = findFalsePositiveMapAbsentClaims([
      { category: 'map-absent', entry: 'NIST AI Risk Management Framework — absent' },
    ]);
    expect(offenders).toHaveLength(1);
    expect(offenders[0].matchedHub).toMatch(/NIST/i);
  });

  /**
   * BL-119 cycle-3. Observed on production: a dossier told a partner the
   * Colorado AI Act was "absent from the Hub regulatory map" and to file a
   * coverage request — for a framework the map carries. The record's canonical
   * name normalizes to `coloradoartificialintelligenceactsb24205`; the idiom a
   * model actually writes normalizes to `coloradoaiact`. Neither contains the
   * other, and the record had no aliases, so a covered framework read as
   * uncovered.
   *
   * Same additive alias shape BL-073 established for NIST. Without this test,
   * deleting the alias would regress the fix on a fully green suite.
   */
  it.each(['Colorado AI Act', 'CAIA', 'SB 24-205'])(
    'BL-119: %s resolves to the Colorado record via the alias path',
    (idiom) => {
      const offenders = findFalsePositiveMapAbsentClaims([
        { category: 'map-absent', entry: `${idiom} — absent from the regulatory map` },
      ]);
      expect(offenders).toHaveLength(1);
      expect(offenders[0].matchedHub).toMatch(/Colorado/i);
    }
  );

  it('BL-119: the Colorado canonical name still matches on the substring path', () => {
    const offenders = findFalsePositiveMapAbsentClaims([
      { category: 'map-absent', entry: 'Colorado Artificial Intelligence Act — absent' },
    ]);
    expect(offenders).toHaveLength(1);
    expect(offenders[0].matchedHub).toMatch(/Colorado/i);
  });
});

describe('runComposeDossierEnvelope — BL-068 false-positive rejection', () => {
  it('throws Bl068MapAbsentFalsePositiveError on a NIST AI RMF false positive', () => {
    const input = baseInput([
      {
        category: 'map-absent',
        entry: 'NIST AI Risk Management Framework — claimed absent in error',
      },
    ]);
    expect(() => runComposeDossierEnvelope(input, SERVER_CTX)).toThrow(
      Bl068MapAbsentFalsePositiveError
    );
  });

  it('rejection text names the matched Hub framework AND directs to search_regulations', () => {
    const input = baseInput([
      { category: 'map-absent', entry: 'NIST AI Risk Management Framework — absent' },
    ]);
    try {
      runComposeDossierEnvelope(input, SERVER_CTX);
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(Bl068MapAbsentFalsePositiveError);
      const msg = (error as Error).message;
      expect(msg).toContain('map-absent validation FAILED');
      expect(msg).toMatch(/NIST/i);
      expect(msg).toContain('search_regulations');
      expect(msg).toContain('alias coverage is incomplete');
    }
  });

  it('passes through when all model-supplied map-absent claims point at truly-absent frameworks', () => {
    const input = baseInput([
      {
        category: 'map-absent',
        entry: 'Canada AIDA — Bill C-27 died on Order Paper',
      },
    ]);
    expect(() => runComposeDossierEnvelope(input, SERVER_CTX)).not.toThrow();
  });

  it('passes through when gaps array contains only non-map-absent categories', () => {
    const input = baseInput([
      { category: 'gate-elided', entry: 'search_radar elided', irlSection: '01' },
    ]);
    expect(() => runComposeDossierEnvelope(input, SERVER_CTX)).not.toThrow();
  });

  it('lists ALL false-positive offenders in a single rejection (no short-circuit)', () => {
    const input = baseInput([
      { category: 'map-absent', entry: 'NIST AI Risk Management Framework — absent' },
      { category: 'map-absent', entry: 'GDPR — absent' },
    ]);
    try {
      runComposeDossierEnvelope(input, SERVER_CTX);
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(Bl068MapAbsentFalsePositiveError);
      const offenders = (error as Bl068MapAbsentFalsePositiveError).offenders;
      expect(offenders).toHaveLength(2);
    }
  });
});

describe('BL-072 — xlsx-reconstruction provenance-gap auto-append', () => {
  it('irlSource=model-reconstruction-from-xlsx → gapListMarkdown contains the BL-072 disclosure', () => {
    const result = runComposeDossierEnvelope(
      baseInput([], 'model-reconstruction-from-xlsx'),
      SERVER_CTX
    );
    expect(result.gapListMarkdown).toContain('xlsx-reconstruction mode');
    expect(result.gapListMarkdown).toContain('Verbatim-body authority does NOT hold');
    expect(result.gapListMarkdown).toContain('model-reconstruction-from-xlsx');
  });

  it('irlSource=model-reconstruction-trimmed → gapListMarkdown contains the BL-072 disclosure', () => {
    const result = runComposeDossierEnvelope(
      baseInput([], 'model-reconstruction-trimmed'),
      SERVER_CTX
    );
    expect(result.gapListMarkdown).toContain('xlsx-reconstruction mode');
    expect(result.gapListMarkdown).toContain('model-reconstruction-trimmed');
  });

  it('irlSource=partner-paste-verbatim → no BL-072 auto-append', () => {
    const result = runComposeDossierEnvelope(baseInput([], 'partner-paste-verbatim'), SERVER_CTX);
    expect(result.gapListMarkdown).not.toContain('xlsx-reconstruction mode');
    expect(result.gapListMarkdown).not.toContain('Verbatim-body authority does NOT hold');
  });

  it('irlSource=placeholder → no BL-072 auto-append (placeholder is not a reconstruction mode)', () => {
    const result = runComposeDossierEnvelope(baseInput([], 'placeholder'), SERVER_CTX);
    expect(result.gapListMarkdown).not.toContain('xlsx-reconstruction mode');
  });

  it('BL-072 auto-append composes with model-supplied gaps (both visible)', () => {
    const result = runComposeDossierEnvelope(
      baseInput(
        [{ category: 'gate-elided', entry: 'search_radar elided', irlSection: '01' }],
        'model-reconstruction-from-xlsx'
      ),
      SERVER_CTX
    );
    expect(result.gapListMarkdown).toContain('xlsx-reconstruction mode'); // BL-072
    expect(result.gapListMarkdown).toContain('search_radar elided'); // model-supplied
  });

  it('omitting irlSource → Zod rejection with path containing irlSource', () => {
    const raw = {
      ...baseInput(),
    } as Partial<ComposeDossierEnvelopeInput>;
    delete raw.irlSource;
    const parsed = ComposeDossierEnvelopeInputSchema.safeParse(raw);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const issue = parsed.error.issues.find((i) => i.path.includes('irlSource'));
    expect(issue, 'expected an irlSource Zod issue').toBeDefined();
    // Zod 4 surfaces a missing z.enum field as `invalid_value` (received: undefined).
    expect(['invalid_value', 'invalid_type']).toContain(issue!.code);
  });
});

describe('BL-073 — end-to-end alias rejection through runComposeDossierEnvelope', () => {
  it('rejects a payload with all three alias false-positives in a single call', () => {
    // Closes the loop in-session per audit "things plan misses" #3:
    // proves the alias work flows from JSON → codegen → schema → matcher →
    // Bl068MapAbsentFalsePositiveError without depending on a live exercise.
    const input = baseInput([
      { category: 'map-absent', entry: 'UK GDPR — claimed absent' },
      { category: 'map-absent', entry: 'Australia Privacy Act — claimed absent' },
      { category: 'map-absent', entry: 'EU AI Act — claimed absent' },
    ]);
    try {
      runComposeDossierEnvelope(input, SERVER_CTX);
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(Bl068MapAbsentFalsePositiveError);
      const offenders = (error as Bl068MapAbsentFalsePositiveError).offenders;
      expect(offenders).toHaveLength(3);
      const matchedHubs = offenders.map((o) => o.matchedHub);
      expect(matchedHubs).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/UK Data Protection Act 2018/i),
          expect.stringMatching(/Privacy Act 1988/i),
          expect.stringMatching(/EU Artificial Intelligence Act/i),
        ])
      );
    }
  });

  // BL-073 acronym add-on — 2026-06-06 fourth live exercise emitted
  // "NIST AI RMF" (acronym) as a map-absent claim; the canonical-substring
  // path missed it because "nistairmf" is not a substring of the canonical
  // "NIST AI Risk Management Framework 1.0 (NIST AI 100-1)" normalized.
  // Aliases on US-NIST-AI-RMF.json close this acronym case.
  it('BL-073 acronym add-on: catches "NIST AI RMF" via alias on US-NIST-AI-RMF', () => {
    const offenders = findFalsePositiveMapAbsentClaims([
      { category: 'map-absent', entry: 'NIST AI RMF — claimed absent' },
    ]);
    expect(offenders).toHaveLength(1);
    expect(offenders[0].matchedHub).toMatch(/NIST AI Risk Management Framework/i);
  });
});

describe('BL-070 — requireVerbatimBody gate', () => {
  it('throws Bl070VerbatimBodyRequiredError when flag true + model-reconstruction-from-xlsx', () => {
    const input = baseInput([], 'model-reconstruction-from-xlsx');
    input.requireVerbatimBody = true;
    expect(() => runComposeDossierEnvelope(input, SERVER_CTX)).toThrow(
      Bl070VerbatimBodyRequiredError
    );
  });

  it('throws Bl070VerbatimBodyRequiredError for model-reconstruction-trimmed too', () => {
    const input = baseInput([], 'model-reconstruction-trimmed');
    input.requireVerbatimBody = true;
    expect(() => runComposeDossierEnvelope(input, SERVER_CTX)).toThrow(
      Bl070VerbatimBodyRequiredError
    );
  });

  it('throws Bl070VerbatimBodyRequiredError for placeholder too (not partner-paste-verbatim)', () => {
    const input = baseInput([], 'placeholder');
    input.requireVerbatimBody = true;
    expect(() => runComposeDossierEnvelope(input, SERVER_CTX)).toThrow(
      Bl070VerbatimBodyRequiredError
    );
  });

  it('passes through when requireVerbatimBody=true AND irlSource=partner-paste-verbatim', () => {
    const input = baseInput([], 'partner-paste-verbatim');
    input.requireVerbatimBody = true;
    expect(() => runComposeDossierEnvelope(input, SERVER_CTX)).not.toThrow();
  });

  it('BL-079 Part B — passes through when requireVerbatimBody=true AND irlSource=partner-paste-verbatim-prepop', () => {
    // BL-079 Part B dual-accept: the prepop variant is operator-supplied
    // bytes (stronger provenance than partner-paste-verbatim since the body
    // never round-tripped through model emission). The gate accepts both.
    const input = baseInput([], 'partner-paste-verbatim-prepop');
    input.requireVerbatimBody = true;
    expect(() => runComposeDossierEnvelope(input, SERVER_CTX)).not.toThrow();
  });

  it('passes through when requireVerbatimBody is omitted (default false) regardless of irlSource', () => {
    const input = baseInput([], 'model-reconstruction-from-xlsx');
    // requireVerbatimBody not set; default false from Zod
    expect(() => runComposeDossierEnvelope(input, SERVER_CTX)).not.toThrow();
  });

  it('passes through when requireVerbatimBody is EXPLICITLY false + reconstruction-mode (audit MAJ-2)', () => {
    // Separate code path from omitted-default-false. Locking the explicit
    // case prevents a future Zod-shape refactor from breaking it silently.
    const input = baseInput([], 'model-reconstruction-from-xlsx');
    input.requireVerbatimBody = false;
    expect(() => runComposeDossierEnvelope(input, SERVER_CTX)).not.toThrow();
  });

  it('rejection text names the offending irlSource and directs to re-run partner-paste', () => {
    const input = baseInput([], 'model-reconstruction-from-xlsx');
    input.requireVerbatimBody = true;
    try {
      runComposeDossierEnvelope(input, SERVER_CTX);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(Bl070VerbatimBodyRequiredError);
      const msg = (e as Error).message;
      expect(msg).toContain('model-reconstruction-from-xlsx');
      expect(msg).toContain('partner-paste-verbatim');
      expect(msg).toContain('verbatim-body required');
    }
  });
});

// ─── BL-130 — server-derived fillRatio + disagreement disclosure ────────
//
// The model supplies four fields, two of which are pure functions of the
// other two, and nothing checked them. The tool now derives `percent` and
// `status` and discloses disagreement rather than rejecting it — rejection
// would fire on prompt-obedient runs at the rounding boundary, because the
// prompt has the model round BEFORE applying the halt/partial/ok thresholds.
//
// `baseInput` defaults to `irlSource: 'partner-paste-verbatim'`, which fires
// no other auto-append — load-bearing for the `autoAppendedGaps` counts below.
describe('BL-130 — fillRatio derivation and disclosure', () => {
  const withFillRatio = (fillRatio: ComposeDossierEnvelopeEngineInput['fillRatio']) => ({
    ...baseInput(),
    fillRatio,
  });

  it('agreement stays silent and leaves the fence untouched', () => {
    // 46/50 = 92 exactly, status ok — both arms match.
    const result = runComposeDossierEnvelope(baseInput(), SERVER_CTX);
    expect(result.gapListMarkdown).not.toContain('IRL completeness restated');
    expect(result.provenanceVerification.autoAppendedGaps).toBe(0);
    expect(result.metaFenceMarkdown).toContain('"fixtureFillRatio": 0.92');
  });

  it('disagreement is disclosed and the DERIVED figure governs the fence', () => {
    // 60/134 = 44.78 -> 45 (ok). Model said 84. Status matches (ok/ok), so
    // the percent arm is the sole firing arm.
    const result = runComposeDossierEnvelope(
      withFillRatio({ percent: 84, substantiveCells: 60, totalCells: 134, status: 'ok' }),
      SERVER_CTX
    );
    expect(result.gapListMarkdown).toContain('IRL completeness restated');
    expect(result.gapListMarkdown).toContain('derives 45%');
    // `percent / 100` is unformatted, so 45 renders `0.45` and 40 renders `0.4`.
    expect(result.metaFenceMarkdown).toContain('"fixtureFillRatio": 0.45');
    expect(result.provenanceVerification.autoAppendedGaps).toBe(1);
  });

  it('the follow-up directs restating (A) and forbids a corrective re-call', () => {
    const result = runComposeDossierEnvelope(
      withFillRatio({ percent: 84, substantiveCells: 60, totalCells: 134, status: 'ok' }),
      SERVER_CTX
    );
    expect(result.gapListMarkdown).toContain('IRL completeness: 45% (60 of 134 requests answered)');
    expect(result.gapListMarkdown).toContain('Do NOT re-call');
  });

  // ── the boundary pair: a pure STATUS probe ────────────────────────────
  // Deltas are 1 and 0 against a more-than-1pp rule, so the percent arm
  // contributes nothing to either case. A version omitting `status` would
  // pass over an empty set.
  it('boundary: 52/133 derives 39 (partial), so a reported `ok` discloses', () => {
    const result = runComposeDossierEnvelope(
      withFillRatio({ percent: 40, substantiveCells: 52, totalCells: 133, status: 'ok' }),
      SERVER_CTX
    );
    expect(result.gapListMarkdown).toContain('derives 39% (partial)');
    expect(result.provenanceVerification.autoAppendedGaps).toBe(1);
  });

  it('boundary: 53/134 derives 40 (ok) — prompt-obedient, stays silent', () => {
    // 39.55 raw. Thresholds apply to the ROUNDED percent, so this is `ok`.
    // Anchoring on the raw ratio would have rejected this correct run.
    const result = runComposeDossierEnvelope(
      withFillRatio({ percent: 40, substantiveCells: 53, totalCells: 134, status: 'ok' }),
      SERVER_CTX
    );
    expect(result.gapListMarkdown).not.toContain('IRL completeness restated');
    expect(result.provenanceVerification.autoAppendedGaps).toBe(0);
    expect(result.metaFenceMarkdown).toContain('"fixtureFillRatio": 0.4');
  });

  // ── incoherent counts: two fixtures, and the obvious one proves little ─
  it('incoherent counts do not override the fence, and disclose exactly once', () => {
    // 160/134 = 119.4. Overriding would write `1.19` into a partner-facing
    // fence — the value the schema's own .max(100) exists to prevent.
    // The 69pp delta means this fires the ordinary arm regardless, so the
    // negative assertions are what make it discriminating.
    const result = runComposeDossierEnvelope(
      withFillRatio({ percent: 50, substantiveCells: 160, totalCells: 134, status: 'ok' }),
      SERVER_CTX
    );
    expect(result.metaFenceMarkdown).toContain('"fixtureFillRatio": 0.5');
    expect(result.gapListMarkdown).toContain('could not be derived');
    // If the branches were not exclusive, the sibling delta entry would
    // carry the out-of-domain figure into the partner-facing gap list.
    expect(result.gapListMarkdown).not.toContain('119');
    expect(result.provenanceVerification.autoAppendedGaps).toBe(1);
  });

  it('minimal incoherence discloses even though BOTH delta arms are silent', () => {
    // 135/134 -> 101. |100 - 101| = 1, which is not MORE than 1pp, and
    // 101 -> `ok` matches the reported `ok`. Only an unconditional append
    // can surface this — a delta-gated disclosure stays silent here, in
    // exactly the case the guard exists for.
    const result = runComposeDossierEnvelope(
      withFillRatio({ percent: 100, substantiveCells: 135, totalCells: 134, status: 'ok' }),
      SERVER_CTX
    );
    expect(result.gapListMarkdown).toContain('could not be derived');
    expect(result.gapListMarkdown).toContain('135 substantive of 134 total');
    expect(result.provenanceVerification.autoAppendedGaps).toBe(1);
    // Trailing comma matters: bare `1` also matches `1.01`, which is what an
    // override would render — the assertion would pass on the defect.
    expect(result.metaFenceMarkdown).toContain('"fixtureFillRatio": 1,');
  });

  // W2 — the `halt` branch is the "this looks like the wrong IRL" signal and
  // no fixture in the repo went below 34, leaving the `< 15` constant free.
  it('halt threshold is exercised: 12/100 derives 12 (halt), so a reported partial discloses', () => {
    const result = runComposeDossierEnvelope(
      withFillRatio({ percent: 20, substantiveCells: 12, totalCells: 100, status: 'partial' }),
      SERVER_CTX
    );
    expect(result.gapListMarkdown).toContain('derives 12% (halt)');
    expect(result.provenanceVerification.autoAppendedGaps).toBe(1);
  });

  // W3 — the tolerance itself was unpinned in both directions. Both fixtures
  // carry a matching status so the percent arm is the sole firing arm.
  it('tolerance: a 1pp delta is within rounding and stays silent', () => {
    // 46/50 = 92; reporting 93 is one point out.
    const result = runComposeDossierEnvelope(
      withFillRatio({ percent: 93, substantiveCells: 46, totalCells: 50, status: 'ok' }),
      SERVER_CTX
    );
    expect(result.gapListMarkdown).not.toContain('IRL completeness restated');
    expect(result.provenanceVerification.autoAppendedGaps).toBe(0);
  });

  it('tolerance: a 2pp delta is beyond rounding and discloses', () => {
    const result = runComposeDossierEnvelope(
      withFillRatio({ percent: 94, substantiveCells: 46, totalCells: 50, status: 'ok' }),
      SERVER_CTX
    );
    expect(result.gapListMarkdown).toContain('derives 92% (ok)');
    expect(result.provenanceVerification.autoAppendedGaps).toBe(1);
  });

  it('the incoherent follow-up does NOT direct restating (A)', () => {
    // The derived figure there is the out-of-domain number the server just
    // declined to stand behind; directing a restatement would relocate the
    // defect from the fence into the dossier prose.
    const result = runComposeDossierEnvelope(
      withFillRatio({ percent: 50, substantiveCells: 160, totalCells: 134, status: 'ok' }),
      SERVER_CTX
    );
    expect(result.gapListMarkdown).toContain('Do NOT restate section (A)');
  });
});

// `deriveFillRatio` is exported so the boundary table can be pinned directly
// rather than routed through the engine once per case. The engine tests above
// prove the wiring; this proves the arithmetic, including the two endpoints no
// realistic fixture reaches.
describe('BL-130 — deriveFillRatio boundary table', () => {
  const cases: Array<[number, number, number, string]> = [
    [0, 50, 0, 'halt'], // nothing answered
    [7, 50, 14, 'halt'], // 14.0 -> just under the halt ceiling
    [8, 50, 16, 'partial'], // 16.0 -> partial
    [52, 133, 39, 'partial'], // 39.098 -> rounds to 39, still partial
    [53, 134, 40, 'ok'], // 39.552 -> rounds to 40, so `ok` per the prompt
    [50, 50, 100, 'ok'], // fully answered
  ];

  it.each(cases)('%i/%i derives %i (%s)', (s0, t, pct, status) => {
    const d = deriveFillRatio({ percent: 0, substantiveCells: s0, totalCells: t, status: 'halt' });
    expect(d.coherent).toBe(true);
    expect(d.derivedPercent).toBe(pct);
    expect(d.derivedStatus).toBe(status);
  });

  it('declines to derive when the numerator exceeds the denominator', () => {
    const d = deriveFillRatio({
      percent: 50,
      substantiveCells: 160,
      totalCells: 134,
      status: 'ok',
    });
    expect(d.coherent).toBe(false);
    expect(Number.isNaN(d.derivedPercent)).toBe(true);
    // Echoes the caller's status so both drift comparisons stay false — the
    // primary guard, per the mutation test recorded in the engine comment.
    expect(d.derivedStatus).toBe('ok');
  });
});
