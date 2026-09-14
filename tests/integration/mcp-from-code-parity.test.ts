/**
 * From-code guide parity guard (`/hub/mcp/from-code/`, BL-156).
 *
 * The page documents the OAuth 2.1 `client_credentials` exchange for code a
 * visitor runs. Every fact it states about the wire is bound to server source
 * here, the way the trial and onboarding guards bind theirs: the endpoints,
 * the token lifetime, the exact expiry error string, the radar refusal code,
 * the trial ceilings, and the copy guardrails (no em dash, no docs subdomain).
 *
 * It also makes the stanza's prohibitions executable. BL-155's design brief
 * produced a mockup with `X-GST-Client-*` headers and a `claude_desktop_config`
 * block, neither of which exists (SELF_SERVE_TRIAL_BL-155.md § Scope). Those
 * strings failing here is the point: the page must never describe them.
 *
 * Deliberately NOT registered in `mcp-onboarding-parity.test.ts`: that guard's
 * "every snake_case token is a server name" rule fits guides that cite tools
 * and prompts, and this page cites OAuth vocabulary instead. The trial guard's
 * allowlist shape is reused below.
 */
import { extractAstroMarkup } from './helpers/astro-markup';
import {
  read,
  registeredPromptNames,
  registeredToolNames,
  SERVER_PATH,
} from './helpers/mcp-registry';

const CATALOGS = {
  en: JSON.parse(read('src/i18n/en/hub-mcp-from-code.json')) as Record<string, string>,
  es: JSON.parse(read('src/i18n/es/hub-mcp-from-code.json')) as Record<string, string>,
  'pt-BR': JSON.parse(read('src/i18n/pt-BR/hub-mcp-from-code.json')) as Record<string, string>,
};
const source = read('src/page-templates/HubMcpFromCodePage.astro');
const template = extractAstroMarkup(source);
const tokenSource = read('mcp-server/src/oauth/m2m-token.ts');
const catalogText = Object.values(CATALOGS).flatMap((c) => Object.values(c));

function catalogEntries(): Array<[string, string]> {
  return Object.entries(CATALOGS).flatMap(([code, catalog]) =>
    Object.entries(catalog).map(([key, value]) => [`${code}.${key}`, value] as [string, string])
  );
}

