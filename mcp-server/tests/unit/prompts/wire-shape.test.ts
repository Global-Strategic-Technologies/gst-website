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
import { arrayFromWire, enumFromWire, numberFromWire } from '../../../src/prompts/wire-shape';

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

  it('rejects empty string', () => {
    expect(wrapped.safeParse('').success).toBe(false);
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
});
