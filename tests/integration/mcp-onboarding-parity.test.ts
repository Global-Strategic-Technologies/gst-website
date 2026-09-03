/**
 * MCP onboarding-guide parity guard.
 *
 * The three `/hub/mcp/*` guide pages publish server facts a reader will act
 * on: the prompt count, the sweep's engine count and fill-ratio halt rule, the
 * endpoint and status hostnames, and a roster of prompt/tool names. All of
 * that is owned by `mcp-server` source, so this suite binds the published copy
 * to that source the same way `mcp-marketing-parity.test.ts` does for the
 * marketing page — drift fails here instead of on a practitioner's screen.
 *
 * Deliberately NOT a `PAGE_PATH` extension of the marketing suite: its
 * tier-table, catalog-shape, and no-percentage pins are marketing-claim
 * guards that do not fit guide copy (the fill-ratio rule IS a percentage).
 * The guardrails that do carry over — no em dashes (operator preference,
 * extended to these pages 2026-08-27), no docs subdomain — are restated here.
 */
import { existsSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { extractAstroMarkup } from './helpers/astro-markup';
import {
  EXPECTED_PROMPT_COUNT,
  irlCompletenessCheckText,
  read,
  registeredPromptNames,
  registeredToolNames,
  SERVER_PATH,
  sweepOrchestratedToolNames,
} from './helpers/mcp-registry';

const PAGES = {
  getStarted: 'src/pages/hub/mcp/get-started/index.astro',
  using: 'src/pages/hub/mcp/using/index.astro',
  advanced: 'src/pages/hub/mcp/advanced-operations/index.astro',
} as const;

const markup = Object.fromEntries(
  Object.entries(PAGES).map(([key, path]) => [key, extractAstroMarkup(read(path))])
) as Record<keyof typeof PAGES, string>;

const allMarkup = Object.values(markup).join(' ');
const prompts = registeredPromptNames();
const tools = registeredToolNames(SERVER_PATH);

/**
 * The guides publish counts as words ("twelve prompts", "nine engines"), so
 * the pin has to translate the source count. A count outside this map is
 * itself a finding: the copy needs rewriting, not just a number swap.
 */
const NUMBER_WORDS: Record<number, string> = {
  8: 'eight',
  9: 'nine',
  10: 'ten',
  11: 'eleven',
  12: 'twelve',
  13: 'thirteen',
};

describe('MCP onboarding pages — extraction sanity', () => {
  it('reads a non-empty markup region for every page', () => {
    for (const [key, text] of Object.entries(markup)) {
      expect(text.length, key).toBeGreaterThan(1000);
      expect(text, key).not.toContain('import BaseLayout'); // frontmatter stripped
      expect(text, key).not.toContain('grid-template-columns'); // <style> stripped
    }
  });
});

describe('MCP onboarding pages — published counts', () => {
  it('publishes the registered prompt count, as a word, wherever it counts prompts', () => {
    const word = NUMBER_WORDS[EXPECTED_PROMPT_COUNT];
    expect(word, `no word for count ${EXPECTED_PROMPT_COUNT} — extend NUMBER_WORDS`).toBeDefined();
    expect(prompts).toHaveLength(EXPECTED_PROMPT_COUNT);
    // Get Started's verify step and Using's prompt-picker copy both count them.
    expect(markup.getStarted).toContain(`the ${word} GST prompts`);
    expect(markup.using).toContain(`The ${word} GST prompts`);
    expect(markup.using).toContain(`The ${word} entries prefixed`);
  });

  it('publishes the sweep engine count, as a word and a stat tile', () => {
    const engines = sweepOrchestratedToolNames();
    expect(engines.length).toBeGreaterThan(0); // probe is live, not vacuous
    const word = NUMBER_WORDS[engines.length];
    expect(word, `no word for count ${engines.length} — extend NUMBER_WORDS`).toBeDefined();
    expect(markup.advanced).toContain(`${word} GST engines`);
    expect(markup.advanced).toMatch(new RegExp(`brutal-stat-tile__value">${engines.length}</div>`));
    // Every engine the sweep drives is a registered remote tool.
    expect(engines.filter((name) => !tools.includes(name))).toEqual([]);
  });

  it('publishes the regulation-corpus count from the data directory', () => {
    const regulationCount = readdirSync(resolve('src/data/regulatory-map')).filter((f) =>
      f.endsWith('.json')
    ).length;
    expect(regulationCount).toBeGreaterThan(0);
    expect(markup.using).toContain(`${regulationCount} regulatory records`);
    expect(markup.using).toContain(`${regulationCount} of them`);
  });
});

describe('MCP onboarding pages — sweep fill-ratio rule', () => {
  const rule = irlCompletenessCheckText();

  it('the source halt rule still has both arms', () => {
    // Zero substantive cells OR ratio below the threshold. The page states the
    // ratio arm; if either arm changes shape here, the copy needs re-auditing.
    expect(rule).toContain('`substantiveCells` is 0');
    expect(rule).toMatch(/below \d+%/);
    expect(rule).toContain('Otherwise ALWAYS proceed');
  });

  it('the page states the same threshold and section basis', () => {
    const threshold = rule.match(/below (\d+)%/)![1];
    expect(markup.advanced).toContain(`Under ${threshold}%`);
    // Ratio is computed over the ten canonical sections 00–09 only.
    expect(rule).toContain('00–09');
    expect(markup.advanced).toContain('(00–09)');
  });
});

describe('MCP onboarding pages — cited names exist on the server', () => {
  // Every snake_case identifier in the copy must be a registered prompt or
  // remote tool — a rename on the server strands the guide's instructions.
  // `client_credentials` is the OAuth 2.1 grant type, wire vocabulary rather
  // than a server registration.
  const NOT_SERVER_NAMES = new Set(['client_credentials']);
  const cited = [
    ...new Set([...allMarkup.matchAll(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g)].map((m) => m[0])),
  ].filter((name) => !NOT_SERVER_NAMES.has(name));

  it('the extraction finds a real citation set', () => {
    expect(cited.length).toBeGreaterThan(5);
  });

  it.each(cited.map((name) => [name] as const))('%s is registered', (name) => {
    const registered = new Set([...prompts, ...tools]);
    expect(registered.has(name), `${name} is cited but not registered`).toBe(true);
  });

  it('gst_irl_ingestion coexistence: the §04 callout assumes it is still registered', () => {
    // The Advanced Operations callout says the predecessor "remains registered
    // unchanged". The removal PR must rewrite that callout, and this is the
    // assertion that makes it do so loudly.
    expect(markup.advanced).toContain('gst_irl_ingestion');
    expect(prompts).toContain('gst_irl_ingestion');
  });
});

describe('MCP onboarding pages — supported clients and the consent page', () => {
  it('Get Started names both native-connector clients', () => {
    // The connector flow is the same on claude.ai and in Claude Desktop, and the
    // guide was widened to say so (2026-09-03). A rewrite that drops either name
    // silently narrows the published audience.
    expect(markup.getStarted).toContain('claude.ai');
    expect(markup.getStarted).toContain('Claude Desktop');
    // The sibling pages' cross-references widened with it.
    expect(markup.using).toContain('on the web or in Desktop');
  });

  it('quotes the consent page error string exactly as the Worker renders it', () => {
    // Step 03 tells the reader what a rejected key looks like. That sentence is
    // owned by the consent handler; a reword there must reach the page.
    const consent = read('mcp-server/src/oauth/consent.ts');
    const match = consent.match(/'(That MCP key was not recognized\.)'/);
    expect(match, 'consent.ts no longer carries the rejected-key message').not.toBeNull();
    expect(markup.getStarted).toContain(match![1]!.replace(/\.$/, ''));
  });

  it('ships the rendered consent still it embeds', () => {
    // `npm run media:consent-still` regenerates this from the same handler; the
    // page must never point at a file that is not in public/.
    const src = markup.getStarted.match(/src="(\/images\/hub\/mcp\/consent-page-still\.webp)"/);
    expect(src).not.toBeNull();
    expect(existsSync(resolve('public', src![1]!.slice(1)))).toBe(true);
  });
});

describe('MCP onboarding pages — hostnames and guardrails', () => {
  it('publishes the production endpoint and status hostnames', () => {
    expect(markup.getStarted).toContain('https://mcp.globalstrategic.tech/mcp');
    expect(markup.getStarted).toContain('status.mcp.globalstrategic.tech');
  });

  it('links no docs subdomain, since the reference has one published address', () => {
    // One public surface carries one published address. `/hub/mcp/docs/` is the
    // capability reference (ADR-0023); `docs.mcp.…` is a Worker-served 308 alias
    // to it, never a link target, because a second name in copy is how two
    // addresses drift apart. (The alias returns no document, so there is no
    // duplicate-canonical risk to appeal to — the reason is editorial.)
    for (const [key, text] of Object.entries(markup)) {
      expect(text, key).not.toContain('docs.mcp.globalstrategic.tech');
    }
  });

  it('carries no em dashes (operator preference, extended to the guides 2026-08-27)', () => {
    for (const [key, text] of Object.entries(markup)) {
      expect(text, key).not.toContain('—');
    }
  });
});
