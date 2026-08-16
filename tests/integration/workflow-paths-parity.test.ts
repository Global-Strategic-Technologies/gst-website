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
import { extractPathBlocks, extractPaths } from './helpers/workflow-parse';

/**
 * The `paths:` extractors moved to `helpers/workflow-parse.ts` so `workflow-chain-integrity.
 * test.ts` could reuse them instead of growing a third copy of the same indent assumptions.
 * Their behaviour is unchanged — including the deliberate throw on an unparseable list item —
 * and THIS SUITE IS THE REGRESSION PROOF for that move: it still passes with no assertion
 * edited. Read the helper's docstring for why it is a hand parser and what the differential
 * against the real `yaml` parser measured.
 */

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
