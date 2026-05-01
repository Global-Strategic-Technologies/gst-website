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
 * Anything else is passed through unchanged so the inner schema's native
 * error message surfaces.
 */
export function arrayFromWire<T extends z.ZodTypeAny>(inner: z.ZodArray<T>) {
  return z.preprocess((v) => {
    if (Array.isArray(v)) return v; // forward-compat: typed array, pass through
    if (typeof v === 'string') {
      const trimmed = v.trim();
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
 */
export function numberFromWire<S extends z.ZodNumber>(inner: S) {
  return z.preprocess((v) => {
    if (typeof v === 'number') return v; // forward-compat: typed number
    if (typeof v === 'string' && v.trim() !== '') {
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
// regardless of its inner literal-tuple type; the cast on `inner.options`
// below recovers the actual string array. Using a stricter constraint
// (`[string, ...string[]]`, `readonly [string, ...string[]]`) doesn't
// admit Zod 4's literal-tuple narrowing for callers that build enums
// via `z.enum(CONST as unknown as [Lit, ...Lit[]])` (e.g.
// RadarCategoryEnum). The function's runtime contract is enforced by
// the cast and the typeof check, not the call-site generic.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function enumFromWire<T extends z.ZodEnum<any>>(inner: T) {
  const options = inner.options as readonly string[];
  const canonicalByLower = new Map<string, string>(options.map((v) => [v.toLowerCase(), v]));
  return z.preprocess((v) => {
    if (typeof v !== 'string') return v; // forward-compat / non-string fall-through
    return canonicalByLower.get(v.toLowerCase()) ?? v;
  }, inner);
}
