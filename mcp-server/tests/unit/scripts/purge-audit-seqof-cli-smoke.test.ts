/**
 * Real-Node CLI smoke test for `purge-audit-seqof.mjs` (ADR-0014).
 *
 * Same rationale as `extract-irl-markdown-cli-smoke.test.ts`: the unit tests
 * import the helpers under vitest's Vite resolver; this test spawns the SAME
 * node executable operators run against the SAME .mjs file, catching raw-Node
 * ESM/interop drift. It never touches a network: every asserted path exits
 * BEFORE a Redis client would be constructed (missing credentials → exit 2,
 * --help → exit 0, unknown flag → exit 2).
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = resolve(__dirname, '../../../scripts/purge-audit-seqof.mjs');

/** Spawn with a scrubbed env so a developer's real Upstash creds can't leak in. */
function runCli(args: string[]) {
  const env = { ...process.env };
  delete env.UPSTASH_MCP_REST_URL;
  delete env.UPSTASH_MCP_REST_TOKEN;
  return spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    encoding: 'utf8',
    timeout: 10_000,
    env,
  });
}

describe('purge-audit-seqof.mjs — real-Node CLI smoke', () => {
  it('exits 2 with a clear message when credentials are missing (before any deletion path)', () => {
    const result = runCli([]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('UPSTASH_MCP_REST_URL');
    expect(result.stderr).toContain('UPSTASH_MCP_REST_TOKEN');
    expect(result.stderr).toContain('Never pass credentials as arguments');
  });

  it('exits 2 on missing credentials even with --execute (credential gate precedes deletion)', () => {
    const result = runCli(['--execute']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('UPSTASH_MCP_REST_URL');
  });

  it('prints usage and exits 0 on --help', () => {
    const result = runCli(['--help']);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('purge-audit-seqof');
    expect(result.stderr).toContain('--execute');
    expect(result.stderr).toContain('chain-tip');
  });

  it('rejects unknown flags with exit 2 and usage', () => {
    const result = runCli(['--force']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Unknown flag');
    expect(result.stderr).toContain('Usage:');
  });
});
