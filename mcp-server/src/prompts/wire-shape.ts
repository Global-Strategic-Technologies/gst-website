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

function unwrapToEnumOptions(schema: z.ZodTypeAny): readonly string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let s: any = schema;
  for (let i = 0; i < 5; i++) {
    if (Array.isArray(s?.options)) return s.options as readonly string[];
    // ZodOptional / ZodDefault — Zod 4 stores the wrapped schema under
    // `_def.innerType` (legacy) or `def.innerType` (Zod 4 classic).
    const inner = s?._def?.innerType ?? s?.def?.innerType;
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
 * `.optional()` / `.default(...)` MUST be applied to the inner schema —
 * `booleanFromWire(z.boolean().optional())`, NOT
 * `booleanFromWire(z.boolean()).optional()` — for the empty-string path to
 * take effect (the latter sees `""` before the preprocess and mis-rejects).
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
    return canonicalByLower.get(v.toLowerCase()) ?? v;
  }, inner);
}
