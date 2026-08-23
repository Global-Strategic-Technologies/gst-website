/**
 * BL-123 / BL-124 — the server-held provenance that lets
 * `compose_dossier_envelope` cap an over-strong `irlSource` claim, and the
 * BL-124 inverse tests proving a flattened body is processed rather than
 * refused (BL-123 briefly refused it; the refusal was withdrawn).
 *
 * Both halves of one production failure. A run through Claude Desktop produced
 * a dossier whose body-binding hash did not match the source file: the client's
 * single-line argument input had collapsed every newline to a space, and
 * nothing on the server noticed. The same investigation found that the
 * provenance grade the run reported was a model assertion whose only evidence
 * was a copyable string.
 */

import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import type { MetricsContext } from '../../src/metrics/_index';
import { InMemoryIrlBodyCache } from '../../src/metrics/_index';
import {
  InMemoryIrlBodyProvenanceStore,
  type IrlBodyProvenanceStore,
} from '../../src/cache/irl-body-provenance';
import { handlePrepareIrlBodyTool } from '../../src/tools/prepare-irl-body';
import { handleValidateIrlProvenanceTool } from '../../src/tools/validate-irl-provenance';
import {
  computeIrlBodyHash,
  type ComposeDossierEnvelopeInput,
} from '../../src/schemas/compose-dossier-envelope';
import { handleComposeDossierEnvelopeTool } from '../../src/tools/compose-dossier-envelope';

const SAMPLE_IRL = [
  '# Information Request List — Sample (filled)',
  '',
  '## 00 — Basics',
  ...Array.from(
    { length: 40 },
    (_, i) =>
      `- ${String(i).padStart(2, '0')}-01 A long single-line answer of the kind real filled IRLs actually contain, which is why the detector tests for total collapse rather than a bytes-per-line ratio.`
  ),
].join('\n');

/** Exactly what the client does to a multi-line paste. */
const FLATTENED_IRL = SAMPLE_IRL.replace(/\n/g, ' ').trim();

interface ToolResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
}

function makeMetrics(provenance?: IrlBodyProvenanceStore): {
  metrics: MetricsContext;
  cache: InMemoryIrlBodyCache;
  provenance: IrlBodyProvenanceStore | undefined;
} {
  const cache = new InMemoryIrlBodyCache();
  const metrics: MetricsContext = {
    sink: { write: () => undefined },
    irlBodyCache: cache,
    ...(provenance ? { irlBodyProvenance: provenance } : {}),
  };
  return { metrics, cache, provenance };
}

describe('BL-124 — a flattened body is processed, not refused', () => {
  it('prepare_irl_body accepts it and caches it', async () => {
    // BL-123 returned `invalid-input` here. Withdrawn: verification normalises
    // whitespace away before matching, nothing reads line structure, and the
    // refusal left operators with no completing path at any realistic IRL size.
    const { metrics, cache } = makeMetrics(new InMemoryIrlBodyProvenanceStore());
    const result = (await handlePrepareIrlBodyTool(
      { filledIrl: FLATTENED_IRL },
      metrics
    )) as ToolResult;
    expect(result.isError).toBeUndefined();
    expect(await cache.get(computeIrlBodyHash(FLATTENED_IRL))).toBe(FLATTENED_IRL);
  });

  it('records newlineCount 0 on the provenance record — the surviving diagnostic', async () => {
    // This is what replaced the refusal: a number an operator can read, which
    // explains why the body will not hash-match the file on their disk.
    const store = new InMemoryIrlBodyProvenanceStore();
    const { metrics } = makeMetrics(store);
    await handlePrepareIrlBodyTool({ filledIrl: FLATTENED_IRL }, metrics);
    const record = await store.read(computeIrlBodyHash(FLATTENED_IRL));
    expect(record?.newlineCount).toBe(0);
    expect(record?.byteLength).toBe(Buffer.byteLength(FLATTENED_IRL, 'utf8'));
  });

  it('accepts the same body with its line breaks intact', async () => {
    const { metrics, cache } = makeMetrics(new InMemoryIrlBodyProvenanceStore());
    const result = (await handlePrepareIrlBodyTool(
      { filledIrl: SAMPLE_IRL },
      metrics
    )) as ToolResult;
    expect(result.isError).toBeUndefined();
    expect(await cache.get(computeIrlBodyHash(SAMPLE_IRL))).toBe(SAMPLE_IRL);
  });

  it('validate_irl_provenance accepts a flattened body passed directly', async () => {
    const { metrics } = makeMetrics();
    const result = (await handleValidateIrlProvenanceTool(
      { filledIrl: FLATTENED_IRL, citations: [{ path: 'x', citation: 'y' }] },
      metrics
    )) as ToolResult;
    expect(result.isError).toBeUndefined();
  });

  it('verifies a citation identically against the flattened and intact bodies', async () => {
    // The load-bearing evidence for the withdrawal: `normalizeForMatching`
    // collapses whitespace before matching, so flattening is a provable no-op
    // for the only check the provenance chain actually runs.
    const { metrics } = makeMetrics();
    const citation = [{ path: 'arr', citation: 'Section 00 — A long single-line answer' }];
    const intact = (await handleValidateIrlProvenanceTool(
      { filledIrl: SAMPLE_IRL, citations: citation },
      metrics
    )) as ToolResult;
    const flat = (await handleValidateIrlProvenanceTool(
      { filledIrl: FLATTENED_IRL, citations: citation },
      metrics
    )) as ToolResult;
    expect(flat.isError).toBeUndefined();
    expect(intact.isError).toBeUndefined();
    expect((flat.structuredContent as { verdicts?: unknown }).verdicts).toEqual(
      (intact.structuredContent as { verdicts?: unknown }).verdicts
    );
  });
});

