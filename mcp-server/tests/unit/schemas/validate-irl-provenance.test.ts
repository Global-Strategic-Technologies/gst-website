/**
 * Unit tests for the validate_irl_provenance matching engine
 * (BL-045 PR B Phase 2B residual-fabrication guard).
 *
 * Coverage targets:
 *
 * - normalizeForMatching: deterministic lowercase + whitespace collapse +
 *   markdown noise strip; round-trippable; idempotent.
 * - extractExcerpt: returns post-em-dash text or the original on no dash.
 * - runIrlProvenanceCheck happy paths: verbatim verified, partner-supplied
 *   passthrough, fuzzy-run acceptance at the boundary, fabrication
 *   rejection.
 * - Edge cases: empty excerpt, only-stopwords excerpt, run exactly at the
 *   FUZZY_MIN_RUN threshold, run one below threshold.
 */

import { describe, it, expect } from 'vitest';
import {
  FUZZY_MIN_RUN,
  extractExcerpt,
  normalizeForMatching,
  runIrlProvenanceCheck,
} from '../../../src/schemas/validate-irl-provenance';

const SAMPLE_IRL = `# Information Request List — Acme (returned, 2026-06-03)

## 00 — Basics

- Annual recurring revenue: $45.2M Q1-FY26 annualized; $31.4M trailing 12 months
- Geographies: US (East Coast, Texas, California), EU (Germany, France, Netherlands)
- Total headcount: 187 today; 121 twelve months ago
- Year-over-year growth rate: Revenue 62% YoY; headcount 55% YoY

## 02 — Software Architecture

- Engineering FTE count: 58 total — 38 product, 8 SRE, 3 security, 7 data, 2 platform
- Stack: TypeScript Node 22, Python 3.12, Aurora Postgres 15, Redshift on AWS
`;

describe('normalizeForMatching', () => {
  it('lowercases the input', () => {
    expect(normalizeForMatching('HELLO WORLD')).toBe('hello world');
  });
  it('collapses runs of whitespace', () => {
    expect(normalizeForMatching('a    b\nc\t\td')).toBe('a b c d');
  });
  it('strips markdown emphasis tokens', () => {
    expect(normalizeForMatching('**bold** _italic_ `code`')).toBe('bold italic code');
  });
  it('flattens em-dashes / en-dashes / hyphens into spaces', () => {
    expect(normalizeForMatching('US — EU – CA - BR')).toBe('us eu ca br');
  });
  it('is idempotent', () => {
    const once = normalizeForMatching(SAMPLE_IRL);
    const twice = normalizeForMatching(once);
    expect(twice).toBe(once);
  });
  it('flattens curly quotes into spaces (BL-049 closeout hardening)', () => {
    expect(normalizeForMatching('“smart” ‘quotes’')).toBe('smart quotes');
  });
  it('normalizes curly and straight quotes identically', () => {
    expect(normalizeForMatching('don’t “quote” me')).toBe(
      normalizeForMatching('don\'t "quote" me')
    );
  });
  it('collapses NBSP variants like regular whitespace (regression lock — JS \\s covers Zs)', () => {
    expect(normalizeForMatching('a\u00A0b\u202Fc')).toBe('a b c');
  });
  it('is idempotent over curly-quote + NBSP input', () => {
    const sample = 'the CTO said “we can’t\u00A0migrate” — twice';
    const once = normalizeForMatching(sample);
    expect(normalizeForMatching(once)).toBe(once);
  });
});

