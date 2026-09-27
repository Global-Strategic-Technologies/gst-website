#!/usr/bin/env node
/**
 * BL-166 (ADR-0041) — one-time migration that keeps radar for every existing
 * non-trial M2M client record.
 *
 * Before BL-166, `hasScope` matched by prefix, so a record's `tool:*` covered
 * the radar tools. Radar is now an explicit scope: `tool:*` no longer covers
 * `tool:radar:*`. Existing clients keep radar (user decision 2, 2026-09-27),
 * so every non-trial record holding `tool:*` without `tool:radar:*` gets
 * `tool:radar:*` appended via `PATCH /admin/oauth/m2m-clients/<id>`.
 *
 * Records are sorted into groups, and ONLY the first two are patched:
 *   - patch                  non-trial, holds `tool:*`, lacks `tool:radar:*`
 *   - converted-trial patch  the same, on a record named `trial` (a trial
 *                            converted in place). It reaches radar today, so
 *                            it keeps it; listed apart so the operator sees it.
 *   - review                 non-trial with NO `tool:*` — never covered radar
 *                            by prefix, so nothing to keep; listed, not patched.
 *   - unpatchable            needs the patch but holds a scope outside the
 *                            catalog (an `--unsafe-scope` provision). PATCH
 *                            validates the WHOLE array against
 *                            `SCOPES_SUPPORTED`, so it would be refused.
 *                            Remedy: re-provision that client with
 *                            `provision-client.mjs --allow-radar` plus its
 *                            extra scopes, or accept that it loses radar.
 * Trial-tier records and records that already hold `tool:radar:*` are counted
 * and left alone — which is what makes a second run a no-op.
 *
 * Timing: run it at least 1h before approving the production deploy. M2M
 * tokens live at most 1h and carry the scopes of their `/token` mint, so by
 * then every live token of a client that sends no `scope` already carries
 * `tool:radar:*`. Running early is harmless: under the old prefix rule
 * `tool:*` already covered `tool:radar:*`, so the patch changes nothing there.
 *
 * Usage (from `mcp-server/`):
 *   npm run radar:migrate-scope -- --env staging            # dry run (default)
 *   npm run radar:migrate-scope -- --env staging --apply
 *   npm run radar:migrate-scope -- --apply                  # production
 *
 * The admin key comes from MCP_ADMIN_KEY and has NO flag equivalent — a flag
 * would put the secret in shell history, scrollback and agent transcripts
 * (CLAUDE.md Directive 15):
 *   $env:MCP_ADMIN_KEY = '<key>'      # PowerShell
 *   export MCP_ADMIN_KEY='<key>'      # bash / zsh
 */

import { BASE_URLS, SUPPORTED_SCOPES } from './provision-client.mjs';
import { TRIAL_CLIENT_NAME } from './reset-trial.mjs';

export const TOOL_ALL = 'tool:*';
export const TOOL_RADAR_ALL = 'tool:radar:*';
const TRIAL_TIER = 'trial';

/**
 * Parse CLI args. Throws on anything unrecognized — the caller exits 1
 * before any network call. Same `takeValue` discipline as
 * `provision-client.mjs`: a swallowed flag must never become a value.
 */
