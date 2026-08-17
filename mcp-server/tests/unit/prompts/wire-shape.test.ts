/**
 * Unit tests for the prompt-argument wire-shape adapters.
 *
 * Each adapter must accept BOTH:
 *   (a) Already-typed values — forward-compat for future MCP clients that
 *       send typed prompt arguments per a richer wire shape.
 *   (b) String-encoded values — current Claude Desktop wire shape.
 *
 * Asserting both paths makes the forward-compat guarantee structural —
 * the day clients catch up, these adapters become no-ops, and these tests
 * prove the no-op direction still works.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  arrayFromWire,
  booleanFromWire,
  enumFromWire,
  numberFromWire,
} from '../../../src/prompts/wire-shape';

describe('arrayFromWire', () => {
  const inner = z.array(z.string()).min(1);
  const wrapped = arrayFromWire(inner);

  it('passes through an already-typed array unchanged (forward-compat)', () => {
    const r = wrapped.safeParse(['us', 'eu']);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual(['us', 'eu']);
  });

  it('parses a JSON-encoded array string (current Desktop wire shape)', () => {
    const r = wrapped.safeParse('["us", "eu"]');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual(['us', 'eu']);
  });

  it('falls back to comma-separated parse when input is a bare string', () => {
    const r = wrapped.safeParse('us, eu');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual(['us', 'eu']);
  });

  it('rejects malformed JSON via the inner schema (no silent corruption)', () => {
    // `["us", "eu"` (unclosed) — JSON.parse throws; preprocess returns the
    // raw string; inner z.array rejects with native error message
    const r = wrapped.safeParse('["us", "eu"');
    expect(r.success).toBe(false);
  });

  it('rejects an empty array per the inner .min(1) constraint', () => {
    expect(wrapped.safeParse([]).success).toBe(false);
    expect(wrapped.safeParse('[]').success).toBe(false);
  });

  it('normalizes empty / whitespace strings to undefined when inner is optional (V7 trial b fix)', () => {
    // An unfilled form field in Claude Desktop ships "" rather than dropping
    // the key. The fix requires `.optional()` to be applied to the INNER
    // schema (not chained on the wrapper) — otherwise Zod sees "" before
    // the preprocess and the optional layer can't intercept the resulting
    // rejection.
    const innerOptional = arrayFromWire(z.array(z.string()).min(1).optional());
    expect(innerOptional.safeParse('').success).toBe(true);
    expect(innerOptional.safeParse('   ').success).toBe(true);
  });

  it('preserves enum constraints inside the inner schema', () => {
    const enumWrapped = arrayFromWire(z.array(z.enum(['us', 'eu', 'apac'])).min(1));
    expect(enumWrapped.safeParse('["us", "eu"]').success).toBe(true);
    expect(enumWrapped.safeParse(['us', 'apac']).success).toBe(true);
    expect(enumWrapped.safeParse('["xx"]').success).toBe(false);
    expect(enumWrapped.safeParse(['xx']).success).toBe(false);
  });
});

describe('numberFromWire', () => {
  const wrapped = numberFromWire(z.number().int().positive());

  it('passes through an already-typed number unchanged (forward-compat)', () => {
    const r = wrapped.safeParse(42);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(42);
  });

  it('coerces a numeric string (current Desktop wire shape)', () => {
    const r = wrapped.safeParse('42');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(42);
  });

  it('rejects non-numeric strings', () => {
    expect(wrapped.safeParse('not-a-number').success).toBe(false);
  });

  it('rejects empty string when the field is required', () => {
    // Empty form field on a required number surfaces as a Required error
    // (not "expected number, received string") — V7 trial (b) finding.
    expect(wrapped.safeParse('').success).toBe(false);
  });

  it('lets inner .default(N) kick in when the field is empty (V7 trial b fix)', () => {
    // Default applied to the INNER schema so when the wrapper preprocess
    // returns undefined for "", the inner default fires. Compare with
    // chaining .default(N) on the wrapper (which doesn't work — Zod's
    // .default check is for the OUTER input, not the preprocess result).
    const withInnerDefault = numberFromWire(z.number().int().positive().max(168).default(24));
    expect(withInnerDefault.safeParse('').success).toBe(true);
    expect(withInnerDefault.parse('')).toBe(24);
    expect(withInnerDefault.parse('   ')).toBe(24);
    expect(withInnerDefault.parse(undefined)).toBe(24);
    expect(withInnerDefault.parse('48')).toBe(48); // explicit value still works
  });

  it('preserves inner constraints (positive, integer)', () => {
    expect(wrapped.safeParse(-5).success).toBe(false);
    expect(wrapped.safeParse('-5').success).toBe(false);
    expect(wrapped.safeParse(3.14).success).toBe(false);
    expect(wrapped.safeParse('3.14').success).toBe(false);
  });
});

describe('enumFromWire', () => {
  const inner = z.enum(['Buy-Side', 'Sell-Side']);
  const wrapped = enumFromWire(inner);

  it("trims surrounding whitespace — 'Buy-Side ' parses to the canonical member", () => {
    // BL-125. The blank check used `.trim()` but the canonical lookup did not,
    // so a trailing space — trivially produced by pasting into a form field —
    // missed the map, fell through to the inner `z.enum`, and failed the whole
    // `prompts/get` with -32602. Claude Desktop shows that as "Failed to attach
    // prompt" with no diagnostic. `booleanFromWire` has had the equivalent case
    // since it was written; this one had none, which is how the gap survived.
    expect(wrapped.parse('Buy-Side ')).toBe('Buy-Side');
    expect(wrapped.parse(' Buy-Side')).toBe('Buy-Side');
    expect(wrapped.parse('\tbuy-side\n')).toBe('Buy-Side'); // trim AND case-fold
  });

  it('still rejects a genuinely unknown value, quoting what was sent', () => {
    // The paired negative: trimming is a matching aid, not a mutation. On a
    // miss the ORIGINAL string reaches the inner schema so the diagnostic
    // quotes the caller's input rather than a silently altered form.
    const r = wrapped.safeParse('  Buy Side  ');
    expect(r.success).toBe(false);
  });

  it('passes through the canonical value unchanged (forward-compat)', () => {
    const r = wrapped.safeParse('Buy-Side');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('Buy-Side');
  });

  it('normalizes case variants to the canonical value', () => {
    for (const variant of ['buy-side', 'BUY-SIDE', 'Buy-side', 'bUy-SiDe']) {
      const r = wrapped.safeParse(variant);
      expect(r.success, `variant=${variant} should normalize to "Buy-Side"`).toBe(true);
      if (r.success) expect(r.data).toBe('Buy-Side');
    }
  });

  it('still rejects values that are not case variants of any option', () => {
    const r = wrapped.safeParse('Maybe-Side');
    expect(r.success).toBe(false);
    // Native Zod error mentions the valid options — diagnostic stays helpful.
    if (!r.success) {
      const msg = r.error.issues[0].message;
      expect(msg.toLowerCase()).toMatch(/buy-side|sell-side|invalid/);
    }
  });

  it('passes through non-string values so inner Zod surfaces the right error', () => {
    expect(wrapped.safeParse(42).success).toBe(false);
    expect(wrapped.safeParse(null).success).toBe(false);
    expect(wrapped.safeParse(undefined).success).toBe(false);
  });

  it('composes with z.array — every array element becomes case-tolerant', () => {
    const arr = z.array(enumFromWire(z.enum(['us', 'eu', 'apac'])));
    const r = arr.safeParse(['US', 'Eu', 'APAC']);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual(['us', 'eu', 'apac']);
  });

  it('composes with .optional() — undefined still skips validation', () => {
    const opt = enumFromWire(z.enum(['a', 'b'])).optional();
    expect(opt.safeParse(undefined).success).toBe(true);
    expect(opt.safeParse('A').success).toBe(true);
    expect(opt.safeParse('c').success).toBe(false);
  });

  it('normalizes empty / whitespace string to undefined when inner is optional (V7 trial b fix)', () => {
    // Empty form field on an optional enum should not reject — it should
    // surface as "field not supplied" so the inner .optional() takes
    // effect. This is the bug that caused gst_radar_brief_today to fail
    // to attach when the user submitted both fields blank. .optional()
    // must be applied to the INNER schema; chaining on the wrapper
    // doesn't work because Zod's .optional check sees "" (not undefined)
    // before the preprocess runs.
    const innerOptional = enumFromWire(z.enum(['a', 'b']).optional());
    expect(innerOptional.safeParse('').success).toBe(true);
    expect(innerOptional.safeParse('   ').success).toBe(true);
    expect(innerOptional.safeParse('A').success).toBe(true);
  });
});

// ─── BL-082 — booleanFromWire (slash-command form ships strings) ─────────

describe('booleanFromWire', () => {
  const wrapped = booleanFromWire(z.boolean());

  it('passes through an already-typed boolean unchanged (forward-compat)', () => {
    const r = wrapped.safeParse(true);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(true);
    const f = wrapped.safeParse(false);
    expect(f.success).toBe(true);
    if (f.success) expect(f.data).toBe(false);
  });

  it("parses the canonical strings 'true' and 'false'", () => {
    expect(wrapped.parse('true')).toBe(true);
    expect(wrapped.parse('false')).toBe(false);
  });

  it('is case-insensitive — TRUE / False / TrUe all parse', () => {
    expect(wrapped.parse('TRUE')).toBe(true);
    expect(wrapped.parse('False')).toBe(false);
    expect(wrapped.parse('TrUe')).toBe(true);
  });

  it("trims surrounding whitespace — '  true ' parses", () => {
    expect(wrapped.parse('  true ')).toBe(true);
    expect(wrapped.parse('\tfalse\n')).toBe(false);
  });

  it("accepts ergonomic alternates — 'yes' / 'no' / '1' / '0' / 'on' / 'off' / 'y' / 'n'", () => {
    expect(wrapped.parse('yes')).toBe(true);
    expect(wrapped.parse('YES')).toBe(true);
    expect(wrapped.parse('y')).toBe(true);
    expect(wrapped.parse('1')).toBe(true);
    expect(wrapped.parse('on')).toBe(true);
    expect(wrapped.parse('no')).toBe(false);
    expect(wrapped.parse('n')).toBe(false);
    expect(wrapped.parse('0')).toBe(false);
    expect(wrapped.parse('off')).toBe(false);
  });

  it('rejects garbage strings via the inner schema (no silent coercion to truthy)', () => {
    const r = wrapped.safeParse('definitely');
    expect(r.success).toBe(false);
    const r2 = wrapped.safeParse('truthy');
    expect(r2.success).toBe(false);
  });

  it('rejects non-boolean non-string values (numbers, objects, arrays)', () => {
    expect(wrapped.safeParse(0).success).toBe(false);
    expect(wrapped.safeParse(1).success).toBe(false);
    expect(wrapped.safeParse({}).success).toBe(false);
    expect(wrapped.safeParse([]).success).toBe(false);
  });

  it('treats empty / whitespace-only strings as not supplied (optional pattern)', () => {
    // When `.optional()` is applied to the inner schema, the empty form-field
    // value `""` shipped by Claude Desktop should not surface as a Zod
    // validation error — it should be treated as "field not filled."
    const innerOptional = booleanFromWire(z.boolean().optional());
    expect(innerOptional.safeParse('').success).toBe(true);
    expect(innerOptional.safeParse('   ').success).toBe(true);
    expect(innerOptional.safeParse('true').success).toBe(true);
    expect(innerOptional.safeParse(true).success).toBe(true);
    // Confirm the resolved value for the empty case is undefined (not false).
    const r = innerOptional.safeParse('');
    if (r.success) expect(r.data).toBeUndefined();
  });

  it("BL-082 regression: requireVerbatimBody='TRUE' from slash-command form parses to boolean true", () => {
    // The specific failure case from the 2026-06-07 operator incident:
    // Claude Desktop shipped {"requireVerbatimBody": "TRUE"} and the server
    // rejected with "expected boolean, received string". This pins the fix.
    const schema = booleanFromWire(z.boolean().optional());
    expect(schema.parse('true')).toBe(true);
    expect(schema.parse('TRUE')).toBe(true);
    expect(schema.parse('false')).toBe(false);
    expect(schema.parse('FALSE')).toBe(false);
  });
});
