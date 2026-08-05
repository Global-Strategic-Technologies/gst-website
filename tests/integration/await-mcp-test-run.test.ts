/**
 * BL-111 defect 1 — `scripts/await-mcp-test-run.sh` is the guard standing between a
 * production MCP deploy and a commit the test suite never validated (audit gap #7).
 * It is a shell script, and this repo has no shellcheck or shell lint of any kind, so
 * without this file NOTHING checks it before merge.
 *
 * The script's whole design is that its EXIT CODE, not its message text, is the contract:
 * exit 3 (suite still running) means "re-run the deploy" while exit 4 (no run ever
 * appeared) is the single case where `workflow_dispatch` — deploying with no test
 * verification at all — is the right operator action. Conflate them and the incident-issue
 * body tells an operator to deploy unverified because the suite was merely slow. So the
 * assertions here are codes, never strings.
 *
 * Method: drive the real script with a stubbed `gh` on PATH that returns a scripted
 * sequence of bodies, one per invocation. That exercises the loop predicate, the
 * transport/parse split and the cap arms for real — the parts that are pure control flow
 * and would otherwise only ever run during a production deploy.
 *
 * The one branch deliberately absent is the step-level `timeout-minutes: 6` row in the
 * incident table. That is a RUNNER behaviour (the step being killed), not a script code
 * path; stubbing it would test GitHub. Noted so nobody "completes" the matrix by adding it.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';

const SCRIPT = 'scripts/await-mcp-test-run.sh';
const SHA = 'a'.repeat(40);

const tmpRoot = mkdtempSync(join(tmpdir(), 'await-mcp-'));
afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));

let stubDir: string;
beforeEach(() => {
  stubDir = mkdtempSync(join(tmpRoot, 'case-'));
});

/**
 * Build a `gh` stub that emits a different response per invocation.
 *
 * `arms` are bash `case` arms keyed on the invocation number, so a sequence like
 * "absent, then queued, then green" is expressible — which is the entire point, since
 * every bug this script has had was about what happens BETWEEN two polls.
 *
 * The counter lives in a file rather than a variable because each invocation is a fresh
 * process.
 */
function writeStub(arms: string): void {
  const counter = join(stubDir, 'n').replace(/\\/g, '/');
  writeFileSync(
    join(stubDir, 'gh'),
    `#!/usr/bin/env bash
n=$(cat '${counter}' 2>/dev/null || echo 0)
n=$((n + 1)); echo "$n" > '${counter}'
case $n in
${arms}
esac
`,
    { mode: 0o755 }
  );
  chmodSync(join(stubDir, 'gh'), 0o755);
}

interface RunOpts {
  /** omit the key entirely to test the unset case */
  targetSha?: string;
  repo?: string;
  capS?: string;
  everyS?: string;
}

function run(opts: RunOpts = {}): { code: number; output: string; ms: number; attempts: number } {
  // Start from the real environment (bash, node and the stub all need PATH), then strip
  // every input the script reads so an "unset TARGET_SHA" case is genuinely unset rather
  // than inheriting a CI value.
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.TARGET_SHA;
  delete env.REPO;
  delete env.GITHUB_REPOSITORY;

  if (opts.targetSha !== undefined) env.TARGET_SHA = opts.targetSha;
  if (opts.repo !== undefined) env.REPO = opts.repo;
  // A 1 s cap with 0.2 s polls: the cap arms resolve in ~1.2 s. Cases that expect the loop
  // to reach a verdict pass a generous capS instead — the cap is an INPUT to those
  // assertions, not the thing under test, so there is no reason to run them near it and a
  // slow CI runner is a real failure mode. The script's cap is wall-clock (BL-111), so
  // these are real seconds.
  env.POLL_CAP_S = opts.capS ?? '1';
  env.POLL_EVERY_S = opts.everyS ?? '0.2';
  env.PATH = `${stubDir}${delimiter}${process.env.PATH ?? ''}`;

  const started = Date.now();
  const r = spawnSync('bash', [SCRIPT], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
    // spawnSync is synchronous, so vitest's testTimeout cannot interrupt it — a script
    // that failed to terminate would hang the whole CI job rather than turn a test red.
    // The non-terminating loop is a live failure mode (see the POLL_CAP_S validation), so
    // this bound is the difference between a red test and a stalled pipeline.
    timeout: 30_000,
  });
  const ms = Date.now() - started;
  // How many times the stub was actually invoked. An exit code alone cannot distinguish
  // "polled twice" from "polled forty times", which is precisely what the wall-clock cap
  // changed.
  let attempts: number;
  try {
    attempts = Number(readFileSync(join(stubDir, 'n'), 'utf8').trim()) || 0;
  } catch {
    // No counter file: the script exited before the first `gh` call (an input-validation
    // case), which is zero attempts.
    attempts = 0;
  }
  if (r.signal) throw new Error(`script did not terminate: killed by ${r.signal} after ${ms}ms`);
  return { code: r.status ?? -1, output: `${r.stdout ?? ''}${r.stderr ?? ''}`, ms, attempts };
}

