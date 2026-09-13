/**
 * Pay a Worker's first-use initialization inside `beforeAll`, where it is
 * budgeted, instead of inside the first `it`, where it is not.
 *
 * ## Why this exists (BL-149)
 *
 * `unstable_dev` resolves once the workerd process is SPAWNED, but the
 * first `worker.fetch()` still pays module-graph JIT and instantiation.
 * `beforeAll` carries an explicit `60_000`; an `it` carries vitest's
 * 5000ms default. Any file that leaves that cost unpaid bills it to its
 * first test, which then times out whenever the machine is slow enough.
 *
 * That produced 26 recorded flake instances over six weeks. The tell was
 * an exact 11-of-11 correlation: the only four Worker-booting files that
 * fetched inside `beforeAll` were the only four that passed on a machine
 * where the other seven failed deterministically.
 *
 * Measured on that machine (win32, wrangler 4.131.0, 50 isolated runs —
 * see `scripts/measure-worker-boot.mjs` and the findings doc):
 *
 * - `unstable_dev` resolve: ~350ms
 * - FIRST `/health` fetch: ~7.6s  ← the whole problem, 50/50 over 5000ms
 * - every later fetch: ~12ms
 * - first KV touch: ~1.0s, first `/mcp` call: ~95ms
 *
 * This is not a timeout problem and must not be fixed with a bigger
 * timeout: the cost is real, it is just placed in the wrong phase. Move
 * it into setup and the 5000ms default goes back to being a useful
 * signal — a warm fetch exceeding it is then a genuine regression.
 *
 * ## Why it warms rather than boots
 *
 * A full `bootWorker()` owning `unstable_dev` and `stop()` would hide the
 * per-file `vars` blocks, several of which are load-bearing test
 * documentation (`ratelimit`'s deliberately-absent Upstash bindings,
 * `trial-signup`'s "every trial dependency EXCEPT Upstash"). Those
 * differences are the point of those files, so they stay visible.
 *
 * ## Authentication is mandatory for `kv` and `mcp`
 *
 * `/admin/oauth/m2m-clients` runs `requireAdmin` and returns 401 BEFORE
 * touching `listM2mClients(env.OAUTH_KV)`; `/mcp` runs `authenticate()`
 * before reaching the agent path. An unauthenticated warm-up would come
 * back 401 in microseconds having warmed nothing, and would look like it
 * worked. So each of those subsystems requires its credential, and every
 * warm asserts it did not get a 401.
 */

import type { Unstable_DevWorker } from 'wrangler';

/**
 * - `module` — `GET /health`. Unauthenticated by design (`/health` is
 *   handled before the auth check), so it works in every file and is
 *   always the first thing warmed. This is the ~7.6s cost.
 * - `kv` — first touch of the KV-backed m2m client registry. Needs
 *   `adminKey`. BL-149 instance 18's victim was a test that paid this.
 * - `mcp` — first `/mcp` call: MCP handler plus server registry. Needs
 *   `bearer`.
 */
export type WarmSubsystem = 'module' | 'kv' | 'mcp';

export interface WarmOptions {
  /** Value of the worker's `MCP_ADMIN_KEY` var. Required for `kv`. */
  adminKey?: string;
  /** A bearer the worker accepts (e.g. its `MCP_KEY_RP`). Required for `mcp`. */
  bearer?: string;
}

/**
 * Warm `worker` so the listed subsystems are initialized before any test
 * runs. Call it at the end of `beforeAll`, inside that hook's budget.
 *
 * @throws if a subsystem is requested without the credential it needs, or
 * if a warm request comes back 401 — both mean the warm-up did not reach
 * the subsystem, and a silently ineffective warm-up is worse than none.
 */
export async function warmWorker(
  worker: Unstable_DevWorker,
  subsystems: readonly WarmSubsystem[] = ['module'],
  opts: WarmOptions = {}
): Promise<void> {
  // `module` is always warmed first: the other probes would otherwise pay
  // the module-graph cost themselves and misreport which subsystem is slow.
  const ordered: readonly WarmSubsystem[] = ['module', ...subsystems.filter((s) => s !== 'module')];

  for (const subsystem of ordered) {
    if (subsystem === 'module') {
      await worker.fetch('/health');
      continue;
    }

    if (subsystem === 'kv') {
      if (!opts.adminKey) {
        throw new Error(
          "warmWorker: subsystem 'kv' needs opts.adminKey (the worker's MCP_ADMIN_KEY var) — " +
            'without it the request is refused at requireAdmin and KV stays cold'
        );
      }
      const res = await worker.fetch('/admin/oauth/m2m-clients', {
        headers: { Authorization: `Bearer ${opts.adminKey}` },
      });
      assertReached(res.status, 'kv');
      continue;
    }

    if (!opts.bearer) {
      throw new Error(
        "warmWorker: subsystem 'mcp' needs opts.bearer (a key the worker accepts) — " +
          'without it the request is refused at authenticate() and the MCP path stays cold'
      );
    }
    const res = await worker.fetch('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.bearer}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'warm', method: 'tools/list', params: {} }),
    });
    assertReached(res.status, 'mcp');
  }
}

/**
 * Only 401 is treated as failure. The warm-up cares that the request
 * reached the subsystem's code path, not what it answered — asserting a
 * status would couple every booting file to that endpoint's contract.
 */
function assertReached(status: number, subsystem: WarmSubsystem): void {
  if (status === 401) {
    throw new Error(
      `warmWorker: '${subsystem}' warm-up got 401, so it never reached the subsystem — ` +
        'check the credential matches the var bound in this file’s unstable_dev call'
    );
  }
}
