/**
 * Tool-result constructors — the single place any MCP tool response is built
 * (BL-090). One rule, stated once:
 *
 *   **`structuredContent` is the machine channel. `content` is the model channel.**
 *
 * Before BL-090 every tool hand-rolled its result literal — 34 of them across 13
 * files, in three different spellings, with `as unknown as Record<string, unknown>`
 * copy-pasted 16 times. Success paths dumped the payload into BOTH channels
 * (`JSON.stringify(payload, null, 2)` in `content[0].text` *and* the object in
 * `structuredContent`), roughly doubling every response: on a full
 * `search_portfolio` that is 143 KB on the wire where 61 KB suffices, the escaped
 * text copy being the larger of the two. Meanwhile not one of the 18 error returns
 * set `structuredContent` at all — two of them hand-`JSON.stringify`d a structured
 * error *into the text channel* because no structured error convention existed.
 *
 * A live probe against production settled which channel clients actually read:
 * `generate_information_request_list_xlsx` is the one tool whose two channels
 * deliberately differ, and the client surfaced its `structuredContent`, discarding
 * the text summary entirely. The duplicate was never reaching the model.
 *
 * Rationale, evidence and the rejected alternatives: src/docs/adr/0011-tool-response-channel-policy.md
 *
 * ## Invariants
 *
 * 1. `structuredContent` is canonical on EVERY path — success and failure alike.
 * 2. `content` is the model channel: a one-line caption on success; on failure the
 *    caller's text **verbatim**, never truncated or reformatted. Several tools emit
 *    multi-line diagnostics that `gst_irl_ingestion` explicitly instructs the model
 *    to read and retry on ("emit the error VERBATIM"), so transforming failure text
 *    would silently degrade an LLM-facing retry surface. Verbatim is the ONLY
 *    behavior precisely so no call site can get that wrong.
 * 3. Nothing outside this module builds a result literal — enforced mechanically by
 *    tests/integration/tool-result-constructors.test.ts, not by convention.
 *
 * ## Why this module imports nothing
 *
 * `ToolResult` is declared structurally rather than imported from the MCP SDK.
 * `CallToolResultSchema` is zod-inferred from a `looseObject`, so a structurally
 * equivalent local type is assignable — which is already proven by the fact that
 * every handler returned an anonymous literal with no SDK import before this.
 *
 * The stronger reason is cross-workspace: the website workspace imports
 * `handleTechparTool` (tests/integration/techpar-mcp-wizard-roundtrip.test.ts), so
 * anything this leaf pulls in joins the ROOT `astro check` program. An
 * `import type { InoreaderFailureReason }` would reach `inoreader-client.ts` →
 * `worker.ts` and drag `@cloudflare/workers-types` into a tsconfig that runs
 * `verbatimModuleSyntax: true` where mcp-server runs `false`. `import type` is
 * erased at emit, not at type-checking. Zero imports sidesteps that entirely.
 */

/**
 * The six upstream Inoreader failure reasons.
 *
 * These are the runtime home of a vocabulary that used to be hand-spelled twice —
 * as a bare type at `lib/inoreader-client.ts` and again as an inline union on the
 * live store's failure arm. `content/radar-live-store.ts` now derives its union
 * from this tuple, which makes `mapFailure()` there a compile-time drift guard:
 * widening `InoreaderFailureReason` or narrowing this tuple breaks that assignment.
 *
 * (Narrowing `InoreaderFailureReason` is NOT caught — it would leave a stale member
 * here and in the CONTRACT table. Harmless, since this tuple is the published
 * vocabulary and may legitimately outlive an upstream reason, but don't over-trust
 * the guard.)
 */
export const RADAR_UPSTREAM_REASONS = [
  'config-missing',
  'token-missing',
  'token-stale',
  'inoreader-rate-limit',
  'upstream-error',
  'network-timeout',
] as const;

/**
 * The radar tools' complete public failure vocabulary — the six upstream reasons
 * plus the breaker's own. Pinned against the `### Failure modes` table in
 * `src/docs/tools/radar/CONTRACT.md` by `contract-parity.test.ts`'s `enumParity`,
 * which is a bidirectional exact set match: adding a value here without adding the
 * table row (or vice versa) fails CI.
 */
