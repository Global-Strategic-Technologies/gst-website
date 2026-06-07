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
    verbosity: 'verbose',
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
      expect(msg).toContain('BL-068 map-absent validation FAILED');
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
    expect(result.gapListMarkdown).toContain('BL-049 verbatim-body authority does NOT hold');
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
    expect(result.gapListMarkdown).not.toContain('BL-049 verbatim-body authority does NOT hold');
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
      expect(msg).toContain('BL-070');
    }
  });
});
