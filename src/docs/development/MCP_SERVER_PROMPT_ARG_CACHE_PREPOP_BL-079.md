# MCP Server — Prompt-Arg Cache Pre-Population + Body-by-Hash on Validate (BL-079)

> **Backlog initiative**: [BL-079: Server-side body delivery via prompt-arg + body-by-hash on `validate_irl_provenance`](BACKLOG.md#bl-079-server-side-body-delivery-via-prompt-arg--body-by-hash-on-validate_irl_provenance--open-2026-06-07)
>
> **Companion docs**:
>
> - [MCP_SERVER_COMPOSE_BODY_BY_HASH_BL-076.md](MCP_SERVER_COMPOSE_BODY_BY_HASH_BL-076.md) — the body-by-hash mechanism BL-079 extends. BL-076 removed `filledIrl` from `compose_dossier_envelope`'s public input by having `prepare_irl_body` write it to a server-side cache keyed by hash; BL-079 closes the upstream emission gap by populating that same cache at **prompt-render time** (before the model sees the prompt body) when the operator supplies `filledIrl` as a prompt arg.
> - [MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md](MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md) — original design doc for `gst_irl_ingestion`. BL-079 changes the prompt directive but not the architectural shape of the surrounding workflow.
> - [MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md](MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md) — the deferred xlsx-canonicalization design. BL-079 is **orthogonal**: BL-049 closes the `partner-paste` ↔ `xlsx-attachment` bytes-delivery gap; BL-079 closes the model-emission-ceiling gap. Both can compose when BL-049 is eventually unblocked.
> - [IRL_PARTNER_PASTE_RUNBOOK.md](IRL_PARTNER_PASTE_RUNBOOK.md) — operator runbook for partner-paste-verbatim mode. The runbook describes the `npm run irl:extract` script that produces the markdown; BL-079 is what makes that markdown actually usable at production sizes (>10KB).
> - [`mcp-server/BREAKING_CHANGES.md`](../../../mcp-server/BREAKING_CHANGES.md) — semver log. BL-079 bumps the server **minor** (0.30.4 → 0.31.0): additive optional field on `validate_irl_provenance`'s public input + prompt directive change + new typed metric event.
>
> **Predecessors**: BL-076 (body-by-hash on `compose_dossier_envelope`), BL-077a/b/c (cache substrate fail-loud + namespace alignment), BL-082 (slash-command form interop — without this, partner-paste mode can't even be invoked from the UI), BL-068 (`prepare_irl_body` preflight ergonomics — BL-079 extends it from "model emits body → server caches" to "server caches at prompt render → model can skip prepare").
>
> **Sequels**: BL-080 (chunked body submission for xlsx-reconstruction path — BL-079 doesn't help there, no prompt-arg body to pre-populate), BL-081 (remove BL-077a/b read-after-write probe + diagnostic instrumentation after stable trace window), BL-083 (ESLint rule rejecting non-string Zod types in `GstPrompt.argsSchema` without a wire-shape adapter — latent slash-command-UI failure surface).
>
> **Scope**: close the model output-stream emission ceiling on the partner-paste path. Two changes:
>
> 1. **Prompt-render-time cache pre-population**: when the operator supplies `filledIrl` as a prompt arg, the prompt-build wrapper writes the body to `IrlBodyCache` BEFORE returning the rendered prompt body to the model.
> 2. **Body-by-hash on `validate_irl_provenance`**: extend the schema with optional `irlBodyHash` mode where `filledIrl` becomes optional and the server re-hydrates from cache for citation substring matching.
>
> Combined effect on partner-paste runs: the model emits the IRL body ZERO times across the entire workflow (vs. twice today — once to `prepare_irl_body`, once to `validate_irl_provenance`'s precheck loop). xlsx-reconstruction path unchanged — still subject to the model emission ceiling, to be addressed separately by BL-080.
>
> **Status**: ✏️ **Draft — audit-passed** (2026-06-07). Impartial Plan-agent audit completed same evening: verdict **APPROVE WITH REVISIONS — split into two PRs**. Revisions folded in below: (a) replace fire-and-forget cache write with sync await (Cloudflare Workers terminate pending I/O at request completion unless `ctx.waitUntil` extends them — fire-and-forget would silently lose the prepop write); (b) split into **Part A** (`validate_irl_provenance` body-by-hash schema + handler, ships independently and immediately fixes the precheck-loop emission damage) + **Part B** (prompt-render cache pre-pop + directive change + VERIFY taxonomy + BL-070 gate update); (c) BL-070 gate explicit accept both `partner-paste-verbatim` AND `partner-paste-verbatim-prepop`; (d) reuse `handlePrepareIrlBodyTool` for the prompt-render cache write (Alt-D — gets BL-077a/b/c diagnostics for free); (e) `filledIrl.bytes` semantics under prepop must report server-cached byte length, not model self-report.
>
> Draft authored against the empirical evidence captured during the operator's 2026-06-07 night exercise on `gst-mcp-staging` (PR #249 + #250 merged, 0.30.4 deployed): a 50KB partner-paste body emitted as 45,220 bytes by the model, producing `hashBindResult: pass-internal` (degraded from target `pass-bound`) and `provenanceVerification: { total: 19, verified: 14, unverified: 5, tierMismatches: 1, tierFabrications: 3 }`. The model dropped ~12% of the body during emission — same root cause as the 2026-06-07 day exercise that truncated 77KB → 1,753 bytes. The hash comparison is dispositive (prompt directive's `cdecc612b6101f82` vs. `prepare_irl_body`'s `dc115172758827f7` — identical model context, byte-divergent emission). The "partner-paste-via-prompt-arg sidesteps the emission ceiling" hypothesis was tested and falsified. BL-079 is now a production-readiness blocker for any IRL > ~10KB, not the latency optimization the initial framing suggested.

---

## At a glance

```
                                BEFORE (today, v0.30.4)
                                ──────────────────────

  ┌──────────────────────────────┐
  │ Operator pastes 50KB markdown│
  │ into /gst_irl_ingestion form │
  │ filledIrl prompt arg         │
  └──────────────────────────────┘
                │
                ▼
  ┌──────────────────────────────┐
  │ Server renders prompt body   │
  │  - Computes hash H of arg    │
  │  - Embeds `**Body-binding    │
  │    hash:** H` directive      │
  │  - Embeds IRL inside body    │
  └──────────────────────────────┘
                │
                ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Model sees prompt body. Runs upstream tools (DDA, search, …).        │
  │                                                                       │
  │ For precheck: emits validate_irl_provenance({ filledIrl: <50KB>, …}) │
  │   ── 50KB emitted as tool args ──                                    │
  │      MODEL EMISSION CEILING applies: silent 12% byte loss observed.  │
  │      Citation substring matching is against the LOSSY body.          │
  │      provenanceVerification reports tier-mismatches + fabrications.  │
  │                                                                       │
  │ For prepare: emits prepare_irl_body({ filledIrl: <50KB> })           │
  │   ── 50KB emitted as tool args ──                                    │
  │      Server computes hash H' (DIFFERENT from H — bytes don't match). │
  │      Cache populated with H' → lossy bytes.                          │
  │                                                                       │
  │ For compose: emits irlBodyHash=H' (16 hex chars, cheap).             │
  │      Server re-hydrates from cache. Hash-bind: pass-internal only,   │
  │      since H' was computed by the server, not pinned to prompt-arg.  │
  └──────────────────────────────────────────────────────────────────────┘


                                AFTER (BL-079, v0.31.0)
                                ──────────────────────

  ┌──────────────────────────────┐
  │ Operator pastes 50KB markdown│
  │ into /gst_irl_ingestion form │
  │ filledIrl prompt arg         │
  └──────────────────────────────┘
                │
                ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Server renders prompt body (BL-079 cache pre-pop):                  │
  │  - Computes hash H of args.filledIrl                                │
  │  - irlBodyCache.set(H, args.filledIrl)  ◀── NEW: body lands in     │
  │                                            cache before model sees  │
  │                                            the prompt body          │
  │  - Embeds `**Body-binding hash:** H` directive                      │
  │  - (Optionally embeds IRL inside body for model context)            │
  └──────────────────────────────────────────────────────────────────────┘
                │
                ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Model sees prompt body + directive. New BL-079 directive:           │
  │   "In one-shot mode (you see a `**Body-binding hash:**` directive), │
  │   SKIP prepare_irl_body. Pass H directly to compose AND to validate │
  │   precheck. The cache is already populated."                        │
  │                                                                       │
  │ For precheck: emits validate_irl_provenance({                       │
  │     irlBodyHash: H, citations: [...]                                │
  │   })                                                                 │
  │   ── 16 hex chars emitted as tool args. Server re-hydrates body     │
  │      from cache. Citation matching is against the EXACT operator-   │
  │      paste bytes. No emission loss possible.                        │
  │                                                                       │
  │ For compose: emits irlBodyHash=H. Same as today.                    │
  │      Server re-hydrates the EXACT operator-paste bytes.             │
  │      hashBindResult: pass-bound (the strong form is REACHABLE now). │
  └──────────────────────────────────────────────────────────────────────┘
```

---

## Why this exists

### Empirical motivation (2026-06-07 night exercise — the hard evidence)

Operator merged PRs #249 (boolean coercion) + #250 (slash-command UI optionality) and ran `/gst_irl_ingestion` against staging with the partner-paste path enabled for the first time end-to-end:

- **`filledIrl.bytes: 45220`** — operator's `storeforce.md` was ~50KB; the model's emission to `prepare_irl_body` shed ~12% of the body bytes silently
- **`hashBindResult: pass-internal`** — degraded from the target `pass-bound`. The server computed `dc115172758827f7` for the model's emission; the prompt directive's `**Body-binding hash:**` was `cdecc612b6101f82` (computed from `args.filledIrl`). The two don't match because the model can't byte-exact relay 50KB through its output stream.
- **`provenanceVerification: { total: 19, verified: 14, unverified: 5, tierMismatches: 1, tierFabrications: 3 }`** — 5 load-bearing citations don't substring-match the model's lossy reconstruction (content the model dropped during emission); 1 declared tier-1 doesn't verify; 3 declared tier-2 demote-to-fabrication. Material provenance damage.
- **`defaultFiredFrameworks` missing CCPA / NIST AI RMF / Canada AIDA** — prior successful runs surfaced these; this run dropped them because Section 09 detail didn't survive emission.

The operator's partner-paste-via-prompt-arg hypothesis was that the body in the prompt arg would round-trip cleanly (operator-pasted → server prompt-body render → model context → tool args). Empirically falsified: the model's output stream can't byte-exact relay 50KB even when it has the exact bytes in its context.

### Comparison across runs (the practical emission ceiling)

| Body size                                                 | Outcome                                               | Notes                                                              |
| --------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| 5,704 bytes (`model-reconstruction-trimmed`)              | ✅ 25/25 verified, clean                              | Model trimmed aggressively to fit the budget; round-trip succeeded |
| 45,220 bytes (this run, `model-reconstruction-from-xlsx`) | ⚠️ 14/19 verified, completed with degraded provenance | Model emitted body but silently dropped ~12%                       |
| 77,743 → 1,753 bytes (2026-06-07 day exercise)            | ❌ Hash mismatch self-detected, run halted            | Model attempted full body, emission truncated at ~2.3%             |

There is a **soft degradation zone between ~10KB and ~70KB** where the model completes but with progressive content loss. Below ~5KB the round-trip succeeds. Above ~70KB the model detects truncation and refuses. The middle range is exactly where every real production IRL lives.

### Root cause

LLM output streams have finite per-tool-call token budgets that aren't documented contractually. The model has no API to query "how much more can I emit?" — it either truncates silently (catastrophic) or detects truncation and refuses (acceptable degraded) or reshapes the body to fit (silent provenance damage). All three are bad outcomes. The only way to **anchor on operator-supplied bytes** is to take the body off the model's output path entirely.

### Why BL-076 + partner-paste alone don't solve it

BL-076 removed the body from **`compose_dossier_envelope`**'s public input — the model passes only the hash. ✅
BL-076 did NOT touch **`prepare_irl_body`** (still requires `filledIrl`) or **`validate_irl_provenance`** (still requires `filledIrl` for citation matching). The two upstream tools are exactly where the emission ceiling fires.

Partner-paste changes the SOURCE of the body bytes (operator paste vs. xlsx-attachment reconstruction) but does NOT change the EMISSION PATH (model output stream → tool args). The 2026-06-07 night exercise proved this empirically.

---

## Architecture

### The prompt-render cache pre-population pattern

When the operator invokes `/gst_irl_ingestion` with `filledIrl` as a prompt arg, the MCP server's prompt-build pipeline already:

1. Receives `args.filledIrl` from the slash-command form
2. Computes `irlBodyHash = sha256(args.filledIrl).slice(0,16)` for the `**Body-binding hash:**` directive
3. Embeds the directive in the rendered prompt body

BL-079 adds **one** step between (2) and (3):

```
3a. await metrics.irlBodyCache.set(irlBodyHash, args.filledIrl)
```

The cache write completes in ~50–100ms (Upstash KV PUT). The model receives the rendered prompt body and begins working — by the time it gets to `compose_dossier_envelope` (the only tool that needs the body server-side), the cache has been populated for many seconds at minimum.

### Prompt build wrapper — sync await on the cache write (audit revision)

`GstPrompt.build` is currently `(args) => GetPromptResult` (synchronous). The wrapper in `_registry.ts` (where `metrics` is already in scope from the BL-082 `forceTools` sniffing closure) becomes async:

```ts
// Sketch — mcp-server/src/prompts/_registry.ts wrapper (BL-079 revised)
const wrappedBuild =
  prompt.name === 'gst_irl_ingestion'
    ? async (args: GstIrlIngestionArgs): Promise<GetPromptResult> => {
        // BL-079 — pre-populate cache from prompt-arg filledIrl.
        //
        // SYNC AWAIT (audit revision — NOT fire-and-forget). Cloudflare
        // Workers terminate pending I/O at request completion unless
        // `ctx.waitUntil` extends them. The prompt-render is a request;
        // a fire-and-forget Upstash PUT can be torn down before the
        // write lands, producing a confusing Bl076BodyCacheMissError on
        // the next request. Sync await adds ~50-100ms (Upstash PUT
        // typical) to the prompt-render path — unmeasurable next to the
        // model's TTFT on a 50KB prompt body. R-1 + R-2 eliminated.
        //
        // ALT-D PATTERN: reuse `handlePrepareIrlBodyTool` instead of
        // calling `irlBodyCache.set` directly. The prepare handler already
        // has the size cap, the BL-077a read-after-write probe, the
        // bl077.cache.set safeLog instrumentation, and the
        // IrlBodyCacheWriteFailedError surfacing logic. Free reuse.
        if (args?.filledIrl && metrics.irlBodyCache) {
          try {
            await handlePrepareIrlBodyTool({ filledIrl: args.filledIrl }, metrics);
          } catch (err) {
            // Don't block prompt render — let it proceed with the legacy
            // path. Model will hit Bl076BodyCacheMissError on compose and
            // fall back to calling prepare_irl_body itself (current
            // behavior). The bl077.cache.set safeLog already captures
            // the underlying Upstash failure from inside the prepare
            // handler; we add a wrapper-level event for correlation.
            safeLog({
              event: 'bl079.cache.preload.failed',
              key: `mcp:irl-body:${computeIrlBodyHashForBody(args.filledIrl)}`,
              storeId: metrics.irlBodyCache?.storeId, // BL-077c convention
              reason: err instanceof Error ? err.message.slice(0, 300) : String(err),
              success: false,
              errorCode: 'bl079-preload-failed',
            });
          }
        }
        return prompt.build(args);
      }
    : prompt.build;
```

**Why sync await over fire-and-forget**: the operator is already waiting for the prompt to render (50KB of body + multiple tool calls' worth of context). Adding 50-100ms of Upstash PUT to the render path is unmeasurable next to the model's time-to-first-token. Sync await:

- ✅ Eliminates the R-1 (silent write failure) and R-2 (cross-isolate race) risks from the original framing
- ✅ Guarantees the cache is populated before the model receives the prompt body
- ✅ Reuses the BL-077a/b/c diagnostic instrumentation already wired into `prepare_irl_body`

**Why reuse `handlePrepareIrlBodyTool`** (audit Alt-D): the prepare handler already implements every concern we need — size cap (200KB), read-after-write probe (BL-077a), `bl077.cache.set` safeLog (BL-077a/b), `IrlBodyCacheWriteFailedError` surfacing (BL-077a), namespace prefix (BL-077c). Calling it from the wrapper is one line and inherits all of it for free.

### Worker-mode considerations

The `irlBodyCache` is per-`createServer` instance, wired to `UpstashIrlBodyCache` in Worker mode (BL-077c established the `mcp:irl-body:*` key prefix). The sync-await write in the prompt-build wrapper persists to the same shared Upstash KV that `compose_dossier_envelope`'s subsequent `get` reads from — same substrate, same key prefix, no in-memory fallback. Worker isolate rotation doesn't break the model (the model's tool calls go to fresh isolates, but they all read from the same KV).

### Validate-side body-by-hash

`validate_irl_provenance` currently takes `{ filledIrl: string, citations: Citation[] }`. The schema becomes:

```ts
// Current:
const ValidateIrlProvenanceInputSchema = z.object({
  filledIrl: z.string().min(200),
  citations: z.array(citationSchema),
});

// BL-079:
const ValidateIrlProvenanceInputSchema = z
  .object({
    filledIrl: z.string().min(200).optional(),
    irlBodyHash: irlBodyHashSchema.optional(),
    citations: z.array(citationSchema),
  })
  .refine(
    (input) => input.filledIrl || input.irlBodyHash,
    'Either filledIrl or irlBodyHash MUST be supplied — exactly one OR both (filledIrl takes precedence for backward-compat).'
  );
```

Handler behavior:

```ts
async function handleValidateIrlProvenanceTool(payload, metrics?) {
  let body = payload.filledIrl;
  if (!body && payload.irlBodyHash) {
    body = await metrics?.irlBodyCache?.get(payload.irlBodyHash);
    if (!body) {
      // Reuse BL-076's structured error class.
      throw new Bl076BodyCacheMissError(payload.irlBodyHash);
    }
  }
  // ... existing runIrlProvenanceCheck(body, citations) path unchanged
}
```

When the model passes `irlBodyHash` alone (BL-079 partner-paste-prepop path), the server re-hydrates the body from cache and runs citation matching against the EXACT operator-paste bytes. Zero model emission for the body across the entire precheck loop.

### Prompt directive change

`gst_irl_ingestion` v0.17.0 → v0.18.0. The envelope-composition directive + interactive Step 4 + the precheck directive update to:

> **BL-079 (v0.18.0+) — partner-paste mode**: when you see a `**Body-binding hash:**` directive above (one-shot mode where the operator supplied `filledIrl` as a prompt arg), the server has ALREADY cached the body for you. **SKIP `prepare_irl_body` entirely**. Pass the directive's `irlBodyHash` directly to BOTH `compose_dossier_envelope` AND `validate_irl_provenance` (for the precheck loop). The body never has to flow through your tool-call output stream.
>
> **In xlsx-reconstruction / interactive mode** (no `**Body-binding hash:**` directive present), call `prepare_irl_body({ filledIrl })` as before, then proceed. The legacy path stays in place.

### VERIFY block taxonomy update + `filledIrl.bytes` semantics (audit revisions)

**`runScenario` enum addition**: add `partner-paste-verbatim-prepop` to distinguish BL-079 path (zero body emission) from legacy partner-paste (body emitted twice). Operators see in the artifact which path actually ran.

**`filledIrl.bytes` semantic change under prepop** (audit revision 6): pre-BL-079, the field reported the model's self-reported emission size. Under BL-079 partner-paste-prepop, the model never emits the body to `prepare_irl_body` — there is no model-side byte count to self-report. The field MUST report the **server-cached byte length** (the operator's pasted bytes). The `compose_dossier_envelope` handler already has the body in scope (it re-hydrated from cache to run `runIrlProvenanceCheck`); add a side-channel return that surfaces `filledIrl.bytes` in the envelope output, which the model then copies into the VERIFY block. Add a prompt directive sentence:

> Under `runScenario: partner-paste-verbatim-prepop`, `filledIrl.bytes` is the server-cached byte length of the operator's pasted body — surfaced in `compose_dossier_envelope`'s output as `serverCachedBodyBytes`. Copy that value verbatim into the VERIFY block (do NOT attempt to self-report your emission size; under prepop there is no emission to report).

### BL-071 narrative update

Under BL-079 partner-paste-prepop, the model legitimately skips `prepare_irl_body`. The VERIFY block will show `serverToolCallCounts.prepare_irl_body.attempted: 0` — this is CORRECT, not a model violation. Update the precheck-derivation directive prose at `irl-ingestion.ts:444-470` to acknowledge this case explicitly so operators don't mis-read it as model misbehavior.

---

## Schema changes

### `validate_irl_provenance`

```diff
  filledIrl: z
    .string()
    .min(200)
+   .optional()
    .describe(
-     'The verbatim IRL body — exactly the bytes the prompt was invoked with.'
+     'The verbatim IRL body. Optional under BL-079 — if `irlBodyHash` is supplied AND populated in the server-side `IrlBodyCache`, the server fetches the body and `filledIrl` may be omitted. For interactive / xlsx-reconstruction mode where the cache is not pre-populated, this remains the canonical path.'
    ),
+ irlBodyHash: z
+   .string()
+   .regex(IRL_BODY_HASH_REGEX, 'irlBodyHash must be 16 lowercase hex characters')
+   .optional()
+   .describe(
+     "BL-079 — body-by-hash mode. When the operator supplies `filledIrl` as a `gst_irl_ingestion` prompt arg, the prompt-build wrapper pre-populates the IRL body cache. The model copies the `**Body-binding hash:**` directive verbatim into this field and omits `filledIrl`. Server re-hydrates from cache for citation matching. Falls back to `Bl076BodyCacheMissError` if the cache write didn't land (operator should retry the run). For interactive / xlsx-reconstruction mode where the cache is not pre-populated, omit this field and use `filledIrl` instead."
+   ),
```

Plus a `.refine(...)` cross-field rule: **at least one of `filledIrl` / `irlBodyHash` must be supplied. Both allowed; `irlBodyHash` takes precedence when present AND cache-hits. `filledIrl` is the fallback path when (a) only `filledIrl` is supplied OR (b) `irlBodyHash` is supplied but cache misses.** This precedence order is critical for the `Bl076BodyCacheMissError` fallback narrative — the model retries via `prepare_irl_body`, which produces `filledIrl`-shaped state, and the next compose/validate call may carry BOTH fields (the existing prompt directive's hash + the freshly-prepared body). The schema must accept that shape without throwing on "ambiguous input."

```ts
.refine(
  (input) => Boolean(input.filledIrl) || Boolean(input.irlBodyHash),
  {
    message:
      'At least one of `filledIrl` / `irlBodyHash` MUST be supplied. ' +
      'BL-079 partner-paste-prepop path: pass `irlBodyHash` alone. ' +
      'Legacy interactive / xlsx-reconstruction path: pass `filledIrl` alone. ' +
      'Both allowed — `irlBodyHash` is preferred when present and cache-hits.',
  }
)
```

### `compose_dossier_envelope` — BL-070 gate accepts both `partner-paste-verbatim` AND `partner-paste-verbatim-prepop`

Required by audit revision R-6. Current gate at [`schemas/compose-dossier-envelope.ts`] checks `irlSource !== 'partner-paste-verbatim'`. Update:

```diff
- if (input.requireVerbatimBody && input.irlSource !== 'partner-paste-verbatim') {
+ if (
+   input.requireVerbatimBody &&
+   input.irlSource !== 'partner-paste-verbatim' &&
+   input.irlSource !== 'partner-paste-verbatim-prepop'
+ ) {
    throw new Bl070VerbatimBodyRequiredError(input.irlSource);
  }
```

Both represent operator-supplied bytes; the `-prepop` variant is structurally stronger because the bytes never round-trip through model emission. Both pass the BL-070 verbatim-body discipline. Explicit test asserts both pass the gate; non-paste sources still fail.

### New typed metric event

`bl079.cache.preload.failed` — surfaces the fire-and-forget cache write failure to `wrangler tail`. Carries the same fields as BL-077a/b's events for consistency.

### `Bl076BodyCacheMissError` text augmentation

The structured error message already exists from BL-076. Update the text to mention BL-079:

> Pre-BL-079: "call `prepare_irl_body({ filledIrl })` first to seed the cache."
>
> Post-BL-079: "If this prompt was invoked with `filledIrl` as a prompt arg, the BL-079 pre-populate path may have failed — check the `bl079.cache.preload.failed` metric event. Either retry the prompt invocation, OR fall back to calling `prepare_irl_body({ filledIrl })` if the cache write is consistently failing."

---

## Capability-preservation matrix

| Capability                                                           | BL-079 preservation mechanism                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Verdict                                                          |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **BL-049** hash-bind authority                                       | Prompt-arg path now produces `pass-bound` hashBindResult because the cache write is anchored to `args.filledIrl` (not model-relayed bytes). xlsx-reconstruction path stays at `pass-internal` (no change).                                                                                                                                                                                                                                                                                   | **Strengthened** for partner-paste; unchanged for reconstruction |
| **BL-051** citation-iteration precheck via `validate_irl_provenance` | Part A delivers the load-bearing operational win for this discipline. Precheck loop today emits the full body to validate; under BL-079 Part A, the model passes only `irlBodyHash` and the server re-hydrates the operator-supplied bytes for citation matching. The 5/19 unverified citations + 1 tier-mismatch + 3 tier-fabrications observed in the 2026-06-07 night exercise stop being possible because the bytes the verifier matches against are the SAME bytes the operator pasted. | **Strengthened materially**                                      |
| **BL-058** BL-045-VERIFY schema                                      | New `runScenario: partner-paste-verbatim-prepop` enum value (additive). No field changes.                                                                                                                                                                                                                                                                                                                                                                                                    | **Additive; preserved**                                          |
| **BL-063** partition + scope checks                                  | Compose-side; no `filledIrl` dependency.                                                                                                                                                                                                                                                                                                                                                                                                                                                     | **Preserved verbatim**                                           |
| **BL-068** `prepare_irl_body` output contract                        | Tool stays in place for xlsx-reconstruction path. Model-facing contract unchanged. Under BL-079 partner-paste path, model SKIPS the call entirely (correct behavior per new directive).                                                                                                                                                                                                                                                                                                      | **Preserved** (call-site optional, contract unchanged)           |
| **BL-070** `requireVerbatimBody` gate                                | Branches on `irlSource` only. Under BL-079 partner-paste-prepop, `irlSource: partner-paste-verbatim` is still required for the gate to pass (operator sets it from prompt arg).                                                                                                                                                                                                                                                                                                              | **Preserved verbatim**                                           |
| **BL-071** server-arithmetic identities                              | `prepare_irl_body.attempted: 0` on partner-paste-prepop path is CORRECT. Prompt directive prose updated to acknowledge this. `validate_irl_provenance` counts unchanged.                                                                                                                                                                                                                                                                                                                     | **Preserved** (directive prose updated)                          |
| **BL-072** reconstruction-mode source auto-append                    | Compose-side; branches on `irlSource`. xlsx-reconstruction path still auto-appends. partner-paste-prepop path does NOT auto-append (correct — provenance is authoritative on this path).                                                                                                                                                                                                                                                                                                     | **Preserved verbatim**                                           |
| **BL-076** body-by-hash on compose                                   | Cache contract identical. BL-079 changes the WRITER (prompt-render time vs. `prepare_irl_body` call) but not the READER.                                                                                                                                                                                                                                                                                                                                                                     | **Preserved + extended**                                         |
| **BL-077a/b/c** cache substrate diagnostics + namespace              | Same `mcp:irl-body:*` prefix, same `UpstashIrlBodyCache.set` path that BL-077a/b instrumented. Read-after-write probe + fail-loud + namespace alignment all in play.                                                                                                                                                                                                                                                                                                                         | **Preserved verbatim**                                           |
| **BL-082** wire-shape adapters                                       | No new prompt args; no new boolean / array fields.                                                                                                                                                                                                                                                                                                                                                                                                                                           | **Preserved verbatim**                                           |

---

## Acceptance criteria (in-session — no live exercise required)

1. **TypeScript clean** + **all existing tests pass** post-schema refactor.
2. **New unit tests** at `mcp-server/tests/unit/prompts/irl-ingestion-bl079.test.ts`:
   - Cache write fires when `filledIrl` arg is supplied (use a spy on `metrics.irlBodyCache.set`)
   - Cache write does NOT fire when `filledIrl` is omitted (interactive mode)
   - Cache write failure path emits `bl079.cache.preload.failed` via safeLog
   - Cache write failure does NOT block prompt render (fire-and-forget — `build()` still returns the prompt)
3. **New unit tests** for `validate_irl_provenance` schema:
   - Accepts `{ irlBodyHash, citations }` alone (body-by-hash mode)
   - Accepts `{ filledIrl, citations }` alone (legacy mode)
   - Accepts both (filledIrl takes precedence)
   - Rejects neither (the `.refine` rule fires)
   - Rejects `irlBodyHash` not matching the regex
4. **New integration test** at `mcp-server/tests/integration/bl-079-prompt-arg-cache-prepop.test.ts`:
   - Build the prompt with `filledIrl` arg → assert cache populated post-build
   - Call `validate_irl_provenance` with `irlBodyHash` only against the populated cache → succeeds
   - Call `compose_dossier_envelope` with `irlBodyHash` only against the populated cache → succeeds, returns `hashBindResult: pass-bound`
   - Cross-isolate test: build prompt in one MetricsContext, validate/compose in a fresh MetricsContext, same Upstash KV → succeeds
5. **BL-070 regression test**: `requireVerbatimBody: true` + BL-079 partner-paste-prepop path → gate fires correctly when `irlSource !== 'partner-paste-verbatim'` (verifies the gate is `irlSource`-only and unaffected by skip-prepare).
6. **Prompt body substring assertions**:
   - Both one-shot AND interactive bodies contain `'BL-079'`
   - Both bodies contain `'skip prepare_irl_body'`
   - Both bodies contain `'partner-paste-verbatim-prepop'`
7. **Manifest + body hash rebaselines** — promptVersion 0.17.0 → 0.18.0; 3 of 7 body hashes drift (verbose-mode bodies that ship the envelope-composition directive).
8. **Post-merge operator verification** (manual, low-priority): re-run the exact 2026-06-07 night exercise. Expected: `bytes: ~50,000` (operator's full markdown round-trips), `hashBindResult: pass-bound`, `provenanceVerification: { unverified: 0 }`, `runScenario: partner-paste-verbatim-prepop`, no `prepare_irl_body` call. Compose call wall-clock approaches the upstream tool sum (~5-10 min vs. ~15-30 min on the lossy path).

---

## Risks

- **R-1 — Fire-and-forget cache write failure** (silent). Mitigation: typed metric event (`bl079.cache.preload.failed`) emitted on rejection. `Bl076BodyCacheMissError` text augmented to mention BL-079 path so operators reading the diagnostic know to check the preload event. Acceptable degradation: model falls through to `prepare_irl_body` (legacy path) which fires the existing emission-ceiling damage but completes the run.
- **R-2 — Cross-isolate write-vs-read race**. Worker isolate rotation between prompt build and compose call could surface the write before propagation. Mitigation: Upstash KV is strongly consistent (BL-077c verified); same-DB writes are visible immediately. Acceptable risk: if a transient KV blip drops the write, the BL-076 cache-miss fallback fires (model retries via `prepare_irl_body`).
- **R-3 — Operator workflow drift**. The new partner-paste-prepop path is fast and provenance-strong; the legacy partner-paste path is slow and provenance-degraded. Operators may not immediately distinguish them in the dossier output. Mitigation: the `runScenario` enum addition surfaces which path actually ran in the VERIFY block; the runbook ([IRL_PARTNER_PASTE_RUNBOOK.md](IRL_PARTNER_PASTE_RUNBOOK.md)) is updated to call this out.
- **R-4 — Schema drift on `validate_irl_provenance`**. The `.refine` cross-field rule (at least one of `filledIrl` / `irlBodyHash`) is a new validation surface. Pin via the new schema tests + protocol-roundtrip assertion that the published `inputSchema.properties` includes both fields.
- **R-5 — Body bytes embedded in prompt body**. The prompt body currently embeds the IRL inline so the model can reference it for tool-input mapping. Under BL-079, the body is also in the cache. Is the prompt-body embed still needed? **Yes** — the model still uses it for the upstream tool calls (DDA, search_regulations, etc.) that don't take `filledIrl`. The cache is for the tools that DO take `filledIrl` (validate, prepare, compose).
- **R-6 — `requireVerbatimBody` semantic preservation**. The gate currently asserts `irlSource === 'partner-paste-verbatim'` at compose seam. Under BL-079, the new scenario is `partner-paste-verbatim-prepop` — does the gate need to accept both? **YES**: update the gate to accept `partner-paste-verbatim` OR `partner-paste-verbatim-prepop` (both represent operator-supplied bytes; the prepop variant is structurally stronger). Cover with explicit test. **Diff shown in Schema changes section above.**

### Risks added by audit

- **R-7 — `_registry.ts` wrapper coupling concerns**. The wrapper currently sniffs `forceTools` for ALL irl-ingestion calls (BL-082 follow-up). BL-079 adds a second per-call side effect in the same closure. Mitigation: refactor to a chained `wrapIrlIngestion(prompt, metrics)` helper so responsibilities stay separable. The helper can compose `forceTools` sniffing + BL-079 cache pre-pop + future per-prompt wrappers without one closure ballooning. Ship the refactor with Part B.
- **R-8 — `compose_dossier_envelope` internal call regression risk**. The compose handler internally calls `runIrlProvenanceCheck` with `{ filledIrl, citations }` shape. Part A's schema expansion adds `irlBodyHash?` to the input — the internal call site passes only the existing two fields, which satisfies the new `.refine` rule but could regress if a future refactor narrows the type elsewhere. Cover with an explicit test at the compose internal-call seam asserting the input shape continues to validate.
- **R-9 — Upstash TTL boundary**. Cache TTL is 4h (BL-077c). Operator-iteration loops longer than 4h would expire the prepop entry mid-session. Highly unlikely in normal use but theoretically possible. Mitigation: under Part A's body-by-hash on validate, the model can detect `Bl076BodyCacheMissError` and re-prepare via `prepare_irl_body` (legacy fallback path stays intact). Document in the runbook.
- **R-10 — `wrangler tail` correlation across BL-077 / BL-079 events**. BL-077c instrumentation events (`bl077.cache.set`, `bl077.cache.get`) carry `storeId` for cross-isolate correlation. BL-079's `bl079.cache.preload.failed` MUST carry the same `storeId` field so operators reading the tail can correlate the preload event with the `prepare_irl_body`'s underlying `bl077.cache.set` event on the same isolate. The wrapper's safeLog call shown in the sketch above already includes this; the test must assert the field is present.

---

## Out of scope

- **xlsx-reconstruction path**: BL-079 does not help here. The model still has to relay the body it parses from the xlsx via `prepare_irl_body` tool args. Same emission ceiling applies. Reserved as **BL-080: chunked body submission** — `prepare_irl_body_chunk` + `prepare_irl_body_finalize` design TBD. Independent of BL-079.
- **Removing BL-077a/b read-after-write probe**: separate ticket (reserved as **BL-081**) post-stable trace window.
- **ESLint rule for non-string Zod types in `GstPrompt.argsSchema`**: separate ticket (reserved as **BL-083**). Defensive against future slash-command-UI failures.
- **Removing `prepare_irl_body` as a registered tool**: keep it. Still needed for xlsx-reconstruction path AND as a fallback when the BL-079 prompt-arg path is unavailable (interactive mode, programmatic clients that don't use the prompt UI, etc.).
- **`compose_dossier_envelope` Schema change**: NONE. BL-076 already removed `filledIrl` from compose; BL-079 just changes how the cache gets populated.

---

## Open questions

Resolved during the audit pass — kept here for traceability:

- ~~OQ-1: sync-with-fire-and-forget OR async?~~ → **Resolved: sync await** in the wrapper. Cloudflare Workers terminate pending I/O at request completion unless `ctx.waitUntil` extends. Sync await is the safe path; ~50-100ms cost is unmeasurable next to model TTFT on 50KB prompt body.
- ~~OQ-2: XOR or allow both?~~ → **Resolved: allow both; `irlBodyHash` takes precedence when present AND cache-hits; `filledIrl` is the fallback path.** Schema `.refine` rule shown in Schema changes section.
- ~~OQ-3: skip-prepare unconditional vs. defensive?~~ → **Resolved: skip unconditionally.** On `Bl076BodyCacheMissError` the model falls back to `prepare_irl_body` (existing self-documenting behavior). Don't bloat the directive prose.
- ~~OQ-4: rename `Bl076BodyCacheMissError`?~~ → **Resolved: do not rename.** Backward-compat wins. Defer to a future cleanup ticket.
- ~~OQ-5: cache-write timing budget?~~ → **Resolved**: sync await with no explicit budget. Measure during Part B implementation; if tail latency exceeds 500ms, revisit. Otherwise accept as-is.

Remaining open (resolve during Part B implementation):

- **OQ-6 — `ctx.waitUntil` reach**: does `ctx.waitUntil` reach the prompt-build call site in the current `createServer(env, ctx)` chain? If yes, that's an even cleaner pattern for the (unlikely) future case where sync await tail latency becomes problematic. Investigate during Part B; not blocking for the first implementation pass.
- **OQ-7 — `prepare_irl_body` idempotency**: should `prepare_irl_body` accept an optional `irlBodyHash` arg as a no-op idempotency check (returning the cached body's hash without re-writing if the cache already contains the entry)? Useful for the model's defensive "check if cache miss" pattern. Defer to a Part B follow-up.
- **OQ-8 — `**Body-binding hash:**`directive embedding`filledIrl.bytes`**: should the prompt directive line embed `irlBodyHash` AND the server-authoritative `filledIrl.bytes` count so the model has zero-emission VERIFY-block fields to copy verbatim? Combines with the `serverCachedBodyBytes` field surfaced from compose. Defer to Part B implementation pass.

---

## Ship cadence — split into TWO PRs (audit revision)

Per the audit's recommendation, BL-079 splits into two PRs with a clean operator-verification seam between them:

### Part A — `validate_irl_provenance` body-by-hash (PR1)

**Scope**: schema expansion + handler re-hydration + tests. No prompt-directive change. No `runScenario` taxonomy change. No BL-070 gate change.

**Why ship first**: independently fixes the precheck-loop emission damage observed in the 2026-06-07 night exercise. Under Part A alone, an operator can manually orchestrate: call `prepare_irl_body({ filledIrl })` first → receive `irlBodyHash` → call `validate_irl_provenance({ irlBodyHash, citations })` with hash only → server re-hydrates and matches against partner-paste bytes. The 5/19 unverified citations + 1 tier-mismatch + 3 tier-fabrications stop being possible. The prepare step still emits the body (so the bigger latency win is deferred), but the precheck-loop iteration becomes free.

**Surface**: additive optional field. No breaking change. Schema diff at `validate-irl-provenance.ts`. Handler change at `tools/validate-irl-provenance.ts`. Tests at `tests/unit/schemas/validate-irl-provenance.test.ts` + new integration test exercising the body-by-hash mode end-to-end.

**Version bump**: 0.30.4 → 0.30.5 (patch — purely additive on a tool schema, no public contract removal).

**Ships independently**. Operator validates the precheck-loop win before Part B lands.

### Part B — Prompt-render cache pre-pop + directive + VERIFY taxonomy + BL-070 gate (PR2)

**Scope**: prompt-build wrapper sync-await pre-pop, prompt directive surgery, `runScenario: partner-paste-verbatim-prepop`, BL-070 gate dual-accept, `filledIrl.bytes` semantics, `serverCachedBodyBytes` field on compose output. Manifest + 3 body hash rebaselines.

**Why split**: Worker `waitUntil` / sync-await pattern is the largest single uncertainty. Validating the cleaner Part A win first lets us measure prompt-render latency under sync await in isolation before binding the prompt directive to the new path.

**Version bump**: 0.30.5 → 0.31.0 (minor — prompt directive + manifest hash drift).

Each PR ships independently. Operator-verification between them.

---

## Implementation order (split per Part A / Part B above)

### Part A — Single PR

1. Define `validate_irl_provenance` schema expansion + `.refine` cross-field rule + types.
2. Handler change: server-side cache fetch when `irlBodyHash` is supplied alone; throw `Bl076BodyCacheMissError` on miss.
3. Tests: 5 validate schema tests + 1 integration test exercising prepare → validate body-by-hash chain.
4. Protocol-roundtrip assertion: published `inputSchema.properties.irlBodyHash` exists; `inputSchema.required` doesn't include `filledIrl` anymore.
5. `BREAKING_CHANGES.md` 0.30.5 stanza.
6. `BACKLOG.md` BL-079 Part A status update.

**Estimated effort Part A**: ~1 day. Breakdown: 0.25d schema; 0.25d handler + tests; 0.25d integration test + protocol-roundtrip; 0.25d docs.

### Part B — Single PR (after Part A merges + operator validates)

1. `_registry.ts` wrapper: sync-await cache pre-pop via `handlePrepareIrlBodyTool` (Alt-D pattern); typed `bl079.cache.preload.failed` metric event with `storeId` (R-10 — BL-077c instrumentation convention).
2. Prompt directive update at both invocation sites (one-shot ENVELOPE_COMPOSITION_DIRECTIVE + interactive Step 4) + BL-079 skip-prepare guidance + `filledIrl.bytes` semantic guidance.
3. VERIFY block taxonomy: add `partner-paste-verbatim-prepop` to `runScenario` enum.
4. `serverCachedBodyBytes` field on `compose_dossier_envelope` output for `filledIrl.bytes` semantic correctness.
5. Update `Bl076BodyCacheMissError` text to mention BL-079 prepop path + R-10 correlation hint.
6. Update `BL-070` gate to accept `partner-paste-verbatim-prepop` alongside `partner-paste-verbatim` (R-6).
7. Tests: 4 prompt wrapper tests + 1 cross-isolate integration test + 1 BL-070 regression + 6 prompt-body substring assertions.
8. Manifest + 3 body hash rebaselines.
9. `BREAKING_CHANGES.md` 0.31.0 stanza.
10. `BACKLOG.md` BL-079 OPEN → CLOSED + BL-080 + BL-081 + BL-083 reservation stanzas.

**Estimated effort Part B**: ~1.5–2 days. Breakdown: 0.5d wrapper + metric event + Alt-D handler reuse wiring; 0.5d prompt directive surgery + VERIFY taxonomy + `serverCachedBodyBytes`; 0.25d hash rebaselines; 0.5d new tests + BL-070 regression coverage; 0.25d Worker-specific bug buffer.

**Combined Part A + B**: ~2.5–3 days total (audit's revised estimate), with a meaningful operator-verification checkpoint between them.

---

## Status sentinel

**This doc is audit-passed and ready for operator review.** Plan-agent audit completed 2026-06-07 evening with verdict **APPROVE WITH REVISIONS — split into two PRs**. All 10 revisions folded in:

1. Sync await replaces fire-and-forget on the cache write (Cloudflare Workers cut pending I/O)
2. `_registry.ts` wrapper reuses `handlePrepareIrlBodyTool` (Alt-D — free BL-077a/b/c diagnostics)
3. Split into Part A (validate body-by-hash) + Part B (prompt-render cache pre-pop + directive)
4. Schema `.refine`: both fields allowed; `irlBodyHash` precedence on cache hit
5. BL-070 gate explicit diff to accept both `partner-paste-verbatim` AND `partner-paste-verbatim-prepop`
6. `filledIrl.bytes` semantics: server-cached byte length surfaced via new `serverCachedBodyBytes` field on compose output
7. R-7 wrapper coupling: refactor to `wrapIrlIngestion(prompt, metrics)` helper
8. R-8 compose internal-call regression: explicit test
9. R-9 Upstash TTL: documented as legacy-fallback-covered
10. R-10 `storeId` field on `bl079.cache.preload.failed` for cross-event correlation

Capability matrix gained the **BL-051 row** (Part A's load-bearing operational win for the precheck-iteration discipline).

Effort estimate **revised**: Part A ~1 day, Part B ~1.5–2 days, total ~2.5–3 days with a clean operator-verification checkpoint between PRs.

**Ready for operator approval to start Part A implementation.** Same audit-driven discipline that produced BL-076, BL-077a/b/c, BL-082 — saved us from shipping the `filledIrl` fallback escape hatch on BL-077; let's keep it.
