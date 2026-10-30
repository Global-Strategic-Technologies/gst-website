/**
 * `scripts/await-push-run.sh` lets a PR run of test.yml / test-mcp-server.yml wait for the
 * push run already validating the same head commit, so the dedup can skip the repeat
 * instead of running every job twice (PR #590).
 *
 * The script's contract is that the wait is ADVISORY: it always exits 0 once it stops
 * waiting, and the caller's own dedup decides. So the defects worth catching are all
 * about waiting wrongly, and the assertions are about how long it waited (poll count,
 * elapsed time, which log line ended it) as much as the exit code:
 *
 *   - waiting on an API error body for the whole cap (the review's B1: `gh` prints an error
 *     body to stdout and skips `--jq`, which once read as a count);
 *   - waiting on a wedged run older than the push run's longest path (M1);
 *   - waiting on the PR run itself, which the `event=push` filter prevents.
 *
 * Driven against a stubbed `gh` through the shared harness in `helpers/bash-stub.ts`.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import {
  BASH,
  BASH_UTILS,
  body,
  stubArgs,
  stubAttempts,
  unset,
  writeStub as writeGhStub,
} from './helpers/bash-stub';

const SCRIPT = 'scripts/await-push-run.sh';
const SHA = 'b'.repeat(40);

const tmpRoot = mkdtempSync(join(tmpdir(), 'await-push-'));
afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));

let stubDir: string;
beforeEach(() => {
  stubDir = mkdtempSync(join(tmpRoot, 'case-'));
});
const writeStub = (arms: string): void => writeGhStub(stubDir, arms);

interface RunOpts {
  workflow?: string;
  headSha?: string;
  repo?: string;
  maxAgeS?: string;
}

function run(opts: RunOpts = {}): { code: number; output: string; ms: number; attempts: number } {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of ['WORKFLOW', 'HEAD_SHA', 'REPO', 'GITHUB_REPOSITORY', 'MAX_AGE_S', 'PATH']) {
    unset(env, name);
  }
  if (opts.workflow !== undefined) env.WORKFLOW = opts.workflow;
  if (opts.headSha !== undefined) env.HEAD_SHA = opts.headSha;
  if (opts.repo !== undefined) env.REPO = opts.repo;
  if (opts.maxAgeS !== undefined) env.MAX_AGE_S = opts.maxAgeS;
  env.POLL_EVERY_S = '0.2';
  env.FIRST_REPOLL_S = '0.2';
  env.PATH = [stubDir, ...BASH_UTILS, process.env.PATH ?? ''].join(delimiter);

  const started = Date.now();
  // Synchronous, so vitest cannot interrupt it: this bound turns a non-terminating
  // wait into a red test instead of a stalled job.
  const r = spawnSync(BASH, [SCRIPT], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
    timeout: 30_000,
  });
  const ms = Date.now() - started;
  if (r.signal) throw new Error(`script did not terminate: killed by ${r.signal} after ${ms}ms`);
  return {
    code: r.status ?? -1,
    output: `${r.stdout ?? ''}${r.stderr ?? ''}`,
    ms,
    attempts: stubAttempts(stubDir),
  };
}

/** A runs-list body; each run's `created_at` is `ageS` seconds before now. */
const runs = (...list: { status: string; ageS?: number; conclusion?: string | null }[]) =>
  JSON.stringify({
    total_count: list.length,
    workflow_runs: list.map((r) => ({
      status: r.status,
      conclusion: r.conclusion ?? null,
      created_at: new Date(Date.now() - (r.ageS ?? 5) * 1000).toISOString(),
    })),
  });

const VALID = { workflow: 'test.yml', headSha: SHA, repo: 'o/r', maxAgeS: '60' };

