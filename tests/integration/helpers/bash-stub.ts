/**
 * Shared harness for driving a repo shell script against a stubbed `gh` (BL-111, and the
 * PR-run dedup wait). Extracted from `await-mcp-test-run.test.ts` so the two script tests
 * share one copy of the Windows bash resolution, the PATH-case hazard and the stub.
 *
 * The stub also appends each invocation's arguments to `<stubDir>/args`, so a test can
 * assert on the query a script actually sent; `stubAttempts` reads the invocation count.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';

/**
 * Resolve a bash that actually executes commands, and refuse to run if there is none.
 *
 * `spawnSync('bash', …)` is unsafe on Windows. PowerShell resolves bare `bash` to the WSL
 * app-execution alias (`…\WindowsApps\bash.exe`); with no distro installed it prints an
 * install hint and exits **1** without ever running the script. Every assertion in this
 * file is an exit code, so the 22 cases expecting something other than 1 fail with a
 * completely wrong diagnosis, and the 2 expecting 1 PASS VACUOUSLY — a launch failure
 * graded as the script's verdict. Observed 2026-08-17 running `npm run test` from
 * PowerShell; Git Bash resolves `/usr/bin/bash` first and the same tree is green.
 *
 * CI is `runs-on: ubuntu-latest` everywhere, where `bash` is real, so nothing upstream
 * catches this — which is exactly why the check belongs here. Probing beats sniffing the
 * path: the alias looks like a bash executable and only misbehaves when run.
 */
function resolveBash(): string {
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  const candidates = [
    process.env.TEST_BASH,
    ...(process.platform === 'win32'
      ? [
          join(programFiles, 'Git', 'usr', 'bin', 'bash.exe'),
          join(programFilesX86, 'Git', 'usr', 'bin', 'bash.exe'),
        ]
      : []),
    'bash',
  ].filter((c): c is string => Boolean(c));

  const tried: string[] = [];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['-c', 'printf %s __bash_ok__'], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    if (probe.status === 0 && probe.stdout?.includes('__bash_ok__')) return candidate;
    tried.push(`${candidate} → ${probe.error ? probe.error.message : `exit ${probe.status}`}`);
  }
  throw new Error(
    `No working POSIX bash found, so shell scripts cannot be exercised. Tried:\n  ${tried.join('\n  ')}\n` +
      'On Windows: run from Git Bash, or put "C:\\Program Files\\Git\\bin" ahead of the WSL ' +
      'alias on PATH, or disable the bash.exe App execution alias (Settings → Apps → ' +
      'Advanced app settings). Or set TEST_BASH to a bash executable.'
  );
}
export const BASH = resolveBash();

/**
 * The directory holding the POSIX utilities that go with the bash we chose.
 *
 * The script calls `sleep`, and the harness inherits the parent shell's PATH. Git Bash
 * carries `C:\Program Files\Git\usr\bin` (where sleep.exe, cat.exe and friends live), but
 * PowerShell's PATH gets only `Git\cmd`, which holds git.exe and nothing else — so bash
 * launched fine and then died with `sleep: command not found`, exit 127, on every case
 * that reaches the poll loop. Shipping the utilities alongside the interpreter keeps the
 * two from being resolved out of different installs.
 *
 * Empty when `bash` came off PATH (Linux, and every CI runner), so this is a no-op there.
 */
export const BASH_UTILS: string[] = isAbsolute(BASH) ? [dirname(BASH)] : [];

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
export function writeStub(stubDir: string, arms: string): void {
  const counter = join(stubDir, 'n').replace(/\\/g, '/');
  const args = join(stubDir, 'args').replace(/\\/g, '/');
  writeFileSync(
    join(stubDir, 'gh'),
    `#!/usr/bin/env bash
n=$(cat '${counter}' 2>/dev/null || echo 0)
n=$((n + 1)); echo "$n" > '${counter}'
printf '%s\n' "$*" >> '${args}'
case $n in
${arms}
esac
`,
    { mode: 0o755 }
  );
  chmodSync(join(stubDir, 'gh'), 0o755);
}

/**
 * Delete an env key whatever case the parent shell used.
 *
 * Windows env vars are case-insensitive, and `process.env` honours that — but spreading it
 * into a plain object does not. PowerShell exports `Path`, so `{...process.env}` followed by
 * `env.PATH = …` hands the child BOTH keys and it resolves the stale one: the stub `gh`
 * never lands on PATH and every case exits 127. Git Bash exports `PATH`, so the identical
 * code is correct there and on CI. Observed 2026-08-17, alongside the WSL-alias bug above.
 *
 * The same hazard applies to the inputs stripped below — "genuinely unset rather than
 * inheriting a CI value" is only true if a differently-cased twin goes too.
 */
export function unset(env: NodeJS.ProcessEnv, name: string): void {
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === name.toLowerCase()) delete env[key];
  }
}

export const body = (json: string) => {
  // The stub wraps JSON in single quotes, so an apostrophe would silently truncate the
  // fixture and the case would assert against a body nobody wrote.
  if (json.includes("'")) throw new Error('fixture JSON may not contain an apostrophe');
  return `printf '%s' '${json}'`;
};

/** How many times the stub was invoked; 0 when the script exited before its first `gh` call. */
export function stubAttempts(stubDir: string): number {
  try {
    return Number(readFileSync(join(stubDir, 'n'), 'utf8').trim()) || 0;
  } catch {
    return 0;
  }
}

/** The argument lines the stub recorded, one per invocation. */
export function stubArgs(stubDir: string): string[] {
  try {
    return readFileSync(join(stubDir, 'args'), 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}
