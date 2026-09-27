/**
 * Unit tests for the Claude Code review-gate hooks (Design Review Gate +
 * Implementation Review Gate) and their installer.
 *
 * The gates are PreToolUse hook scripts whose exit codes are load-bearing:
 * exit 2 BLOCKS the tool call, exit 0 allows, anything else is NON-blocking
 * (fail-open) — so these tests assert exact exit codes, including the
 * fail-closed paths (missing/malformed/stale markers must exit 2, never 1).
 *
 * See DEVELOPER_TOOLING.md § Claude Code review gates.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

// Hook script lives outside src/ by design (.claude/hooks/); imported directly for unit tests.
import { isGitPush, pushSegments, pushedSources } from '../../.claude/hooks/push-review-gate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const PLAN_GATE = resolve(REPO_ROOT, '.claude/hooks/plan-review-gate.mjs');
const PUSH_GATE = resolve(REPO_ROOT, '.claude/hooks/push-review-gate.mjs');
const INSTALLER = resolve(REPO_ROOT, '.claude/hooks/install.mjs');

/** Run a hook script with fixture stdin + env; return {status, stderr}. */
function runHook(
  script: string,
  stdin: object,
  env: Record<string, string>
): { status: number; stderr: string } {
  try {
    execFileSync(process.execPath, [script], {
      input: JSON.stringify(stdin),
      env: { ...process.env, ...env },
      encoding: 'utf-8',
    });
    return { status: 0, stderr: '' };
  } catch (err) {
    const e = err as { status: number | null; stderr: string };
    return { status: e.status ?? -1, stderr: String(e.stderr ?? '') };
  }
}

const sha256 = (buf: Buffer | string) => createHash('sha256').update(buf).digest('hex');

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gst-hooks-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

