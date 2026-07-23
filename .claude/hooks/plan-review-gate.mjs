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

// Drain stdin (hook payload) — this gate needs no fields from it, but leaving
// stdin unread can block the parent on some platforms.
try {
  readFileSync(0, 'utf-8');
} catch {
  /* stdin may be empty/closed — fine */
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

let currentHash;
try {
  currentHash = createHash('sha256').update(readFileSync(marker.reviewedPlanFile)).digest('hex');
} catch {
  block('could not hash the referenced plan file (fail closed).');
}

if (currentHash !== marker.planContentSha256) {
  block(
    'the plan file has been EDITED since it was reviewed (content hash mismatch) — ' +
      're-run the plan-reviewer on the current plan text.'
  );
}

// All checks passed — allow ExitPlanMode.
process.exit(0);
