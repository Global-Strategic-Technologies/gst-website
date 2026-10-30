/**
 * The PR-run dedup wait is wired into two workflows, and every way its wiring can break is
 * SILENT: nothing goes red, the suites just run twice again, or a PR run idles for the full
 * cap. So the wiring is asserted here rather than trusted (PR #590 ran both suites twice).
 *
 *   A. Each suite's PR run calls `scripts/await-push-run.sh`, PR-only, naming ITS OWN workflow
 *      file — a copy-pasted `WORKFLOW` would wait on the other suite's push run.
 *   B. The wait runs before the step that dedupes (test.yml `skip_dup`, MCP `dedup`): after it,
 *      the dedup would still race the push run.
 *   C. The job timeout outlasts the wait's age cap, or the runner kills the gate mid-wait and
 *      every required check fails.
 *   D. In the MCP job every step after `dedup` carries the skip guard (combined with its own
 *      condition, never replacing it), the coverage upload keeps `always()`, and the job grants
 *      `actions: read` for the runs queries.
 *   E. The script queries `event=push` runs: without it the PR run waits on itself.
 *
 * The behaviour of the script itself is `await-push-run.test.ts`. Parsed with the fail-closed
 * `parseJob` from `helpers/workflow-parse.ts`; every assertion is paired with a non-zero probe.
 */
import { readFileSync } from 'node:fs';
import { workflowJob, type WorkflowJob, type WorkflowStep } from './helpers/workflow-parse';

const SCRIPT = 'scripts/await-push-run.sh';
const GUARD = "steps.dedup.outputs.skip != 'true'";

const SUITES: { file: string; job: string; dedupId: string }[] = [
  { file: 'test.yml', job: 'changes', dedupId: 'skip_dup' },
  { file: 'test-mcp-server.yml', job: 'test', dedupId: 'dedup' },
];

const indexOfId = (job: WorkflowJob, id: string): number => job.steps.findIndex((s) => s.id === id);

describe.each(SUITES)(
  '$file — the PR run waits for the push run',
  ({ file, job: jobName, dedupId }) => {
    const job = workflowJob(file, jobName);
    const waitAt = indexOfId(job, 'await_push');
    const wait: WorkflowStep | undefined = job.steps[waitAt];

    it('A. calls the shared script, on pull_request only, for its own workflow file', () => {
      expect(job.steps.length).toBeGreaterThan(2); // probe: the job was read at all
      expect(wait, `no await_push step in ${file}#${jobName}`).toBeDefined();
      expect(wait!.run).toBe(`bash ${SCRIPT}`);
      expect(wait!.if).toBe("github.event_name == 'pull_request'");
      expect(wait!.env.WORKFLOW).toBe(file);
      expect(wait!.env.HEAD_SHA).toBe('${{ github.event.pull_request.head.sha }}');
      expect(wait!.env.GH_TOKEN).toBe('${{ github.token }}');
    });

    it('B. waits before the step that dedupes', () => {
      const dedupAt = indexOfId(job, dedupId);
      expect(dedupAt, `no ${dedupId} step in ${file}`).toBeGreaterThan(-1);
      expect(waitAt).toBeGreaterThan(-1);
      expect(waitAt).toBeLessThan(dedupAt);
    });

    it('C. the job timeout outlasts the age cap', () => {
      const maxAgeS = Number(wait!.env.MAX_AGE_S);
      expect(maxAgeS).toBeGreaterThan(0); // probe: a number was read
      expect(job.timeoutMinutes * 60).toBeGreaterThan(maxAgeS);
    });
  }
);

describe('test-mcp-server.yml — PR runs skip only what the push run already validated', () => {
  const job = workflowJob('test-mcp-server.yml', 'test');
  const dedupAt = indexOfId(job, 'dedup');
  const after = job.steps.slice(dedupAt + 1);
  const notice = after.filter((s) => s.if === "steps.dedup.outputs.skip == 'true'");

  it('D. every work step after dedup carries the skip guard, combined with its own condition', () => {
    expect(dedupAt).toBeGreaterThan(-1);
    expect(after.length).toBeGreaterThan(5); // probe: the work steps were read
    expect(notice).toHaveLength(1);
    for (const step of after) {
      if (step === notice[0]) continue;
      expect(step.if ?? '', `${step.name ?? step.id ?? step.uses} lacks the dedup guard`).toContain(
        GUARD
      );
    }
  });

  it('D. the coverage upload still runs on red builds, and the cache-hit condition survives', () => {
    const upload = after.find((s) => s.name === 'Upload coverage artifact');
    expect(upload?.if).toContain('always()');
    const install = after.find((s) => s.name === 'Install dependencies');
    expect(install?.if).toContain("steps.nm-cache.outputs.cache-hit != 'true'");
  });

  it('D. grants actions: read for the runs queries, and restates contents: read', () => {
    expect(job.permissions).toEqual({ contents: 'read', actions: 'read' });
  });

  it('D. dedup compares trees and asks for successful push runs on the head commit', () => {
    const run = job.steps[dedupAt].run ?? '';
    expect(run).toContain('event=push');
    expect(run).toContain('status=success');
    expect(run).toContain('head_sha=${HEAD_SHA}');
    expect(run).toContain("git rev-parse 'HEAD^{tree}'");
  });
});

describe('scripts/await-push-run.sh — the query', () => {
  it('E. asks for push runs only', () => {
    const script = readFileSync(SCRIPT, 'utf8');
    const api = script.split('\n').find((l) => l.startsWith('API='));
    expect(api, 'no API= line in the script').toBeDefined();
    expect(api).toContain('event=push');
    expect(api).toContain('head_sha=${HEAD_SHA}');
  });
});
