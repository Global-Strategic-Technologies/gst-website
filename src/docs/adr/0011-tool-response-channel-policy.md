# ADR-0011: `structuredContent` is the machine channel; `content` is the model channel

- **Status**: Accepted 2026-07-27 (0.43.0); **§ Amendment 2026-08-04 (BL-108, 0.45.0)** — Invariant 2 now puts the serialized payload in `content` alongside the caption. The deviation recorded under _Spec position, stated honestly_ was the defect.
- **Source initiative**: [BL-090](../development/BACKLOG.md) — "Collapse the duplicated tool-response payload", an investigate-first candidate raised while sizing an output guard during BL-033 prompt-injection planning.

## Context

Every GST MCP tool that returned data sent it **twice**: pretty-printed into `content[0].text` via `JSON.stringify(payload, null, 2)`, and again as the object in `structuredContent`. Measured on the real `search_portfolio` handler result (all 65 portfolio entries): **143,403 B before, 61,560 B after — a 57.1% reduction**. The duplicate was the _larger_ copy, because the indented text is then JSON-string-escaped inside the JSON-RPC envelope.

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

### The pre-specified fallback — specified, then confirmed unnecessary

`toolFail` carries an unused `{ suppressStructured }` option. It exists for exactly one contingency: if a real client were found to render a structured error _in place of_ the directive prose the model must act on, that flag omits `structuredContent` on the directive-bearing sites only. It is a distinct fourth parameter rather than a field inside `extra`, because `extra` is spread into the payload and a control flag riding there would leak into the public envelope. Specified up front so it would not be invented under post-deploy pressure.

**Post-deploy verification, 2026-07-27 (0.43.0 live on production):** the open question was whether adding `structuredContent` to error results would stop the model receiving the retry prose _as prose_ — the assumption the two-constructor design rests on. Settled empirically rather than by reasoning, using the same live-probe technique that produced the AC-1 finding: `compute_techpar` was called through a real MCP client with `arr: 0`, and the directive came back **verbatim** — ``TechPar requires both `arr` and `infraHostingAnnual` to be greater than zero.`` — byte-identical to the string in `techpar.ts`.

So the fallback is **not needed**, and the assumption is now evidence. `suppressStructured` stays as a specified, tested, unused escape hatch; do not reach for it without new contrary evidence.

---

## Amendment 2026-08-04 — BL-108: `content` carries the payload again

**Invariant 2 is amended.** On success, `content` is now `[caption, compact serialized JSON]`. Invariants 1 and 3 are untouched, and `toolFail` is byte-for-byte unchanged — the verbatim guarantee and `suppressStructured` stand exactly as specified above.

### What happened

For three weeks, `search_portfolio` answered a real Claude Desktop session with `"11 portfolio matches."` and no rows. `list_portfolio_facets` answered `"15 themes, 2 engagement categories, 6 growth stages, 5 years."` and no values. The user reported it as a broken tool. Every server-side test was green, because the server was doing exactly what this ADR specified.

**Claude Desktop reads `content`. It did not surface `structuredContent`.**

### Which claim above was wrong

Not the design — the **evidence**. Three specific corrections:

1. **_"Evidence: which channel do clients actually read?"_ generalised from n=1 client.** The `generate_information_request_list_xlsx` probe was real and correctly executed, and its conclusion is true — of Claude Code, which surfaces `structuredContent` and returns full rows on the identical server build. It is false of Claude Desktop. The section says "**The client** discards `content`"; there is no such thing as _the_ client. A single probe through a single client cannot establish a cross-client fact, and the AC that demanded "evidence, not assumption" was satisfied in form rather than in substance.

2. **_Consequences_ → "Not a context-window win. The model never received the duplicate"** is **falsified** for Claude Desktop. The model never received the duplicate _or the data_. This is the sentence that made the change look free.

3. **_"Operator confirmation, with an expiry condition"_ set the tripwire on the wrong event.** It reasoned correctly that a client without `structuredContent` support would receive only the caption, and then scoped the risk to "the moment a first external pilot connects". The failure needed no pilot and no external client: an **internal** client, on a **modern** protocol revision, that simply renders the other channel. "No external clients" was the operator's answer to a question about contracts, and it was read as an answer about client software.

