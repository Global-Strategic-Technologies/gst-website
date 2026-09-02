/**
 * Unit tests for the pure half of `/hub/mcp/docs/`.
 *
 * These functions run in two places — Astro's build renders every anchor with
 * `capabilitySlug`, and the browser module matches against the same shapes — so
 * a bug here is a page whose links and whose search disagree about where a
 * capability lives.
 */
import { describe, expect, it } from 'vitest';
import {
  buildExampleCall,
  capabilityAnchor,
  capabilityCounts,
  capabilitiesInGroup,
  capabilitySlug,
  MAX_SEARCH_RESULTS,
  searchCapabilities,
} from '../../src/utils/mcp-capability-search';
import { CAPABILITIES, type Capability } from '../../src/data/mcp/capabilities';

const index = CAPABILITIES.map((cap) => ({ id: cap.id, type: cap.type, gloss: cap.gloss }));

describe('capabilitySlug', () => {
  it('leaves a wire identifier intact, underscores included', () => {
    // The identifier is contractual; a reader should recognise its own anchor.
    expect(capabilitySlug('compute_techpar')).toBe('compute_techpar');
    expect(capabilitySlug('fill_information_request_list_xlsx')).toBe(
      'fill_information_request_list_xlsx'
    );
  });

  it('makes the six non-identifier ids URL-safe', () => {
    // These are why the function exists: resource URIs and prose ids cannot be
    // fragments as written.
    expect(capabilitySlug('gst://library/…')).toBe('gst-library');
    expect(capabilitySlug('gst://regulations/…')).toBe('gst-regulations');
    expect(capabilitySlug('gst://radar/…')).toBe('gst-radar');
    expect(capabilitySlug('Authentication')).toBe('authentication');
    expect(capabilitySlug('Rate limits')).toBe('rate-limits');
    expect(capabilitySlug('Status')).toBe('status');
  });

  it('emits nothing a URL fragment cannot carry', () => {
    for (const cap of CAPABILITIES) {
      expect(capabilitySlug(cap.id)).toMatch(/^[a-z0-9_]+(-[a-z0-9_]+)*$/);
    }
  });

  it('prefixes the anchor so a pane id cannot collide with another element', () => {
    expect(capabilityAnchor('compute_techpar')).toBe('cap-compute_techpar');
  });
});

describe('searchCapabilities', () => {
  it('matches on the identifier', () => {
    const hits = searchCapabilities(index, 'techpar');
    expect(hits.map((h) => h.id)).toContain('compute_techpar');
  });

  it('matches on the gloss, which is what makes it useful', () => {
    // A reader who knows what they want but not what it is called.
    const hits = searchCapabilities(index, 'carrying cost');
    expect(hits.map((h) => h.id)).toContain('estimate_tech_debt_cost');
  });

  it('ignores case on both sides', () => {
    expect(searchCapabilities(index, 'COMPUTE_TECHPAR').map((h) => h.id)).toContain(
      'compute_techpar'
    );
    expect(searchCapabilities(index, 'authentication').map((h) => h.id)).toContain(
      'Authentication'
    );
  });

  it('returns nothing for an empty or whitespace query', () => {
    // The dropdown is a lookup, not a browse surface; the sidebar already lists
    // everything, so matching all on empty would be noise.
    expect(searchCapabilities(index, '')).toEqual([]);
    expect(searchCapabilities(index, '   ')).toEqual([]);
  });

  it('caps the result count', () => {
    // 'the' appears in far more than eight glosses.
    const hits = searchCapabilities(index, 'the');
    expect(hits.length).toBe(MAX_SEARCH_RESULTS);
  });

  it('returns nothing when nothing matches', () => {
    expect(searchCapabilities(index, 'zzzznotacapability')).toEqual([]);
  });
});

describe('capabilityCounts', () => {
  it('counts resources as documents, not families', () => {
    const counts = capabilityCounts(CAPABILITIES);
    const families = capabilitiesInGroup(CAPABILITIES, 'Resources');
    expect(families.length).toBe(3);
    // The number a reader is asking for is how much is in there.
    expect(counts.resources).toBe(families.reduce((sum, cap) => sum + (cap.count ?? 1), 0));
    expect(counts.resources).toBeGreaterThan(families.length);
  });

  it('counts tools and prompts as entries', () => {
    const counts = capabilityCounts(CAPABILITIES);
    expect(counts.tools).toBe(capabilitiesInGroup(CAPABILITIES, 'Tools').length);
    expect(counts.prompts).toBe(capabilitiesInGroup(CAPABILITIES, 'Prompts').length);
  });
});

describe('capabilitiesInGroup', () => {
  it('preserves registry order, which is the order the sidebar renders', () => {
    const tools = capabilitiesInGroup(CAPABILITIES, 'Tools').map((c) => c.id);
    const fromRegistry = CAPABILITIES.filter((c) => c.group === 'Tools').map((c) => c.id);
    expect(tools).toEqual(fromRegistry);
  });
});

describe('buildExampleCall', () => {
  const cap = (over: Partial<Capability>): Capability =>
    ({ id: 'demo_tool', group: 'Tools', type: 'Tool', gloss: 'g', ...over }) as Capability;

  it('renders one line per named argument, in the order named', () => {
    const built = buildExampleCall(
      cap({
        args: [
          { name: 'arr', desc: '', example: '18400000' },
          { name: 'stage', desc: '', example: '"series-b"' },
        ],
        exampleCall: ['stage', 'arr'],
      })
    );
    expect(built.text).toBe('demo_tool({\n  "stage": "series-b",\n  "arr": 18400000\n})');
    expect(built.runnable).toBe(true);
  });

  it('renders the empty list as a real, runnable call', () => {
    // A tool that takes nothing has a complete example, and `({})` is it.
    expect(buildExampleCall(cap({ exampleCall: [] }))).toEqual({
      text: 'demo_tool({})',
      runnable: true,
    });
  });

  it('is not runnable when a named argument carries no example', () => {
    const built = buildExampleCall(
      cap({ args: [{ name: 'arr', desc: '' }], exampleCall: ['arr'] })
    );
    expect(built.runnable).toBe(false);
  });

  it('is not runnable when a value is a placeholder rather than a value', () => {
    for (const example of ['"<the hash>"', '"a, b, …"']) {
      const built = buildExampleCall(
        cap({ args: [{ name: 'x', desc: '', example }], exampleCall: ['x'] })
      );
      expect(built.runnable, example).toBe(false);
    }
  });

  it('is not runnable when a documented argument is not a wire key', () => {
    // `compose_dossier_envelope` documents `gatesPassed / gatesElided` as one
    // row naming two fields. Rendered as a JSON property it would be neither.
    const built = buildExampleCall(
      cap({
        args: [{ name: 'gatesPassed / gatesElided', desc: '', example: '[]' }],
        exampleCall: ['gatesPassed / gatesElided'],
      })
    );
    expect(built.runnable).toBe(false);
  });

  it('passes a hand-authored call through unchanged, and never calls it runnable', () => {
    // The literal arm exists for calls a flat generated shape gets wrong, so
    // nothing here can vouch for what a human wrote.
    expect(buildExampleCall(cap({ example: 'demo_tool({ "a": 1 })' }))).toEqual({
      text: 'demo_tool({ "a": 1 })',
      runnable: false,
    });
  });

  it('reports no text for a capability that publishes no example', () => {
    expect(buildExampleCall(cap({}))).toEqual({ text: null, runnable: false });
  });
});
