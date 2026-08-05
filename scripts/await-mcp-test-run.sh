#!/usr/bin/env bash
#
# await-mcp-test-run.sh — wait for the MCP Server Test Suite to reach a verdict
# on a specific commit, then report it (BL-111 defect 1).
#
# ## Why this exists
#
# `deploy-mcp-production.yml` must never deploy a SHA the MCP suite did not
# validate (audit gap #7). It enforced that by querying the GitHub API ONCE,
# with no wait and no retry, and treating "not yet" as "never". Both workflows
# fire on the same push and start in the same second, so the guard raced the
# suite and lost — twice in a row on unrelated commits:
#
#   8f5a9112  suite green 04:25:56Z   guard failed 04:24:42Z   74 s early
#   b450ff9b  suite green 04:40:45Z   guard failed 04:39:27Z   78 s early
#
# It was masked for months because approving the `mcp-production` environment
# usually takes a human longer than the ~2 min the suite needs. Approve
# promptly and it fails every time.
#
# ## Contract
#
#   0  a run for this SHA concluded `success`
#   1  every run terminal, none successful — the suite genuinely failed
#   2  bad or missing input (unset/malformed SHA, unset repo)
#   3  cap reached, runs present but unfinished        -> re-run the deploy
#   4  cap reached, no run ever appeared               -> check for a skipped run
#   5  persistent transport failure (gh non-zero)      -> fix the credential
#   6  no parseable response (gh ok, body unreadable)  -> often transient, re-run
#
# 3 and 4 are distinct because their operator actions are OPPOSITE and one is
# dangerous: told to `workflow_dispatch` on a 3, an operator deploys with no
# test verification at all. 5 and 6 split for the same reason — don't re-run vs
# re-run first.
#
# ## Inputs (env)
#
#   TARGET_SHA   required, 40 hex chars
#   REPO         defaults to $GITHUB_REPOSITORY; required when that is unset
#   POLL_CAP_S   total seconds to wait (default 300)
#   POLL_EVERY_S seconds between attempts (default 10)
#   GH_TOKEN     read by `gh` from the environment
#
set -euo pipefail

WORKFLOW="test-mcp-server.yml"
TARGET_SHA="${TARGET_SHA:-}"
REPO="${REPO:-${GITHUB_REPOSITORY:-}}"
POLL_CAP_S="${POLL_CAP_S:-300}"
POLL_EVERY_S="${POLL_EVERY_S:-10}"

# Validate before any API call. Without this, an empty REPO builds a malformed
# URL, `gh` exits non-zero, the retry rule catches it, and the run burns the
# full cap to report "never appeared" — exit 4 for what is a script bug. A
# malformed SHA is worse: it yields a legitimate total_count of 0 and polls for
# five minutes before reporting absence. (Same discipline as smoke-probe.sh:
# "Validate before any curl.")
if [ -z "$TARGET_SHA" ]; then
  echo "await-mcp-test-run: TARGET_SHA is required" >&2
  exit 2
fi
if ! printf '%s' "$TARGET_SHA" | grep -Eq '^[0-9a-f]{40}$'; then
  echo "await-mcp-test-run: TARGET_SHA must be 40 lowercase hex chars, got '$TARGET_SHA'" >&2
  exit 2
fi
if [ -z "$REPO" ]; then
  echo "await-mcp-test-run: REPO (or GITHUB_REPOSITORY) is required" >&2
  exit 2
fi

# `head_sha` is an exact server-side match, so absence is a first-class signal
# (total_count == 0) rather than an empty-string inference. It also removes the
# old branch+per_page=30 scoping, and removes `head -1`: the list is
# newest-first and the upstream suite runs cancel-in-progress, so a superseded
# `cancelled` run can sit AHEAD of a `success` run for the same SHA. Selecting
# the first would hard-fail a commit the suite passed. per_page=100 keeps
# total_count and the returned page in agreement.
API="repos/${REPO}/actions/workflows/${WORKFLOW}/runs?head_sha=${TARGET_SHA}&event=push&per_page=100"

