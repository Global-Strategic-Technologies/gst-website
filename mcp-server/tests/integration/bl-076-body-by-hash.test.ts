/**
 * BL-076 — body-by-hash integration test.
 *
 * Proves the prepare-then-compose contract end-to-end:
 *   1. `prepare_irl_body` writes the body to the shared `IrlBodyCache`.
 *   2. `compose_dossier_envelope` re-hydrates the body from cache and
 *      produces a normal envelope.
 *   3. Calling `compose_dossier_envelope` WITHOUT a preceding
 *      `prepare_irl_body` (cache miss) returns a structured
 *      `Bl076BodyCacheMissError` with actionable text.
 *   4. The hash-bind defense-in-depth check still runs after re-hydrate
 *      (cache-poisoning isn't reachable by construction, but the check is
 *      pinned so a future cache-key-collision regression surfaces).
 *
 * See: src/docs/adr/0002-irl-body-by-hash-cache.md
 */

import { describe, expect, it } from 'vitest';
import {
  InMemoryIrlBodyCache,
  IrlBodyCacheSizeExceededError,
} from '../../src/cache/irl-body-cache';
import { withToolMetrics, type MetricsContext } from '../../src/metrics/with-metrics';
import { handlePrepareIrlBodyTool } from '../../src/tools/prepare-irl-body';
import { handleComposeDossierEnvelopeTool } from '../../src/tools/compose-dossier-envelope';
import {
  computeIrlBodyHash,
  type ComposeDossierEnvelopeInput,
} from '../../src/schemas/compose-dossier-envelope';

const SAMPLE_IRL = `# IRL — BL-076-TestCo

## 00 — Basics

- Annual recurring revenue: $45.2M
- Headcount: 187
- Year-over-year growth rate: Revenue 62% YoY; headcount 55% YoY

## 02 — Software Architecture

- Engineering FTE count: 58 total
- Stack: TypeScript Node 22, Python 3.12, Aurora Postgres 15
`;

function makeMetrics(): { metrics: MetricsContext; cache: InMemoryIrlBodyCache } {
  const cache = new InMemoryIrlBodyCache();
  const metrics: MetricsContext = {
    sink: { write: () => undefined },
    irlBodyCache: cache,
  };
  return { metrics, cache };
}

function baseEnvelopeInput(): ComposeDossierEnvelopeInput {
  return {
    promptName: 'gst_irl_ingestion',
    promptVersion: '0.17.0',
    modelVersion: 'claude-opus-4-8',
    mode: 'full',
    auditLevel: 'debug',
    transactionContext: 'value-creation',
    fillRatio: { percent: 92, substantiveCells: 46, totalCells: 50, status: 'ok' },
    gatesPassed: ['generate_diligence_agenda'],
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
    gaps: [],
    irlBodyHash: computeIrlBodyHash(SAMPLE_IRL),
    irlSource: 'partner-paste-verbatim',
    requireVerbatimBody: false,
  };
}

