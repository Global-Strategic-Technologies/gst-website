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
#   2  bad or missing input, or a missing dependency (`gh`, `node`)
#   3  cap reached, a run was seen but never reached a verdict -> re-run
#   4  cap reached, no run ever appeared               -> check for a skipped run
#   5  cap reached, gh failing at the transport layer  -> fix the credential
#   6  cap reached, gh ok but the body was unreadable  -> often transient, re-run
#
# 5 and 6 describe where the poll ENDED, not the whole window: a run observed in
# flight outranks a late API blip, because "the suite was still going" and "the
# credential is dead" have opposite operator actions.
#
# 3 and 4 are distinct because their operator actions are OPPOSITE and one is
# dangerous: told to `workflow_dispatch` on a 3, an operator deploys with no
# test verification at all. 5 and 6 split for the same reason — don't re-run vs
# re-run first.
#
# Guarded by `tests/integration/await-mcp-test-run.test.ts`, which drives this
# script against a stubbed `gh` and asserts the exit CODE for every branch.
# There is no shell lint in this repo, so that matrix is the only pre-merge
# check this file has — keep it exhaustive rather than trimming it once the
# script looks finished.
#
# ## Inputs (env)
#
#   TARGET_SHA   required, 40 hex chars
#   REPO         defaults to $GITHUB_REPOSITORY; required when that is unset
#   POLL_CAP_S   WALL-CLOCK seconds to wait (default 300)
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
#
# `[[ =~ ]]` rather than `grep -Eq`, deliberately: grep matches per LINE, so a
# SHA of "<40 hex>\nanything" passes a `^...$` grep and reaches the URL. Bash's
# ERE has no multiline mode, so ^ and $ anchor the whole string.
if [ -z "$TARGET_SHA" ]; then
  echo "await-mcp-test-run: TARGET_SHA is required" >&2
  exit 2
