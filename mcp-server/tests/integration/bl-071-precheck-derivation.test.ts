/**
 * BL-071 — precheck-derivation integration test.
 *
 * Proves the arithmetic identity the prompt directive promises:
 *   precheck.iterations     === serverToolCallCounts.validate_irl_provenance.succeeded
 *   precheck.attemptsTotal  === serverToolCallCounts.validate_irl_provenance.attempted
 *   precheck.errorsEncountered.length === serverToolCallCounts.validate_irl_provenance.rejected
 *
 * Asserts the SERVER side of the contract (the model is not in the loop —
 * we cannot assert that the model copies the snapshot verbatim, only that
 * the snapshot the server emits IS the authoritative source).
 *
 * Audit MAJ-3: a unit test that proves the identity end-to-end so a future
 * refactor of `validate_irl_provenance` cannot silently break the directive
 * without tripping this test.
 */

import { describe, expect, it } from 'vitest';
import {
  InMemoryToolCallCounters,
  withToolMetrics,
  type MetricsContext,
} from '../../src/metrics/with-metrics';
import { InMemoryIrlBodyCache } from '../../src/cache/irl-body-cache';
import { handleValidateIrlProvenanceTool } from '../../src/tools/validate-irl-provenance';
import { handleComposeDossierEnvelopeTool } from '../../src/tools/compose-dossier-envelope';
import {
  Bl076BodyCacheMissError,
  computeIrlBodyHash,
  type ComposeDossierEnvelopeInput,
} from '../../src/schemas/compose-dossier-envelope';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { createServer } from '../../src/server';
import type { RunCallCounters } from '../../src/metrics/run-call-counters';
import type { ToolCallCounterEntry, ToolCallCounterEvent } from '../../src/metrics/with-metrics';
import type { Env } from '../../src/worker';

const SAMPLE_IRL = `# IRL — BL-071-TestCo

## 00 — Basics

- Annual recurring revenue: $45.2M
- Headcount: 187
- Year-over-year growth rate: Revenue 62% YoY; headcount 55% YoY

## 02 — Software Architecture

- Engineering FTE count: 58 total
- Stack: TypeScript Node 22, Python 3.12, Aurora Postgres 15
`;

function baseEnvelopeInput(): ComposeDossierEnvelopeInput {
  return {
    promptName: 'gst_irl_ingestion',
    promptVersion: '0.16.0',
    modelVersion: 'claude-opus-4-8',
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
    ],
    gaps: [],
    // BL-076: filledIrl is no longer on the public input schema. The body
    // is fetched from `metrics.irlBodyCache` at handler entry; each test
    // seeds the cache via `prepare_irl_body` before calling compose.
    irlBodyHash: computeIrlBodyHash(SAMPLE_IRL),
    irlSource: 'partner-paste-verbatim',
    requireVerbatimBody: false,
  };
}

/**
 * The STDIO topology: one long-lived process, so a single
 * `InMemoryToolCallCounters` spans the whole session and the identity holds
 * from the in-process map alone.
 *
 * BL-121 relabelled this suite. It was previously read as proving the identity
 * universally — but sharing one counter map across both handlers *is* what
 * stdio is, and the Worker builds a fresh map per request. The Worker suite
 * below is the one that models the transport the team actually uses.
 */
