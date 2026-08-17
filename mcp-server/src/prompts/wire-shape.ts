/**
 * Wire-shape adapters for MCP prompt arguments.
 *
 * **Why this exists**: the MCP wire-protocol declares prompt `arguments` as
 * `Record<string, string>` — every value arrives as a plain string regardless
 * of the underlying argsSchema. Claude Desktop (as of May 2026) renders all
 * argument fields as plain text inputs and ships their raw string values.
 *
 * Without preprocessing, any prompt with a non-string field (`z.array(...)`,
 * `z.number()`, etc.) silently fails Zod validation and Desktop reports
 * "Failed to attach prompt" with no diagnostic — see BL-034 cleanup notes.
 *
 * **Design — forward-compat first**: each adapter inspects the runtime type
 * of the incoming value and:
 *   - Parses if the value is a string (current Desktop wire shape).
 *   - Passes through unchanged if the value is already the target type
 *     (future clients that respect the schema).
 *   - Lets anything else fall through to the inner schema, so native Zod
 *     error messages surface for the model / user.
 *
 * The day MCP clients send typed values, these adapters become no-ops.
 * The pass-through behavior is asserted by tests so the guarantee is
 * structural, not aspirational.
 */

import { z } from 'zod';

/**
 * Adapt a `z.array(...)` schema so it accepts either an actual array
 * (forward-compat) or a JSON-encoded array string (current Desktop wire shape).
 *
 * Empty / whitespace-only strings normalize to `undefined`, so an unfilled
 * form field in Claude Desktop (which ships `""` rather than dropping the
 * key) is treated as "not supplied". For this to take effect on optional /
 * defaulted fields, the caller must apply `.optional()` or `.default(...)`
 * INSIDE the wrapper — `arrayFromWire(z.array(...).min(1).optional())`,
 * not `arrayFromWire(z.array(...).min(1)).optional()` (the latter sees ''
 * before the preprocess and mis-rejects). The widened generic accepts
 * `ZodArray<T>` directly OR wrapped in `ZodOptional` / `ZodDefault`.
 */

export function arrayFromWire<S extends z.ZodTypeAny>(inner: S) {
  return z.preprocess((v) => {
    if (Array.isArray(v)) return v; // forward-compat: typed array, pass through
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed === '') return undefined; // empty form field → not supplied
      if (trimmed.startsWith('[')) {
        try {
          return JSON.parse(trimmed);
        } catch {
          // fall through — inner schema will reject with a structured error
          return v;
        }
      }
      // bare-string fallback: comma-separated single-line entry
      // (e.g. user types `us,eu` instead of `["us", "eu"]`)
      return trimmed
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return v;
  }, inner);
}

/**
 * Adapt a `z.number()` schema so it accepts either an actual number
 * (forward-compat) or a numeric string (current Desktop wire shape).
 *
 * Empty / whitespace-only strings normalize to `undefined`. As with
 * `arrayFromWire`, `.optional()` / `.default(N)` must be applied to the
 * inner schema (not chained on the wrapper) for the empty-string path to
 * take effect — `numberFromWire(z.number().max(168).default(24))`, not
 * `numberFromWire(z.number().max(168)).default(24)`.
 */
