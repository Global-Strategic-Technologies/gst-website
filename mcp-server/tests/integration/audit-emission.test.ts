/**
 * BL-033 Slice 3a — end-to-end audit-emission integration test.
 *
 * Drives a real tool call through `createServer(env, { audit })` (the same
 * direct-createServer + in-memory SDK transport pattern as
 * `metrics-emission.test.ts` — NO `unstable_dev` boot) and asserts:
 *   1. exactly one audit entry is enqueued, carrying the full contract
 *      (requestId, ipPrefix, keyOwner, toolName, full inputParams, outputBytes,
 *      durationMs, outcome);
 *   2. the FULL input params reach ONLY the audit sink — the AE ops sink
 *      (`InMemorySink`) never receives them (they have no home in `MetricEvent`).
 */
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { InMemorySink } from '../../src/metrics/sinks/in-memory';
import { InMemoryIrlBodyCache } from '../../src/cache/irl-body-cache';
import { createServer } from '../../src/server';
import type { AuditEntry, AuditSink } from '../../src/audit/_index';
import type { Env } from '../../src/worker';

const KEY_OWNER = 'AUDIT_TEST';
const REQUEST_ID = 'req-fixed-uuid';
const IP_PREFIX = '203.0.113.0';

class CapturingAuditSink implements AuditSink {
  readonly entries: AuditEntry[] = [];
  write(entry: AuditEntry): void {
    this.entries.push(entry);
  }
}

interface Harness {
  metrics: InMemorySink;
  audit: CapturingAuditSink;
  client: Client;
}

async function buildHarness(): Promise<Harness> {
  const metrics = new InMemorySink();
  const audit = new CapturingAuditSink();
  const env: Env = {};
  const server = createServer(env, {
    radarSource: 'worker',
    metricsSink: metrics,
    keyOwner: KEY_OWNER,
    irlBodyCache: new InMemoryIrlBodyCache(),
    audit: { sink: audit, requestId: REQUEST_ID, ipPrefix: IP_PREFIX, keyOwner: KEY_OWNER },
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'audit-emission-test', version: '0.0.0' });
  await client.connect(clientTransport);
  return { metrics, audit, client };
}

describe('BL-033 Slice 3a — tool calls enqueue a compliance audit entry', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await buildHarness();
  });

  it('emits exactly one audit entry per tool call with the full contract', async () => {
    const before = h.audit.entries.length;
    await h.client.callTool({ name: 'search_portfolio', arguments: { search: 'tech' } });
    const emitted = h.audit.entries.slice(before);

    expect(emitted).toHaveLength(1);
    const entry = emitted[0];
    expect(entry.toolName).toBe('search_portfolio');
    expect(entry.requestId).toBe(REQUEST_ID);
    expect(entry.ipPrefix).toBe(IP_PREFIX);
    expect(entry.keyOwner).toBe(KEY_OWNER);
    expect(entry.outcome).toBe('success');
    expect(entry.outputBytes).toBeGreaterThan(0);
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
    expect(entry.entryId).toMatch(/[0-9a-f-]{36}/i);
    expect(typeof entry.tsIso).toBe('string');
    // Full input params are captured (the validated object incl. defaults).
    expect(entry.inputParams).toMatchObject({ search: 'tech' });
  });

  it('full input params reach ONLY the audit sink, never the AE ops sink', async () => {
    await h.client.callTool({ name: 'search_portfolio', arguments: { search: 'secret-query' } });

    // Audit sink saw the params.
    const auditHit = h.audit.entries.find(
      (e) => (e.inputParams as { search?: string })?.search === 'secret-query'
    );
    expect(auditHit).toBeDefined();

    // No metric event carries inputParams (MetricEvent has no such field —
    // guards against a future refactor that routes params through emit()).
    for (const ev of h.metrics.events) {
      expect(ev).not.toHaveProperty('inputParams');
      expect(JSON.stringify(ev)).not.toContain('secret-query');
    }
  });
});
