/**
 * CLI smoke test for provision-client.mjs under REAL Node (spawnSync),
 * mirroring invoke-ae-baseline-cli-smoke.test.ts.
 *
 * Every case here stops BEFORE the `fetch` to the admin API — either because
 * validation rejects the invocation, because MCP_ADMIN_KEY is absent, or
 * because `--dry-run` returns early. No test in this file ever creates a real
 * client, and MCP_ADMIN_KEY is scrubbed from the child environment so an
 * operator running the suite with their key exported cannot accidentally
 * provision anything.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/provision-client.mjs'
);

const scrubbedEnv = () => {
  const env = { ...process.env };
  delete env.MCP_ADMIN_KEY;
  return env;
};

const run = (args: string[], env: NodeJS.ProcessEnv = scrubbedEnv()) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { env, encoding: 'utf8', timeout: 30_000 });

const NAMED = ['--name', 'Smoke Test Client'];

describe('provision-client CLI smoke (real Node)', () => {
  it('fails loudly when MCP_ADMIN_KEY is unset, before any network call', () => {
    const res = run([...NAMED, '--tier', 'free-pilot']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('MCP_ADMIN_KEY not set');
    expect(res.stderr).toContain('AUTH.md');
    // No flag equivalent exists — that is the point (Directive 15).
    expect(res.stderr).not.toContain('--admin-key');
  });

  it('rejects unknown CLI arguments', () => {
    const res = run([...NAMED, '--tier', 'free-pilot', '--bogus']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Unknown argument: --bogus');
  });

  it('requires --tier rather than inheriting the server default', () => {
    const res = run([...NAMED, '--dry-run']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('--tier is required');
  });

  it('requires --name', () => {
    const res = run(['--tier', 'paid', '--dry-run']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('--name is required');
  });

  it('refuses a radar scope without --allow-radar', () => {
    const res = run([...NAMED, '--tier', 'free-pilot', '--scopes', 'tool:radar:*', '--dry-run']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('without --allow-radar');
  });

  it('refuses a scope outside the advertised catalog', () => {
    const res = run([...NAMED, '--tier', 'free-pilot', '--scopes', 'tool:portfolo:*', '--dry-run']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Unknown scope(s): tool:portfolo:*');
    expect(res.stderr).toContain('--unsafe-scope');
  });

  it('prints the request under --dry-run without touching the network', () => {
    const res = run([...NAMED, '--tier', 'paid', '--dry-run']);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('DRY RUN — no client created.');
    expect(res.stdout).toContain('https://mcp.globalstrategic.tech/admin/oauth/m2m-clients');
    expect(res.stdout).toContain('"tier": "paid"');
    expect(res.stdout).toContain('"tool:*"');
    // The default scope set is radar-free.
    expect(res.stdout).not.toContain('radar');
  });

  it('resolves the staging base URL under --env staging', () => {
    const res = run([...NAMED, '--tier', 'free-pilot', '--env', 'staging', '--dry-run']);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain(
      'https://mcp-staging.globalstrategic.tech/admin/oauth/m2m-clients'
    );
  });

  it('warns on stderr when an unsafe scope reaches a real invocation', () => {
    const res = run([
      ...NAMED,
      '--tier',
      'paid',
      '--scopes',
      'tool:search_portfolio',
      '--unsafe-scope',
      'tool:search_portfolio',
      '--dry-run',
    ]);
    expect(res.status).toBe(0);
    expect(res.stderr).toContain('outside the advertised catalog');
    expect(res.stderr).toContain('tool:search_portfolio');
  });

  it('warns on stderr when radar scope is deliberately granted', () => {
    const res = run([
      ...NAMED,
      '--tier',
      'enterprise',
      '--scopes',
      'tool:*,tool:radar:*',
      '--allow-radar',
      '--dry-run',
    ]);
    expect(res.status).toBe(0);
    expect(res.stderr).toContain('Inoreader Zone-1 budget');
  });
});
