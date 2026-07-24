/**
 * BL-033 Slice 2 — unit tests for the M2M token machinery: HS256
 * self-contained token sign/verify (expiry, audience, tamper), RFC 7523
 * ES256 client-assertion verification against an inline JWKS, and the
 * client-record secret hashing/scope-subset helpers.
 *
 * Runs in the Node pool — WebCrypto (globalThis.crypto.subtle) is
 * available in Node 22, same surface the Worker uses.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  canonicalAudience,
  signM2mToken,
  verifyClientAssertion,
  verifyM2mTokenClaims,
  M2M_TOKEN_PREFIX,
  type M2mTokenClaims,
} from '../../../src/oauth/m2m-token';
import { sha256Hex, verifyM2mSecret, type M2mClientRecord } from '../../../src/oauth/m2m-clients';

const SIGNING_KEY = 'unit-test-signing-key-32-bytes-xx';
const AUD = 'https://mcp.test/mcp';

function claims(overrides: Partial<M2mTokenClaims> = {}): M2mTokenClaims {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'https://mcp.test',
    sub: 'm2m_abc',
    aud: AUD,
    scope: 'tool:* resource:regulations:read',
    keyOwner: 'M2M:ACME',
    exp: now + 3600,
    iat: now,
    jti: 'jti-1',
    ...overrides,
  };
}

describe('M2M self-contained token', () => {
  it('round-trips: sign → verify → claims (prefix + scopes intact)', async () => {
    const token = await signM2mToken(claims(), SIGNING_KEY);
    expect(token.startsWith(M2M_TOKEN_PREFIX)).toBe(true);
    const verified = await verifyM2mTokenClaims(token, SIGNING_KEY, AUD);
    expect(verified).not.toBeNull();
    expect(verified!.keyOwner).toBe('M2M:ACME');
    expect(verified!.scope).toBe('tool:* resource:regulations:read');
  });

  it('rejects an expired token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signM2mToken(claims({ exp: now - 10 }), SIGNING_KEY);
    expect(await verifyM2mTokenClaims(token, SIGNING_KEY, AUD)).toBeNull();
  });

  it('rejects a wrong audience (RFC 8707 discipline)', async () => {
    const token = await signM2mToken(claims(), SIGNING_KEY);
    expect(await verifyM2mTokenClaims(token, SIGNING_KEY, 'https://other.test/mcp')).toBeNull();
  });

  it('rejects a tampered payload (signature binds the claims)', async () => {
    const token = await signM2mToken(claims(), SIGNING_KEY);
    const [h, p, s] = token.slice(M2M_TOKEN_PREFIX.length).split('.') as [string, string, string];
    const tampered = JSON.parse(Buffer.from(p, 'base64url').toString());
    tampered.scope = 'tool:* resource:radar:read';
    const forged = `${M2M_TOKEN_PREFIX}${h}.${Buffer.from(JSON.stringify(tampered)).toString('base64url')}.${s}`;
    expect(await verifyM2mTokenClaims(forged, SIGNING_KEY, AUD)).toBeNull();
  });

  it('rejects a token signed with a different key (rotation = mass revocation)', async () => {
    const token = await signM2mToken(claims(), 'rotated-key-different-value-here');
    expect(await verifyM2mTokenClaims(token, SIGNING_KEY, AUD)).toBeNull();
  });

  it('canonicalAudience is origin + /mcp', () => {
    expect(canonicalAudience('https://mcp.globalstrategic.tech')).toBe(
      'https://mcp.globalstrategic.tech/mcp'
    );
  });
});

describe('RFC 7523 client assertion (ES256, inline JWKS)', () => {
  let privateKey: CryptoKey;
  let publicJwk: JsonWebKey;

  beforeAll(async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ]);
    privateKey = pair.privateKey;
    publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  });

  function b64url(bytes: Uint8Array | Buffer): string {
    return Buffer.from(bytes).toString('base64url');
  }

  async function mintAssertion(payload: Record<string, unknown>): Promise<string> {
    const header = b64url(Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })));
    const body = b64url(Buffer.from(JSON.stringify(payload)));
    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      new TextEncoder().encode(`${header}.${body}`)
    );
    return `${header}.${body}.${b64url(new Uint8Array(sig))}`;
  }

  const now = () => Math.floor(Date.now() / 1000);

  it('accepts a valid short-lived assertion aimed at this AS', async () => {
    const assertion = await mintAssertion({
      iss: 'm2m_abc',
      sub: 'm2m_abc',
      aud: 'https://mcp.test/token',
      iat: now(),
      exp: now() + 120,
      jti: 'a-1',
    });
    const verified = await verifyClientAssertion(
      assertion,
      { keys: [publicJwk as never] },
      'https://mcp.test'
    );
    expect(verified).not.toBeNull();
    expect(verified!.iss).toBe('m2m_abc');
  });

  it('rejects an expired assertion', async () => {
    const assertion = await mintAssertion({
      iss: 'm2m_abc',
      sub: 'm2m_abc',
      aud: 'https://mcp.test/token',
      iat: now() - 400,
      exp: now() - 100,
    });
    expect(
      await verifyClientAssertion(assertion, { keys: [publicJwk as never] }, 'https://mcp.test')
    ).toBeNull();
  });

  it('rejects an over-long lifetime (max 5 minutes by contract)', async () => {
    const assertion = await mintAssertion({
      iss: 'm2m_abc',
      sub: 'm2m_abc',
      aud: 'https://mcp.test/token',
      iat: now(),
      exp: now() + 3600,
    });
    expect(
      await verifyClientAssertion(assertion, { keys: [publicJwk as never] }, 'https://mcp.test')
    ).toBeNull();
  });

  it('rejects an assertion aimed at a different AS', async () => {
    const assertion = await mintAssertion({
      iss: 'm2m_abc',
      sub: 'm2m_abc',
      aud: 'https://elsewhere.test/token',
      iat: now(),
      exp: now() + 120,
    });
    expect(
      await verifyClientAssertion(assertion, { keys: [publicJwk as never] }, 'https://mcp.test')
    ).toBeNull();
  });

  it('rejects a signature from a key outside the registered JWKS', async () => {
    const stranger = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
    ]);
    const header = b64url(Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })));
    const body = b64url(
      Buffer.from(
        JSON.stringify({
          iss: 'm2m_abc',
          sub: 'm2m_abc',
          aud: 'https://mcp.test/token',
          iat: now(),
          exp: now() + 120,
        })
      )
    );
    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      stranger.privateKey,
      new TextEncoder().encode(`${header}.${body}`)
    );
    const assertion = `${header}.${body}.${b64url(new Uint8Array(sig))}`;
    expect(
      await verifyClientAssertion(assertion, { keys: [publicJwk as never] }, 'https://mcp.test')
    ).toBeNull();
  });
});

describe('M2M client record helpers', () => {
  it('secret verification is hash-compare (constant-time over hex)', async () => {
    const record: M2mClientRecord = {
      clientId: 'm2m_x',
      name: 'acme',
      secretHash: await sha256Hex('the-real-secret'),
      allowedScopes: ['tool:*'],
      tier: 'free-pilot',
      createdAt: new Date().toISOString(),
    };
    expect(await verifyM2mSecret(record, 'the-real-secret')).toBe(true);
    expect(await verifyM2mSecret(record, 'the-real-secreT')).toBe(false);
    expect(await verifyM2mSecret(record, '')).toBe(false);
  });
});