The spec position recorded under _"Spec position, stated honestly"_ — that a caption satisfies presence but not the compatibility intent, "a deliberate deviation, recorded here rather than quietly taken" — was honest and is exactly the clause that fired. Writing a risk down is not the same as accepting it knowingly enough; the clause exists because client behaviour is not knowable from the server.

### What changed, and what it costs

`content[1]` is `JSON.stringify(payload)` — **compact**. The pretty-printing was BL-090's real finding (81 KB of the old 143 KB `search_portfolio` response was the indented, JSON-escaped copy); the duplication itself was not. Measured on the current dataset:

| tool                        | before   | after     |       |
| --------------------------- | -------- | --------- | ----- |
| `search_portfolio` (all 65) | 61,529 B | 127,599 B | ×2.07 |
| `compose_dossier_envelope`  | 16,581 B | 33,290 B  | ×2.01 |
| `list_portfolio_facets`     | 597 B    | 1,105 B   | ×1.85 |

Against the 143,403 B pre-BL-090 `search_portfolio` baseline, this lands ~11% below where BL-090 started, not back at it. Roughly 46 of BL-090's 57 percentage points are given back, and the operator accepted that trade explicitly: a 61 KB response the model cannot read is worth less than a 127 KB one it can.

### `textOmit`, and the asymmetry to stop probing

`toolOk` gains one option: `textOmit`, which replaces named keys **in the text mirror only** with a marker string (the key is kept, never deleted, so the model can see the field exists). `structuredContent` is untouched, so Invariant 1 holds.

Sole call site: `generate_information_request_list_xlsx`, whose base64 `.xlsx` measures 17,412 B. That looked too small to justify API surface when priced in bytes — the model channel is priced in **tokens**, where it is ~4,500-6,000 per call, of a blob `BREAKING_CHANGES.md` 0.3.9 records Claude Desktop cannot render at all.

**This makes that tool, once again, the only one whose two channels differ — which is precisely the property that made it BL-090's probe target and produced the wrong generalisation.** Do not run the next which-channel-does-this-client-read probe there. Use any other tool, where the channels agree by construction.

### The guard that was missing

`tests/integration/protocol-era-worker.test.ts` now asserts, on a **2025-era** `tools/call`, that `content` has two blocks and that block 1 parses to `structuredContent`. Nothing previously asserted anything about the model-visible channel carrying data, which is why a three-week outage sat under a green suite. `protocol-roundtrip.test.ts`'s `parseToolResult` enforces the same agreement for every tool it exercises.

## Note 2026-08-06 BL-112: response size is now measured, and the budgets are policy

The table above was a one-off measurement. Nothing enforced it, and nothing measured any other tool — so `search_radar` grew to 143,027 characters and broke a client (BL-109) while the suite stayed green, exactly as BL-108 had done for the channel contract.

`mcp-server/tests/integration/tool-response-budget.test.ts` now measures **every registered tool**, enumerated from a live `tools/list` against the stdio surface (the Worker registers 15 of 17; the two stdio-only radar tools would otherwise escape). **A tool with no budget entry fails the suite**, so a new tool cannot ship without a size decision.

**Three rules, each of which cost something to learn.**

**Budgets are policy, not client limits.** No client ceiling is documented anywhere in this repo — every reference to 143,027 is an observation _of a failure_, and the true ceiling is unknown and strictly below it. A budget set there would pass a response that still breaks the client. So each budget is today's measurement plus headroom, and raising one is a decision to argue in the PR that raises it, not a step to green.

**Data-scaling tools budget per-item width; fixed-shape tools budget the envelope.** An absolute budget on `search_portfolio` (~1,965 B/entry) reddens after roughly a dozen routine portfolio additions on a data-only PR — the coupling TEST_BEST_PRACTICES §6 warns about, and a ratchet whose natural fix ratifies whatever happened. Per-item width is flat as a dataset grows and moves only when the shape does. It is also the right instrument on the evidence: BL-109's defect was **width, not count**.

**The unit is UTF-8 bytes**, computed exactly as `metrics/with-metrics.ts` computes the audit log's `outputBytes`, so a red test and an audit record are comparable. Characters are recorded alongside, never compared to bytes.

