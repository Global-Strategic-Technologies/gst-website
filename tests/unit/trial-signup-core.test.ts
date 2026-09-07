/**
 * Pure helpers behind /hub/mcp/trial/ (BL-155 Slice 3). The DOM wiring is
 * covered end-to-end in tests/e2e/hub-mcp-trial.test.ts; this pins the
 * response classification, the saved-flip rule, and the download shape.
 */
import {
  buildDownload,
  classifyMintResponse,
  copySaves,
  DEFAULT_RETRY_SECONDS,
  fill,
  formatUtc,
  mcpCallSnippet,
  splitCredential,
  tokenExchangeSnippet,
} from '@/utils/trial-signup-core';

const ID = 'm2m_Xk3pQ9rT2vB7nM4wL8sD1g';
const SECRET = '9fJ2kP5mR8vT1xW4zA7cE0hN3qU6yB9dG2iK5oL8sV1a';
const EXPIRES = '2026-09-10T21:17:28.969Z';

describe('splitCredential', () => {
  it('splits on the FIRST colon only (a secret may contain colons)', () => {
    expect(splitCredential(`${ID}:a:b`)).toEqual({ clientId: ID, secret: 'a:b' });
  });
  it('rejects a value with no colon, a leading colon, or nothing after it', () => {
    expect(splitCredential(ID)).toBeNull();
    expect(splitCredential(`:${SECRET}`)).toBeNull();
    expect(splitCredential(`${ID}:`)).toBeNull();
  });
});

describe('classifyMintResponse — the wire contract of POST /trial/signup', () => {
  it('200 → issued, carrying the split pair and the optional prior issue date', () => {
    const fresh = classifyMintResponse(200, {
      credential: `${ID}:${SECRET}`,
      clientId: ID,
      expiresAt: EXPIRES,
      reissued: false,
    });
    expect(fresh).toEqual({
      kind: 'issued',
      credential: `${ID}:${SECRET}`,
      clientId: ID,
      secret: SECRET,
      expiresAt: EXPIRES,
      reissued: false,
    });
    const again = classifyMintResponse(200, {
      credential: `${ID}:${SECRET}`,
      expiresAt: EXPIRES,
      reissued: true,
      issuedAt: '2026-09-07T21:17:28.969Z',
    });
    expect(again).toMatchObject({
      kind: 'issued',
      reissued: true,
      issuedAt: '2026-09-07T21:17:28.969Z',
    });
  });

  it('a 200 with a malformed credential is unavailable, never a half-issued state', () => {
    expect(classifyMintResponse(200, { credential: 'nocolon', expiresAt: EXPIRES })).toEqual({
      kind: 'err-unavail',
    });
  });

  it('400 challenge-failed → bot check failed (retryable either way on the page)', () => {
    expect(classifyMintResponse(400, { error: 'challenge-failed', retryable: true })).toEqual({
      kind: 'err-bot',
    });
    expect(classifyMintResponse(400, { error: 'challenge-failed', retryable: false })).toEqual({
      kind: 'err-bot',
    });
  });

  it('403 trial-expired → expired, with the issue date when the record still exists', () => {
    expect(classifyMintResponse(403, { error: 'trial-expired', issuedAt: EXPIRES })).toEqual({
      kind: 'err-expired',
      issuedAt: EXPIRES,
    });
    expect(classifyMintResponse(403, { error: 'trial-expired' })).toEqual({ kind: 'err-expired' });
  });

  it('409 and 429 → rate-limited, reading the wait from the body (Retry-After is not CORS-exposed)', () => {
    expect(classifyMintResponse(409, { error: 'in-progress', retryAfterSeconds: 5 })).toEqual({
      kind: 'err-rate',
      retryAfterSeconds: 5,
    });
    expect(classifyMintResponse(429, { error: 'rate-limited', retryAfterSeconds: 42.2 })).toEqual({
      kind: 'err-rate',
      retryAfterSeconds: 43,
    });
    expect(classifyMintResponse(429, { error: 'rate-limited' })).toEqual({
      kind: 'err-rate',
      retryAfterSeconds: DEFAULT_RETRY_SECONDS,
    });
  });

  it.each([
    [400, { error: 'bad-request' }],
    [503, { error: 'unavailable' }],
    [500, null],
    [0, null],
  ])('%s with %j → unavailable', (status, body) => {
    expect(classifyMintResponse(status, body)).toEqual({ kind: 'err-unavail' });
  });
});

describe('copySaves — `saved` flips only when the secret leaves the page', () => {
  it.each(['key', 'secret', 'both', 'tok'] as const)('%s saves', (what) => {
    expect(copySaves(what)).toBe(true);
  });
  it.each(['id', 'call'] as const)('%s does NOT save', (what) => {
    expect(copySaves(what)).toBe(false);
  });
});

describe('buildDownload', () => {
  it('connector: the consent key plus the halves, the guide URL, flow and tier', () => {
    expect(buildDownload('connector', ID, SECRET, EXPIRES)).toEqual({
      consent_key: `${ID}:${SECRET}`,
      client_id: ID,
      client_secret: SECRET,
      expires_at: EXPIRES,
      mcp_url: 'https://mcp.globalstrategic.tech/mcp',
      flow: 'connector',
      guide_url: 'https://globalstrategic.tech/hub/mcp/get-started/',
      tier: 'trial',
    });
  });
  it('m2m: the pair, the token endpoint and the grant type', () => {
    expect(buildDownload('m2m', ID, SECRET, EXPIRES)).toEqual({
      client_id: ID,
      client_secret: SECRET,
      expires_at: EXPIRES,
      mcp_url: 'https://mcp.globalstrategic.tech/mcp',
      token_url: 'https://mcp.globalstrategic.tech/token',
      grant_type: 'client_credentials',
      flow: 'm2m',
      tier: 'trial',
    });
  });
});

describe('formatting and snippets', () => {
  it('formatUtc renders in UTC with a literal suffix, and tolerates garbage', () => {
    const out = formatUtc(EXPIRES, 'en');
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/21:17/);
    expect(out.endsWith(' UTC')).toBe(true);
    expect(formatUtc('not a date', 'en')).toBe('');
  });
  it('fill interpolates {name} and leaves unknown slots alone', () => {
    expect(fill('Retry in {s} s', { s: 30 })).toBe('Retry in 30 s');
    expect(fill('{a} {b}', { a: 'x' })).toBe('x {b}');
  });
  it('the token snippet interpolates the pair and states the wire token_type (`bearer`)', () => {
    const s = tokenExchangeSnippet(ID, SECRET);
    expect(s).toContain(`client_id=${ID}`);
    expect(s).toContain(`client_secret=${SECRET}`);
    expect(s).toContain('"token_type": "bearer"');
    expect(s).toContain('https://mcp.globalstrategic.tech/token');
  });
  it('the call snippet hits /mcp with the streamable-HTTP Accept header', () => {
    const s = mcpCallSnippet();
    expect(s).toContain('https://mcp.globalstrategic.tech/mcp');
    expect(s).toContain('Accept: application/json, text/event-stream');
    expect(s).toContain('"method":"tools/list"');
  });
});
