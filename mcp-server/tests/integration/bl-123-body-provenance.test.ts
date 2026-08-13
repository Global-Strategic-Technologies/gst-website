/**
 * BL-123 — body-structure refusal at every entry point, and the server-held
 * provenance that lets `compose_dossier_envelope` cap an over-strong
 * `irlSource` claim.
 *
 * Both halves of one production failure. A run through Claude Desktop produced
 * a dossier whose body-binding hash did not match the source file: the client's
 * single-line argument input had collapsed every newline to a space, and
 * nothing on the server noticed. The same investigation found that the
 * provenance grade the run reported was a model assertion whose only evidence
 * was a copyable string.
 */

import { describe, it, expect } from 'vitest';
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

describe('BL-123 — flattened body refusal', () => {
  it('prepare_irl_body refuses a flattened body as invalid-input', async () => {
    const { metrics } = makeMetrics(new InMemoryIrlBodyProvenanceStore());
    const result = (await handlePrepareIrlBodyTool(
      { filledIrl: FLATTENED_IRL },
      metrics
    )) as ToolResult;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('no line breaks at all');
    expect(result.content[0].text).toContain('client limitation');
  });

  it('refuses BEFORE minting a hash or writing the body to the cache', async () => {
    // A poisoned cache entry would stay live for the 4-hour TTL, ready to
    // satisfy a later hash-bind — so the refusal has to precede the write, not
    // merely follow it.
    const { metrics, cache } = makeMetrics(new InMemoryIrlBodyProvenanceStore());
    await handlePrepareIrlBodyTool({ filledIrl: FLATTENED_IRL }, metrics);
    expect(await cache.get(computeIrlBodyHash(FLATTENED_IRL))).toBeNull();
    expect(cache.size()).toBe(0);
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

  it('validate_irl_provenance refuses a flattened body passed directly', async () => {
    // The fourth surface a raw body can arrive through — the one the
    // interactive path's Step 3a instructs by name.
    const { metrics } = makeMetrics();
    const result = (await handleValidateIrlProvenanceTool(
      { filledIrl: FLATTENED_IRL, citations: [{ path: 'x', citation: 'y' }] },
      metrics
    )) as ToolResult;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('no line breaks at all');
  });

  it('validate_irl_provenance still accepts an intact body', async () => {
    const { metrics } = makeMetrics();
    const result = (await handleValidateIrlProvenanceTool(
      { filledIrl: SAMPLE_IRL, citations: [{ path: 'x', citation: 'y' }] },
      metrics
    )) as ToolResult;
    expect(result.isError).toBeUndefined();
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