describe('await-push-run.sh — waits only while a recent push run is in flight', () => {
  it('nothing in flight: re-polls once for list lag, then stops', () => {
    writeStub(`  *) ${body(runs())} ;;`);
    const r = run(VALID);
    expect(r.code).toBe(0);
    expect(r.attempts).toBe(2);
    expect(r.output).toContain('no recent test.yml push run in flight');
  });

  it('in flight twice, then completed: waits through exactly three polls', () => {
    writeStub(`  1|2) ${body(runs({ status: 'in_progress' }))} ;;
  *) ${body(runs({ status: 'completed', conclusion: 'success' }))} ;;`);
    const r = run(VALID);
    expect(r.code).toBe(0);
    expect(r.attempts).toBe(3);
    expect(r.output).toContain('waiting on 1 in-flight test.yml push run(s)');
    expect(r.output).toContain('no recent test.yml push run in flight');
  });

  it('a queued run counts as in flight, and a finished one does not', () => {
    writeStub(`  1) ${body(runs({ status: 'queued' }, { status: 'completed', conclusion: 'failure' }))} ;;
  *) ${body(runs({ status: 'completed', conclusion: 'failure' }))} ;;`);
    const r = run(VALID);
    expect(r.code).toBe(0);
    expect(r.attempts).toBe(2);
    expect(r.output).toContain('waiting on 1 in-flight');
  });

  it('queries push runs only, for this workflow and head commit', () => {
    // The PR run reports the same head_sha: without event=push it would wait on itself.
    writeStub(`  *) ${body(runs())} ;;`);
    run(VALID);
    const queries = stubArgs(stubDir);
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      expect(q).toContain('repos/o/r/actions/workflows/test.yml/runs?');
      expect(q).toContain(`head_sha=${SHA}`);
      expect(q).toContain('event=push');
    }
  });
});

describe('await-push-run.sh — never stalls on something it cannot read', () => {
  it('an HTTP error body (gh exits 1 after printing it) counts as nothing in flight', () => {
    writeStub(`  *) printf '%s' '{"message":"Not Found","status":"404"}'; exit 1 ;;`);
    const r = run({ ...VALID, maxAgeS: '20' });
    expect(r.code).toBe(0);
    expect(r.attempts).toBe(2);
    expect(r.ms).toBeLessThan(10_000);
  });

  it('a non-JSON body counts as nothing in flight', () => {
    writeStub(`  *) printf '%s' '<html>proxy</html>' ;;`);
    const r = run({ ...VALID, maxAgeS: '20' });
    expect(r.code).toBe(0);
    expect(r.attempts).toBe(2);
  });

  it('JSON without a workflow_runs array counts as nothing in flight', () => {
    writeStub(`  *) ${body('{"message":"rate limited"}')} ;;`);
    const r = run({ ...VALID, maxAgeS: '20' });
    expect(r.code).toBe(0);
    expect(r.attempts).toBe(2);
  });
});

describe('await-push-run.sh — the cap is the push run age', () => {
  it('ignores an in-flight run older than MAX_AGE_S (a wedged run)', () => {
    writeStub(`  *) ${body(runs({ status: 'in_progress', ageS: 120 }))} ;;`);
    const r = run(VALID);
    expect(r.code).toBe(0);
    expect(r.attempts).toBe(2);
    expect(r.output).not.toContain('waiting on');
  });

  it('stops when a run it was waiting on ages out mid-wait', () => {
    // Created 1.5 s ago against a 3 s limit: counted at first, aged out ~1.5 s later.
    const aging = runs({ status: 'in_progress', ageS: 1.5 });
    writeStub(`  *) ${body(aging)} ;;`);
    const r = run({ ...VALID, maxAgeS: '3' });
    expect(r.code).toBe(0);
    expect(r.output).toContain('waiting on 1 in-flight');
    expect(r.output).toContain('no recent test.yml push run in flight');
    expect(r.output).not.toContain('cap reached');
  });

  it('a run that never ages out (clock skew) still ends at the wall-clock guard', () => {
    writeStub(`  *) ${body(runs({ status: 'in_progress', ageS: -3600 }))} ;;`);
    const r = run({ ...VALID, maxAgeS: '1' });
    expect(r.code).toBe(0);
    expect(r.output).toContain('cap reached');
    expect(r.ms).toBeLessThan(10_000);
  });
});

describe('await-push-run.sh — bad input is loud (exit 2, no API call)', () => {
  it.each([
    ['WORKFLOW missing', { ...VALID, workflow: undefined }],
    ['WORKFLOW not a .yml file name', { ...VALID, workflow: '../x' }],
    ['HEAD_SHA malformed', { ...VALID, headSha: 'abc' }],
    ['REPO malformed', { ...VALID, repo: 'no-slash' }],
    ['MAX_AGE_S missing', { ...VALID, maxAgeS: undefined }],
    ['MAX_AGE_S not whole seconds', { ...VALID, maxAgeS: '1.5' }],
  ])('%s', (_label, opts) => {
    writeStub(`  *) ${body(runs())} ;;`);
    const r = run(opts);
    expect(r.code).toBe(2);
    expect(r.attempts).toBe(0);
  });
});
