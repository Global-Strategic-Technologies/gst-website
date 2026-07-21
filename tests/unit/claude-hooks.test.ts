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
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

// Hook script lives outside src/ by design (.claude/hooks/); imported directly for unit tests.
import { isGitPush } from '../../.claude/hooks/push-review-gate.mjs';

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
    const r = runHook(PLAN_GATE, {}, env());
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Design Review Gate');
  });

  it('allows (exit 0) on fresh APPROVE with matching plan hash', () => {
    writePlanAndMarker();
    expect(runHook(PLAN_GATE, {}, env()).status).toBe(0);
  });

  it('re-allows without re-review when the plan is unchanged (no consumption)', () => {
    writePlanAndMarker();
    expect(runHook(PLAN_GATE, {}, env()).status).toBe(0);
    expect(runHook(PLAN_GATE, {}, env()).status).toBe(0); // user rejected, agent re-exits same plan
  });

  it('blocks when the plan was edited after review (hash mismatch)', () => {
    const planFile = writePlanAndMarker();
    writeFileSync(planFile, '# The Plan\n\ndo DIFFERENT things\n', 'utf-8');
    const r = runHook(PLAN_GATE, {}, env());
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('EDITED');
  });

  it('blocks on REVISE verdict', () => {
    writePlanAndMarker({ verdict: 'REVISE' });
    expect(runHook(PLAN_GATE, {}, env()).status).toBe(2);
  });

  it('allows USER_WAIVED with matching hash', () => {
    writePlanAndMarker({ verdict: 'USER_WAIVED', waiver: 'user said: skip review' });
    expect(runHook(PLAN_GATE, {}, env()).status).toBe(0);
  });

  it('blocks a stale (>24h) marker', () => {
    writePlanAndMarker({ reviewedAt: new Date(Date.now() - 25 * 3600_000).toISOString() });
    expect(runHook(PLAN_GATE, {}, env()).status).toBe(2);
  });

  it('fails CLOSED (exit 2, not 1) on malformed marker JSON', () => {
    writeFileSync(join(dir, 'plan-review.json'), '{not json', 'utf-8');
    expect(runHook(PLAN_GATE, {}, env()).status).toBe(2);
  });

  it('fails CLOSED when the referenced plan file is missing', () => {
    writePlanAndMarker({ reviewedPlanFile: join(dir, 'gone.md') });
    expect(runHook(PLAN_GATE, {}, env()).status).toBe(2);
  });
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
    // NOT pushes:
    ['git commit -m "docs: explain the git push gate"', false], // push inside quotes
    ["git commit -m 'mention git push here'", false],
    ['git push --dry-run', false], // harmless by definition
    ['git stash push', false], // different subcommand
    ['echo git push', false], // not in command position
    ['gh pr create --title "x"', false],
    ['npm run build', false],
    ['', false],
  ])('%j → %s', (cmd, expected) => {
    expect(isGitPush(cmd as string)).toBe(expected);
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
