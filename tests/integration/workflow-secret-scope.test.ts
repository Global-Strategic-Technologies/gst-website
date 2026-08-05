/**
 * BL-111 defect 2, structural half — a job that can read the CI/CD deploy credentials
 * must bind a GitHub Environment.
 *
 * Why this needs a test rather than a comment. GitHub resolves `secrets.FOO` from the
 * repository scope whenever the job binds no `environment:`, and it does so **silently** —
 * no warning, no annotation, and the deploy works exactly as before. That is precisely how
 * `CLOUDFLARE_API_TOKEN` came to sit at repository level, readable by every job in every
 * workflow in this repo, for a token that can deploy the production Worker (Cloudflare
 * scopes `Workers Scripts: Edit` per ACCOUNT — a staging-only deploy token is not
 * expressible). Deleting an `environment:` key is a one-line change that reopens the whole
 * exposure and reads as tidying in review.
 *
 * Deliberately a hand parser rather than a YAML dependency, matching
 * `workflow-paths-parity.test.ts`: `yaml` is transitive-only, and a direct dependency for
 * one assertion is the worse trade.
 *
 * Equivalence checked, not assumed: across all 12 workflows the hand parser and the real
 * `yaml` parser agree exactly — 15 jobs vs 15, identical environment bindings (including
 * the rollback ternary), identical secret references, no top-level `env:` in either. That
 * agreement is what justifies not taking the dependency; re-run it if the parser changes.
 *
 * **THE PARSER MUST NOT FAIL OPEN, AND IT DID — TEN TIMES, ACROSS FOUR REVIEW ROUNDS.**
 * Each was proved by dropping a rogue workflow holding an unbound deploy secret and
 * watching the suite stay green:
 *
 *   1. `.yml`-only file filter — a rogue `.yaml` was invisible.
 *   2. `/^jobs:\s*$/` + `continue` — `jobs: # note` silently dropped the whole file.
 *   3. Environment names read from *quoted* literals only — both deploy jobs write the name
 *      bare, so a typo'd `mcp-stagng` passed green.
 *   4. The job-header regex kept that byte-exact shape after (2) was fixed, and its miss
 *      path was worse: `  rogue: # note` did not match, `current` was non-null, so the
 *      rogue job's body was **appended to the preceding job** and inherited its binding.
 *      The paired positive assertions could not see it — the rogue never became a job, it
 *      became more lines of one already in the expected set.
 *   5. The workflow-level `env:` check sliced everything above `jobs:`. YAML mapping keys
 *      are unordered, so a top-level `env:` written *below* `jobs:` was outside the parse
 *      window — the exact hole that assertion was added to close.
 *   6. The `secrets: inherit` guard added to close (5)'s round shipped without a trailing-
 *      comment allowance — one function below the docstring rule saying trailing comments
 *      are legal everywhere. `secrets: inherit # needs everything` passed green.
 *   7. Membership tested only `secrets.NAME`. `secrets['NAME']` is valid expression syntax,
 *      so an unbound job holding the production token via the index form was invisible —
 *      and the positive pairing could not see it either, since the rogue simply never
 *      entered the holders list, which stayed exactly the three expected entries.
 *   8. The `secrets[<expr>]` guard added to close (7) scanned job bodies ONLY, not the
 *      `outside` complement — so a top-level `env:` indexing by expression passed green.
 *      That is (5) recurring inside its own round's fix, 200 lines below the rule
 *      "compute by complement, never by position".
 *   9. Membership was case-SENSITIVE. GitHub documents secret names as case-insensitive,
 *      so `secrets.cloudflare_api_token` in an unbound job was invisible — the direct
 *      counterexample to rule "match every syntax the platform accepts", sitting inside
 *      the function that rule was written for.
 *  10. `secrets: "inherit"` (quoted) and `secrets ['NAME']` (space before bracket) both
 *      evaded. Syntax whack-a-mole is why (10) is answered structurally as well: the
 *      `reusableWorkflowCallers` assertion removes inheritance's PRECONDITION — a
 *      job-level `uses:` — rather than chasing spellings of the keyword.
 *
 * So the rules this file is built on, each bought with a green mutation:
 *
 *   - **Never skip; throw.** Any line at job-header indent that is not a job header is
 *     unparsed structure, not something to absorb.
 *   - **Compute by complement, never by position.**
 *   - **Pair every negative assertion with a positive one** proving its subject was found —
 *     "no violations" and "nothing examined" are the same green. Necessary, NOT sufficient:
 *     (4) and (7) both satisfy the pairing while hiding a rogue.
 *   - **Trailing comments are legal everywhere** — the difference in (2), (4) and (6).
 *   - **Match every syntax the platform accepts**, not the one this repo happens to use:
 *     `.yml`/`.yaml`, `secrets.X`/`secrets['X']`, inline/block `environment:`.
 *   - **What cannot be resolved gets asserted absent, not assumed away** — `secrets:
 *     inherit` and `secrets[<expr>]` are named exclusions with their own tests.
 *   - **Prefer removing a precondition to matching a syntax.** Ten paths in, the pattern is
 *     clear: every syntax match invites the next variant. Asserting no job-level `uses:`
 *     ends the `secrets: inherit` class outright; the keyword regex is only belt.
 *
 * **The method that actually works is none of the above — it is the differential check.**
 * Vigilance produced ten fail-open paths; running this parser against the real `yaml`
 * parser and diffing the results produced a fact. Rules 1-6 are what the diffs taught;
 * the diff is what to re-run.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOWS = join(process.cwd(), '.github', 'workflows');

/**
 * Secrets that grant deploy authority over the Worker. A job holding any of these is a job
 * that must be environment-scoped.
 *
 * `MCP_PROBE_KEY` is deliberately absent — it is a read-only probe credential, not deploy
 * authority, and `latency-probe.yml` binds no environment and legitimately needs it at
 * repository level. Its residency is pinned by its own assertion below rather than being
 * special-cased here, so "it's fine, it's just the probe key" cannot quietly expand.
 */
