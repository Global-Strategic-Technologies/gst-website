/**
 * BL-109 — the MCP production deploy must never fire on a commit the MCP test suite
 * did not also run on.
 *
 * `deploy-mcp-production.yml` states this invariant in a comment ("Paths intentionally
 * MATCH `test-mcp-server.yml`") and it has been enforced by nothing but that comment
 * since audit gap #7 (2026-05-31). BL-109 nearly broke it: widening the test workflow's
 * `paths` to directory globs while leaving the deploy workflow's enumeration alone would
 * have let a master merge touching e.g. `src/utils/techpar-engine.ts` run the MCP suite,
 * go green, auto-deploy **staging** through the `workflow_run` chain — and never fire
 * production, leaving the two environments silently divergent on Worker runtime code.
 *
 * The drift is invisible in review: both files look reasonable in isolation, and the
 * consequence only shows up as a stale production Worker weeks later. So it gets a test.
 *
 * The assertion is the **subset** relation, not equality — that is the real invariant.
 * Production may legitimately be narrower (deploy less than you test); it may never be
 * wider (deploy something you did not test).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOWS = join(process.cwd(), '.github', 'workflows');

/**
 * Extract EVERY `paths:` list from a workflow.
 *
 * All of them, not the first: `test-mcp-server.yml` has two (push + pull_request), and
 * the DEVELOPER_TOOLING instruction is "add it to BOTH blocks" — so a drift between the
 * two blocks of one file is the same defect class this test exists to catch.
 *
 * Deliberately a small hand parser rather than a YAML dependency: adding a parser to the
 * website's dependency tree for one assertion is the worse trade. But a hand parser that
 * gives up quietly is worthless here — a partially-parsed list makes the subset assertion
 * pass on the entries it dropped. So an unparseable list item **throws** rather than
 * ending the loop.
 *
 * **The throw happens at collection time, and that does fail CI** — verified, not assumed:
 * double-quoting one entry in `deploy-mcp-production.yml` makes vitest print
 * `Test Files 1 failed | Tests no tests` and **exit 1**. The "no tests" line reads like a
 * skip; the exit code is what gates, and it is non-zero. Worth knowing before anyone
 * "fixes" this parser to fail soft.
 */
function extractPathBlocks(file: string): string[][] {
  const lines = readFileSync(join(WORKFLOWS, file), 'utf8').split(/\r?\n/);
  const blocks: string[][] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!/^\s{4}paths:\s*$/.test(lines[i])) continue;

    const out: string[] = [];
    for (const line of lines.slice(i + 1)) {
      if (/^\s*#/.test(line) || line.trim() === '') continue;
      const match = /^\s{6}- '(.+)'\s*$/.exec(line);
      if (!match) {
        // A list item we could not read is a parser bug, not the end of the block.
        // Ending the loop here would silently truncate and pass vacuously downstream.
        if (/^\s+-\s/.test(line)) {
          throw new Error(`unparseable list item in ${file}: ${JSON.stringify(line)}`);
        }
        break; // dedent or a different key — genuinely the end of the list
      }
      out.push(match[1]);
    }
    blocks.push(out);
  }

  if (blocks.length === 0) throw new Error(`no 4-space-indented \`paths:\` block in ${file}`);
  return blocks;
}

/** The union of every trigger block — what the workflow can fire on at all. */
function extractPaths(file: string): string[] {
  return [...new Set(extractPathBlocks(file).flat())];
}

describe('MCP workflow paths parity', () => {
  const testPaths = extractPaths('test-mcp-server.yml');
  const prodPaths = extractPaths('deploy-mcp-production.yml');

  it('parses a plausible list from each workflow (guards the guard)', () => {
    // If the hand parser silently returned [] the subset assertion below would pass
    // vacuously — the same way a mis-scoped guard "passes" while checking nothing.
    expect(testPaths.length).toBeGreaterThan(5);
    expect(prodPaths.length).toBeGreaterThan(5);
    expect(testPaths).toContain('mcp-server/**');
    expect(prodPaths).toContain('mcp-server/**');
  });

  it("test-mcp-server.yml's push and pull_request blocks agree with each other", () => {
    // The "add it to BOTH blocks" instruction in DEVELOPER_TOOLING, asserted. A path
    // added to push but not pull_request (or vice versa) is the same silent drift this
    // file exists to catch, one level down.
    //
    // NOT redundant with the subset case below, and this is why: `extractPaths` unions
    // every block, so a path present in only one of them still appears in the union and
    // the subset assertion structurally cannot see the drift. Deleting this case as
    // duplicative would remove the only coverage of it.
    const blocks = extractPathBlocks('test-mcp-server.yml');
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const block of blocks.slice(1)) {
      // `toEqual` on arrays is order-sensitive, so the message says so. Keeping the two
      // blocks literally identical is a simpler invariant than set-equality, and makes a
      // side-by-side read of the file trivial.
      expect(
        block,
        'push and pull_request `paths` must list the same entries in the same order'
      ).toEqual(blocks[0]);
    }
  });

  it('production paths are a SUBSET of the MCP test-suite paths', () => {
    const missing = prodPaths.filter((p) => !testPaths.includes(p));
    expect(
      missing,
      `deploy-mcp-production.yml lists path(s) that test-mcp-server.yml does not: ${missing.join(', ')}.\n` +
        'Production would deploy on a commit the MCP suite never ran on (audit gap #7). ' +
        'Add them to test-mcp-server.yml, or remove them here.'
    ).toEqual([]);
  });

  it('the website modules the Worker bundles are covered by BOTH', () => {
    // The BL-109 failure mode in the other direction: test fires, production does not,
    // and staging silently leads production.
    for (const glob of ['src/utils/**', 'src/schemas/**', 'src/data/common/**']) {
      expect(testPaths, `${glob} missing from test-mcp-server.yml`).toContain(glob);
      expect(prodPaths, `${glob} missing from deploy-mcp-production.yml`).toContain(glob);
    }
  });
});