describe('plan-review-gate (Design Review Gate)', () => {
  const env = () => ({ GST_HOOK_MARKER_DIR: dir });
  /** ExitPlanMode payload for the plan being exited (default: the reviewed plan.md). */
  const exiting = (planFilePath = join(dir, 'plan.md'), plan?: string) => ({
    tool_name: 'ExitPlanMode',
    tool_input: plan === undefined ? { planFilePath } : { plan, planFilePath },
  });

  function writePlanAndMarker(
    overrides: Record<string, unknown> = {},
    planText = '# The Plan\n\ndo things\n'
  ) {
    const planFile = join(dir, 'plan.md');
    writeFileSync(planFile, planText, 'utf-8');
    const marker = {
      verdict: 'APPROVE',
      blockers: [],
      majors: [],
      minors: [],
      reviewedPlanFile: planFile,
      planContentSha256: sha256(readFileSync(planFile)),
      reviewedAt: new Date().toISOString(),
      ...overrides,
    };
    writeFileSync(join(dir, 'plan-review.json'), JSON.stringify(marker), 'utf-8');
    return planFile;
  }

  it('blocks (exit 2) when no marker exists', () => {
    const r = runHook(PLAN_GATE, exiting(), env());
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Design Review Gate');
  });

  it('allows (exit 0) on fresh APPROVE with matching plan hash', () => {
    writePlanAndMarker();
    expect(runHook(PLAN_GATE, exiting(), env()).status).toBe(0);
  });

  it('re-allows without re-review when the plan is unchanged (no consumption)', () => {
    writePlanAndMarker();
    expect(runHook(PLAN_GATE, exiting(), env()).status).toBe(0);
    expect(runHook(PLAN_GATE, exiting(), env()).status).toBe(0); // user rejected, agent re-exits same plan
  });

  it('blocks when the plan was edited after review (hash mismatch)', () => {
    const planFile = writePlanAndMarker();
    writeFileSync(planFile, '# The Plan\n\ndo DIFFERENT things\n', 'utf-8');
    const r = runHook(PLAN_GATE, exiting(), env());
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('EDITED');
  });

  it('blocks on REVISE verdict', () => {
    writePlanAndMarker({ verdict: 'REVISE' });
    expect(runHook(PLAN_GATE, exiting(), env()).status).toBe(2);
  });

  it('allows USER_WAIVED with matching hash', () => {
    writePlanAndMarker({ verdict: 'USER_WAIVED', waiver: 'user said: skip review' });
    expect(runHook(PLAN_GATE, exiting(), env()).status).toBe(0);
  });

  it('blocks a stale (>24h) marker', () => {
    writePlanAndMarker({ reviewedAt: new Date(Date.now() - 25 * 3600_000).toISOString() });
    expect(runHook(PLAN_GATE, exiting(), env()).status).toBe(2);
  });

  it('fails CLOSED (exit 2, not 1) on malformed marker JSON', () => {
    writeFileSync(join(dir, 'plan-review.json'), '{not json', 'utf-8');
    expect(runHook(PLAN_GATE, exiting(), env()).status).toBe(2);
  });

  it('fails CLOSED when the referenced plan file is missing', () => {
    writePlanAndMarker({ reviewedPlanFile: join(dir, 'gone.md') });
    expect(runHook(PLAN_GATE, exiting(), env()).status).toBe(2);
  });

  // The marker must approve the plan being EXITED, not whichever plan it
  // names. On 2026-09-26 an APPROVE for an earlier plan let a new one exit.
  it('blocks when the marker reviewed a different plan file than the one being exited', () => {
    writePlanAndMarker();
    const other = join(dir, 'other-plan.md');
    writeFileSync(other, '# Another plan\n', 'utf-8');
    const r = runHook(PLAN_GATE, exiting(other), env());
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('you are exiting');
  });

  it('blocks when the plan being exited was edited after review', () => {
    const planFile = writePlanAndMarker();
    writeFileSync(planFile, '# The Plan\n\nedited\n', 'utf-8');
    expect(runHook(PLAN_GATE, exiting(planFile), env()).status).toBe(2);
  });

  it('falls back to the plan text when the payload has no planFilePath', () => {
    writePlanAndMarker();
    const payload = {
      tool_name: 'ExitPlanMode',
      tool_input: { plan: '# The Plan\r\n\r\ndo things' },
    };
    expect(runHook(PLAN_GATE, payload, env()).status).toBe(0);
  });

  it('blocks when the plan text differs from the reviewed plan', () => {
    writePlanAndMarker();
    const payload = { tool_name: 'ExitPlanMode', tool_input: { plan: '# A different plan\n' } };
    const r = runHook(PLAN_GATE, payload, env());
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('text mismatch');
  });

  it('fails CLOSED (exit 2, not 1) on a marker that is JSON null', () => {
    writeFileSync(join(dir, 'plan-review.json'), 'null', 'utf-8');
    expect(runHook(PLAN_GATE, exiting(), env()).status).toBe(2);
  });

  it('fails CLOSED when the payload names no plan at all', () => {
    writePlanAndMarker();
    const r = runHook(PLAN_GATE, {}, env());
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('names no plan');
  });

  // Windows paths are case-insensitive, and the harness and the reviewer can
  // spell the drive letter differently. CI runs on ubuntu, so this case only
  // runs on a local Windows checkout.
  it.skipIf(process.platform !== 'win32')(
    'matches the plan path case-insensitively on Windows',
    () => {
      const planFile = writePlanAndMarker();
      expect(runHook(PLAN_GATE, exiting(planFile.toUpperCase()), env()).status).toBe(0);
    }
  );
});

// ---------------------------------------------------------------------------

