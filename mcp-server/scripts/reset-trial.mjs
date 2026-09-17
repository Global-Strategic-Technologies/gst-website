#!/usr/bin/env node
/**
 * One-command trial reset — revoke a trial record AND free the network that
 * holds its one-per-identity lease, so that visitor can sign up again.
 *
 * Wraps `DELETE /admin/oauth/m2m-clients/<id>?releaseIdentity=true`. Before
 * this existed, the only way back was a hand-run Upstash session: SCAN
 * `mcp:trial:ident:*`, GET each key, match `minted:<clientId>`, DEL. That
 * needed the raw MCP-DB token — a far larger credential than the task — and
 * the failure mode of a mis-read scan is deleting a STRANGER's lease.
 *
 * Two guardrails the raw endpoint cannot give you:
 *   - it SHOWS the record (name, tier, created, expires) and requires
 *     `--yes` to proceed, so the "is this the right trial" check is a step
 *     rather than an intention;
 *   - `--list` needs no clientId at all, which is how you find one.
 *
 * `identityReleased: 0` is a normal answer, not a failure: the 30-day
 * identity TTL may have lapsed already, in which case the network was
 * eligible before you ran this. The count is reported, never inferred.
 *
 * Usage (from `mcp-server/`):
 *   npm run trial:reset -- --list
 *   npm run trial:reset -- --client <clientId>            # preview, no writes
 *   npm run trial:reset -- --client <clientId> --yes
 *   npm run trial:reset -- --client <clientId> --yes --env staging
 *
 * The admin key comes from MCP_ADMIN_KEY and has NO flag equivalent — a flag
 * would put the secret in shell history, scrollback and agent transcripts
 * (CLAUDE.md Directive 15):
 *   $env:MCP_ADMIN_KEY = '<key>'      # PowerShell
 *   export MCP_ADMIN_KEY='<key>'      # bash / zsh
 */

import { BASE_URLS } from './provision-client.mjs';

/** The record name every self-serve trial carries (`TRIAL_CLIENT_NAME`). */
export const TRIAL_CLIENT_NAME = 'trial';

/**
 * Parse CLI args. Throws on anything unrecognized — the caller exits 1
 * before any network call. Same `takeValue` discipline as
 * `provision-client.mjs`: a swallowed flag must never become a value.
 */
export function parseArgs(argv) {
  const args = { client: undefined, env: 'production', list: false, yes: false };

  const takeValue = (flag, value) => {
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${flag} requires a value (got: ${value ?? 'end of arguments'})`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--client') args.client = takeValue(arg, argv[++i]);
    else if (arg === '--env') args.env = takeValue(arg, argv[++i]);
    else if (arg === '--list') args.list = true;
    else if (arg === '--yes') args.yes = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.list && !args.client) {
    throw new Error('--client <clientId> is required (or --list to see the trials)');
  }
  if (!(args.env in BASE_URLS)) {
    throw new Error(
      `--env must be one of: ${Object.keys(BASE_URLS).join(', ')} (got: ${args.env})`
    );
  }
  return args;
}

/** Fixed-width-ish rendering of the trial roster; `--list` prints this. */
export function renderTrialList(clients) {
  const trials = clients.filter((c) => c.name === TRIAL_CLIENT_NAME);
  if (trials.length === 0) return 'No trial records exist.\n';
  const lines = trials.map(
    (c) => `  ${c.clientId}  created ${c.createdAt ?? '?'}  expires ${c.expiresAt ?? 'never'}`
  );
  return `${trials.length} trial record(s):\n${lines.join('\n')}\n`;
}

/**
 * What `--client` prints before it is allowed to delete anything. Deliberately
 * shows the fields an operator needs to recognise the RIGHT trial — the whole
 * reason the manual recipe was dangerous.
 */
export function renderPreview(client, env) {
  return (
    `About to revoke and free this record on ${env}:\n` +
    `  clientId   ${client.clientId}\n` +
    `  name       ${client.name}\n` +
    `  tier       ${client.tier}\n` +
    `  created    ${client.createdAt ?? '?'}\n` +
    `  expires    ${client.expiresAt ?? 'never'}\n` +
    '\nThis deletes the record AND frees the network that signed it up.\n' +
    'Re-run with --yes to proceed.\n'
  );
}

async function adminFetch(url, adminKey, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${adminKey}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Admin API ${res.status} ${res.statusText}\n${text.slice(0, 800)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Admin API returned non-JSON on 2xx:\n${text.slice(0, 800)}`);
  }
}

export async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const adminKey = process.env.MCP_ADMIN_KEY;
  if (!adminKey) {
    throw new Error('MCP_ADMIN_KEY is not set (see the header of this script)');
  }
  const base = `${BASE_URLS[args.env]}/admin/oauth/m2m-clients`;

  const { clients = [] } = await adminFetch(base, adminKey);
  if (args.list) {
    process.stdout.write(renderTrialList(clients));
    return;
  }

  const client = clients.find((c) => c.clientId === args.client);
  if (!client) throw new Error(`No client record with clientId ${args.client} on ${args.env}`);
  if (client.name !== TRIAL_CLIENT_NAME) {
    // The server refuses this too; failing here means no request is sent at
    // all, so a mistyped id can never revoke a pilot or paid client.
    throw new Error(
      `${args.client} is named "${client.name}", not "${TRIAL_CLIENT_NAME}" — refusing. ` +
        'Only self-serve trials hold an identity lease.'
    );
  }
  if (!args.yes) {
    process.stdout.write(renderPreview(client, args.env));
    return;
  }

  const payload = await adminFetch(
    `${base}/${encodeURIComponent(args.client)}?releaseIdentity=true`,
    adminKey,
    { method: 'DELETE' }
  );
  const released = payload.identityReleased ?? 0;
  process.stdout.write(
    `Deleted ${payload.deleted}\n` +
      (released > 0
        ? 'Identity lease freed — that network can sign up again.\n'
        : 'No identity lease found (its 30-day TTL had already lapsed) — that network was already eligible.\n')
  );
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('reset-trial.mjs');
if (isMain) {
  runCli().catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
}