describe('BL-076 — body-by-hash prepare-then-compose chain', () => {
  it('prepare_irl_body writes the body to the cache keyed by its canonical hash', async () => {
    const { metrics, cache } = makeMetrics();
    const result = await handlePrepareIrlBodyTool({ filledIrl: SAMPLE_IRL }, metrics);
    expect(result.isError).toBeUndefined();
    const hash = computeIrlBodyHash(SAMPLE_IRL);
    expect(await cache.get(hash)).toBe(SAMPLE_IRL);

    // Returned structured output carries the same hash + byteLength contract
    // (BL-068 output schema unchanged by BL-076).
    const structured = result.structuredContent as { irlBodyHash: string; byteLength: number };
    expect(structured.irlBodyHash).toBe(hash);
    expect(structured.byteLength).toBe(Buffer.byteLength(SAMPLE_IRL, 'utf8'));
  });

  it('compose_dossier_envelope re-hydrates the body from cache and produces a normal envelope', async () => {
    const { metrics } = makeMetrics();
    // Seed via prepare.
    await handlePrepareIrlBodyTool({ filledIrl: SAMPLE_IRL }, metrics);
    // Compose; should NOT carry filledIrl in the input, server re-hydrates.
    const result = await handleComposeDossierEnvelopeTool(baseEnvelopeInput(), metrics);
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.metaFenceMarkdown).toBeTypeOf('string');
    expect(structured.provenanceVerification).toBeDefined();
  });

  it('cache miss → Bl076BodyCacheMissError surfaced as isError with actionable text', async () => {
    const { metrics } = makeMetrics(); // cache empty, no prepare call
    const result = await handleComposeDossierEnvelopeTool(baseEnvelopeInput(), metrics);
    expect(result.isError).toBe(true);
    const text = result.content[0];
    if (text.type === 'text') {
      expect(text.text).toContain('body-cache miss');
      expect(text.text).toContain('prepare_irl_body');
    }
  });

  it('cache miss diagnostic names the offending hash', async () => {
    const { metrics } = makeMetrics();
    const input = baseEnvelopeInput();
    const result = await handleComposeDossierEnvelopeTool(input, metrics);
    if (result.content[0].type === 'text') {
      expect(result.content[0].text).toContain(input.irlBodyHash);
    }
  });

  it('BL-076 + BL-071 interaction: cache miss counts as `rejected` in serverToolCallCounts', async () => {
    // Wire counters + cache; trigger a miss; assert the wrapper's counter
    // outcome classification falls into `rejected`. This is the
    // BL-070→BL-071 audit reasoning: server-arithmetic detects model-
    // bypass attempts.
    const { InMemoryToolCallCounters } = await import('../../src/metrics/with-metrics');
    const counters = new InMemoryToolCallCounters();
    const cache = new InMemoryIrlBodyCache();
    const metrics: MetricsContext = {
      sink: { write: () => undefined },
      counters,
      irlBodyCache: cache,
    };
    const wrappedCompose = withToolMetrics(
      'compose_dossier_envelope',
      metrics,
      (payload: ComposeDossierEnvelopeInput) => handleComposeDossierEnvelopeTool(payload, metrics)
    );
    const result = await wrappedCompose(baseEnvelopeInput());
    expect(result.isError).toBe(true);
    const snap = counters.snapshot();
    expect(snap.compose_dossier_envelope).toEqual({
      attempted: 1,
      succeeded: 0,
      rejected: 1, // ← BL-076 cache-miss landed in the rejected bucket
      errored: 0,
    });
  });

  it('end-to-end: prepare → compose → verify serverToolCallCounts identity holds', async () => {
    const { InMemoryToolCallCounters } = await import('../../src/metrics/with-metrics');
    const counters = new InMemoryToolCallCounters();
    const cache = new InMemoryIrlBodyCache();
    const metrics: MetricsContext = {
      sink: { write: () => undefined },
      counters,
      irlBodyCache: cache,
    };

    // Wrap both tools the way the registry does.
    const wrappedPrepare = withToolMetrics(
      'prepare_irl_body',
      metrics,
      (payload: { filledIrl: string }) => handlePrepareIrlBodyTool(payload, metrics)
    );
    const wrappedCompose = withToolMetrics(
      'compose_dossier_envelope',
      metrics,
      (payload: ComposeDossierEnvelopeInput) => handleComposeDossierEnvelopeTool(payload, metrics)
    );

    await wrappedPrepare({ filledIrl: SAMPLE_IRL });
    const composeResult = await wrappedCompose(baseEnvelopeInput());
    expect(composeResult.isError).toBeUndefined();

    const snap = counters.snapshot();
    // prepare succeeded once.
    expect(snap.prepare_irl_body).toEqual({
      attempted: 1,
      succeeded: 1,
      rejected: 0,
      errored: 0,
    });
    // compose is in-flight at snapshot time (BL-071 semantic preserved).
    const structured = composeResult.structuredContent as {
      serverToolCallCounts?: Record<
        string,
        { attempted: number; succeeded: number; rejected: number; errored: number }
      >;
    };
    expect(structured.serverToolCallCounts).toBeDefined();
    expect(structured.serverToolCallCounts!.compose_dossier_envelope).toEqual({
      attempted: 1,
      succeeded: 0,
      rejected: 0,
      errored: 0,
    });
    expect(structured.serverToolCallCounts!.prepare_irl_body).toEqual({
      attempted: 1,
      succeeded: 1,
      rejected: 0,
      errored: 0,
    });
  });

  it('hash-bind defense-in-depth (cache-poisoning impossible by construction): rehydrated body matches the requested hash', async () => {
    const { metrics } = makeMetrics();
    await handlePrepareIrlBodyTool({ filledIrl: SAMPLE_IRL }, metrics);
    const hash = computeIrlBodyHash(SAMPLE_IRL);
    // Compose with the EXACT hash from prepare → re-hydrated body matches.
    const result = await handleComposeDossierEnvelopeTool(
      { ...baseEnvelopeInput(), irlBodyHash: hash },
      metrics
    );
    expect(result.isError).toBeUndefined();
  });

  // ─── BL-077a — fail-loud surfacing through prepare_irl_body handler ────

  it('BL-077a — prepare_irl_body returns isError + BL-077a diagnostic text when the underlying cache write fails silently', async () => {
    // Simulate the 2026-06-07 staging failure: cache.set silently fails
    // (returns nothing visible to the caller pre-BL-077a). Under BL-077a,
    // the UpstashIrlBodyCache layer throws IrlBodyCacheWriteFailedError,
    // and prepare_irl_body's handler catches it and surfaces an isError
    // tool result with the actionable diagnostic.
    const failingCache = {
      async get(): Promise<string | null> {
        return null;
      },
      async set(): Promise<void> {
        const { IrlBodyCacheWriteFailedError } = await import('../../src/cache/irl-body-cache');
        throw new IrlBodyCacheWriteFailedError(
          computeIrlBodyHash(SAMPLE_IRL),
          'write-returned-false'
        );
      },
    };
    const metrics: MetricsContext = {
      sink: { write: () => undefined },
      irlBodyCache: failingCache,
    };
    const result = await handlePrepareIrlBodyTool({ filledIrl: SAMPLE_IRL }, metrics);
    expect(result.isError).toBe(true);
    const text = result.content[0];
    if (text.type === 'text') {
      expect(text.text).toContain('IRL body cache write FAILED');
      expect(text.text).toContain('wrangler tail');
    }
    // BL-090: a write failure is OURS, not the model's input — deliberately not
    // `cache-miss`, which means "the body was never stored, call prepare_irl_body
    // first" and would send a client back into the call that just failed.
    expect(result.structuredContent).toMatchObject({ error: 'internal-error' });
  });

  it('a body over the per-entry size cap is invalid-input, not cache-miss (BL-090)', async () => {
    const oversizedCache = {
      get: async () => null,
      set: async () => {
        // The cap itself lives in the class (IRL_BODY_CACHE_MAX_BYTES); the
        // constructor takes only the offending byte length.
        throw new IrlBodyCacheSizeExceededError(999_999);
      },
    };
    const metrics: MetricsContext = {
      sink: { write: () => undefined },
      irlBodyCache: oversizedCache,
    };

    const result = await handlePrepareIrlBodyTool({ filledIrl: SAMPLE_IRL }, metrics);

    expect(result.isError).toBe(true);
    // The model can act on this one — trim the body and retry.
    expect(result.structuredContent).toMatchObject({ error: 'invalid-input' });
    // And the remediation prose reaches it byte-for-byte.
    const block = result.content[0];
    expect(block.type === 'text' ? block.text : '').toBe(
      (result.structuredContent as { message: string }).message
    );
  });
});
