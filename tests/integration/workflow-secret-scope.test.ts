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
 * **THE PARSER MUST NOT FAIL OPEN, AND THE FIRST VERSION DID — THREE WAYS.** Review caught
 * all three by dropping a rogue workflow holding an unbound deploy secret and watching the
 * suite stay green: it ignored `.yaml` files, it `continue`d past any workflow whose
 * `jobs:` line was not byte-exact, and its environment-name check only read *quoted*
 * literals, so the two deploy jobs (which write the name bare) were never inspected at all.
 * Every skip path is now a throw, and every assertion below is paired with a positive
 * assertion that the thing it checks was actually found. A guard that silently checks
 * nothing is worse than no guard, because it is credited in review.
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
 * Resolve the environment names a `name:` value can produce.
 *
 * Bare (`mcp-staging`) and quoted forms yield themselves. A `${{ }}` expression is split on
 * `&&` / `||` and each arm contributing a literal is taken — skipping arms containing a
 * comparison, since `inputs.environment == 'production'` names an INPUT value, not an
 * environment. That is what lets the rollback ternary be checked rather than waved through.
 */
function resolveEnvironmentNames(raw: string): string[] {
  const value = raw.trim();
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
  /** Deploy-secret references appearing ABOVE `jobs:` — i.e. workflow-level `env:`. */
  workflowLevelSecretRefs: string[];
}

function parseWorkflows(): Parsed {
  const jobs: Job[] = [];
  const workflows: string[] = [];
  const workflowLevelSecretRefs: string[] = [];

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

    const preamble = stripComments(lines.slice(0, start)).join('\n');
    for (const secret of DEPLOY_SECRETS) {
      if (preamble.includes(`secrets.${secret}`)) workflowLevelSecretRefs.push(workflow);
    }

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
        current?.lines.push(line);
        continue;
      }
      if (/^\S/.test(line)) break; // a top-level key ends the jobs section

      const jobHeader = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
      if (jobHeader) {
        flush();
        current = { name: jobHeader[1], lines: [] };
        continue;
      }
      if (!current) {
        throw new Error(`${workflow}: content under 'jobs:' before any job header — line ${i + 1}`);
      }
      current.lines.push(line);
    }
    flush();
  }

  return { jobs, workflows, workflowLevelSecretRefs };
}

describe('workflow secret scoping (BL-111 D2)', () => {
  const { jobs, workflows, workflowLevelSecretRefs } = parseWorkflows();

  it('extracts at least one job from every workflow file', () => {
    // The property that actually fails open. A job-count floor cannot catch one workflow
    // being silently dropped; this can.
    const empty = workflows.filter((w) => !jobs.some((j) => j.workflow === w));
    expect(empty, 'these workflows parsed to zero jobs').toEqual([]);
    expect(workflows.length).toBeGreaterThan(5);
  });

  it('finds the deploy jobs it is meant to be checking', () => {
    const holders = jobs.filter((j) => DEPLOY_SECRETS.some((s) => j.body.includes(`secrets.${s}`)));
    expect(holders.map((j) => `${j.workflow}:${j.name}`).sort()).toEqual([
      'deploy-mcp-production.yml:deploy-production',
      'deploy-mcp-staging.yml:deploy-staging',
      'rollback-mcp.yml:rollback',
    ]);
  });

  it.each(DEPLOY_SECRETS)('every job referencing %s binds a GitHub Environment', (secret) => {
    const referencing = jobs.filter((j) => j.body.includes(`secrets.${secret}`));
    expect(
      referencing.length,
      `no job references ${secret} — assertion would be vacuous`
    ).toBeGreaterThan(0);

    const violations = referencing
      .filter((j) => j.environments.length === 0)
      .map((j) => `${j.workflow}:${j.name}`);
    expect(violations, `these jobs would read ${secret} from REPOSITORY scope`).toEqual([]);
  });

  it('binds only environments the deploy topology defines', () => {
    const bound = jobs.flatMap((j) => j.environments.map((e) => ({ job: j, env: e })));

    // Positive assertion first, because the previous version of this check read only
    // QUOTED literals — so the two deploy jobs, which write the name bare, were never
    // inspected, and a typo'd `mcp-stagng` passed green.
    const seen = [...new Set(bound.map((b) => b.env))].sort();
    expect(seen).toEqual([...KNOWN_ENVIRONMENTS].sort());

    const unknown = bound
      .filter((b) => !KNOWN_ENVIRONMENTS.includes(b.env))
      .map((b) => `${b.job.workflow}:${b.job.name} → '${b.env}'`);
    // A typo does NOT error at runtime: GitHub creates the environment on first use with no
    // secrets on it, and the deploy fails on blank credentials.
    expect(unknown, 'unknown environment names bind to an empty environment').toEqual([]);
  });

  it('keeps deploy credentials out of workflow-level env, above the job scope', () => {
    // A workflow-level `env:` block would put a deploy token in every job of that workflow,
    // defeating per-job binding entirely — and it sits outside the jobs-block parse window.
    expect(workflowLevelSecretRefs).toEqual([]);
  });

  it('confines MCP_PROBE_KEY to the one workflow whose repo-level residency is justified', () => {
    // The inverse assertion. MCP_PROBE_KEY is excluded from DEPLOY_SECRETS because
    // latency-probe.yml binds no environment and legitimately needs it — pinning it here
    // stops that exemption quietly expanding to a job that also holds deploy authority.
    const holders = [
      ...new Set(
        jobs.filter((j) => j.body.includes('secrets.MCP_PROBE_KEY')).map((j) => j.workflow)
      ),
    ];
    expect(holders).toEqual(['latency-probe.yml']);
  });
});