describe('extractExcerpt', () => {
  it('returns the text after the em-dash (single em-dash, canonical citation shape)', () => {
    expect(extractExcerpt('Section 02 row 43 — Engineering FTE count: 58 total')).toBe(
      'Engineering FTE count: 58 total'
    );
  });
  it('anchors on the LAST em-dash (BL-049 defensive hardening)', () => {
    // Citations that echo canonical section headers (which themselves
    // contain em-dashes) would have dragged the header in as noise under
    // the original `indexOf('—')` behavior; `lastIndexOf('—')` extracts
    // the trailing excerpt cleanly.
    expect(extractExcerpt('Section 02 — Software Architecture — 2-05 — text')).toBe('text');
    expect(extractExcerpt('Section 00 — Foo — Bar')).toBe('Bar');
  });
  it('returns the original when no em-dash is present', () => {
    expect(extractExcerpt('Section 00 row 10 Recurring revenue')).toBe(
      'Section 00 row 10 Recurring revenue'
    );
  });
});

describe('runIrlProvenanceCheck — verbatim verification', () => {
  it('verifies an exact substring excerpt', () => {
    const result = runIrlProvenanceCheck({
      filledIrl: SAMPLE_IRL,
      citations: [
        {
          path: '_audit.headcount.citation',
          citation: 'Section 02 — Engineering FTE count: 58 total',
        },
      ],
    });
    expect(result.verified).toBe(1);
    expect(result.verdicts[0].status).toBe('verified');
  });

  it('verifies despite case + punctuation differences (normalization strips them)', () => {
    const result = runIrlProvenanceCheck({
      filledIrl: SAMPLE_IRL,
      citations: [
        {
          path: '_audit.revenueRange.citation',
          citation: 'Section 00 — annual RECURRING revenue: $45.2M Q1-FY26 annualized',
        },
      ],
    });
    expect(result.verified).toBe(1);
    expect(result.verdicts[0].status).toBe('verified');
  });
});

describe('runIrlProvenanceCheck — encoding drift (BL-049 closeout hardening)', () => {
  // The v11 SanFran false-positive class: body and citation carry the
  // same content but drift on quote style, NBSP, or dash flavor because
  // they were produced by different text pipelines. NBSP is injected
  // via \u00A0 escapes so the drift under test stays visible here.
  const STRAIGHT_QUOTE_IRL = `# Information Request List — Acme (returned)

## 03 — Vendor Lock-In

- Migration posture: the CTO said "we cannot migrate off Aurora before FY27" per the diligence call
- Failover topology: Redis – Aurora failover is exercised quarterly in us-east-1
`;

  const CURLY_QUOTE_IRL = `# Information Request List — Acme (returned)

## 03 — Vendor Lock-In

- Migration posture: the CTO said “we cannot migrate off Aurora before FY27” per the diligence call
`;

  it('verifies a curly-quote citation against a straight-quote body', () => {
    const result = runIrlProvenanceCheck({
      filledIrl: STRAIGHT_QUOTE_IRL,
      citations: [
        {
          path: '_audit.lockIn.citation',
          citation:
            'Section 03 — the CTO said “we cannot migrate off Aurora before FY27” per the diligence call',
        },
      ],
    });
    expect(result.verified).toBe(1);
    expect(result.verdicts[0].status).toBe('verified');
  });

  it('verifies a straight-quote citation against a curly-quote body', () => {
    const result = runIrlProvenanceCheck({
      filledIrl: CURLY_QUOTE_IRL,
      citations: [
        {
          path: '_audit.lockIn.citation',
          citation:
            'Section 03 — the CTO said "we cannot migrate off Aurora before FY27" per the diligence call',
        },
      ],
    });
    expect(result.verified).toBe(1);
    expect(result.verdicts[0].status).toBe('verified');
  });

  it('verifies a plain-space citation against an NBSP-bearing body (regression lock)', () => {
    const nbspBody = STRAIGHT_QUOTE_IRL.replace('exercised quarterly', 'exercised\u00A0quarterly');
    const result = runIrlProvenanceCheck({
      filledIrl: nbspBody,
      citations: [
        {
          path: '_audit.failover.citation',
          citation: 'Section 03 — Redis – Aurora failover is exercised quarterly in us-east-1',
        },
      ],
    });
    expect(result.verified).toBe(1);
    expect(result.verdicts[0].status).toBe('verified');
  });

  it('verifies under combined drift: curly quotes + NBSP in the same excerpt', () => {
    const driftedBody = CURLY_QUOTE_IRL.replace('per the', 'per\u00A0the');
    const result = runIrlProvenanceCheck({
      filledIrl: driftedBody,
      citations: [
        {
          path: '_audit.lockIn.citation',
          // straight quotes + plain spaces vs the body's curly quotes + NBSP
          citation:
            'Section 03 — the CTO said "we cannot migrate off Aurora before FY27" per the diligence call',
        },
      ],
    });
    expect(result.verified).toBe(1);
    expect(result.verdicts[0].status).toBe('verified');
  });
});

