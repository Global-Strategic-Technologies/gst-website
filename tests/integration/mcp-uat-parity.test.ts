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
 * Scoped to the table beneath its own heading rather than scanned document-wide.
 * The same shape as `contract-parity.test.ts#extractIdsFromTable`, and for the
 * same reason: a document-wide scan silently ingests any other four-column
 * table someone later adds, then fails with a message naming neither the table
 * nor the row. Slicing after the heading makes a malformed matrix fail as
 * "matrix not found" instead of as a phantom capability.
 */
interface CoverageRow {
  readonly capability: string;
  readonly kind: string;
  readonly doc: string;
  readonly status: string;
}

const MATRIX_HEADING = 'Capability coverage matrix';

function parseCoverageMatrix(source: string): CoverageRow[] {
  const headingMatch = source.match(new RegExp(`^(?:##|###)\\s+.*${MATRIX_HEADING}.*$`, 'm'));
  if (!headingMatch) {
    throw new Error(`no heading containing "${MATRIX_HEADING}" in ${UAT_README}`);
  }
  const after = source.slice(headingMatch.index! + headingMatch[0].length);
  const tableMatch = after.match(/(?:^\|[^\n]+\r?\n)+/m);
  if (!tableMatch) {
    throw new Error(`no markdown table beneath "${MATRIX_HEADING}" in ${UAT_README}`);
  }

  const rows: CoverageRow[] = [];
  for (const line of tableMatch[0].split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    // Header row and the `---` separator carry no backticked capability.
    const m = line.match(
      /^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/
    );
    if (m) rows.push({ capability: m[1], kind: m[2], doc: m[3], status: m[4].trim() });
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

  it('does not send a pilot to an address that returns no document', () => {
    // This guard keeps its own reason, distinct from the marketing surfaces':
    // `docs.mcp.…` is a 308 alias (ADR-0023) that renders nothing, and a setup
    // guide pointing a pilot at a bare redirect is worse than one that stays
    // quiet about documentation. The published reference is /hub/mcp/docs/.
    expect(setup).not.toContain('docs.mcp.globalstrategic.tech');
  });

  it('tells the reader which environment a pass is recorded against', () => {
    expect(setup).toMatch(/production/i);
    expect(setup).toMatch(/staging/i);
  });
});

describe('UAT coverage — the index does not overstate production evidence', () => {
  /**
   * The index used to assert per-family production status in hand-written
   * prose, duplicating facts that live in the run-log tables. Three commits
   * running shipped a mismatch — twice overstating, once understating — each
   * caught only in review. Prose cannot be kept in step by discipline, so
   * this derives the answer from the tables instead.
   *
   * A document counts as production-verified when it has at least one run-log
   * row whose `Env` cell is `prod`. The rows are `| date | tester | env | … |`,
   * so the third pipe-delimited cell is the environment.
   */
  const docsWithProdRuns = new Set<string>();
  for (const file of uatDocsOnDisk) {
    const body = read(`${UAT_DIR}/${file}`);
    for (const line of body.split(/\r?\n/)) {
      if (!line.startsWith('|')) continue;
      const cells = line.split('|').map((c) => c.trim());
      // cells[0] is the empty string before the leading pipe.
      if (cells[3] === 'prod') {
        docsWithProdRuns.add(file);
        break;
      }
    }
  }

  it('finds production runs in at least one document', () => {
    // Vacuity guard: a parser that matched nothing would make the assertion
    // below pass trivially and re-open the exact drift it exists to close.
    expect(docsWithProdRuns.size).toBeGreaterThan(0);
  });

  /**
   * The index's Verification status table, parsed the same heading-scoped way
   * as the coverage matrix. Each row's Family cell names a UAT range
   * (`UAT-01 – 06 (tool families)`, `UAT-07 (IRL pipeline)`); the Production
   * evidence cell either starts with ✅ or does not.
   *
   * An earlier version of this guard looked for a document FILENAME and the
   * phrase "production-verified" on the same line. The index never pairs
   * those, so eleven of its twelve assertions were vacuous and the twelfth
   * only matched the exact sentence it had been written against. Reading the
   * table the index actually contains is what makes the check real.
   */
  function parseStatusTable(source: string): Array<{ files: string[]; claimsProd: boolean }> {
    const heading = source.match(/^(?:##|###)\s+.*Verification status.*$/m);
    if (!heading) throw new Error(`no "Verification status" heading in ${UAT_README}`);
    const after = source.slice(heading.index! + heading[0].length);
    const table = after.match(/(?:^\|[^\n]+\r?\n)+/m);
    if (!table) throw new Error(`no table beneath "Verification status" in ${UAT_README}`);

    const out: Array<{ files: string[]; claimsProd: boolean }> = [];
    for (const line of table[0].split(/\r?\n/)) {
      if (!line.startsWith('|')) continue;
      const cells = line.split('|').map((c) => c.trim());
      const family = cells[1] ?? '';
      const evidence = cells[2] ?? '';
      // Expand `UAT-01 – 06` into 01..06; a bare `UAT-07` yields just 07.
      const range = family.match(/UAT-(\d{2})(?:\s*[–-]\s*(\d{2}))?/);
      if (!range) continue;
      const lo = Number(range[1]);
      const hi = range[2] ? Number(range[2]) : lo;
      const files: string[] = [];
      for (let n = lo; n <= hi; n++) {
        const prefix = `UAT-${String(n).padStart(2, '0')}-`;
        files.push(...uatDocsOnDisk.filter((f) => f.startsWith(prefix)));
      }
      out.push({ files, claimsProd: evidence.startsWith('✅') });
    }
    return out;
  }

  const statusRows = parseStatusTable(readme);

  it('parses a status row for every UAT document', () => {
    // Vacuity guard. The previous version of this check silently matched
    // nothing; a parser that covers no documents proves nothing about them.
    const covered = new Set(statusRows.flatMap((r) => r.files));
    expect([...covered].sort()).toEqual([...uatDocsOnDisk].sort());
  });

  it.each(uatDocsOnDisk.map((f) => [f] as const))(
    "the index's production claim for %s matches its run log",
    (file) => {
      const row = statusRows.find((r) => r.files.includes(file));
      expect(row, `no Verification status row covers ${file}`).toBeDefined();
      // Both directions: a ✅ requires a prod run-log row, and a prod run-log
      // row requires a ✅. Overstating misleads; understating buried a real
      // result for a whole commit.
      expect(row!.claimsProd).toBe(docsWithProdRuns.has(file));
    }
  );
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
  it.each([
    ['registeredToolNames', /function registeredToolNames\b/],
    // Widened when `/hub/mcp/docs/` became the second publisher of the resource
    // inventory: the scan below only ever covered the tool reader, so moving the
    // inventory derivation into the helper would have been enforced by nothing.
    ['resourceInventory', /function resourceInventory\b/],
  ])('defines %s in exactly one place under tests/', (_name, pattern) => {
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
          if (pattern.test(read(path))) definitions.push(path);
        }
      }
    };
    walk('tests');

    expect(definitions).toEqual(['tests/integration/helpers/mcp-registry.ts']);
  });
});
