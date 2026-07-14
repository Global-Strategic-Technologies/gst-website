/**
 * CLI smoke test for invoke-ae-baseline.mjs under REAL Node (spawnSync),
 * mirroring extract-irl-markdown-cli-smoke.test.ts. Asserts the fail-loud
 * env-var guard — the script must never reach the network without
 * CF_AE_TOKEN, so this test runs with a scrubbed environment and NEVER
 * performs live AE calls.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/invoke-ae-baseline.mjs'
);

const scrubbedEnv = () => {
  const env = { ...process.env };
  delete env.CF_AE_TOKEN;
  delete env.CLOUDFLARE_ACCOUNT_ID;
  delete env.CF_ACCOUNT_ID;
  return env;
};

describe('invoke-ae-baseline CLI smoke (real Node)', () => {
  it('fails loudly when CF_AE_TOKEN is unset, before any network call', () => {
    const res = spawnSync(process.execPath, [SCRIPT, '--env', 'production'], {
      env: scrubbedEnv(),
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('CF_AE_TOKEN not set');
    expect(res.stderr).toContain('DEPLOY.md');
  });

  it('fails loudly on a missing account id when only the token is set', () => {
    const res = spawnSync(process.execPath, [SCRIPT], {
      env: { ...scrubbedEnv(), CF_AE_TOKEN: 'smoke-test-placeholder' },
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('CLOUDFLARE_ACCOUNT_ID not set');
    expect(res.stderr).toContain('wrangler whoami');
  });

  it('rejects unknown CLI arguments', () => {
    const res = spawnSync(process.execPath, [SCRIPT, '--bogus'], {
      env: {
        ...scrubbedEnv(),
        CF_AE_TOKEN: 'smoke-test-placeholder',
        CLOUDFLARE_ACCOUNT_ID: 'smoke-test-account',
      },
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Unknown argument: --bogus');
  });
});
