/**
 * Hand parsers for `.github/workflows/*.yml`, shared by the workflow invariant suites.
 *
 * Deliberately a hand parser rather than a YAML dependency, matching the choice already made
 * in `workflow-paths-parity.test.ts` and `workflow-secret-scope.test.ts`: `yaml` is
 * transitive-only, and a direct dependency for a handful of assertions is the worse trade.
 *
 * **Equivalence checked, not assumed.** Across all 12 workflow files these extractors and the
 * real `yaml` parser agree exactly — 12 names, 5 `paths` blocks, 10 trigger-scoped `branches`
 * lists, 1 `workflow_run.workflows` list, **zero disagreements** (measured 2026-08-16, not
 * estimated). That agreement is what justifies not taking the dependency; **re-run the
 * differential if any extractor changes.** The method is the one `workflow-secret-scope.test.ts`
 * (lines 79-84) records as the only one that actually worked there: vigilance produced ten
 * fail-open paths, running the hand parser against `yaml` and diffing produced a fact.
 *
 * **THESE PARSERS MUST NOT FAIL OPEN.** A parser that returns `[]` or `undefined` for input it
 * cannot read makes every downstream assertion pass vacuously — the caller cannot tell "nothing
 * matched" from "nothing to match". So every function here THROWS on unreadable input rather
 * than returning an empty result, and callers pair each assertion with a non-zero probe.
 *
 * Two shapes bit the sibling file and are handled here from the start:
 *   - trailing comments are legal after any scalar (`name: Foo # note`);
 *   - quoted and bare scalars are the same value (`'master'` === `master`).
 * A third is specific to this repo: `branches:` values are written as **flow sequences on the
 * line after the key**, and `.github/**` is not in `.prettierignore`, so a list that grows past
 * `printWidth: 100` reflows across several lines. Single-line anchoring would silently stop
 * matching on a routine edit, so the flow-sequence reader is multi-line.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const WORKFLOWS_DIR = join(process.cwd(), '.github', 'workflows');

/** Every workflow file. `.yaml` as well as `.yml` — a `.yml`-only filter was fail-open #1 in
 *  `workflow-secret-scope.test.ts`, where a rogue `.yaml` was invisible to the guard. */
export function workflowFiles(): string[] {
  return readdirSync(WORKFLOWS_DIR).filter((f) => /\.ya?ml$/.test(f));
}

export function readWorkflow(file: string): string[] {
  return readFileSync(join(WORKFLOWS_DIR, file), 'utf8').split(/\r?\n/);
}

/** Drop whole-line comments. Restated rather than imported: the sibling file's `stripComments`
 *  is a module-local `const` with no `export`, and importing a `.test.ts` would re-register its
 *  `describe` blocks in whichever suite imported it. */
export const stripComments = (lines: string[]): string[] =>
  lines.filter((l) => !l.trimStart().startsWith('#'));

/** `'master'` -> `master`. Trailing comments are NOT stripped here — callers that must fail
 *  closed (see `workflowVar`) anchor them out instead. */
