<#
.SYNOPSIS
    BL-047 — empirical test of Inoreader's refresh-token rotation policy.

.DESCRIPTION
    Answers two questions Inoreader's docs leave undefined:

      1. **Rotation regime** — does every successful refresh return a NEW
         refresh_token, or does the SAME one come back? (Sparse vs. dense
         rotation.)

      2. **Grace window** — after Inoreader issues a NEW refresh_token,
         does the OLD one still work for some seconds? Standard OAuth 2.0
         + BCP 240 says NO (reuse detection invalidates the chain);
         some real-world providers (Google, GitHub) honor a short grace.
         If Inoreader honors a grace, a bounded in-memory hedge in the
         Worker can close the cron-vs-live race + the
         upstash-write-failed recovery case.

.PARAMETER GraceWindowSeconds
    How long to wait between the first refresh call and the grace-window
    retry. Default 5s. The test still runs even if a grace window of 0
    exists (immediate-reject), so this just controls how aggressively we
    probe. Set to 30 or 60 to test longer-window behavior.

.PARAMETER Env
    Which environment's secrets to read. Defaults to `production` because
    staging shares the same Inoreader OAuth app — running on staging
    affects the same refresh-token chain. The test is destructive in the
    sense that it WILL rotate tokens if Inoreader is in dense-rotation
    mode; the script writes back to Upstash atomically.

.EXAMPLE
    PS> $env:UPSTASH_MCP_REST_URL = '<MCP DB REST URL>'
    PS> $env:UPSTASH_MCP_REST_TOKEN = '<MCP DB rw token>'
    PS> $env:INOREADER_APP_ID = '<app id>'
    PS> $env:INOREADER_APP_KEY = '<app key>'
    PS> .\scripts\Test-InoreaderRefreshGrace.ps1

.NOTES
    Pre-conditions:
      - Run outside ±2 min of the production cron firing (`0 */6 * * *`
        UTC). Cron concurrent with this test would compete for the
        single-flight Upstash refresh lock and confuse results.
      - The current production refresh_token MUST be live (not already
        dead) — otherwise step 1 fails with invalid_grant and the test
        is inconclusive.
      - Run from outside the Worker (this PowerShell session). The
        Worker's single-flight refresh lock does not protect against
        external POSTs; we mitigate by writing rotations back to Upstash
        immediately so the Worker sees the latest token.

    Outputs a JSON summary with five fields:
      - currentRefreshTokenLength: length of the token in Upstash now
      - firstCallResult: 'success' | 'invalid_grant' | 'other'
      - rotationObserved: true if response refresh_token != input
      - retryWithOldTokenResult: 'success' | 'invalid_grant' | 'other'
      - retryWithOldTokenLatencyMs: how long the retry took
      - rotationsObservedInTest: integer (the original + any retries that rotated)

    Decision matrix:
      - retryWithOldTokenResult=='invalid_grant' → strict reuse-detection,
        in-memory grace hedge would itself trip reuse. T2 (in-browser
        recovery) is the only path. DROP the hedge proposal.
      - retryWithOldTokenResult=='success' → grace window exists,
        in-memory hedge with TTL=GraceWindowSeconds is safe to ship.
      - retryWithOldTokenResult=='other' → degenerate; re-test or pull
        Workers Logs for the error body.
#>
[CmdletBinding()]
param(
    [ValidateRange(0, 600)]
    [int]$GraceWindowSeconds = 5,

    [ValidateSet('staging', 'production')]
    [string]$Env = 'production'
)

$ErrorActionPreference = 'Stop'

foreach ($var in @('UPSTASH_MCP_REST_URL', 'UPSTASH_MCP_REST_TOKEN', 'INOREADER_APP_ID', 'INOREADER_APP_KEY')) {
    if (-not (Get-Item "env:$var" -ErrorAction SilentlyContinue)) {
        throw "$var not set. Fetch from 1Password / wrangler secret list and export as `$env:$var before running."
    }
}

$KEY_REFRESH = 'mcp:inoreader:refresh_token'
$OAUTH_URL = 'https://www.inoreader.com/oauth2/token'

function Read-RefreshTokenFromUpstash {
    $url = "$env:UPSTASH_MCP_REST_URL/get/$KEY_REFRESH"
    $headers = @{ Authorization = "Bearer $env:UPSTASH_MCP_REST_TOKEN" }
    $resp = Invoke-RestMethod -Uri $url -Method Get -Headers $headers
    if (-not $resp.result) {
        throw "No refresh_token in Upstash at key '$KEY_REFRESH' — cannot proceed. Either bootstrap via scripts/inoreader-auth.mjs first, or fall back to INOREADER_REFRESH_TOKEN env var (not supported by this script)."
    }
    return $resp.result
}

function Write-RefreshTokenToUpstash {
    param([string]$Token)
    $url = "$env:UPSTASH_MCP_REST_URL/set/$KEY_REFRESH"
    $headers = @{
        Authorization = "Bearer $env:UPSTASH_MCP_REST_TOKEN"
        'Content-Type' = 'text/plain'
    }
    Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $Token | Out-Null
}