export function parseArgs(argv) {
  const args = { env: 'production', apply: false };

  const takeValue = (flag, value) => {
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${flag} requires a value (got: ${value ?? 'end of arguments'})`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--env') args.env = takeValue(arg, argv[++i]);
    else if (arg === '--apply') args.apply = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!(args.env in BASE_URLS)) {
    throw new Error(
      `--env must be one of: ${Object.keys(BASE_URLS).join(', ')} (got: ${args.env})`
    );
  }
  return args;
}

/**
 * Pure plan: sort the admin list into the groups described in the header.
 * Each patch entry carries the full `allowedScopes` array to send (PATCH
 * replaces the array, it does not merge).
 */
export function planMigration(clients) {
  const plan = {
    patch: [],
    convertedTrialPatch: [],
    review: [],
    unpatchable: [],
    alreadyMigrated: [],
    trialsSkipped: [],
  };

  for (const client of clients) {
    const scopes = Array.isArray(client.allowedScopes) ? client.allowedScopes : [];
    if (client.tier === TRIAL_TIER) {
      plan.trialsSkipped.push(client);
      continue;
    }
    if (scopes.includes(TOOL_RADAR_ALL)) {
      plan.alreadyMigrated.push(client);
      continue;
    }
    if (!scopes.includes(TOOL_ALL)) {
      plan.review.push(client);
      continue;
    }
    const offCatalog = scopes.filter((s) => !SUPPORTED_SCOPES.includes(s));
    if (offCatalog.length > 0) {
      plan.unpatchable.push({ ...client, offCatalog });
      continue;
    }
    const entry = { ...client, newScopes: [...scopes, TOOL_RADAR_ALL] };
    if (client.name === TRIAL_CLIENT_NAME) plan.convertedTrialPatch.push(entry);
    else plan.patch.push(entry);
  }
  return plan;
}

function describeClient(client) {
  return `${client.clientId}  ${client.name ?? '?'}  tier=${client.tier ?? '?'}`;
}

/** Human-readable plan; the dry run prints this and nothing else. */
export function renderPlan(plan, env) {
  const section = (title, rows, fmt) =>
    rows.length === 0
      ? `${title}: none\n`
      : `${title}: ${rows.length}\n${rows.map((r) => `  ${fmt(r)}`).join('\n')}\n`;
  const scopesOf = (c) => (Array.isArray(c.allowedScopes) ? c.allowedScopes.join(',') : '');

  return [
    `Radar-scope migration plan for ${env}:`,
    '',
    section(
      'Patch (add tool:radar:*)',
      plan.patch,
      (c) => `${describeClient(c)}  -> ${c.newScopes.join(',')}`
    ),
    section(
      'Patch, converted trial (add tool:radar:*)',
      plan.convertedTrialPatch,
      (c) => `${describeClient(c)}  -> ${c.newScopes.join(',')}`
    ),
    section(
      'Review, not patched (no tool:*, so radar was never covered)',
      plan.review,
      (c) => `${describeClient(c)}  scopes=${scopesOf(c)}`
    ),
    section(
      'Unpatchable (off-catalog scopes; re-provision with --allow-radar or accept radar loss)',
      plan.unpatchable,
      (c) => `${describeClient(c)}  off-catalog=${c.offCatalog.join(',')}`
    ),
    `Already hold tool:radar:*: ${plan.alreadyMigrated.length}`,
    `Trial-tier records left alone: ${plan.trialsSkipped.length}`,
    '',
  ].join('\n');
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
  const plan = planMigration(clients);
  process.stdout.write(renderPlan(plan, args.env));

  const toPatch = [...plan.patch, ...plan.convertedTrialPatch];
  if (!args.apply) {
    process.stdout.write(
      toPatch.length > 0
        ? `DRY RUN — nothing written. Re-run with --apply to patch ${toPatch.length} record(s).\n`
        : 'DRY RUN — nothing to patch.\n'
    );
    return;
  }

  const failures = [];
  for (const client of toPatch) {
    try {
      await adminFetch(`${base}/${encodeURIComponent(client.clientId)}`, adminKey, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedScopes: client.newScopes }),
      });
      process.stdout.write(`Patched ${client.clientId}\n`);
    } catch (err) {
      failures.push(client.clientId);
      process.stderr.write(`FAILED ${client.clientId}: ${err.message}\n`);
    }
  }
  process.stdout.write(`Patched ${toPatch.length - failures.length} of ${toPatch.length}.\n`);
  if (failures.length > 0) {
    // Safe to re-run: patched records now hold tool:radar:* and are skipped.
    throw new Error(`${failures.length} patch(es) failed; re-run to retry them.`);
  }
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('migrate-radar-scope.mjs');
if (isMain) {
  runCli().catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
}
