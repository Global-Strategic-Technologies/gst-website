# ADR-0011: `structuredContent` is the machine channel; `content` is the model channel

- **Status**: Accepted 2026-07-27 (0.43.0)
- **Source initiative**: [BL-090](../development/BACKLOG.md) — "Collapse the duplicated tool-response payload", an investigate-first candidate raised while sizing an output guard during BL-033 prompt-injection planning.

## Context

Every GST MCP tool that returned data sent it **twice**: pretty-printed into `content[0].text` via `JSON.stringify(payload, null, 2)`, and again as the object in `structuredContent`. On a full `search_portfolio` that made the response body ~143 KB where ~61 KB suffices — and the duplicate was the _larger_ copy, because the indented text is then JSON-string-escaped inside the JSON-RPC envelope (81,826 B vs 61,439 B measured over all 61 portfolio entries).

The inverse defect existed on the failure path: **none of the 18 error returns set `structuredContent` at all**. Two of them (`radar-live.ts` `failureResponse` and `circuitOpenEnvelope`) hand-`JSON.stringify`d a structured error object _into the text channel_, because no structured error convention existed to use. Downstream, `Invoke-McpRequest.ps1` substring-matched prose to detect failures and `DEPLOY.md`'s smoke commands needed a triple-`jq` unwrap to dig JSON back out of a JSON-escaped string inside JSON.

Underneath both was the absence of a chokepoint: **34 hand-rolled result literals across 13 files in three different spellings**, with `as unknown as Record<string, unknown>` copy-pasted 16 times.

### Evidence: which channel do clients actually read?

BL-090's acceptance criterion required evidence, not assumption. `generate_information_request_list_xlsx` is the one tool whose two channels deliberately differ (text = a human summary; `structuredContent` = the full payload). Calling it against **production** returned the `structuredContent` object; the human summary never arrived. **The client discards `content` when `structuredContent` is present** — so the duplicate had never been reaching the model.

Corroborating: the `gst_information_request_list` prompt already instructs the model to read `structuredContent` (`mcp-server/src/prompts/information-request-list.ts`). Contradicting evidence was looked for and none held up — `BREAKING_CHANGES.md` 0.3.8's Claude Desktop note reads the other way once examined, and is deliberately **not** cited as support.

The only consumers of the text channel were internal and ours: `Invoke-McpRequest.ps1` and three `DEPLOY.md` smoke commands. Both were migrated in the same PR (Directive 6), and both got _simpler_.

### Operator confirmation, with an expiry condition

