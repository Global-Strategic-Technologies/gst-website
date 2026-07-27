/**
 * BL-079 Part A — `validate_irl_provenance` body-by-hash schema tests.
 *
 * Covers the cross-field rule + the `irlBodyHash` shape + the handler-side
 * cache-resolution path. These tests are the contract that closes the
 * 2026-06-07 night exercise's precheck-loop emission damage: the model can
 * pass only the 16-hex hash; the server re-hydrates the operator-supplied
 * bytes for citation matching.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  ValidateIrlProvenanceInputObject,
  ValidateIrlProvenanceInputSchema,
} from '../../../src/schemas/validate-irl-provenance';
import { handleValidateIrlProvenanceTool } from '../../../src/tools/validate-irl-provenance';
import { InMemoryIrlBodyCache } from '../../../src/cache/irl-body-cache';
import { Bl076BodyCacheMissError } from '../../../src/schemas/compose-dossier-envelope';
import type { MetricsContext } from '../../../src/metrics/_index';

const SAMPLE_IRL = `# Information Request List — Acme (returned, 2026-06-03)

## 00 — Basics

- Annual recurring revenue: $45.2M Q1-FY26 annualized; $31.4M trailing 12 months
- Geographies: US (East Coast, Texas, California), EU (Germany, France, Netherlands)
- Total headcount: 187 today; 121 twelve months ago

## 02 — Software Architecture

- Engineering FTE count: 58 total — 38 product, 8 SRE, 3 security, 7 data, 2 platform
- Stack: TypeScript Node 22, Python 3.12, Aurora Postgres 15, Redshift on AWS
`;

const SAMPLE_HASH = createHash('sha256').update(SAMPLE_IRL).digest('hex').slice(0, 16);

const SAMPLE_CITATIONS = [
  { path: 'sec-A.headline', citation: 'Section 00 — Annual recurring revenue: $45.2M' },
];

function noopMetrics(cache?: InMemoryIrlBodyCache): MetricsContext {
  return {
    sink: { write: () => undefined },
    ...(cache ? { irlBodyCache: cache } : {}),
  };
}

describe('BL-079 — ValidateIrlProvenanceInputSchema cross-field rule', () => {
  it('accepts `{ irlBodyHash, citations }` alone (body-by-hash mode)', () => {
    const result = ValidateIrlProvenanceInputSchema.safeParse({
      irlBodyHash: SAMPLE_HASH,
      citations: SAMPLE_CITATIONS,
    });
    expect(result.success).toBe(true);
  });

  it('accepts `{ filledIrl, citations }` alone (legacy mode)', () => {
    const result = ValidateIrlProvenanceInputSchema.safeParse({
      filledIrl: SAMPLE_IRL,
      citations: SAMPLE_CITATIONS,
    });
    expect(result.success).toBe(true);
  });

  it('accepts both fields (legacy + body-by-hash; filledIrl precedence)', () => {
    const result = ValidateIrlProvenanceInputSchema.safeParse({
      filledIrl: SAMPLE_IRL,
      irlBodyHash: SAMPLE_HASH,
      citations: SAMPLE_CITATIONS,
    });
    expect(result.success).toBe(true);
  });

  it('rejects when neither filledIrl nor irlBodyHash is supplied', () => {
    const result = ValidateIrlProvenanceInputSchema.safeParse({
      citations: SAMPLE_CITATIONS,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toMatch(/at least one of/i);
    }
  });

  it('rejects irlBodyHash that does not match the 16-hex regex', () => {
    const result = ValidateIrlProvenanceInputSchema.safeParse({
      irlBodyHash: 'not-a-hash',
      citations: SAMPLE_CITATIONS,
    });
    expect(result.success).toBe(false);
  });

  it('rejects irlBodyHash with wrong length (too long)', () => {
    const result = ValidateIrlProvenanceInputSchema.safeParse({
      irlBodyHash: 'a'.repeat(17),
      citations: SAMPLE_CITATIONS,
    });
    expect(result.success).toBe(false);
  });

  it('rejects irlBodyHash with uppercase hex (canonical lowercase only)', () => {
    const result = ValidateIrlProvenanceInputSchema.safeParse({
      irlBodyHash: SAMPLE_HASH.toUpperCase(),
      citations: SAMPLE_CITATIONS,
    });
    expect(result.success).toBe(false);
  });
});

describe('BL-079 — ValidateIrlProvenanceInputObject `.shape` exposure', () => {
  it('exposes both filledIrl and irlBodyHash as optional fields for MCP registerTool', () => {
    // The underlying ZodObject's `.shape` is what `registerTool` consumes
    // for the published inputSchema. Both fields MUST be present and
    // optional so the slash-command form does not mark them required.
    const shape = ValidateIrlProvenanceInputObject.shape;
    expect(shape.filledIrl.isOptional()).toBe(true);
    expect(shape.irlBodyHash.isOptional()).toBe(true);
    // `citations` stays required.
    expect(shape.citations.isOptional()).toBe(false);
  });
});

describe('BL-079 — handleValidateIrlProvenanceTool cache-resolution path', () => {
  it('resolves irlBodyHash via cache and runs citation matching against re-hydrated body', async () => {
    const cache = new InMemoryIrlBodyCache();
    await cache.set(SAMPLE_HASH, SAMPLE_IRL);
    const result = await handleValidateIrlProvenanceTool(
      {
        irlBodyHash: SAMPLE_HASH,
        citations: SAMPLE_CITATIONS,
      },
      noopMetrics(cache)
    );
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.total).toBe(1);
    expect(structured.verified).toBe(1);
  });

  it('returns Bl076BodyCacheMissError isError when irlBodyHash supplied but cache misses', async () => {
    const cache = new InMemoryIrlBodyCache();
    // Note: cache is empty — hash will miss.
    const result = await handleValidateIrlProvenanceTool(
      {
        irlBodyHash: SAMPLE_HASH,
        citations: SAMPLE_CITATIONS,
      },
      noopMetrics(cache)
    );
    expect(result.isError).toBe(true);
    const text = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
    expect(text).toMatch(/body-cache miss/);
    expect(text).toMatch(SAMPLE_HASH);
    // BL-090: the retry directive is preserved verbatim AND mirrored structurally.
    expect(result.structuredContent).toMatchObject({ error: 'cache-miss', message: text });
  });

  // BL-090 — this guard's prose names both remediation paths and had no test.
  // It is a directive the model is expected to act on, so pin the text, not just
  // the reason.
  it('missing both filledIrl and irlBodyHash returns a directive naming both paths', async () => {
    const result = await handleValidateIrlProvenanceTool(
      { citations: SAMPLE_CITATIONS } as never,
      noopMetrics(new InMemoryIrlBodyCache())
    );

    expect(result.isError).toBe(true);
    const text = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
    expect(text).toContain('at least one of `filledIrl` / `irlBodyHash` MUST be supplied');
    expect(text).toContain('prepare_irl_body');
    expect(text).toContain('Legacy path');
    expect(result.structuredContent).toMatchObject({ error: 'invalid-input', message: text });
  });

  it('prefers filledIrl when both fields are supplied (legacy precedence)', async () => {
    const cache = new InMemoryIrlBodyCache();
    // Seed cache with DIFFERENT bytes than filledIrl, then assert the
    // verdict matches filledIrl's body — proving filledIrl was used, not
    // the cache.
    await cache.set(SAMPLE_HASH, '# DIFFERENT BODY — citation should NOT match here.');
    const result = await handleValidateIrlProvenanceTool(
      {
        filledIrl: SAMPLE_IRL,
        irlBodyHash: SAMPLE_HASH,
        citations: SAMPLE_CITATIONS,
      },
      noopMetrics(cache)
    );
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.verified).toBe(1);
  });

  it('returns structured isError when neither field is supplied (defense-in-depth past the SDK shape check)', async () => {
    const result = await handleValidateIrlProvenanceTool(
      // Bypass the schema refine — simulate the SDK letting through a
      // payload that only matches the per-field shape (which has both
      // fields optional). Handler must catch this and return isError.
      { citations: SAMPLE_CITATIONS } as Parameters<typeof handleValidateIrlProvenanceTool>[0],
      noopMetrics()
    );
    expect(result.isError).toBe(true);
    const text = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
    expect(text).toMatch(/at least one of/i);
  });

  it('Bl076BodyCacheMissError is the canonical class — instanceof check holds', () => {
    const err = new Bl076BodyCacheMissError(SAMPLE_HASH);
    expect(err).toBeInstanceOf(Bl076BodyCacheMissError);
    expect(err.irlBodyHash).toBe(SAMPLE_HASH);
  });
});