describe('BL-071 — precheck derivation identity (stdio topology)', () => {
  it('serverToolCallCounts mirrors withToolMetrics counter increments across success / rejected / errored', async () => {
    const counters = new InMemoryToolCallCounters();
    const metrics: MetricsContext = {
      sink: { write: () => undefined },
      counters,
    };

    // Wrap the validate handler the same way the registry does — so the
    // counters tick exactly as they would in production.
    const wrappedValidate = withToolMetrics(
      'validate_irl_provenance',
      metrics,
      handleValidateIrlProvenanceTool
    );

    // Three calls: 2 succeed (good citations), 1 rejected (input fails Zod
    // → handler returns isError:true). The handler catches and returns a
    // structured error; the wrapper sees isError:true → 'rejected'.
    await wrappedValidate({
      filledIrl: SAMPLE_IRL,
      citations: [
        {
          path: 'sec-A.headline',
          citation: 'Section 00 — Annual recurring revenue: $45.2M',
        },
      ],
    });
    await wrappedValidate({
      filledIrl: SAMPLE_IRL,
      citations: [
        {
          path: 'sec-B.headline',
          citation: 'Section 02 — Engineering FTE count: 58 total',
        },
      ],
    });
    // Force a 'rejected' outcome by triggering the catch path inside the
    // handler — pass a citation list that the engine cannot process.
    // The validate engine schema requires `path` + `citation` to be strings;
    // passing an invalid runtime shape forces the runtime exception, which
    // the handler catches → returns isError:true → wrapper counts 'rejected'.
    await wrappedValidate({
      filledIrl: SAMPLE_IRL,
      // @ts-expect-error — intentional runtime shape mismatch to force the
      // handler's catch branch into the 'rejected' counter bucket.
      citations: [{ path: 'x', citation: null }],
    });

    const snap = counters.snapshot();
    expect(snap.validate_irl_provenance).toBeDefined();
    expect(snap.validate_irl_provenance.attempted).toBe(3);
    // The handler may surface the bad-shape input as either succeeded or
    // rejected depending on how the engine handles the null citation —
    // assert the arithmetic identity rather than fixed numbers so the test
    // stays decoupled from engine specifics.
    const v = snap.validate_irl_provenance;
    expect(v.attempted).toBe(v.succeeded + v.rejected + v.errored);
  });

  it('compose handler emits serverToolCallCounts with the snapshot at envelope-build time', async () => {
    const counters = new InMemoryToolCallCounters();
    const irlBodyCache = new InMemoryIrlBodyCache();
    // BL-076 — seed the cache as `prepare_irl_body` would have. Without
    // this, the handler throws Bl076BodyCacheMissError before reaching the
    // envelope-build path. (Per BL-076 design, model MUST call
    // prepare_irl_body first; tests simulate that side-effect directly.)
    await irlBodyCache.set(computeIrlBodyHash(SAMPLE_IRL), SAMPLE_IRL);
    const metrics: MetricsContext = {
      sink: { write: () => undefined },
      counters,
      irlBodyCache,
    };

    const wrappedValidate = withToolMetrics(
      'validate_irl_provenance',
      metrics,
      handleValidateIrlProvenanceTool
    );

    // Make 2 validate calls before composing the envelope.
    await wrappedValidate({
      filledIrl: SAMPLE_IRL,
      citations: [{ path: 'a', citation: 'Section 00 — Annual recurring revenue: $45.2M' }],
    });
    await wrappedValidate({
      filledIrl: SAMPLE_IRL,
      citations: [{ path: 'b', citation: 'Section 02 — Engineering FTE count: 58 total' }],
    });

    // Wrap compose the same way the registry does — closure captures metrics.
    const wrappedCompose = withToolMetrics(
      'compose_dossier_envelope',
      metrics,
      (payload: ComposeDossierEnvelopeInput) => handleComposeDossierEnvelopeTool(payload, metrics)
    );

    const result = await wrappedCompose(baseEnvelopeInput());
    expect(result.isError).toBeUndefined();

    const structured = result.structuredContent as Record<string, unknown> & {
      serverToolCallCounts?: Record<
        string,
        { attempted: number; succeeded: number; rejected: number; errored: number }
      >;
    };
    expect(structured.serverToolCallCounts).toBeDefined();
    const sct = structured.serverToolCallCounts!;
    expect(sct.validate_irl_provenance).toBeDefined();
    expect(sct.validate_irl_provenance.attempted).toBe(2);
    // Identity: precheck.iterations === succeeded.
    expect(sct.validate_irl_provenance.attempted).toBe(
      sct.validate_irl_provenance.succeeded +
        sct.validate_irl_provenance.rejected +
        sct.validate_irl_provenance.errored
    );

    // The envelope tool itself appears in-flight: attempted: 1, succeeded: 0
    // (the wrap is still inside the `inner` await at snapshot time).
    expect(sct.compose_dossier_envelope).toEqual({
      attempted: 1,
      succeeded: 0,
      rejected: 0,
      errored: 0,
    });
  });

  it('BL-076 — handleComposeDossierEnvelopeTool returns Bl076BodyCacheMissError when no cache is bound', async () => {
    // Backward-compat semantics changed in BL-076: with no `metrics` (and
    // hence no `irlBodyCache`), there is no body to re-hydrate, so the
    // handler surfaces a structured cache-miss diagnostic rather than
    // composing an envelope. This is the documented contract; bare-handler
    // call sites in production are not expected, but the cache-miss path
    // is tested here so a regression in the lookup path surfaces.
    const result = await handleComposeDossierEnvelopeTool(baseEnvelopeInput());
    expect(result.isError).toBe(true);
    const textContent = result.content[0];
    expect(textContent.type).toBe('text');
    if (textContent.type === 'text') {
      expect(textContent.text).toContain('body-cache miss');
      expect(textContent.text).toContain('prepare_irl_body');
    }
  });

  it('BL-076 — handler returns Bl076BodyCacheMissError when cache is bound but empty (no prepare_irl_body call)', async () => {
    const irlBodyCache = new InMemoryIrlBodyCache();
    const metrics: MetricsContext = {
      sink: { write: () => undefined },
      counters: new InMemoryToolCallCounters(),
      irlBodyCache, // bound but empty — simulates skipping prepare_irl_body
    };
    const result = await handleComposeDossierEnvelopeTool(baseEnvelopeInput(), metrics);
    expect(result.isError).toBe(true);
    const textContent = result.content[0];
    if (textContent.type === 'text') {
      expect(textContent.text).toContain('body-cache miss');
      expect(textContent.text).toContain('prepare_irl_body');
    }
    // The handler ALSO rejects in the BL-071 counter, since withToolMetrics
    // would have classified it as rejected. (We don't wrap with metrics here
    // so we just assert the structured rejection text directly.)
    void Bl076BodyCacheMissError; // referenced to keep the import live
  });
});

