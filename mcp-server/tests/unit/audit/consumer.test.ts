/**
 * BL-033 Slice 3a — audit queue-consumer crash-safety tests.
 *
 * The consumer is the load-bearing correctness surface: a linear hash chain
 * over an at-least-once queue with batch redelivery. These tests exercise the
 * enumerated interleavings from ADR-0009 with an in-memory Upstash + R2, and
 * assert the invariant that an entry's seq is fixed at first sequencing and
 * never shifts / forks / duplicates on redelivery.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIT_SCHEMA_VERSION, type AuditEntry } from '../../../src/audit/entry';

// Controllable mock state (hoisted so the vi.mock factories can read it).
const state = vi.hoisted(() => ({
  redis: null as FakeRedisLike | null,
}));

interface FakeRedisLike {
  store: Map<string, unknown>;
  get<T>(key: string): Promise<T | null>;
  mget<T extends unknown[]>(...keys: string[]): Promise<T>;
  multi(): { set(k: string, v: unknown): unknown; exec(): Promise<unknown[]> };
}

vi.mock('../../../src/lib/upstash-clients', () => ({
  createMcpClient: () => state.redis,
}));

vi.mock('../../../src/lib/single-flight-lock', () => ({
  acquire: vi.fn().mockResolvedValue(true),
  release: vi.fn().mockResolvedValue(undefined),
}));

// Import AFTER the mocks are registered.
import { consumeAuditBatch } from '../../../src/audit/consumer';
import { acquire } from '../../../src/lib/single-flight-lock';

class FakeRedis implements FakeRedisLike {
  store = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | null> {
    return (this.store.get(key) as T) ?? null;
  }
  async mget<T extends unknown[]>(...keys: string[]): Promise<T> {
    return keys.map((k) => this.store.get(k) ?? null) as T;
  }
  multi() {
    const ops: Array<[string, unknown]> = [];
    const store = this.store;
    const tx = {
      set(k: string, v: unknown) {
        ops.push([k, v]);
        return tx;
      },
      async exec() {
        for (const [k, v] of ops) store.set(k, v);
        return [];
      },
    };
    return tx;
  }
}

interface FakeR2 {
  put: ReturnType<typeof vi.fn>;
  objects: Map<string, string>;
}

function makeR2(opts: { failFirstPut?: boolean; failAllPuts?: boolean } = {}): FakeR2 {
  const objects = new Map<string, string>();
  let calls = 0;
  const put = vi.fn(
    async (key: string, body: string, o?: { onlyIf?: { etagDoesNotMatch?: string } }) => {
      calls += 1;
      if (opts.failAllPuts) throw new Error('r2 down');
      if (opts.failFirstPut && calls === 1) throw new Error('r2 transient');
      // onlyIf etagDoesNotMatch '*' → object exists → precondition fails → null.
      if (o?.onlyIf?.etagDoesNotMatch === '*' && objects.has(key)) return null;
      objects.set(key, body);
      return { key };
    }
  );
  return { put, objects };
}

let r2: FakeR2;

function makeEnv(overrides: Record<string, unknown> = {}) {
  return {
    ENV_NAME: 'test',
    AUDIT_R2: r2 as unknown,
    UPSTASH_MCP_REST_URL: 'https://x',
    UPSTASH_MCP_REST_TOKEN: 't',
    ...overrides,
  } as unknown as Parameters<typeof consumeAuditBatch>[1];
}

function entry(id: string, overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    entryId: id,
    requestId: `req-${id}`,
    tsIso: '2026-07-26T12:00:00.000Z',
    keyOwner: 'RP',
    ipPrefix: '203.0.113.0',
    toolName: 'search_portfolio',
    inputParams: { q: id },
    outputBytes: 100,
    durationMs: 5,
    outcome: 'success',
    ...overrides,
  };
}

interface FakeBatch {
  messages: Array<{ id: string; body: AuditEntry }>;
  ackAll: ReturnType<typeof vi.fn>;
  retryAll: ReturnType<typeof vi.fn>;
}

function makeBatch(entries: AuditEntry[]): FakeBatch {
  return {
    messages: entries.map((body, i) => ({ id: `m${i}`, body })),
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  };
}

const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;

function run(batch: FakeBatch) {
  return consumeAuditBatch(batch as unknown as MessageBatch<AuditEntry>, makeEnv(), ctx);
}

/** Parse the projected R2 objects into chained entries, ordered by seq. */
function chainFromR2(): Array<{
  seq: number;
  entryId: string;
  prevHash: string;
  entryHash: string;
}> {
  return [...r2.objects.entries()]
    .map(([, body]) => JSON.parse(body))
    .sort((a, b) => a.seq - b.seq);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(acquire).mockResolvedValue(true);
  state.redis = new FakeRedis();
  r2 = makeR2();
});

describe('happy path', () => {
  it('sequences a batch, one immutable R2 object per entry, and acks', async () => {
    const batch = makeBatch([entry('a'), entry('b')]);
    await run(batch);

    expect(batch.ackAll).toHaveBeenCalledTimes(1);
    expect(batch.retryAll).not.toHaveBeenCalled();
    expect(r2.put).toHaveBeenCalledTimes(2);

    const chain = chainFromR2();
    expect(chain.map((e) => e.seq)).toEqual([0, 1]);
    expect(chain[0].entryId).toBe('a');
    expect(chain[1].entryId).toBe('b');
    // Chain linkage: entry 1's prevHash == entry 0's entryHash.
    expect(chain[1].prevHash).toBe(chain[0].entryHash);
  });

  it('assigns seq by sorted entryId, independent of arrival order', async () => {
    const batch = makeBatch([entry('z'), entry('a')]); // arrival z,a
    await run(batch);
    const chain = chainFromR2();
    // Sorted by entryId → a gets seq 0, z gets seq 1.
    expect(chain.find((e) => e.entryId === 'a')!.seq).toBe(0);
    expect(chain.find((e) => e.entryId === 'z')!.seq).toBe(1);
  });
});