export function numberFromWire<S extends z.ZodTypeAny>(inner: S) {
  return z.preprocess((v) => {
    if (typeof v === 'number') return v; // forward-compat: typed number
    if (typeof v === 'string') {
      if (v.trim() === '') return undefined; // empty form field → not supplied
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
    return v;
  }, inner);
}

/**
 * Adapt a `z.enum(...)` schema so it accepts any case-variant of an enum
 * value. The preprocessor lower-cases the incoming value and looks it up
 * against a case-folded map of the enum's options; on hit, the canonical
 * (correctly-cased) value is forwarded to Zod. Misses pass through
 * unchanged so Zod's native error message surfaces — the user still gets
 * the helpful "Invalid enum value, expected …" diagnostic.
 *
 * Why preprocess at the MCP boundary instead of relaxing source-of-truth
 * schemas: data files (e.g. `src/data/ma-portfolio/projects.json`,
 * `src/data/diligence-machine/wizard-config.ts`) MUST stay strictly typed
 * — a typo in those files is a real bug we want Zod to catch. Wire input
 * from agents and form-fillers is the forgiving-by-default direction; this
 * adapter lives in MCP-server land so the canonicality of the data
 * remains protected while the agent-facing surface is ergonomic.
 */
// `any` is the right generic constraint here — we accept any ZodEnum
// (or one wrapped in ZodOptional / ZodDefault for V7-trial-(b) empty-
// string handling). The runtime walks the wrapper chain to find the
// underlying ZodEnum so `.options` can be enumerated. Stricter
// compile-time constraints fight Zod 4's literal-tuple narrowing
// for callers that build enums via
// `z.enum(CONST as unknown as [Lit, ...Lit[]])` (e.g. RadarCategoryEnum).

/**
 * Exported for the BL-125 repo-wide guard, which must enumerate a valid
 * canonical value per enum field in order to probe the whitespace-padded form.
 *
 * The alternative was reading `argsSchema['~standard'].jsonSchema` — the same
 * conversion the SDK uses to build the client-visible argument list, so it
 * would assert against what Desktop actually sees. Spiked and rejected: that
 * object exposes only `{ input, output }` and serialises to `{}`, so the enum
 * options are not reachable through it.
 *
 * **Throws on a non-enum inner** (see below), so callers iterating over a mixed
 * field set must pre-filter or catch — a bare call inside an `ALL_PROMPTS` loop
 * dies on the first string field.
 */
export function unwrapToEnumOptions(schema: z.ZodTypeAny): readonly string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let s: any = schema;
  for (let i = 0; i < 6; i++) {
    if (Array.isArray(s?.options)) return s.options as readonly string[];
    const d = s?._def ?? s?.def;
    // ZodOptional / ZodDefault wrap under `innerType`. A **ZodPipe** — which is
    // what `z.preprocess` builds, and therefore what every adapter in this file
    // returns — wraps under `{ in, out }` with no `innerType` at all.
    //
    // BL-125: the walk followed `innerType` only, so it hit the pipe, broke,
    // and threw for EVERY registered prompt argument. That was invisible while
    // the sole caller was `enumFromWire` itself, which passes the raw inner
    // schema before wrapping. The moment the BL-125 guard called it on a
    // REGISTERED field — `ZodOptional(ZodPipe)` — it threw on all 60, the
    // guard's catch swallowed each one, and a test that reported success
    // probed nothing. Following `out` reaches 31 enum fields across 9 prompts.
    const inner = d?.innerType ?? d?.out;
    if (!inner) break;
    s = inner;
  }
  throw new Error(
    'enumFromWire: inner schema is not a ZodEnum (optionally wrapped in ZodOptional / ZodDefault)'
  );
}

/**
 * Adapt a `z.boolean()` schema so it accepts either an actual boolean
 * (forward-compat) or a string form (current Desktop wire shape). MCP
 * prompt arguments arrive as `Record<string, string>` — Claude Desktop's
 * slash-command form renders boolean fields as plain text inputs and ships
 * `"true"` / `"TRUE"` / `"false"` / `"FALSE"` / `"1"` / `"0"` rather than
 * the JSON boolean. Operators learned about this the hard way on 2026-06-07
 * when `requireVerbatimBody: "true"` got rejected with `expected boolean,
 * received string`.
 *
 * Accepted string forms (case-insensitive, whitespace-trimmed):
 *   - `'true'`, `'1'`, `'yes'`, `'y'`, `'on'`  → `true`
 *   - `'false'`, `'0'`, `'no'`, `'n'`, `'off'` → `false`
 *
 * Empty / whitespace-only strings normalize to `undefined`, so an unfilled
 * form field is treated as "not supplied" (same convention as the array /
 * number / enum adapters above). Unrecognized strings pass through so Zod's
 * native diagnostic ("Invalid input: expected boolean") still surfaces with
 * an actionable error message.
 *
 * **Optional fields require `.optional()` chained on BOTH sides** — the
 * inner schema (so the wrapper's empty-string→undefined path is accepted by
 * the inner type) AND the outer `ZodEffects` wrapper (so `ZodObject`'s
 * field-optionality introspection sees a top-level `ZodOptional`, which is
 * how Claude Desktop's slash-command form decides whether to mark the
 * field "required" in the UI). The pattern is:
 *
 *   field: booleanFromWire(z.boolean().optional()).optional()
 *
 * NOT either form alone. Inner-only: object-level "field required" UI
 * marker stays on (BL-082 follow-up empirically observed 2026-06-07).
 * Outer-only: the wrapper's `""` → undefined path is rejected by the inner
 * non-optional schema. Same convention applies to `arrayFromWire` /
 * `numberFromWire` / `enumFromWire`.
 */
