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
 *
 * A second invariant sits beside it: the lists must COVER what the Worker imports. The
 * completeness case walks `mcp-server/src/**` imports that leave `mcp-server/`, follows the
 * website modules they reach transitively, and asserts every file reached matches a glob in
 * both workflows. Proved to fire (2026-09-26): removing `'src/types/**'` from both workflows
 * fails it on `src/types/portfolio.ts`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
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

  it('every website file the Worker imports (transitively) is covered by BOTH', () => {
    // Replaces a hardcoded trio (`src/utils/**`, `src/schemas/**`, `src/data/common/**`)
    // that stayed green while `src/data/techpar/stages.ts` (via techpar-engine.ts) and
    // `src/types/portfolio.ts` (via filterLogic.ts) were outside both lists — a PR touching
    // only those ran zero MCP tests and never deployed. The list is now DERIVED from the
    // import graph, so the next new transitive dependency fails here instead of silently.
    //
    // Prod is checked too (not just implied by the subset case): the BL-109 failure mode
    // in the other direction is test fires, production does not, and staging silently
    // leads production.
    const reached = websiteFilesReachedByWorker();

    // Non-zero probes: a walker that matched nothing would make the loop below vacuous.
    expect(reached.length, 'import walk reached no website files').toBeGreaterThan(10);
    expect(reached).toContain('src/utils/techpar-engine.ts');
    expect(reached).toContain('src/data/techpar/stages.ts');

    for (const [label, list] of [
      ['test-mcp-server.yml', testPaths],
      ['deploy-mcp-production.yml', prodPaths],
    ] as const) {
      const uncovered = reached.filter((f) => !matchesPathFilter(f, list));
      expect(
        uncovered,
        `${label} paths do not cover website file(s) the Worker imports: ${uncovered.join(', ')}. ` +
          'A PR touching only these runs no MCP tests / never deploys. Add a glob to BOTH ' +
          'workflows (both blocks of test-mcp-server.yml).'
      ).toEqual([]);
    }
  });
});

describe('matchesPathFilter (the glob matcher the completeness case relies on)', () => {
  // The completeness case is only as good as this matcher; a matcher that returned `true`
  // for everything would make it vacuous. Known-present and known-absent cases both.
  it('honours **, *, and ordered ! negation', () => {
    expect(matchesPathFilter('src/utils/a/b.ts', ['src/utils/**'])).toBe(true);
    expect(matchesPathFilter('src/utilsX/b.ts', ['src/utils/**'])).toBe(false);
    expect(matchesPathFilter('src/types/portfolio.ts', ['src/utils/**'])).toBe(false);
    expect(matchesPathFilter('mcp-server/a/b.md', ['mcp-server/**', '!mcp-server/**/*.md'])).toBe(
      false
    );
    expect(matchesPathFilter('mcp-server/b.md', ['mcp-server/**', '!mcp-server/**/*.md'])).toBe(
      false
    );
    expect(matchesPathFilter('mcp-server/a/b.ts', ['mcp-server/**', '!mcp-server/**/*.md'])).toBe(
      true
    );
    expect(matchesPathFilter('src/a.json', ['src/*.json'])).toBe(true);
    expect(matchesPathFilter('src/x/a.json', ['src/*.json'])).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Import-graph walk + glob matching. Local on purpose: `picomatch` is only a
// transitive dependency, so importing it here would be an undeclared dependency.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const MCP_SRC = join(ROOT, 'mcp-server', 'src');

/** GitHub `paths` glob -> RegExp. `**` spans directories, `*` stays within one segment. */
function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        re += '(?:.*/)?';
        i += 2;
      } else {
        re += '.*';
        i += 1;
      }
    } else if (c === '*') {
      re += '[^/]*';
    } else {
      re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

/** GitHub semantics: patterns apply in order, and a later `!pattern` un-matches. */
function matchesPathFilter(file: string, patterns: readonly string[]): boolean {
  let matched = false;
  for (const p of patterns) {
    if (p.startsWith('!')) {
      if (globToRegExp(p.slice(1)).test(file)) matched = false;
    } else if (globToRegExp(p).test(file)) {
      matched = true;
    }
  }
  return matched;
}

function listTs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return listTs(p);
    return /\.ts$/.test(e.name) ? [p] : [];
  });
}

/**
 * Every relative specifier in a module: `import … from`, `export … from`, side-effect
 * `import '…'`, and `import('…')`. Type-only imports are included deliberately — the MCP
 * workflow type-checks the Worker, so a website type change can break it too.
 */
function relativeSpecifiers(source: string): string[] {
  const out: string[] = [];
  const res = [
    /\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]/g,
    /\bimport\s+['"](\.{1,2}\/[^'"]+)['"]/g,
    /\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g,
  ];
  for (const re of res) for (const m of source.matchAll(re)) out.push(m[1].replace(/\?.*$/, ''));
  return out;
}

/** Resolve like the bundler: exact file, then `.ts`/`.json`, then `index.ts`. Throws on a
 *  miss rather than skipping — a silently dropped edge would shrink the graph (fail-open). */
function resolveSpecifier(fromFile: string, spec: string): string {
  const base = resolve(dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.json`,
    base.replace(/\.js$/, '.ts'),
    join(base, 'index.ts'),
  ];
  const hit = candidates.find((c) => existsSync(c) && statSync(c).isFile());
  if (!hit) throw new Error(`cannot resolve ${JSON.stringify(spec)} from ${fromFile}`);
  return hit;
}

/** Repo-relative, forward-slashed paths of every file OUTSIDE mcp-server/ that the Worker
 *  source reaches, following website modules' own relative imports transitively. */
function websiteFilesReachedByWorker(): string[] {
  const mcpRoot = join(ROOT, 'mcp-server') + sep;
  const seen = new Set<string>();
  const queue: string[] = [];

  for (const file of listTs(MCP_SRC)) {
    for (const spec of relativeSpecifiers(readFileSync(file, 'utf8'))) {
      const target = resolveSpecifier(file, spec);
      if (!target.startsWith(mcpRoot) && !seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }

  while (queue.length > 0) {
    const file = queue.shift()!;
    if (!/\.ts$/.test(file)) continue; // .json and other leaves import nothing
    for (const spec of relativeSpecifiers(readFileSync(file, 'utf8'))) {
      const target = resolveSpecifier(file, spec);
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }

  return [...seen].map((f) => relative(ROOT, f).split(sep).join('/')).sort();
}
