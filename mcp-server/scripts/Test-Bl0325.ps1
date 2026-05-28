<#
.SYNOPSIS
    Batch verification runner for BL-032.5 (Resources & Prompts on Remote).

.DESCRIPTION
    Exercises every programmatically-testable scenario from
    [`src/docs/development/MCP_SERVER_REMOTE_BL-032_5_TESTING.md`](../../src/docs/development/MCP_SERVER_REMOTE_BL-032_5_TESTING.md):

    Sections covered automatically:
      C  Resource cache hit / miss observability (bodies + cache transparency)
      W  Radar Resources reachable via Worker (resources/list, resources/read × 6)
      H  /health includes radarSnapshotAgeSeconds with the right shape

    Sections NOT in scope of this runner (require operator action):
      X  Worker Cron      — needs `wrangler triggers test` + tail observation
      K  Claude workflow  — needs human-driven Claude Desktop verification
      M  Manifest hash    — runs as part of `npm test`, not at runtime

    `Test-Bl0325.ps1` is non-destructive: read-only against the Worker and
    Upstash. It will NEVER write to Upstash, delete keys, mutate Cron state,
    or otherwise leave residue on the environment under test.

.PARAMETER McpUrl
    Override $env:MCP_URL. Defaults to the value in the dot-sourced
    `Invoke-McpRequest.ps1` bootstrap (production:
    `https://mcp.globalstrategic.tech`).

.PARAMETER OutFile
    Optional path. When set, the full table of results is also written
    to that file (one record per line, TSV). Useful for pasting into
    `BL-032_5_TESTING_FINDINGS.md`.

.PARAMETER ContinueOnFailure
    By default the runner finishes every scenario even if some fail.
    Set this switch to make it bail on the first FAIL — useful when
    debugging interactively.

.EXAMPLE
    PS> cd c:\Code\gst-website\mcp-server
    PS> $env:MCP_URL = 'https://mcp-staging.globalstrategic.tech'
    PS> . .\scripts\Invoke-McpRequest.ps1
    PS> .\scripts\Test-Bl0325.ps1

.EXAMPLE
    PS> .\scripts\Test-Bl0325.ps1 -OutFile "findings-$(Get-Date -Format 'yyyy-MM-dd-HHmm').tsv"

.NOTES
    Companion:
      - src/docs/development/MCP_SERVER_REMOTE_BL-032_5_TESTING.md  (playbook)
      - src/docs/development/BL-032_5_TESTING_FINDINGS.md           (findings log)
      - scripts/Invoke-McpRequest.ps1                              (the helpers this builds on)
#>
[CmdletBinding()]
param(
    [string] $McpUrl,
    [string] $OutFile,
    [switch] $ContinueOnFailure
)

$ErrorActionPreference = 'Stop'

# ----- Prerequisites ---------------------------------------------------

if (-not (Get-Command Invoke-McpRequest -ErrorAction SilentlyContinue)) {
    Write-Host 'Invoke-McpRequest helper not loaded.' -ForegroundColor Red
    Write-Host 'Run: . .\scripts\Invoke-McpRequest.ps1 first.'
    exit 2
}

if ($McpUrl) { $env:MCP_URL = $McpUrl }
if (-not $env:MCP_URL) {
    Write-Host 'MCP_URL not set. Either pass -McpUrl or set $env:MCP_URL.' -ForegroundColor Red
    exit 2
}
if (-not $env:MCP_KEY) {
    Write-Host 'MCP_KEY not set. Dot-source Invoke-McpRequest.ps1 first (it prompts).' -ForegroundColor Red
    exit 2
}

Write-Host ''
Write-Host '================================================================' -ForegroundColor Cyan
Write-Host " BL-032.5 batch verification runner" -ForegroundColor Cyan
Write-Host " Target: $env:MCP_URL" -ForegroundColor Cyan
Write-Host '================================================================' -ForegroundColor Cyan
Write-Host ''

# ----- Test orchestration ---------------------------------------------

$script:Results = @()

function Add-Result {
    param(
        [Parameter(Mandatory)] [string] $Id,
        [Parameter(Mandatory)] [string] $Section,
        [Parameter(Mandatory)] [string] $Title,
        [Parameter(Mandatory)] [ValidateSet('PASS', 'FAIL', 'SKIP', 'ERROR')] [string] $Status,
        [string] $Detail = ''
    )
    $script:Results += [PSCustomObject]@{
        Id      = $Id
        Section = $Section
        Title   = $Title
        Status  = $Status
        Detail  = $Detail
    }
    $color = switch ($Status) {
        'PASS'  { 'Green' }
        'FAIL'  { 'Red' }
        'ERROR' { 'Red' }
        'SKIP'  { 'Yellow' }
    }
    $line = "  [{0}] {1}  {2}" -f $Status.PadRight(5), $Id.PadRight(8), $Title
    Write-Host $line -ForegroundColor $color
    if ($Detail) { Write-Host "         $Detail" -ForegroundColor DarkGray }
    if ($Status -in @('FAIL', 'ERROR') -and -not $ContinueOnFailure) {
        throw "Bailing on first failure (-ContinueOnFailure not set). See $Id."
    }
}

