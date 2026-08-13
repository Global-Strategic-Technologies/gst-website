/**
 * BL-121 — `UpstashRunCallCounters` unit tests.
 *
 * The fake Redis below reproduces `@upstash/redis`'s REAL semantics, and one
 * of them is load-bearing: **`hgetall` returns `null` for a missing key**
 * (`deserialize4`, `chunk-S6LIPXJD.mjs`). A fake that returned `{}` instead
 * would let a naive pass-through implementation look correct here while
 * collapsing "no calls recorded" and "store unreachable" into one value in
 * production — and that distinction is what stops the envelope reporting
 * `countersScope: 'run'` over numbers it could not actually read.
 *
 * A stand-in that lies in the direction the ticket exists to correct is worse
 * than no test, so the fidelity of this fake is itself part of the contract.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  RUN_COUNTS_KEY_PREFIX,
  RUN_COUNTS_TTL_SECONDS,
  UpstashRunCallCounters,
} from '../../../src/metrics/run-call-counters';

/** Minimal Redis double with the hash semantics this module depends on. */
function fakeRedis(opts: { failOn?: 'hincrby' | 'expire' | 'hgetall' } = {}) {
  const hashes = new Map<string, Map<string, number>>();
  const expireCalls: Array<{ key: string; ttl: number }> = [];
  /** Commands executed OUTSIDE a transaction, so the pipelining is assertable. */
  let looseCommands = 0;

  const applyHincrby = (key: string, field: string, by: number) => {
    if (opts.failOn === 'hincrby') throw new Error('upstash down');
    const h = hashes.get(key) ?? new Map<string, number>();
    h.set(field, (h.get(field) ?? 0) + by);
    hashes.set(key, h);
    return h.get(field)!;
  };
  const applyExpire = (key: string, ttl: number) => {
    if (opts.failOn === 'expire') throw new Error('upstash down');
    expireCalls.push({ key, ttl });
    return 1;
  };

  /** Round trips actually made — `exec()` counts as ONE, however deep the tx. */
  const roundTrips = { count: 0 };

  const redis = {
    hashes,
    expireCalls,
    roundTrips,
    /** Commands issued OUTSIDE a transaction, so pipelining stays assertable. */
    get looseCommands() {
      return looseCommands;
    },
    /**
     * Upstash's pipeline: commands queue on the tx object and all of them
     * travel in ONE round trip at `exec()`. Modelled rather than aliased onto
     * the loose methods, because "one wrapper exit costs one round trip" is a
     * claim the module's docstring makes and the `retry: false` reasoning
     * depends on — a fake that let three sequential awaits pass would make
     * that claim untestable, which is how the three-RTT version shipped.
     */
    multi() {
      const queued: Array<() => unknown> = [];
      const tx = {
        hincrby(key: string, field: string, by: number) {
          queued.push(() => applyHincrby(key, field, by));
          return tx;
        },
        expire(key: string, ttl: number) {
          queued.push(() => applyExpire(key, ttl));
          return tx;
        },
        async exec() {
          roundTrips.count++;
          return queued.map((run) => run());
        },
      };
      return tx;
    },
    hincrby: vi.fn(async (key: string, field: string, by: number) => {
      looseCommands++;
      roundTrips.count++;
      return applyHincrby(key, field, by);
    }),
    expire: vi.fn(async (key: string, ttl: number) => {
      looseCommands++;
      roundTrips.count++;
      return applyExpire(key, ttl);
    }),
    hgetall: vi.fn(async (key: string) => {
      roundTrips.count++;
      if (opts.failOn === 'hgetall') throw new Error('upstash down');
      const h = hashes.get(key);
      // THE fidelity point: null on a missing key, not {}.
      if (!h || h.size === 0) return null;
      return Object.fromEntries(h) as Record<string, number>;
    }),
  };
  return redis;
}

type FakeRedis = ReturnType<typeof fakeRedis>;
const build = (r: FakeRedis) =>
  new UpstashRunCallCounters(
    r as unknown as ConstructorParameters<typeof UpstashRunCallCounters>[0]
  );

const RUN = 'a1b2c3d4e5f60718';
const KEY = `${RUN_COUNTS_KEY_PREFIX}${RUN}`;

