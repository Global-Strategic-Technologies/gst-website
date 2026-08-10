/**
 * UAT coverage guard (BL-119).
 *
 * `mcp-server/src/docs/testing/uat/` is the human-acceptance suite: per-capability
 * walkthroughs someone executes against the deployed server. Its value depends
 * entirely on being COMPLETE — a tool that ships with no UAT case is a capability
 * nobody is asked to verify, and nothing about a passing UAT cycle would reveal
 * that. This suite binds the coverage matrix to what the server actually
 * registers, so the omission fails here instead of silently.
 *
 * What it deliberately does NOT do: check that documented enum values match the
 * Zod schemas. That job already exists — `contract-parity.test.ts` in the
 * mcp-server workspace does opt-in enum parity against `CONTRACT.md` frontmatter.
 * The UAT docs therefore link a contract as their input authority and show only
 * the arguments a given case sends, rather than restating a catalog that would
 * need a second, redundant guard.
 */
import { existsSync, readdirSync } from 'fs';
import { resolve } from 'path';
import {
  read,
  registeredToolNames,
  registeredPromptNames,
  SERVER_PATH,
  LOCAL_ONLY_PATH,
  EXPECTED_REMOTE_TOOL_COUNT,
  EXPECTED_PROMPT_COUNT,
} from './helpers/mcp-registry';

const UAT_DIR = 'mcp-server/src/docs/testing/uat';
const UAT_README = `${UAT_DIR}/README.md`;
const UAT_SETUP = `${UAT_DIR}/SETUP.md`;

/** Documents that are scaffolding, not test cases. */
const NON_CASE_DOCS = new Set(['README.md', 'SETUP.md', 'TEMPLATE.md']);

const MCP_ENDPOINT = 'https://mcp.globalstrategic.tech/mcp';

// --- Fixtures --------------------------------------------------------------

const remoteTools = registeredToolNames(SERVER_PATH);
const stdioOnlyTools = registeredToolNames(LOCAL_ONLY_PATH).filter(
  (name) => !remoteTools.includes(name)
);
const prompts = registeredPromptNames();
const readme = read(UAT_README);

/**
 * Rows of the capability coverage matrix: `| \`capability\` | kind | doc | status |`.
 *
 * Anchored on a backticked first cell so the Test-catalog table above it (whose
 * first cell is a markdown link) cannot be mistaken for coverage rows.
 */
interface CoverageRow {
  readonly capability: string;
  readonly kind: string;
  readonly doc: string;
  readonly status: string;
}

function parseCoverageMatrix(source: string): CoverageRow[] {
  const rows: CoverageRow[] = [];
  const re = /^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    rows.push({ capability: m[1], kind: m[2], doc: m[3], status: m[4].trim() });
  }
  return rows;
}

/** `[UAT-01](UAT-01-portfolio.md)` -> `UAT-01-portfolio.md`; bare text -> null. */
function docFileFrom(cell: string): string | null {
  const link = cell.match(/\(([^)]+\.md)\)/);
  return link ? link[1] : null;
}

const coverage = parseCoverageMatrix(readme);
const byCapability = new Map(coverage.map((r) => [r.capability, r]));

/** Every `UAT-*.md` actually present on disk. */
const uatDocsOnDisk = readdirSync(resolve(UAT_DIR))
  .filter((f) => f.endsWith('.md') && !NON_CASE_DOCS.has(f))
  .sort();

describe('UAT coverage — extraction sanity', () => {
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

  it('parses a non-empty coverage matrix', () => {
    // Without this, a README edit that broke the table format would make every
    // "has a row" assertion below fail loudly rather than silently — but a
    // regex that matched nothing at all would be the confusing failure. Assert
    // the parse worked so the real failures read clearly.
    expect(coverage.length).toBeGreaterThanOrEqual(
      EXPECTED_REMOTE_TOOL_COUNT + EXPECTED_PROMPT_COUNT
    );
  });
});

