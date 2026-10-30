#!/usr/bin/env bash
#
# await-push-run.sh — on a PR run, wait while a recent push run of the same
# workflow is still validating the same head commit, so the caller's dedup can
# then see its result instead of repeating all of its work.
#
# ## Why this exists
#
# The CI suites fire on `push` to feature branches AND on
# `pull_request: [opened, reopened]`. Opening a PR seconds after pushing (the
# usual order) started both runs together, and the dedup only matches runs that
# already SUCCEEDED — an in-flight run is never `success`. So both did the full
# work: on PR #590 the Test Suite ran its ~14 min E2E twice and the MCP suite ran
# twice. DEVELOPER_TOOLING.md § Duplicate-run dedup has the history.
#
# The PR run waits rather than reporting an immediate "skipped" success because
# both runs report check runs of the SAME NAMES on the PR head commit, and
# GitHub does not document which one a required check honours. An early
# placeholder success could mask the push run's later failure; waiting for the
# push run to finish makes the question moot.
#
# ## Contract
#
#   0  always, once the wait is over — the wait is advisory. Whatever happened
#      (push run passed, failed, was cancelled, never existed, the API errored,
#      the age cap expired), the caller then does exactly what it did before
#      this script existed: dedup on a success, a full run otherwise.
#   2  bad or missing input, or a missing dependency. The inputs are static
#      workflow literals, so this is a script or workflow bug, and it is
#      deliberately loud: in test.yml it fails the gate job.
#
# Every API problem counts as "nothing in flight", which ends the wait. The
# opposite failure — an error body read as a count — would stall every PR run
# for the full cap, so the body is parsed with node rather than `gh --jq`
# (gh prints an error body to stdout and skips --jq; see await-mcp-test-run.sh
# for the same split).
#
# ## The cap is the push run's AGE
#
# Only in-flight runs created less than MAX_AGE_S ago count. A push run wedged
# in `queued`/`in_progress` therefore ages out on its own, so a close+reopen
# (the documented remedy for a wedged run) waits at most the rest of that
# window, never a fresh one. A wall-clock guard of the same length stays as a
# hang defence.
#
# Guarded by `tests/integration/await-push-run.test.ts` (behaviour, against a
# stubbed `gh`) and `tests/integration/workflow-await-push.test.ts` (the
# workflow wiring).
#
# ## Inputs (env)
#
#   WORKFLOW        required, the workflow FILE name, e.g. test.yml
#   HEAD_SHA        required, 40 hex chars — the PR head commit
#   REPO            defaults to $GITHUB_REPOSITORY
#   MAX_AGE_S       required, whole seconds — longest a push run can take
#   POLL_EVERY_S    seconds between polls (default 30)
#   FIRST_REPOLL_S  delay before the one re-poll after a first-poll 0 (default
#                   10) — the runs list can lag a just-created run
#   GH_TOKEN        read by `gh` from the environment
#
set -euo pipefail

WORKFLOW="${WORKFLOW:-}"
HEAD_SHA="${HEAD_SHA:-}"
REPO="${REPO:-${GITHUB_REPOSITORY:-}}"
MAX_AGE_S="${MAX_AGE_S:-}"
POLL_EVERY_S="${POLL_EVERY_S:-30}"
FIRST_REPOLL_S="${FIRST_REPOLL_S:-10}"

fail() {
  echo "await-push-run: $1" >&2
  exit 2
}

[[ "$WORKFLOW" =~ ^[A-Za-z0-9._-]+\.ya?ml$ ]] || fail "WORKFLOW must be a workflow file name, got '${WORKFLOW}'"
[[ "$HEAD_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "HEAD_SHA must be 40 lowercase hex chars, got '${HEAD_SHA}'"
[[ "$REPO" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]] || fail "REPO (or GITHUB_REPOSITORY) must be owner/name, got '${REPO}'"
[[ "$MAX_AGE_S" =~ ^[0-9]+$ ]] || fail "MAX_AGE_S must be whole seconds, got '${MAX_AGE_S}'"
[[ "$POLL_EVERY_S" =~ ^[0-9]+(\.[0-9]+)?$ ]] || fail "POLL_EVERY_S must be a non-negative number, got '${POLL_EVERY_S}'"
[[ "$FIRST_REPOLL_S" =~ ^[0-9]+(\.[0-9]+)?$ ]] || fail "FIRST_REPOLL_S must be a non-negative number, got '${FIRST_REPOLL_S}'"
for dep in gh node; do
  command -v "$dep" >/dev/null 2>&1 || fail "'${dep}' is not on PATH"
done

# `event=push` is load-bearing: the PR run itself reports the same head_sha, so
# without it a PR run would wait on itself until the cap.
API="repos/${REPO}/actions/workflows/${WORKFLOW}/runs?head_sha=${HEAD_SHA}&event=push&per_page=100"

# Prints the number of recent in-flight push runs; prints 0 for anything it
# cannot read, so an API problem ends the wait instead of extending it.
in_flight() {
  local resp
  resp="$(gh api "$API" 2>/dev/null)" || resp=""
  printf '%s' "$resp" | MAX_AGE_S="$MAX_AGE_S" node -e '
    let raw = "";
    process.stdin.on("data", (d) => (raw += d));
    process.stdin.on("end", () => {
      let n = 0;
      try {
        const runs = JSON.parse(raw).workflow_runs;
        if (Array.isArray(runs)) {
          const oldest = Date.now() - Number(process.env.MAX_AGE_S) * 1000;
          n = runs.filter(
            (r) => r && r.status !== "completed" && Date.parse(r.created_at) > oldest
          ).length;
        }
      } catch {}
      process.stdout.write(String(n));
    });
  ' 2>/dev/null || true
}

# One place sets `count`, and it is always an integer: an empty or garbled
# answer is 0, never something the loop would keep waiting on.
poll() {
  count="$(in_flight)"
  case "$count" in
    '' | *[!0-9]*) count=0 ;;
  esac
}

SECONDS=0
poll
if [ "$count" = "0" ]; then
  sleep "$FIRST_REPOLL_S"
  poll
fi

while [ "$count" != "0" ]; do
  if [ "$SECONDS" -ge "$MAX_AGE_S" ]; then
    echo "await-push-run: cap reached after ${SECONDS}s with ${count} ${WORKFLOW} push run(s) still in flight for ${HEAD_SHA}; continuing"
    exit 0
  fi
  echo "await-push-run: waiting on ${count} in-flight ${WORKFLOW} push run(s) for ${HEAD_SHA} (${SECONDS}s)"
  sleep "$POLL_EVERY_S"
  poll
done

echo "await-push-run: no recent ${WORKFLOW} push run in flight for ${HEAD_SHA} (${SECONDS}s)"
exit 0