fi
if [[ ! "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "await-mcp-test-run: TARGET_SHA must be 40 lowercase hex chars, got '${TARGET_SHA}'" >&2
  exit 2
fi
if [ -z "$REPO" ]; then
  echo "await-mcp-test-run: REPO (or GITHUB_REPOSITORY) is required" >&2
  exit 2
fi
if [[ ! "$REPO" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]]; then
  echo "await-mcp-test-run: REPO must be owner/name, got '${REPO}'" >&2
  exit 2
fi
# The numeric inputs get the same discipline, because both failures are silent
# and both are misread by the incident table. A non-integer POLL_CAP_S makes
# every `[ -ge ]` an error under `set -e`... except the comparison is the loop's
# only exit, so the loop never terminates and the step is KILLED at
# `timeout-minutes: 6` with NO exit code — the one row the table calls a script
# bug. A non-numeric POLL_EVERY_S makes `sleep` fail, which under `set -e` is
# exit 1: "the suite ran and FAILED on this SHA. Do not deploy."
if [[ ! "$POLL_CAP_S" =~ ^[0-9]+$ ]]; then
  echo "await-mcp-test-run: POLL_CAP_S must be whole seconds, got '${POLL_CAP_S}'" >&2
  exit 2
fi
# Fractional is allowed (the tests poll at 0.2 s), and so is 0 — the cap is
# wall-clock, so a zero interval spins for POLL_CAP_S and stops. Under the sleep
# accumulator this replaced, 0 would have looped forever; the coverage case for
# the wall-clock cap is exactly that.
if [[ ! "$POLL_EVERY_S" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
  echo "await-mcp-test-run: POLL_EVERY_S must be a non-negative number, got '${POLL_EVERY_S}'" >&2
  exit 2
fi

# Dependency probes, and they are not ceremony: this step runs BEFORE
# `actions/setup-node`, so it relies on the runner's preinstalled toolchain.
# Absent either binary the script would otherwise burn the full cap and then
# blame a proxy (6) or a dead credential (5) — a misdiagnosis pointing the
# operator at the wrong repair. Missing tools are input problems: exit 2.
for dep in gh node; do
  if ! command -v "$dep" >/dev/null 2>&1; then
    echo "await-mcp-test-run: '${dep}' is not on PATH — this step runs before setup-node and depends on the preinstalled runner toolchain" >&2
    exit 2
  fi
done

# `head_sha` is an exact server-side match, so absence is a first-class signal
# (total_count == 0) rather than an empty-string inference. It also removes the
# old branch+per_page=30 scoping, and removes `head -1`: the list is
# newest-first and the upstream suite runs cancel-in-progress, so a superseded
# `cancelled` run can sit AHEAD of a `success` run for the same SHA. Selecting
# the first would hard-fail a commit the suite passed. per_page=100 keeps
# total_count and the returned page in agreement.
API="repos/${REPO}/actions/workflows/${WORKFLOW}/runs?head_sha=${TARGET_SHA}&event=push&per_page=100"

echo "await-mcp-test-run: waiting up to ${POLL_CAP_S}s for ${WORKFLOW} on ${TARGET_SHA}"

# WALL-CLOCK, not a sleep accumulator. The step carries `timeout-minutes: 6`
# and each attempt costs a round trip (~0.6 s measured), so 30 sleeps of 10 s
# plus 31 round trips can exceed 360 s under degraded API latency — the step
# would be KILLED mid-poll and emit no exit code at all, in the one place an
# operator reads exit codes. `SECONDS` counts real time, so the script's own
# cap always fires first and the step timeout stays what it is meant to be: a
# hang defence.
SECONDS=0

# Per-attempt state, RESET each iteration. The cap arms below are decided by the
# FINAL attempt, save for the single remembered fact declared just after this: a
# `count` surviving from an earlier attempt would let a since-dead API report
# exit 4 ("no run ever appeared"), which is the one code whose operator action is
# `workflow_dispatch` — deploying with no verification at all. The asymmetry is
# deliberate. A blip on the last attempt costs a wrong-but-safe 5 or 6 (a wasted
# re-run); a stale count costs an unverified production deploy.
last_parsed=0
last_transport=0
count=""

# The one thing worth remembering ACROSS attempts, and only this: that a run for
# this SHA was seen in flight at least once. "The suite was still going" (3) and
# "the credential is dead" (5) have opposite operator actions, so a late API
# blip must not overwrite an observation the poll already made. This does not
# reopen the stale-count hole — exit 4 still requires a LIVE final observation
# of count == 0; a remembered sighting can only ever route to 3, the code whose
# advice is "re-run", which is safe to be wrong about.
ever_saw_run=0

while :; do
  last_parsed=0
  last_transport=0
  # Reset too, so the comment above is structurally true rather than incidentally
  # true. `count` is only read under `last_parsed = 1`, which already guarantees
  # this iteration assigned it — but that is a property of the current arms, and
  # the whole class of defect here has been state outliving the attempt that
  # produced it.
  count=""

  # `set -e` would abort on a non-zero gh exit, which would turn an API error
  # into an abort rather than a retry. Wrapping in `if !` suspends that. NOTE:
  # smoke-probe.sh uses `curl ... || echo ""`, which collapses error into empty
  # — the exact conflation this guard exists to remove. Copy its shape, not
  # that line.
  if ! resp="$(gh api "$API" 2>/dev/null)"; then
    resp=""
  else
    last_transport=1
  fi

  # Parsed with node rather than `gh api --jq`, deliberately: --jq makes gh exit
  # non-zero on a parse failure, which would collapse the transport and parse
  # cases back into one code. Node is present on GitHub runners and locally, so
  # the stub matrix can exercise this path.
  #
  # A body that parses as JSON but carries no `workflow_runs` ARRAY — a GitHub
  # error object served with a 200, say — is a PARSE failure, not "count 0".
  # Treating it as count 0 would land it on exit 4 and send the operator to
  # `workflow_dispatch` over an API defect.
  total=""
  if [ -n "$resp" ]; then
    total="$(printf '%s' "$resp" | node -e '
      let raw = "";
      process.stdin.on("data", (d) => (raw += d));
      process.stdin.on("end", () => {
        try {
          const j = JSON.parse(raw);
          if (!j || !Array.isArray(j.workflow_runs) || typeof j.total_count !== "number") {
            process.exit(9);
          }
          const runs = j.workflow_runs;
          const anySuccess = runs.some((r) => r && r.conclusion === "success");
          const anyPending = runs.some((r) => !r || r.status !== "completed");
          process.stdout.write(
            [j.total_count, anySuccess ? 1 : 0, anyPending ? 1 : 0].join(" ")
          );
        } catch {
          process.exit(9);
        }
      });
    ' 2>/dev/null || true)"
  fi

  if [ -n "$total" ]; then
    last_parsed=1
    set -- $total
    count="$1"; any_success="$2"; any_pending="$3"
    if [ "$count" != "0" ]; then
      ever_saw_run=1
    fi

    if [ "$any_success" = "1" ]; then
      echo "await-mcp-test-run: MCP Server Test Suite passed on ${TARGET_SHA} (${SECONDS}s)"
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

  if [ "$SECONDS" -ge "$POLL_CAP_S" ]; then
    break
  fi
  sleep "$POLL_EVERY_S"
done

# Cap reached. Four outcomes, distinguished because their operator ACTIONS
# differ — and decided by what the final attempt actually observed.
if [ "$last_parsed" = "1" ]; then
  # Exit 4 demands BOTH halves: a LIVE final observation of count == 0, and no
  # sighting anywhere in the window. It is the only code whose operator action is
  # `workflow_dispatch` — deploying with no verification — so "no run ever
  # appeared" has to mean it. The list endpoint's own failure mode is lying about
  # absence (that is what the message below calls list-visibility lag); if it can
  # lie at the start of the window it can lie at the end, and a late `total_count`
  # of 0 must not erase a run this poll already watched running.
  #
  # The arm is therefore MONOTONE: a remembered sighting can only ever route to 3,
  # with no exception. Nothing the poll saw can be undone by what it saw later.
  if [ "$count" = "0" ] && [ "$ever_saw_run" = "0" ]; then
    echo "await-mcp-test-run: no ${WORKFLOW} run ever appeared for ${TARGET_SHA} in ${POLL_CAP_S}s — most likely list-visibility lag. Check whether the upstream suite legitimately skipped this commit before using workflow_dispatch." >&2
    exit 4
  fi
  echo "await-mcp-test-run: ${WORKFLOW} was seen running on ${TARGET_SHA} and had not reached a verdict after ${POLL_CAP_S}s — re-run this deploy; do NOT workflow_dispatch." >&2
  exit 3
fi

# The final attempt told us nothing — but if the poll ever SAW a run for this
# SHA, that outranks the blip that ended it. Reporting 5 here would tell the
# operator not to re-run when re-running is the entire remedy.
if [ "$ever_saw_run" = "1" ]; then
  echo "await-mcp-test-run: a ${WORKFLOW} run for ${TARGET_SHA} was seen in flight, but the API stopped answering before it resolved — re-run this deploy; do NOT workflow_dispatch." >&2
  exit 3
fi

if [ "$last_transport" = "0" ]; then
  echo "await-mcp-test-run: no successful API response in ${POLL_CAP_S}s — dead token, revoked permission, or a GitHub outage. Re-running will not help; fix the credential." >&2
  exit 5
fi

echo "await-mcp-test-run: API responded but no body was parseable in ${POLL_CAP_S}s — often a proxy or interstitial returning non-JSON, and usually transient. Re-run first." >&2
exit 6
