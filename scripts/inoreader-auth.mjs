/**
 * One-time Inoreader OAuth setup and token refresh helper.
 *
 * Usage:
 *   Initial setup:  node scripts/inoreader-auth.mjs setup
 *   Exchange code:   node scripts/inoreader-auth.mjs exchange YOUR_CODE
 *   Refresh token:  node scripts/inoreader-auth.mjs refresh
 *
 * Reads credentials from .env file in the project root.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env file from project root
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');
try {
  const envFile = readFileSync(envPath, 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  // .env file not found — fall back to environment variables
}

const OAUTH_BASE = 'https://www.inoreader.com/oauth2';

const appId = process.env.INOREADER_APP_ID;
const appKey = process.env.INOREADER_APP_KEY;

if (!appId || !appKey) {
  console.error('Set INOREADER_APP_ID and INOREADER_APP_KEY in your environment.');
  process.exit(1);
}

const command = process.argv[2];

if (command === 'setup') {
  const authUrl =
    `${OAUTH_BASE}/auth?` +
    new URLSearchParams({
      client_id: appId,
      redirect_uri: 'http://localhost:3000/callback',
      response_type: 'code',
      scope: 'read',
      state: 'gst-radar-setup',
    });

  console.log('\n1. Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\n2. Authorize the application.');
  console.log('3. You will be redirected to localhost:3000/callback?code=XXXXX');
  console.log('4. Copy the "code" parameter from the URL.');
  console.log('\n5. Run: node scripts/inoreader-auth.mjs exchange YOUR_CODE_HERE\n');
} else if (command === 'exchange') {
  const code = process.argv[3];
  if (!code) {
    console.error(
      'Provide the authorization code: node scripts/inoreader-auth.mjs exchange YOUR_CODE'
    );
    process.exit(1);
  }

  const response = await fetch(`${OAUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: appId,
      client_secret: appKey,
      redirect_uri: 'http://localhost:3000/callback',
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    console.error(`Token exchange failed: ${response.status} ${await response.text()}`);
    process.exit(1);
  }

  const data = await response.json();
  console.log('\nTokens obtained successfully.\n');
  console.log('Add these to your Vercel environment variables:\n');
  console.log(`INOREADER_ACCESS_TOKEN=${data.access_token}`);
  console.log(`INOREADER_REFRESH_TOKEN=${data.refresh_token}`);
  console.log(`\nAccess token expires in: ${data.expires_in} seconds`);
} else if (command === 'refresh') {
  const refreshToken = process.env.INOREADER_REFRESH_TOKEN;
  if (!refreshToken) {
    console.error('INOREADER_REFRESH_TOKEN not set.');
    process.exit(1);
  }

  const response = await fetch(`${OAUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appKey,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    console.error(`Token refresh failed: ${response.status} ${await response.text()}`);
    process.exit(1);
  }

  const data = await response.json();
  console.log('\nToken refreshed.\n');
  console.log(`INOREADER_ACCESS_TOKEN=${data.access_token}`);
  if (data.refresh_token) {
    console.log(`INOREADER_REFRESH_TOKEN=${data.refresh_token}`);
  }
} else {
  console.log('Inoreader OAuth Helper for GST Radar\n');
  console.log('Usage:');
  console.log('  node scripts/inoreader-auth.mjs setup        Start OAuth flow');
  console.log('  node scripts/inoreader-auth.mjs exchange CODE Exchange auth code for tokens');
  console.log('  node scripts/inoreader-auth.mjs refresh       Refresh expired access token');
}
