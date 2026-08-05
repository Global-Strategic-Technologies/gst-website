/**
 * BL-111 defect 2, structural half — a job that can read the CI/CD deploy credentials
 * must bind a GitHub Environment.
 *
 * Why this needs a test rather than a comment. GitHub resolves `secrets.FOO` from the
 * repository scope whenever the job binds no `environment:`, and it does so **silently** —
 * there is no warning, no annotation, and the deploy works exactly as before. That is
 * precisely how `CLOUDFLARE_API_TOKEN` came to sit at repository level, readable by every
 * job in every workflow in this repo, for a token that can deploy the production Worker
 * (Cloudflare scopes `Workers Scripts: Edit` per ACCOUNT — a staging-only deploy token is
 * not expressible).
 *
 * Deleting an `environment:` key is a one-line change that reopens the whole exposure and
 * looks like tidying in review. The failure is invisible until someone audits secret
 * scopes — which had never happened, because SECRETS_INVENTORY.md's stated scope excluded
 * GitHub Actions entirely.
 *
 * Deliberately a hand parser rather than a YAML dependency, matching
 * `workflow-paths-parity.test.ts`: `yaml` is transitive-only today, and adding a direct
 * dependency for one assertion is the worse trade. The parse is coarse — job blocks by
 * indentation — but it cannot fail *open*: an unparseable `jobs:` block throws, and a job
 * whose environment binding it fails to see reports a violation rather than a pass.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOWS = join(process.cwd(), '.github', 'workflows');

/**
 * Secrets that grant deploy authority over the Worker. A job holding any of these is a
 * job that must be environment-scoped.
 */
const DEPLOY_SECRETS = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'SENTRY_AUTH_TOKEN'];

/**
 * `MCP_PROBE_KEY` is deliberately repository-level: `latency-probe.yml` binds no
 * environment and legitimately needs it. It is a read-only probe credential, not deploy
 * authority — so it is absent from DEPLOY_SECRETS rather than special-cased here.
 */

interface Job {
  workflow: string;
  name: string;
  body: string;
}

/** Split every workflow into its job blocks, keyed by the 2-space indent GitHub requires. */
function collectJobs(): Job[] {
  const jobs: Job[] = [];

  for (const workflow of readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml'))) {
    const lines = readFileSync(join(WORKFLOWS, workflow), 'utf8').split(/\r?\n/);
    const start = lines.findIndex((l) => /^jobs:\s*$/.test(l));
    if (start === -1) continue;

    let current: { name: string; lines: string[] } | null = null;
    const flush = () => {
      if (current) jobs.push({ workflow, name: current.name, body: current.lines.join('\n') });
      current = null;
    };

    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '' || line.trimStart().startsWith('#')) {
        current?.lines.push(line);
        continue;
      }
      // A top-level key ends the jobs section entirely.
      if (/^\S/.test(line)) break;

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

  if (jobs.length === 0) throw new Error('parsed zero jobs — the parser is broken, not the repo');
  return jobs;
}

describe('workflow secret scoping (BL-111 D2)', () => {
  const jobs = collectJobs();

  it('parses a plausible number of jobs across the workflow directory', () => {
    // Guards the guard: if the parser silently matched nothing, every assertion below
    // would pass vacuously — the exact failure mode this file exists to prevent.
    expect(jobs.length).toBeGreaterThan(10);
  });

  it('finds the deploy jobs it is meant to be checking', () => {
    // Names the subjects explicitly. A rename that made these invisible to the parser
    // would otherwise turn this suite green by making it test nothing.
    const holders = jobs.filter((j) => DEPLOY_SECRETS.some((s) => j.body.includes(`secrets.${s}`)));
    const ids = holders.map((j) => `${j.workflow}:${j.name}`).sort();
    expect(ids).toEqual([
      'deploy-mcp-production.yml:deploy-production',
      'deploy-mcp-staging.yml:deploy-staging',
      'rollback-mcp.yml:rollback',
    ]);
  });

  it.each(DEPLOY_SECRETS)('every job referencing %s binds a GitHub Environment', (secret) => {
    const violations = jobs
      .filter((j) => j.body.includes(`secrets.${secret}`))
      .filter((j) => !/^ {4}environment:/m.test(j.body))
      .map((j) => `${j.workflow}:${j.name}`);

    expect(violations, `these jobs would read ${secret} from REPOSITORY scope`).toEqual([]);
  });

  it('binds only environments that the deploy topology actually defines', () => {
    // A typo'd environment name does not error at runtime — GitHub creates the environment
    // on first use, with no secrets on it, and the deploy fails on empty credentials.
    const known = ['mcp-staging', 'mcp-production', 'mcp-production-rollback'];
    const names = jobs
      .flatMap((j) => [...j.body.matchAll(/^ {6}name: (.+)$/gm)].map((m) => m[1].trim()))
      .flatMap((v) => [...v.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]))
      .filter((v) => v.startsWith('mcp-'));

    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(known).toContain(n);
  });
});