describe('runIrlProvenanceCheck — fuzzy verification', () => {
  it('verifies fuzzy when the excerpt paraphrases but shares a long contiguous-word run', () => {
    // Excerpt re-orders/paraphrases the prefix but preserves a long
    // contiguous run from the IRL ("38 product 8 sre 3 security 7 data
    // 2 platform" — 10 normalized words verbatim from § 02).
    const result = runIrlProvenanceCheck({
      filledIrl: SAMPLE_IRL,
      citations: [
        {
          path: '_audit.headcount.citation',
          citation:
            'Section 02 — Eng squad breakdown listed as 38 product 8 SRE 3 security 7 data 2 platform across the company',
        },
      ],
    });
    expect(result.verifiedFuzzy + result.verified).toBe(1);
    expect(['verified', 'verified-fuzzy']).toContain(result.verdicts[0].status);
  });

  it(`rejects a fuzzy match when the longest run is below FUZZY_MIN_RUN (${FUZZY_MIN_RUN})`, () => {
    // "Engineering FTE 71" — only "engineering fte" might match (run = 2)
    const result = runIrlProvenanceCheck({
      filledIrl: SAMPLE_IRL,
      citations: [
        {
          path: '_audit.headcount.citation',
          citation: 'Section 02 — Engineering FTE 71 product engineers across squads',
        },
      ],
    });
    expect(result.unverified).toBe(1);
    expect(result.verdicts[0].status).toBe('unverified');
  });
});

