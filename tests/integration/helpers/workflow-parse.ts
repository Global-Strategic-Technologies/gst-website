/**
 * Hand parsers for `.github/workflows/*.yml`, shared by the workflow invariant suites.
 *
 * Deliberately a hand parser rather than a YAML dependency, matching the choice already made
 * in `workflow-paths-parity.test.ts` and `workflow-secret-scope.test.ts`: `yaml` is
 * transitive-only, and a direct dependency for a handful of assertions is the worse trade.
 *
 * **Equivalence checked, not assumed.** Across all 12 workflow files these extractors and the
 * real `yaml` parser agree exactly — 12 names, 5 `paths` blocks, 10 trigger-scoped `branches`
 * lists, 1 `workflow_run.workflows` list, **zero disagreements** (measured, not estimated).
 * That agreement is what justifies not taking the dependency; **re-run the differential if any
 * extractor changes.** The method is the one `workflow-secret-scope.test.ts` (lines 79-84)
 * records as the only one that actually worked there: vigilance produced ten fail-open paths,
 * running the hand parser against `yaml` and diffing produced a fact.
 *
 * **THESE PARSERS MUST NOT FAIL OPEN.** A parser that returns `[]` or `undefined` for input it
 * cannot read makes every downstream assertion pass vacuously — the caller cannot tell "nothing
 * matched" from "nothing to match". So every function here THROWS on unreadable input rather
 * than returning an empty result, and callers pair each assertion with a non-zero probe.
 *
 * **The differential is necessary but not sufficient, and that cost a real defect.** It compares
 * this parser against `yaml` on the CURRENT tree, so it can only see shapes the repo happens to
 * contain today. It passed clean while `triggerBranches` still had a fail-open: its accumulation
 * loop was bounded by end-of-file rather than by the trigger block, so rewriting a `branches:`
 * list in **block-sequence form** (legal YAML, accepted by GitHub) made the reader run past the
 * trigger and adopt the NEXT trigger's list. A mutation dropping `master` from the push list
 * then parsed as `['master']` — borrowed from the `pull_request` trigger below it — and the
 * assertion guarding that exact regression stayed green. Caught in code review, not by the
 * differential and not by the mutation matrix, because both only exercised shapes already in the
 * tree. **The structural answer is `workflow-parse-guards.test.ts`**, which drives every throw
 * path in this file over synthetic fixtures, including shapes the repo does not currently use.
 * Add a case there for any parsing rule you add here.
 *
 * Shapes handled from the start, each because it bit the sibling file or this one:
 *   - trailing comments are legal after any scalar (`name: Foo # note`);
 *   - quoted and bare scalars are the same value (`'master'` === `master`);
 *   - `branches:` flow sequences reflow across lines once they pass `printWidth: 100`, and
 *     `.github/**` is not in `.prettierignore`, so single-line anchoring would silently stop
 *     matching on a routine edit — the reader is multi-line but **bounded to its trigger**;
 *   - the block-sequence form of `branches:` and the inline form of `paths:` are legal YAML
 *     that these parsers do NOT read, so they throw rather than return a partial answer.
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

/** Drop whole-line comments. Restated rather than imported from `workflow-secret-scope.test.ts`,
 *  where it began life as a module-local `const` — importing a `.test.ts` would re-register its
 *  `describe` blocks in whichever suite imported it. That file now imports THIS one. */
export const stripComments = (lines: string[]): string[] =>
  lines.filter((l) => !l.trimStart().startsWith('#'));

/** `'master'` -> `master`. Trailing comments are NOT stripped here — callers that must fail
 *  closed anchor them out instead. */
const unquote = (s: string): string => s.trim().replace(/^['"]|['"]$/g, '');

/** A line still inside a 2-space-keyed block (blank lines count as inside). The bound that
 *  keeps a multi-line read from escaping into the next sibling key. */
const insideBlock = (lines: string[], idx: number): boolean =>
  idx < lines.length &&
  (lines[idx].trim() === '' || lines[idx].length - lines[idx].trimStart().length > 2);

// ─────────────────────────────────────────────────────────────────────────────
// Pure, line-based cores. Split out from the file-reading wrappers so
// `workflow-parse-guards.test.ts` can drive every throw path over synthetic
// fixtures — including YAML shapes this repo does not currently contain, which
// is precisely what the `yaml` differential cannot cover.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract EVERY `paths:` block from a workflow's lines.
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
export function parsePathBlocks(lines: string[], label = '<lines>'): string[][] {
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
          throw new Error(`unparseable list item in ${label}: ${JSON.stringify(line)}`);
        }
        break; // dedent or a different key — genuinely the end of the list
      }
      out.push(match[1]);
    }
    blocks.push(out);
  }

  if (blocks.length === 0) throw new Error(`no 4-space-indented \`paths:\` block in ${label}`);
  return blocks;
}

/**
 * Like `parsePathBlocks`, but for workflows that legitimately have no `paths:` filter.
 *
 * A DISTINCT function, never a try/catch around `parsePathBlocks`: catching would also swallow
 * that parser's unparseable-item throw, which is the one signal that must never be lost.
 *
 * "Has no `paths:` filter" is decided by counting `paths:` KEYS against BLOCK-form keys, not by
 * looking for block form alone — otherwise an inline `paths: ['a', 'b']` (legal YAML) is silently
 * classified as "no filter at all" and its entries never reach the caller's existence check.
 * That is a fail-open, and it is the same mistake as the `branches:` one recorded in this
 * module's header, one key over.
 */