const body = (json: string) => {
  // The stub wraps JSON in single quotes, so an apostrophe would silently truncate the
  // fixture and the case would assert against a body nobody wrote.
  if (json.includes("'")) throw new Error('fixture JSON may not contain an apostrophe');
  return `printf '%s' '${json}'`;
};
const SUCCESS = '{"total_count":1,"workflow_runs":[{"status":"completed","conclusion":"success"}]}';
const PENDING = '{"total_count":1,"workflow_runs":[{"status":"in_progress","conclusion":null}]}';
const ABSENT = '{"total_count":0,"workflow_runs":[]}';
const CANCELLED_THEN_SUCCESS =
  '{"total_count":2,"workflow_runs":[{"status":"completed","conclusion":"cancelled"},{"status":"completed","conclusion":"success"}]}';
const CANCELLED_PLUS_PENDING =
  '{"total_count":2,"workflow_runs":[{"status":"completed","conclusion":"cancelled"},{"status":"in_progress","conclusion":null}]}';
const ALL_TERMINAL_NO_SUCCESS =
  '{"total_count":2,"workflow_runs":[{"status":"completed","conclusion":"cancelled"},{"status":"completed","conclusion":"failure"}]}';

describe('await-mcp-test-run.sh — the suite reached a verdict', () => {
  it('waits through absent then queued, and exits 0 on green (the race BL-111 fixes)', () => {
    writeStub(`  1) ${body(ABSENT)} ;;
  2) ${body(PENDING)} ;;
  *) ${body(SUCCESS)} ;;`);
    expect(run({ targetSha: SHA, repo: 'o/r', capS: '20' }).code).toBe(0);
  });

  it('exits 0 when a cancelled run sits AHEAD of the successful one', () => {
    // The `head -1` trap: the list is newest-first and the upstream suite runs
    // cancel-in-progress, so selecting the first run would hard-fail a green SHA.
    writeStub(`  *) ${body(CANCELLED_THEN_SUCCESS)} ;;`);
    expect(run({ targetSha: SHA, repo: 'o/r', capS: '20' }).code).toBe(0);
  });

  it('keeps waiting when a cancelled run sits beside an in-flight one, then exits 0', () => {
    // The predicate bug fixed three times: "exit as soon as ANY run completes" fails a
    // SHA whose second run is still validating. Nothing else catches a fourth regression.
    writeStub(`  1|2) ${body(CANCELLED_PLUS_PENDING)} ;;
  *) ${body(CANCELLED_THEN_SUCCESS)} ;;`);
    expect(run({ targetSha: SHA, repo: 'o/r', capS: '20' }).code).toBe(0);
  });

  it('exits 1 fast when every run is terminal and none succeeded', () => {
    writeStub(`  *) ${body(ALL_TERMINAL_NO_SUCCESS)} ;;`);
    expect(run({ targetSha: SHA, repo: 'o/r', capS: '20' }).code).toBe(1);
  });

  it('exits 1 — not 3 — when the in-flight run concludes a failure', () => {
    // The complement of the cancelled+in-flight case: proves the loop TERMINATES on the
    // negative transition rather than polling to the cap.
    writeStub(`  1) ${body(CANCELLED_PLUS_PENDING)} ;;
  *) ${body(ALL_TERMINAL_NO_SUCCESS)} ;;`);
    expect(run({ targetSha: SHA, repo: 'o/r', capS: '20' }).code).toBe(1);
  });
});