describe('runIrlProvenanceCheck — partner-supplied passthrough', () => {
  it('classifies the kickoff/handoff sentinel as partner-supplied', () => {
    const result = runIrlProvenanceCheck({
      filledIrl: SAMPLE_IRL,
      citations: [
        {
          path: '_audit.transactionType.citation',
          citation:
            'Section -- — partner-supplied form input — value sourced from prompt form, no IRL provenance available',
        },
      ],
    });
    expect(result.partnerSupplied).toBe(1);
    expect(result.verdicts[0].status).toBe('partner-supplied');
  });

  // BL-045 PR B audit M3 — coupling guard. The partner-supplied
  // classification REQUIRES both markers (`Section --` AND the literal
  // phrase `partner-supplied form input`). If a future kickoff/handoff
  // prompt rev shortens the citation to omit `partner-supplied form
  // input`, every Tier-3 partner-form citation falls through to the
  // fuzzy matcher and almost certainly classifies as `unverified` —
  // surfacing fake `provenance-gap:` entries in (J) for every
  // partner-form dimension.
  //
  // This test fails fast if the helper `buildPartnerSuppliedAudit`
  // citation prose drifts away from the dual-marker shape.
  it('verifies buildPartnerSuppliedAudit citations are recognized as partner-supplied', async () => {
    // Import lazily to avoid a cross-package cycle at module-load.
    const { buildPartnerSuppliedAudit } = await import('../../../src/schemas/diligence-audit');
    const audit = buildPartnerSuppliedAudit({
      transactionType: 'majority-stake',
      productType: 'b2b-saas',
      techArchetype: 'modern-cloud-native',
      headcount: '201-500',
      revenueRange: '25-100m',
      growthStage: 'scaling',
      companyAge: '10-20yr',
      geographies: ['us'],
      businessModel: 'productized-platform',
      scaleIntensity: 'moderate',
      transformationState: 'actively-modernizing',
      dataSensitivity: 'high',
      operatingModel: 'product-aligned-teams',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    // Sample one citation and verify the dual-marker classifier
    // accepts it.
    const citations = [
      { path: '_audit.transactionType.citation', citation: audit.transactionType.citation },
      { path: '_audit.headcount.citation', citation: audit.headcount.citation },
    ];
    const result = runIrlProvenanceCheck({ filledIrl: SAMPLE_IRL, citations });
    expect(result.partnerSupplied).toBe(citations.length);
  });

  it('does NOT classify a real "Section --" header as partner-supplied (requires both markers)', () => {
    // Edge case: an IRL with a literal "Section --" header wouldn't carry
    // the partner-supplied phrase. Verify the dual-marker discipline.
    const result = runIrlProvenanceCheck({
      filledIrl: SAMPLE_IRL,
      citations: [
        {
          path: '_audit.fake.citation',
          citation: 'Section -- — some unrelated text that does not appear in the irl',
        },
      ],
    });
    expect(result.partnerSupplied).toBe(0);
    expect(result.verdicts[0].status).toBe('unverified');
  });
});

describe('runIrlProvenanceCheck — fabrication rejection', () => {
  it('rejects an entirely fabricated excerpt', () => {
    const result = runIrlProvenanceCheck({
      filledIrl: SAMPLE_IRL,
      citations: [
        {
          path: '_audit.revenueRange.citation',
          citation:
            'Section 00 — Annual recurring revenue $128M with 220% YoY growth and 90 enterprise logos',
        },
      ],
    });
    expect(result.unverified).toBe(1);
    expect(result.verdicts[0].status).toBe('unverified');
  });

  it('classifies a citation with no em-dash + no match as unverified', () => {
    const result = runIrlProvenanceCheck({
      filledIrl: SAMPLE_IRL,
      citations: [{ path: 'odd', citation: 'this is just freeform text with no section anchor' }],
    });
    expect(result.unverified).toBe(1);
  });
});

describe('runIrlProvenanceCheck — aggregate counts', () => {
  it('counts each bucket independently across a mixed citations array', () => {
    const result = runIrlProvenanceCheck({
      filledIrl: SAMPLE_IRL,
      citations: [
        { path: 'a', citation: 'Section 02 — Engineering FTE count: 58 total' },
        { path: 'b', citation: 'Section -- — partner-supplied form input — n/a' },
        {
          path: 'c',
          citation: 'Section 00 — Fabricated $128M ARR with 220 yoy growth never tracked',
        },
      ],
    });
    expect(result.total).toBe(3);
    expect(result.verified + result.verifiedFuzzy).toBe(1);
    expect(result.partnerSupplied).toBe(1);
    expect(result.unverified).toBe(1);
    expect(result.verdicts.map((v) => v.path)).toEqual(['a', 'b', 'c']);
  });
});

// ─── BL-053 — citation array form (multi-bullet claim support) ──────────
//
// Each test pairs an array-form citation with the expected aggregate
// verdict per the BL-053 aggregation rule:
//
//   - ANY element unverified → aggregate unverified.
//   - ALL partner-supplied → partner-supplied.
//   - ALL verified verbatim → verified.
//   - Mixed verified + partner-supplied (no fuzzy, no unverified) → verified.
//   - Any verified-fuzzy in the mix → verified-fuzzy.
//
// Verdict echoes back the array shape unchanged so callers can attribute
// the verdict to their emitted citation structure.

describe('runIrlProvenanceCheck — BL-053 array-form citations', () => {
  it('aggregates ALL-verified array as verified', () => {
    const result = runIrlProvenanceCheck({
      filledIrl: SAMPLE_IRL,
      citations: [
        {
          path: 'techpar-paradigm',
          citation: [
            'Section 02 — Engineering FTE count: 58 total',
            'Section 00 — Annual recurring revenue: $45.2M Q1-FY26 annualized',
          ],
        },
      ],
    });
    expect(result.verdicts[0].status).toBe('verified');
    expect(result.verified).toBe(1);
    expect(Array.isArray(result.verdicts[0].citation)).toBe(true);
    expect((result.verdicts[0].citation as string[]).length).toBe(2);
  });

  it('aggregates ANY-unverified array as unverified (weakest verdict dominates)', () => {
    const result = runIrlProvenanceCheck({
      filledIrl: SAMPLE_IRL,
      citations: [
        {
          path: 'mixed',
          citation: [
            'Section 02 — Engineering FTE count: 58 total', // verified
            'Section 00 — Fabricated $999M ARR that does not appear anywhere', // unverified
          ],
        },
      ],
    });
    expect(result.verdicts[0].status).toBe('unverified');
    expect(result.unverified).toBe(1);
  });

  it('aggregates ALL-partner-supplied array as partner-supplied', () => {
    const result = runIrlProvenanceCheck({
      filledIrl: SAMPLE_IRL,
      citations: [
        {
          path: 'kickoff-form',
          citation: [
            'Section -- — partner-supplied form input — engagement code name',
            'Section -- — partner-supplied form input — partner lead name',
          ],
        },
      ],
    });
    expect(result.verdicts[0].status).toBe('partner-supplied');
    expect(result.partnerSupplied).toBe(1);
  });

  it('treats verified + partner-supplied mix as verified (partner-supplied does not taint)', () => {
    const result = runIrlProvenanceCheck({
      filledIrl: SAMPLE_IRL,
      citations: [
        {
          path: 'verdict-with-form-input',
          citation: [
            'Section 02 — Engineering FTE count: 58 total',
            'Section -- — partner-supplied form input — TechPar exit multiple assumption',
          ],
        },
      ],
    });
    expect(result.verdicts[0].status).toBe('verified');
    expect(result.verified).toBe(1);
  });

  it('downgrades to verified-fuzzy when any element verifies fuzzily', () => {
    const result = runIrlProvenanceCheck({
      filledIrl: SAMPLE_IRL,
      // First element is a verbatim substring; second is paraphrased with
      // foreign trailing words so it's NOT a substring but has a contiguous
      // ≥FUZZY_MIN_RUN-word run with the IRL — the (b) fuzzy verdict.
      // Uses the same fuzzy pattern shape as the existing single-citation
      // fuzzy test above (Eng squad breakdown line).
      citations: [
        {
          path: 'verified-plus-fuzzy',
          citation: [
            'Section 02 — Engineering FTE count: 58 total',
            'Section 02 — Eng squad breakdown listed as 38 product 8 SRE 3 security 7 data 2 platform across the company',
          ],
        },
      ],
    });
    expect(result.verdicts[0].status).toBe('verified-fuzzy');
    expect(result.verifiedFuzzy).toBe(1);
  });

  it('echoes the original array shape back in the verdict (string vs array)', () => {
    const result = runIrlProvenanceCheck({
      filledIrl: SAMPLE_IRL,
      citations: [
        { path: 'single', citation: 'Section 02 — Engineering FTE count: 58 total' },
        {
          path: 'multi',
          citation: ['Section 02 — Engineering FTE count: 58 total'],
        },
      ],
    });
    expect(typeof result.verdicts[0].citation).toBe('string');
    expect(Array.isArray(result.verdicts[1].citation)).toBe(true);
  });

  it('reports matchedSpan indicating multi-element aggregation', () => {
    const result = runIrlProvenanceCheck({
      filledIrl: SAMPLE_IRL,
      citations: [
        {
          path: 'multi',
          citation: [
            'Section 02 — Engineering FTE count: 58 total',
            'Section 00 — Annual recurring revenue: $45.2M Q1-FY26 annualized',
          ],
        },
      ],
    });
    expect(result.verdicts[0].matchedSpan).toMatch(/2-element citation array/);
  });
});