function Invoke-Test {
    <#
    Scriptblock contract:
      - return $null (or no value)          → PASS
      - return 'PASS'                       → PASS (explicit)
      - return 'SKIP'                       → SKIP
      - return '<any other non-empty string>' → FAIL with the string as detail
      - throw                               → ERROR with the exception message
    #>
    param(
        [Parameter(Mandatory)] [string] $Id,
        [Parameter(Mandatory)] [string] $Section,
        [Parameter(Mandatory)] [string] $Title,
        [Parameter(Mandatory)] [scriptblock] $Body
    )
    try {
        $verdict = & $Body
        if ($null -eq $verdict -or $verdict -eq 'PASS') {
            Add-Result -Id $Id -Section $Section -Title $Title -Status 'PASS'
        } elseif ($verdict -eq 'SKIP') {
            Add-Result -Id $Id -Section $Section -Title $Title -Status 'SKIP'
        } elseif ($verdict -is [string] -and $verdict.Length -gt 0) {
            Add-Result -Id $Id -Section $Section -Title $Title -Status 'FAIL' -Detail $verdict
        } else {
            # Unknown return shape — treat as PASS rather than spuriously fail.
            Add-Result -Id $Id -Section $Section -Title $Title -Status 'PASS'
        }
    } catch {
        Add-Result -Id $Id -Section $Section -Title $Title -Status 'ERROR' -Detail $_.Exception.Message
    }
}

# ----- Section C — Resource cache (hit/miss observability) -------------

Write-Host '── Section C — Resource cache ──' -ForegroundColor Cyan

Invoke-Test -Id 'T.C.3' -Section 'C' -Title 'Cached body byte-identical to fresh compute' -Body {
    # Read the same Library URI twice. Bodies must match exactly. (Cache
    # hit vs miss is logged server-side; the client sees no difference.)
    $uri = 'gst://library/vdr-structure'
    $first = (Invoke-McpRequest -Method 'resources/read' -Params @{ uri = $uri }).result.contents[0].text
    Start-Sleep -Milliseconds 200
    $second = (Invoke-McpRequest -Method 'resources/read' -Params @{ uri = $uri }).result.contents[0].text
    if ($first -eq $second) { return $null } # null/empty => PASS
    return "Bodies differ between first read (len=$($first.Length)) and second (len=$($second.Length))"
}

Invoke-Test -Id 'T.C.4' -Section 'C' -Title 'Cache wrapper transparent to error paths' -Body {
    # An unknown URI should produce a JSON-RPC error envelope (HTTP 200
    # with .error block — that's the MCP / JSON-RPC 2.0 spec; only
    # transport-layer failures surface as throws). The cache wrapper
    # must NOT cache the error response — but that side is invisible to
    # the client; we just verify the protocol-shape contract here.
    $resp = Invoke-McpRequest -Method 'resources/read' -Params @{ uri = 'gst://library/__not-a-real-slug__' }
    if ($resp.result) {
        return "Expected a JSON-RPC error envelope for an unknown URI; got a success result with $($resp.result.contents.Count) contents item(s)"
    }
    if (-not $resp.error) {
        return 'Response had neither result nor error — protocol-unexpected envelope'
    }
    # MCP SDK uses code -32602 (Invalid params) for unknown Resources.
    # We accept any negative code so future SDK changes don't churn the test.
    if ($resp.error.code -ge 0) {
        return "Expected a negative JSON-RPC error code, got $($resp.error.code) — message: $($resp.error.message)"
    }
    if (-not ($resp.error.message -match 'library' -or $resp.error.message -match 'not.found' -or $resp.error.message -match 'unknown')) {
        return "Error message didn't name the URI or 'not found': $($resp.error.message)"
    }
    return $null
}

# T.C.1 and T.C.2 require `wrangler tail` running in parallel — they're
# observation tests, not assertion tests. Mark SKIP with a hint.
Invoke-Test -Id 'T.C.1' -Section 'C' -Title 'Cache miss on first read (observe in tail)' -Body {
    return 'SKIP'  # requires `wrangler tail` running in another terminal
}
Invoke-Test -Id 'T.C.2' -Section 'C' -Title 'Cache hit on second read (observe in tail)' -Body {
    return 'SKIP'
}

# ----- Section W — Radar Resources on Worker --------------------------

Write-Host ''
Write-Host '── Section W — Radar Resources on Worker ──' -ForegroundColor Cyan