describe('push-review-gate: isGitPush command detection', () => {
  it.each([
    ['git push', true],
    ['git push origin master', true],
    ['git -C c:/Code/gst-website push', true],
    ['cd mcp-server; git push', true],
    ['npm run test:run && git push -u origin feat/x', true],
    ['git.exe push', true],
    ['echo done\ngit push', true], // newline-separated multi-line command
    ['sudo git push', true],
    ['git push\necho --dry-run', true], // --dry-run in a LATER segment must not exempt a real push
    ['git push --dry-run\ngit push', true], // second, real push after an exempt one
    ['cd x; git push --dry-run', false], // chained dry-run is still exempt (per-segment eval)
    // Wrapped pushes — each of these slipped past the gate before 2026-09-27.
    ['bash -c "git push origin x"', true],
    ["bash -lc 'git push'", true], // flag cluster containing c
    ['sh -ec "cd x && git push"', true],
    ["powershell -Command 'git push'", true],
    ['pwsh -NoProfile -ExecutionPolicy Bypass -Command "git push -u origin x"', true],
    ['powershell.exe -NoProfile -Command "& { git push }"', true], // script block body
    [`pwsh -EncodedCommand ${Buffer.from('git push', 'utf16le').toString('base64')}`, true],
    ['cmd /c git push', true],
    ['cmd.exe /d /c "git push origin x"', true],
    ['iex "git push"', true],
    ['& "C:\\Program Files\\Git\\cmd\\git.exe" push', true], // quoted path to git
    ['bash -c "bash -c \'git push\'"', true], // nested wrapper
    ['echo $(git push)', true], // command substitution
    // Command-position prefixes
    ['env GIT_TRACE=1 git push', true],
    ['GIT_TRACE=1 git push', true],
    ['echo origin | xargs git push', true],
    ['xargs -n 1 git push', true],
    ['nohup git push', true],
    ['command git push', true],
    // Found at code review, 2026-09-27
    ['eval "git push"', true],
    ['echo `git push`', true], // backtick command substitution
    ['powershell "git push"', true], // -Command is the default positional parameter
    ['powershell git push', true],
    ['pwsh -Com "git push"', true], // abbreviated -Command
    ['Invoke-Expression -Command "git push"', true],
    ['sudo -u me git push', true],
    ['for b in a; do git push; done', true], // `do` as a shell word still splits
    ['git push origin do-other:refs/heads/master', true], // `do` inside a ref must NOT split
    ['git push -n', false], // short dry run
    // Heredocs: a quoted delimiter makes the body literal data (a commit
    // message quoting `git push`), unless a shell reads it.
    ["cat > m.txt <<'EOF'\nfix: a bare `git push` here\ngit push\nEOF\ngit commit -F m.txt", false],
    ['cat > m.txt <<"EOF"\ngit push\nEOF', false],
    ["cat > m.txt <<-'EOF'\n\tgit push\n\tEOF", false],
    ["bash <<'EOF'\ngit push\nEOF", true], // a shell runs the body
    ["cat <<'EOF' > x.txt\ndon't\nEOF\ngit push", true], // body apostrophe can't hide a later push
    ['cat <<EOF\n$(git push)\nEOF', true], // unquoted delimiter: substitution runs
    // Found at code review of the heredoc masking, 2026-09-27
    ['git commit -m "mask <<\'EOF\' bodies"\ngit push -u origin x', true], // operator inside quotes
    ['echo "<<\'X\' "\ngit push origin other', true],
    ['cat "notes <<\'EOF\' here"\ngit push origin x', true], // a data sink, but the operator is quoted
    ["cat <<'EOF' | bash\ngit push origin x\nEOF", true], // body piped to a shell
    ["sudo bash <<'EOF'\ngit push\nEOF", true],
    ["cat <<'EOF' 2>&1 | bash\ngit push origin x\nEOF", true], // `&` in a redirect, then a pipe
    ["cat <<'EOF' > /dev/null 2>&1 | sh\ngit push\nEOF", true],
    // Two heredocs on one line: bash reads A's body first, then B's.
    ["cat <<'A' | bash; cat > b <<'B'\ngit push\nA\nx\nB", true],
    ["bash -s -- a <<'EOF'\ngit push\nEOF", true],
    ["git commit -F - <<'EOF'\nnever run `git push` here\nEOF", false], // data sink
    ['gh pr create --body "$(cat <<\'EOF\'\nthen `git push`\nEOF\n)"', false],
    ['git push origin x # --dry-run later', true], // dry-run flag in a comment
    ['git push origin x # -n', true],
    ['git push --dry-run # really', false],
    ['powershell -File deploy.ps1', false],
    ['pwsh -NoProfile -ExecutionPolicy Bypass -Command "git status"', false],
    // NOT pushes:
    ['git commit -m "docs: explain the git push gate"', false], // push inside quotes
    ["git commit -m 'mention git push here'", false],
    ['git push --dry-run', false], // harmless by definition
    ['git stash push', false], // different subcommand
    ['echo git push', false], // not in command position
    ['gh pr create --title "x"', false],
    ['npm run build', false],
    ['', false],
    // Wrappers that run something else, and wrappers only MENTIONED in quotes
    ['bash -c "echo git push"', false],
    ['pwsh -Command "git status"', false],
    ['git commit -m "bash -c \'git push\'"', false], // shell named inside a message
    ['cmd /c "git push --dry-run"', false],
    ['bash -c "git push --dry-run"', false],
  ])('%j → %s', (cmd, expected) => {
    expect(isGitPush(cmd as string)).toBe(expected);
  });
});

