/**
 * BL-068 — `prepare_irl_body` preflight tool tests.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';

import { handlePrepareIrlBodyTool } from '../../../src/tools/prepare-irl-body';
import { computeIrlBodyHash } from '../../../src/schemas/compose-dossier-envelope';

interface SuccessResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
  structuredContent?: { irlBodyHash: string; byteLength: number };
}

function makeBody(lengthChars: number, seed = 'x'): string {
  return seed.repeat(Math.max(1, lengthChars));
}

describe('handlePrepareIrlBodyTool', () => {
  it('returns the canonical irlBodyHash matching computeIrlBodyHash', async () => {
    const body = makeBody(500, 'a');
    const result = (await handlePrepareIrlBodyTool({ filledIrl: body })) as SuccessResult;
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent?.irlBodyHash).toBe(computeIrlBodyHash(body));
  });

  it('hash is 16 hex characters', async () => {
    const body = makeBody(500, 'b');
    const result = (await handlePrepareIrlBodyTool({ filledIrl: body })) as SuccessResult;
    expect(result.structuredContent?.irlBodyHash).toMatch(/^[a-f0-9]{16}$/);
  });

  it('hash matches sha256(body).slice(0,16) (byte-for-byte, no normalization)', async () => {
    const body = makeBody(500, 'c');
    const expected = createHash('sha256').update(body).digest('hex').slice(0, 16);
    const result = (await handlePrepareIrlBodyTool({ filledIrl: body })) as SuccessResult;
    expect(result.structuredContent?.irlBodyHash).toBe(expected);
  });

  it('returns byteLength matching UTF-8 byte length', async () => {
    // Mix ASCII + multibyte chars to make byteLength != string length.
    const body = 'header ' + 'é'.repeat(250) + ' tail'.padEnd(200, '.');
    const expectedBytes = Buffer.byteLength(body, 'utf8');
    const result = (await handlePrepareIrlBodyTool({ filledIrl: body })) as SuccessResult;
    expect(result.structuredContent?.byteLength).toBe(expectedBytes);
  });

  it('determinism: same input → same hash across N invocations', async () => {
    const body = makeBody(500, 'd');
    const hashes = await Promise.all(
      Array.from({ length: 5 }, () =>
        handlePrepareIrlBodyTool({ filledIrl: body }).then(
          (r) => (r as SuccessResult).structuredContent?.irlBodyHash
        )
      )
    );
    expect(new Set(hashes).size).toBe(1);
  });

  it('different bodies produce different hashes', async () => {
    const body1 = makeBody(500, 'e');
    const body2 = makeBody(500, 'f');
    const r1 = (await handlePrepareIrlBodyTool({ filledIrl: body1 })) as SuccessResult;
    const r2 = (await handlePrepareIrlBodyTool({ filledIrl: body2 })) as SuccessResult;
    expect(r1.structuredContent?.irlBodyHash).not.toBe(r2.structuredContent?.irlBodyHash);
  });

  it('returns structuredContent (typed result) AND text-rendered JSON content', async () => {
    const body = makeBody(500, 'g');
    const result = (await handlePrepareIrlBodyTool({ filledIrl: body })) as SuccessResult;
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.irlBodyHash).toBe(result.structuredContent?.irlBodyHash);
    expect(parsed.byteLength).toBe(result.structuredContent?.byteLength);
  });
});