The operator confirmed on 2026-07-27: **"Claude + our scripts only"** — no M2M pilot or Connector client is live. This matters concretely, because MCP protocol versions `2024-11-05` and `2025-03-26` (both still negotiable; the latter is even the SDK's `DEFAULT_NEGOTIATED_PROTOCOL_VERSION`) have **no `structuredContent` concept**. A client on those would receive only the caption and lose the data.

**Therefore no version-branching compatibility path was built.** That decision expires the moment a first external pilot connects — at which point this ADR must be revisited and a negotiated-version branch added, or the pilot pinned to a modern protocol version.

## Decision

One module (`mcp-server/src/tools/_result.ts`), two constructors, three invariants.

```ts
export function toolOk<T extends object>(payload: T, summary: string): ToolOkResult;
export function toolFail(
  reason: ToolFailureReason,
  text: string,
  extra?: Record<string, unknown>,
  options?: ToolFailOptions
): ToolResult;
```

**Invariant 1 — `structuredContent` is canonical on every path.** Success and failure alike; failures carry `{ error: reason, message: text, ...extra }`.

**Invariant 2 — `content` is the _model_ channel.** A one-line caption on success; on failure, **the caller's text verbatim** — never truncated, never reformatted.

**Invariant 3 — nothing outside `_result.ts` builds a result literal.** Enforced mechanically by `tests/integration/tool-result-constructors.test.ts`, not by convention.

### Why verbatim is the _only_ failure behavior

An earlier revision of this design proposed a **third** constructor (`toolReject`) to mark the sites whose text is a retry directive the model must act on — `gst_irl_ingestion` instructs the model to _"read it and retry"_ and to _"emit the error VERBATIM"_ (`mcp-server/src/prompts/irl-ingestion.ts`), and `diligence.ts`, `techpar.ts`, `tech-debt.ts`, `compose-dossier-envelope.ts`, `validate-irl-provenance.ts`, `prepare-irl-body.ts` and `radar-offline.ts` all emit such prose.

Design review killed it: `toolError` and `toolReject` had identical signatures and identical behavior, so the "byte-for-byte" guarantee was only a docstring — ceremony an implementer could get wrong at any site, with no test able to tell the two apart. Making verbatim the sole behavior **deletes** the classification problem instead of naming it. No per-site judgement is required and no site can be silently degraded.

### The failure vocabulary preserves what shipped

`radar/CONTRACT.md` already documented, tested and advertised a seven-value public reason vocabulary, and `radar-live.ts`'s tool description sells that granularity ("agents can distinguish 'Inoreader stale token, retry later' from 'Inoreader rate limit, circuit broken' from 'transient network error'"). Collapsing it into a tidy new taxonomy would have been a **capability regression**, so `ToolFailureReason` is a superset: the six upstream reasons, plus `service-unavailable`, plus six non-radar values.

Two normalizations rode along, both released by the no-external-clients confirmation:

- `service_unavailable` → **`service-unavailable`**, the one snake_case outlier in an otherwise kebab-case union.
- The circuit-open envelope's inner `reason` → **`cause`**. Under `{ error: reason, … }` the word "reason" carried two different meanings on one public envelope.

### Where the tuples live, and how drift is caught

`_result.ts` is a **zero-import leaf**. That is not stylistic: the website workspace imports `handleTechparTool` (`tests/integration/techpar-mcp-wizard-roundtrip.test.ts`), so anything this module pulls in joins the **root** `astro check` program. An `import type { InoreaderFailureReason }` would reach `inoreader-client.ts` → `worker.ts` and drag `@cloudflare/workers-types` into a tsconfig running `verbatimModuleSyntax: true` where mcp-server runs `false`. `import type` is erased at emit, not at type-checking.

So the six upstream reasons — previously hand-spelled twice, in `lib/inoreader-client.ts` and again inline on the live store's failure arm — now live once as `RADAR_UPSTREAM_REASONS`, and `content/radar-live-store.ts` derives its union from it. That makes `mapFailure()` there a **compile-time drift guard**: widening `InoreaderFailureReason` or narrowing the tuple breaks that assignment. Verified red-then-green during implementation.

An explicit `const _check: readonly InoreaderFailureReason[] = RADAR_FAILURE_REASONS` was considered and rejected: it proves _tuple ⊆ union_, which is the direction that does **not** catch a widening union, and it does not even compile (`service-unavailable` is not an `InoreaderFailureReason`).

**Asymmetry worth knowing:** _narrowing_ `InoreaderFailureReason` is caught by nothing, and would leave a stale member in the tuple and the CONTRACT table. Harmless — the tuple is the published vocabulary and may legitimately outlive an upstream reason — but the guard should not be over-trusted.

### Construction stays at the call site, not in `withToolMetrics`

`withMetricsCore` is generic over `TResult extends object` and returns it by identity. A shape-changing transform there would break that typing, silently change what the audit stream's `outputBytes` measures, and hide the response shape from the handler that owns it. The wrapper stays an observer.

## Consequences

**Wire cost.** ~57% smaller responses on data-heavy tools. Directly observable in production: the audit stream already records `outputBytes`.

**Not a context-window win.** The model never received the duplicate, so this does not let Claude process more. BL-090 is an infrastructure-efficiency and code-simplicity change; framing it as a model-capacity improvement would be false.

**Spec position, stated honestly.** `CallToolResultSchema` requires a `content` block when no `outputSchema` is declared, and the MCP spec says a tool returning structured content _should_ also serialize it into a TextContent block "for backwards compatibility". A caption satisfies **presence**, not the compatibility intent. This is a deliberate deviation, recorded here rather than quietly taken.

**Failures became machine-readable** — net-new capability. Callers branch on `structuredContent.error` instead of substring-matching prose, and the ~17 error-path tests gained structured assertions _alongside_ (never replacing) their existing prose assertions.

### Constraint this places on a future `outputSchema`

No tool declares an `outputSchema` today, which is why `structuredContent` is unvalidated by clients. Adding one is the natural completion of "structuredContent is canonical" — but **Invariant 1 constrains it**. The SDK client validates `structuredContent` _whenever present, with no `isError` guard_ (`client/index.js`, contradicting its own adjacent comment), so the day any tool declares an `outputSchema`, every error result carrying `structuredContent` would throw `McpError` client-side.

A follow-up adding `outputSchema` must therefore scope schemas to the success shape or exempt error results. Filed in BACKLOG carrying this constraint so it is not picked up naively.

### Interaction with BL-033

BL-033's reduced scope contemplates a provenance label injected into `structuredContent` **at the `withMetricsCore` chokepoint** — the same chokepoint this ADR requires stay a pure observer. Whoever picks that up must either construct the label at the call site or accept the typing consequences described above.

### The pre-specified fallback

`toolFail` carries an unused `{ suppressStructured }` option. It exists for exactly one contingency: if a real client is found to render a structured error _in place of_ the directive prose the model must act on, that flag omits `structuredContent` on the directive-bearing sites only. It is a distinct fourth parameter rather than a field inside `extra`, because `extra` is spread into the payload and a control flag riding there would leak into the public envelope. Specified up front so it is not invented under post-deploy pressure.
