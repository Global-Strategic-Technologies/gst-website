#!/usr/bin/env node
/**
 * Cross-platform deploy wrapper for the MCP Worker.
 *
 * Runs `wrangler deploy --env <env> --var GIT_SHA:<sha> --var
 * SENTRY_RELEASE:<sha> --outdir dist --upload-source-maps`. The GIT_SHA
 * var surfaces on `/health` (read by `health.ts:122`); the SENTRY_RELEASE
 * var lets the @sentry/cloudflare SDK tag events with a release id that
 * matches the source-map bundle we upload to Sentry afterward. Without
 * the deploy.mjs wrapper, every operator-direct deploy left
 * `gitSha: "unknown"` — surfaced during BL-032 soak verification on
 * 2026-05-10.
 *
 * Source-map upload (added 2026-05-12):
 *   After wrangler deploy succeeds, this script invokes `@sentry/cli` to
 *   create a Sentry release tagged with the git SHA and upload the source
 *   maps wrangler just emitted to `dist/`. Required env vars for the
 *   upload step: SENTRY_AUTH_TOKEN (secret), SENTRY_ORG, SENTRY_PROJECT.
 *   If SENTRY_AUTH_TOKEN is missing, the script warns and skips the
 *   upload (the deploy itself still succeeds — source maps are a debug-
 *   experience nicety, not a runtime correctness gate).
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
 * To enable source-map upload, set in your shell before running:
 *   $env:SENTRY_AUTH_TOKEN = "sntrys_..."       # PowerShell
 *   export SENTRY_AUTH_TOKEN="sntrys_..."       # bash / zsh
 *
 * SENTRY_ORG and SENTRY_PROJECT default to the GST-canonical values
 * below; override with env vars only if those change. SENTRY_AUTH_TOKEN
 * has no default and must come from the caller.
 *
 * The script never pushes to git, never amends commits. Wrangler-side
 * authentication (CLOUDFLARE_API_TOKEN env var or `wrangler login`) is the
 * caller's responsibility — same as before.
 */

import { execSync, spawnSync } from 'node:child_process';

const ALLOWED_ENVS = ['staging', 'production'];

// GST-canonical Sentry project for the MCP Worker (see SENTRY_MANUAL_SETUP.md
// § MCP Worker). Override via env vars if these ever change.
const SENTRY_ORG_DEFAULT = 'gst-7o';
const SENTRY_PROJECT_DEFAULT = 'gst-mcp-server';

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
  '--var',
  `SENTRY_RELEASE:${sha}`,
  '--outdir',
  'dist',
  '--upload-source-maps',
  ...passthrough,
];

console.log(`> deploying mcp-server to ${env} with GIT_SHA=${sha}`);
console.log(`> npx ${wranglerArgs.join(' ')}`);

const wranglerResult = spawnSync('npx', wranglerArgs, {
  stdio: 'inherit',
  // shell:true so `npx` resolves on Windows (where it's a .cmd shim).
  // Safe here because env is allowlisted and sha is regex-validated above.
  shell: true,
});

if (wranglerResult.error) {
  console.error(`Failed to spawn wrangler: ${wranglerResult.error.message}`);
  process.exit(1);
}

if (wranglerResult.status !== 0) {
  process.exit(wranglerResult.status ?? 1);
}

// ---------------------------------------------------------------------------
// Source-map upload to Sentry (opt-in via SENTRY_AUTH_TOKEN)
// ---------------------------------------------------------------------------

if (!process.env.SENTRY_AUTH_TOKEN) {
  console.log(
    '> SENTRY_AUTH_TOKEN not set — skipping source-map upload. Sentry stack traces for this deploy will show minified output. Set SENTRY_AUTH_TOKEN in your shell to enable.'
  );
  process.exit(0);
}

const sentryOrg = process.env.SENTRY_ORG ?? SENTRY_ORG_DEFAULT;
const sentryProject = process.env.SENTRY_PROJECT ?? SENTRY_PROJECT_DEFAULT;
const release = sha;

console.log(`> uploading source maps to Sentry release ${release} (${sentryOrg}/${sentryProject})`);

// Step 1 — register the release (idempotent; safe to call on every deploy).
const newRelease = spawnSync(
  'npx',
  ['sentry-cli', 'releases', 'new', release, '--org', sentryOrg, '--project', sentryProject],
  { stdio: 'inherit', shell: true }
);
if (newRelease.status !== 0) {
  console.error(
    '> sentry-cli releases new failed (exit code ' +
      (newRelease.status ?? '?') +
      '). Deploy itself succeeded; only source-map upload is affected.'
  );
  process.exit(0);
}

// Step 2 — upload source maps from the dist/ directory wrangler just wrote.
const uploadMaps = spawnSync(
  'npx',
  [
    'sentry-cli',
    'sourcemaps',
    'upload',
    '--org',
    sentryOrg,
    '--project',
    sentryProject,
    '--release',
    release,
    '--strip-prefix',
    'dist/..',
    'dist',
  ],
  { stdio: 'inherit', shell: true }
);
if (uploadMaps.status !== 0) {
  console.error(
    '> sentry-cli sourcemaps upload failed (exit code ' +
      (uploadMaps.status ?? '?') +
      '). Deploy itself succeeded; only source-map upload is affected.'
  );
  process.exit(0);
}

// Step 3 — finalize the release (marks it ready in Sentry).
const finalizeRelease = spawnSync(
  'npx',
  ['sentry-cli', 'releases', 'finalize', release, '--org', sentryOrg, '--project', sentryProject],
  { stdio: 'inherit', shell: true }
);
if (finalizeRelease.status !== 0) {
  console.error(
    '> sentry-cli releases finalize failed (exit code ' +
      (finalizeRelease.status ?? '?') +
      '). Source maps uploaded but release not marked final.'
  );
  process.exit(0);
}

console.log(
  `> source maps uploaded for release ${release}; Sentry stack traces will resolve to original TypeScript.`
);
process.exit(0);
