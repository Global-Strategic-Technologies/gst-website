#!/usr/bin/env node
/**
 * Cross-platform deploy wrapper for the MCP Worker.
 *
 * Runs `wrangler deploy --env <env> --var GIT_SHA:<sha>` so the deployed
 * Worker can surface its commit SHA on `/health` (read by `health.ts:122`).
 * Without this, every operator-direct deploy left `gitSha: "unknown"` —
 * surfaced during BL-032 soak verification on 2026-05-10.
 *
 * Cross-platform:
 *   - Windows / PowerShell: works without `$(...)` shell substitution
 *     (which PowerShell doesn't support natively in package.json scripts).
 *   - macOS / Linux: same code path; no shell-specific syntax.
 *
 * Usage (from `mcp-server/`):
 *   npm run deploy:staging
 *   npm run deploy:production
 *   npm run deploy:staging -- --dry-run     # extra args forwarded to wrangler
 *
 * The script never pushes to git, never amends commits. Wrangler-side
 * authentication (CLOUDFLARE_API_TOKEN env var or `wrangler login`) is the
 * caller's responsibility — same as before.
 */

import { execSync, spawnSync } from 'node:child_process';

const ALLOWED_ENVS = ['staging', 'production'];

const env = process.argv[2];
if (!ALLOWED_ENVS.includes(env)) {
  console.error(`Usage: node scripts/deploy.mjs <${ALLOWED_ENVS.join('|')}> [extra wrangler args]`);
  process.exit(1);
}

let sha;
try {
  sha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
} catch (err) {
  console.error(`Failed to read git SHA: ${err.message}`);
  console.error('Are you inside a git repo? Refusing to deploy without a SHA.');
  process.exit(1);
}

// `git rev-parse --short` returns 7+ hex chars. Anything else is suspicious.
if (!/^[0-9a-f]{7,}$/.test(sha)) {
  console.error(
    `Refusing to deploy: git rev-parse returned a suspicious value: ${JSON.stringify(sha)}`
  );
  process.exit(1);
}

const passthrough = process.argv.slice(3);
const wranglerArgs = [
  'wrangler',
  'deploy',
  '--env',
  env,
  '--var',
  `GIT_SHA:${sha}`,
  ...passthrough,
];

console.log(`> deploying mcp-server to ${env} with GIT_SHA=${sha}`);
console.log(`> npx ${wranglerArgs.join(' ')}`);

const result = spawnSync('npx', wranglerArgs, {
  stdio: 'inherit',
  // shell:true so `npx` resolves on Windows (where it's a .cmd shim).
  // Safe here because env is allowlisted and sha is regex-validated above.
  shell: true,
});

if (result.error) {
  console.error(`Failed to spawn wrangler: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
