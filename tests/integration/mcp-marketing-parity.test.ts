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
 * "without human review" can straddle a source line break at any time. Matching
 * against raw source made these assertions fail on reformatting alone, which is
 * a false alarm that teaches the next person to weaken the guard.
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
});

describe('MCP marketing page — resource inventory parity', () => {
  // The page publishes counts, not URI templates, because a template tells a
  // reader the wire shape and nothing about whether it addresses 3 documents or
  // 300. Counts are only worth publishing if they cannot silently rot.
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

  it('publishes the resource total on the Resources heading', () => {
    const total = libraryCount + regulationCount + radarCount;
    expect(markup).toContain(
      `<h3>Resources</h3> <span class="mcp-primitive__count">${total}</span>`
    );
  });

  it('headlines the same numbers it details further down', () => {
    // The stat row under the page header repeats the tool, resource, and prompt
    // counts. A reader compares them; they must not drift apart.
    const total = libraryCount + regulationCount + radarCount;
    // Sliced to the next block rather than regex-matched: a non-greedy match on
    // `</div> </div>` stops at the first tile, which silently narrows the guard.
    const start = markup.indexOf('<div class="mcp-headline-stats">');
    const statRow =
      start === -1 ? '' : markup.slice(start, markup.indexOf('<div class="mcp-block"', start));
    expect(statRow).not.toBe('');
    expect(statRow).toContain(`>${EXPECTED_REMOTE_TOOL_COUNT}<`);
    expect(statRow).toContain(`>${total}<`);
    expect(statRow).toContain(`>${EXPECTED_PROMPT_COUNT}<`);
  });

  it('publishes the regulation count wherever it is cited in prose', () => {
    // Cited twice: the tools gloss and the resources group. Both must move together.
    const citations =
      markup.match(new RegExp(`${regulationCount} regulatory framework`, 'g')) ?? [];
    expect(citations.length).toBeGreaterThan(0);
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
  it.each(ASSIGNABLE_TIERS.map((tier) => [tier] as const))('publishes the %s ceilings', (tier) => {
    const limits = TIER_LIMITS[tier];
    expect(markup).toContain(tier);
    for (const value of [
      limits.perMinute,
      limits.perDay,
      limits.radarPerMinute,
      limits.radarPerDay,
    ]) {
      expect(markup).toContain(String(value));
    }
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
});

describe('MCP marketing page — copy guardrails', () => {
  it('carries the non-contractual capability-ceilings framing', () => {
    // RATE_LIMITS.md's own framing. Asserted POSITIVELY on purpose: a blanket
    // "no SLA" scan would fail against this very sentence and pressure a future
    // editor into deleting the guardrail the page exists to carry.
    expect(markup).toContain('non-contractual capability ceilings');
    expect(markup).toContain('NOT ratified SLA quotas');
  });

  it('carries the human-in-the-loop caveat for radar content', () => {
    expect(markup).toMatch(/human review/i);
    expect(markup).toMatch(/should not be auto-actioned/i);
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
