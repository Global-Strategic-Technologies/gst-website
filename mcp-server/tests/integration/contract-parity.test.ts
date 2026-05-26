/**
 * Contract-parity test (BL-034 — filed 2026-05-02 closure; landed 2026-05-26).
 *
 * Walks every `mcp-server/src/docs/<tool>/CONTRACT.md` and asserts:
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
 * **Why integration**: this test reads real files and imports real
 * schemas. Unit-isolating each step would defeat the point — the
 * contract IS its real-file shape, and the schema IS the real runtime
 * gatekeeper. If either drifts, the test should fail.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

/** Repo root: this file lives at `mcp-server/tests/integration/`. */
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const CONTRACTS_DIR = resolve(REPO_ROOT, 'mcp-server', 'src', 'docs');

interface Frontmatter {
  readonly tool: string;
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
 * under our control (single-line scalars + a single optional list of
 * `tableHeading` / `schemaExport` pairs), and pulling `gray-matter` /
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
      // List value follows on subsequent indented lines.
      const list: Array<Record<string, string>> = [];
      i++;
      let current: Record<string, string> | null = null;
      while (i < lines.length && lines[i].startsWith(' ')) {
        const itemLine = lines[i];
        const itemStart = itemLine.match(/^\s+-\s+([a-zA-Z][a-zA-Z0-9]*):\s*(.+)$/);
        const itemContinue = itemLine.match(/^\s+([a-zA-Z][a-zA-Z0-9]*):\s*(.+)$/);
        if (itemStart) {
          current = { [itemStart[1]]: stripQuotes(itemStart[2]) };
          list.push(current);
        } else if (itemContinue && current) {
          current[itemContinue[1]] = stripQuotes(itemContinue[2]);
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
      relPath: `mcp-server/src/docs/${entry.name}/CONTRACT.md`,
      body: parsed.body,
      frontmatter: parsed.fm,
    });
  }
  return contracts;
}

/**
 * Extract IDs from the FIRST markdown table beneath a `### <heading>`
 * section. IDs are read from the first column, with backticks stripped.
 * Header / separator rows are skipped.
 */
function extractIdsFromTable(body: string, heading: string): string[] {
  const headingRegex = new RegExp(
    `^###\\s+${heading.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*$`,
    'm'
  );
  const headingMatch = body.match(headingRegex);
  if (!headingMatch) {
    throw new Error(`section "### ${heading}" not found`);
  }
  const after = body.slice(headingMatch.index! + headingMatch[0].length);
  const tableMatch = after.match(/(?:^\|[^\n]+\n)+/m);
  if (!tableMatch) {
    throw new Error(`no markdown table found beneath "### ${heading}"`);
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
