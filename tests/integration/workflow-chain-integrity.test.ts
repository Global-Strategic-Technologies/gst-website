/**
 * The MCP deploy chain is held together by string literals that nothing validates.
 *
 * `deploy-mcp-production.yml` says so in prose, and said it for months with nothing behind it:
 * *"`workflows: ['MCP Server Test Suite']` is a literal string match against that workflow's
 * `name:`. A rename breaks the chain silently, and nothing asserts the two agree."* This file is
 * that assertion, plus the three other links in the same chain that are equally unguarded.
 *
 * Every failure mode here is SILENT — that is the whole reason it needs a test. A broken link
 * does not produce a red run; it produces **no run**, or a run that skips, or a 300-second poll
 * that blames the wrong thing. Nobody notices until production has been stale for weeks.
 *
 *   A. staging's `workflow_run.workflows` entry -> the suite's `name:` -> the filename the
 *      production pre-flight polls. One derived chain, not three literal comparisons.
 *   B. the producer's push trigger still reaches `master`.
 *   C. the consumer's own branch list still reaches `master`.
 *   D. `.github/workflows/*.yml` literals inside `paths:` lists still name files that exist.
 *
 * C is not hypothetical: `deploy-mcp-staging.yml`'s own header records that this exact list
 * once shipped **without** `master`, "so the merge commit never got staging validation"
 * (BL-037 follow-up after BL-038). The link that already broke was the unguarded one.
 *
 * Separate from `workflow-paths-parity.test.ts` deliberately — that file's docstring is wholly
 * about the BL-109 paths subset relation, and one invariant per file is the pattern
 * `workflow-secret-scope.test.ts` already sets. The shared parsers live in
 * `helpers/workflow-parse.ts`; read its docstring for the fail-closed discipline and the
 * `yaml` differential that justifies hand-parsing.
 *
 * **Every assertion below is paired with a non-zero probe.** A guard that silently matches
 * nothing reports green forever — this repo has shipped that defect twice (BL-124 bypassed Zod;
 * BL-125's enum walk threw on all 60 fields into a catch that swallowed it). The probes are the
 * difference between "the chain agrees" and "I found nothing to disagree about".
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  workflowFiles,
  workflowName,
  triggerBranches,
  workflowRunWorkflows,
  extractPathBlocksIfAny,
} from './helpers/workflow-parse';

const STAGING = 'deploy-mcp-staging.yml';
const SUITE = 'test-mcp-server.yml';
const PREFLIGHT = join(process.cwd(), 'scripts', 'await-mcp-test-run.sh');

/**
 * The production pre-flight's `WORKFLOW="…"` value.
 *
 * Anchored, and **exactly one assignment required**. A second assignment later in the script
 * would leave this comparison green while the runtime value differed — precisely the failure
 * this exists to close. The anchor also forbids a trailing comment, which is stricter than the
 * helpers' general tolerance: deliberate, because failing closed on `WORKFLOW="x" # note` costs
 * one obvious test fix, while failing open costs a silently broken production gate.
 */
function preflightWorkflowVar(): string {
  const matches = readFileSync(PREFLIGHT, 'utf8')
    .split(/\r?\n/)
    .map((l) => /^WORKFLOW="([^"]+)"$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null);

  expect(
    matches.length,
    'expected exactly one anchored `WORKFLOW="…"` assignment in scripts/await-mcp-test-run.sh — ' +
      'a second one makes every assertion in this file compare the wrong value'
  ).toBe(1);
  return matches[0][1];
}

