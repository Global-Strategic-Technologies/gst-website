/**
 * BL-079 Part A — `prepare_irl_body` → `validate_irl_provenance` body-by-hash
 * integration test.
 *
 * Exercises the end-to-end flow the model uses in production once Part A
 * ships: the model emits the IRL body to `prepare_irl_body` ONCE, receives
 * the canonical 16-hex hash, and then passes only the hash to subsequent
 * `validate_irl_provenance` calls in the precheck loop. The server re-
 * hydrates the operator-supplied bytes from the shared `IrlBodyCache` and
 * runs citation matching against them — closing the 2026-06-07 night
 * exercise's 5/19 unverified citations + tier-mismatches damage.
 *
 * Tests assert:
 *   1. `prepare_irl_body` writes to the cache.
 *   2. `validate_irl_provenance({ irlBodyHash, citations })` resolves to a
 *      successful verdict using the cached body.
 *   3. The same cache + hash can be re-used across multiple validate calls
 *      (the precheck iteration pattern — model retries with refined
 *      citations after each verdict).
 *   4. A cache miss (TTL expiry / eviction) surfaces `Bl076BodyCacheMissError`
 *      so the model can fall back to re-calling `prepare_irl_body`.
 *   5. Backward-compat: the same handler still accepts `{ filledIrl, citations }`
 *      directly (no cache wiring needed for the legacy path).
 *   6. R-8 — `compose_dossier_envelope`'s internal `runIrlProvenanceCheck`
 *      call still validates under the BL-079 schema expansion (engine takes
 *      `{filledIrl, citations}` directly; not affected by the public-input
 *      schema's optionality).
 */

import { describe, it, expect } from 'vitest';
import { handlePrepareIrlBodyTool } from '../../src/tools/prepare-irl-body';
import { handleValidateIrlProvenanceTool } from '../../src/tools/validate-irl-provenance';
import { InMemoryIrlBodyCache } from '../../src/cache/irl-body-cache';
import { InMemoryIrlBodyProvenanceStore } from '../../src/cache/irl-body-provenance';
import {
  IrlExtractRecordSchema,
  IRL_EXTRACT_EXCERPT_CAP_CHARS,
  IRL_EXTRACT_RECORD_VERSION,
  IRL_EXTRACT_REF_FORMAT,
} from '../../src/schemas/irl-extract-record';
import { runIrlProvenanceCheck } from '../../src/schemas/validate-irl-provenance';
import { computeIrlBodyHash } from '../../src/schemas/compose-dossier-envelope';
import type { MetricsContext } from '../../src/metrics/_index';

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

const CITATIONS = [
  { path: 'sec-A.headline', citation: 'Section 00 — Annual recurring revenue: $45.2M' },
  { path: 'sec-B.headline', citation: 'Section 02 — Engineering FTE count: 58 total' },
];

function metricsWith(cache: InMemoryIrlBodyCache): MetricsContext {
  return {
    sink: { write: () => undefined },
    irlBodyCache: cache,
  };
}

function metricsWithProvenance(cache: InMemoryIrlBodyCache): MetricsContext {
  return {
    sink: { write: () => undefined },
    irlBodyCache: cache,
    irlBodyProvenance: new InMemoryIrlBodyProvenanceStore(),
  };
}

