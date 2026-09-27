/**
 * Claude Code PreToolUse hook — git-push gate (Implementation Review Gate).
 *
 * Fires on every Bash/PowerShell tool call; fast-exits 0 unless the command
 * contains a `git push`. On a push, requires a fresh impl-review marker written
 * by the code-reviewer agent (.claude/tasks/impl-review.json) whose recorded
 * headSha matches the repo's CURRENT HEAD — so yesterday's review cannot
 * approve today's unrelated commits, new commits after review force re-review,
 * and a failed push retries without burning the review (SHA-binding, no
 * consumption).
 *
 * Detection is deliberately blunt: `git … push` ANYWHERE in the command text,
 * quoted or not. That catches wrapped pushes (`bash -c "git push"`,
 * `pwsh -Command '…'`, `cmd /c`, `eval`, a quoted path to git.exe) without
 * modelling any shell. The cost is an occasional false block on a command
 * that merely MENTIONS a push (e.g. in an inline commit message) — write such
 * text to a file (`git commit -F`), as CLAUDE.md Directive 15 already asks.
 * This hook guards against accidental unreviewed pushes; the merge itself is
 * guarded by the branch ruleset and required checks.
 *
 * Exit semantics: exit 2 BLOCKS (stderr fed to Claude); exit 0 allows; any
 * other exit is NON-blocking (fail-open) — hence the $CLAUDE_PROJECT_DIR-
 * absolute command registration and the fail-closed error handling below.
 * See DEVELOPER_TOOLING.md § Claude Code review gates.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const MARKER_DIR = process.env.GST_HOOK_MARKER_DIR || resolve(SCRIPT_DIR, '..', 'tasks');
const MARKER = resolve(MARKER_DIR, 'impl-review.json');

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // loose belt; the SHA is the real check
const ALLOWED_VERDICTS = new Set(['APPROVE', 'USER_WAIVED']);

// `git` (optionally git.exe, optionally a quoted path to it), then only
// git's own options (`-C dir`, `-c k=v`, `--flag`), then `push`. Options only,
// so `git stash push` is not a push.
const PUSH = /\bgit(?:\.exe)?["']?\s+(?:-[cC]\s+\S+\s+|--[\w-]+(?:=\S+)?\s+)*push\b/i;

/** True when the command contains a `git push` anywhere, quoted or not. */
export function isGitPush(command) {
  return typeof command === 'string' && PUSH.test(command);
}

function block(reason) {
  process.stderr.write(
    `Implementation Review Gate: ${reason}\n` +
      `To proceed: invoke the code-reviewer agent on the current diff (it reviews against repo ` +
      `conventions, records the HEAD sha, and writes ${MARKER}). ` +
      `If (and only if) the user explicitly authorized pushing without review (e.g. a trivial ` +
      `docs-only diff), write the marker yourself with verdict "USER_WAIVED", the user's quoted ` +
      `waiver in a "waiver" field, and the current HEAD sha. If the command only MENTIONS a ` +
      `push (e.g. an inline commit message), write that text to a file instead.\n`
  );
  process.exit(2);
}

// Only run the gate when executed as a hook (not when imported by tests).
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let payload = {};
  try {
    payload = JSON.parse(readFileSync(0, 'utf-8'));
  } catch {
    /* no/invalid stdin: not a recognizable tool call — stay inert */
  }

  if (!isGitPush(payload?.tool_input?.command)) {
    process.exit(0); // fast path: not a push — inert for all other traffic
  }

  if (!existsSync(MARKER)) {
    block('no impl-review marker found — the diff has not been code-reviewed.');
  }

  let marker;
  try {
    marker = JSON.parse(readFileSync(MARKER, 'utf-8'));
  } catch {
    block('impl-review marker is unreadable/malformed JSON (fail closed).');
  }
  // `null` parses fine but would throw below, exiting 1 — which fails open.
  if (!marker || typeof marker !== 'object') {
    block('impl-review marker is not a JSON object (fail closed).');
  }

  if (!ALLOWED_VERDICTS.has(marker.verdict)) {
    block(`latest code-review verdict is "${marker.verdict}" — fix the findings and re-review.`);
  }

  const age = Date.now() - Date.parse(marker.reviewedAt ?? '');
  if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) {
    block('impl-review marker is stale or has an invalid timestamp — re-run the code-reviewer.');
  }

  let head;
  try {
    head = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: process.env.GST_HOOK_REPO_DIR || REPO_ROOT,
      encoding: 'utf-8',
    }).trim();
  } catch {
    block('could not resolve current git HEAD (fail closed).');
  }

  if (marker.headSha !== head) {
    block(
      `impl-review marker was written for HEAD ${String(marker.headSha).slice(0, 12)} but current ` +
        `HEAD is ${head.slice(0, 12)} — new commits exist since the review; re-run the code-reviewer.`
    );
  }

  process.exit(0);
}
