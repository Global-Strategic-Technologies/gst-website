/**
 * Capability-registry parity guard for `/hub/mcp/docs/`.
 *
 * The docs page publishes an authored description of every MCP capability
 * rather than generating one from `mcp-server/src/docs` (ADR-0023). That trade
 * is only defensible if the LOAD-BEARING half cannot rot: identifiers,
 * orchestration lists, counts and the resource inventory are all bound to
 * server source here, so adding, renaming or deleting a tool fails this suite
 * rather than leaving a stale contract on a public page.
 *
 * It IMPORTS the registry rather than scanning the page's markup. The shared
 * `extractAstroMarkup` reader reduces `.astro` SOURCE with components
 * unexpanded, which works for `/hub/mcp/` because that page hardcodes every
 * name inline; this page renders 34 panes from the data module through a
 * component, so its markup region contains no capability ids at all and a
 * markup assertion here would be vacuous. That the page actually renders every
 * entry is proved in `tests/e2e/hub-mcp-docs.test.ts`, in the no-JS context.
 */
import { describe, expect, it } from 'vitest';
import {
  CAPABILITIES,
  DEFAULT_CAPABILITY_ID,
  JOBS,
  type Capability,
} from '../../src/data/mcp/capabilities';
import { buildExampleCall, capabilitySlug } from '../../src/utils/mcp-capability-search';
import {
  EXPECTED_PROMPT_COUNT,
  EXPECTED_REMOTE_TOOL_COUNT,
  registeredPromptNames,
  registeredToolNames,
  resourceInventory,
  servedResourceUris,
  sweepOrchestratedToolNames,
  targetQuickLookOrchestratedToolNames,
  SERVER_PATH,
} from './helpers/mcp-registry';

const remoteTools = registeredToolNames(SERVER_PATH);
const prompts = registeredPromptNames();
const inventory = resourceInventory();

const ids = CAPABILITIES.map((cap) => cap.id);
const byId = new Map(CAPABILITIES.map((cap) => [cap.id, cap]));
const inGroup = (group: Capability['group']) =>
  CAPABILITIES.filter((cap) => cap.group === group).map((cap) => cap.id);

/** Every authored string in the registry, which is what the copy rules govern. */
function allStrings(): string[] {
  const out: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(CAPABILITIES);
  walk(JOBS);
  return out;
}

const strings = allStrings();

describe('MCP docs registry — extraction sanity', () => {
  it('reads a non-empty registry from source', () => {
    // Vacuity guard: every assertion below would pass over empty sets.
    expect(remoteTools).toHaveLength(EXPECTED_REMOTE_TOOL_COUNT);
    expect(prompts).toHaveLength(EXPECTED_PROMPT_COUNT);
    expect(CAPABILITIES.length).toBeGreaterThan(30);
    expect(strings.length).toBeGreaterThan(200);
  });
});

