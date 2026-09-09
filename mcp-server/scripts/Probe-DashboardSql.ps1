<#
.SYNOPSIS
    Run every dashboard panel's SQL against the real AE dataset and report the
    COLUMN NAMES each one returns. The acceptance test for a dashboard change.

.DESCRIPTION
    The defect BL-158 fixed is invisible to a row count: a merged split still
    returns rows. What distinguishes a working split from a merged one is the
    SHAPE - a fixed panel returns one column per series (`minted`, `reissued`,
    ...), a merged one returns the two columns `outcome` and `n`.

    Grafana macros are not AE SQL, so each query is rewritten before sending:
      $dataset     -> the chosen dataset
      $timeFilter  -> timestamp > NOW() - INTERVAL '<n>' DAY
      $timeSeries  -> dropped, along with GROUP BY/ORDER BY t

    Dropping the time bucketing is deliberate: it collapses each panel to a
    single row while keeping every SELECT column, which is exactly what needs
    checking, and it avoids depending on how $timeSeries expands.

    Read-only. Requires $env:CF_AE_TOKEN (Account | Account Analytics | Read)
    and $env:CLOUDFLARE_ACCOUNT_ID. Run from the REPO ROOT: -Dashboard defaults
    to a repo-root-relative path. -Dataset defaults to PRODUCTION (mcp_events).

    Companion to Verify-AeEmission.ps1, not a duplicate: that one runs a fixed
    set of queries and answers "is emission working"; this one runs whatever
    the dashboard currently ships and answers "do these panels work", so it
    cannot drift out of sync with the panels the way a hand-copied query would.

    Found two real defects on its first production run (BL-159): a panel that
    could never return a status code, and a latency panel reporting 0 as though
    it meant instant.

.EXAMPLE
    PS> $env:CF_AE_TOKEN = '<token>'; $env:CLOUDFLARE_ACCOUNT_ID = '<account id>'
    PS> cd C:\Code\gst-website     # $Dashboard defaults to a repo-root-relative path
    PS> .\mcp-server\scripts\Probe-DashboardSql.ps1

.EXAMPLE
    PS> .\mcp-server\scripts\Probe-DashboardSql.ps1 -Days 30 -DryRun   # print SQL, send nothing
#>
[CmdletBinding()]
param(
    [string]$Dashboard = 'mcp-server/observability/grafana-dashboard.json',
    [ValidateSet('mcp_events', 'mcp_events_staging')]
    [string]$Dataset = 'mcp_events',
    [ValidateRange(1, 90)]
    [int]$Days = 7,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Dashboard)) { throw "Dashboard not found: $Dashboard (run from the repo root)" }
if (-not $DryRun) {
    if (-not $env:CF_AE_TOKEN) { throw 'Set $env:CF_AE_TOKEN (Account | Account Analytics | Read)' }
    if (-not $env:CLOUDFLARE_ACCOUNT_ID) { throw 'Set $env:CLOUDFLARE_ACCOUNT_ID (npx wrangler whoami)' }
}

$json = Get-Content $Dashboard -Raw | ConvertFrom-Json
$uri = "https://api.cloudflare.com/client/v4/accounts/$($env:CLOUDFLARE_ACCOUNT_ID)/analytics_engine/sql"
$fails = 0

foreach ($panel in $json.panels) {
    if (-not $panel.targets) { continue }
    foreach ($t in $panel.targets) {
        if (-not $t.query) { continue }

        $sql = $t.query `
            -replace '\$dataset', $Dataset `
            -replace '\$timeFilter', "timestamp > NOW() - INTERVAL '$Days' DAY" `
            -replace '(?m)^\s*\$timeSeries\s+AS\s+t\s*,\s*\r?\n?', '' `
            -replace '\$timeSeries\s+AS\s+t\s*,\s*', '' `
            -replace '(?is)\bGROUP BY\s+t\s*$', '' `
            -replace '(?is)\bGROUP BY\s+t\b\s*(?=ORDER BY)', '' `
            -replace '(?is)\bORDER BY\s+t\s*$', ''
        $sql = ($sql -split '\r?\n' | Where-Object { $_.Trim() } ) -join "`n"

        Write-Host "`n=== $($panel.title)" -ForegroundColor Cyan
        if ($DryRun) { Write-Host $sql -ForegroundColor DarkGray; continue }

        try {
            $res = Invoke-RestMethod -Method Post -Uri $uri -Body $sql `
                -Headers @{ Authorization = "Bearer $env:CF_AE_TOKEN" } -ContentType 'application/json'
            $row = $res.data | Select-Object -First 1
            if ($null -eq $row) {
                Write-Host '  no rows (may be legitimate - an empty window)' -ForegroundColor Yellow
            }
            else {
                $cols = $row.PSObject.Properties.Name
                Write-Host "  columns: $($cols -join ', ')" -ForegroundColor Green
                # THE check: a merged split returns a label column + `n`.
                #
                # Keyed off the ORIGINAL query's GROUP BY, not the column count.
                # A time-series panel that splits by nothing legitimately returns
                # a single `n` (Trial paywall hits is one), and an earlier version
                # of this heuristic flagged it - a false positive on a correct
                # panel is worse than no check, because it trains you to ignore
                # the red. The merge bug is specifically a GROUP BY on something
                # other than the time alias, so test for exactly that.
                $gb = [regex]::Match($t.query, '(?is)\bGROUP BY\b(.*?)(?:\bORDER BY\b|\bLIMIT\b|$)')
                $splitTerms = @()
                if ($gb.Success) {
                    $splitTerms = $gb.Groups[1].Value -split ',' |
                        ForEach-Object { $_.Trim() } |
                        Where-Object { $_ -and $_ -ne 't' }
                }
                if ($t.format -eq 'time_series' -and $splitTerms.Count -gt 0) {
                    Write-Host "  ^^ MERGED - time_series panel groups by $($splitTerms -join ', '). Expected one sumIf column per series (BL-158)." -ForegroundColor Red
                    $fails++
                }
                Write-Host "  first row: $($row | ConvertTo-Json -Compress)" -ForegroundColor DarkGray
            }
        }
        catch {
            Write-Host "  QUERY ERROR: $($_.Exception.Message)" -ForegroundColor Red
            if ($_.ErrorDetails.Message) { Write-Host "  $($_.ErrorDetails.Message)" -ForegroundColor Red }
            $fails++
        }
    }
}

Write-Host ''
if ($DryRun) { Write-Host 'dry run - nothing sent' -ForegroundColor Yellow }
elseif ($fails -eq 0) { Write-Host 'All panels returned without error and none looks merged.' -ForegroundColor Green }
else { Write-Host "$fails panel(s) need attention (see red above)." -ForegroundColor Red }
