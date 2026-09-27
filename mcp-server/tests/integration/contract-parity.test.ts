/**
 * Contract-parity test (BL-034 — filed 2026-05-02 closure; landed 2026-05-26).
 *
 * Walks every `mcp-server/src/docs/tools/<tool>/CONTRACT.md` and asserts:
 *
 *   1. **Frontmatter present and well-formed.** Every contract carries YAML
 *      frontmatter at the very top of the file with required fields:
 *      `tool`, `version`, `lastAuthored`, `schema`. Missing or malformed
 *      frontmatter fails CI loudly — so a new contract can't ship without
 *      the metadata the rest of the doc surface depends on.
 *
 *   2. **`schema` cite resolves.** The path in `schema:` exists on disk
 *      (relative to the repo root). Cheap link-rot guard.
 *
 *   3. **Opt-in enum parity.** If the frontmatter declares `enumParity` —
 *      an array of `{ tableHeading, schemaExport }` pairs — the test:
 *        a. Locates the `### <tableHeading>` section in the contract
 *        b. Extracts IDs from the first markdown table beneath it (first
 *           column, backtick-wrapped)
 *        c. Dynamically imports the referenced schema module
 *        d. Asserts every documented ID is in the schema's const tuple
 *           AND every tuple member is documented (bidirectional)
 *
 *      The opt-in design lets each contract enable strict parity
 *      incrementally without blocking the frontmatter discipline on
 *      figuring out the contract→schema field-by-field mapping for every
 *      tool at once. New parity wirings are one-line additions to the
 *      frontmatter; no test-code changes.
 *
 *   4. **Registry parity.** Every contract lists the tools it documents in a
 *      `tools:` frontmatter list (a module registering two tools, e.g.
 *      `search_portfolio` + `list_portfolio_facets`, has one contract). The
 *      union of those lists must equal the live `tools/list` of the stdio
 *      server — the surface with every tool — in BOTH directions. Discovery
 *      starts from the registry, not the docs: a tool registered with no
 *      contract fails here, which a docs-driven walk could never notice.
 *
 * **Why integration**: this test reads real files and imports real
 * schemas. Unit-isolating each step would defeat the point — the
 * contract IS its real-file shape, and the schema IS the real runtime
 * gatekeeper. If either drifts, the test should fail.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  LATEST_PROTOCOL_VERSION,
  type JSONRPCMessage,
  type JSONRPCResponse,
  type JSONRPCErrorResponse,
} from '@modelcontextprotocol/server';
import { createServer } from '../../src/server';
import { registerLocalOnlyTools } from '../../src/tools/_local-only';
import { stdioSnapshotReader } from '../../src/content/radar-snapshot-reader-stdio';
import { createPairedTransports } from '../helpers/paired-transport';

/** Repo root: this file lives at `mcp-server/tests/integration/`. */
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const CONTRACTS_DIR = resolve(REPO_ROOT, 'mcp-server', 'src', 'docs', 'tools');

interface Frontmatter {
  readonly tool: string;
  /** Every registered tool name this contract documents (`tool` is one of them). */
  readonly tools: ReadonlyArray<string>;
  readonly version: string;
  readonly lastAuthored: string;
  readonly schema: string;
  readonly enumParity?: ReadonlyArray<{
    readonly tableHeading: string;
    readonly schemaExport: string;
  }>;
}

interface DiscoveredContract {
  readonly path: string;
  readonly relPath: string;
  readonly body: string;
  readonly frontmatter: Frontmatter;
}

/**
 * Parse YAML frontmatter from the top of a markdown string. Returns the
 * parsed fields + the body content (without the frontmatter block).
 *
 * Deliberately a small home-grown parser: the frontmatter shape is fully
 * under our control (single-line scalars, a list of bare scalars for
 * `tools`, and an optional list of `tableHeading` / `schemaExport` pairs),
 * and pulling `gray-matter` /
 * `yaml` would add a dependency for ~20 lines of logic. If the shape
 * grows (nested arrays, multi-line strings, etc.), swap in `yaml` then.
 */
