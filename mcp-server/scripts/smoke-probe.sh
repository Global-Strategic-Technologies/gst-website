#!/usr/bin/env bash
# BL-037 deploy smoke probe — shared by deploy-mcp-staging.yml and
# deploy-mcp-production.yml.
#
# Polls $HOST/health.gitSha for up to 60s with exponential backoff,
# comparing against the leading 7 chars of $EXPECTED_SHA. Defeats
# Cloudflare-edge caching with a per-attempt query-string cache-buster
# plus no-cache request headers. Captures the raw response body on
# final failure so operators can see WHY the probe didn't match (HTML
# error interstitial, non-JSON, missing gitSha field, etc.).
#
# Usage (from a workflow step):
#   env:
#     HOST: https://mcp-staging.globalstrategic.tech
#     EXPECTED_SHA: ${{ github.event.workflow_run.head_sha }}
#   run: bash mcp-server/scripts/smoke-probe.sh
#
# Exit codes:
#   0 — /health.gitSha matched within the retry window
#   1 — exhausted retries; deploy IS already on the Worker (wrangler
#       succeeded) — operator decision to re-deploy or rollback.
#   2 — input-validation failure (bad SHA shape, missing env vars).
set -euo pipefail

if [ -z "${HOST:-}" ] || [ -z "${EXPECTED_SHA:-}" ]; then
  echo "smoke-probe: HOST and EXPECTED_SHA env vars are required"
  exit 2
fi

# `deploy.mjs` pins SHA to `--short=7`. We compare against the leading 7
# chars of EXPECTED_SHA, regardless of whether the workflow passes us a
# full 40-char SHA or the short form already. Validate before any curl.
EXPECTED="${EXPECTED_SHA:0:7}"
if ! [[ "$EXPECTED" =~ ^[0-9a-f]{7}$ ]]; then
  echo "smoke-probe: EXPECTED='$EXPECTED' is not a 7-char hex SHA"
  exit 2
fi

echo "smoke-probe: target=$HOST"
echo "smoke-probe: expecting gitSha to report $EXPECTED"

# Exponential-ish backoff: 2/4/6/8/10/10/10/10/10/10 = 70s total budget.
# Catches fast deploys quickly, tolerates slow CF propagation.
WAITS=(2 4 6 8 10 10 10 10 10 10)
LAST_BODY=""
LAST_ACTUAL=""

for i in "${!WAITS[@]}"; do
  ATTEMPT=$((i + 1))
  CACHE_BUSTER="t=$(date +%s%N)"
  # Capture raw body to a variable so we can log it on final failure.
  LAST_BODY=$(curl -fsS \
    -H "Cache-Control: no-cache" \
    -H "Pragma: no-cache" \
    "$HOST/health?${CACHE_BUSTER}" 2>&1 || echo "")
  LAST_ACTUAL=$(echo "$LAST_BODY" | jq -r '.gitSha // empty' 2>/dev/null || echo "")

  if [ "$LAST_ACTUAL" = "$EXPECTED" ]; then
    echo "smoke-probe: OK gitSha=$LAST_ACTUAL on attempt $ATTEMPT"
    exit 0
  fi

  WAIT=${WAITS[$i]}
  echo "smoke-probe: attempt $ATTEMPT saw gitSha='${LAST_ACTUAL:-<empty>}', sleeping ${WAIT}s"
  sleep "$WAIT"
done

# Exhausted retries — log diagnostic state and exit 1.
echo "smoke-probe: FAILED — expected gitSha=$EXPECTED, last seen='${LAST_ACTUAL:-<empty>}'"
echo "smoke-probe: last raw /health response body (first 500 chars):"
echo "${LAST_BODY:0:500}"
echo ""
echo "smoke-probe: deploy IS already on the Worker (wrangler succeeded). The"
echo "smoke-probe: gap may indicate a /health regression, a Cloudflare"
echo "smoke-probe: propagation stall, or an Upstash blip. Operator decision:"
echo "smoke-probe: re-deploy a fix or invoke the rollback workflow."
exit 1
