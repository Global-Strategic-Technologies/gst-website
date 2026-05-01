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
