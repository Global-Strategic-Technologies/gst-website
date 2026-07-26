/**
 * BL-033 Slice 3a — producer-side audit sink unit tests.
 *
 * The sink is fire-and-forget: `write()` hands a send-with-one-retry promise
 * to `waitUntil`. We capture that promise and await it to observe the retry /
 * swallow behavior (a real Worker resolves it via `ctx.waitUntil`).
 */
import { describe, expect, it, vi } from 'vitest';
import { NoopAuditSink, QueueAuditSink, type AuditSink } from '../../../src/audit/audit-sink';
import { AUDIT_SCHEMA_VERSION, type AuditEntry } from '../../../src/audit/entry';

function makeEntry(): AuditEntry {
  return {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    entryId: 'e-1',
    requestId: 'r-1',
    tsIso: '2026-07-26T00:00:00.000Z',
    keyOwner: 'RP',
    toolName: 'search_portfolio',
    inputParams: { query: 'x' },
    outputBytes: 10,
    durationMs: 5,
    outcome: 'success',
  };
}

interface Captured {
  sink: AuditSink;
  send: ReturnType<typeof vi.fn>;
  settle: () => Promise<void>;
}

function harness(send: ReturnType<typeof vi.fn>): Captured {
  const queued: Promise<unknown>[] = [];
  const waitUntil = (p: Promise<unknown>): void => {
    queued.push(p);
  };
  const sink = new QueueAuditSink({ send } as unknown as Queue<AuditEntry>, waitUntil);
  return { sink, send, settle: () => Promise.all(queued).then(() => undefined) };
}

describe('QueueAuditSink', () => {
  it('enqueues the entry via waitUntil(queue.send)', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const h = harness(send);
    h.sink.write(makeEntry());
    await h.settle();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ entryId: 'e-1' }));
  });

  it('retries once inside the waitUntil promise when the first send rejects', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(undefined);
    const h = harness(send);
    h.sink.write(makeEntry());
    await h.settle();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('swallows a persistent send failure (best-effort — never throws)', async () => {
    const send = vi.fn().mockRejectedValue(new Error('down'));
    const h = harness(send);
    expect(() => h.sink.write(makeEntry())).not.toThrow();
    await expect(h.settle()).resolves.toBeUndefined(); // no unhandled rejection
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('NoopAuditSink', () => {
  it('does nothing and never throws', () => {
    const sink = new NoopAuditSink();
    expect(() => sink.write(makeEntry())).not.toThrow();
  });
});