echo "await-mcp-test-run: waiting up to ${POLL_CAP_S}s for ${WORKFLOW} on ${TARGET_SHA}"

saw_transport=0   # any attempt where gh exited 0
saw_parseable=0   # any attempt whose body we could read
elapsed=0

while :; do
  # `set -e` would abort on a non-zero gh exit, which would turn an API error
  # into an abort rather than a retry. Wrapping in `if !` suspends that. NOTE:
  # smoke-probe.sh uses `curl ... || echo ""`, which collapses error into empty
  # — the exact conflation this guard exists to remove. Copy its shape, not
  # that line.
  if ! resp="$(gh api "$API" 2>/dev/null)"; then
    resp=""
  else
    saw_transport=1
  fi

  # Parsed with node rather than `gh api --jq`, deliberately: --jq makes gh exit
  # non-zero on a parse failure, which would collapse the transport and parse
  # cases back into one code. Node is present on GitHub runners and locally, so
  # the stub matrix can exercise this path.
  total=""
  if [ -n "$resp" ]; then
    total="$(printf '%s' "$resp" | node -e '
      let raw = "";
      process.stdin.on("data", (d) => (raw += d));
      process.stdin.on("end", () => {
        try {
          const j = JSON.parse(raw);
          const runs = Array.isArray(j.workflow_runs) ? j.workflow_runs : [];
          const anySuccess = runs.some((r) => r.conclusion === "success");
          const anyPending = runs.some((r) => r.status !== "completed");
          process.stdout.write(
            [j.total_count ?? 0, anySuccess ? 1 : 0, anyPending ? 1 : 0].join(" ")
          );
        } catch {
          process.exit(9);
        }
      });
    ' 2>/dev/null || true)"
  fi

  if [ -n "$total" ]; then
    saw_parseable=1
    set -- $total
    count="$1"; any_success="$2"; any_pending="$3"

    if [ "$any_success" = "1" ]; then
      echo "await-mcp-test-run: MCP Server Test Suite passed on ${TARGET_SHA} (${elapsed}s)"
      exit 0
    fi
    # Continue while nothing has succeeded AND (nothing appeared OR something is
    # still running). Exiting as soon as ANY run completes would fail a SHA whose
    # second run is still in flight — a `cancelled` beside an `in_progress`.
    if [ "$count" != "0" ] && [ "$any_pending" = "0" ]; then
      echo "await-mcp-test-run: every run for ${TARGET_SHA} is terminal and none succeeded" >&2
      exit 1
    fi
  fi

  if [ "$elapsed" -ge "$POLL_CAP_S" ]; then
    break
  fi
  sleep "$POLL_EVERY_S"
  elapsed=$((elapsed + POLL_EVERY_S))
done

# Cap reached. Four outcomes, distinguished because their operator actions differ.
if [ "$saw_parseable" = "0" ]; then
  if [ "$saw_transport" = "0" ]; then
    echo "await-mcp-test-run: no successful API response in ${POLL_CAP_S}s — dead token, revoked permission, or a GitHub outage. Re-running will not help; fix the credential." >&2
    exit 5
  fi
  echo "await-mcp-test-run: API responded but no body was parseable in ${POLL_CAP_S}s — often a proxy or interstitial returning non-JSON, and usually transient. Re-run first." >&2
  exit 6
fi

if [ "${count:-0}" = "0" ]; then
  echo "await-mcp-test-run: no ${WORKFLOW} run ever appeared for ${TARGET_SHA} in ${POLL_CAP_S}s — most likely list-visibility lag. Check whether the upstream suite legitimately skipped this commit before using workflow_dispatch." >&2
  exit 4
fi

echo "await-mcp-test-run: ${WORKFLOW} still running on ${TARGET_SHA} after ${POLL_CAP_S}s — re-run this deploy; do NOT workflow_dispatch." >&2
exit 3