export const RADAR_FAILURE_REASONS = [...RADAR_UPSTREAM_REASONS, 'service-unavailable'] as const;

/**
 * Every reason any tool may fail with. Closed on purpose: these strings ship as
 * part of the package's public contract the moment a client branches on them, and
 * a closed set is what stops the "three different spellings" drift this module
 * exists to remove.
 */
export const TOOL_FAILURE_REASONS = [
  ...RADAR_FAILURE_REASONS,
  'invalid-input',
  'audit-failed',
  'hash-mismatch',
  'cache-miss',
  'snapshot-missing',
  'internal-error',
] as const;

export type RadarUpstreamReason = (typeof RADAR_UPSTREAM_REASONS)[number];
export type RadarFailureReason = (typeof RADAR_FAILURE_REASONS)[number];
export type ToolFailureReason = (typeof TOOL_FAILURE_REASONS)[number];

/**
 * A tool response, shaped to the SDK's `CallToolResult`.
 *
 * Declared as a `type` alias rather than an `interface` deliberately: the SDK's
 * result schema is a zod `looseObject`, so the inferred type carries an index
 * signature. TypeScript grants implicit index signatures to object type aliases
 * but not to interfaces — an interface here would fail assignability at every
 * `registerTool` site. `content` is likewise a mutable array for the same reason.
 */
export type ToolResult = {
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

/**
 * A success result. `structuredContent` is REQUIRED here, not merely optional as
 * on the general {@link ToolResult} — `toolOk` always sets it, and saying so keeps
 * callers (and the ~70 existing tests that read `result.structuredContent.field`)
 * free of optional chaining that could never fire.
 */
export type ToolOkResult = ToolResult & { structuredContent: Record<string, unknown> };

/** Options for {@link toolFail}. Separate from `extra` so nothing here can leak
 *  into the public envelope via the payload spread. */
export interface ToolFailOptions {
  /**
   * Omit `structuredContent` from this failure. Reserved for the case where a
   * client is found to render a structured error in place of the directive prose
   * the model must act on — the narrow, pre-specified fallback from ADR-0011.
   * Unused today; do not reach for it without that evidence.
   */
  readonly suppressStructured?: boolean;
}

/**
 * Build a success result.
 *
 * `payload` is the truth and goes to `structuredContent` untouched. `summary` is a
 * one-line human caption for the model channel — lead with the count, no JSON, no
 * embedded newlines. There is no length cap: two tools carry genuinely long
 * captions (a Hub download URL the model is told to relay; an explanation of the
 * `NN-II` request keys), and truncating those would break documented behavior.
 */
export function toolOk<T extends object>(payload: T, summary: string): ToolOkResult {
  return {
    content: [{ type: 'text', text: summary }],
    structuredContent: payload as unknown as Record<string, unknown>,
  };
}

/**
 * Build a failure result.
 *
 * `text` reaches `content` **verbatim** — this function never truncates, wraps or
 * reformats it (Invariant 2). It is mirrored into `structuredContent.message` so
 * programmatic callers get the same string without parsing prose, alongside the
 * machine-readable `error` reason.
 *
 * `extra` is spread into `structuredContent` for reason-specific detail
 * (`status`, `retryAfterSeconds`, …). It must not carry control flags — that is
 * what {@link ToolFailOptions} is for.
 */
export function toolFail(
  reason: ToolFailureReason,
  text: string,
  extra?: Record<string, unknown>,
  options?: ToolFailOptions
): ToolResult {
  const result: ToolResult = {
    content: [{ type: 'text', text }],
    isError: true,
  };
  if (options?.suppressStructured !== true) {
    // `extra` is spread FIRST so the canonical fields always win. Spread last, an
    // `extra` that happened to carry `message` would silently clobber the verbatim
    // mirror of `content[0].text` — the one thing Invariant 2 guarantees.
    result.structuredContent = { ...extra, error: reason, message: text };
  }
  return result;
}
