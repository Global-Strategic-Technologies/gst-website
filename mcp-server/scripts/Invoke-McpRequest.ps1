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
                            call and returns result.structuredContent — the
                            tool's payload — directly. Use for T.B.* and any
                            test that calls a named tool.

    Env vars MCP_URL and MCP_KEY are sourced from your shell. MCP_URL defaults
    to staging if unset (with a console note); MCP_KEY is prompted via
    Read-Host (input visible) if unset. Both can be re-set explicitly per
    session.

.NOTES
    Companion to:
      - mcp-server/src/docs/operations/DEPLOY.md  (B.3 smoke validation)
      - src/docs/development/_archive/BL-032_TESTING_FINDINGS.md  (per-test stubs)

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
    $env:MCP_URL = 'https://mcp.globalstrategic.tech'
    Write-Host "MCP_URL defaulted to: $env:MCP_URL" -ForegroundColor Cyan
}

if (-not $env:MCP_KEY) {
    $secure = Read-Host -AsSecureString -Prompt 'Paste MCP_KEY value (input hidden)'
    $env:MCP_KEY = [Net.NetworkCredential]::new('', $secure).Password
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

    # Fail loudly on HTTP errors with status + URL + body excerpt for diagnosis.
    # `-SkipHttpErrorCheck` above suppresses PowerShell's default exception so
    # we can attach a clearer message than the framework default.
    if ($resp.StatusCode -ge 400) {
        $bodyExcerpt = if ($resp.Content) {
            $resp.Content.Substring(0, [Math]::Min(500, $resp.Content.Length))
        }
        else { '<empty body>' }
        throw "Invoke-McpRequest: HTTP $($resp.StatusCode) from $($env:MCP_URL)/mcp. Body excerpt: $bodyExcerpt"
    }

    # MCP Streamable-HTTP returns SSE format ("event: message\ndata: {...}").
    # A 2xx response without a data line is a protocol-unexpected state, not
    # a normal failure mode — fail loudly so the operator notices.
    $dataLine = $resp.Content -split "`n" | Where-Object { $_ -like 'data:*' } | Select-Object -First 1
    if (-not $dataLine) {
        $bodyExcerpt = $resp.Content.Substring(0, [Math]::Min(500, $resp.Content.Length))
        throw "Invoke-McpRequest: 2xx response but no SSE data line found (protocol unexpected). Body excerpt: $bodyExcerpt"
    }
    return $dataLine.Substring(5).Trim() | ConvertFrom-Json
}

# --- Tool-call convenience wrapper ---
function Invoke-McpTool {
    <#
    .SYNOPSIS
        Call a named MCP tool; returns the parsed response payload.

    .DESCRIPTION
        Wraps Invoke-McpRequest -Method "tools/call" and returns the tool's payload
        from result.structuredContent — the canonical machine channel (BL-090).

        Before BL-090 this parsed result.content[0].text as JSON, because every tool
        sent its payload twice: pretty-printed into the text block AND as the
        structured object. The text block is now a one-line human caption on success
        and the verbatim message on failure, so parsing it as JSON would always fail.

        Failures now carry structuredContent too — { error, message, ... } — so a
        caller can branch on $result.error instead of substring-matching prose.

        The content[0].text fallback remains for robustness against a tool that
        somehow returns no structured channel; it emits a warning rather than
        pretending the shape was expected.
    #>
    param(
        [Parameter(Mandatory)] [string] $Name,
        [hashtable] $Arguments = @{},
        [int] $Id = 1
    )
    $resp = Invoke-McpRequest -Method 'tools/call' -Params @{ name = $Name; arguments = $Arguments } -Id $Id

    # Preferred path: the structured channel. Present on BOTH success and failure.
    if ($null -ne $resp.result.structuredContent) {
        # A tool-level failure is a 2xx MCP envelope with isError, so it would
        # otherwise look like success to a smoke step. Say so out loud — the
        # payload still returns, carrying .error and .message.
        if ($resp.result.isError) {
            Write-Warning "MCP tool '$Name' returned isError. error='$($resp.result.structuredContent.error)' message='$($resp.result.structuredContent.message)'"
        }
        return $resp.result.structuredContent
    }

    if (-not $resp.result.content -or -not $resp.result.content[0].text) {
        Write-Warning 'MCP response carries neither structuredContent nor a text block — returning raw envelope for inspection.'
        return $resp
    }

    # No structured channel: unexpected post-BL-090. Surface the text so the
    # operator can see what came back, rather than failing opaquely.
    Write-Warning "MCP tool response has no structuredContent (unexpected since 0.43.0). Text preview (first 200 chars): '$($resp.result.content[0].text.Substring(0, [Math]::Min(200, $resp.result.content[0].text.Length)))'. Returning raw envelope for inspection."
    return $resp
}

Write-Host "Loaded MCP helpers. Targeting $env:MCP_URL." -ForegroundColor Green
Write-Host 'Functions: Invoke-McpRequest (raw), Invoke-McpTool (wrapped tool call)' -ForegroundColor Gray
Write-Host "Example: Invoke-McpTool -Name 'search_portfolio' -Arguments @{ search='kubernetes' }" -ForegroundColor Gray