describe('await-mcp-test-run.sh — cap arms (opposite operator actions)', () => {
  it('exits 4, not 3, when no run ever appears', () => {
    writeStub(`  *) ${body(ABSENT)} ;;`);
    expect(run({ targetSha: SHA, repo: 'o/r' }).code).toBe(4);
  });

  it('exits 3, not 4, when a run is present but still running', () => {
    // Exit 4 is the only code the incident table blesses `workflow_dispatch` for. Landing
    // here on a merely-slow suite would deploy with no verification.
    writeStub(`  *) ${body(PENDING)} ;;`);
    expect(run({ targetSha: SHA, repo: 'o/r' }).code).toBe(3);
  });

  it('exits 5 when gh fails at the transport layer on every attempt', () => {
    writeStub('  *) exit 1 ;;');
    expect(run({ targetSha: SHA, repo: 'o/r' }).code).toBe(5);
  });

  it('exits 6 when gh succeeds but no body is parseable', () => {
    writeStub("  *) printf '%s' 'not json at all' ;;");
    expect(run({ targetSha: SHA, repo: 'o/r' }).code).toBe(6);
  });

  it('exits 6, not 4, on valid JSON carrying no workflow_runs array', () => {
    // A GitHub error object served with a 200. Treating a missing array as "count 0"
    // would launder an API defect into "no run appeared" and route to workflow_dispatch.
    writeStub(`  *) ${body('{"message":"Not Found","documentation_url":"https://x"}')} ;;`);
    expect(run({ targetSha: SHA, repo: 'o/r' }).code).toBe(6);
  });

  it('exits 3, not 4, when a live count of 0 contradicts a run already seen', () => {
    // The cap arm is monotone: exit 4 needs BOTH a live final `count == 0` AND no sighting
    // in the window. The list endpoint's documented failure mode is lying about absence —
    // "list-visibility lag" is exit 4's own message — so a late 0 must not erase a run this
    // poll watched running, because 4 is the code that authorises an unverified deploy.
    writeStub(`  1) ${body(PENDING)} ;;
  *) ${body(ABSENT)} ;;`);
    expect(run({ targetSha: SHA, repo: 'o/r' }).code).toBe(3);
  });

  it('exits 3, not 5, when a run was seen in flight before the API stopped answering', () => {
    // 3 says "re-run this deploy"; 5 says "re-running will not help, fix the credential".
    // Opposite actions, so a late blip must not overwrite an observation the poll already
    // made. A remembered sighting can only ever route to 3 — exit 4, the code that
    // authorises an unverified deploy, still requires a LIVE final observation.
    writeStub(`  1) ${body(PENDING)} ;;
  *) exit 1 ;;`);
    expect(run({ targetSha: SHA, repo: 'o/r' }).code).toBe(3);
  });

  it('does NOT report exit 4 from a stale count once the API goes dead', () => {
    // One parseable "absent" response, then the API dies for the rest of the window. The
    // count from attempt 1 must not stand in for a live observation — that is exactly how
    // a dead credential would come to recommend an unverified deploy.
    writeStub(`  1) ${body(ABSENT)} ;;
  *) exit 1 ;;`);
    expect(run({ targetSha: SHA, repo: 'o/r' }).code).toBe(5);
  });
});

describe('await-mcp-test-run.sh — an API error is a retry, never an absence', () => {
  it('retries a transport failure and still exits 0 when the run turns green', () => {
    // Asserting the terminal outcome, not merely "it retried": "it retried" passes while
    // the error is being laundered into absence, which is the defect class this script
    // exists to remove.
    writeStub(`  1|2) exit 1 ;;
  *) ${body(SUCCESS)} ;;`);
    expect(run({ targetSha: SHA, repo: 'o/r', capS: '20' }).code).toBe(0);
  });

  it('retries an unparseable body and still exits 0 when the run turns green', () => {
    writeStub(`  1|2) printf '%s' '<html>proxy interstitial</html>' ;;
  *) ${body(SUCCESS)} ;;`);
    expect(run({ targetSha: SHA, repo: 'o/r', capS: '20' }).code).toBe(0);
  });
});

describe('await-mcp-test-run.sh — the cap is wall-clock, not a sleep accumulator', () => {
  it('terminates on elapsed real time even when the poll interval is zero', () => {
    // The discriminating case, and the reason it is worth its ~2 s: the cap this replaced
    // added POLL_EVERY_S per iteration, so a zero interval never reached it and the loop
    // ran forever — the step would be KILLED at `timeout-minutes: 6` emitting NO exit code,
    // in the one place an operator reads exit codes. Under a wall-clock cap a zero interval
    // is merely a fast spin that stops on time, which is why the validation allows 0.
    //
    // Every attempt costs ~0.5 s here, so an accumulator would also be caught by the
    // attempt count: real time reaches the cap in a handful of polls, sleep-time never.
    writeStub(`  *) sleep 0.5; ${body(ABSENT)} ;;`);
    const r = run({ targetSha: SHA, repo: 'o/r', capS: '2', everyS: '0' });
    expect(r.code).toBe(4);
    expect(r.ms).toBeLessThan(15_000);
    expect(r.attempts).toBeLessThan(12);
  });
});