function parseFrontmatter(raw: string): { fm: Frontmatter; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error('missing YAML frontmatter block');
  const yamlText = match[1];
  const body = match[2];

  const fm: Record<string, unknown> = {};
  const lines = yamlText.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '' || line.startsWith('#')) {
      i++;
      continue;
    }
    const scalarMatch = line.match(/^([a-zA-Z][a-zA-Z0-9]*):\s*(.*)$/);
    if (!scalarMatch) {
      throw new Error(`unparseable frontmatter line: ${line}`);
    }
    const key = scalarMatch[1];
    const value = scalarMatch[2];
    if (value === '') {
      // List value follows on subsequent indented lines: either a list of
      // `- key: value` objects (`enumParity`) or of bare scalars (`tools`).
      const list: Array<Record<string, string> | string> = [];
      i++;
      let current: Record<string, string> | null = null;
      while (i < lines.length && lines[i].startsWith(' ')) {
        const itemLine = lines[i];
        const itemStart = itemLine.match(/^\s+-\s+([a-zA-Z][a-zA-Z0-9]*):\s*(.+)$/);
        const itemScalar = itemLine.match(/^\s+-\s+(\S.*)$/);
        const itemContinue = itemLine.match(/^\s+([a-zA-Z][a-zA-Z0-9]*):\s*(.+)$/);
        if (itemStart) {
          current = { [itemStart[1]]: stripQuotes(itemStart[2]) };
          list.push(current);
        } else if (itemScalar) {
          current = null;
          list.push(stripQuotes(itemScalar[1].trim()));
        } else if (itemContinue && current) {
          current[itemContinue[1]] = stripQuotes(itemContinue[2]);
        } else {
          throw new Error(`unparseable frontmatter list line: ${itemLine}`);
        }
        i++;
      }
      fm[key] = list;
      continue;
    }
    fm[key] = stripQuotes(value);
    i++;
  }
  return { fm: fm as unknown as Frontmatter, body };
}

function stripQuotes(s: string): string {
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1);
  }
  return s;
}

/** Walk the docs directory and discover every CONTRACT.md. */
function discoverContracts(): DiscoveredContract[] {
  const contracts: DiscoveredContract[] = [];
  for (const entry of readdirSync(CONTRACTS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const contractPath = join(CONTRACTS_DIR, entry.name, 'CONTRACT.md');
    if (!existsSync(contractPath)) continue;
    const raw = readFileSync(contractPath, 'utf-8');
    let parsed: { fm: Frontmatter; body: string };
    try {
      parsed = parseFrontmatter(raw);
    } catch (e) {
      throw new Error(`${contractPath}: ${(e as Error).message}`, { cause: e });
    }
    contracts.push({
      path: contractPath,
      relPath: `mcp-server/src/docs/tools/${entry.name}/CONTRACT.md`,
      body: parsed.body,
      frontmatter: parsed.fm,
    });
  }
  return contracts;
}

/**
 * Extract IDs from the FIRST markdown table beneath the FIRST h2 or h3
 * heading whose text CONTAINS the supplied `heading` substring. IDs are
 * read from the first column, with backticks stripped. Header / separator
 * rows are skipped.
 *
 * Design rationale (BL-034, 2026-05-26 audit-driven revision):
 *
 *   - **Heading levels h2 + h3** — different contracts use different
 *     conventions. `radar/CONTRACT.md` uses `### \`category\``; `tech-debt/
 *     CONTRACT.md` uses `## \`deployFrequency\` valid values` (a top-level
 *     section for its enum). Matching both keeps existing doc structure
 *     intact instead of forcing a one-size restructure.
 *
 *   - **Substring match, not exact** — contracts naturally write combined
 *     headings (`### \`companyStage\` (optional)`, `### \`mode\` and
 *     \`capexView\``) for related fields. The frontmatter's `tableHeading`
 *     is treated as a search token that must appear in the heading
 *     verbatim; the rest of the heading is allowed to contain context
 *     words ("optional", "valid values", trailing punctuation, etc.).
 *     Authors keep doc readability; the parser stays robust.
 */
function extractIdsFromTable(body: string, heading: string): string[] {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headingRegex = new RegExp(`^(?:##|###)\\s+.*${escaped}.*$`, 'm');
  const headingMatch = body.match(headingRegex);
  if (!headingMatch) {
    throw new Error(`no h2/h3 heading containing "${heading}" was found`);
  }
  const after = body.slice(headingMatch.index! + headingMatch[0].length);
  const tableMatch = after.match(/(?:^\|[^\n]+\n)+/m);
  if (!tableMatch) {
    throw new Error(`no markdown table found beneath heading containing "${heading}"`);
  }
  const rows = tableMatch[0].split(/\r?\n/).filter((l) => l.startsWith('|'));
  const ids: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Skip header (row 0) and separator (row 1 — contains `---`).
    if (i === 0 || /^\|[\s|:-]+\|$/.test(row.trim())) continue;
    const firstCol = row.split('|')[1]?.trim() ?? '';
    const id = firstCol.replace(/^`(.+)`$/, '$1');
    if (id) ids.push(id);
  }
  return ids;
}