**A correction to the table above.** `search_portfolio` measures **127,709 B / 127,599 chars**. The `127,599 B` recorded above is therefore the **character** count labelled as bytes — the same chars/bytes conflation that recurred repeatedly while BL-112 was being planned. The ×2.07 ratio is unaffected. Left in place rather than silently rewritten, because the mislabelling is the more useful record.

**Measured 2026-08-06 at 0.47.0** (envelope, UTF-8 bytes; per-item where the response scales):

| tool                                     | envelope      | per item                        |
| ---------------------------------------- | ------------- | ------------------------------- |
| `search_regulations` (`limit: 120`)      | **355,728 B** | 2,964 B × 120                   |
| `search_portfolio` (all 65)              | 127,709 B     | 1,965 B × 65                    |
| `search_radar`                           | 114,815 B     | 2,551 B × 45                    |
| `search_radar_offline` / `_cache`        | 104,455 B     | 2,321 B × 45                    |
| `get_latest_insights`                    | 40,219 B      | 2,681 B × 15                    |
| `generate_diligence_agenda`              | 32,540 B      | —                               |
| `list_irl_requests`                      | 22,694 B      | 339 B × 67                      |
| `generate_information_request_list_xlsx` | 18,586 B      | — (×1.05 — the `textOmit` tool) |
| `assess_infrastructure_cost_governance`  | 18,154 B      | —                               |
| everything else                          | < 5,000 B     | —                               |

Named rather than folded into "everything else": `assess_infrastructure_cost_governance` is the budget **most likely to trip first**, because its response scales with the authored question bank — so a question-bank edit is the most likely thing to trip this suite first, and the reader should not have to hunt for which tool that is.

`search_regulations` at its schema max is **~2.5× the response that already broke a client**. That is recorded here flagged, not ratified: bounding it is open (BL-113) because the capability mirror cannot supply a number — the page renders one region at a time, and the largest holds 10 frameworks, below the tool's own default of 20.

**The guard is proven, not assumed.** Reverting BL-109's `stripHtml` at the tool boundary takes `search_radar` from 114,815 B to 258,505 B and turns all four radar budgets red. The first version of the fixture did _not_ catch it — clean prose in a single `<p>` made stripping nearly free — which is the "fixture too small to see the bug" failure BL-109 itself recorded, reproduced inside the guard built to prevent it. The fixture now carries production markup density.

### Consequence for BL-092 (`outputSchema`)

The blocker recorded under _"Constraint this places on a future `outputSchema`"_ — that the SDK client validates `structuredContent` whenever present with no `isError` guard, so declaring a schema would throw on every error result — **is retired in SDK v2**. `@modelcontextprotocol/client` now guards both branches with `&& !result.isError` (`dist/index.cjs:4155-4156`), and the server mirrors it. BL-092 may proceed without the workaround this ADR required of it. It remains a separate initiative: it would not have fixed this bug, since it turns on client behaviour we have not verified.

**One new constraint it inherits, from the era analysis above.** The rev2025 codec wraps `structuredContent` as `{ result: … }` when the value is non-object **or when the advertised `outputSchema`'s root `type` is not `"object"`**. The predicate is literally `json["type"] !== "object"` (`client/dist/src-D_zzAWoS.mjs:1974-1976`), so it fires on a root that omits `type` altogether — not only on arrays and primitives.

That distinction is the whole risk, because it is what a **Zod union** produces. Measured against the installed Zod:

| output schema                         | JSON-schema root   | wraps?  |
| ------------------------------------- | ------------------ | ------- |
| `z.object({…})`                       | `type: "object"`   | no      |
| `z.union([z.object(…), z.object(…)])` | `anyOf`, no `type` | **yes** |
| `z.discriminatedUnion(…)`             | `oneOf`, no `type` | **yes** |
| `z.array(…)`                          | `type: "array"`    | **yes** |

The SDK stamps `type:'object'` on typeless roots it can _prove_ are objects, but a union of two object variants is not stamped — verified, not assumed. Nothing advertises an `outputSchema` today, which is exactly why the era axis came out identity for BL-108; the day BL-092 declares one, a union-rooted schema makes `structuredContent` **era-sensitive on the 2025 wire**, and Claude Desktop is on that era. Keep output schemas object-rooted — a discriminated union of result shapes is the natural thing to reach for and the thing to avoid.
