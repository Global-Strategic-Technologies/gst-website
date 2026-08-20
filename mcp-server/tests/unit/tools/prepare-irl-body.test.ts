/**
 * BL-068 — `prepare_irl_body` preflight tool tests.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';

import { handlePrepareIrlBodyTool } from '../../../src/tools/prepare-irl-body';
import { computeIrlBodyHash } from '../../../src/schemas/compose-dossier-envelope';
import { InMemoryIrlBodyProvenanceStore } from '../../../src/cache/irl-body-provenance';

interface SuccessResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
  structuredContent?: { irlBodyHash: string; byteLength: number; mintedAt?: string };
}

function makeBody(lengthChars: number, seed = 'x'): string {
  return seed.repeat(Math.max(1, lengthChars));
}

describe('handlePrepareIrlBodyTool', () => {
  // A POSITIVE pin on the output keys. Every other assertion in this file (and
  // the two integration call sites) reads a field through a cast, so omitting
  // one would fail nothing — the cast asserts the shape rather than checking
  // it. `mintedAt` is the field that most needs this: it is optional by
  // design, so its absence is indistinguishable from its removal unless the
  // key set is pinned where the provenance store IS bound.
  it('output keys are exactly {irlBodyHash, byteLength} when no provenance store is bound', async () => {
    const result = (await handlePrepareIrlBodyTool({
      filledIrl: makeBody(500, 'k'),
    })) as SuccessResult;
    expect(Object.keys(result.structuredContent as object).sort()).toEqual([
      'byteLength',
      'irlBodyHash',
    ]);
  });

  it('output keys gain mintedAt when a provenance store IS bound', async () => {
    const result = (await handlePrepareIrlBodyTool(
      { filledIrl: makeBody(500, 'm') },
      {
        sink: { write: () => undefined },
        irlBodyProvenance: new InMemoryIrlBodyProvenanceStore(),
      }
    )) as SuccessResult;
    expect(Object.keys(result.structuredContent as object).sort()).toEqual([
      'byteLength',
      'irlBodyHash',
      'mintedAt',
    ]);
    expect((result.structuredContent as { mintedAt?: string }).mintedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T/
    );
  });

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

  // BL-090 replaces this test's original premise. It used to assert the payload
  // was sent TWICE — parsing `content[0].text` as JSON and checking it matched
  // `structuredContent` field-for-field. That duplication is exactly what BL-090
  // removed (a live probe showed clients discard `content` when
  // `structuredContent` is present, so the second copy reached nobody). What is
  // pinned now is the replacement contract: payload in the structured channel,
  // a human caption — never JSON — in the model channel.
  it('sends the payload once: structuredContent carries it, content carries a caption', async () => {
    const body = makeBody(500, 'g');
    const result = (await handlePrepareIrlBodyTool({ filledIrl: body })) as SuccessResult;

    expect(result.structuredContent?.irlBodyHash).toMatch(/^[0-9a-f]{16}$/);
    expect(result.structuredContent?.byteLength).toBe(Buffer.byteLength(body, 'utf8'));

    // BL-108: block 0 stays the one-line caption (no JSON, no newlines — several
    // callers surface it verbatim); block 1 is the serialized payload. ADR-0002 is
    // unaffected: the IRL body itself never enters this payload, only its hash and
    // byte length, so the text mirror cannot put the body back on the emit path.
    expect(result.content).toHaveLength(2);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).not.toMatch(/^\s*\{/);
    expect(result.content[0].text).not.toContain('\n');
    expect(result.content[0].text).toMatch(/IRL body hashed/);
    expect(JSON.parse(result.content[1].text)).toEqual(result.structuredContent);
    expect(result.content[1].text).not.toContain(body);
  });
});
