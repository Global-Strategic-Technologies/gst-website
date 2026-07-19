#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook — git-push gate (Implementation Review Gate).
 *
 * Fires on every Bash/PowerShell tool call; fast-exits 0 unless the command is
 * a real `git push`. On a push, requires a fresh impl-review marker written by
 * the code-reviewer agent (.claude/tasks/impl-review.json) whose recorded
 * headSha matches the repo's CURRENT HEAD — so yesterday's review cannot
 * approve today's unrelated commits, new commits after review force re-review,
 * and a failed push retries without burning the review (SHA-binding, no
 * consumption).
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

/**
 * Detect a real `git push` in a shell command string.
 * - Quoted segments are stripped first so `git commit -m "explain git push"`
 *   never trips the gate.
 * - `git` must appear in command position (start of string or after a shell
 *   separator), with `push` as its subcommand (allowing intervening `-C dir`
 *   or `-c key=val` style options).
 * - `--dry-run` pushes are exempt (harmless by definition).
 */
export function isGitPush(command) {
  if (typeof command !== 'string' || command.length === 0) return false;
  const unquoted = command
    .replace(/'[^']*'/g, ' ')
    .replace(/"[^"]*"/g, ' ')
    .replace(/@'[\s\S]*?'@/g, ' '); // PowerShell here-strings
  const gitPush =
    /(^|[;&|]|&&|\|\||\bthen\b|\bdo\b)\s*(?:[\w./\\:-]*[/\\])?git(?:\.exe)?\s+(?:-[cC]\s+\S+\s+|--[\w-]+(?:=\S+)?\s+)*push\b/;
  const m = unquoted.match(gitPush);
  if (!m) return false;
  // Exempt --dry-run (check the segment from the matched `push` onward).
  const tail = unquoted.slice(unquoted.indexOf(m[0]));
  const segmentEnd = tail.search(/[;&|]/) === -1 ? tail.length : tail.search(/[;&|]/);
  return !tail.slice(0, segmentEnd).includes('--dry-run');
}

function block(reason) {
  process.stderr.write(
    `Implementation Review Gate: ${reason}\n` +
      `To proceed: invoke the code-reviewer agent on the current diff (it reviews against repo ` +
      `conventions, records the HEAD sha, and writes ${MARKER}). ` +
      `If (and only if) the user explicitly authorized pushing without review (e.g. a trivial ` +
      `docs-only diff), write the marker yourself with verdict "USER_WAIVED", the user's quoted ` +
      `waiver in a "waiver" field, and the current HEAD sha.\n`
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

  const command = payload?.tool_input?.command ?? '';
  if (!isGitPush(command)) {
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