describe('idempotent redelivery (same batch twice)', () => {
  it('does not re-sequence, re-projects to R2 (null precondition), still acks', async () => {
    const batch1 = makeBatch([entry('a'), entry('b')]);
    await run(batch1);
    const tipAfter1 = state.redis!.store.get('mcp:audit:chain-tip:test');

    const batch2 = makeBatch([entry('a'), entry('b')]); // redelivered
    await run(batch2);

    expect(batch2.ackAll).toHaveBeenCalledTimes(1);
    // Tip did not advance on the redelivery.
    expect(state.redis!.store.get('mcp:audit:chain-tip:test')).toEqual(tipAfter1);
    // Still exactly two objects, seq 0 and 1 — no duplicate / forked seq.
    expect(chainFromR2().map((e) => e.seq)).toEqual([0, 1]);
  });

  it('dedupes the SAME entryId appearing twice in one batch (producer retry double-enqueue)', async () => {
    // The producer's in-waitUntil retry can enqueue entryId 'a' twice; both
    // land in one batch as FRESH (no committed seqOf). Must become ONE seq /
    // ONE R2 object, not a fork.
    const batch = makeBatch([entry('a'), entry('a'), entry('b')]);
    await run(batch);

    expect(batch.ackAll).toHaveBeenCalledTimes(1);
    const chain = chainFromR2();
    // Two unique objects only (a→seq0, b→seq1); the duplicate 'a' collapsed.
    expect(chain.map((e) => e.seq)).toEqual([0, 1]);
    expect(chain.find((e) => e.seq === 0)!.entryId).toBe('a');
    expect(chain.find((e) => e.seq === 1)!.entryId).toBe('b');
    // Ledger recorded 'a' once, tip advanced to 1 (not 2).
    expect(state.redis!.store.get('mcp:audit:chain-tip:test')).toEqual({
      lastSeq: 1,
      lastHash: expect.any(String),
    });
  });
});

describe('crash after MULTI before R2 (interleaving a)', () => {
  it('re-projects on redelivery with no gap and no seq shift', async () => {
    // First delivery: MULTI commits, then the first R2 put throws → retryAll.
    r2 = makeR2({ failFirstPut: true });
    const batch1 = makeBatch([entry('a'), entry('b')]);
    await run(batch1);
    expect(batch1.retryAll).toHaveBeenCalledTimes(1);
    expect(batch1.ackAll).not.toHaveBeenCalled();
    // Tip DID advance (MULTI ran before the R2 failure).
    expect(state.redis!.store.get('mcp:audit:chain-tip:test')).toEqual({
      lastSeq: 1,
      lastHash: expect.any(String),
    });

    // Redelivery: entries already sequenced → re-projected, no re-sequence.
    r2 = makeR2(); // R2 healthy now
    const batch2 = makeBatch([entry('a'), entry('b')]);
    await run(batch2);
    expect(batch2.ackAll).toHaveBeenCalledTimes(1);
    const chain = chainFromR2();
    expect(chain.map((e) => e.seq)).toEqual([0, 1]);
    expect(chain[0].entryId).toBe('a');
    expect(chain[1].entryId).toBe('b');
  });
});

describe('recomposed redelivery (interleaving d)', () => {
  it('already-sequenced entries keep their seq; new entries append — no fork', async () => {
    // First delivery of [a,b] crashes after MULTI before R2.
    r2 = makeR2({ failAllPuts: true });
    await run(makeBatch([entry('a'), entry('b')]));
    expect(state.redis!.store.get('mcp:audit:chain-tip:test')).toEqual({
      lastSeq: 1,
      lastHash: expect.any(String),
    });

    // Redelivery batches [a,b] together with a genuinely new entry c.
    r2 = makeR2();
    const batch2 = makeBatch([entry('a'), entry('b'), entry('c')]);
    await run(batch2);

    const chain = chainFromR2();
    expect(chain.find((e) => e.entryId === 'a')!.seq).toBe(0);
    expect(chain.find((e) => e.entryId === 'b')!.seq).toBe(1);
    expect(chain.find((e) => e.entryId === 'c')!.seq).toBe(2); // appended, no shift
    // c chains off b — a clean, unforked chain.
    expect(chain[2].prevHash).toBe(chain[1].entryHash);
    expect(batch2.ackAll).toHaveBeenCalledTimes(1);
  });
});

describe('failure handling', () => {
  it('terminal R2 failure re-queues the whole batch, never acks', async () => {
    r2 = makeR2({ failAllPuts: true });
    const batch = makeBatch([entry('a')]);
    await run(batch);
    expect(batch.retryAll).toHaveBeenCalledTimes(1);
    expect(batch.ackAll).not.toHaveBeenCalled();
  });

  it('null/unbound Upstash re-queues rather than dropping (diverges from fail-open)', async () => {
    state.redis = null;
    const batch = makeBatch([entry('a')]);
    await run(batch);
    expect(batch.retryAll).toHaveBeenCalledTimes(1);
    expect(batch.ackAll).not.toHaveBeenCalled();
  });

  it('re-queues (does not ack) when the single-flight lock is held by a peer', async () => {
    vi.mocked(acquire).mockResolvedValueOnce(false);
    const batch = makeBatch([entry('a')]);
    await run(batch);
    expect(batch.retryAll).toHaveBeenCalledTimes(1);
    expect(batch.ackAll).not.toHaveBeenCalled();
  });
});