const DEPLOY_SECRETS = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'SENTRY_AUTH_TOKEN'];

/** Every environment this deploy topology defines. A name outside it is a typo. */
const KNOWN_ENVIRONMENTS = ['mcp-staging', 'mcp-production', 'mcp-production-rollback'];

interface Job {
  workflow: string;
  name: string;
  /** Job body with comment-only lines removed — see `secrets.X` membership below. */
  body: string;
  /** Every environment name this job can bind, expression arms resolved. */
  environments: string[];
}

/** Strip comment-only lines so a `secrets.X` mention inside a comment isn't a reference. */
const stripComments = (lines: string[]) => lines.filter((l) => !l.trimStart().startsWith('#'));

/**
 * Does this body read `secret`?
 *
 * BOTH forms. `secrets['NAME']` is valid GitHub expression syntax and a plain
 * `.includes('secrets.NAME')` never sees it — an unbound job holding the
 * production-capable token via the index form passed this suite 9/9 green. The positive
 * pairing cannot catch it either: the rogue simply never enters the holders list, which
 * stays exactly the three expected entries.
 */
const referencesSecret = (body: string, secret: string): boolean =>
  // Case-INSENSITIVE, and tolerant of whitespace around `.` and `[`. GitHub documents
  // secret names as not case-sensitive, so an unbound job reading
  // `secrets.cloudflare_api_token` is a real reference this must see — the direct
  // counterexample to this file's own rule about matching what the PLATFORM accepts.
  // Interpolating `secret` into a RegExp is safe because GitHub secret names are limited
  // to letters, digits and underscores; DEPLOY_SECRETS is a literal list above regardless.
  new RegExp(String.raw`secrets\s*\.\s*` + secret, 'i').test(body) ||
  new RegExp(String.raw`secrets\s*\[\s*['"]\s*` + secret, 'i').test(body);

/**
 * `secrets[<expression>]` with a non-literal index — `secrets[matrix.env]`, the shape a
 * staging/production matrix produces. No membership test can resolve the name, so this gets
 * the same treatment as `secrets: inherit`: asserted absent rather than pretended-about.
 */
