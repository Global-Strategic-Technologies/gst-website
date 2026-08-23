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
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/provision-client.mjs'
);

const scrubbedEnv = () => {
  const env = { ...process.env };
  // Case-INSENSITIVE scrub. `process.env` spreads to a plain object with
  // whatever casing the OS stored, but Windows env lookups in the child are
  // case-insensitive — so `delete env.MCP_ADMIN_KEY` alone would leave a
  // `Mcp_Admin_Key` variable readable by the script, and the one non-dry-run
  // case below would then create a REAL production client.
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === 'MCP_ADMIN_KEY') delete env[key];
  }
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
    // If the key check is ever reordered after the fetch, this fails loudly
    // rather than silently creating a client.
    expect(res.stdout).not.toContain('Created M2M client');
  });

  it('refuses to swallow a following flag as a value', () => {
    // Previously parsed as name='--dry-run' with dryRun unset — a real
    // production create from what the operator read as a preview.
    const res = run(['--name', '--dry-run', '--tier', 'paid']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('--name requires a value');
    expect(res.stdout).not.toContain('Created M2M client');
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
