/**
 * Claude Code PreToolUse hook — ExitPlanMode gate (Design Review Gate).
 *
 * Blocks ExitPlanMode unless the plan-reviewer agent has reviewed the CURRENT
 * plan content and approved it. The handshake is a marker file written by the
 * reviewer: .claude/tasks/plan-review.json containing the sha256 of the plan
 * file it reviewed. Content-binding (not consumption) is the freshness check:
 *  - user rejects the plan without edits → same hash → re-exit allowed, no
 *    wasted re-review;
 *  - ANY post-review edit to the plan → hash mismatch → re-review required.
 * The marker is also bound to the plan being EXITED (the payload's
 * tool_input.planFilePath, or its plan text as a fallback): a marker for a
 * different plan file blocks, and a payload naming no plan fails closed.
 *
 * Exit semantics (load-bearing): exit 2 BLOCKS the tool call and feeds stderr
 * back to Claude; exit 0 allows. Any other exit code is NON-blocking (the tool
 * proceeds), which is why this script never intentionally exits 1 and why the
 * hook command in hooks.config.json must be $CLAUDE_PROJECT_DIR-absolute — a
 * "Cannot find module" from a bad relative path would exit 1 and silently
 * fail OPEN. See DEVELOPER_TOOLING.md § Claude Code review gates.
 *
 * Registered via .claude/hooks/hooks.config.json (installed into
 * .claude/settings.local.json by `npm run setup:claude-hooks`).
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
// Marker dir is env-overridable so unit tests can point at a temp dir.
const MARKER_DIR = process.env.GST_HOOK_MARKER_DIR || resolve(SCRIPT_DIR, '..', 'tasks');
const MARKER = resolve(MARKER_DIR, 'plan-review.json');

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // loose belt; the hash is the real check
const ALLOWED_VERDICTS = new Set(['APPROVE', 'USER_WAIVED']);

/** Block with a reason Claude can act on. */
function block(reason) {
  process.stderr.write(
    `Design Review Gate: ${reason}\n` +
      `To proceed: invoke the plan-reviewer agent on the CURRENT plan file — it reviews the plan ` +
      `against repo conventions and writes ${MARKER} with the plan's content hash. ` +
      `If (and only if) the user explicitly waived review, write the marker yourself with verdict ` +
      `"USER_WAIVED", the user's quoted waiver in a "waiver" field, and the current plan hash.\n`
  );
  process.exit(2);
}

// The hook payload names the plan being exited: tool_input.planFilePath (and
// tool_input.plan, its text). The marker is only valid for THAT plan — an
// APPROVE for some other plan file must not let this one through (it did, on
// 2026-09-26, when a stale marker for an earlier plan approved a new one).
let toolInput = {};
try {
  toolInput = JSON.parse(readFileSync(0, 'utf-8'))?.tool_input ?? {};
} catch {
  /* stdin empty/invalid — handled below as "no plan identity" (fail closed) */
}

/** Compare file paths the way the OS does: case-insensitively on Windows. */
function samePath(a, b) {
  const norm = (p) => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p));
  return norm(a) === norm(b);
}

/** Plan text compared without line-ending or trailing-whitespace noise. */
function normalizePlanText(text) {
  return String(text).replace(/\r\n/g, '\n').trimEnd();
}

if (!existsSync(MARKER)) {
  block('no plan-review marker found — the plan has not been reviewed.');
}

let marker;
try {
  marker = JSON.parse(readFileSync(MARKER, 'utf-8'));
} catch {
  block('plan-review marker is unreadable/malformed JSON (fail closed).');
}

if (!ALLOWED_VERDICTS.has(marker.verdict)) {
  block(
    `latest review verdict is "${marker.verdict}" — resolve the reviewer's blockers/majors, ` +
      `revise the plan, and re-run the plan-reviewer.`
  );
}

const age = Date.now() - Date.parse(marker.reviewedAt ?? '');
if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) {
  block(
    'plan-review marker is stale (>24h) or has an invalid timestamp — re-run the plan-reviewer.'
  );
}

if (!marker.reviewedPlanFile || !existsSync(marker.reviewedPlanFile)) {
  block('marker does not reference a readable plan file (fail closed).');
}

// Bind the marker to the plan being exited. planFilePath is preferred; the
// plan text is the fallback; a payload carrying neither fails closed rather
// than trusting the marker's own claim about which plan it reviewed.
const exitingPath = typeof toolInput.planFilePath === 'string' ? toolInput.planFilePath : '';
const exitingText = typeof toolInput.plan === 'string' ? toolInput.plan : null;
if (exitingPath) {
  if (!samePath(exitingPath, marker.reviewedPlanFile)) {
    block(
      `the marker reviewed ${marker.reviewedPlanFile}, but you are exiting ${exitingPath} — ` +
        're-run the plan-reviewer on the plan being exited.'
    );
  }
} else if (exitingText !== null) {
  if (
    normalizePlanText(exitingText) !==
    normalizePlanText(readFileSync(marker.reviewedPlanFile, 'utf-8'))
  ) {
    block(
      'the plan being exited is not the plan the marker reviewed (text mismatch) — ' +
        're-run the plan-reviewer on the plan being exited.'
    );
  }
} else {
  block(
    'the ExitPlanMode payload names no plan (no tool_input.planFilePath or plan), so the ' +
      'marker cannot be bound to it (fail closed).'
  );
}

// Hash the plan being exited (same file as the marker's once the path check passed).
let currentHash;
try {
  currentHash = createHash('sha256')
    .update(readFileSync(exitingPath || marker.reviewedPlanFile))
    .digest('hex');
} catch {
  block('could not hash the plan file (fail closed).');
}

if (currentHash !== marker.planContentSha256) {
  block(
    'the plan file has been EDITED since it was reviewed (content hash mismatch) — ' +
      're-run the plan-reviewer on the current plan text.'
  );
}

// All checks passed — allow ExitPlanMode.
process.exit(0);
