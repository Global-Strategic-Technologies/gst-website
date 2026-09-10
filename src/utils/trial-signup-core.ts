/**
 * Pure helpers for the trial signup page (`/hub/mcp/trial/`, BL-155 Slice 3).
 *
 * Everything here is DOM-free so it runs under vitest's node pool:
 * classifying the mint response into a page state, splitting the credential,
 * building the download file, formatting the UTC expiry, and the two curl
 * snippets the "From code" flow shows. The DOM wiring lives in
 * `src/scripts/trial-signup.ts`.
 *
 * Wire contract (mcp-server/src/trial/signup.ts):
 *   200 { credential, clientId, expiresAt, reissued, issuedAt? }
 *   400 bad-request | 400 challenge-failed { retryable }
 *   403 trial-expired { issuedAt? }
 *   409 in-progress { retryAfterSeconds } | 429 rate-limited { retryAfterSeconds }
 *   503 unavailable
 * `Retry-After` is not CORS-exposed, so the wait rides in the body.
 */

export const MCP_URL = 'https://mcp.globalstrategic.tech/mcp';
export const TOKEN_URL = 'https://mcp.globalstrategic.tech/token';
export const GUIDE_URL = 'https://globalstrategic.tech/hub/mcp/get-started/';
export const DOWNLOAD_FILENAME = 'gst-mcp-trial-credentials.json';
/** The countdown when the server gives no wait (design: 30 s). */
export const DEFAULT_RETRY_SECONDS = 30;
/** The connector flow is the default: BL-155 ships first and a non-developer can finish it. */
export type Flow = 'connector' | 'm2m';

export type MintOutcome =
  | {
      kind: 'issued';
      credential: string;
      clientId: string;
      secret: string;
      expiresAt: string;
      reissued: boolean;
      /** The prior mint, on a re-issue (names the revoked credential's date). */
      issuedAt?: string;
    }
  | { kind: 'err-bot' }
  | { kind: 'err-rate'; retryAfterSeconds: number }
  | { kind: 'err-expired'; issuedAt?: string }
  | { kind: 'err-unavail' };

/** First colon only: client ids are base64url, secrets may contain colons. */
export function splitCredential(credential: string): { clientId: string; secret: string } | null {
  const i = credential.indexOf(':');
  if (i <= 0 || i === credential.length - 1) return null;
  return { clientId: credential.slice(0, i), secret: credential.slice(i + 1) };
}

/**
 * Map an HTTP status + parsed body to a page state. Anything the page cannot
 * name precisely (a 400 bad-request, a 5xx, a non-JSON body, a network error
 * — pass `null` body) is "unavailable": the visitor's recovery is the same.
 */
export function classifyMintResponse(status: number, body: unknown): MintOutcome {
  const b = (body ?? {}) as Record<string, unknown>;
  if (status === 200) {
    const credential = typeof b.credential === 'string' ? b.credential : '';
    const parts = splitCredential(credential);
    if (!parts || typeof b.expiresAt !== 'string') return { kind: 'err-unavail' };
    return {
      kind: 'issued',
      credential,
      clientId: parts.clientId,
      secret: parts.secret,
      expiresAt: b.expiresAt,
      reissued: b.reissued === true,
      ...(typeof b.issuedAt === 'string' ? { issuedAt: b.issuedAt } : {}),
    };
  }
  if (status === 400 && b.error === 'challenge-failed') return { kind: 'err-bot' };
  if (status === 403 && b.error === 'trial-expired') {
    return {
      kind: 'err-expired',
      ...(typeof b.issuedAt === 'string' ? { issuedAt: b.issuedAt } : {}),
    };
  }
  if (status === 409 || status === 429) {
    const n = typeof b.retryAfterSeconds === 'number' ? Math.ceil(b.retryAfterSeconds) : NaN;
    return {
      kind: 'err-rate',
      retryAfterSeconds: Number.isFinite(n) && n > 0 ? n : DEFAULT_RETRY_SECONDS,
    };
  }
  return { kind: 'err-unavail' };
}

/** Which copy actions count as "the secret left the page" (flips `saved`). */
export function copySaves(what: 'key' | 'id' | 'secret' | 'both' | 'tok' | 'call'): boolean {
  return what === 'key' || what === 'secret' || what === 'both' || what === 'tok';
}

/** The JSON the "Download .json" button writes — shape per the design README. */
export function buildDownload(
  flow: Flow,
  clientId: string,
  secret: string,
  expiresAt: string
): Record<string, string> {
  return flow === 'connector'
    ? {
        consent_key: `${clientId}:${secret}`,
        client_id: clientId,
        client_secret: secret,
        expires_at: expiresAt,
        mcp_url: MCP_URL,
        flow: 'connector',
        guide_url: GUIDE_URL,
        tier: 'trial',
      }
    : {
        client_id: clientId,
        client_secret: secret,
        expires_at: expiresAt,
        mcp_url: MCP_URL,
        token_url: TOKEN_URL,
        grant_type: 'client_credentials',
        flow: 'm2m',
        tier: 'trial',
      };
}

/**
 * "7 Sept 2026, 14:05 UTC" — medium date, short time, always UTC, 24h. The
 * page locale comes from `<html lang>`; the " UTC" suffix is literal in every
 * locale, as the design writes it.
 */
export function formatUtc(iso: string, lang: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return (
    new Intl.DateTimeFormat(lang || 'en', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
      hour12: false,
    }).format(d) + ' UTC'
  );
}

/** `{name}` interpolation, the same shape `src/i18n/t.ts` uses. */
export function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole
  );
}

/** Step 01: the token exchange, with the real pair interpolated. */
export function tokenExchangeSnippet(clientId: string, secret: string): string {
  // `token_type` is `bearer` on the wire (m2m-token.ts), not `Bearer`.
  return [
    `curl -s -X POST ${TOKEN_URL} \\`,
    '  -d grant_type=client_credentials \\',
    `  -d client_id=${clientId} \\`,
    `  -d client_secret=${secret}`,
    '',
    '# { "access_token": "mcp_m2m_...", "token_type": "bearer", "expires_in": 3600 }',
  ].join('\n');
}

/** Step 02: the authenticated smoke-test call. */
export function mcpCallSnippet(): string {
  return [
    `curl -s -X POST ${MCP_URL} \\`,
    '  -H "Authorization: Bearer $ACCESS_TOKEN" \\',
    '  -H "Content-Type: application/json" \\',
    '  -H "Accept: application/json, text/event-stream" \\',
    `  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
  ].join('\n');
}
