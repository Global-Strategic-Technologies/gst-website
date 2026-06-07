# MCP Server — `compose_dossier_envelope` Body-by-Hash Latency Reduction (BL-076)

> **Backlog initiative**: [BL-076: `compose_dossier_envelope` body-by-hash latency reduction](BACKLOG.md#bl-076-compose_dossier_envelope-body-by-hash-latency-reduction--open-2026-06-07)
>
> **Companion docs**:
>
> - [MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md](MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md) — the originating design doc. BL-045 PR B shipped the hash-bind forcing function in `compose_dossier_envelope` at v0.12.0; BL-076 keeps that forcing function intact and only changes the bytes-delivery path.
> - [MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md](MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md) — the deferred xlsx-canonicalization blueprint. BL-076 is orthogonal: it reduces model-emit latency for the existing reconstruction-mode path without depending on the unreachable bytes-delivery substrate BL-049 needs. If BL-049 is ever unblocked, both can compose.
> - [`mcp-server/BREAKING_CHANGES.md`](../../../mcp-server/BREAKING_CHANGES.md) — semver log. BL-076 bumps the server **minor** (0.29.0 → 0.30.0). It is a BREAKING change to `compose_dossier_envelope`'s input schema; operator confirmed 2026-06-07 that no external clients exist, so the migration is internal-only (prompt body + tests).
>
> **Predecessors**: BL-045 PR B (hash-bind forcing function in `compose_dossier_envelope`), BL-068 (`prepare_irl_body` preflight ergonomics — BL-076 extends this tool from "hash-compute returner" to "hash-compute-AND-cache writer"), BL-049 (hash-bind authority — preserved as the structural integrity check; `sha256(body).slice(0,16) === irlBodyHash` defense-in-depth still runs after re-hydration).
>
> **Sequels**: token-bloat schema audit (Option 1 from initial triage — collapse verbose claim/gap field descriptions, allow short-form citations) and `compose_dossier_envelope` splitting (Option 3 — emit meta-fence / (J) / (K) via separate composable calls). Both can layer on top of BL-076 if compose latency stays painful; BL-076 alone is expected to deliver **40–80% of the observed win depending on body size** (audit revision — the win grows with `filledIrl` size: ~33–70% for typical 10–20KB bodies, ~75–85% for the 80KB bodies driving the BL-074 representative-IRL exercises) at a fraction of the architectural cost.
>
> **Scope**: drop `filledIrl` from `compose_dossier_envelope`'s input schema. The body is already submitted to the server when the model calls `prepare_irl_body` (which today returns the canonical 16-hex `irlBodyHash`). Cache the body server-side keyed by that hash; have `compose_dossier_envelope` re-hydrate it on call. The model emits only the hash to compose, eliminating 9–80KB of output-token cost per invocation. Single PR. Prompt body update + manifest + body-hash rebaselines. No new tools. No new external surfaces.
>
> **Status**: ✏️ **Draft — audit-passed** — design doc authored 2026-06-07 immediately after the BACKLOG stanza was filed; impartial-agent audit passed same day with verdict **APPROVE WITH MINOR REVISIONS** (no blockers; three majors + three risks folded in below). Two empirical observations on 2026-06-07 of `compose_dossier_envelope` taking 5–15 min per call on opus-4-8 drove promotion from "nice-to-have" to "blocking the BL-074 representative-IRL coverage goal." Operator confirmed: no active external clients of `compose_dossier_envelope` (independently verified by repo-wide grep — only the schema, tool wrapper, 2 unit tests, and 1 integration test reference `handleComposeDossierEnvelopeTool`/`runComposeDossierEnvelope`), so the BREAKING schema change is internal-only. Promotion to committed pending tsc-clean + test-suite-green prototype branch.

---

## At a glance

```
                                  BEFORE (today, v0.29.0)
                                  ──────────────────────

  ┌─────────────────────────────┐                  ┌──────────────────────────────┐
  │ Model emits tool args:      │                  │ compose_dossier_envelope     │
  │                             │ ── many minutes ▶│                              │
  │   irlBodyHash:  <16hex>     │   of output      │  re-verifies                 │
  │   filledIrl:    <9-80KB>  ──┼── token stream ─▶│   sha256(filledIrl)[:16]     │
  │   claims:       […]         │                  │     === irlBodyHash          │
  │   gaps:         […]         │                  │  runIrlProvenanceCheck(body) │
  │   irlSource:    <enum>      │                  │  render envelope             │
  └─────────────────────────────┘                  └──────────────────────────────┘
                                       ▲
                          5–15 minutes empirically observed
                          ─ DOMINATED by `filledIrl` token-emit cost

                                  AFTER (BL-076, v0.30.0)
                                  ──────────────────────

  ┌─────────────────────────────┐         ┌──────────────────────────────┐
  │ Model calls                 │         │ prepare_irl_body             │
  │   prepare_irl_body({        │ ──────▶ │  hash = sha256(body)[:16]    │
  │     filledIrl: <body>       │         │  cache.set(hash, body)       │
  │   })                        │ ◀────── │  return { irlBodyHash,       │
  └─────────────────────────────┘         │           byteLength }       │
              │                           └──────────────────────────────┘
              │
              ▼
  ┌─────────────────────────────┐                  ┌──────────────────────────────┐
  │ Model emits tool args:      │                  │ compose_dossier_envelope     │
  │                             │ ── seconds of  ▶ │                              │
  │   irlBodyHash:  <16hex>     │     token stream │  body = cache.get(hash)      │
  │   claims:       […]         │                  │    OR throw Bl076BodyCacheMiss│
  │   gaps:         […]         │                  │  re-verify                   │
  │   irlSource:    <enum>      │                  │   sha256(body)[:16] === hash │
  │   (NO filledIrl)            │                  │  runIrlProvenanceCheck(body) │
  └─────────────────────────────┘                  │  render envelope             │
                                                   └──────────────────────────────┘
                                       ▲
                       1–3 minutes target — `filledIrl` is OFF the wire
```

---

## Why this exists

### Empirical motivation

Two live `gst_irl_ingestion` exercises on `gst-mcp-staging` against opus-4-8 (StoreForce IRL, ~9KB filledIrl + ~20–30 claims + ~5–10 gaps) on 2026-06-07 produced `compose_dossier_envelope` wait times of 5–15 minutes BEFORE the server received the call. The first occurrence was misdiagnosed as a transport wedge until the operator visually inspected the Claude Desktop stream and observed the model emitting the tool-call arguments token-by-token. The second occurrence confirmed: this is the model TYPING the payload, not the server waiting.

### Root cause

`compose_dossier_envelope` is the forcing-function tool that externalizes the dossier's structural envelope ((K) provenance, (J) gap list, meta fence) into a single large structured input. The pattern is **correct** — it's what stopped the model from silently eliding dossier sections in the v8/v9 traces (see [MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md](MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md)) — but it's **expensive in latency** because every byte of the payload is generated as part of the model's output token stream. Typical payload for a real run:

| Field                    | Size               | Notes                                                                                     |
| ------------------------ | ------------------ | ----------------------------------------------------------------------------------------- |
| `filledIrl`              | 9,000–80,000 bytes | Verbatim/reconstructed IRL body. The largest single component.                            |
| `claims`                 | 5,000–15,000 bytes | 20–40 entries × `{claim, citation, tier}`. Citations are often multi-element arrays.      |
| `gaps`                   | 1,500–4,000 bytes  | 5–10 entries × `{category, entry, followUp, irlSection}`. `entry` + `followUp` are prose. |
| `defaultFiredFrameworks` | 200–500 bytes      | 5–10 framework names.                                                                     |
| Header fields            | ~300 bytes         | `promptName`, `modelVersion`, `mode`, `fillRatio`, etc.                                   |
| **Total**                | **16–100KB**       | Dominated by `filledIrl`.                                                                 |

At opus-4-8's generation rate (~50–80 tokens/sec for a structured emit), 25KB of payload is roughly 6–10 minutes of token streaming. This matches the empirical 5–15 min observations.

### Why this matters operationally

The latency budget is what makes `gst_irl_ingestion` painful to operate. BL-074's production-readiness checklist requires "3–5 representative IRL exercises across distinct industries" — at 30+ minutes per exercise (seven analytical tools + 5–15 min envelope), the coverage goal is gated on shrinking compose. Every retry, every QA pass, every cross-tier verification compounds the cost.

This is also a **structural** latency cost — not a bug. No amount of server-side optimization can reduce it; the bytes are generated on the model side. The only way to win is to take bytes off the wire.

### Quantitative latency-win estimate (audit-verified)

- 1 JSON token ≈ 3–4 bytes for structured payloads.
- Pre-BL-076 total payload 16–100KB → ~4K–25K tokens → at 60 tok/s → **~70 sec to ~7 min** of model emit per `compose_dossier_envelope` call.
- `filledIrl` alone (9–80KB) → ~2K–20K tokens → **~33 sec to ~5.5 min**.
- Post-BL-076 payload (claims + gaps + headers, no `filledIrl`) → ~1.5K–5K tokens → **~25–85 sec**.

**Estimated reduction: 40–80% depending on body size.** Wider band than the original 60–80% claim — the win grows with `filledIrl` size: ~33–70% for typical 10–20KB bodies (where claims+gaps still dominate the residual emit); ~75–85% for the 80KB bodies driving the BL-074 representative-IRL exercises that motivated this ticket. Net wall-clock per compose call: from 5–15 min today to estimated 1–3 min for typical runs, sub-90-sec for small ones. Compounds across QA + multi-engagement work.

Server compute confirmation: `runIrlProvenanceCheck` over an 80KB body completes in sub-second wall-clock (string normalization + substring matches in a tight loop, single-digit milliseconds per claim × 30 claims). The token-emit-dominates-compute thesis is confirmed.

---

## Architecture

### The body-by-hash pattern

`prepare_irl_body` (shipped at BL-068) already takes the full IRL body and returns its 16-hex `irlBodyHash`. Today, the model then re-emits `filledIrl` verbatim to `compose_dossier_envelope`. Under BL-076:

1. **`prepare_irl_body` caches the body** keyed by the hash before returning. Same output shape (`{ irlBodyHash, byteLength }`) — no model-facing schema change.
2. **`compose_dossier_envelope` accepts only the hash** (`filledIrl` removed from input schema) and re-hydrates the body from the cache for the internal `runIrlProvenanceCheck` pass.
3. **The hash-bind defense-in-depth check still runs**: `sha256(rehydrated_body).slice(0,16) === irlBodyHash`. Note (audit M-2): post-rehydrate this check is **structurally tautological** — the cache was keyed by exactly the hash being verified, so unless the cache is corrupted, equality is guaranteed by construction. The check costs microseconds and remains in place as defense-in-depth against a future cache-key-collision regression, but it is no longer a meaningful BL-049 authority assertion. **BL-049 authority is preserved at the same level it held pre-BL-076**: `pass-bound` for `partner-paste-verbatim` runs (operator-routed body bytes), `pass-internal` for reconstruction modes (model-routed bytes). The authoritative chain is now one indirection longer (prompt arg → prompt body's `**Body-binding hash:**` directive → model copies into `prepare_irl_body({filledIrl})` → server caches → server fetches → server re-verifies) but the trust boundary moves NOT AT ALL — `partner-paste-verbatim` still requires the operator to paste the verbatim body, and the prompt-bound hash directive still binds the call to that body at the prompt seam. The BL-070 `requireVerbatimBody` gate (which branches on `irlSource`, not `filledIrl`) continues to catch the authority case at the same seam it did before.
4. **Cache miss is a structured rejection** (`Bl076BodyCacheMissError`) with actionable text directing the model to call `prepare_irl_body` first. Same shape as existing BL-063 / BL-068 / BL-070 errors — surfaces through the handler `instanceof` chain at [`tools/compose-dossier-envelope.ts:108-118`](../../../mcp-server/src/tools/compose-dossier-envelope.ts#L108-L118) verbatim.

### Cache interface

```ts
// mcp-server/src/cache/irl-body-cache.ts

export interface IrlBodyCache {
  /**
   * Store the body keyed by its 16-hex `irlBodyHash`. Idempotent —
   * same hash + same bytes is a no-op (deterministic by construction
   * since the hash IS sha256(body).slice(0,16)). Same hash + different
   * bytes is impossible without sha256 collision; we don't defend
   * against that.
   */
  set(irlBodyHash: string, body: string): Promise<void>;

  /**
   * Retrieve the body. Returns `null` on cache miss; the caller throws
   * Bl076BodyCacheMissError with a directive to call `prepare_irl_body`
   * first.
   */
  get(irlBodyHash: string): Promise<string | null>;
}
```

### Two implementations

**Stdio (`InMemoryIrlBodyCache`)**: bounded LRU `Map<string, string>` in process-local memory. Cap at 16 entries (covers a deep iteration session for one operator; 16 × 80KB worst-case = ~1.3MB resident, negligible). Per-entry size cap `IRL_BODY_CACHE_MAX_BYTES = 200_000` — `set()` rejects bodies larger than this with a thrown error before insertion (audit m-4 — prevents a hostile/buggy caller from OOMing stdio; 200KB is ~2× the realistic upper bound of 80KB observed). Process-lifetime scope is exactly right for Claude Desktop sessions — the cache and the conversation share a lifecycle.

**Worker (`UpstashIrlBodyCache`)**: writes to the same Upstash KV backing already in use for the BL-032.5 radar resource cache. Key prefix `gst-mcp:irl-body:<16hex>`. Per-key TTL of 4 hours (audit m-5; long enough to survive an operator coffee break + standup + iteration; the cost of accumulated keys is negligible vs. surfacing confusing `Bl076BodyCacheMissError`s mid-pause). Read on `compose_dossier_envelope` invocation. Per-entry size cap same as stdio. The Worker is the only deployment surface where requests are short-lived isolates — the cross-request persistence MUST live in shared KV. **The Worker path MUST NOT fall back to an in-memory cache** (audit R-3): Cloudflare isolates rotate between requests, so an in-memory cache populated by `prepare_irl_body` will silently miss on the subsequent `compose_dossier_envelope` call from a different isolate. The wiring in `createServer` must construct the Upstash-backed cache unconditionally when `env.UPSTASH_*` bindings are present in Worker mode; if those bindings are absent, fail fast at startup rather than silently degrading.

### Engine signature: re-inject after fetch (audit M-1)

The `runComposeDossierEnvelope` engine is a pure function today (`input + serverContext → result`). It computes `actualHash = computeIrlBodyHash(input.filledIrl)` and feeds `input.filledIrl` to `runIrlProvenanceCheck`. With `filledIrl` dropped from the _input schema_, the engine must still receive the body via _some_ channel. Three options considered:

- **(a)** Add a `body: string` parameter to the engine. **Rejected** — engine signature changes, ~30 existing test call-sites break.
- **(b)** Grow `serverContext` with a `body` field. **Rejected** — `serverContext` is for server-derived metadata (`promptVersion`), not per-call payload data; mixing concerns.
- **(c)** **CHOSEN — re-inject `filledIrl` into the engine input after cache fetch, inside the handler.** Engine signature stable. All existing unit tests continue to pass `filledIrl` directly to the engine and _bypass the cache layer entirely_. The cache concern is confined to the handler (the same seam that already handles MetricsContext + error projection). The engine's input shape gains an internal-only `filledIrl` field that is required at the engine seam but absent from the public `ComposeDossierEnvelopeInputSchema`.

Concretely:

```ts
// schemas/compose-dossier-envelope.ts
//
// Public input schema (what the tool publishes) — no filledIrl.
export const ComposeDossierEnvelopeInputSchema = z.object({
  irlBodyHash: …,
  irlSource: …,
  requireVerbatimBody: …,
  claims: …,
  gaps: …,
  // … (no filledIrl)
});
export type ComposeDossierEnvelopePublicInput = z.infer<typeof ComposeDossierEnvelopeInputSchema>;

// Engine-internal type — adds the body the handler re-injected.
export type ComposeDossierEnvelopeEngineInput =
  ComposeDossierEnvelopePublicInput & { filledIrl: string };

export function runComposeDossierEnvelope(
  input: ComposeDossierEnvelopeEngineInput,           // ← unchanged shape from today's perspective
  serverContext: ComposeDossierEnvelopeServerContext,
): ComposeDossierEnvelopeResult { … }
```

```ts
// tools/compose-dossier-envelope.ts handler
const body = await metrics?.irlBodyCache?.get(payload.irlBodyHash);
if (body === null || body === undefined) {
  throw new Bl076BodyCacheMissError(payload.irlBodyHash);
}
const engineInput: ComposeDossierEnvelopeEngineInput = { ...payload, filledIrl: body };
const result = runComposeDossierEnvelope(engineInput, {
  promptVersion: irlIngestionPrompt.version,
});
```

This keeps the engine pure, keeps the existing unit tests untouched (they construct `ComposeDossierEnvelopeEngineInput` directly with `filledIrl`), and confines BL-076's complexity to the handler.

### Server wiring

Mirror the BL-071 `InMemoryToolCallCounters` pattern: thread the cache through `MetricsContext` as a sibling field (NOT a new `ServerContext` bag — symmetry with `counters?` is cleaner now; a refactor to a unified context can land if a third pseudo-context arrives). Both `prepare_irl_body` and `compose_dossier_envelope` close over the same instance, so the second tool sees what the first wrote.

```ts
// Sketch — sibling field on MetricsContext OR new ServerContext bag

export interface MetricsContext {
  readonly sink: MetricSink;
  readonly keyOwner?: string;
  readonly counters?: ToolCallCounters; // BL-071
  readonly irlBodyCache?: IrlBodyCache; // BL-076 — new
}
```

`createServer` constructs the cache per-process (stdio) or per-request (Worker) — same scoping logic as `InMemoryToolCallCounters`. The frozen `NOOP_METRICS_CONTEXT` singleton continues to omit the field; tools that consult `irlBodyCache?` degrade gracefully when undefined (legacy tests, integration tests that don't exercise prepare-then-compose chains).

---

## Schema changes

### `compose_dossier_envelope`

```diff
  filledIrl: z
-   .string()
-   .min(200)
-   .describe(
-     'The VERBATIM IRL body — exactly the bytes the prompt was invoked with…'
-   ),
+   // REMOVED in BL-076. Body now fetched server-side from IrlBodyCache via irlBodyHash.
+   // See Bl076BodyCacheMissError for the cache-miss path.

  irlBodyHash: z
    .string()
    .regex(IRL_BODY_HASH_REGEX, …)
    .describe(
-     "Copy verbatim from the prompt body's `**Body-binding hash:**` directive…"
+     "BL-076: now the SOLE body reference. Call `prepare_irl_body` first to "
+     "cache the body server-side; pass the returned `irlBodyHash` here. "
+     "(Hash sourcing rules — `pass-bound` vs `pass-internal` — unchanged.)"
    ),
```

### New error class

```ts
export class Bl076BodyCacheMissError extends Error {
  readonly irlBodyHash: string;
  constructor(irlBodyHash: string) {
    super(
      `BL-076 body-cache miss for hash "${irlBodyHash}": call ` +
        `prepare_irl_body({ filledIrl }) first to seed the cache. The ` +
        `body-by-hash pattern (v0.30.0+) requires the body to be submitted ` +
        `via prepare_irl_body before compose_dossier_envelope is called.`
    );
    this.name = 'Bl076BodyCacheMissError';
    this.irlBodyHash = irlBodyHash;
  }
}
```

Wired into [`compose-dossier-envelope.ts`](../../../mcp-server/src/tools/compose-dossier-envelope.ts) handler `instanceof` chain alongside `Bl063…`, `Bl068…`, `Bl070…`. Returns `isError: true` with the verbatim diagnostic.

### `prepare_irl_body`

No input/output schema change. Handler gains one new line:

```ts
export async function handlePrepareIrlBodyTool(
  payload: PrepareIrlBodyInput,
  cache?: IrlBodyCache,
) {
  const irlBodyHash = computeIrlBodyHash(payload.filledIrl);
  const byteLength = Buffer.byteLength(payload.filledIrl, 'utf8');
  await cache?.set(irlBodyHash, payload.filledIrl);       // BL-076
  …
}
```

The `cache?` is optional so existing unit tests continue to pass without modification (cache-write is a no-op when undefined).

**MCP tool annotations flip (audit R-2)**: today `prepare_irl_body` is registered with `readOnlyHint: true` + `idempotentHint: true`. BL-076 makes the cache write a side effect — the call mutates server state (the body cache). Flip `readOnlyHint: true → false`. `idempotentHint: true` STAYS true because calling `prepare_irl_body` twice with the same body produces the same cache state (the deterministic hash + same body = no-op overwrite of the existing entry). This is the correct semantic: not read-only, but idempotent.

---

## Prompt body changes

`gst_irl_ingestion` v0.16.0 → v0.17.0. Two edits at both invocation sites (one-shot + interactive):

1. **Envelope-composition directive** (around `ENVELOPE_COMPOSITION_DIRECTIVE` line ~422 + interactive Step 4 line ~939). Replace the `filledIrl` arg description with:

   > **BL-076 (v0.17.0+) — `filledIrl` is REMOVED from `compose_dossier_envelope`'s input.** Call `prepare_irl_body({ filledIrl: <the body> })` first; it caches the body server-side and returns the canonical `irlBodyHash`. Pass that hash (and ONLY that hash) to `compose_dossier_envelope.irlBodyHash`. Do NOT re-emit the body to `compose_dossier_envelope` — it will be fetched from the cache by hash. (Rationale: emitting the body twice as output tokens cost 5–15 minutes per envelope call on prior versions; the cache eliminates that cost.) If you skipped `prepare_irl_body` and call `compose_dossier_envelope` first, the server returns `Bl076BodyCacheMissError` directing you to call `prepare_irl_body` first.

2. **Step 0 / Step 3 ordering directive**: explicit `prepare_irl_body` MUST precede `compose_dossier_envelope`. Already implied in BL-068 ergonomics but tighten the wording.

### Hash-bind discipline reconciliation

The existing `pass-bound` vs `pass-internal` distinction in the BL-045-VERIFY block still applies — that's about which **source** the hash came from (prompt directive vs model-computed), not which **tool** the bytes flow through. Both paths now go through the cache; the source-of-hash question is orthogonal. No VERIFY-block field changes.

---

## Migration / Surface impact

### Confirmed no external clients

Operator confirmed 2026-06-07 + independently verified by repo-wide grep: `handleComposeDossierEnvelopeTool|runComposeDossierEnvelope` returns the schema, the tool wrapper, 2 unit tests, and 1 integration test (`bl-071-precheck-derivation.test.ts`) — no production caller outside the MCP tool registration site. The BREAKING removal of `filledIrl` is therefore an internal-only migration:

- ✅ Prompt body updated to instruct the new contract (above).
- ✅ Existing engine tests UNCHANGED: per the M-1 engine-signature decision, `runComposeDossierEnvelope` still takes `filledIrl` on its engine-internal input type. Tests construct `ComposeDossierEnvelopeEngineInput` directly and bypass the cache layer. NO test refactor needed at the engine seam.
- ✅ Handler-level integration tests adapt: `tests/integration/bl-071-precheck-derivation.test.ts` uses the prepare-then-compose chain (calls `handlePrepareIrlBodyTool` to seed cache, then `handleComposeDossierEnvelopeTool` with hash only).
- ✅ `tests/integration/protocol-roundtrip.test.ts` (audit M-3): assert `compose_dossier_envelope`'s PUBLISHED `inputSchema.required` no longer lists `filledIrl`. Also confirms `prepare_irl_body`'s published `inputSchema.required` still includes `filledIrl` (unchanged). Two new assertions; no surface refactor.
- ❌ No backward-compat shim needed.

### Version + hash impact

- `mcp-server` 0.29.0 → 0.30.0 (minor — BREAKING under the [BL-032 § Q12 contract](MCP_SERVER_REMOTE_BL-032.md) but no external consumer).
- `gst_irl_ingestion` promptVersion 0.16.0 → 0.17.0.
- Manifest hash rebaselines (prompt `name@version` tuple drift).
- All 7 body-hash-stability scenarios rebaseline (envelope-composition directive ships in every verbose body shape and the prompt-body change touches it).

### `BREAKING_CHANGES.md` stanza outline

```
## 0.30.0 — 2026-06-?? — BL-076 `compose_dossier_envelope` body-by-hash

**Theme**: cut model-emit latency. Body now reaches the server once via
prepare_irl_body, cached by hash, fetched on compose. Saves 5–15 min per
envelope call by removing 9–80KB of model-output token emit.

**Surface impact (BREAKING)**:
- `filledIrl` REMOVED from ComposeDossierEnvelopeInputSchema. compose_dossier_envelope
  now accepts only `irlBodyHash` for the body reference; the body is fetched
  server-side from IrlBodyCache (stdio in-process LRU; Worker Upstash KV with 1h TTL).
- NEW `Bl076BodyCacheMissError` thrown when irlBodyHash is not in cache;
  directs caller to invoke prepare_irl_body first.
- prepare_irl_body now writes body to cache as a side-effect of returning hash.
  Output shape unchanged.
- Prompt body v0.16.0 → v0.17.0: directive instructs prepare-then-compose
  ordering and removal of filledIrl from compose call.
- Manifest hash + ALL 7 body hashes rebaseline.

**External-client impact**: NONE — operator confirmed no external callers
of compose_dossier_envelope. The forcing-function tool is prompt-orchestrated.
```

---

## Capability-preservation matrix (audit-derived)

The audit verified that every prior capability of `compose_dossier_envelope` is preserved post-BL-076. Recorded here for traceability:

| Prior capability                                                                         | BL-076 preservation mechanism                                                                                                                                                                                                                                                                                                                                                                        | Verdict                                              |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **BL-049** hash-bind authority (`sha256(body).slice(0,16) === irlBodyHash`)              | Check still runs post-rehydrate in `runComposeDossierEnvelope`. NOTE: structurally tautological post-cache-fetch (cache keyed by hash). Authority is preserved AT THE SAME LEVEL it held pre-BL-076: `pass-bound` for `partner-paste-verbatim`, `pass-internal` for reconstruction modes. The defense-in-depth check costs microseconds and protects against future cache-key-collision regressions. | **Preserved at parity**                              |
| **BL-070** `requireVerbatimBody` gate                                                    | Early-throw in `runComposeDossierEnvelope` branches on `input.irlSource` only; no `filledIrl` dependency. Engine signature unchanged (M-1 keeps `filledIrl` on the engine-internal type).                                                                                                                                                                                                            | **Preserved verbatim**                               |
| **BL-071** server-arithmetic identities (attempted/succeeded/rejected/errored)           | `Bl076BodyCacheMissError` → handler returns `isError: true` → `withToolMetrics` → `detectCounterOutcome` projects to `rejected` counter. Identity `attempted = succeeded + rejected + errored` continues to hold.                                                                                                                                                                                    | **Preserved verbatim**                               |
| **BL-072** reconstruction-mode source auto-append                                        | Branches on `input.irlSource`; no `filledIrl` dependency.                                                                                                                                                                                                                                                                                                                                            | **Preserved verbatim**                               |
| **BL-068** `prepare_irl_body` model-facing output contract (`{irlBodyHash, byteLength}`) | Output schema unchanged. Cache write is a server-side side effect, not a contract change. Annotations flip `readOnlyHint: true → false` (R-2) is metadata, not contract.                                                                                                                                                                                                                             | **Preserved** (with annotation accuracy improvement) |
| **BL-058 BL-045-VERIFY block schema**                                                    | No field changes. Manifest rebaseline driven solely by promptVersion 0.16.0 → 0.17.0 tuple drift.                                                                                                                                                                                                                                                                                                    | **Preserved verbatim**                               |
| **BL-063** partition + scope checks (`defaultFiredFrameworks` validation)                | No `filledIrl` dependency.                                                                                                                                                                                                                                                                                                                                                                           | **Preserved verbatim**                               |

---

## Acceptance criteria (in-session — no live exercise required)

1. **TypeScript clean** + **all existing tests pass** after the schema refactor.
2. **New unit tests** in `mcp-server/tests/unit/cache/irl-body-cache.test.ts`:
   - `InMemoryIrlBodyCache.set` + `.get` round-trips a body.
   - LRU eviction: 17th `.set` evicts the least-recently-used entry.
   - `.get` on unknown hash returns `null`.
3. **New integration test** in `mcp-server/tests/integration/bl-076-body-by-hash.test.ts`:
   - `handlePrepareIrlBodyTool` (called with a cache) seeds the cache; subsequent `handleComposeDossierEnvelopeTool` (with the same cache + the returned hash) succeeds and produces a valid envelope.
   - `handleComposeDossierEnvelopeTool` called BEFORE `prepare_irl_body` throws `Bl076BodyCacheMissError`; handler returns `isError: true` with the BL-076 diagnostic text.
   - Hash-bind defense-in-depth: cache poisoned with a body whose hash doesn't match the requested `irlBodyHash` is rejected at the existing `sha256` check (this is structurally impossible by construction but the test pins the defense).
4. **Existing test adaptations** — `baseInput()` factories updated; integration tests prepare-then-compose.
5. **Prompt-body substring assertions**:
   - Both one-shot AND interactive bodies contain the substring `prepare_irl_body` in the envelope-composition directive.
   - Both bodies contain the substring `BL-076` (signals the new contract).
   - Both bodies NO LONGER mention `filledIrl` as a `compose_dossier_envelope` input field (the old directive language is replaced).
6. **Protocol-roundtrip assertions** (audit M-3) in `tests/integration/protocol-roundtrip.test.ts`:
   - `compose_dossier_envelope`'s published `inputSchema.required` array NO LONGER contains `filledIrl`.
   - `compose_dossier_envelope`'s published `inputSchema.properties.filledIrl` is undefined.
   - `prepare_irl_body`'s published `inputSchema.required` array still includes `filledIrl` (unchanged).
   - `prepare_irl_body`'s published tool annotations show `readOnlyHint: false, idempotentHint: true` (R-2 verification).
7. **Manifest + body hash rebaselines committed** in lockstep with the BREAKING_CHANGES note.
8. **Post-merge sanity** (manual, low-priority): one live `gst_irl_ingestion` exercise on staging. Measure compose call wall-clock from "compose_dossier_envelope: invoking" to "tool returned." Acceptance: ≤ 3 minutes for a typical (10–20KB) body. Target: 1–2 minutes.

---

## Risks

- **Worker cache TTL tuning**. 1h is a guess. Too short → cache miss on operator-paused iteration (model returns, operator thinks, then re-engages > 1h later); the retry is cheap (`prepare_irl_body` is sha256 + KV write) but surfaces as a confusing `Bl076BodyCacheMissError`. Too long → KV usage growth. Revisit after one week of staging data. Make the TTL a single `IRL_BODY_CACHE_TTL_SECONDS` env-binding so it can be tuned without code change.
- **Stdio LRU cap = 16**. Empirically generous (no operator has iterated more than 3–4 distinct IRL bodies in a session). If exceeded, the eviction triggers a `Bl076BodyCacheMissError` on the next compose; the retry is `prepare_irl_body` then compose. Acceptable degradation. Document the cap in `Bl076BodyCacheMissError.message` so the diagnostic is actionable.
- **Hash-bind authority preserved**. The `sha256(rehydrated_body).slice(0,16) === irlBodyHash` check still runs in `runComposeDossierEnvelope` — closes the cache-poisoning attack surface (structurally impossible by construction, but the defense-in-depth check costs microseconds and prevents a future cache-key-collision regression from going undetected).
- **Model-side compliance**. The model could theoretically skip `prepare_irl_body` and try `compose_dossier_envelope` directly. The cache-miss error is structured and actionable; the prompt directive instructs the order; existing BL-070-style operator-detection covers the lying case (a model that lies about calling `prepare_irl_body` cannot also fake the cache hit — `Bl076BodyCacheMissError` would surface in `serverToolCallCounts.compose_dossier_envelope.rejected` per BL-071's server-arithmetic).
- **Existing `prepare_irl_body` callers without an updated cache surface**. The handler signature change to `(payload, cache?)` is backward-compatible — old callers (none today; all wrap through `withToolMetrics`) get `cache: undefined` and the cache-write is skipped. No behavior change for the model-facing tool output.
- **Worker single-flight on cache reads**. `compose_dossier_envelope` reads exactly once per call; no risk of redundant Upstash reads under retry. If a multi-call retry pattern emerges later, the existing radar-cache single-flight infrastructure (see [MCP_SERVER_RADAR_UNIFICATION_BL-032_8.md](MCP_SERVER_RADAR_UNIFICATION_BL-032_8.md)) is a reference.

### Risks added by audit

- **R-1 — Re-entrant compose calls.** `compose_dossier_envelope` is designed to be re-callable to add discovered gaps mid-composition (`emitInstructions` line 506: "re-call this tool with the updated arrays"). The cache must survive across calls within a session. Stdio: LRU=16 is comfortably more than the 1–3 distinct IRL bodies an operator iterates in a session. Worker: 4h TTL covers an operator coffee break + standup + iteration; a paused operator returning after 4h hits `Bl076BodyCacheMissError` and re-invokes `prepare_irl_body` (cheap). Acceptable degradation. Documented in the error message so the diagnostic is actionable.
- **R-2 — `prepare_irl_body` annotation drift.** Today the tool is registered with `readOnlyHint: true`. BL-076 makes the cache write a side effect — the call mutates server state. The schema-changes section above flips `readOnlyHint: true → false`. `idempotentHint` stays `true` (the same body in produces the same cache state — a deterministic-hash overwrite). Failure to update this hint would mis-advertise the tool to MCP clients that gate side-effect calls on the hint.
- **R-3 — Worker isolate cold-start cache miss (in-memory fallback is forbidden).** Cloudflare Worker isolates rotate between requests. If `createServer` in Worker mode silently falls back to `InMemoryIrlBodyCache` when Upstash bindings are absent, every cross-isolate prepare-then-compose chain would surface a confusing `Bl076BodyCacheMissError`. The wiring MUST fail fast at server-construction time when `env.UPSTASH_*` bindings are absent in Worker mode (`throw new Error('BL-076 requires Upstash bindings in Worker mode')`). Stdio path remains in-memory unconditionally. This is enforced in `createServer`'s Worker branch — not a runtime check, a startup-time bindings assertion.

---

## Out of scope

- **Splitting `compose_dossier_envelope` into multiple smaller composable calls** (Option 3 from initial triage — emit meta-fence + (J) + (K) via separate tool calls). BL-076 delivers most of the latency win at a fraction of the architectural cost; splitting can layer on top later if latency stays painful.
- **Token-bloat schema audit** (Option 1 — shorten field descriptions, allow short-form citations, collapse redundant nesting in gap entries). Worth ~5–15% additional win. Independent ticket if pursued; not BL-076.
- **Multi-tenant cache isolation**. Single-operator workflow today. If concurrent operators ever share a Worker isolate, namespace the cache key by `keyOwner`.
- **Persistence across server restarts**. In-process Map evaporates on stdio restart; Upstash KV survives. Both are acceptable — operators re-call `prepare_irl_body` on retry. Persisting across stdio restarts would require disk-backed cache, which is over-engineered for a sub-hour iteration loop.
- **Backward-compat shim accepting `filledIrl`**. Confirmed unnecessary 2026-06-07. If a future surface needs it (e.g., a non-Claude-Desktop transport that doesn't sequence prepare-then-compose naturally), revisit.
- **The 2026-06-06 `prepare_irl_body` 4-minute transport hang**. Different symptom (`prepare_irl_body` returns tiny output — cannot be token-emit). Unexplained. One occurrence. If it recurs distinctly, file separately.

---

## Open questions

Resolved during the audit pass — kept here for traceability:

- ~~`ServerContext` vs sibling field on `MetricsContext`~~ → **Resolved: sibling field** on `MetricsContext`, symmetric with BL-071's `counters?`. Refactor to a unified `ServerContext` bag deferred until a third pseudo-context arrives.
- ~~`IRL_BODY_CACHE_TTL_SECONDS` default~~ → **Resolved: 4h (14400s)**, exposed via env-binding for tuning. 1h was too tight per audit m-5 (operator coffee break + standup + iteration easily exceeds).
- ~~Cache module name~~ → **Resolved: single `src/cache/irl-body-cache.ts`** with both stdio (`InMemoryIrlBodyCache`) and Worker (`UpstashIrlBodyCache`) implementations co-located.
- ~~Per-entry size cap~~ → **Resolved: `IRL_BODY_CACHE_MAX_BYTES = 200_000`** (2× realistic upper bound; protects against hostile/buggy callers OOMing stdio).

Remaining open:

1. **`prepare_irl_body` cache write on Worker — sync vs fire-and-forget.** Upstash KV writes are ~50ms p50. Acceptable on the call critical path (sub-100ms is below model's perception threshold). If a future measurement shows > 100ms p99, switch to fire-and-forget (safe because `compose_dossier_envelope` is gated by the model's serial response stream — the model can't call compose before prepare returns the hash). Recommend: synchronous write for simplicity; revisit on empirical data.
2. **Telemetry — cache hit/miss BL-032.75 metric events.** Cheap to add and surfaces model-compliance patterns (model that calls compose without prepare → hit-rate < 100%). Recommend: emit `tool_cache_event` with `outcome: hit | miss` keyed to `prepare_irl_body` / `compose_dossier_envelope`. Lands as a small BL-032.75 schema addition. Not blocking; can land in a follow-on PR.

---

## Implementation order (single PR)

1. Define `IrlBodyCache` interface + `InMemoryIrlBodyCache` + new unit tests.
2. Add `Bl076BodyCacheMissError` class + handler `instanceof` wiring.
3. Modify `prepare_irl_body` handler to take optional cache + write on hit.
4. Refactor `runComposeDossierEnvelope` + `compose-dossier-envelope.ts` handler: take optional cache; fetch body from cache before `runIrlProvenanceCheck`; throw `Bl076BodyCacheMissError` on miss.
5. Remove `filledIrl` from `ComposeDossierEnvelopeInputSchema`.
6. Add `irlBodyCache?` to `MetricsContext`; thread through `createServer` for stdio + Worker.
7. Build `UpstashIrlBodyCache` (mirrors radar-cache pattern, see [`mcp-server/src/cache/`](../../../mcp-server/src/cache/)).
8. Adapt existing tests: `baseInput()` drops `filledIrl`; test setup seeds cache.
9. New integration test `tests/integration/bl-076-body-by-hash.test.ts`.
10. Prompt body update at both invocation sites; promptVersion 0.16.0 → 0.17.0.
11. Hash rebaselines (manifest + 7 body hashes).
12. `BREAKING_CHANGES.md` 0.30.0 stanza; `mcp-server/package.json` version bump.
13. BACKLOG.md BL-076 stanza moved OPEN → CLOSED with shipped scope summary.

Estimated effort: **1.5–2 working days end-to-end** (audit revision — original 1d + 0.5d was honest for the rebaseline phase but light for the implementation pass). Breakdown: ~1 day for cache infra (interface + 2 implementations + unit tests) + engine signature decision + handler wiring + 8 test adaptations; ~0.5 day for prompt body update at two sites + 8 hash rebaselines (manifest + 7 body hashes); ~0.5 day for protocol-roundtrip assertions + BL-076 integration test + BREAKING_CHANGES stanza + final settling.