describe('MCP docs registry — server parity', () => {
  it('documents exactly the registered remote tools', () => {
    expect([...inGroup('Tools')].sort()).toEqual([...remoteTools].sort());
  });

  it('documents exactly the registered prompts', () => {
    expect([...inGroup('Prompts')].sort()).toEqual([...prompts].sort());
  });

  it('keeps gst_irl_ingestion listed while it is still registered', () => {
    // The two ingestion prompts coexist deliberately. When the server drops
    // this one, the first assertion in this block fails and the page's
    // coexistence callout has to be revisited in the same change.
    expect(prompts).toContain('gst_irl_ingestion');
    const ingestion = byId.get('gst_irl_ingestion');
    expect(`${ingestion?.noteTitle} ${ingestion?.note}`).toMatch(/coexist/i);
    // And it is never published as deprecated: the server makes no such
    // commitment, so neither does this page.
    expect(`${ingestion?.gloss} ${ingestion?.note}`).not.toMatch(/deprecat|scheduled for removal/i);
  });

  it('publishes the sweep orchestration list as the server declares it', () => {
    const published = byId.get('gst_irl_sweep')?.orchestrates ?? [];
    expect(published).toEqual(sweepOrchestratedToolNames());
    expect(published.length).toBe(9);
  });

  it('publishes the quick-look orchestration list as the server declares it', () => {
    const published = byId.get('gst_target_quick_look')?.orchestrates ?? [];
    expect(published).toEqual(targetQuickLookOrchestratedToolNames());
  });

  it('names no tool the server does not register', () => {
    // Covers every orchestration list at once, in the direction the two exact
    // assertions above cannot: a prompt citing a deleted tool.
    const cited = CAPABILITIES.flatMap((cap) => cap.orchestrates ?? []).filter((name) =>
      /^[a-z][a-z0-9_]+$/.test(name)
    );
    expect(cited.length).toBeGreaterThan(20);
    expect(cited.filter((name) => !remoteTools.includes(name))).toEqual([]);
  });

  it('publishes the resource inventory the loaders actually hold', () => {
    const families = CAPABILITIES.filter((cap) => cap.group === 'Resources');
    expect(families.map((f) => f.count)).toEqual([
      inventory.library,
      inventory.regulations,
      inventory.radar,
    ]);
    expect(families.reduce((sum, f) => sum + (f.count ?? 0), 0)).toBe(inventory.total);
  });
});