describe('BL-079 Part A — prepare → validate body-by-hash chain', () => {
  it('prepare_irl_body writes the body to cache; validate_irl_provenance re-hydrates via irlBodyHash', async () => {
    const cache = new InMemoryIrlBodyCache();
    const metrics = metricsWith(cache);

    // Step 1 — model calls prepare_irl_body with the full body.
    const prepareResult = await handlePrepareIrlBodyTool({ filledIrl: SAMPLE_IRL }, metrics);
    expect(prepareResult.isError).toBeUndefined();
    const prepared = prepareResult.structuredContent as { irlBodyHash: string; byteLength: number };
    expect(prepared.irlBodyHash).toMatch(/^[a-f0-9]{16}$/);

    // The cache MUST now contain the body keyed by the canonical hash.
    expect(cache.size()).toBe(1);

    // Step 2 — model calls validate with ONLY the hash. Server re-hydrates.
    const validateResult = await handleValidateIrlProvenanceTool(
      { irlBodyHash: prepared.irlBodyHash, citations: CITATIONS },
      metrics
    );
    expect(validateResult.isError).toBeUndefined();
    const verdict = validateResult.structuredContent as Record<string, unknown> & {
      total: number;
      verified: number;
    };
    expect(verdict.total).toBe(2);
    expect(verdict.verified).toBe(2);
  });

  it('multiple validate calls with the same hash re-use the cached body (precheck iteration pattern)', async () => {
    const cache = new InMemoryIrlBodyCache();
    const metrics = metricsWith(cache);
    const prepared = await handlePrepareIrlBodyTool({ filledIrl: SAMPLE_IRL }, metrics);
    const hash = (prepared.structuredContent as { irlBodyHash: string }).irlBodyHash;

    // Three rounds of validate, simulating the precheck iteration loop.
    for (let i = 0; i < 3; i++) {
      const result = await handleValidateIrlProvenanceTool(
        { irlBodyHash: hash, citations: CITATIONS },
        metrics
      );
      expect(result.isError).toBeUndefined();
      const v = result.structuredContent as { verified: number };
      expect(v.verified).toBe(2);
    }
  });

  it('cache miss surfaces Bl076BodyCacheMissError so the model can re-call prepare_irl_body', async () => {
    const cache = new InMemoryIrlBodyCache();
    const metrics = metricsWith(cache);
    // Operator-supplied hash but cache was never seeded (simulates TTL
    // expiry or eviction).
    const orphanHash = computeIrlBodyHash(SAMPLE_IRL);

    const result = await handleValidateIrlProvenanceTool(
      { irlBodyHash: orphanHash, citations: CITATIONS },
      metrics
    );
    expect(result.isError).toBe(true);
    const text = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
    expect(text).toMatch(/body-cache miss/);
    expect(text).toMatch(/prepare_irl_body/);
  });

  it('legacy path: handler still accepts { filledIrl, citations } directly with no cache wiring', async () => {
    // No irlBodyCache in metrics — proves the legacy path doesn't depend on it.
    const result = await handleValidateIrlProvenanceTool({
      filledIrl: SAMPLE_IRL,
      citations: CITATIONS,
    });
    expect(result.isError).toBeUndefined();
    const v = result.structuredContent as { verified: number };
    expect(v.verified).toBe(2);
  });

  it('R-8 — compose internal-call seam: runIrlProvenanceCheck engine input still validates with {filledIrl, citations}', () => {
    // The compose handler's internal call site at compose-dossier-envelope.ts
    // builds `{ filledIrl, citations }` and calls runIrlProvenanceCheck. The
    // engine type is now `RunIrlProvenanceCheckInput` (filledIrl REQUIRED)
    // — distinct from the public schema where filledIrl is optional. Assert
    // the engine accepts the shape the compose seam emits unchanged.
    const verdict = runIrlProvenanceCheck({
      filledIrl: SAMPLE_IRL,
      citations: CITATIONS,
    });
    expect(verdict.total).toBe(2);
    expect(verdict.verified).toBe(2);
  });

  it('hash format invariant: computeIrlBodyHash yields canonical 16-hex lowercase', () => {
    // The same hash function powers `prepare_irl_body` (writer) and the
    // validate body-by-hash lookup. Asserting the format invariant guards
    // against a future hash-function drift that would silently miss the
    // cache.
    const h = computeIrlBodyHash(SAMPLE_IRL);
    expect(h).toMatch(/^[a-f0-9]{16}$/);
  });
});