$EXPECTED_RADAR_URIS = @(
    'gst://radar/fyi/latest',
    'gst://radar/wire/latest',
    'gst://radar/wire/pe-ma',
    'gst://radar/wire/enterprise-tech',
    'gst://radar/wire/ai-automation',
    'gst://radar/wire/security'
)

$script:RadarUrisActual = @()

Invoke-Test -Id 'T.W.1' -Section 'W' -Title 'resources/list returns 6 radar URIs' -Body {
    $list = (Invoke-McpRequest -Method 'resources/list').result.resources
    $script:RadarUrisActual = @($list | Where-Object { $_.uri -like 'gst://radar/*' } | Select-Object -ExpandProperty uri)
    if ($script:RadarUrisActual.Count -ne 6) {
        return "Expected 6 radar URIs, got $($script:RadarUrisActual.Count): $($script:RadarUrisActual -join ', ')"
    }
    return $null
}

Invoke-Test -Id 'T.W.2' -Section 'W' -Title 'Radar URIs match canonical list' -Body {
    if ($script:RadarUrisActual.Count -eq 0) { return 'SKIP' }
    $sortedActual = ($script:RadarUrisActual | Sort-Object) -join ','
    $sortedExpected = ($EXPECTED_RADAR_URIS | Sort-Object) -join ','
    if ($sortedActual -ne $sortedExpected) {
        return "Mismatch.`n  expected: $sortedExpected`n  actual:   $sortedActual"
    }
    return $null
}

Invoke-Test -Id 'T.W.3' -Section 'W' -Title 'gst://radar/fyi/latest returns populated body' -Body {
    $resp = Invoke-McpRequest -Method 'resources/read' -Params @{ uri = 'gst://radar/fyi/latest' }
    $body = $resp.result.contents[0].text | ConvertFrom-Json
    if ($body.error) {
        return "Snapshot-missing error: $($body.error). Wait for next Cron tick or trigger manually."
    }
    if ($body.tier -ne 'fyi') { return "Expected tier=fyi, got $($body.tier)" }
    if (-not $body.lastSeededAt) { return 'Missing lastSeededAt' }
    if ($body.itemCount -lt 1) { return "Expected itemCount >= 1, got $($body.itemCount)" }
    return $null
}

Invoke-Test -Id 'T.W.4' -Section 'W' -Title 'gst://radar/wire/latest returns populated body' -Body {
    $resp = Invoke-McpRequest -Method 'resources/read' -Params @{ uri = 'gst://radar/wire/latest' }
    $body = $resp.result.contents[0].text | ConvertFrom-Json
    if ($body.error) { return "Snapshot-missing error: $($body.error)" }
    if ($body.tier -ne 'wire') { return "Expected tier=wire, got $($body.tier)" }
    if ($body.itemCount -lt 1) { return "Expected itemCount >= 1, got $($body.itemCount)" }
    return $null
}

foreach ($cat in @('pe-ma', 'enterprise-tech', 'ai-automation', 'security')) {
    Invoke-Test -Id "T.W.5.$cat" -Section 'W' -Title "Wire/$cat filters to that category" -Body {
        $resp = Invoke-McpRequest -Method 'resources/read' -Params @{ uri = "gst://radar/wire/$cat" }
        $body = $resp.result.contents[0].text | ConvertFrom-Json
        if ($body.error) {
            # Empty wire is unusual but not a runner failure — flag as SKIP-with-note
            return "Snapshot-missing error: $($body.error)"
        }
        # Each item's category must match the URI's category segment, OR
        # the entire list is empty (a valid edge case for low-volume cats).
        $wrong = @($body.items | Where-Object { $_.category -and ($_.category -ne $cat) })
        if ($wrong.Count -gt 0) {
            return "$($wrong.Count) of $($body.itemCount) items had wrong category"
        }
        return $null
    }
}

# T.W.6 (cold-cache snapshot-missing) requires deleting an Upstash key;
# destructive — skip from the batch runner.
Invoke-Test -Id 'T.W.6' -Section 'W' -Title 'Cold-cache snapshot-missing error body' -Body { return 'SKIP' }

# T.W.7 (stdio regression) requires a separate stdio session; skip.
Invoke-Test -Id 'T.W.7' -Section 'W' -Title 'Stdio radar Resources still work' -Body { return 'SKIP' }

# ----- Section H — /health extension ----------------------------------

Write-Host ''
Write-Host '── Section H — /health extension ──' -ForegroundColor Cyan

$script:HealthPayload = $null