describe('MCP docs registry — internal integrity', () => {
  it('has no duplicate ids', () => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every capability a unique, URL-safe anchor', () => {
    // Six ids are not identifiers (`gst://radar/…`, `Rate limits`), so the slug
    // is what makes them addressable at all. A collision would make one pane
    // unreachable and silently show another.
    const slugs = ids.map(capabilitySlug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9_]+(-[a-z0-9_]+)*$/);
  });

  it('resolves every related and orchestrates chip to a real capability', () => {
    const dangling = CAPABILITIES.flatMap((cap) =>
      [...(cap.related ?? []), ...(cap.orchestrates ?? [])]
        .filter((ref) => !byId.has(ref))
        .map((ref) => `${cap.id} -> ${ref}`)
    );
    expect(dangling).toEqual([]);
  });

  it('resolves every job step to a real capability', () => {
    const steps = JOBS.flatMap((j) => j.steps);
    expect(steps.length).toBe(30);
    expect(steps.filter((s) => !byId.has(s.capabilityId)).map((s) => s.capabilityId)).toEqual([]);
  });

  it('resolves every usedIn key to a real job', () => {
    const keys = new Set(JOBS.map((j) => j.key));
    const used = CAPABILITIES.flatMap((cap) => cap.usedIn ?? []);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((key) => !keys.has(key))).toEqual([]);
  });

  it('points every resource step at a document the server actually serves', () => {
    // `documentUri` exists so two steps meaning different articles stop
    // rendering the same identifier and the same anchor. That only holds if the
    // value is a real URI under the family it hangs off, so both halves are
    // checked against server source rather than trusted.
    const served = servedResourceUris();
    expect(served.size).toBeGreaterThan(0);

    const withDoc = JOBS.flatMap((j) => j.steps).filter((s) => s.documentUri);
    expect(withDoc.length).toBeGreaterThan(0);

    const drift: string[] = [];
    for (const step of withDoc) {
      const uri = step.documentUri as string;
      if (step.kind !== 'Resource') drift.push(`${uri}: documentUri on a ${step.kind} step`);
      // `gst://library/<guide>` -> `gst://library/`
      const prefix = (byId.get(step.capabilityId)?.uri ?? '').replace(/<[^>]*>.*$/, '');
      if (!prefix) drift.push(`${uri}: ${step.capabilityId} publishes no uri template`);
      else if (!uri.startsWith(prefix)) drift.push(`${uri}: not under ${prefix}`);
      if (!served.has(uri)) drift.push(`${uri}: the server serves no such document`);
    }
    expect(drift).toEqual([]);
  });

  it('leaves no two steps showing one identifier for different documents', () => {
    // The defect this closes: `Review the architecture` and `Handover an
    // assessment` both rendered `gst://library/…` and both linked to
    // `#cap-gst-library`, so a reader was told two different articles were one.
    // What a step SHOWS is its document when it has one, else its capability.
    //
    // This pins the collision, not the editorial call. Whether a given resource
    // step OUGHT to name one document or genuinely means its whole family (the
    // regulatory job reads across frameworks, and says so) is authored
    // judgement, the same accepted trade as the glosses. What cannot be left to
    // judgement is two steps rendering one label.
    const shown = JOBS.flatMap((j) => j.steps.map((s) => s.documentUri ?? s.capabilityId));
    expect(shown.length).toBe(30);

    const families = new Set(
      CAPABILITIES.filter((cap) => cap.group === 'Resources').map((cap) => cap.id)
    );
    expect(families.size).toBe(3);

    const counts = new Map<string, number>();
    for (const label of shown.filter((l) => families.has(l))) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    expect([...counts.entries()].filter(([, n]) => n > 1)).toEqual([]);
  });

  it('keys every job uniquely', () => {
    const keys = JOBS.map((j) => j.key);
    expect(keys.length).toBe(12);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('names what every job returns', () => {
    // `youGetBack` is optional on the type so a job can be added before its
    // output is settled, which means only an assertion keeps the column filled.
    // The lens header promises "what you get back" for every card.
    const missing = JOBS.filter((j) => !j.youGetBack?.trim()).map((j) => j.key);
    expect(missing).toEqual([]);
  });

  it('reaches every job from some capability contract', () => {
    // The "Used in jobs" chips are the only route from Reference back to Jobs.
    // A job no capability points at is unreachable from half the page.
    const used = new Set(CAPABILITIES.flatMap((cap) => cap.usedIn ?? []));
    expect(JOBS.filter((j) => !used.has(j.key)).map((j) => j.key)).toEqual([]);
  });

  it('declares usedIn on exactly the capabilities a job steps through', () => {
    // The chip and the step are two views of one relationship, so they cannot
    // be allowed to drift: a capability stepped through by a job must say so,
    // and one that says so must be stepped through.
    const fromSteps = new Map<string, Set<string>>();
    for (const job of JOBS) {
      for (const step of job.steps) {
        const keys = fromSteps.get(step.capabilityId) ?? new Set<string>();
        keys.add(job.key);
        fromSteps.set(step.capabilityId, keys);
      }
    }
    expect(fromSteps.size).toBeGreaterThan(0);
    const drift: string[] = [];
    for (const cap of CAPABILITIES) {
      const declared = [...(cap.usedIn ?? [])].sort();
      const actual = [...(fromSteps.get(cap.id) ?? [])].sort();
      if (declared.join(',') !== actual.join(',')) {
        drift.push(`${cap.id}: declared [${declared}] but stepped through by [${actual}]`);
      }
    }
    expect(drift).toEqual([]);
  });

  it('opens Reference on a capability that exists', () => {
    expect(byId.has(DEFAULT_CAPABILITY_ID)).toBe(true);
  });

  it('anchors every example on the capability it documents', () => {
    // A copied example that calls a different tool is worse than none. The
    // generated arm holds this by construction (`buildExampleCall` writes the
    // id itself); this is the hand-authored arm, where nothing else would.
    for (const cap of CAPABILITIES) {
      if (!cap.example) continue;
      expect(cap.example.startsWith(`${cap.id}(`)).toBe(true);
    }
  });

  it('gives every tool exactly one Example arm, and no non-tool either', () => {
    // `exampleCall` generates the call from the arguments' own values;
    // `example` is hand-authored for the three tools whose documented arguments
    // are not flat wire keys. Carrying both would mean the page shows one and
    // the other rots unseen; carrying neither leaves a tool with no example at
    // all, which is the state this whole surface exists to end.
    const arms = (cap: Capability) =>
      Number(Boolean(cap.example)) + Number(Boolean(cap.exampleCall));
    const tools = CAPABILITIES.filter((cap) => cap.group === 'Tools');
    expect(tools).toHaveLength(16);
    expect(tools.filter((cap) => arms(cap) !== 1).map((cap) => cap.id)).toEqual([]);
    expect(
      CAPABILITIES.filter((cap) => cap.group !== 'Tools' && arms(cap) > 0).map((cap) => cap.id)
    ).toEqual([]);
  });

  it('builds every generated call from arguments that carry a value', () => {
    // The failure this catches is a call naming an argument that was renamed,
    // deleted, or never given an example — which would render `null` into a
    // snippet the page invites a reader to run.
    const orphans = CAPABILITIES.flatMap((cap) =>
      (cap.exampleCall ?? [])
        .filter((name) => !(cap.args ?? []).some((arg) => arg.name === name && arg.example))
        .map((name) => `${cap.id} -> ${name}`)
    );
    expect(orphans).toEqual([]);
  });

  it('marks a call runnable only when it really is', () => {
    // Derived, not declared — so this asserts the derivation still discriminates
    // rather than that someone set a flag. The two hand-authored calls carrying
    // a per-body placeholder must NOT come back runnable.
    const runnable = CAPABILITIES.filter((cap) => buildExampleCall(cap).runnable).map((c) => c.id);
    expect(runnable).toContain('compute_techpar');
    expect(runnable).toContain('list_portfolio_facets');
    expect(runnable).not.toContain('validate_irl_provenance');
    expect(runnable).not.toContain('compose_dossier_envelope');
    expect(runnable).not.toContain('prepare_irl_body');
  });

  it('carries example values on a non-trivial share of arguments', () => {
    // Vacuity guard for the three assertions above: every one of them passes
    // over a registry where nobody ever wrote an example.
    const withExample = CAPABILITIES.flatMap((cap) => cap.args ?? []).filter((arg) => arg.example);
    expect(withExample.length).toBeGreaterThan(50);
  });
});