function Invoke-InoreaderRefresh {
    param([string]$RefreshToken)
    $body = @{
        client_id     = $env:INOREADER_APP_ID
        client_secret = $env:INOREADER_APP_KEY
        grant_type    = 'refresh_token'
        refresh_token = $RefreshToken
    }
    $start = Get-Date
    try {
        $resp = Invoke-RestMethod -Uri $OAUTH_URL -Method Post -Body $body -ContentType 'application/x-www-form-urlencoded' -ErrorAction Stop
        $latencyMs = [int]((Get-Date) - $start).TotalMilliseconds
        return @{
            outcome        = 'success'
            access_token   = $resp.access_token
            refresh_token  = $resp.refresh_token
            expires_in     = $resp.expires_in
            latencyMs      = $latencyMs
        }
    } catch {
        $latencyMs = [int]((Get-Date) - $start).TotalMilliseconds
        $statusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        $body = ''
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $body = $reader.ReadToEnd()
        } catch { }
        $outcome = if ($statusCode -eq 401 -or $body -match 'invalid_grant') {
            'invalid_grant'
        } else {
            'other'
        }
        return @{
            outcome    = $outcome
            statusCode = $statusCode
            body       = $body
            latencyMs  = $latencyMs
        }
    }
}

Write-Host ""
Write-Host "BL-047 — Inoreader refresh-token grace-window probe" -ForegroundColor Cyan
Write-Host "Env: $Env  |  GraceWindow: ${GraceWindowSeconds}s" -ForegroundColor DarkGray
Write-Host ""

Write-Host "[step 1] Reading current refresh_token from Upstash..." -ForegroundColor Yellow
$originalToken = Read-RefreshTokenFromUpstash
Write-Host "         Got token (length=$($originalToken.Length))." -ForegroundColor Green

Write-Host "[step 2] First refresh call (probes rotation regime)..." -ForegroundColor Yellow
$first = Invoke-InoreaderRefresh -RefreshToken $originalToken
Write-Host "         outcome=$($first.outcome) latency=$($first.latencyMs)ms" -ForegroundColor $(if ($first.outcome -eq 'success') { 'Green' } else { 'Red' })

if ($first.outcome -ne 'success') {
    $summary = @{
        currentRefreshTokenLength = $originalToken.Length
        firstCallResult           = $first.outcome
        rotationObserved          = $false
        retryWithOldTokenResult   = 'not-tested'
        notes                     = "First refresh failed; cannot probe grace window. Body: $($first.body)"
    }
    Write-Host ""
    Write-Host "INCONCLUSIVE — first refresh failed." -ForegroundColor Red
    $summary | ConvertTo-Json
    exit 1
}

$rotationObserved = $first.refresh_token -ne $originalToken
$rotationsInTest = 0
if ($rotationObserved) {
    $rotationsInTest++
    Write-Host "         ROTATION DETECTED — new refresh_token issued by Inoreader." -ForegroundColor Magenta
    Write-Host "[step 2a] Writing new refresh_token to Upstash so Worker sees latest..." -ForegroundColor Yellow
    Write-RefreshTokenToUpstash -Token $first.refresh_token
    Write-Host "          Updated." -ForegroundColor Green
} else {
    Write-Host "         No rotation — Inoreader returned same refresh_token (sparse rotation regime, or per-call no-op)." -ForegroundColor DarkGray
}

Write-Host "[step 3] Waiting ${GraceWindowSeconds}s before grace-window probe..." -ForegroundColor Yellow
Start-Sleep -Seconds $GraceWindowSeconds

Write-Host "[step 4] Retrying with the ORIGINAL refresh_token (the one we just used)..." -ForegroundColor Yellow
$retry = Invoke-InoreaderRefresh -RefreshToken $originalToken
Write-Host "         outcome=$($retry.outcome) latency=$($retry.latencyMs)ms" -ForegroundColor $(if ($retry.outcome -eq 'success') { 'Green' } else { 'Yellow' })

if ($retry.outcome -eq 'success' -and $retry.refresh_token -ne $originalToken -and $retry.refresh_token -ne $first.refresh_token) {
    $rotationsInTest++
    Write-Host "[step 4a] Another rotation — writing newest token to Upstash..." -ForegroundColor Yellow
    Write-RefreshTokenToUpstash -Token $retry.refresh_token
    Write-Host "          Updated." -ForegroundColor Green
}

$summary = @{
    currentRefreshTokenLength    = $originalToken.Length
    firstCallResult              = $first.outcome
    rotationObserved             = $rotationObserved
    retryWithOldTokenResult      = $retry.outcome
    retryWithOldTokenLatencyMs   = $retry.latencyMs
    rotationsObservedInTest      = $rotationsInTest
    decision                     = switch ($retry.outcome) {
        'success'       { "GRACE WINDOW EXISTS at ${GraceWindowSeconds}s. In-memory hedge is safe to ship." }
        'invalid_grant' { "STRICT REUSE-DETECTION. The bounded in-memory hedge would itself trigger reuse. DROP the hedge proposal; T2 is the only path." }
        default         { "DEGENERATE response on retry — see retry body for diagnostics: $($retry.body)" }
    }
}

Write-Host ""
Write-Host "=== RESULT ===" -ForegroundColor Cyan
$summary | ConvertTo-Json
Write-Host ""