describe('from-code guide — published facts', () => {
  it('reads both endpoints from the trial core rather than restating them', () => {
    // The literals are pinned in mcp-trial-parity.test.ts; this page imports them.
    expect(source).toMatch(/import \{ MCP_URL, TOKEN_URL \} from '\.\.\/utils\/trial-signup-core'/);
    expect(source).toContain('${TOKEN_URL}');
    expect(source).toContain('${MCP_URL}');
  });

  it('states the token lifetime the server issues, in seconds and in prose', () => {
    const ttl = tokenSource.match(/export const M2M_TOKEN_TTL_S = (\d+);/);
    expect(ttl, 'M2M_TOKEN_TTL_S not found in m2m-token.ts').not.toBeNull();
    expect(Number(ttl![1])).toBe(3600);
    expect(source).toContain(`"expires_in": ${ttl![1]}`);
    expect(CATALOGS.en['token.response.body']).toContain('3600, one hour');
    expect(CATALOGS.en['lifecycle.hourly.body']).toContain('one hour');
    expect(CATALOGS.en['lifecycle.hourly.body']).toContain('no refresh token');
    expect(CATALOGS.en['token.response.body']).toContain('no refresh token');
  });

  it('quotes the expiry error exactly as the server emits it, in every locale', () => {
    const err = tokenSource.match(/tokenError\('invalid_client', '([^']+expired[^']*)'/);
    expect(err, 'expiry tokenError not found in m2m-token.ts').not.toBeNull();
    for (const [code, catalog] of Object.entries(CATALOGS)) {
      expect(catalog['token.expired.title'], code).toContain(`invalid_client: ${err![1]}`);
    }
  });

  it('states the wire token_type, which is lowercase `bearer`', () => {
    const wire = tokenSource.match(/token_type:\s*'([a-zA-Z]+)'/);
    expect(wire).not.toBeNull();
    expect(source).toContain(`"token_type": "${wire![1]}"`);
  });

  it('names the radar refusal code the tier gate returns', () => {
    const scopes = read('mcp-server/src/auth/scopes.ts');
    const code = scopes.match(/-32002/);
    expect(code, 'radar refusal code -32002 not found in scopes.ts').not.toBeNull();
    for (const [locale, catalog] of Object.entries(CATALOGS)) {
      expect(catalog['call.radar.body'], locale).toContain('-32002');
    }
  });

  it('states the trial ceilings and duration from tiers.ts, in every locale', () => {
    const tiers = read('mcp-server/src/ratelimit/tiers.ts');
    const m = tiers.match(/\btrial:\s*\{\s*perMinute:\s*(\d+),\s*perDay:\s*(\d+)/);
    expect(m, 'TIER_LIMITS.trial not found in tiers.ts').not.toBeNull();
    const ttl = tiers.match(/TRIAL_TTL_SECONDS = (\d+) \* 60 \* 60/);
    expect(ttl, 'TRIAL_TTL_SECONDS not found in tiers.ts').not.toBeNull();
    for (const [code, catalog] of Object.entries(CATALOGS)) {
      const fact = catalog['lifecycle.ceilings.body'];
      expect(fact, code).toContain(`${ttl![1]} `);
      expect(fact, code).toContain(` ${m![1]} `);
      expect(fact, code).toContain(` ${m![2]} `);
    }
  });

  it('sends the Accept header Streamable HTTP requires on the /mcp call', () => {
    expect(source).toContain('"Accept: application/json, text/event-stream"');
    expect(CATALOGS.en['call.intro']).toContain('text/event-stream');
  });

  it('reads the credential from the environment, never inline', () => {
    expect(source).toContain('"$GST_CLIENT_ID"');
    expect(source).toContain('"$GST_CLIENT_SECRET"');
    expect(source).toContain('Bearer $ACCESS_TOKEN"');
    expect(source).not.toMatch(/client_secret=[A-Za-z0-9]/);
  });

  it('a 429 carries Retry-After, as the page says', () => {
    expect(read('mcp-server/src/ratelimit/headers.ts')).toContain("'Retry-After'");
    expect(CATALOGS.en['lifecycle.ceilings.body']).toContain('Retry-After');
  });
});

describe('from-code guide — integrations that do not exist are not described', () => {
  // The two inventions from the BL-155 design brief, plus the invented prefix.
  const FORBIDDEN = ['X-GST-Client', 'claude_desktop_config', 'gst_trial_', 'gsk_live_'];

  it.each(FORBIDDEN)('%s appears nowhere in the template or any catalog', (needle) => {
    expect(source).not.toContain(needle);
    for (const [where, value] of catalogEntries()) {
      expect(value, where).not.toContain(needle);
    }
  });

  it('says out loud that the credential does not drive the desktop clients', () => {
    expect(CATALOGS.en['prereq.not.body']).toMatch(/does not drive Claude, Cursor or ChatGPT/);
    expect(CATALOGS.en['prereq.not.body']).toMatch(/no config-file or custom-header way/);
  });

  it('gives the literal token URL instead of telling the reader to discover the grant', () => {
    // The embedded provider's discovery document does not list client_credentials
    // (mcp-server/src/oauth/provider.ts), so the page must not send anyone there.
    expect(CATALOGS.en['token.intro']).toMatch(/does not list <code>client_credentials<\/code>/);
    expect(template).toContain('data-copy-kind="endpoint"');
  });
});

describe('from-code guide — cited names exist on the server', () => {
  // OAuth wire vocabulary is not a registration; everything else snake_case
  // must be a real tool or prompt.
  const NOT_SERVER_NAMES = new Set([
    'client_credentials',
    'client_secret_basic',
    'private_key_jwt',
    'access_token',
    'token_type',
    'expires_in',
    'client_id',
    'client_secret',
    'grant_type',
    'invalid_client',
    'event_stream',
  ]);
  const registered = new Set([...registeredPromptNames(), ...registeredToolNames(SERVER_PATH)]);
  const text = [...catalogText, source].join(' ');
  const all = [
    ...new Set([...text.matchAll(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g)].map((m) => m[0])),
  ];
  const cited = all.filter((n) => !NOT_SERVER_NAMES.has(n));

  it('the extraction finds a real token set (vacuity guard on the raw scan)', () => {
    expect(all.length).toBeGreaterThan(5);
    expect(all).toContain('client_credentials');
    expect(all).toContain('private_key_jwt');
  });

  for (const name of cited) {
    it(`${name} is registered`, () => {
      expect(registered.has(name), `${name} is cited but not registered`).toBe(true);
    });
  }
});

describe('from-code guide — copy guardrails', () => {
  it('carries no em dashes in any locale or in the template', () => {
    for (const [where, value] of catalogEntries()) {
      expect(value, where).not.toContain('—');
    }
    expect(template).not.toContain('—');
  });

  it('names no docs subdomain', () => {
    for (const [where, value] of catalogEntries()) {
      expect(value, where).not.toContain('docs.mcp.globalstrategic.tech');
    }
    expect(source).not.toContain('docs.mcp.globalstrategic.tech');
  });

  it('frames the ceilings as non-contractual, never as an SLA', () => {
    expect(CATALOGS.en['lifecycle.ceilings.body']).toContain('not an SLA');
  });

  it('links the request-access anchor that /hub/mcp/ actually has', () => {
    expect(read('src/page-templates/HubMcpPage.astro')).toContain('id="request-access"');
    expect(source).toContain('#request-access');
  });

  it('is the page the trial issued state and the connector guide link to', () => {
    expect(read('src/page-templates/HubMcpTrialPage.astro')).toContain(
      "localizedHref('/hub/mcp/from-code/', locale)"
    );
    expect(read('src/pages/hub/mcp/get-started/index.astro')).toContain(
      'href="/hub/mcp/from-code/"'
    );
  });
});