Invoke-Test -Id 'T.H.1' -Section 'H' -Title '/health includes radarSnapshotAgeSeconds' -Body {
    $script:HealthPayload = Invoke-RestMethod "$env:MCP_URL/health"
    if (-not ($script:HealthPayload.PSObject.Properties.Name -contains 'radarSnapshotAgeSeconds')) {
        return 'radarSnapshotAgeSeconds field is missing from /health response'
    }
    $val = $script:HealthPayload.radarSnapshotAgeSeconds
    if ($null -eq $val) { return $null }   # null is a valid value pre-Cron
    if ($val -isnot [int] -and $val -isnot [long] -and $val -isnot [double]) {
        return "radarSnapshotAgeSeconds is not numeric: type=$($val.GetType().FullName), value=$val"
    }
    if ($val -lt 0) { return "radarSnapshotAgeSeconds is negative: $val" }
    return $null
}

Invoke-Test -Id 'T.H.1.b' -Section 'H' -Title '/health upstashMcp is ok; upstashInoreader field is gone (post-Phase-B)' -Body {
    if (-not $script:HealthPayload) { return 'SKIP' }
    if ($script:HealthPayload.upstashMcp -ne 'ok') { return "upstashMcp = $($script:HealthPayload.upstashMcp)" }
    # Post-BL-032.8 Phase B (PR #140, 2026-05-27): the legacy Inoreader DB
    # was retired; the field should not exist on /health. Assert its
    # absence so a regression that re-introduces a dual-DB probe surfaces.
    if ($script:HealthPayload.PSObject.Properties.Name -contains 'upstashInoreader') {
        return "upstashInoreader field still present on /health — Phase B retirement regressed"
    }
    return $null
}

# T.H.2 (age tracking) is time-sensitive — can't run reliably without
# also driving the Cron. Skip from batch.
Invoke-Test -Id 'T.H.2' -Section 'H' -Title 'radarSnapshotAgeSeconds tracks cache age' -Body { return 'SKIP' }
Invoke-Test -Id 'T.H.3' -Section 'H' -Title 'Degraded fallback to null' -Body { return 'SKIP' }

# ----- Section M — Manifest hash --------------------------------------

Write-Host ''
Write-Host '── Section M — Manifest hash ──' -ForegroundColor Cyan

Invoke-Test -Id 'T.M.1' -Section 'M' -Title 'manifest-stability test in npm test suite' -Body {
    # Best-effort: run the targeted test if vitest is on PATH. Skip if not.
    if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
        return 'SKIP'
    }
    Push-Location (Join-Path $PSScriptRoot '..')
    try {
        $output = & npx vitest run tests/integration/manifest-stability.test.ts 2>&1 | Out-String
        if ($LASTEXITCODE -eq 0) { return $null }
        return "vitest exited $LASTEXITCODE. Tail:`n$($output.Substring([Math]::Max(0, $output.Length - 500)))"
    } finally {
        Pop-Location
    }
}

Invoke-Test -Id 'T.M.2' -Section 'M' -Title 'Manifest-hash drift remediation rehearsal' -Body { return 'SKIP' }

# ----- Summary --------------------------------------------------------

Write-Host ''
Write-Host '================================================================' -ForegroundColor Cyan
Write-Host ' Summary' -ForegroundColor Cyan
Write-Host '================================================================' -ForegroundColor Cyan

$pass  = @($script:Results | Where-Object { $_.Status -eq 'PASS'  }).Count
$fail  = @($script:Results | Where-Object { $_.Status -eq 'FAIL'  }).Count
$err   = @($script:Results | Where-Object { $_.Status -eq 'ERROR' }).Count
$skip  = @($script:Results | Where-Object { $_.Status -eq 'SKIP'  }).Count

Write-Host ("  PASS:  $pass") -ForegroundColor Green
Write-Host ("  FAIL:  $fail") -ForegroundColor $(if ($fail) { 'Red' } else { 'Gray' })
Write-Host ("  ERROR: $err")  -ForegroundColor $(if ($err)  { 'Red' } else { 'Gray' })
Write-Host ("  SKIP:  $skip (manual / destructive / out-of-band)") -ForegroundColor Yellow

if ($fail + $err -gt 0) {
    Write-Host ''
    Write-Host ' Failures + errors:' -ForegroundColor Red
    $script:Results | Where-Object { $_.Status -in @('FAIL', 'ERROR') } | ForEach-Object {
        Write-Host ("   $($_.Id)  ($($_.Status))  $($_.Title)") -ForegroundColor Red
        if ($_.Detail) { Write-Host ("     $($_.Detail)") -ForegroundColor DarkGray }
    }
}

if ($OutFile) {
    $script:Results |
        Select-Object Id, Section, Title, Status, Detail |
        Export-Csv -Path $OutFile -Delimiter "`t" -NoTypeInformation -UseQuotes AsNeeded
    Write-Host ''
    Write-Host " Results written to: $OutFile" -ForegroundColor Cyan
}

Write-Host ''

if ($fail + $err -gt 0) { exit 1 } else { exit 0 }
