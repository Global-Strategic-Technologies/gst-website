<#
.SYNOPSIS
    Probe Cloudflare Analytics Engine to verify Phase 1 metric emission.

.DESCRIPTION
    BL-032.75 Phase 1 emits typed events to Analytics Engine via
    `env.METRICS.writeDataPoint(...)`. This script queries the AE SQL API
    and prints a per-env breakdown of event counts grouped by
    (event_type, name, outcome).

    Intended as a reusable post-deploy sanity check until Phase 3 Grafana
    dashboards land. Read-only.

    Procedure for minting the read token lives in
    [DEPLOY.md § C.X](../src/docs/operations/DEPLOY.md#cx--analytics-engine-sql-query-bl-03275-phase-3).

.PARAMETER Env
    Which env(s) to query. Defaults to both. Pass `staging` or `production`
    to scope the probe.

.PARAMETER WindowHours
    Lookback window in hours. Defaults to 24.

.PARAMETER Detailed
    Additionally print an `inoreader_call` breakdown grouped by
    (name, outcome, status_code, zone1) — the blob2/blob4/blob6/blob7
    columns. Use when characterizing Inoreader-egress anomalies (which
    calls, what outcomes/status codes, Zone-1 vs not); referenced from the
    `inoreader-budget-exhausted` runbook.

.EXAMPLE
    PS> $env:CF_AE_TOKEN = '<token>'
    PS> $env:CLOUDFLARE_ACCOUNT_ID = '<account id>'
    PS> .\scripts\Verify-AeEmission.ps1

.EXAMPLE
    PS> .\scripts\Verify-AeEmission.ps1 -Env production -WindowHours 6

.EXAMPLE
    # Per-status/Zone-1 breakdown of the Inoreader egress (budget triage)
    PS> .\scripts\Verify-AeEmission.ps1 -Env production -WindowHours 6 -Detailed

.NOTES
    Requires `$env:CF_AE_TOKEN` (Account | Account Analytics | Read) and
    `$env:CLOUDFLARE_ACCOUNT_ID`. The script fails loudly if either is unset —
    keeping the token out of script arguments avoids leaking it into
    shell history / transcripts.
#>
[CmdletBinding()]
param(
    [ValidateSet('staging', 'production', 'both')]
    [string]$Env = 'both',

    [ValidateRange(1, 168)]
    [int]$WindowHours = 24,

    # When set, additionally print an inoreader_call breakdown grouped by
    # (name, outcome, status_code, zone1) — useful for Phase 1 Step 6
    # post-deploy verification of the blob6/blob7 emission.
    [switch]$Detailed
)

$ErrorActionPreference = 'Stop'

if (-not $env:CF_AE_TOKEN) {
    throw 'CF_AE_TOKEN not set. Mint per DEPLOY.md C.X and run: $env:CF_AE_TOKEN = ''<token>'''
}
# Wrangler 4.x renamed `CF_ACCOUNT_ID` → `CLOUDFLARE_ACCOUNT_ID` (the
# legacy name still works but emits a deprecation warning on every
# invocation). Prefer the new name; fall back to the legacy name so
# operators with the old export don't break mid-session.
if (-not $env:CLOUDFLARE_ACCOUNT_ID -and $env:CF_ACCOUNT_ID) {
    $env:CLOUDFLARE_ACCOUNT_ID = $env:CF_ACCOUNT_ID
}
if (-not $env:CLOUDFLARE_ACCOUNT_ID) {
    throw 'CLOUDFLARE_ACCOUNT_ID not set. Get via "npx wrangler whoami" and run: $env:CLOUDFLARE_ACCOUNT_ID = ''<id>'''
}

$datasets = @{
    staging    = 'mcp_events_staging'
    production = 'mcp_events'
}

$targets = if ($Env -eq 'both') { @('staging', 'production') } else { @($Env) }

$uri = "https://api.cloudflare.com/client/v4/accounts/$env:CLOUDFLARE_ACCOUNT_ID/analytics_engine/sql"
$headers = @{
    'Authorization' = "Bearer $env:CF_AE_TOKEN"
    'Content-Type'  = 'application/json'
}

foreach ($target in $targets) {
    $dataset = $datasets[$target]
    $sql = @"
SELECT blob1 AS event_type, blob2 AS name, blob4 AS outcome, count() AS n
FROM $dataset
WHERE timestamp > NOW() - INTERVAL '$WindowHours' HOUR
GROUP BY blob1, blob2, blob4
ORDER BY n DESC
FORMAT JSON
"@

    Write-Host ""
    Write-Host "=== $target ($dataset, last ${WindowHours}h) ===" -ForegroundColor Cyan

    try {
        $response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $sql
    } catch {
        Write-Host "  Query failed: $_" -ForegroundColor Red
        continue
    }

    if (-not $response.data -or $response.data.Count -eq 0) {
        Write-Host "  No events in window." -ForegroundColor Yellow
        continue
    }

    $response.data |
        Select-Object event_type, name, outcome, @{Name='n'; Expression={[int]$_.n}} |
        Format-Table -AutoSize

    if ($Detailed) {
        Write-Host "  --- inoreader_call detail (name, outcome, status_code, zone1) ---" -ForegroundColor DarkCyan
        $detailSql = @"
SELECT blob2 AS name, blob4 AS outcome, blob6 AS status_code, blob7 AS zone1, count() AS n
FROM $dataset
WHERE blob1 = 'inoreader_call' AND timestamp > NOW() - INTERVAL '$WindowHours' HOUR
GROUP BY blob2, blob4, blob6, blob7
ORDER BY n DESC
FORMAT JSON
"@
        try {
            $detail = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $detailSql
        } catch {
            Write-Host "  Detail query failed: $_" -ForegroundColor Red
            continue
        }
        if (-not $detail.data -or $detail.data.Count -eq 0) {
            Write-Host "  (no inoreader_call rows in window)" -ForegroundColor Yellow
        } else {
            $detail.data |
                Select-Object name, outcome, status_code, zone1, @{Name='n'; Expression={[int]$_.n}} |
                Format-Table -AutoSize
        }
    }
}