const TRUE_FORMS = new Set(['true', '1', 'yes', 'y', 'on']);
const FALSE_FORMS = new Set(['false', '0', 'no', 'n', 'off']);
export function booleanFromWire<S extends z.ZodTypeAny>(inner: S) {
  return z.preprocess((v) => {
    if (typeof v === 'boolean') return v; // forward-compat: typed boolean
    if (typeof v === 'string') {
      const lower = v.trim().toLowerCase();
      if (lower === '') return undefined; // empty form field → not supplied
      if (TRUE_FORMS.has(lower)) return true;
      if (FALSE_FORMS.has(lower)) return false;
    }
    return v; // fall through — inner schema rejects with structured diagnostic
  }, inner);
}

export function enumFromWire<T extends z.ZodTypeAny>(inner: T) {
  const options = unwrapToEnumOptions(inner);
  const canonicalByLower = new Map<string, string>(options.map((v) => [v.toLowerCase(), v]));
  return z.preprocess((v) => {
    if (typeof v !== 'string') return v; // forward-compat / non-string fall-through
    if (v.trim() === '') return undefined; // empty form field → not supplied (V7 trial (b) fix)
    // BL-125 — look up the TRIMMED value. This tested blankness with `.trim()`
    // but looked up the raw string, so `"debug "` — trivially easy to produce
    // when pasting into a form field — missed the map, fell through to the
    // inner `z.enum`, and failed the whole `prompts/get` with -32602. Claude
    // Desktop surfaces that as "Failed to attach prompt" with no diagnostic:
    // the same opaque total failure BL-124 existed to eliminate, on a
    // different input. `booleanFromWire` above already trims before matching.
    //
    // On a MISS, return the ORIGINAL `v`, not the trimmed form: the inner
    // schema owns the diagnostic, and it should quote what the caller actually
    // sent. Same reasoning as `stringFromWire`'s no-trim guarantee below —
    // trimming is a matching aid here, never a mutation of the value.
    return canonicalByLower.get(v.trim().toLowerCase()) ?? v;
  }, inner);
}

/**
 * Adapt a `z.string()` schema so an unfilled Claude Desktop form field is
 * treated as "not supplied" rather than rejected.
 *
 * **Why this was needed (BL-124).** Desktop ships blank fields as `""`, not by
 * dropping the key. An optional string with a length constraint —
 * `z.string().min(200).optional()` on `gst_irl_ingestion.filledIrl` — therefore
 * failed `.min(200)` on every render where the operator left it blank, and the
 * whole `prompts/get` call returned `-32602`. Desktop surfaces that as
 * "Failed to attach prompt" with no diagnostic, which made interactive mode
 * unreachable from that client. BL-034 built these adapters for non-string
 * fields; nobody thought a plain string needed one.
 *
 * ─── This adapter must NOT trim the value it returns ──────────────────────
 *
 * `arrayFromWire` and the numeric/boolean adapters return trimmed or parsed
 * values. This one deliberately returns the ORIGINAL string: it trims only to
 * test emptiness. (`enumFromWire` behaves the same way on a lookup miss.)
 *
 * `filledIrl` is hashed — `computeIrlBodyHash(args.filledIrl)` — and that hash
 * is what an operator compares against the source file on their disk. A body
 * read from a file normally carries a trailing newline, so a trimming adapter
 * would silently change the hash and reintroduce exactly the "why doesn't this
 * match my file?" investigation this work exists to eliminate. Do not
 * "simplify" this to match the others.
 *
 * Optional fields need `.optional()` on BOTH sides, per the note on
 * `booleanFromWire` above: `stringFromWire(z.string().min(200).optional()).optional()`.
 */
export function stringFromWire<S extends z.ZodTypeAny>(inner: S) {
  return z.preprocess((v) => {
    if (typeof v !== 'string') return v; // forward-compat / non-string fall-through
    if (v.trim() === '') return undefined; // empty form field → not supplied
    return v; // ORIGINAL string — see the no-trim rationale above
  }, inner);
}