const unquote = (s: string): string => s.trim().replace(/^['"]|['"]$/g, '');

/**
 * Extract EVERY `paths:` list from a workflow.
 *
 * All of them, not the first: a workflow with both a push and a pull_request trigger has two,
 * and a drift between the two blocks of one file is a real defect class.
 *
 * An unparseable list item **throws** rather than ending the loop. A partially-parsed list makes
 * a subset assertion pass on the entries it dropped — the throw is load-bearing, not defensive
 * decoration. Verified, not assumed: double-quoting one entry in `deploy-mcp-production.yml`
 * makes vitest print `Test Files 1 failed | Tests no tests` and **exit 1**. The "no tests" line
 * reads like a skip; the exit code is what gates, and it is non-zero.
 */
export function extractPathBlocks(file: string): string[][] {
  const lines = readWorkflow(file);
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
export function extractPaths(file: string): string[] {
  return [...new Set(extractPathBlocks(file).flat())];
}

/** Like `extractPathBlocks`, but for workflows that legitimately have no `paths:` filter.
 *  A DISTINCT return, never a swallowed error: catching around `extractPathBlocks` would also
 *  swallow its unparseable-item throw, which is the one signal that must never be lost. */
export function extractPathBlocksIfAny(file: string): string[][] {
  const hasBlock = readWorkflow(file).some((l) => /^\s{4}paths:\s*$/.test(l));
  return hasBlock ? extractPathBlocks(file) : [];
}

/**
 * The workflow's own `name:` — anchored at **column 0**.
 *
 * Anchoring matters: `test-mcp-server.yml` also carries a 4-space `name:` on its job and
 * 6-space `- name:` on every step. A loose match would return a step label and compare it
 * against the `workflow_run` consumer's expectation, which is a green test over a broken chain.
 */
export function workflowName(file: string): string {
  const matches = stripComments(readWorkflow(file))
    .map((l) => /^name:\s*(.+?)\s*(?:#.*)?$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null);

  if (matches.length !== 1) {
    throw new Error(`expected exactly one column-0 \`name:\` in ${file}, found ${matches.length}`);
  }
  return unquote(matches[0][1]);
}

/**
 * The `branches:` list belonging to ONE named trigger (`push`, `pull_request`, `workflow_run`).
 *
 * Trigger-scoped on purpose. `test-mcp-server.yml` has two `branches:` lists — the push list and
 * `branches: [master]` on its `pull_request` trigger — so a union, or a first-match, still finds
 * `master` after `master` is dropped from the push list. That is a green suite over the exact
 * breakage the caller is guarding, and it is the shape this repo has already shipped once
 * (`deploy-mcp-staging.yml` lost `master` from its consumer list; see its own header comment).
 *
 * Reads a flow sequence whether it sits inline (`branches: [a, b]`) or on the following lines,
 * and whether or not Prettier has reflowed it across several.
 */
export function triggerBranches(file: string, trigger: string): string[] {
  const lines = stripComments(readWorkflow(file));
  const triggerRe = new RegExp(`^\\s{2}${trigger}:\\s*$`);

  const found: string[][] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!triggerRe.test(lines[i])) continue;

    // Walk the trigger's body: 4-space keys, until a dedent to <= 2 spaces.
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === '') continue;
      const indent = line.length - line.trimStart().length;
      if (indent <= 2) break; // dedented out of this trigger

      const inline = /^\s{4}branches:\s*(.*)$/.exec(line);
      if (!inline) continue;

      // Value is either on this line or on the following ones; either way accumulate until
      // the flow sequence closes. Anchoring to one line would break on a Prettier reflow.
      let buf = inline[1].trim();
      let k = j;
      while (!buf.includes(']') && k + 1 < lines.length) {
        buf += ' ' + lines[++k].trim();
      }
      const seq = /\[(.*)\]/s.exec(buf);
      if (!seq) throw new Error(`unreadable \`branches:\` under ${trigger}: in ${file}`);
      found.push(
        seq[1]
          .split(',')
          .map(unquote)
          .filter((s) => s.length > 0)
      );
      break;
    }
  }

  if (found.length !== 1) {
    throw new Error(
      `expected exactly one \`branches:\` under \`${trigger}:\` in ${file}, found ${found.length}`
    );
  }
  return found[0];
}

/** The `workflow_run` consumer's `workflows: [...]` list — which upstream workflow NAMES it
 *  chains off. A literal string match against those workflows' `name:` values, with nothing on
 *  the GitHub side validating it, which is the whole reason the caller asserts it. */
export function workflowRunWorkflows(file: string): string[] {
  const lines = stripComments(readWorkflow(file));
  const matches = lines
    .map((l) => /^\s{4}workflows:\s*\[(.*)\]\s*$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null);

  if (matches.length !== 1) {
    throw new Error(`expected exactly one \`workflows:\` list in ${file}, found ${matches.length}`);
  }
  return matches[0][1]
    .split(',')
    .map(unquote)
    .filter((s) => s.length > 0);
}
