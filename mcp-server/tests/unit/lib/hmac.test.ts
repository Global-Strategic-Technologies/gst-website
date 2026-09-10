/**
 * BL-155 Slice 2 — `hmacHex` against a known vector, and the `bytesToHex`
 * extraction did not change `sha256Hex`.
 */

import { describe, it, expect } from 'vitest';
import { hmacHex } from '../../../src/lib/hmac';
import { bytesToHex, sha256Hex } from '../../../src/lib/sha256';

describe('hmacHex', () => {
  it('matches the RFC 4231 test case 2 vector (key "Jefe")', async () => {
    expect(await hmacHex('Jefe', 'what do ya want for nothing?')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'
    );
  });

  it('different secrets give different digests for the same message', async () => {
    const a = await hmacHex('secret-a', '203.0.113.7');
    const b = await hmacHex('secret-b', '203.0.113.7');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('bytesToHex / sha256Hex', () => {
  it('encodes bytes as lowercase zero-padded hex', () => {
    expect(bytesToHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe('00010f10ff');
  });

  it('sha256Hex is unchanged by the extraction (known vector for "abc")', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
});
