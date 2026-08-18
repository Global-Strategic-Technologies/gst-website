/**
 * MCP marketing-page parity guard (BL-093 § Website marketing surface).
 *
 * `/hub/mcp/` is a public commitment surface: it publishes rate-limit ceilings,
 * a tool catalog, and two hostnames, all of which are owned by `mcp-server`
 * source rather than by the page. This suite binds the published copy to that
 * source so drift fails here instead of on a prospect's screen.
 *
 * It also pins the copy GUARDRAILS — the framings the page must carry and the
 * claims it must never make (no docs subdomain, which does not exist; no SLA
 * commitment or uptime figure, per the operator directive that no pilot SLA is
 * contractually committed).
 *
 * Every assertion runs against the page's MARKUP region only. Frontmatter,
 * `<style>`, `<script>`, and comments are stripped first — otherwise a
 * `width: 100%` in the stylesheet trips the percentage guard, and an Astro
 * comment naming a tool satisfies a catalog assertion without the page ever
 * rendering it.
 */
import { readdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { TIER_LIMITS, ASSIGNABLE_TIERS } from '../../mcp-server/src/ratelimit/tiers';
// Registry readers live in ONE place (`helpers/mcp-registry.ts`). This file
// carried private copies while it sat unmerged; `mcp-uat-parity.test.ts` holds a
// guard that goes red on a second definition, which is what forced this rewire
// on merge rather than leaving two copies to drift apart.
import {
  EXPECTED_PROMPT_COUNT,
  EXPECTED_REMOTE_TOOL_COUNT,
  LOCAL_ONLY_PATH,
  read,
  registeredPromptNames,
  registeredToolNames,
  SERVER_PATH,
} from './helpers/mcp-registry';

const PAGE_PATH = 'src/pages/hub/mcp/index.astro';

// --- Source readers --------------------------------------------------------

/**
 * Reduce an Astro file to what it actually renders: no frontmatter, no
 * `<style>`/`<script>` blocks, no comments.
 *
 * Whitespace is collapsed last, and that part is load-bearing. Prettier rewraps
 * this page's prose on every commit (lint-staged runs it), so a phrase like
 * "non-contractual capability ceilings" can straddle a source line break at any
 * time. Matching against raw source made these assertions fail on reformatting
 * alone, which is a false alarm that teaches the next person to weaken the guard.
 */
export function extractAstroMarkup(source: string): string {
  return (
    source
      .replace(/^---[\s\S]*?\n---/, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
      .replace(/<script[\s\S]*?<\/script>/g, '')
      // `\s*` inside the braces is required, not defensive: prettier reformats
      // `{/* … */}` to `{ /* … */ }` on commit.
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
  );
}

// --- Fixtures --------------------------------------------------------------

const markup = extractAstroMarkup(read(PAGE_PATH));
const remoteTools = registeredToolNames(SERVER_PATH);
const stdioOnlyTools = registeredToolNames(LOCAL_ONLY_PATH);
const prompts = registeredPromptNames();

describe('MCP marketing page — extraction sanity', () => {
  it('discovers exactly the registered remote tool set', () => {
    expect(remoteTools).toHaveLength(EXPECTED_REMOTE_TOOL_COUNT);
  });

  it('discovers exactly the registered prompt set', () => {
    expect(prompts).toHaveLength(EXPECTED_PROMPT_COUNT);
  });

  it('discovers the stdio-only tools separately', () => {
    expect(stdioOnlyTools).toEqual(
      expect.arrayContaining(['search_radar_offline', 'search_radar_cache'])
    );
  });

  it('strips frontmatter, styles, scripts, and comments from the markup region', () => {
    expect(markup).not.toContain('import BaseLayout'); // frontmatter
    expect(markup).not.toContain('grid-template-columns'); // <style>
    expect(markup).not.toContain('(window as any).trackCTA'); // <script>
    expect(markup).not.toContain('ADR-0014'); // {/* … */} comment
  });
});

describe('MCP marketing page — tool catalog parity', () => {
  it.each(
    // `search_radar_cache` is a stdio alias of a remote tool name prefix; assert
    // per-name so a failure names the offending tool.
    [...new Set(remoteTools)].map((name) => [name] as const)
  )('publishes the remote tool %s', (name) => {
    expect(markup).toContain(name);
  });

  it('does not publish stdio-local-only tools', () => {
    for (const name of stdioOnlyTools) {
      if (remoteTools.includes(name)) continue;
      expect(markup).not.toContain(name);
    }
  });

  it('publishes NO identifier the server does not register', () => {
    // The inverse of the per-tool assertions above, which only iterate tools
    // that still exist — so DELETING a tool from the server would leave its
    // stale entry on the page unchallenged. This catches that direction.
    //
    // Matches the SOURCE shape, not rendered HTML: the markup region is the
    // .astro file with components unexpanded, so `<DeltaIcon … />` is still a
    // literal tag and there is no `</svg>` to anchor on. Prose bullets wrap
    // their text in `<span>` and human-readable entries start uppercase, so
    // only the bare snake_case identifiers match.
    const published = [
      ...markup.matchAll(/<li>\s*<DeltaIcon[^/]*\/>\s*([a-z][a-z0-9_]+)\s*<\/li>/g),
    ].map((m) => m[1]);

    // Vacuity guard: 15 tools + 9 prompts are rendered this way.
    expect(published.length).toBe(EXPECTED_REMOTE_TOOL_COUNT + EXPECTED_PROMPT_COUNT);

    const registered = new Set([...remoteTools, ...prompts]);
    expect(published.filter((name) => !registered.has(name))).toEqual([]);
  });
});

// The page publishes counts, not URI templates, because a template tells a
// reader the wire shape and nothing about whether it addresses 3 documents or
// 300. Counts are only worth publishing if they cannot silently rot. Derived at
// module scope because two describe blocks assert against them, and two
// derivations could disagree.
const libraryCount = (
  read('mcp-server/src/content/library-loader.ts').match(/uri: 'gst:\/\/library\//g) ?? []
).length;
const regulationCount = readdirSync(resolve('src/data/regulatory-map')).filter((f) =>
  f.endsWith('.json')
).length;
const radarCategories = (
  read('mcp-server/src/content/radar-transform.ts')
    .match(/export const RADAR_CATEGORIES[\s\S]*?\]/)?.[0]
    .match(/'[a-z-]+'/g) ?? []
).length;
// `gst://radar/fyi/latest` + `gst://radar/wire/latest` + one wire per category.
const radarCount = 2 + radarCategories;
const resourceTotal = libraryCount + regulationCount + radarCount;

describe('MCP marketing page — resource inventory parity', () => {
  it('discovers a non-empty inventory from source', () => {
    expect(libraryCount).toBeGreaterThan(0);
    expect(regulationCount).toBeGreaterThan(0);
    expect(radarCategories).toBe(4);
  });

  it('publishes the per-family counts', () => {
    expect(markup).toContain(`>${libraryCount}<`);
    expect(markup).toContain(`>${regulationCount}<`);
    expect(markup).toContain(`>${radarCount}<`);
  });

  it('summarises the same numbers it details further down', () => {
    // The three tiles heading "What's exposed" repeat the tool, resource, and
    // prompt counts detailed by the primitives below them. A reader compares
    // them; they must not drift apart. (This used to read the headline stat row
    // under the page header, which the page no longer carries.)
    const total = resourceTotal;
    // Sliced to the next block rather than regex-matched: a non-greedy match on
    // `</div> </div>` stops at the first tile, which silently narrows the guard.
    const start = markup.indexOf('<div class="mcp-primitive-summary">');
    const statRow =
      start === -1 ? '' : markup.slice(start, markup.indexOf('<div class="mcp-primitive"', start));
    expect(statRow, 'primitive summary tiles not found').not.toBe('');
    expect(statRow).toContain(`>${EXPECTED_REMOTE_TOOL_COUNT}<`);
    expect(statRow).toContain(`>${total}<`);
    expect(statRow).toContain(`>${EXPECTED_PROMPT_COUNT}<`);
  });

  it('publishes the regulation count wherever it is cited in prose', () => {
    // Cited ONCE, in the Regulatory-exposure tool gloss. The resources group
    // renders the number inside a `<span>` rather than this phrase, so an
    // earlier "cited twice" comment here was wrong — and `toBeGreaterThan(0)`
    // could not have enforced "both" anyway. Exact count, so adding a second
    // citation is a deliberate act rather than a silent divergence.
    const citations =
      markup.match(new RegExp(`${regulationCount} regulatory framework`, 'g')) ?? [];
    expect(citations).toHaveLength(1);
  });
});

describe('MCP marketing page — primitive counts', () => {
  /**
   * Each primitive states its count twice: on the `<h3>` heading and again in
   * the disclosure summary a reader clicks. Both were previously unpinned, so
   * the page could ship "Tools 14" / "Browse all 14 tools" while the headline
   * stat row correctly said 15 — verified by mutation, the suite stayed green.
   */
  const PRIMITIVES = [
    ['Tools', EXPECTED_REMOTE_TOOL_COUNT, 'tools'],
    ['Prompts', EXPECTED_PROMPT_COUNT, 'prompts'],
  ] as const;

  it.each(PRIMITIVES.map((p) => [p[0], p[1], p[2]] as const))(
    'pins the %s heading count and its disclosure summary',
    (heading, count, noun) => {
      expect(markup).toContain(
        `<h3>${heading}</h3> <span class="mcp-primitive__count">${count}</span>`
      );
      expect(markup).toContain(`<span>Browse all ${count} ${noun}</span>`);
    }
  );

  it('pins the Resources heading count and its disclosure summary', () => {
    expect(markup).toContain(
      `<h3>Resources</h3> <span class="mcp-primitive__count">${resourceTotal}</span>`
    );
    expect(markup).toContain(`<span>Browse all ${resourceTotal} resources</span>`);
  });
});

describe('MCP marketing page — browser counterpart links', () => {
  const internalHrefs = [...markup.matchAll(/class="mcp-catalog__try" href="(\/[^"]*)"/g)].map(
    (m) => m[1]
  );

  it('offers a browser counterpart for every tool family', () => {
    expect(internalHrefs.length).toBe(8);
  });

  it.each(internalHrefs.map((href) => [href] as const))('%s resolves to a real page', (href) => {
    // A dead link here is a prospect hitting a 404 from the page that is
    // supposed to be the front door.
    // Both route shapes are in use: `/hub/radar/` is a directory route,
    // `/ma-portfolio/` is a flat file.
    const route = href.replace(/^\/|\/$/g, '');
    const resolvesToAPage =
      existsSync(resolve(`src/pages/${route}/index.astro`)) ||
      existsSync(resolve(`src/pages/${route}.astro`));
    expect(resolvesToAPage).toBe(true);
  });
});

describe('MCP marketing page — prompt and resource parity', () => {
  it.each(prompts.map((name) => [name] as const))('publishes the prompt %s', (name) => {
    expect(markup).toContain(name);
  });

  it('publishes every resource URI family', () => {
    for (const scheme of ['gst://library/', 'gst://regulations/', 'gst://radar/']) {
      expect(markup).toContain(scheme);
    }
  });

  it('links the MCP spec for each primitive it describes', () => {
    // The page explains tools/resources/prompts in GST's own words; the spec
    // links are what let a reader check that framing against the source.
    for (const concept of ['tools', 'resources', 'prompts']) {
      expect(markup).toContain(`https://modelcontextprotocol.io/docs/concepts/${concept}`);
    }
  });

  it('opens external spec links safely', () => {
    const externalAnchors =
      markup.match(/<a[^>]*href="https:\/\/modelcontextprotocol\.io[^"]*"[^>]*>/g) ?? [];
    expect(externalAnchors).toHaveLength(3);
    for (const anchor of externalAnchors) {
      expect(anchor).toContain('rel="noopener noreferrer"');
    }
  });
});

describe('MCP marketing page — tier parity', () => {
  /**
   * The ceilings live in one comparison table whose columns are headed by the
   * tier blocks ABOVE it, so nothing inside a value cell names its own tier
   * except `data-tier` — which is exactly what these assertions bind to. The
   * older shape was three gateway cards, and a page-wide
   * `toContain(String(value))` passed when ANY tier carried the number: the
   * free-pilot card could advertise enterprise's ceilings and stay green
   * (verified by mutation, all 58 tests passed with the numbers swapped).
   * Scoping each value to its own tier is still the whole point; the anchor
   * moved from the card to the cell.
   */
  const tableStart = markup.indexOf('<table class="brutal-bench-table mcp-tier-table"');
  const table =
    tableStart === -1 ? '' : markup.slice(tableStart, markup.indexOf('</table>', tableStart));

  /** Ceiling rows, in the order the table authors them. */
  const CEILINGS = [
    ['perMinute', 'Calls / min'],
    ['perDay', 'Calls / day'],
    ['radarPerMinute', 'Radar / min'],
    ['radarPerDay', 'Radar / day'],
  ] as const;

  /**
   * Config identifier → the display name heading its column, left to right.
   * The identifiers are still literal markup (now a `<code>` sub-label under
   * the display name rather than the heading itself); the display names are
   * what the value cells carry, so both halves are pinned.
   */
  const TIER_COLUMNS = [
    ['free-pilot', 'Pilot'],
    ['paid', 'Deal Team'],
    ['enterprise', 'Firm'],
  ] as const;

  it('renders the ceilings as one comparison table', () => {
    expect(tableStart, 'tier comparison table not found').toBeGreaterThan(-1);
    expect(table).toContain('<tbody>');
  });

  it('publishes every assignable tier identifier, and only those', () => {
    expect(TIER_COLUMNS.map(([id]) => id)).toEqual([...ASSIGNABLE_TIERS]);
    for (const [id] of TIER_COLUMNS) {
      expect(markup).toContain(`<code class="mcp-tier__id">${id}</code>`);
    }
  });

  it('orders the tier headers left to right in table-column order', () => {
    // The headers ARE the column headers, so reordering either half silently
    // re-attributes every number in the table.
    const positions = TIER_COLUMNS.map(([id]) =>
      markup.indexOf(`<code class="mcp-tier__id">${id}</code>`)
    );
    expect(positions.every((p) => p > -1)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it.each(CEILINGS.map(([key, label]) => [label, key] as const))(
    'publishes the %s row, each value under its own tier',
    (label, key) => {
      const row = new RegExp(`<th scope="row">${label}</th>(.*?)</tr>`).exec(table);
      expect(row, `no "${label}" row in the tier table`).not.toBeNull();

      const cells = [...row![1].matchAll(/<td data-tier="([^"]+)">([^<]+)<\/td>/g)].map(
        (m) => [m[1], m[2]] as const
      );
      // Thousands separators are a display choice; the guard formats the source
      // value the same way rather than accepting either shape.
      expect(cells).toEqual(
        TIER_COLUMNS.map(([id, name]) => [name, TIER_LIMITS[id][key].toLocaleString('en-US')])
      );
    }
  );

  it('gives each tier a DIFFERENT set of ceilings', () => {
    // Backstop for the failure above: if the cards ever converge on one tier's
    // numbers, the per-tier assertions could all pass against a duplicated card.
    const rendered = ASSIGNABLE_TIERS.map((tier) =>
      CEILINGS.map(([key]) => TIER_LIMITS[tier][key]).join('/')
    );
    expect(new Set(rendered).size).toBe(ASSIGNABLE_TIERS.length);
  });

  it('does not publish the internal tier, which is not operator-assignable', () => {
    expect(markup).not.toMatch(/>\s*internal\s*</);
  });
});

describe('MCP marketing page — published hostnames', () => {
  it('publishes the MCP endpoint', () => {
    // Anchored on the full endpoint: the bare host is a substring of both
    // `status.mcp.…` and the forbidden `docs.mcp.…`, so a host-only check
    // would pass on a page that never printed the endpoint.
    expect(markup).toContain('https://mcp.globalstrategic.tech/mcp');
  });

  it('publishes the status page', () => {
    expect(markup).toContain('status.mcp.globalstrategic.tech');
  });

  it('publishes both hostnames in the COPYABLE elements, not just in prose', () => {
    // Anchored to the `<code>` a reader clicks Copy on. A bare hostname check
    // passes on the prose links further down the page, so corrupting the value
    // inside `data-status-url` slipped through until this was added.
    expect(markup).toContain('<code data-endpoint-url>https://mcp.globalstrategic.tech/mcp</code>');
    expect(markup).toContain(
      '<code data-status-url>https://status.mcp.globalstrategic.tech/</code>'
    );
  });
});

describe('MCP marketing page — copy guardrails', () => {
  it('carries the non-contractual capability-ceilings framing', () => {
    // RATE_LIMITS.md's own framing. Asserted POSITIVELY on purpose: a blanket
    // "no SLA" scan would fail against this very sentence and pressure a future
    // editor into deleting the guardrail the page exists to carry.
    expect(markup).toContain('non-contractual capability ceilings');
    expect(markup).toContain('NOT ratified SLA quotas');
  });

  it('frames the audit log as a capability, never as active capture', () => {
    // PILOT_ONBOARDING § 3: "Do not promise active audit capture in writing."
    // The pipeline is deactivated (ADR-0014), so this is the one guardrail that
    // is a required PHRASE rather than a forbidden one — a positive assertion,
    // because forbidding wording cannot force the qualifier to stay.
    expect(markup).toContain('exists as built-and-tested capability');
    expect(markup).not.toMatch(/every (tool )?call is (audited|logged)/i);
    expect(markup).not.toMatch(/all calls are (audited|logged)/i);
  });

  it('does not link a developer-docs subdomain that does not exist', () => {
    expect(markup).not.toContain('docs.mcp.globalstrategic.tech');
  });

  it('publishes no uptime percentage or availability figure', () => {
    expect(markup).not.toMatch(/\d+(\.\d+)?\s*%/);
  });

  it('makes no promissory availability claim', () => {
    expect(markup).not.toMatch(/guaranteed uptime/i);
    expect(markup).not.toMatch(/99\.\d+\s*%/);
  });

  it('uses no em dashes in rendered copy', () => {
    // Operator preference, 2026-08-09. Asserted on the markup region so source
    // comments (which follow the repo's prose style) stay unaffected.
    expect(markup).not.toContain('—');
    expect(markup).not.toContain('&mdash;');
  });
});
