/**
 * One-time (but rerunnable) purge of leaked `mcp:audit:seqof:*` ledger keys.
 *
 * **No shebang** — invoked via `npm run purge:audit-seqof` or
 * `node scripts/purge-audit-seqof.mjs`, and imported by its unit tests under
 * vitest, whose Vite parser rejects `#!` lines (same constraint documented in
 * `extract-irl-markdown.mjs`).
 *
 * **Why this exists (ADR-0014)**: the BL-033 audit pipeline wrote one
 * `mcp:audit:seqof:<env>:<entryId>` key per tool call with no TTL — the only
 * unbounded key family in the shared gst-mcp Upstash DB (~800 KB accumulated
 * with zero consumers of the audit product). The pipeline is deactivated
 * (queue bindings unbound in wrangler.toml) and the consumer now writes
 * seqOf keys with a 30-day TTL; this script reclaims the pre-TTL backlog.
 * Operator runbook: src/docs/operations/AUDIT_LOG.md § Deactivation.
 *
 * **What it never touches**: `mcp:audit:chain-tip:<env>` (the hash-chain tip,
 * one key per env — kept so a future re-enable resumes the chain unbroken).
 * The SCAN pattern excludes it, and a defensive prefix assertion aborts the
 * run if anything outside `mcp:audit:seqof:` ever reaches the delete path.
 * After a purge the script prints the chain-tip keys as proof of survival.
 *
 * **Safety posture**: DRY-RUN BY DEFAULT — reports what would be deleted and
 * how much space it frees. Deletion requires the explicit `--execute` flag.
 * Rerunnable: a second run simply finds fewer (or zero) keys.
 *
 * **Credentials** (never passed as argv — Directive 15): reads
 * `UPSTASH_MCP_REST_URL` / `UPSTASH_MCP_REST_TOKEN` from the environment —
 * the values of the Worker's secrets of the same names, i.e. the **scoped
 * ACL user** for the gst-mcp DB (see SECRETS_INVENTORY.md; the admin token
 * is break-glass only). Its grant (`+@read +@write +@scripting -@dangerous`
 * on `~mcp:*`, DEPLOY.md § Upstash ACL) covers everything this script runs:
 * SCAN is `@keyspace @read` (`-@dangerous` strips KEYS, not SCAN), and
 * UNLINK / MGET are plain `@write` / `@read`. There is deliberately no DEL
 * fallback — DEL sits in the same `@write` category, so it cannot succeed
 * where UNLINK gets a NOPERM; a NOPERM is a stop-and-diagnose signal.
 *
 * **Usage**:
 *
 *   cd mcp-server
 *   npm run purge:audit-seqof                # dry-run report
 *   npm run purge:audit-seqof -- --execute   # actually delete
 */

import { Redis } from '@upstash/redis';

export const SEQOF_PREFIX = 'mcp:audit:seqof:';
export const CHAIN_TIP_ENVS = ['dev', 'staging', 'production'];
export const UNLINK_BATCH_SIZE = 500;

/** SCAN page size — a hint, not a limit; Upstash may return fewer per page. */
const SCAN_COUNT = 1000;

/**
 * Parse CLI args. Dry-run is the DEFAULT; deletion only via `--execute`.
 * Throws on unknown flags so a typo'd `--exectue` can't silently dry-run
 * (or worse, a future flag rename can't silently delete).
 */
export function parsePurgeArgs(argv) {
  const opts = { execute: false, help: false };
  for (const a of argv) {
    if (a === '--execute') opts.execute = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else throw new Error(`Unknown flag: ${a}`);
  }
  return opts;
}

/**
 * Defensive partition of scanned keys: only keys under `mcp:audit:seqof:`
 * may reach the delete path. SCAN's MATCH already guarantees this; the
 * assertion defends against a future pattern typo (the caller ABORTS the
 * whole run if `invalid` is non-empty — it does not "delete the valid ones").
 */
export function partitionSeqofKeys(keys) {
  const valid = [];
  const invalid = [];
  for (const k of keys) {
    (k.startsWith(SEQOF_PREFIX) ? valid : invalid).push(k);
  }
  return { valid, invalid };
}

/** Split keys into UNLINK-sized batches. */
export function batchKeys(keys, size = UNLINK_BATCH_SIZE) {
  const batches = [];
  for (let i = 0; i < keys.length; i += size) {
    batches.push(keys.slice(i, i + size));
  }
  return batches;
}

/** Per-env key counts — env is the 4th `:`-segment (mcp:audit:seqof:<env>:<id>). */
export function summarizeByEnv(keys) {
  const counts = {};
  for (const k of keys) {
    const env = k.split(':')[3] ?? '(unknown)';
    counts[env] = (counts[env] ?? 0) + 1;
  }
  return counts;
}