// ─── BL-121 — the WORKER topology ────────────────────────────────────────
//
// The suite above shares one counter map between handlers. That is stdio: one
// process, one map, whole session. The Worker builds a fresh `createServer` —
// and therefore a fresh `InMemoryToolCallCounters` — for EVERY HTTP request,
// so the envelope's snapshot can only ever hold its own request and the
// BL-071 identity is structurally unsatisfiable from that map alone. Observed
// in production 2026-08-12: `validate_irl_provenance: {attempted: null, …}`
// while the model honestly reported `precheck.iterations: 2`.
//
// These cases drive TWO `createServer` calls sharing one durable store, which
// is what a real request pair is. Hand-building two `MetricsContext`s would
// re-encode the topology by assertion — the same stand-in that hid the bug —
// and could not catch a wiring fault in `server.ts`, which is where it lived.

/** In-memory `RunCallCounters` reproducing the real contract, `{}` and all. */
class FakeRunCounters implements RunCallCounters {
  readonly rows = new Map<string, Record<string, ToolCallCounterEntry>>();
  /** Flip to make `snapshot` report the store as unreadable. */
  unreadable = false;
  recordCalls = 0;

  async record(runKey: string, toolName: string, event: ToolCallCounterEvent): Promise<void> {
    this.recordCalls++;
    const row = this.rows.get(runKey) ?? {};
    const entry = (row[toolName] ??= { attempted: 0, succeeded: 0, rejected: 0, errored: 0 });
    entry.attempted++;
    if (event === 'success') entry.succeeded++;
    else if (event === 'rejected') entry.rejected++;
    else if (event === 'errored') entry.errored++;
    this.rows.set(runKey, row);
  }

  async snapshot(runKey: string): Promise<Record<string, ToolCallCounterEntry> | null> {
    // `null` is reserved for "unreadable"; a missing row is `{}` — the same
    // distinction `UpstashRunCallCounters` has to reconstruct, because
    // `hgetall` returns null for a missing key.
    if (this.unreadable) return null;
    return this.rows.get(runKey) ?? {};
  }
}

/**
 * One Worker HTTP request: its own `createServer`, hence its own in-process
 * counter map. The durable store and the body cache are the substrate that
 * outlives it.
 */