describe('UpstashRunCallCounters — record', () => {
  it('increments `attempted` plus the outcome field, under a `<tool>.<field>` name', async () => {
    const redis = fakeRedis();
    await build(redis).record(RUN, 'validate_irl_provenance', 'success');
    expect(Object.fromEntries(redis.hashes.get(KEY)!)).toEqual({
      'validate_irl_provenance.attempted': 1,
      'validate_irl_provenance.succeeded': 1,
    });
  });

  it("maps the `'success'` EVENT onto the `succeeded` FIELD", async () => {
    // The event enum and the entry field are spelled differently. Writing the
    // event name straight through would leave `succeeded` reading 0 forever
    // and every identity depending on it silently false — the exact failure
    // class this module exists to close.
    const redis = fakeRedis();
    await build(redis).record(RUN, 'validate_irl_provenance', 'success');
    const fields = [...redis.hashes.get(KEY)!.keys()];
    expect(fields).toContain('validate_irl_provenance.succeeded');
    expect(fields).not.toContain('validate_irl_provenance.success');
  });

  it.each(['rejected', 'errored'] as const)('records the `%s` outcome verbatim', async (event) => {
    const redis = fakeRedis();
    await build(redis).record(RUN, 'validate_irl_provenance', event);
    expect(redis.hashes.get(KEY)!.get(`validate_irl_provenance.${event}`)).toBe(1);
  });

  it('re-issues EXPIRE on EVERY increment, not just the first', async () => {
    // Inherited from the BL-032.75 audit fix C1 on the egress counter: the
    // "only set the TTL when INCR returns 1" optimisation was non-atomic, so
    // an isolate evicted between INCR and EXPIRE left the key permanent.
    const redis = fakeRedis();
    const counters = build(redis);
    await counters.record(RUN, 'validate_irl_provenance', 'success');
    await counters.record(RUN, 'validate_irl_provenance', 'success');
    expect(redis.expireCalls).toEqual([
      { key: KEY, ttl: RUN_COUNTS_TTL_SECONDS },
      { key: KEY, ttl: RUN_COUNTS_TTL_SECONDS },
    ]);
  });

  it('costs exactly ONE round trip per wrapper exit', async () => {
    // The docstring claims this, and `retry: false` above it is justified by
    // keeping Upstash off the response path — a claim three sequential awaits
    // quietly falsified, at ~3 RTTs on every instrumented call. Asserted here
    // rather than trusted, because the comment stating it survived the version
    // that contradicted it.
    const redis = fakeRedis();
    await build(redis).record(RUN, 'validate_irl_provenance', 'success');
    expect(redis.roundTrips.count).toBe(1);
    expect(redis.looseCommands).toBe(0);
  });

  it('never throws when Upstash is down — a counter fault is not a tool failure', async () => {
    const redis = fakeRedis({ failOn: 'hincrby' });
    await expect(
      build(redis).record(RUN, 'validate_irl_provenance', 'success')
    ).resolves.toBeUndefined();
  });

  it('writes under the `mcp:` namespace the shared token is scoped to', async () => {
    // The ACL is `+@all ~mcp:*`. BL-076 shipped once with a non-conforming
    // prefix and spent a three-stage diagnostic chain discovering it as NOPERM.
    const redis = fakeRedis();
    await build(redis).record(RUN, 'validate_irl_provenance', 'success');
    expect([...redis.hashes.keys()][0]).toMatch(/^mcp:/);
  });
});

describe('UpstashRunCallCounters — snapshot', () => {
  it('returns `{}` (NOT null) for a run with no recorded calls', async () => {
    // `hgetall` hands back null here. Passing that through would make an
    // untouched run indistinguishable from an unreachable store, and the
    // envelope would downgrade a perfectly healthy run to `request` scope.
    const redis = fakeRedis();
    await expect(build(redis).snapshot(RUN)).resolves.toEqual({});
  });

  it('returns `null` ONLY when the store could not be read', async () => {
    const redis = fakeRedis({ failOn: 'hgetall' });
    await expect(build(redis).snapshot(RUN)).resolves.toBeNull();
  });

  it('projects the flat hash back into per-tool entries', async () => {
    const redis = fakeRedis();
    const counters = build(redis);
    await counters.record(RUN, 'validate_irl_provenance', 'success');
    await counters.record(RUN, 'validate_irl_provenance', 'success');
    await counters.record(RUN, 'validate_irl_provenance', 'rejected');
    await counters.record(RUN, 'compose_dossier_envelope', 'success');
    await expect(counters.snapshot(RUN)).resolves.toEqual({
      validate_irl_provenance: { attempted: 3, succeeded: 2, rejected: 1, errored: 0 },
      compose_dossier_envelope: { attempted: 1, succeeded: 1, rejected: 0, errored: 0 },
    });
  });

  it('defaults absent fields to 0 so a partial row still reads as a whole entry', async () => {
    const redis = fakeRedis();
    redis.hashes.set(KEY, new Map([['validate_irl_provenance.attempted', 2]]));
    await expect(build(redis).snapshot(RUN)).resolves.toEqual({
      validate_irl_provenance: { attempted: 2, succeeded: 0, rejected: 0, errored: 0 },
    });
  });

  it('ignores unknown fields rather than throwing', async () => {
    // A future counter field deployed ahead of a reader must not break reads.
    const redis = fakeRedis();
    redis.hashes.set(
      KEY,
      new Map([
        ['validate_irl_provenance.attempted', 1],
        ['validate_irl_provenance.somethingNew', 9],
        ['malformed-no-dot', 3],
      ])
    );
    await expect(build(redis).snapshot(RUN)).resolves.toEqual({
      validate_irl_provenance: { attempted: 1, succeeded: 0, rejected: 0, errored: 0 },
    });
  });

  it('parses string counter values (Upstash may return either)', async () => {
    const redis = fakeRedis();
    redis.hashes.set(
      KEY,
      new Map([['validate_irl_provenance.succeeded', '4' as unknown as number]])
    );
    const snap = await build(redis).snapshot(RUN);
    expect(snap!.validate_irl_provenance.succeeded).toBe(4);
  });

  it('keeps tool names containing dots intact (splits on the LAST dot)', async () => {
    const redis = fakeRedis();
    redis.hashes.set(KEY, new Map([['some.tool.name.attempted', 1]]));
    await expect(build(redis).snapshot(RUN)).resolves.toEqual({
      'some.tool.name': { attempted: 1, succeeded: 0, rejected: 0, errored: 0 },
    });
  });
});