export function parsePathBlocksIfAny(lines: string[], label = '<lines>'): string[][] {
  const anyKey = lines.filter((l) => /^\s{4}paths:/.test(l)).length;
  const blockKey = lines.filter((l) => /^\s{4}paths:\s*$/.test(l)).length;

  if (anyKey !== blockKey) {
    throw new Error(
      `${label} has an inline \`paths:\` value; only the block-sequence form is parsed, so its ` +
        'entries would be silently skipped rather than checked'
    );
  }
  return blockKey > 0 ? parsePathBlocks(lines, label) : [];
}

/**
 * The workflow's own `name:` — anchored at **column 0**.
 *
 * Anchoring matters: `test-mcp-server.yml` also carries a 4-space `name:` on its job and
 * 6-space `- name:` on every step. A loose match would return a step label and compare it
 * against the `workflow_run` consumer's expectation, which is a green test over a broken chain.
 */
export function parseWorkflowName(lines: string[], label = '<lines>'): string {
  const matches = stripComments(lines)
    .map((l) => /^name:\s*(.+?)\s*(?:#.*)?$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null);

  if (matches.length !== 1) {
    throw new Error(`expected exactly one column-0 \`name:\` in ${label}, found ${matches.length}`);
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
 * Two bounds make the scoping real rather than nominal, and the second was missing on first
 * write — see the fail-open recorded in this module's header:
 *   1. the SEARCH stops at a dedent to <= 2 spaces (finding the right key);
 *   2. the multi-line VALUE accumulation is bounded the same way (reading only that key's
 *      value). Without 2, a `branches:` whose flow sequence never closes inside its own trigger
 *      keeps consuming until it finds a `]` — which may belong to the next trigger entirely.
 *
 * Only the flow-sequence form is read. The block-sequence form throws rather than returning a
 * partial or borrowed answer.
 */
export function parseTriggerBranches(
  rawLines: string[],
  trigger: string,
  label = '<lines>'
): string[] {
  const lines = stripComments(rawLines);
  const triggerRe = new RegExp(`^\\s{2}${trigger}:\\s*$`);

  const found: string[][] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!triggerRe.test(lines[i])) continue;

    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === '') continue;
      const indent = line.length - line.trimStart().length;
      if (indent <= 2) break; // dedented out of this trigger

      const inline = /^\s{4}branches:\s*(.*)$/.exec(line);
      if (!inline) continue;

      let buf = inline[1].trim();
      let k = j;
      // Value on the following line(s) — but never past this TRIGGER's block. Note the bound
      // is the trigger, not the `branches:` key itself: an unterminated flow sequence can still
      // absorb a sibling key inside the same trigger (`branches: [dev,` then `paths: [...]`
      // yields a junk entry rather than a throw). That shape is invalid YAML which GitHub
      // rejects outright, so it cannot produce a silently-broken-but-running workflow — it
      // fails closed. The bound that matters for the fail-open recorded in the header is the
      // trigger boundary, and that one is exact.
      while (buf === '' && insideBlock(lines, k + 1)) buf = lines[++k].trim();

      if (!buf.startsWith('[')) {
        throw new Error(
          `\`branches:\` under \`${trigger}:\` in ${label} is not a flow sequence. The ` +
            'block-sequence form is legal YAML but is not read here, and continuing would ' +
            "borrow the NEXT trigger's list — a green test over a broken invariant."
        );
      }
      while (!buf.includes(']') && insideBlock(lines, k + 1)) buf += ' ' + lines[++k].trim();

      const seq = /\[(.*)\]/s.exec(buf);
      if (!seq) {
        throw new Error(
          `unterminated \`branches:\` flow sequence under \`${trigger}:\` in ${label}`
        );
      }
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
      `expected exactly one \`branches:\` under \`${trigger}:\` in ${label}, found ${found.length}`
    );
  }
  return found[0];
}

/** The `workflow_run` consumer's `workflows: [...]` list — which upstream workflow NAMES it
 *  chains off. A literal string match against those workflows' `name:` values, with nothing on
 *  the GitHub side validating it, which is the whole reason the caller asserts it. */
export function parseWorkflowRunWorkflows(lines: string[], label = '<lines>'): string[] {
  const matches = stripComments(lines)
    .map((l) => /^\s{4}workflows:\s*\[(.*)\]\s*$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null);

  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one \`workflows:\` list in ${label}, found ${matches.length}`
    );
  }
  return matches[0][1]
    .split(',')
    .map(unquote)
    .filter((s) => s.length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// File-reading wrappers.
// ─────────────────────────────────────────────────────────────────────────────

export function extractPathBlocks(file: string): string[][] {
  return parsePathBlocks(readWorkflow(file), file);
}

/** The union of every trigger block — what the workflow can fire on at all. */
export function extractPaths(file: string): string[] {
  return [...new Set(extractPathBlocks(file).flat())];
}

/**
 * Like `extractPathBlocks`, but tolerates workflows with no `paths:` filter.
 * See `parsePathBlocksIfAny` for why that tolerance is key-counted rather than form-sniffed.
 */
export function extractPathBlocksIfAny(file: string): string[][] {
  return parsePathBlocksIfAny(readWorkflow(file), file);
}

export function workflowName(file: string): string {
  return parseWorkflowName(readWorkflow(file), file);
}

export function triggerBranches(file: string, trigger: string): string[] {
  return parseTriggerBranches(readWorkflow(file), trigger, file);
}

export function workflowRunWorkflows(file: string): string[] {
  return parseWorkflowRunWorkflows(readWorkflow(file), file);
}