describe('await-mcp-test-run.sh — inputs are validated before the first API call', () => {
  // Each of these would otherwise poll for the full window and report absence — exit 4,
  // the dangerous code, for what is a script bug.
  it('exits 2 on an unset TARGET_SHA', () => {
    writeStub(`  *) ${body(SUCCESS)} ;;`);
    const r = run({ repo: 'o/r' });
    expect(r.code).toBe(2);
    expect(r.output).toContain('TARGET_SHA is required');
    // The block's headline is "before the first API call", and only this proves it: every
    // other case here would also exit 2 by polling to a verdict against a stub that never
    // should have been reached.
    expect(r.attempts).toBe(0);
  });

  it('exits 2 on an empty REPO with no GITHUB_REPOSITORY', () => {
    writeStub(`  *) ${body(SUCCESS)} ;;`);
    expect(run({ targetSha: SHA, repo: '' }).code).toBe(2);
  });

  it('exits 2 on a malformed TARGET_SHA', () => {
    writeStub(`  *) ${body(SUCCESS)} ;;`);
    expect(run({ targetSha: 'not-a-sha', repo: 'o/r' }).code).toBe(2);
  });

  it('exits 2 on a TARGET_SHA with a valid line followed by junk', () => {
    // `grep -Eq '^...$'` matches per LINE, so this shape passed validation and reached the
    // URL. Bash's `[[ =~ ]]` anchors the whole string.
    writeStub(`  *) ${body(SUCCESS)} ;;`);
    expect(run({ targetSha: `${SHA}\nevil`, repo: 'o/r' }).code).toBe(2);
  });

  it('exits 2 on a malformed REPO', () => {
    writeStub(`  *) ${body(SUCCESS)} ;;`);
    expect(run({ targetSha: SHA, repo: 'not a repo' }).code).toBe(2);
  });

  it.each([
    ['POLL_CAP_S', { capS: '5m' }],
    ['POLL_EVERY_S', { everyS: 'abc' }],
  ])('exits 2 on a non-numeric %s', (_name, opts) => {
    // Neither failure is loud on its own. A bad cap makes the loop's only exit condition
    // an error, so it never terminates and the step is killed with NO exit code; a bad
    // interval makes `sleep` fail, which under `set -e` is exit 1 — read by the incident
    // table as "the suite ran and FAILED on this SHA. Do not deploy."
    writeStub(`  *) ${body(SUCCESS)} ;;`);
    expect(run({ targetSha: SHA, repo: 'o/r', ...opts }).code).toBe(2);
  });

  it('exits 2 — not 5 or 6 — when node is missing from PATH', () => {
    // The guard step runs BEFORE actions/setup-node, so it depends on the runner's
    // preinstalled toolchain. Without the probe a missing node burns the full cap and
    // blames a proxy, pointing the operator at the wrong repair entirely.
    // PATH is narrowed to the stub dir, which holds `gh` and nothing else — so `gh`
    // resolves and the probe must trip on `node` specifically. The inner shell is invoked
    // through `$BASH` (the running shell's own absolute path) rather than by name, because
    // a PATH that hides node hides bash too, and a 127 would prove nothing about the probe.
    writeStub(`  *) ${body(SUCCESS)} ;;`);
    // `cygpath -u` because a lone `C:/...` entry in PATH is not a path msys bash resolves;
    // on Linux there is no cygpath and the value is already POSIX, so the fallback stands.
    const r = spawnSync(
      'bash',
      [
        '-c',
        'P="$(cygpath -u "$STUB" 2>/dev/null || echo "$STUB")"; PATH="$P" "$BASH" "$TARGET_SCRIPT"',
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          STUB: stubDir.replace(/\\/g, '/'),
          TARGET_SCRIPT: SCRIPT,
          TARGET_SHA: SHA,
          REPO: 'o/r',
          POLL_CAP_S: '1',
          POLL_EVERY_S: '0.2',
        },
        encoding: 'utf8',
        timeout: 30_000,
      }
    );
    expect(r.status).toBe(2);
    expect(`${r.stdout}${r.stderr}`).toContain("'node' is not on PATH");
  });
});