describe('MCP docs registry — copy guardrails', () => {
  it('uses no em dashes', () => {
    expect(strings.filter((s) => s.includes('—'))).toEqual([]);
  });

  it('links no docs subdomain', () => {
    // `/hub/mcp/docs/` is the one published address for this reference. The
    // subdomain is a Worker-served alias that only ever redirects, so a second
    // name in copy is how two addresses drift apart. (Until the alias deploys it
    // would also simply fail to resolve.)
    expect(strings.filter((s) => s.includes('docs.mcp.'))).toEqual([]);
  });

  it('publishes no uptime figure or availability percentage', () => {
    // No pilot SLA is contractually committed; a number here would read as one.
    expect(strings.filter((s) => /\d\s?%/.test(s))).toEqual([]);
    expect(strings.filter((s) => /\buptime\b/i.test(s))).toEqual([]);
    expect(strings.filter((s) => /\bSLA\b/.test(s))).toEqual([]);
  });

  it('keeps the non-contractual framing on rate ceilings', () => {
    const rateLimits = byId.get('Rate limits');
    expect(rateLimits?.note).toMatch(/not ratified service quotas/);
    expect(rateLimits?.noteTitle).toMatch(/[Tt]unable/);
    // Every tool that states availability carries the same framing, so a reader
    // meets it wherever they land rather than only on the operations topic.
    const availabilities = CAPABILITIES.filter(
      (cap) => cap.group === 'Tools' && cap.availability
    ).map((cap) => cap.availability ?? '');
    expect(availabilities.length).toBe(EXPECTED_REMOTE_TOOL_COUNT);
    for (const line of availabilities) {
      expect(line).toMatch(/not contractual quotas/);
    }
  });

  it('publishes no operator-only material', () => {
    // The published set is reviewed against AUTH.md / DEPLOY.md so admin
    // endpoints, key rotation and storage internals stay private.
    for (const pattern of [/wrangler/i, /upstash/i, /\/admin\//, /MCP_KEY_/, /secret put/i]) {
      expect(strings.filter((s) => pattern.test(s))).toEqual([]);
    }
  });
});