/**
 * Full cursor loop over `mcp:audit:seqof:*`. The Upstash SDK returns the
 * cursor as a STRING — terminate on `'0'`, not the number 0. `scripts/`
 * sits outside tsconfig's typecheck, so the unit test pins this.
 */
export async function collectSeqofKeys(redis) {
  const keys = [];
  let cursor = '0';
  do {
    const [next, page] = await redis.scan(cursor, {
      match: `${SEQOF_PREFIX}*`,
      count: SCAN_COUNT,
    });
    keys.push(...page);
    cursor = next;
  } while (cursor !== '0');
  return keys;
}

/** Approximate storage held by the keys: key bytes + serialized value bytes. */
export async function approxBytesHeld(redis, keys) {
  let bytes = 0;
  for (const batch of batchKeys(keys, 100)) {
    const values = await redis.mget(...batch);
    batch.forEach((k, i) => {
      const v = values[i];
      bytes += k.length + (v == null ? 0 : JSON.stringify(v).length);
    });
  }
  return bytes;
}

function printHelp() {
  process.stderr.write(
    [
      'purge-audit-seqof — reclaim leaked mcp:audit:seqof:* ledger keys (ADR-0014).',
      '',
      'Usage:',
      '  cd mcp-server',
      '  npm run purge:audit-seqof                # dry-run report (default)',
      '  npm run purge:audit-seqof -- --execute   # actually delete',
      '',
      'Requires UPSTASH_MCP_REST_URL / UPSTASH_MCP_REST_TOKEN in the environment',
      '(the scoped ACL user — see src/docs/operations/AUDIT_LOG.md § Deactivation).',
      'Never deletes mcp:audit:chain-tip:* (hash-chain resumability).',
      '',
    ].join('\n')
  );
}

async function runCli() {
  let opts;
  try {
    opts = parsePurgeArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n\n`);
    printHelp();
    process.exit(2);
  }
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const url = process.env.UPSTASH_MCP_REST_URL;
  const token = process.env.UPSTASH_MCP_REST_TOKEN;
  if (!url || !token) {
    process.stderr.write(
      'Error: UPSTASH_MCP_REST_URL and UPSTASH_MCP_REST_TOKEN must be set in the\n' +
        'environment (values of the Worker secrets of the same names — the scoped\n' +
        'ACL user for the gst-mcp DB). Never pass credentials as arguments.\n'
    );
    process.exit(2);
  }

  const redis = new Redis({ url, token });

  const scanned = await collectSeqofKeys(redis);
  const { valid, invalid } = partitionSeqofKeys(scanned);
  if (invalid.length > 0) {
    process.stderr.write(
      `ABORT: SCAN returned ${invalid.length} key(s) outside "${SEQOF_PREFIX}" — ` +
        `pattern drift?\nFirst offender: ${invalid[0]}\nNothing was deleted.\n`
    );
    process.exit(1);
  }

  const counts = summarizeByEnv(valid);
  const bytes = await approxBytesHeld(redis, valid);
  process.stdout.write(`Found ${valid.length} seqof key(s), ~${(bytes / 1024).toFixed(1)} KB:\n`);
  for (const [env, n] of Object.entries(counts)) {
    process.stdout.write(`  ${env}: ${n}\n`);
  }

  if (!opts.execute) {
    process.stdout.write('\nDRY RUN — nothing deleted. Re-run with --execute to delete.\n');
  } else if (valid.length === 0) {
    process.stdout.write('\nNothing to delete.\n');
  } else {
    let deleted = 0;
    for (const batch of batchKeys(valid)) {
      deleted += await redis.unlink(...batch);
    }
    process.stdout.write(
      `\nDeleted ${deleted} key(s), reclaiming ~${(bytes / 1024).toFixed(1)} KB.\n`
    );
  }

  // Chain-tip survival proof — these keys are intentionally untouched.
  process.stdout.write('\nChain-tip keys (kept for re-enable — ADR-0014):\n');
  for (const env of CHAIN_TIP_ENVS) {
    const tip = await redis.get(`mcp:audit:chain-tip:${env}`);
    process.stdout.write(
      `  mcp:audit:chain-tip:${env}: ${tip == null ? '(absent)' : JSON.stringify(tip)}\n`
    );
  }
}

// Run the CLI only when invoked directly; importing (unit tests) is side-effect-free.
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('purge-audit-seqof.mjs');
if (isMain) {
  runCli().catch((err) => {
    process.stderr.write(`purge-audit-seqof failed: ${err?.message ?? err}\n`);
    process.exit(1);
  });
}