describe('MCP deploy chain integrity', () => {
  it('A: staging -> suite name -> production pre-flight filename resolves end to end', () => {
    // 1. What staging chains off. `workflowRunWorkflows` throws unless exactly one
    //    `workflows:` list exists, so a multi-entry list is a loud failure rather than an
    //    ambiguous comparison below. Read only from the staging file —
    //    `deploy-mcp-production.yml:29` quotes the same literal inside a COMMENT, and matching
    //    that would assert the chain against a piece of prose.
    const chainedNames = workflowRunWorkflows(STAGING);
    expect(chainedNames.length, `${STAGING} should chain off exactly one workflow`).toBe(1);
    const chainedName = chainedNames[0];

    // Probe: the extraction found a real name, not an empty string from a mangled parse.
    expect(
      chainedName.length,
      'parsed an empty workflow name — parser is matching nothing'
    ).toBeGreaterThan(0);

    // 2. Resolve that NAME to a FILE, and require the resolution to be unique. Two workflows
    //    sharing a `name:` would both feed the consumer, and which one "the" upstream run is
    //    becomes undefined.
    const files = workflowFiles();
    expect(files.length, 'found no workflow files — parser is matching nothing').toBeGreaterThan(5);

    const resolved = files.filter((f) => workflowName(f) === chainedName);
    expect(
      resolved,
      `${STAGING} chains off "${chainedName}", which must resolve to exactly one workflow file. ` +
        'Zero means the staging deploy chain is dead and no run will ever fire it; two means ' +
        'the upstream run is ambiguous.'
    ).toHaveLength(1);

    // 3. The production pre-flight polls by FILENAME, not by name — so the two halves of the
    //    chain can drift apart. Deriving the expected filename from step 2 (rather than
    //    comparing against a literal repeated here) is what makes this catch the real defect:
    //    adding `test-mcp-server-v2.yml` and pointing WORKFLOW at it would leave a literal
    //    comparison green while production polled a workflow the deploy chain never runs.
    expect(
      preflightWorkflowVar(),
      'scripts/await-mcp-test-run.sh polls a different workflow file than the one ' +
        `${STAGING} chains off. Production would wait 300s and then exit 5 — "dead token, ` +
        'revoked permission, or a GitHub outage" — pointing the operator at the credential ' +
        'instead of at this rename.'
    ).toBe(resolved[0]);
  });

  it('B: the suite still runs on pushes to master, which the pre-flight requires', () => {
    // Trigger-SCOPED, not a union. `test-mcp-server.yml` also has `branches: [master]` on its
    // pull_request trigger, so a union (or a first-match) still finds `master` after `master` is
    // dropped from the PUSH list — green over exactly the breakage this guards. The helper
    // throws unless exactly one push-scoped list exists.
    const pushBranches = triggerBranches(SUITE, 'push');
    expect(
      pushBranches.length,
      `parsed an empty push \`branches:\` list from ${SUITE} — parser is matching nothing`
    ).toBeGreaterThan(0);

    expect(
      pushBranches,
      `${SUITE} must run on pushes to master. scripts/await-mcp-test-run.sh queries ` +
        '`?event=push` for the exact SHA being deployed, so without master in this list every ' +
        'production deploy fails its pre-flight.'
    ).toContain('master');

    // The other half of the same pairing, which otherwise lives only in a comment.
    const preflight = readFileSync(PREFLIGHT, 'utf8');
    expect(
      preflight,
      'the pre-flight no longer filters `event=push`; assertion B is guarding a requirement ' +
        'that no longer exists, and the push-branch list above is no longer load-bearing'
    ).toContain('event=push');
  });

  it('C: the staging consumer still fires on master, and never on more than the suite', () => {
    // This list shipped WITHOUT master once — deploy-mcp-staging.yml's own header records it:
    // "master was missing so the merge commit never got staging validation" (BL-038). A
    // `workflow_run` branch filter that misses is silent: no run record at all, nothing to see
    // in the Actions list, staging quietly frozen at whatever it last deployed.
    const consumerBranches = triggerBranches(STAGING, 'workflow_run');
    expect(
      consumerBranches.length,
      `parsed an empty workflow_run \`branches:\` list from ${STAGING} — parser is matching nothing`
    ).toBeGreaterThan(0);

    expect(
      consumerBranches,
      `${STAGING} must fire on master or merge commits get no staging validation — the exact ` +
        'regression BL-038 found and this list has already shipped with once.'
    ).toContain('master');

    // Subset, not equality: staging may deliberately deploy on FEWER branch families than the
    // suite tests (it omits `dependabot/**` on purpose — dependency bumps are validated but
    // never auto-deployed). It may never fire on MORE, which would mean deploying from a branch
    // the suite never ran on.
    const suitePush = triggerBranches(SUITE, 'push');
    const extra = consumerBranches.filter((b) => !suitePush.includes(b));
    expect(
      extra,
      `${STAGING} lists branch pattern(s) the MCP suite does not test: ${extra.join(', ')}. ` +
        'Staging would deploy from a branch that never ran the suite.'
    ).toEqual([]);
  });

  it('D: every workflow file named inside a `paths:` list exists on disk', () => {
    // Self-trigger literals like `.github/workflows/test-mcp-server.yml` go stale on a rename
    // with nothing complaining: `workflow-paths-parity.test.ts` compares the MCP lists only to
    // EACH OTHER, so a rename that stales both identically keeps the subset relation true and
    // the suite green while the self-trigger matches no file at all.
    //
    // `extractPathBlocksIfAny` returns [] for the 9 workflows that legitimately have no `paths:`
    // filter. It is a distinct function rather than a try/catch around `extractPathBlocks`
    // precisely so it cannot also swallow that parser's unparseable-list-item throw — the one
    // signal that must never be lost.
    const allEntries = workflowFiles().flatMap((f) => extractPathBlocksIfAny(f).flat());

    // Parser-health probe. Deliberately NOT a count of workflow literals: a legitimate removal
    // of one self-trigger would turn that red for a non-defect. Total entries proves the
    // extraction is working; the existence loop below is the actual assertion.
    expect(
      allEntries.length,
      'parsed no `paths:` entries from any workflow — the extractor is matching nothing and ' +
        'the existence check below would pass vacuously'
    ).toBeGreaterThan(20);

    const workflowLiterals = allEntries.filter((p) => /^\.github\/workflows\/.+\.ya?ml$/.test(p));
    expect(
      workflowLiterals.length,
      'no `.github/workflows/*.yml` literals found in any `paths:` list — either they were all ' +
        'removed (update this probe) or the filter regex has stopped matching'
    ).toBeGreaterThan(0);

    const missing = [...new Set(workflowLiterals)].filter(
      (p) => !existsSync(join(process.cwd(), p))
    );
    expect(
      missing,
      `workflow path filter(s) name files that do not exist: ${missing.join(', ')}. ` +
        'That filter now matches nothing, so the workflow silently stops firing on changes to it.'
    ).toEqual([]);
  });
});