describe('UAT coverage — every capability is accounted for', () => {
  it.each(remoteTools.map((name) => [name] as const))('covers the tool %s', (name) => {
    expect(byCapability.has(name)).toBe(true);
  });

  it.each(prompts.map((name) => [name] as const))('covers the prompt %s', (name) => {
    expect(byCapability.has(name)).toBe(true);
  });

  it('does not present stdio-only tools as testable', () => {
    // They are unreachable over the Worker, so a row for one would send a
    // tester after a capability their client cannot see.
    for (const name of stdioOnlyTools) {
      expect(byCapability.has(name)).toBe(false);
    }
  });

  it('uses only the two defined statuses', () => {
    for (const row of coverage) {
      expect(['authored', 'pending']).toContain(row.status);
    }
  });
});

describe('UAT coverage — the catalog and the filesystem agree', () => {
  const authored = coverage.filter((r) => r.status === 'authored');

  it('has at least one authored capability', () => {
    expect(authored.length).toBeGreaterThan(0);
  });

  it.each(authored.map((r) => [r.capability, r.doc] as const))(
    'the doc for %s exists and names it',
    (capability, docCell) => {
      const file = docFileFrom(docCell);
      // An authored row must link its document; a pending row need not.
      expect(file).not.toBeNull();
      const path = `${UAT_DIR}/${file}`;
      expect(existsSync(resolve(path))).toBe(true);
      expect(read(path)).toContain(capability);
    }
  );

  it('lists every UAT document that exists on disk', () => {
    // The other direction: an orphan file nobody can find from the index is as
    // bad as an index row pointing at nothing.
    const linked = new Set(
      coverage.map((r) => docFileFrom(r.doc)).filter((f): f is string => f !== null)
    );
    for (const file of uatDocsOnDisk) {
      expect(linked.has(file)).toBe(true);
    }
  });

  it('links every authored document from the Test catalog too', () => {
    // The catalog is the reader-facing TOC; the coverage matrix is the
    // machine-checked inverse. Both must reach every document.
    for (const file of uatDocsOnDisk) {
      expect(readme).toContain(`(${file})`);
    }
  });
});

describe('UAT setup — published endpoint', () => {
  const setup = read(UAT_SETUP);

  it('publishes the production MCP endpoint verbatim', () => {
    expect(setup).toContain(MCP_ENDPOINT);
  });

  it('does not link a developer-docs subdomain that does not exist', () => {
    // Same guardrail the marketing surface carries: `docs.mcp.…` has never
    // been provisioned, and a setup guide sending a pilot there is worse than
    // one that stays quiet about documentation.
    expect(setup).not.toContain('docs.mcp.globalstrategic.tech');
  });

  it('tells the reader which environment a pass is recorded against', () => {
    expect(setup).toMatch(/production/i);
    expect(setup).toMatch(/staging/i);
  });
});

describe('UAT guard — registry readers have a single definition', () => {
  /**
   * Merge-order enforcement, not style policing.
   *
   * These readers were extracted here while `mcp-marketing-parity.test.ts` (which
   * carries its own private copies) sat unmerged on another branch. When that
   * branch lands, this assertion goes red and the rewire becomes mandatory
   * rather than remembered. Delete this test only once there is exactly one
   * definition left and no second copy can reappear.
   */
  it('defines the registry readers in exactly one place under tests/', () => {
    // This file is excluded from its own scan: it necessarily contains the
    // pattern it searches for, so including it would be a guaranteed false
    // positive rather than a detected duplicate.
    const SELF = 'tests/integration/mcp-uat-parity.test.ts';

    const definitions: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(resolve(dir), { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(path);
        } else if (entry.name.endsWith('.ts') && path !== SELF) {
          if (/function registeredToolNames\b/.test(read(path))) definitions.push(path);
        }
      }
    };
    walk('tests');

    expect(definitions).toEqual(['tests/integration/helpers/mcp-registry.ts']);
  });
});
