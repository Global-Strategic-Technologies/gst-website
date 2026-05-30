<#
.SYNOPSIS
    Verify a scoped Upstash REST token honors the BL-041 ACL contract.

.DESCRIPTION
    BL-041 mints scoped Upstash users (`mcp-worker-rw`, `mcp-readonly-ops`)
    with the deny-by-default ACL:

        ACL SETUSER <name> on >{PWD} ~mcp:* -@all +@read +@write +@string +@sortedset +@scripting

    Before binding a freshly-minted REST token to the Worker via
    `wrangler secret put UPSTASH_MCP_REST_TOKEN`, run this script against
    the same token to verify:

      Positive (must succeed) — every Redis command the Worker actually
      issues against `gst-mcp`:
        - SET / GET / DEL  (token store, status, locks)
        - INCR / INCRBY / EXPIRE / TTL  (egress counters, day counter,
          OAuth TTL probe)
        - MGET  (egress total + per-category read in /health)
        - SET NX EX  (single-flight lock, daily drift debounce)
        - ZADD / ZREMRANGEBYSCORE / ZCARD  (@upstash/ratelimit sliding-window)
        - SCRIPT LOAD "return 1"  (audit B2 fix — raw probe so we don't
          rely on an SDK NOSCRIPT cache hit masking the gap)
        - Ratelimit.slidingWindow().limit() end-to-end  (audit M1 fix —
          delegated to a Node sibling so the real SDK is exercised, not
          a manual ZADD+EVAL approximation)

      Negative (must return NOPERM) — substrate dangerous commands the
      scoped user must NOT be able to issue:
        - FLUSHDB / FLUSHALL  (would wipe the substrate)
        - CONFIG GET           (info disclosure)
        - DEBUG OBJECT         (info disclosure)
        - CLUSTER NODES        (cluster surface)
        - SHUTDOWN             (substrate kill)
        - KEYS *               (full-scan info disclosure + perf risk)

      Keyspace deny (must return NOPERM) — proves `~mcp:*` keypattern
      restriction works:
        - SET inoreader:foo "x"  (outside the allowed pattern)

    Audit-baked design:
      - Token is supplied via `$env:UPSTASH_TEST_TOKEN` + URL via
        `$env:UPSTASH_TEST_URL` — never inlined into arguments / scrollback.
      - Probe keys are prefixed `mcp:test:acl:<uuid>:*` so a botched run
        leaves no permanent residue; cleanup is best-effort DEL at the end.
      - Exit code 0 only when EVERY positive succeeded AND EVERY negative
        returned NOPERM (or the keyspace-deny variant). Anything else is a
        loud red FAIL.

.PARAMETER SkipRatelimit
    Skip the Node-side Ratelimit SDK probe. Useful when iterating on the
    PS1 surface; do NOT skip when verifying a real rotation.

.EXAMPLE
    PS> $env:UPSTASH_TEST_URL = 'https://<db>.upstash.io'
    PS> $env:UPSTASH_TEST_TOKEN = '<scoped REST token from ACL RESTTOKEN>'
    PS> .\scripts\Test-UpstashAcl.ps1

.NOTES
    Mint procedure for the scoped token lives in
    [DEPLOY.md § "Upstash ACL hardening"](../src/docs/operations/DEPLOY.md).
#>
[CmdletBinding()]
param(
    [switch]$SkipRatelimit
)

$ErrorActionPreference = 'Stop'

if (-not $env:UPSTASH_TEST_URL) {
    throw 'UPSTASH_TEST_URL not set. Set to https://<db>.upstash.io for the gst-mcp database.'
}
if (-not $env:UPSTASH_TEST_TOKEN) {
    throw 'UPSTASH_TEST_TOKEN not set. Set to the REST token minted via ACL RESTTOKEN <user> <pwd>.'
}

$Url = $env:UPSTASH_TEST_URL.TrimEnd('/')
$Token = $env:UPSTASH_TEST_TOKEN
$ProbeUuid = [guid]::NewGuid().ToString('N').Substring(0, 8)
$ProbeKeyPrefix = "mcp:test:acl:$ProbeUuid"

$passes = 0
$fails = 0
$failures = New-Object System.Collections.Generic.List[string]