/**
 * Resolve a `file.ts#NAMED_EXPORT` reference, returning the imported
 * value. Path is repo-relative.
 */
async function resolveSchemaExport(ref: string): Promise<unknown> {
  const [filePath, exportName] = ref.split('#');
  if (!filePath || !exportName) {
    throw new Error(`schemaExport "${ref}" must be of form "path/to/file.ts#NAMED_EXPORT"`);
  }
  const abs = resolve(REPO_ROOT, filePath);
  if (!existsSync(abs)) {
    throw new Error(`schemaExport file does not exist: ${abs}`);
  }
  // Dynamic import (vite/vitest resolves the .ts file).
  const mod = (await import(abs)) as Record<string, unknown>;
  if (!(exportName in mod)) {
    throw new Error(`export "${exportName}" not found in ${filePath}`);
  }
  return mod[exportName];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const contracts = discoverContracts();

describe('contract-parity: discovery', () => {
  it('finds at least one CONTRACT.md to enforce against', () => {
    // Guards against an accidental empty walk (e.g., docs dir renamed).
    expect(contracts.length).toBeGreaterThan(0);
  });
});

describe('contract-parity: frontmatter required fields', () => {
  it.each(contracts)('$relPath has tool / version / lastAuthored / schema', (contract) => {
    expect(contract.frontmatter.tool).toBeTruthy();
    expect(contract.frontmatter.version).toMatch(/^v\d+/);
    expect(contract.frontmatter.lastAuthored).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(contract.frontmatter.schema).toBeTruthy();
  });

  it.each(contracts)('$relPath schema path resolves on disk', (contract) => {
    const abs = resolve(REPO_ROOT, contract.frontmatter.schema);
    expect(
      existsSync(abs),
      `schema path "${contract.frontmatter.schema}" does not exist (referenced from ${contract.relPath})`
    ).toBe(true);
  });
});

/**
 * The live tool registry, read through a real `tools/list` round-trip on the
 * stdio surface (`createServer` + `registerLocalOnlyTools`, mirroring
 * `src/index.ts` and `protocol-roundtrip.test.ts`). The stdio surface is the
 * superset: the Worker omits the two stdio-only radar tools.
 */
async function listRegisteredTools(): Promise<string[]> {
  const server = createServer({}, { radarReader: stdioSnapshotReader });
  registerLocalOnlyTools(server);
  const { client, server: serverHalf } = createPairedTransports();
  await server.connect(serverHalf);

  let nextId = 1;
  const rpc = (
    method: string,
    params: unknown
  ): Promise<JSONRPCResponse | JSONRPCErrorResponse> => {
    const id = nextId++;
    return new Promise((resolveMsg) => {
      client.onmessage = (msg: JSONRPCMessage) => {
        if ('id' in msg && msg.id === id) resolveMsg(msg as JSONRPCResponse | JSONRPCErrorResponse);
      };
      void client.send({ jsonrpc: '2.0', id, method, params } as JSONRPCMessage);
    });
  };

  const init = await rpc('initialize', {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'contract-parity', version: '0.0.0' },
  });
  if ('error' in init) throw new Error(`initialize failed: ${init.error.message}`);
  await client.send({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  } as JSONRPCMessage);

  const res = await rpc('tools/list', {});
  if ('error' in res) throw new Error(`tools/list failed: ${res.error.message}`);
  const names = (res.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
  await server.close();
  return names.sort();
}

describe('contract-parity: registry (live tools/list ↔ contract `tools:` lists)', () => {
  it.each(contracts)(
    '$relPath declares a non-empty `tools:` list containing its `tool`',
    (contract) => {
      expect(Array.isArray(contract.frontmatter.tools), 'missing `tools:` frontmatter list').toBe(
        true
      );
      expect(contract.frontmatter.tools.length).toBeGreaterThan(0);
      for (const t of contract.frontmatter.tools) expect(typeof t).toBe('string');
      expect(contract.frontmatter.tools).toContain(contract.frontmatter.tool);
    }
  );

  it('no tool is claimed by two contracts', () => {
    const all = contracts.flatMap((c) => c.frontmatter.tools ?? []);
    const dupes = all.filter((t, i) => all.indexOf(t) !== i);
    expect(dupes).toEqual([]);
  });

  it('the union of contract `tools:` lists equals the live registry, both directions', async () => {
    const registered = await listRegisteredTools();
    // Vacuity guard: an empty or truncated registry would make both
    // directions trivially pass for whatever subset it happened to return.
    expect(registered.length).toBeGreaterThan(10);

    const documented = new Set(contracts.flatMap((c) => c.frontmatter.tools ?? []));
    const undocumented = registered.filter((t) => !documented.has(t));
    const unregistered = [...documented].filter((t) => !registered.includes(t)).sort();

    expect(
      undocumented,
      'these tools are registered but no CONTRACT.md lists them in its `tools:` frontmatter'
    ).toEqual([]);
    expect(
      unregistered,
      'these CONTRACT.md `tools:` entries name tools that are not registered'
    ).toEqual([]);
  });
});

describe('contract-parity: enum parity (opt-in via frontmatter)', () => {
  const withParity = contracts.filter((c) => Array.isArray(c.frontmatter.enumParity));

  it('at least one contract has opted into enum parity (proves the path works)', () => {
    expect(withParity.length).toBeGreaterThan(0);
  });

  for (const contract of withParity) {
    for (const entry of contract.frontmatter.enumParity ?? []) {
      it(`${contract.relPath} :: ${entry.tableHeading} ↔ ${entry.schemaExport}`, async () => {
        const documentedIds = extractIdsFromTable(contract.body, entry.tableHeading);
        expect(documentedIds.length, 'contract table is empty').toBeGreaterThan(0);

        const exported = await resolveSchemaExport(entry.schemaExport);
        const schemaIds = Array.isArray(exported)
          ? (exported as ReadonlyArray<string>)
          : (() => {
              throw new Error(
                `schemaExport "${entry.schemaExport}" did not resolve to an array; got ${typeof exported}`
              );
            })();

        // Bidirectional check: documented IDs ⊆ schema, and schema ⊆ documented.
        // Sorted set comparison so a future re-ordering doesn't cause flakes.
        expect([...documentedIds].sort()).toEqual([...schemaIds].sort());
      });
    }
  }
});