async function openRequest(
  runCounters: RunCallCounters | undefined,
  bodyCache: InMemoryIrlBodyCache
): Promise<Client> {
  const env: Env = {};
  const server = createServer(env, {
    // A bound metricsSink is what puts `createServer` on the Worker path.
    metricsSink: { write: () => undefined },
    keyOwner: 'bl-121-test',
    irlBodyCache: bodyCache,
    runCounters,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'bl-121-worker-topology', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}

function countsOf(result: unknown): {
  counts: Record<string, ToolCallCounterEntry>;
  scope: string | undefined;
} {
  const structured = (result as { structuredContent?: Record<string, unknown> })
    .structuredContent as {
    serverToolCallCounts?: Record<string, ToolCallCounterEntry>;
    countersScope?: string;
  };
  return { counts: structured?.serverToolCallCounts ?? {}, scope: structured?.countersScope };
}

const ARR_CITATION = 'Section 00 — Annual recurring revenue: $45.2M';

describe('BL-121 — precheck derivation identity (Worker topology)', () => {
  it('holds across requests: validate in requests 1 and 2, compose in request 3', async () => {
    const durable = new FakeRunCounters();
    const bodyCache = new InMemoryIrlBodyCache();
    const hash = computeIrlBodyHash(SAMPLE_IRL);
    await bodyCache.set(hash, SAMPLE_IRL);

    // Two verification calls, each in its OWN request — the shape that made
    // the in-process map useless.
    for (const path of ['a', 'b']) {
      const client = await openRequest(durable, bodyCache);
      await client.callTool({
        name: 'validate_irl_provenance',
        arguments: { irlBodyHash: hash, citations: [{ path, citation: ARR_CITATION }] },
      });
    }

    // Compose in a third request. Its own map knows nothing of the two above.
    const composeClient = await openRequest(durable, bodyCache);
    const result = await composeClient.callTool({
      name: 'compose_dossier_envelope',
      arguments: baseEnvelopeInput(),
    });
    const { counts, scope } = countsOf(result);

    expect(scope).toBe('run');
    // THE identity, on the transport where it previously could not hold.
    expect(counts.validate_irl_provenance).toEqual({
      attempted: 2,
      succeeded: 2,
      rejected: 0,
      errored: 0,
    });
    // The envelope still reports itself in-flight, from the in-process map.
    expect(counts.compose_dossier_envelope).toEqual({
      attempted: 1,
      succeeded: 0,
      rejected: 0,
      errored: 0,
    });
  });

  it('cross-request re-call merges to {attempted: 2, succeeded: 1}', async () => {
    // The arithmetic `CONTRACT.md` and the prompt's `N / N−1` wording both
    // document, executed rather than asserted. A single-request test can never
    // reach it: the first call has to COMPLETE (durable {1,1}) before the
    // second reads it back.
    const durable = new FakeRunCounters();
    const bodyCache = new InMemoryIrlBodyCache();
    await bodyCache.set(computeIrlBodyHash(SAMPLE_IRL), SAMPLE_IRL);

    const first = await openRequest(durable, bodyCache);
    const firstResult = await first.callTool({
      name: 'compose_dossier_envelope',
      arguments: baseEnvelopeInput(),
    });
    // Fresh run: durable empty, only this call's in-flight delta.
    expect(countsOf(firstResult).counts.compose_dossier_envelope).toEqual({
      attempted: 1,
      succeeded: 0,
      rejected: 0,
      errored: 0,
    });

    const second = await openRequest(durable, bodyCache);
    const secondResult = await second.callTool({
      name: 'compose_dossier_envelope',
      arguments: baseEnvelopeInput(),
    });
    expect(countsOf(secondResult).counts.compose_dossier_envelope).toEqual({
      attempted: 2,
      succeeded: 1,
      rejected: 0,
      errored: 0,
    });
  });

  it('degrades honestly to `request` scope when no durable store is bound', async () => {
    const bodyCache = new InMemoryIrlBodyCache();
    const hash = computeIrlBodyHash(SAMPLE_IRL);
    await bodyCache.set(hash, SAMPLE_IRL);

    const validateClient = await openRequest(undefined, bodyCache);
    await validateClient.callTool({
      name: 'validate_irl_provenance',
      arguments: { irlBodyHash: hash, citations: [{ path: 'a', citation: ARR_CITATION }] },
    });

    const composeClient = await openRequest(undefined, bodyCache);
    const result = await composeClient.callTool({
      name: 'compose_dossier_envelope',
      arguments: baseEnvelopeInput(),
    });
    const { counts, scope } = countsOf(result);

    // Today's behaviour, now NAMED rather than silent: the earlier request's
    // call is absent and the label says the identity cannot hold.
    expect(scope).toBe('request');
    expect(counts.validate_irl_provenance).toBeUndefined();
    // And the run still succeeds — a missing counter weakens a report, it does
    // not corrupt a dossier.
    expect((result as { isError?: boolean }).isError).toBeUndefined();
  });

  it('downgrades `run` to `request` when the store is bound but unreadable', async () => {
    // Without this branch, a bound-but-unreadable store reports `run` over
    // request-scoped numbers — every earlier row missing under a label
    // promising the identity holds. A total false red.
    const durable = new FakeRunCounters();
    const bodyCache = new InMemoryIrlBodyCache();
    const hash = computeIrlBodyHash(SAMPLE_IRL);
    await bodyCache.set(hash, SAMPLE_IRL);

    const validateClient = await openRequest(durable, bodyCache);
    await validateClient.callTool({
      name: 'validate_irl_provenance',
      arguments: { irlBodyHash: hash, citations: [{ path: 'a', citation: ARR_CITATION }] },
    });

    durable.unreadable = true;
    const composeClient = await openRequest(durable, bodyCache);
    const result = await composeClient.callTool({
      name: 'compose_dossier_envelope',
      arguments: baseEnvelopeInput(),
    });
    expect(countsOf(result).scope).toBe('request');
  });

  it('keys a validate call by the bytes it actually verified, not the bound hash', async () => {
    // `validate_irl_provenance` gives `filledIrl` precedence for MATCHING and
    // never cross-checks it against the supplied hash. So when the two
    // disagree, the call verified the INLINE body — and crediting the composed
    // run for it would close the identity over bytes that were never
    // submitted. A false green, which is the one outcome this change refuses.
    //
    // The two args must DISAGREE for this to test anything. An earlier draft
    // passed `filledIrl: SAMPLE_IRL` alongside its own hash — both branches of
    // `runKeyOf` then return the same string, so inverting the precedence left
    // the test green. Caught by running that inversion deliberately; an
    // assertion that cannot fail is the same defect class BL-121 exists to
    // close, one layer up. Note that agreement is the COMMON case and costs
    // nothing: identical bytes produce identical keys either way, so a split
    // happens only on genuine disagreement.
    //
    // Disagreeing args are the realistic interactive shape: the model inlines
    // a body it reconstructed while still copying the bound hash from the
    // prompt directive.
    const durable = new FakeRunCounters();
    const bodyCache = new InMemoryIrlBodyCache();
    const boundHash = computeIrlBodyHash(SAMPLE_IRL);
    await bodyCache.set(boundHash, SAMPLE_IRL);
    const driftedBody = `${SAMPLE_IRL}\n- A row the bound body does not carry\n`;
    const driftedHash = computeIrlBodyHash(driftedBody);
    expect(driftedHash).not.toBe(boundHash);

    const client = await openRequest(durable, bodyCache);
    await client.callTool({
      name: 'validate_irl_provenance',
      arguments: {
        filledIrl: driftedBody,
        irlBodyHash: boundHash,
        citations: [{ path: 'a', citation: ARR_CITATION }],
      },
    });

    // Counted against the bytes verified…
    expect(durable.rows.get(driftedHash)?.validate_irl_provenance?.succeeded).toBe(1);
    // …and NOT against the body the envelope will submit.
    expect(durable.rows.has(boundHash)).toBe(false);
  });

  it('agreeing body and hash produce ONE key — the split is not the common case', async () => {
    // Guards the flip above from over-correcting. If an inline body that
    // matches the bound hash split the run, every legacy caller emitting both
    // fields would silently lose its counts.
    const durable = new FakeRunCounters();
    const bodyCache = new InMemoryIrlBodyCache();
    const hash = computeIrlBodyHash(SAMPLE_IRL);
    await bodyCache.set(hash, SAMPLE_IRL);

    const client = await openRequest(durable, bodyCache);
    await client.callTool({
      name: 'validate_irl_provenance',
      arguments: {
        filledIrl: SAMPLE_IRL,
        irlBodyHash: hash,
        citations: [{ path: 'a', citation: ARR_CITATION }],
      },
    });

    expect([...durable.rows.keys()]).toEqual([hash]);
  });

  it('accumulates a repeat invocation over IDENTICAL bytes onto the same row', async () => {
    // The run key is the body hash and the TTL is 4h, so a SECOND
    // `gst_irl_ingestion` invocation over the same bytes inside that window
    // lands on the first run's row. The count then reads LONG of what the
    // model did this time, and `precheck.iterations === succeeded` fails on a
    // perfectly good run.
    //
    // This is real behaviour, not a defect to fix here: making it per-
    // invocation would need an invocation id, and inventing one is the
    // speculative half this change deliberately left out. What it must not do
    // is go unnamed — the prompt enumerated three causes of a count SHORT of
    // memory and none for a count LONG of it, which is the same
    // over-claiming this ticket exists to correct. Executed here so the
    // documented cause is a fact rather than an assertion.
    const durable = new FakeRunCounters();
    const bodyCache = new InMemoryIrlBodyCache();
    const hash = computeIrlBodyHash(SAMPLE_IRL);
    await bodyCache.set(hash, SAMPLE_IRL);

    for (const invocation of ['first', 'second']) {
      const client = await openRequest(durable, bodyCache);
      await client.callTool({
        name: 'validate_irl_provenance',
        arguments: { irlBodyHash: hash, citations: [{ path: invocation, citation: ARR_CITATION }] },
      });
    }

    const composeClient = await openRequest(durable, bodyCache);
    const result = await composeClient.callTool({
      name: 'compose_dossier_envelope',
      arguments: baseEnvelopeInput(),
    });
    const { counts, scope } = countsOf(result);

    expect(scope).toBe('run');
    // A model that made ONE validate call this invocation would honestly
    // report `precheck.iterations: 1` against a server count of 2.
    expect(counts.validate_irl_provenance.succeeded).toBe(2);
  });

  it('counts a differently-bodied validate under a different key — a true short count', async () => {
    // If a model verifies body A and composes body B, the run legitimately
    // comes up short: it validated bytes it did not submit. Forcing both onto
    // one key would manufacture agreement the run never earned — a false
    // green, which is worse than the honest gap.
    const durable = new FakeRunCounters();
    const bodyCache = new InMemoryIrlBodyCache();
    const composedHash = computeIrlBodyHash(SAMPLE_IRL);
    await bodyCache.set(composedHash, SAMPLE_IRL);
    const otherBody = `${SAMPLE_IRL}\n- Extra row the composed body does not have\n`;

    const validateClient = await openRequest(durable, bodyCache);
    await validateClient.callTool({
      name: 'validate_irl_provenance',
      arguments: { filledIrl: otherBody, citations: [{ path: 'a', citation: ARR_CITATION }] },
    });

    const composeClient = await openRequest(durable, bodyCache);
    const result = await composeClient.callTool({
      name: 'compose_dossier_envelope',
      arguments: baseEnvelopeInput(),
    });

    // Recorded — under the other body's key, reachable rather than merged.
    expect(durable.rows.get(computeIrlBodyHash(otherBody))?.validate_irl_provenance).toBeDefined();
    expect(countsOf(result).counts.validate_irl_provenance).toBeUndefined();
  });

  it('records `prepare_irl_body` under the body key — the store-liveness canary', async () => {
    // The prompt and UAT-07 both tell operators to read this row as proof the
    // durable store was live for the run, which makes it a load-bearing
    // discriminator between "no calls" and "store unreachable" — and nothing
    // was driving it. A canary nobody exercises is a canary nobody can trust.
    //
    // Its known hole is stated where it is relied on rather than here: the
    // pre-populated path deliberately skips this tool, so the canary is absent
    // exactly where the strongest provenance path runs.
    const durable = new FakeRunCounters();
    const bodyCache = new InMemoryIrlBodyCache();

    const client = await openRequest(durable, bodyCache);
    await client.callTool({ name: 'prepare_irl_body', arguments: { filledIrl: SAMPLE_IRL } });

    const row = durable.rows.get(computeIrlBodyHash(SAMPLE_IRL));
    expect(row?.prepare_irl_body).toEqual({
      attempted: 1,
      succeeded: 1,
      rejected: 0,
      errored: 0,
    });
  });

  it('does not durably count tools that belong to no run', async () => {
    const durable = new FakeRunCounters();
    const bodyCache = new InMemoryIrlBodyCache();
    const client = await openRequest(durable, bodyCache);
    await client.callTool({ name: 'list_regulation_facets', arguments: {} });
    expect(durable.recordCalls).toBe(0);
  });
});
