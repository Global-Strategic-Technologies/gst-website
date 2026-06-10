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