const dynamicSecretIndex = (body: string): boolean =>
  [...body.matchAll(/secrets\s*\[\s*([^\]]*)\]/g)].some((m) => !/^['"]/.test(m[1].trim()));

/**
 * Resolve the environment names a `name:` value can produce.
 *
 * Bare (`mcp-staging`) and quoted forms yield themselves. A `${{ }}` expression is split on
 * `&&` / `||` and each arm contributing a literal is taken — skipping arms containing a
 * comparison, since `inputs.environment == 'production'` names an INPUT value, not an
 * environment. That is what lets the rollback ternary be checked rather than waved through.
 */
function resolveEnvironmentNames(raw: string): string[] {
  // Strip a trailing comment — `environment: mcp-staging # note` otherwise yields the
  // comment text as part of the name. Same trailing-comment blind spot as the job header.
  const value = raw.replace(/\s+#.*$/, '').trim();
  if (!value.includes('${{')) {
    return [value.replace(/^['"]|['"]$/g, '')].filter(Boolean);
  }
  return value
    .split(/&&|\|\|/)
    .filter((arm) => !/[=!]=/.test(arm))
    .flatMap((arm) => [...arm.matchAll(/'([^']*)'/g)].map((m) => m[1]))
    .filter(Boolean);
}

/** Read the `environment:` binding(s) of one job body — inline and block forms both. */
function environmentNamesOf(bodyLines: string[]): string[] {
  const names: string[] = [];

  for (let i = 0; i < bodyLines.length; i++) {
    const header = bodyLines[i].match(/^ {4}environment:\s*(.*)$/);
    if (!header) continue;

    // Inline form: `environment: mcp-staging`
    if (header[1].trim()) {
      names.push(...resolveEnvironmentNames(header[1]));
      continue;
    }

    // Block form: read `name:` until the block ends (indent back to <= 4).
    for (let j = i + 1; j < bodyLines.length; j++) {
      const line = bodyLines[j];
      if (line.trim() === '') continue;
      if ((line.match(/^ */) ?? [''])[0].length <= 4) break;
      const nameLine = line.match(/^\s*name:\s*(.+)$/);
      if (nameLine) names.push(...resolveEnvironmentNames(nameLine[1]));
    }
  }
  return names;
}

interface Parsed {
  jobs: Job[];
  /** Files seen, so a workflow contributing zero jobs is detectable. */
  workflows: string[];
  /** Deploy-secret references outside every job body — i.e. workflow-level `env:`. */
  workflowLevelSecretRefs: string[];
  /** Workflows using `secrets: inherit`, which no membership test can see. */
  secretsInheritUsers: string[];
  /** Workflows indexing `secrets[<expr>]` with a non-literal — name unresolvable. */
  dynamicIndexUsers: string[];
  /** Workflows with a job-level `uses:` — the precondition for `secrets: inherit`. */
  reusableWorkflowCallers: string[];
}

function parseWorkflows(): Parsed {
  const jobs: Job[] = [];
  const workflows: string[] = [];
  const workflowLevelSecretRefs: string[] = [];
  const secretsInheritUsers: string[] = [];
  const dynamicIndexUsers: string[] = [];
  const reusableWorkflowCallers: string[] = [];

  // `.ya?ml` — GitHub accepts both, and matching only `.yml` let a rogue `.yaml` workflow
  // holding an unbound deploy secret pass this suite untouched.
  for (const workflow of readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))) {
    workflows.push(workflow);
    const lines = readFileSync(join(WORKFLOWS, workflow), 'utf8').split(/\r?\n/);

    // `(\s|$)` not `\s*$`: `jobs: # comment` is valid YAML, and the stricter match combined
    // with `continue` silently dropped the whole file. THROW, never skip — every workflow
    // has a jobs block, so its absence is a parse failure and must be loud.
    const start = lines.findIndex((l) => /^jobs:(\s|$)/.test(l));
    if (start === -1) throw new Error(`${workflow}: no 'jobs:' block found — parser is wrong`);

    // Which line indices ended up inside a job body. Everything else is "outside", and
    // outside is where a workflow-level `env:` lives — ON EITHER SIDE of `jobs:`. Slicing
    // `lines[0..start]` only caught the ones above it; YAML mapping keys are unordered, and
    // a top-level `env:` written AFTER `jobs:` put a deploy token into every job of the
    // file while sitting outside the parse window entirely. Complement, never position.
    const attributed = new Set<number>();

    let current: { name: string; lines: string[] } | null = null;
    const flush = () => {
      if (current) {
        const body = stripComments(current.lines);
        jobs.push({
          workflow,
          name: current.name,
          body: body.join('\n'),
          environments: environmentNamesOf(current.lines),
        });
      }
      current = null;
    };

    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '' || line.trimStart().startsWith('#')) {
        if (current) {
          current.lines.push(line);
          attributed.add(i);
        }
        continue;
      }
      if (/^\S/.test(line)) break; // a top-level key ends the jobs section

      // Trailing comments are legal on a job header, and the byte-exact version of this
      // regex was C2 reappearing one line lower — with a WORSE miss path than the original.
      // `  rogue: # note` failed the match, `current` was non-null, so the rogue job's whole
      // body was appended to the PRECEDING job and inherited its environment binding. The
      // suite stayed green, and the paired positive assertions could not see it: the rogue
      // never became a job, it became more lines of one already in the expected set.
      const jobHeader = line.match(/^ {2}([A-Za-z0-9_-]+):\s*(#.*)?$/);
      if (jobHeader) {
        flush();
        current = { name: jobHeader[1], lines: [] };
        continue;
      }
      // Anything at job-header indent that is not a job header is unparsed structure.
      // Throw — absorbing it into the previous job is exactly the silent merge above.
      if (/^ {2}\S/.test(line)) {
        throw new Error(
          `${workflow}: line ${i + 1} sits at job-header indent but did not parse as a job header — ${line}`
        );
      }
      if (!current) {
        throw new Error(`${workflow}: content under 'jobs:' before any job header — line ${i + 1}`);
      }
      current.lines.push(line);
      attributed.add(i);
    }
    flush();

    const outside = stripComments(lines.filter((_, i) => !attributed.has(i))).join('\n');
    for (const secret of DEPLOY_SECRETS) {
      if (referencesSecret(outside, secret)) workflowLevelSecretRefs.push(workflow);
    }
    // `secrets: inherit` hands a called workflow every secret the caller can read, with no
    // `secrets.NAME` token anywhere for the membership test to find. The repo uses no
    // reusable workflows, so the honest guard is that it stays that way — modelling the
    // inheritance properly would mean resolving `uses:` targets.
    //
    // `(#.*)?` — this guard shipped WITHOUT it, one function below the docstring rule
    // saying trailing comments are legal everywhere, and `secrets: inherit # needs
    // everything` passed 9/9 green. Sixth instance.
    const whole = stripComments(lines).join('\n');
    // `['"]?` — YAML parses `secrets: "inherit"` to the same scalar. Widening the keyword
    // match is the cheap half; the structural half is `reusableWorkflowCallers` below, which
    // asserts the PRECONDITION for inheritance is absent rather than chasing syntax.
    if (/^\s*secrets:\s*['"]?inherit['"]?\s*(#.*)?$/m.test(whole)) {
      secretsInheritUsers.push(workflow);
    }
    // Job-level `uses:` (4-space indent, directly under a job) is a reusable-workflow call.
    // Step-level `uses:` is a list item under `steps:` and is not matched.
    if (/^ {4}uses:/m.test(whole)) {
      reusableWorkflowCallers.push(workflow);
    }
    // `outside` too, NOT just job bodies. Shipping this check over job bodies alone was
    // fail-open path 8 — the workflow-level blind spot recurring inside the fix whose own
    // docstring rule is "compute by complement, never by position", 200 lines above.
    if (
      dynamicSecretIndex(outside) ||
      jobs.some((j) => j.workflow === workflow && dynamicSecretIndex(j.body))
    ) {
      dynamicIndexUsers.push(workflow);
    }
  }

  return {
    jobs,
    workflows,
    workflowLevelSecretRefs,
    secretsInheritUsers,
    dynamicIndexUsers,
    reusableWorkflowCallers,
  };
}

describe('workflow secret scoping (BL-111 D2)', () => {
  const {
    jobs,
    workflows,
    workflowLevelSecretRefs,
    secretsInheritUsers,
    dynamicIndexUsers,
    reusableWorkflowCallers,
  } = parseWorkflows();

  it('extracts at least one job from every workflow file', () => {
    // The property that actually fails open. A job-count floor cannot catch one workflow
    // being silently dropped; this can.
    const empty = workflows.filter((w) => !jobs.some((j) => j.workflow === w));
    expect(empty, 'these workflows parsed to zero jobs').toEqual([]);
    expect(workflows.length).toBeGreaterThan(5);
  });

  it('finds the deploy jobs it is meant to be checking', () => {
    const holders = jobs.filter((j) => DEPLOY_SECRETS.some((s) => referencesSecret(j.body, s)));
    expect(holders.map((j) => `${j.workflow}:${j.name}`).sort()).toEqual([
      'deploy-mcp-production.yml:deploy-production',
      'deploy-mcp-staging.yml:deploy-staging',
      'rollback-mcp.yml:rollback',
    ]);
  });

  it.each(DEPLOY_SECRETS)('every job referencing %s binds a GitHub Environment', (secret) => {
    const referencing = jobs.filter((j) => referencesSecret(j.body, secret));
    expect(
      referencing.length,
      `no job references ${secret} — assertion would be vacuous`
    ).toBeGreaterThan(0);

    const violations = referencing
      .filter((j) => j.environments.length === 0)
      .map((j) => `${j.workflow}:${j.name}`);
    expect(violations, `these jobs would read ${secret} from REPOSITORY scope`).toEqual([]);
  });

  it('binds exactly the environments the deploy topology defines, per job', () => {
    // Per JOB, not a flat set of names. A flat set could not detect the staging deploy
    // losing its binding, because `mcp-staging` is also produced by the rollback ternary —
    // so the union stayed complete while one of its two producers went missing.
    const bindings = jobs
      .filter((j) => j.environments.length > 0)
      .map((j) => `${j.workflow}:${j.name} → ${[...new Set(j.environments)].sort().join('|')}`)
      .sort();

    expect(bindings).toEqual([
      'deploy-mcp-production.yml:deploy-production → mcp-production',
      'deploy-mcp-staging.yml:deploy-staging → mcp-staging',
      'rollback-mcp.yml:rollback → mcp-production-rollback|mcp-staging',
    ]);

    // Kept alongside the map because it gives a targeted message, and because a typo does
    // NOT error at runtime: GitHub creates the environment on first use with no secrets on
    // it and the deploy fails on blank credentials. The repo also has `github-pages`,
    // `Preview` and `Production` environments (Vercel's and Pages') — binding any of those
    // here would be a real mistake and trips this list too.
    const unknown = jobs
      .flatMap((j) => j.environments.map((e) => ({ job: j, env: e })))
      .filter((b) => !KNOWN_ENVIRONMENTS.includes(b.env))
      .map((b) => `${b.job.workflow}:${b.job.name} → '${b.env}'`);
    expect(unknown, 'unknown environment names bind to an empty environment').toEqual([]);
  });

  it('keeps deploy credentials out of workflow-level env, on either side of `jobs:`', () => {
    // A workflow-level `env:` block puts a deploy token in every job of that workflow,
    // defeating per-job binding entirely. Computed as the COMPLEMENT of what landed in a
    // job body — an earlier version sliced everything above `jobs:`, and a top-level `env:`
    // written below it was invisible.
    expect([...new Set(workflowLevelSecretRefs)]).toEqual([]);
  });

  it('uses no `secrets: inherit`, which would bypass this check entirely', () => {
    // A `uses:`-caller job with `secrets: inherit` receives every repository secret with no
    // `secrets.NAME` token anywhere for the membership test to find. The repo has no
    // reusable workflows; this asserts it stays that way rather than pretending the
    // membership test would catch one.
    expect(secretsInheritUsers).toEqual([]);
  });

  it('indexes secrets only by literal name, never by expression', () => {
    // `secrets[matrix.env]` — the shape a staging/production matrix produces — cannot be
    // resolved to a name by any membership test. Same honest treatment as `secrets:
    // inherit`: assert it absent rather than pretend the check would see it.
    expect(dynamicIndexUsers).toEqual([]);
  });

  it('calls no reusable workflow, the precondition for secrets inheritance', () => {
    // The structural complement to the `secrets: inherit` keyword match. Chasing every
    // spelling of the keyword is syntax whack-a-mole; asserting that no job-level `uses:`
    // exists removes the precondition entirely. Step-level `uses:` (actions/checkout etc.)
    // is a list item under `steps:` and is not matched.
    expect(reusableWorkflowCallers).toEqual([]);
  });

  it('confines MCP_PROBE_KEY to the one workflow whose repo-level residency is justified', () => {
    // The inverse assertion. MCP_PROBE_KEY is excluded from DEPLOY_SECRETS because
    // latency-probe.yml binds no environment and legitimately needs it — pinning it here
    // stops that exemption quietly expanding to a job that also holds deploy authority.
    const holders = [
      ...new Set(
        jobs.filter((j) => referencesSecret(j.body, 'MCP_PROBE_KEY')).map((j) => j.workflow)
      ),
    ];
    expect(holders).toEqual(['latency-probe.yml']);
  });
});