function Invoke-UpstashCommand {
    param([string[]]$Command)
    $body = ConvertTo-Json $Command -Compress
    try {
        $resp = Invoke-RestMethod -Uri $Url -Method Post `
            -Headers @{ Authorization = "Bearer $Token"; 'Content-Type' = 'application/json' } `
            -Body $body
        return @{ Ok = $true; Result = $resp.result; Error = $null }
    } catch {
        # Upstash returns 4xx with a JSON body like {"error":"NOPERM ..."}
        $errorBody = $null
        if ($_.ErrorDetails.Message) {
            try { $errorBody = ($_.ErrorDetails.Message | ConvertFrom-Json).error } catch {}
        }
        return @{ Ok = $false; Result = $null; Error = ($errorBody ?? $_.Exception.Message) }
    }
}

function Assert-Positive {
    param([string]$Label, [string[]]$Command)
    $r = Invoke-UpstashCommand -Command $Command
    if ($r.Ok) {
        $script:passes++
        Write-Host "  PASS  $Label" -ForegroundColor Green
    } else {
        $script:fails++
        $script:failures.Add("POS $Label  ->  $($r.Error)")
        Write-Host "  FAIL  $Label  ->  $($r.Error)" -ForegroundColor Red
    }
}

function Assert-Noperm {
    param([string]$Label, [string[]]$Command)
    $r = Invoke-UpstashCommand -Command $Command
    if (-not $r.Ok -and ($r.Error -match 'NOPERM' -or $r.Error -match 'no permission')) {
        $script:passes++
        Write-Host "  PASS  $Label  (NOPERM as expected)" -ForegroundColor Green
    } elseif ($r.Ok) {
        $script:fails++
        $script:failures.Add("NEG $Label  ->  command succeeded but should have been denied")
        Write-Host "  FAIL  $Label  ->  command SUCCEEDED but ACL should deny it" -ForegroundColor Red
    } else {
        $script:fails++
        $script:failures.Add("NEG $Label  ->  unexpected error: $($r.Error)")
        Write-Host "  FAIL  $Label  ->  expected NOPERM, got: $($r.Error)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== BL-041 ACL contract probe ($Url, prefix $ProbeKeyPrefix) ===" -ForegroundColor Cyan

Write-Host ""
Write-Host "-- Positive: Worker's actual command surface --" -ForegroundColor DarkCyan
Assert-Positive 'SET'                    @('SET', "$ProbeKeyPrefix:string", 'v')
Assert-Positive 'GET'                    @('GET', "$ProbeKeyPrefix:string")
Assert-Positive 'SET NX EX (single-flight lock pattern)' @('SET', "$ProbeKeyPrefix:lock", 'owner', 'NX', 'EX', '60')
Assert-Positive 'INCR (egress counter)'  @('INCR', "$ProbeKeyPrefix:counter")
Assert-Positive 'INCRBY (cron day counter)' @('INCRBY', "$ProbeKeyPrefix:counter", '6')
Assert-Positive 'EXPIRE (counter TTL)'   @('EXPIRE', "$ProbeKeyPrefix:counter", '3600')
Assert-Positive 'TTL (OAuth token expiry probe)' @('TTL', "$ProbeKeyPrefix:counter")
Assert-Positive 'MGET (egress total + per-cat read)' @('MGET', "$ProbeKeyPrefix:string", "$ProbeKeyPrefix:counter")
Assert-Positive 'DEL (lock release, cache invalidation)' @('DEL', "$ProbeKeyPrefix:string")

Write-Host ""
Write-Host "-- Positive: @upstash/ratelimit sliding-window surface --" -ForegroundColor DarkCyan
Assert-Positive 'ZADD (ratelimit window)' @('ZADD', "$ProbeKeyPrefix:zset", '1', 'm1')
Assert-Positive 'ZADD (second member)'    @('ZADD', "$ProbeKeyPrefix:zset", '2', 'm2')
Assert-Positive 'ZCARD (ratelimit count)' @('ZCARD', "$ProbeKeyPrefix:zset")
Assert-Positive 'ZREMRANGEBYSCORE (window prune)' @('ZREMRANGEBYSCORE', "$ProbeKeyPrefix:zset", '0', '1')

Write-Host ""
Write-Host "-- Positive: scripting surface (audit B2 raw probe) --" -ForegroundColor DarkCyan
# Raw SCRIPT LOAD — NOT via SDK, so a cached SHA on the substrate from a
# prior admin-token run cannot mask the NOPERM gap. Returns the SHA1 of the
# loaded script body on success.
Assert-Positive 'SCRIPT LOAD "return 1"' @('SCRIPT', 'LOAD', 'return 1')
Assert-Positive 'EVAL "return 1"'        @('EVAL', 'return 1', '0')

Write-Host ""
Write-Host "-- Negative: substrate-dangerous commands (NOPERM expected) --" -ForegroundColor DarkCyan
Assert-Noperm 'FLUSHDB'      @('FLUSHDB')
Assert-Noperm 'FLUSHALL'     @('FLUSHALL')
Assert-Noperm 'CONFIG GET'   @('CONFIG', 'GET', 'maxmemory')
Assert-Noperm 'DEBUG OBJECT' @('DEBUG', 'OBJECT', "$ProbeKeyPrefix:counter")
Assert-Noperm 'CLUSTER NODES' @('CLUSTER', 'NODES')
Assert-Noperm 'SHUTDOWN'     @('SHUTDOWN', 'NOSAVE')
Assert-Noperm 'KEYS *'       @('KEYS', '*')

Write-Host ""
Write-Host "-- Negative: keyspace deny (outside ~mcp:* pattern) --" -ForegroundColor DarkCyan
Assert-Noperm 'SET inoreader:foo (outside ~mcp:*)' @('SET', 'inoreader:foo', 'x')
Assert-Noperm 'GET inoreader:foo (outside ~mcp:*)' @('GET', 'inoreader:foo')

if (-not $SkipRatelimit) {
    Write-Host ""
    Write-Host "-- Positive: @upstash/ratelimit end-to-end (Node SDK delegate) --" -ForegroundColor DarkCyan
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        $fails++
        $failures.Add('Ratelimit SDK probe SKIPPED — node not on PATH')
        Write-Host "  FAIL  node not on PATH (cannot run ratelimit SDK probe)" -ForegroundColor Red
    } else {
        $scriptPath = Join-Path $PSScriptRoot 'verify-ratelimit-acl.mjs'
        $env:UPSTASH_TEST_URL = $Url
        $env:UPSTASH_TEST_TOKEN = $Token
        $env:UPSTASH_TEST_PROBE_KEY = "$ProbeKeyPrefix:ratelimit"
        & node $scriptPath
        if ($LASTEXITCODE -eq 0) {
            $passes++
            Write-Host "  PASS  Ratelimit.slidingWindow().limit() end-to-end" -ForegroundColor Green
        } else {
            $fails++
            $failures.Add("Ratelimit SDK probe FAILED (exit $LASTEXITCODE) — see node output above")
            Write-Host "  FAIL  Ratelimit SDK probe (exit $LASTEXITCODE)" -ForegroundColor Red
        }
    }
}

# Best-effort cleanup of probe keys we created.
Write-Host ""
Write-Host "-- Cleanup (best-effort) --" -ForegroundColor DarkGray
foreach ($suffix in @(':string', ':lock', ':counter', ':zset', ':ratelimit')) {
    Invoke-UpstashCommand -Command @('DEL', "$ProbeKeyPrefix$suffix") | Out-Null
}

Write-Host ""
Write-Host "===========================================================" -ForegroundColor Cyan
if ($fails -eq 0) {
    Write-Host "ALL CHECKS PASSED  ($passes positive + negative assertions)" -ForegroundColor Green
    Write-Host "Token is safe to bind via wrangler secret put." -ForegroundColor Green
    exit 0
} else {
    Write-Host "$fails FAILED, $passes passed" -ForegroundColor Red
    Write-Host "Failures:" -ForegroundColor Red
    foreach ($f in $failures) { Write-Host "  - $f" -ForegroundColor Red }
    Write-Host ""
    Write-Host "DO NOT bind this token — investigate the ACL string or REST-token mint." -ForegroundColor Red
    exit 1
}
