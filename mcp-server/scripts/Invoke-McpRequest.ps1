<#
.SYNOPSIS
    Reusable PowerShell helpers for BL-032 staging soak (and any future
    internal-remote MCP testing).

.DESCRIPTION
    Dot-source this file once per soak terminal:

        . .\scripts\Invoke-McpRequest.ps1

    Two functions land in the session:

        Invoke-McpRequest   raw JSON-RPC call; returns the full envelope
                            (jsonrpc + id + result|error). Use for tools/list,
                            tools/get, prompts/list, etc., or when you need
                            to see the JSON-RPC envelope shape.

        Invoke-McpTool      convenience wrapper around tools/call. Issues the
                            call, unwraps result.content[0].text, and returns
                            the parsed tool-response payload directly. Use for
                            T.B.* and any test that calls a named tool.

    Env vars MCP_URL and MCP_KEY are sourced from your shell. MCP_URL defaults
    to staging if unset (with a console note); MCP_KEY is prompted via
    Read-Host (input visible) if unset. Both can be re-set explicitly per
    session.

.NOTES
    Companion to:
      - mcp-server/src/docs/operations/DEPLOY.md  (B.3 smoke validation)
      - src/docs/development/BL-032_TESTING_FINDINGS.md  (per-test stubs)

    The body of Invoke-McpRequest is identical to the playbook setup snippet
    in DEPLOY.md B.3 — checked in here so soak terminals don't need to paste
    the function definition every time.

.EXAMPLE
    PS> . .\scripts\Invoke-McpRequest.ps1
    PS> Invoke-McpTool -Name "list_portfolio_facets"
    # returns the parsed payload — { themes, engagementCategories, growthStages, years }

.EXAMPLE
    PS> $matches = (Invoke-McpTool -Name "search_portfolio" -Arguments @{ search = "kubernetes" }).matches
    PS> $matches.Count
    PS> $matches | Select-Object codeName, theme | Format-Table

.EXAMPLE
    PS> Invoke-McpRequest -Method "tools/list"
    # returns the JSON-RPC envelope (use this for protocol-shape inspection)
#>

# --- Env-var bootstrap ---
if (-not $env:MCP_URL) {
    $env:MCP_URL = 'https://mcp-staging.globalstrategic.tech'
    Write-Host "MCP_URL defaulted to: $env:MCP_URL" -ForegroundColor Cyan
}

if (-not $env:MCP_KEY) {
    $env:MCP_KEY = Read-Host -Prompt 'Paste MCP_KEY value (input will be visible)'
}

# --- Raw JSON-RPC call ---
function Invoke-McpRequest {
    <#
    .SYNOPSIS
        Send a raw JSON-RPC request to the MCP Worker; returns the full envelope.
    #>
    param(
        [Parameter(Mandatory)] [string] $Method,
        [hashtable] $Params = @{},
        [int] $Id = 1
    )
    $body = @{
        jsonrpc = '2.0'
        id      = $Id
        method  = $Method
        params  = $Params
    } | ConvertTo-Json -Compress -Depth 10

    $headers = @{
        Authorization = "Bearer $env:MCP_KEY"
        Accept        = 'application/json, text/event-stream'
    }

    $resp = Invoke-WebRequest -Uri "$env:MCP_URL/mcp" `
        -Method Post `
        -Headers $headers `
        -ContentType 'application/json' `
        -Body $body `
        -SkipHttpErrorCheck

    # MCP Streamable-HTTP returns SSE format ("event: message\ndata: {...}").
    # On non-SSE responses (e.g., 401 / 406 / 5xx with plain JSON body),
    # return the raw HTTP response so the caller can inspect status + body.
    $dataLine = $resp.Content -split "`n" | Where-Object { $_ -like 'data:*' } | Select-Object -First 1
    if (-not $dataLine) { return $resp }
    return $dataLine.Substring(5).Trim() | ConvertFrom-Json
}

# --- Tool-call convenience wrapper ---
function Invoke-McpTool {
    <#
    .SYNOPSIS
        Call a named MCP tool; returns the parsed response payload.

    .DESCRIPTION
        Wraps Invoke-McpRequest -Method "tools/call" and unwraps result.content[0].text
        to JSON-deserialize the tool's response. If the response is an error envelope
        (no .result) or has unexpected shape, returns the raw envelope/response with a
        warning so the caller can inspect.
    #>
    param(
        [Parameter(Mandatory)] [string] $Name,
        [hashtable] $Arguments = @{},
        [int] $Id = 1
    )
    $resp = Invoke-McpRequest -Method 'tools/call' -Params @{ name = $Name; arguments = $Arguments } -Id $Id

    if (-not $resp.PSObject.Properties.Match('result').Count) {
        Write-Warning "MCP response has no .result — likely an error envelope or non-SSE response. Returning raw object for inspection."
        return $resp
    }
    if (-not $resp.result.content -or -not $resp.result.content[0].text) {
        Write-Warning "MCP response has unexpected content shape — returning raw envelope for inspection."
        return $resp
    }
    return $resp.result.content[0].text | ConvertFrom-Json
}

Write-Host "Loaded MCP helpers. Targeting $env:MCP_URL." -ForegroundColor Green
Write-Host 'Functions: Invoke-McpRequest (raw), Invoke-McpTool (wrapped tool call)' -ForegroundColor Gray
Write-Host "Example: Invoke-McpTool -Name 'search_portfolio' -Arguments @{ search='kubernetes' }" -ForegroundColor Gray
