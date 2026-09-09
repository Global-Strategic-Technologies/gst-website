/**
 * Trial signup page parity guard (`/hub/mcp/trial/`, BL-155 Slice 3).
 *
 * The facts this page states are bound to server source the same way the
 * marketing and onboarding guards bind theirs: the tool count, the ceilings,
 * the cited identifiers, the hostnames, and the copy guardrails (no em dash,
 * no docs subdomain).
 *
 * This page is no longer the only public description of the `trial` tier. Until
 * 2026-09-08 the trial was deliberately kept off the marketing tier table; it
 * is now that table's FIRST column, because the self-serve trial replaced the
 * retired `free-pilot` as the public entry offering. Both surfaces state the
 * ceilings, so both are pinned to `TIER_LIMITS.trial` — here, and in
 * `mcp-marketing-parity.test.ts`.
 *
 * The design handoff shipped the FREE-PILOT ceilings (30/300) under the trial
 * heading; this guard is what turns that class of error into a red test
 * instead of a published overstatement.
 */
import { extractAstroMarkup } from './helpers/astro-markup';
import {
  EXPECTED_REMOTE_TOOL_COUNT,
  read,
  registeredPromptNames,
  registeredToolNames,
  SERVER_PATH,
} from './helpers/mcp-registry';

const CATALOGS = {
  en: JSON.parse(read('src/i18n/en/hub-mcp-trial.json')) as Record<string, string>,
  es: JSON.parse(read('src/i18n/es/hub-mcp-trial.json')) as Record<string, string>,
  'pt-BR': JSON.parse(read('src/i18n/pt-BR/hub-mcp-trial.json')) as Record<string, string>,
};
const source = read('src/page-templates/HubMcpTrialPage.astro');
const template = extractAstroMarkup(source);
const core = read('src/utils/trial-signup-core.ts');

/** `TIER_LIMITS.trial` read from source, the way the marketing guard reads its tiers. */
function trialCeilings(): { perMinute: number; perDay: number } {
  const src = read('mcp-server/src/ratelimit/tiers.ts');
  const m = src.match(/\btrial:\s*\{\s*perMinute:\s*(\d+),\s*perDay:\s*(\d+)/);
  expect(m, 'TIER_LIMITS.trial not found in tiers.ts').not.toBeNull();
  return { perMinute: Number(m![1]), perDay: Number(m![2]) };
}

const NUMBER_WORDS: Record<number, Record<keyof typeof CATALOGS, string>> = {
  16: { en: 'sixteen', es: 'dieciséis', 'pt-BR': 'dezesseis' },
};

describe('trial page — published facts', () => {
  it('states the trial ceilings, not another tier’s, in every locale', () => {
    const { perMinute, perDay } = trialCeilings();
    for (const [code, catalog] of Object.entries(CATALOGS)) {
      const fact = catalog['facts.ceilings.desc'];
      expect(fact, code).toMatch(new RegExp(`^${perMinute} `));
      expect(fact, code).toContain(` ${perDay} `);
    }
  });

  it('counts the tools as the registered remote count, as a word, in every locale', () => {
    const tools = registeredToolNames(SERVER_PATH);
    expect(tools).toHaveLength(EXPECTED_REMOTE_TOOL_COUNT);
    const words = NUMBER_WORDS[tools.length];
    expect(words, `no words for count ${tools.length} — extend NUMBER_WORDS`).toBeDefined();
    for (const [code, catalog] of Object.entries(CATALOGS)) {
      expect(catalog['facts.tools.desc'].toLowerCase(), code).toContain(
        words![code as keyof typeof CATALOGS]
      );
    }
  });

  it('says radar is excluded, since the tier gate refuses it', () => {
    expect(CATALOGS.en['facts.tools.desc']).toMatch(/Radar .* excluded/);
    expect(CATALOGS.en['cEndsBody']).toContain('Radar tools are refused');
  });

  it('publishes the production endpoint, token and status hostnames, and no docs subdomain', () => {
    expect(core).toContain("'https://mcp.globalstrategic.tech/mcp'");
    expect(core).toContain("'https://mcp.globalstrategic.tech/token'");
    // Hrefs are frontmatter constants, so read the source rather than the markup region.
    expect(source).toContain("'https://status.mcp.globalstrategic.tech/'");
    for (const [code, catalog] of Object.entries(CATALOGS)) {
      for (const [key, value] of Object.entries(catalog)) {
        expect(value, `${code}.${key}`).not.toContain('docs.mcp.globalstrategic.tech');
      }
    }
  });

  it('the token snippet states the wire token_type, which is lowercase `bearer`', () => {
    const token = read('mcp-server/src/oauth/m2m-token.ts');
    const wire = token.match(/token_type:\s*'([a-zA-Z]+)'/);
    expect(wire).not.toBeNull();
    expect(core).toContain(`"token_type": "${wire![1]}"`);
  });

  it('links the request-access anchor that /hub/mcp/ actually has', () => {
    const marketing = read('src/page-templates/HubMcpPage.astro');
    expect(marketing).toContain('id="request-access"');
    expect(source).toContain('#request-access');
  });
});

describe('trial page — cited names exist on the server', () => {
  // OAuth wire vocabulary and the `gst_` / `mcp_m2m_` prefixes are not
  // registrations; everything else snake_case must be a real tool or prompt.
  const NOT_SERVER_NAMES = new Set([
    'client_credentials',
    'access_token',
    'token_type',
    'expires_in',
    'client_id',
    'client_secret',
    'grant_type',
    'consent_key',
    'expires_at',
    'mcp_url',
    'token_url',
    'guide_url',
  ]);
  const registered = new Set([...registeredPromptNames(), ...registeredToolNames(SERVER_PATH)]);
  const text = [...Object.values(CATALOGS).flatMap((c) => Object.values(c)), core].join(' ');
  const all = [
    ...new Set([...text.matchAll(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g)].map((m) => m[0])),
  ];
  const cited = all.filter((n) => !NOT_SERVER_NAMES.has(n));

  it('the extraction finds a real token set (vacuity guard on the raw scan)', () => {
    // The page cites OAuth vocabulary today and no tool by name; the guard
    // exists for the day a tool IS named, so it must be shown to scan.
    expect(all.length).toBeGreaterThan(3);
    expect(all).toContain('client_credentials');
  });

  for (const name of cited) {
    it(`${name} is registered`, () => {
      expect(registered.has(name), `${name} is cited but not registered`).toBe(true);
    });
  }
});

describe('trial page — copy guardrails', () => {
  it('carries no em dashes in any locale or in the template', () => {
    for (const [code, catalog] of Object.entries(CATALOGS)) {
      for (const [key, value] of Object.entries(catalog)) {
        expect(value, `${code}.${key}`).not.toContain('—');
      }
    }
    expect(template).not.toContain('—');
  });

  it('frames the ceilings as non-contractual, never as an SLA', () => {
    expect(CATALOGS.en['facts.ceilings.desc']).toContain('not an SLA');
  });

  it('every state block and both flows are in the markup (the script only toggles)', () => {
    for (const state of ['idle', 'verifying', 'issued', 'error']) {
      expect(template).toContain(`data-state="${state}"`);
    }
    expect(template).toContain('data-flow-block="connector"');
    expect(template).toContain('data-flow-block="m2m"');
    expect(template).toContain('role="alert"');
    expect(template).toContain('aria-live="polite"');
  });
});
