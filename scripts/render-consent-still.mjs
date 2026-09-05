#!/usr/bin/env node
/* global Request */
/**
 * Render the OAuth consent page to a still for /hub/mcp/get-started/.
 *
 * The consent page is Worker-served HTML (mcp-server/src/oauth/consent.ts +
 * lib/html-shell.ts), so unlike the recorded clips it can be regenerated from
 * source. This drives the real exported handler, `handleAuthorizeGet`, with the
 * two collaborators it reads on the GET path stubbed out (an OAUTH_PROVIDER that
 * parses the request and looks up the client; an OAUTH_KV that accepts the
 * consent nonce), so the HTML is exactly what a first-time onboarder sees, with
 * no Worker source change and no deployed environment involved.
 *
 * Output: public/images/hub/mcp/consent-page-still.webp (1120x1578) via the poster recipe
 * in src/docs/hub/MCP_ONBOARDING.md (ffmpeg, WebP q82). The PNG intermediate
 * stays in the OS temp dir and is not committed. Fonts resolve through the
 * shell's `local()` fallbacks (Consolas on Windows), so the still is a
 * write-once artifact: re-run only when html-shell.ts or the consent copy
 * changes, and record the platform you rendered on.
 *
 *   npm run media:consent-still
 */
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'public/images/hub/mcp/consent-page-still.webp');
const ORIGIN = 'https://mcp.globalstrategic.tech';

// The client name Claude registers under is what the page prints in bold. The
// scope list is what Claude's connector actually requested in the 2026-09-04
// recording (media-raw/oauth-consent-web.mp4, the consent tab), in that order;
// the descriptions come from the server's scope catalog, so only the ids are
// pinned here. Re-read them from a fresh recording if Claude's request changes.
const CLIENT = { clientId: 'claude', clientName: 'Claude' };
const AUTH_REQUEST = {
  clientId: CLIENT.clientId,
  responseType: 'code',
  redirectUri: 'https://claude.ai/api/mcp/auth_callback',
  scope: [
    'tool:*',
    'resource:library:read',
    'resource:regulations:read',
    'resource:radar:read',
    'prompt:*',
    'tool:radar:*',
  ],
  state: '',
  codeChallenge: '',
  codeChallengeMethod: 'S256',
};

const bundle = await build({
  entryPoints: [resolve(ROOT, 'mcp-server/src/oauth/consent.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  external: ['@cloudflare/workers-oauth-provider'],
  logLevel: 'silent',
});
const code = bundle.outputFiles[0].text;
const { handleAuthorizeGet } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
);

const env = {
  OAUTH_PROVIDER: {
    parseAuthRequest: async () => AUTH_REQUEST,
    lookupClient: async () => CLIENT,
  },
  OAUTH_KV: { put: async () => undefined },
};
const res = await handleAuthorizeGet(new Request(`${ORIGIN}/authorize?client_id=claude`), env);
if (res.status !== 200) {
  throw new Error(`consent page returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
const html = await res.text();

const tmp = mkdtempSync(join(tmpdir(), 'gst-consent-still-'));
const png = join(tmp, 'consent-page-still.png');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 560, height: 480 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: png, fullPage: true });
} finally {
  await browser.close();
}

const ffmpeg = spawnSync('ffmpeg', ['-y', '-i', png, '-q:v', '82', OUT], { stdio: 'inherit' });
if (ffmpeg.error || ffmpeg.status !== 0) {
  // Leave the PNG in the temp dir, never in the repo: the intermediate must
  // not be committed (MCP_ONBOARDING.md § recipes), and a `git add -A` after
  // a failed run would otherwise pick it up.
  console.error(
    `ffmpeg unavailable; PNG left at ${png}. Convert with:\n  ffmpeg -i "${png}" -q:v 82 ${OUT}`
  );
  process.exitCode = 1;
} else {
  console.log(`wrote ${OUT}`);
  rmSync(tmp, { recursive: true, force: true });
}