// ─── Session 2: a travelling extract record meets a cold body cache ────────
//
// The record is context-borne and crosses sessions by paste; the body cache
// behind its `_meta.irlBodyHash` lives 4 hours and will be gone. The suite
// above already pins the cache-miss failure by hash and full verdicts on the
// body path. What is new is the RECORD side of that flow — and the ordering,
// which is not a preference: the body-direct (`filledIrl`) form re-emits the
// whole body per call, the exact production damage recorded at
// `validate-irl-provenance.ts:12-19` (a 50 KB body emitted twice per precheck
// iteration, ~12 % byte loss), and real bodies run 60–80 KB, above the emission
// ceiling. **Re-seed first, then validate by hash.** Body-direct is the
// small-body fallback, not the lead.
describe('session 2 — an extract record arrives after the body cache has expired', () => {
  /** The record an earlier session emitted, as it would arrive by paste. */
  function recordFrom(irlBodyHash: string, generatedAt: string) {
    return {
      _meta: {
        recordVersion: IRL_EXTRACT_RECORD_VERSION,
        refFormat: IRL_EXTRACT_REF_FORMAT,
        irlBodyHash,
        irlSource: 'partner-paste-verbatim' as const,
        generatedAt,
        generatedAtSource: 'server-witnessed' as const,
        promptVersion: '0.29.0',
        excerptCapChars: IRL_EXTRACT_EXCERPT_CAP_CHARS,
        coverage: { answered: 2, rowsPresent: 6 },
      },
      facts: [
        {
          ref: '0-03',
          request: 'Annual recurring revenue',
          status: 'CLOSED' as const,
          excerpt: 'Annual recurring revenue: $45.2M Q1-FY26 annualized',
          value: { normalized: 45200000, unit: 'USD/yr' },
          tier: 2 as const,
        },
        {
          ref: '2-02',
          request: 'Engineering FTE count',
          status: 'CLOSED' as const,
          excerpt: 'Engineering FTE count: 58 total — 38 product, 8 SRE',
          value: { normalized: 58, unit: 'FTE' },
          tier: 1 as const,
        },
      ],
    };
  }

  it('a record minted in session 1 no longer resolves by hash in session 2, and the failure says how to recover', async () => {
    // Session 1: mint the record's provenance.
    const s1Cache = new InMemoryIrlBodyCache();
    const s1 = metricsWithProvenance(s1Cache);
    const prepared = (await handlePrepareIrlBodyTool({ filledIrl: SAMPLE_IRL }, s1))
      .structuredContent as { irlBodyHash: string; mintedAt?: string };
    expect(prepared.mintedAt, 'the record needs a server-witnessed timestamp').toBeTypeOf('string');

    const record = IrlExtractRecordSchema.parse(
      recordFrom(prepared.irlBodyHash, prepared.mintedAt as string)
    );

    // Session 2: fresh process, cold cache. The record travelled; the body
    // cache did not.
    const s2Cache = new InMemoryIrlBodyCache();
    const s2 = metricsWithProvenance(s2Cache);
    const cold = await handleValidateIrlProvenanceTool(
      { irlBodyHash: record._meta.irlBodyHash, citations: CITATIONS },
      s2
    );
    // It FAILS — it does not degrade to per-citation verdicts.
    expect(cold.isError).toBe(true);
    const text = cold.content?.[0]?.type === 'text' ? cold.content[0].text : '';
    expect(text).toMatch(/body-cache miss/);
    // And the message names the recovery, plus the session-2 case by name.
    expect(text).toMatch(/prepare_irl_body/);
    expect(text).toMatch(/earlier session/);
  });

  it('re-seed FIRST, then validate by hash — and the identity comparison against _meta.irlBodyHash passes on the same bytes', async () => {
    const s1 = metricsWithProvenance(new InMemoryIrlBodyCache());
    const prepared = (await handlePrepareIrlBodyTool({ filledIrl: SAMPLE_IRL }, s1))
      .structuredContent as { irlBodyHash: string; mintedAt?: string };
    const record = IrlExtractRecordSchema.parse(
      recordFrom(prepared.irlBodyHash, prepared.mintedAt as string)
    );

    const s2Cache = new InMemoryIrlBodyCache();
    const s2 = metricsWithProvenance(s2Cache);

    // Re-seed with the paired body. The hash to compare comes from the TOOL's
    // result — hand-computing it is forbidden by `prepare_irl_body`'s own
    // contract, so a test that computed it here would be pinning a mechanism
    // the model is told not to use.
    const reseeded = (await handlePrepareIrlBodyTool({ filledIrl: SAMPLE_IRL }, s2))
      .structuredContent as { irlBodyHash: string };
    expect(reseeded.irlBodyHash).toBe(record._meta.irlBodyHash);
    expect(s2Cache.size()).toBe(1);

    // Only now does the hash form work — and it produces real verdicts.
    const validated = await handleValidateIrlProvenanceTool(
      { irlBodyHash: record._meta.irlBodyHash, citations: CITATIONS },
      s2
    );
    expect(validated.isError).toBeUndefined();
    const verdict = validated.structuredContent as { total: number; verified: number };
    expect(verdict.total).toBe(2);
    expect(verdict.verified).toBe(2);
  });

  it('a re-paste that altered bytes re-seeds to a DIFFERENT hash — verification still runs, identity does not hold', async () => {
    // Hashing is byte-for-byte sha256 with no normalization, and paste paths
    // can legitimately alter bytes (the BL-124 flattened-paste case). So hash
    // equality attests IDENTITY, not verifiability — and a consumer that
    // treated inequality as a verification failure would refuse a run that is
    // fine, while one that ignored it would present a dossier as anchored on
    // bytes it was not.
    const s1 = metricsWithProvenance(new InMemoryIrlBodyCache());
    const prepared = (await handlePrepareIrlBodyTool({ filledIrl: SAMPLE_IRL }, s1))
      .structuredContent as { irlBodyHash: string; mintedAt?: string };
    const record = IrlExtractRecordSchema.parse(
      recordFrom(prepared.irlBodyHash, prepared.mintedAt as string)
    );

    // The same document, flattened by a single-line client field.
    const flattened = SAMPLE_IRL.replace(/\n/g, ' ');
    const s2 = metricsWithProvenance(new InMemoryIrlBodyCache());
    const reseeded = (await handlePrepareIrlBodyTool({ filledIrl: flattened }, s2))
      .structuredContent as { irlBodyHash: string };

    expect(reseeded.irlBodyHash).not.toBe(record._meta.irlBodyHash);

    // Verification still runs against the supplied bytes and still verifies —
    // `normalizeForMatching` collapses whitespace before matching, which is the
    // same transformation the client performed.
    const validated = await handleValidateIrlProvenanceTool(
      { irlBodyHash: reseeded.irlBodyHash, citations: CITATIONS },
      s2
    );
    expect(validated.isError).toBeUndefined();
    const verdict = validated.structuredContent as { total: number; verified: number };
    expect(verdict.verified).toBe(2);
  });

  it('mintedAt is the STORED value — a repeat call inside the window returns the original mint time', async () => {
    // First-write-wins. If `prepare_irl_body` returned its own clock instead of
    // the store's, a record built from a repeat call would carry a
    // `server-witnessed` timestamp the server never witnessed.
    const metrics = metricsWithProvenance(new InMemoryIrlBodyCache());
    const first = (await handlePrepareIrlBodyTool({ filledIrl: SAMPLE_IRL }, metrics))
      .structuredContent as { mintedAt?: string };
    await new Promise((r) => setTimeout(r, 5));
    // Pin that the second call's OWN clock would have produced a different
    // value. Without this the equality below is a false green whenever both
    // `toISOString()` reads land in the same millisecond — which is exactly
    // when a `prepare_irl_body` that ignored the store and returned its own
    // clock would sail through. ISO-8601 UTC strings order lexicographically.
    const afterSleep = new Date().toISOString();
    const second = (await handlePrepareIrlBodyTool({ filledIrl: SAMPLE_IRL }, metrics))
      .structuredContent as { mintedAt?: string };
    expect(first.mintedAt).toBeTypeOf('string');
    expect(
      afterSleep > first.mintedAt!,
      'the clock did not advance between the two calls — the assertion below proves nothing'
    ).toBe(true);
    expect(second.mintedAt).toBe(first.mintedAt);
  });

  it('with no provenance store bound, mintedAt is ABSENT rather than invented', async () => {
    // The store swallows its own failures by design, so "no record landed" is
    // a reachable state. An absent field is what selects the consumer's
    // model-asserted fallback; a present-but-invented one would launder a
    // model timestamp as server-witnessed.
    const result = await handlePrepareIrlBodyTool(
      { filledIrl: SAMPLE_IRL },
      metricsWith(new InMemoryIrlBodyCache())
    );
    const out = result.structuredContent as Record<string, unknown>;
    expect(Object.keys(out).sort()).toEqual(['byteLength', 'irlBodyHash']);
  });
});