describe('BL-123 — provenance minting', () => {
  it('defaults to the WEAKER value when the caller does not say', async () => {
    // The parameter is optional so existing single-argument callers compile;
    // defaulting to `prepare-tool` means an un-updated caller can only ever
    // mint the weaker grade, never the stronger.
    const store = new InMemoryIrlBodyProvenanceStore();
    const { metrics } = makeMetrics(store);
    await handlePrepareIrlBodyTool({ filledIrl: SAMPLE_IRL }, metrics);
    const record = await store.read(computeIrlBodyHash(SAMPLE_IRL));
    expect(record?.mintedBy).toBe('prepare-tool');
  });

  it('records prompt-render when the prompt registry mints it', async () => {
    const store = new InMemoryIrlBodyProvenanceStore();
    const { metrics } = makeMetrics(store);
    await handlePrepareIrlBodyTool({ filledIrl: SAMPLE_IRL }, metrics, 'prompt-render');
    const record = await store.read(computeIrlBodyHash(SAMPLE_IRL));
    expect(record?.mintedBy).toBe('prompt-render');
    expect(record?.newlineCount).toBeGreaterThan(0);
    expect(record?.mintedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('is first-write-wins: a later prepare-tool write cannot downgrade a render mint', async () => {
    // The sequence the prompt itself anticipates (BL-119 cycle 5): the server
    // pre-populates at render time, then the model calls `prepare_irl_body`
    // anyway. Last-write-wins would downgrade an honest run for a recovery the
    // prompt documents as benign.
    const store = new InMemoryIrlBodyProvenanceStore();
    const { metrics } = makeMetrics(store);
    await handlePrepareIrlBodyTool({ filledIrl: SAMPLE_IRL }, metrics, 'prompt-render');
    await handlePrepareIrlBodyTool({ filledIrl: SAMPLE_IRL }, metrics, 'prepare-tool');
    const record = await store.read(computeIrlBodyHash(SAMPLE_IRL));
    expect(record?.mintedBy).toBe('prompt-render');
  });

  it('records the newline count the detector measured, not a recomputation', async () => {
    const store = new InMemoryIrlBodyProvenanceStore();
    const { metrics } = makeMetrics(store);
    await handlePrepareIrlBodyTool({ filledIrl: SAMPLE_IRL }, metrics, 'prompt-render');
    const record = await store.read(computeIrlBodyHash(SAMPLE_IRL));
    expect(record?.newlineCount).toBe((SAMPLE_IRL.match(/\n/g) ?? []).length);
    expect(record?.byteLength).toBe(Buffer.byteLength(SAMPLE_IRL, 'utf8'));
  });

  it('does not throw when no provenance store is bound', async () => {
    // The posture that separates this store from the body cache: a missing
    // body corrupts the dossier, a missing provenance record only weakens an
    // audit claim. An unbound store must never fail a run.
    const { metrics } = makeMetrics(); // no provenance store
    const result = (await handlePrepareIrlBodyTool(
      { filledIrl: SAMPLE_IRL },
      metrics,
      'prompt-render'
    )) as ToolResult;
    expect(result.isError).toBeUndefined();
  });
});

describe('BL-123 — the cap, end to end through the tool handler', () => {
  function baseEnvelopeInput(
    irlSource: ComposeDossierEnvelopeInput['irlSource'],
    requireVerbatimBody = false
  ): ComposeDossierEnvelopeInput {
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
      claims: [{ claim: 'ARR ~$45.2M', citation: 'Section 00 — Basics', tier: '3' }],
      gaps: [],
      irlBodyHash: computeIrlBodyHash(SAMPLE_IRL),
      irlSource,
      requireVerbatimBody,
    };
  }

  /** Seed the cache and mint provenance as the given writer, then compose. */
  async function compose(
    mintedBy: 'prompt-render' | 'prepare-tool' | null,
    asserted: ComposeDossierEnvelopeInput['irlSource'],
    requireVerbatimBody = false
  ) {
    const store = new InMemoryIrlBodyProvenanceStore();
    const { metrics } = makeMetrics(store);
    if (mintedBy === null) {
      // Body present, provenance absent — a pre-deploy entry, an expired
      // record, or an unreadable store.
      await metrics.irlBodyCache?.set(computeIrlBodyHash(SAMPLE_IRL), SAMPLE_IRL);
    } else {
      await handlePrepareIrlBodyTool({ filledIrl: SAMPLE_IRL }, metrics, mintedBy);
    }
    return handleComposeDossierEnvelopeTool(
      baseEnvelopeInput(asserted, requireVerbatimBody),
      metrics
    );
  }

  const gapText = (result: { structuredContent?: unknown }): string =>
    (result.structuredContent as { gapListMarkdown?: string }).gapListMarkdown ?? '';

  it('caps an asserted -prepop over prepare-tool provenance and discloses it in (J)', async () => {
    const result = await compose('prepare-tool', 'partner-paste-verbatim-prepop');
    expect(result.isError).toBeUndefined();
    expect(gapText(result)).toContain('irlSource downgraded by the server');
  });

  it('leaves an asserted -prepop alone when the render minted the body, with no gap entry', async () => {
    const result = await compose('prompt-render', 'partner-paste-verbatim-prepop');
    expect(result.isError).toBeUndefined();
    expect(gapText(result)).not.toContain('irlSource downgraded by the server');
  });

  it('discloses an unverifiable -prepop claim rather than silently accepting it', async () => {
    const result = await compose(null, 'partner-paste-verbatim-prepop');
    expect(result.isError).toBeUndefined();
    expect(gapText(result)).toContain('could not be verified');
  });

  it('adds NO marker when a non-prepop claim has no provenance record', async () => {
    // The scoping rule that keeps this change additive. Marking every
    // metadata-absent run would append a line to every rendered gap list in
    // the suite — see the additivity guard in compose-dossier-envelope.test.ts.
    const result = await compose(null, 'partner-paste-verbatim');
    expect(gapText(result)).not.toContain('could not be verified');
    expect(gapText(result)).not.toContain('irlSource downgraded by the server');
  });

  it('the requireVerbatimBody gate still REJECTS a reconstruction run', async () => {
    // The inversion an early design would have shipped: deriving irlSource from
    // provenance would have handed this run a partner-paste grade and passed
    // the gate. UAT-07.6 classifies that as "the gate is not enforcing →
    // Fail — escalate".
    const result = await compose('prepare-tool', 'model-reconstruction-from-xlsx', true);
    expect(result.isError).toBe(true);
  });

  it('the gate still ACCEPTS a capped partner-paste run', async () => {
    // A cap only ever weakens, and the gate accepts both partner-paste forms —
    // so capping can never change a gate outcome for an honest caller.
    const result = await compose('prepare-tool', 'partner-paste-verbatim-prepop', true);
    expect(result.isError).toBeUndefined();
  });
});

describe('BL-124 — serverCachedBodyNewlines', () => {
  async function composeWith(body: string) {
    const { metrics } = makeMetrics(new InMemoryIrlBodyProvenanceStore());
    await handlePrepareIrlBodyTool({ filledIrl: body }, metrics, 'prompt-render');
    const result = await handleComposeDossierEnvelopeTool(
      {
        promptName: 'gst_irl_ingestion',
        promptVersion: '0.17.0',
        modelVersion: 'claude-opus-5',
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
          { claim: 'Sample', citation: 'Section 00 — A long single-line answer', tier: '3' },
        ],
        gaps: [],
        irlBodyHash: computeIrlBodyHash(body),
        irlSource: 'partner-paste-verbatim-prepop',
        requireVerbatimBody: false,
      },
      metrics
    );
    return result.structuredContent as {
      serverCachedBodyBytes?: number;
      serverCachedBodyNewlines?: number;
    };
  }

  it('reports 0 for a flattened body — the diagnostic that replaced the halt', async () => {
    const structured = await composeWith(FLATTENED_IRL);
    expect(structured.serverCachedBodyNewlines).toBe(0);
    expect(structured.serverCachedBodyBytes).toBe(Buffer.byteLength(FLATTENED_IRL, 'utf8'));
  });

  it('reports the real count for an intact body', async () => {
    const structured = await composeWith(SAMPLE_IRL);
    expect(structured.serverCachedBodyNewlines).toBe((SAMPLE_IRL.match(/\n/g) ?? []).length);
    expect(structured.serverCachedBodyNewlines).toBeGreaterThan(0);
  });

  it('is the ONLY field that separates the two — byte counts alone cannot', async () => {
    // The production artifact lost 141 newlines for a one-byte change in size.
    // A byte count on its own would have looked unremarkable, which is exactly
    // why the newline count is surfaced beside it rather than instead of it.
    const flat = await composeWith(FLATTENED_IRL);
    const intact = await composeWith(SAMPLE_IRL);
    expect(
      Math.abs((flat.serverCachedBodyBytes ?? 0) - (intact.serverCachedBodyBytes ?? 0))
    ).toBeLessThan(5);
    expect(flat.serverCachedBodyNewlines).not.toBe(intact.serverCachedBodyNewlines);
  });
});