describe('push-review-gate: pushedSources refspec parsing', () => {
  it.each([
    ['git push', [], false],
    ['git push origin', [], false],
    ['git push -u origin feat/x', ['feat/x'], false],
    ['git push origin "abc123:refs/heads/master"', ['abc123'], false], // quoted refspec
    ['git push origin +x:y', ['x'], false], // force prefix
    ['git push origin :y', [], false], // deletion refspec
    ['git push origin --delete x', [], false],
    ['git push -o ci.skip origin x', ['x'], false], // -o consumes its value
    ['git push --receive-pack git-receive-pack origin x', ['x'], false],
    ['git push origin tag v1.0', [], false], // tag push, as --tags
    ['git push origin a b', ['a', 'b'], false],
    ['git push --all origin', [], true],
    ['git push --mirror', [], true],
    ['git push origin feat/do-thing', ['feat/do-thing'], false],
    ['git push origin then-x', ['then-x'], false],
    ['git push origin x # note', ['x'], false], // a comment is not a refspec
    ['git push origin "#x"', ['#x'], false], // a quoted `#` is
  ])('%j → %j (unbindable %s)', (segment, sources, unbindable) => {
    expect(pushedSources(segment as string)).toEqual({ sources, unbindable });
  });

  it('keeps a `do`/`then` inside a ref name in the segment the ref check reads', () => {
    expect(pushSegments('git push origin do-other:refs/heads/master')).toEqual([
      'git push origin do-other:refs/heads/master',
    ]);
  });

  it('reads a line-continued push as one command', () => {
    for (const cont of [' \\\n', ' `\n', ' `\r\n']) {
      const [segment] = pushSegments(`git push${cont}  origin other-branch`);
      expect(pushedSources(segment).sources).toEqual(['other-branch']);
    }
  });

  // The hook runs on every shell call; an optional flag value that could
  // itself be a flag made `xargs -a -b -c …` backtrack exponentially.
  it('stays fast on long runs of flags', () => {
    const flags = Array.from({ length: 200 }, (_, i) => `-f${i}`).join(' ');
    const started = performance.now();
    isGitPush(`xargs ${flags} echo`);
    isGitPush(`sudo ${flags} echo`);
    // Thousands of unterminated heredoc operators: one pass, not one scan each.
    isGitPush(`cat ${"<<'E1'\n".repeat(3000)}`);
    // …and thousands of operators on ONE line (each segment judged once).
    isGitPush(`echo ${"<<'E' ".repeat(5000)}\ngit push`);
    isGitPush(`${"x <<'E'; ".repeat(3000)}\n`);
    isGitPush(`${"cat <<'E' | x; ".repeat(3000)}\n`); // piped sinks: disjoint pipe scans
    isGitPush(`${"cat <<'E'; ".repeat(3000)}| x\n`); // one far pipe, found once
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('push-review-gate (Implementation Review Gate)', () => {
  const env = () => ({ GST_HOOK_MARKER_DIR: dir, GST_HOOK_REPO_DIR: REPO_ROOT });
  const payload = (command: string) => ({ tool_name: 'Bash', tool_input: { command } });

  const currentHead = () =>
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();

  function writeMarker(overrides: Record<string, unknown> = {}) {
    writeFileSync(
      join(dir, 'impl-review.json'),
      JSON.stringify({
        verdict: 'APPROVE',
        headSha: currentHead(),
        findings: { critical: [], warnings: [], suggestions: [] },
        reviewedAt: new Date().toISOString(),
        ...overrides,
      }),
      'utf-8'
    );
  }

  it('fast-allows non-push commands without needing any marker', () => {
    expect(runHook(PUSH_GATE, payload('npm run test:run'), env()).status).toBe(0);
  });

  it('is inert on missing/empty stdin (subagent or malformed traffic)', () => {
    const r = runHook(PUSH_GATE, {}, env());
    expect(r.status).toBe(0);
  });

  it('blocks a push with no marker', () => {
    const r = runHook(PUSH_GATE, payload('git push -u origin feat/x'), env());
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Implementation Review Gate');
  });

  it('allows a push with APPROVE marker bound to current HEAD', () => {
    writeMarker();
    expect(runHook(PUSH_GATE, payload('git push'), env()).status).toBe(0);
  });

  it('does not consume the marker — a failed push can retry', () => {
    writeMarker();
    expect(runHook(PUSH_GATE, payload('git push'), env()).status).toBe(0);
    expect(runHook(PUSH_GATE, payload('git push'), env()).status).toBe(0);
  });

  it('blocks when marker HEAD differs from current HEAD (new commits since review)', () => {
    writeMarker({ headSha: 'a'.repeat(40) });
    const r = runHook(PUSH_GATE, payload('git push'), env());
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('new commits');
  });

  it('blocks on REVISE verdict', () => {
    writeMarker({ verdict: 'REVISE' });
    expect(runHook(PUSH_GATE, payload('git push'), env()).status).toBe(2);
  });

  it('allows USER_WAIVED bound to current HEAD', () => {
    writeMarker({ verdict: 'USER_WAIVED', waiver: 'user said: push the docs fix without review' });
    expect(runHook(PUSH_GATE, payload('git push'), env()).status).toBe(0);
  });

  it('fails CLOSED on malformed marker JSON', () => {
    writeFileSync(join(dir, 'impl-review.json'), '{oops', 'utf-8');
    expect(runHook(PUSH_GATE, payload('git push'), env()).status).toBe(2);
  });

  // The review covers HEAD; every ref the push names must be HEAD's commit.
  const parentSha = () =>
    execFileSync('git', ['rev-parse', 'HEAD~1'], { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();

  it('allows pushing HEAD by name', () => {
    writeMarker();
    expect(runHook(PUSH_GATE, payload('git push origin HEAD'), env()).status).toBe(0);
  });

  it('blocks a push that sends a ref other than the reviewed HEAD', () => {
    writeMarker();
    const r = runHook(PUSH_GATE, payload(`git push origin ${parentSha()}:refs/heads/x`), env());
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('not the reviewed HEAD');
  });

  it('blocks an unreviewed ref even when the refspec is quoted', () => {
    writeMarker();
    const r = runHook(PUSH_GATE, payload(`git push origin "${parentSha()}:refs/heads/x"`), env());
    expect(r.status).toBe(2);
  });

  it('fails CLOSED on a pushed ref that does not resolve', () => {
    writeMarker();
    const r = runHook(PUSH_GATE, payload('git push origin no-such-ref-xyz-123'), env());
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('could not resolve');
  });

  it('blocks --all, which a single review cannot cover', () => {
    writeMarker();
    expect(runHook(PUSH_GATE, payload('git push --all origin'), env()).status).toBe(2);
  });

  it('allows a branch deletion (no content is sent)', () => {
    writeMarker();
    expect(runHook(PUSH_GATE, payload('git push origin --delete old-branch'), env()).status).toBe(
      0
    );
  });

  it('blocks a ref whose name contains `do` (it once split the refspec away)', () => {
    writeMarker();
    const r = runHook(PUSH_GATE, payload('git push origin do-other:refs/heads/master'), env());
    expect(r.status).toBe(2);
  });

  it('blocks an unreviewed ref on a continuation line', () => {
    writeMarker();
    const r = runHook(
      PUSH_GATE,
      payload(`git push \`\n  origin ${parentSha()}:refs/heads/x`),
      env()
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('not the reviewed HEAD');
  });

  it('fails CLOSED (exit 2, not 1) on a marker that is JSON null', () => {
    writeFileSync(join(dir, 'impl-review.json'), 'null', 'utf-8');
    expect(runHook(PUSH_GATE, payload('git push'), env()).status).toBe(2);
  });

  it('gates a wrapped push with no marker', () => {
    const r = runHook(PUSH_GATE, payload('bash -c "git push origin x"'), env());
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Implementation Review Gate');
  });

  it('does not gate a quoted mention of git push even with no marker present', () => {
    const r = runHook(PUSH_GATE, payload('git commit -m "feat: add the git push gate"'), env());
    expect(r.status).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('install.mjs (hook registration installer)', () => {
  function runInstaller(target: string): string {
    return execFileSync(process.execPath, [INSTALLER], {
      env: { ...process.env, GST_HOOK_INSTALL_TARGET: target },
      encoding: 'utf-8',
    });
  }

  it('creates settings.local.json with the hooks when absent', () => {
    const target = join(dir, 'settings.local.json');
    runInstaller(target);
    expect(existsSync(target)).toBe(true);
    const settings = JSON.parse(readFileSync(target, 'utf-8'));
    const matchers = settings.hooks.PreToolUse.map((e: { matcher: string }) => e.matcher);
    expect(matchers).toContain('ExitPlanMode');
    expect(matchers).toContain('Bash|PowerShell');
  });

  it('preserves existing keys and existing custom hooks', () => {
    const target = join(dir, 'settings.local.json');
    const custom = { matcher: 'WebFetch', hooks: [{ type: 'command', command: 'echo hi' }] };
    writeFileSync(
      target,
      JSON.stringify({ permissions: { allow: ['Bash(git *)'] }, hooks: { PreToolUse: [custom] } }),
      'utf-8'
    );
    runInstaller(target);
    const settings = JSON.parse(readFileSync(target, 'utf-8'));
    expect(settings.permissions.allow).toEqual(['Bash(git *)']); // untouched
    const matchers = settings.hooks.PreToolUse.map((e: { matcher: string }) => e.matcher);
    expect(matchers).toEqual(
      expect.arrayContaining(['WebFetch', 'ExitPlanMode', 'Bash|PowerShell'])
    );
  });

  it('is idempotent — double-run adds nothing', () => {
    const target = join(dir, 'settings.local.json');
    runInstaller(target);
    const first = readFileSync(target, 'utf-8');
    const secondOutput = runInstaller(target);
    expect(readFileSync(target, 'utf-8')).toBe(first);
    expect(secondOutput).toContain('no changes');
  });

  it('refuses to clobber an invalid-JSON target', () => {
    const target = join(dir, 'settings.local.json');
    writeFileSync(target, '{broken', 'utf-8');
    expect(() => runInstaller(target)).toThrow();
    expect(readFileSync(target, 'utf-8')).toBe('{broken'); // untouched
  });
});
