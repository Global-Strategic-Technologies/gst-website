#!/usr/bin/env node
/**
 * BL-093 slice 1 — one-command M2M client provisioning for the GST MCP server.
 *
 * Wraps `POST /admin/oauth/m2m-clients` (see `src/admin/oauth-clients.ts`) and
 * replaces the hand-run curl that PILOT_ONBOARDING.md § 1 used to carry. The
 * wrapper exists for the guardrails, not for the typing it saves — the admin
 * API deliberately validates very little:
 *
 *   - `tier` is OPTIONAL server-side and defaults to `free-pilot`
 *     (`oauth/m2m-clients.ts:79`). A mistyped tier is rejected
 *     (`admin/oauth-clients.ts:200-208`) but an ABSENT one is not, so the
 *     runbook's "agree the tier" step had no mechanical backstop. Here
 *     `--tier` is REQUIRED.
 *   - `allowedScopes` is NOT validated at all — `admin/oauth-clients.ts:190`
 *     checks only that it's a non-empty array. `tool:portfolo:*` would
 *     provision a client that can call nothing and fail on its first call.
 *     Here every scope must be in the advertised catalog (see
 *     SUPPORTED_SCOPES) unless deliberately passed via `--unsafe-scope`.
 *   - Radar scopes spend the shared Inoreader Zone-1 budget (ADR-0006). The
 *     runbook warned about this in prose; here it takes `--allow-radar`.
 *
 * Usage (from `mcp-server/`):
 *   npm run provision:client -- --name "Acme Capital" --tier free-pilot --dry-run
 *   npm run provision:client -- --name "Acme Capital" --tier paid \
 *     --scopes tool:*,resource:regulations:read
 *
 * The admin key comes from the MCP_ADMIN_KEY env var and has NO flag
 * equivalent — a flag would put the secret in shell history, scrollback and
 * agent transcripts (CLAUDE.md Directive 15):
 *   $env:MCP_ADMIN_KEY = '<key>'      # PowerShell
 *   export MCP_ADMIN_KEY='<key>'      # bash / zsh
 *
 * No `--jwks-file` flag: `createM2mClient` mints and hashes a `clientSecret`
 * unconditionally (`oauth/m2m-clients.ts:71-83`), and `/token` takes the
 * `private_key_jwt` branch only when a `client_assertion` is actually
 * presented (`oauth/m2m-token.ts`). Registering a JWKS does NOT disable secret
 * auth, so a flag implying it would silently discard a live, permanently
 * unrecoverable secret. JWKS registration stays on the AUTH.md curl path.
 */

// Base URLs mirror the custom-domain routes in `wrangler.toml`
// ([env.staging] routes :177-181, [env.production] routes :257-264). Not
// parity-tested: wrangler.toml is TOML and there is no parser in the
// dependency tree, so adding one for two hostnames would break the repo's
// no-new-dep norm. A wrong hostname fails loudly on the first request.
export const BASE_URLS = Object.freeze({
  staging: 'https://mcp-staging.globalstrategic.tech',
  production: 'https://mcp.globalstrategic.tech',
});

/**
 * Mirror of `ASSIGNABLE_TIERS` in `src/ratelimit/tiers.ts`. A plain .mjs
 * cannot import the TypeScript module at runtime; the drift guard is the
 * parity test in `tests/unit/scripts/provision-client.test.ts`.
 */
export const ASSIGNABLE_TIERS = Object.freeze(['trial', 'free-pilot', 'paid', 'enterprise']);

/**
 * Mirror of `SCOPES_SUPPORTED` in `src/auth/scopes.ts` — the scope strings
 * advertised in AS metadata + PRM, i.e. `DEFAULT_SCOPES` from
 * `src/auth/scopes.ts` plus the `tool:radar:*` narrowing wildcard. Same
 * parity test guards it.
 */
export const SUPPORTED_SCOPES = Object.freeze([
  'tool:*',
  'resource:library:read',
  'resource:regulations:read',
  'resource:radar:read',
  'prompt:*',
  'tool:radar:*',
]);

/**
 * Scopes granted when `--scopes` is omitted — the minimum-scope example from
 * PILOT_ONBOARDING.md § 1, deliberately radar-free.
 *
 * NOT named `DEFAULT_SCOPES`: `src/auth/scopes.ts` already exports that name
 * with a broader meaning (it includes `resource:radar:read`), and two
 * same-named constants with different values would be a trap.
 */
export const MINIMUM_SCOPES = Object.freeze(['tool:*', 'resource:regulations:read']);

/** Scopes that spend the shared Inoreader Zone-1 budget (ADR-0006). */
export const RADAR_SCOPES = Object.freeze(['tool:radar:*', 'resource:radar:read']);

/**
 * Parse CLI args. Throws on anything unrecognized or missing — the caller
 * exits 1 before any network call is made.
 */
export function parseArgs(argv) {
  const args = {
    name: undefined,
    tier: undefined,
    scopes: undefined,
    env: 'production',
    allowRadar: false,
    unsafeScopes: [],
    dryRun: false,
  };

  // Every value-taking flag goes through this. Without it, a swallowed flag
  // silently becomes a value — `--name --dry-run --tier paid` would parse as
  // name='--dry-run' with dryRun UNSET, i.e. a real production create from an
  // invocation the operator believed was a preview.
  const takeValue = (flag, value) => {
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${flag} requires a value (got: ${value ?? 'end of arguments'})`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--name') args.name = takeValue(arg, argv[++i]);
    else if (arg === '--tier') args.tier = takeValue(arg, argv[++i]);
    else if (arg === '--scopes') args.scopes = takeValue(arg, argv[++i]);
    else if (arg === '--env') args.env = takeValue(arg, argv[++i]);
    else if (arg === '--allow-radar') args.allowRadar = true;
    else if (arg === '--unsafe-scope') args.unsafeScopes.push(takeValue(arg, argv[++i]));
    else if (arg === '--dry-run') args.dryRun = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.name)
    throw new Error('--name is required (the client/firm name recorded on the record)');
  if (!args.tier) {
    throw new Error(
      `--tier is required and must be one of: ${ASSIGNABLE_TIERS.join(', ')}. ` +
        'It is deliberately not defaulted here — the server would silently fall back to free-pilot.'
    );
  }
  if (!ASSIGNABLE_TIERS.includes(args.tier)) {
    throw new Error(`--tier must be one of: ${ASSIGNABLE_TIERS.join(', ')} (got: ${args.tier})`);
  }
  if (!(args.env in BASE_URLS)) {
    throw new Error(
      `--env must be one of: ${Object.keys(BASE_URLS).join(', ')} (got: ${args.env})`
    );
  }
  const scopes = args.scopes
    ? args.scopes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [...MINIMUM_SCOPES];
  if (scopes.length === 0) throw new Error('--scopes was empty after parsing');

  return { ...args, scopes };
}

/**
 * Validate the requested scope set. Two independent checks:
 *
 *   1. Every scope must be in SUPPORTED_SCOPES unless listed in
 *      `unsafeScopes`. Narrowing below the advertised catalog is legitimate
 *      (`hasScope` in `src/auth/scopes.ts` matches wildcards by prefix), but
 *      it should cost a deliberate keystroke rather than being the default —
 *      otherwise a typo provisions a client that can call nothing.
 *   2. Any radar scope requires `allowRadar`. This is deliberately STRICTER
 *      than the prose it mechanizes: PILOT_ONBOARDING.md named only
 *      `tool:radar:*`, but `resource:radar:read` reads the same
 *      Inoreader-funded snapshot AND sits inside the exported
 *      `DEFAULT_SCOPES`, making it the easier of the two to grant by accident.
 */
export function assertScopesValid(scopes, { allowRadar = false, unsafeScopes = [] } = {}) {
  const unknown = scopes.filter((s) => !SUPPORTED_SCOPES.includes(s) && !unsafeScopes.includes(s));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown scope(s): ${unknown.join(', ')}.\n` +
        `  Advertised catalog: ${SUPPORTED_SCOPES.join(', ')}\n` +
        '  The admin API does NOT validate scopes — an unknown scope provisions a client that can call nothing.\n' +
        '  If the narrowing is deliberate, re-run with: --unsafe-scope <scope> (once per scope).'
    );
  }

  const radar = scopes.filter((s) => RADAR_SCOPES.includes(s));
  if (radar.length > 0 && !allowRadar) {
    throw new Error(
      `Radar scope(s) requested without --allow-radar: ${radar.join(', ')}.\n` +
        '  Radar spends the shared Inoreader Zone-1 budget (ADR-0006) across ALL clients.\n' +
        '  Grant it deliberately: re-run with --allow-radar.'
    );
  }
}

/** The exact POST body shape `admin/oauth-clients.ts` expects. */
export function buildCreateBody({ name, scopes, tier }) {
  return { name, allowedScopes: [...scopes], tier };
}

/**
 * Render the operator's ready-to-send onboarding email.
 *
 * The `clientSecret` is DELIBERATELY absent. It exists only in the creation
 * response (`admin/oauth-clients.ts:221` — only its hash is stored), and
 * pasting it into a mail-client draft would undo that property. The email
 * says the credential arrives separately over the agreed secure channel; the
 * secret is printed to the terminal once, on its own.
 *
 * Content sourced from PILOT_ONBOARDING.md § 3 (guarantees) and
 * RATE_LIMITS.md / ADR-0010 (non-contractual ceilings framing).
 */
export function renderOnboardingEmail({ clientId, name, tier, scopes, env = 'production' }) {
  const baseUrl = BASE_URLS[env];
  return [
    `Subject: Your GST MCP server access — ${name}`,
    '',
    `Hi,`,
    '',
    `Your access to the GST MCP server is provisioned. Details below; the client secret`,
    `arrives separately over the secure channel we agreed — it is never sent by email.`,
    '',
    `  Endpoint:   ${baseUrl}/mcp`,
    `  Client ID:  ${clientId}`,
    `  Tier:       ${tier}`,
    `  Scopes:     ${scopes.join(', ')}`,
    '',
    'CONNECTING',
    '',
    // Deliberately limited to what the server actually implements and what we
    // can hand an external M2M client today. REMOTE_CLIENT_SETUP.md is still NOT
    // referenced here: it is written for GST team members authenticating with
    // an MCP_KEY_<INITIALS> value at the consent page, which an M2M pilot will
    // never have, and it documents no client_credentials flow.
    // The UAT setup guide below IS client-safe (BL-119): its §0b/§1b describe the
    // M2M credential and the bearer flow from the recipient's side, and the
    // provisioning half links to the operator runbooks rather than reproducing them.
    'Your pipeline exchanges the client ID + secret at /token with',
    'grant_type=client_credentials for a 1-hour access token, then calls the endpoint',
    'above with it as a bearer token. There is no refresh token — request a new one when',
    'it expires.',
    '',
    'A step-by-step setup walkthrough and per-capability acceptance tests are',
    'available on request - ask your GST contact for the UAT setup guide.',
    '',
    'WHAT YOU GET',
    '',
    // NOT "every tool call": capture is best-effort at the enqueue hop
    // (ADR-0009 documents the first-hop loss window, and BL-033 records this
    // AC as partially met). A fail-closed write is available for a client who
    // contracts guaranteed capture — but this email must not promise it.
    '  - Audit trail — tool calls are written to a tamper-evident, hash-chained,',
    '    immutable log with 7-year retention.',
    '  - Status transparency — https://status.mcp.globalstrategic.tech shows uptime,',
    '    dependency health, per-tool latency and audit health. Latency there is',
    '    observability, not a contracted service level.',
    '  - Rate limits — your tier carries capability ceilings we can tune on request.',
    '    They are operational ceilings, not contracted quotas.',
    '',
    'A synthetic-data sandbox is not yet available, so integration testing runs against',
    'production with the narrow-scope credential above.',
    '',
    'Reply here with any questions and we will schedule the kickoff.',
    '',
    'Global Strategic Technologies',
  ].join('\n');
}

function line(char = '-') {
  return char.repeat(72);
}

/**
 * Render everything the operator sees after a successful create.
 *
 * Exported (rather than inlined in `runCli`) so the security property can be
 * asserted in a test: the secret must appear EXACTLY once in this output, and
 * never inside the embedded email. Inline, that property was unreachable.
 */
export function renderCreatedSummary({ client, clientSecret, env = 'production' }) {
  const baseUrl = BASE_URLS[env];
  return [
    `Created M2M client on ${env}.`,
    '',
    `  Client ID:  ${client.clientId}`,
    `  Name:       ${client.name}`,
    `  Tier:       ${client.tier}`,
    `  Scopes:     ${client.allowedScopes.join(', ')}`,
    `  Created:    ${client.createdAt}`,
    '',
    line('='),
    'CLIENT SECRET — shown once, never retrievable again.',
    'Deliver over the agreed secure channel (1Password share, etc.), then clear',
    'your scrollback. Only its hash is stored server-side.',
    '',
    `  ${clientSecret}`,
    line('='),
    '',
    'ONBOARDING EMAIL (secret deliberately excluded — send it separately):',
    line(),
    renderOnboardingEmail({
      clientId: client.clientId,
      name: client.name,
      tier: client.tier,
      scopes: client.allowedScopes,
      env,
    }),
    line(),
    '',
    `Revoke with: DELETE ${baseUrl}/admin/oauth/m2m-clients/${client.clientId}`,
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  assertScopesValid(args.scopes, {
    allowRadar: args.allowRadar,
    unsafeScopes: args.unsafeScopes,
  });

  const baseUrl = BASE_URLS[args.env];
  const url = `${baseUrl}/admin/oauth/m2m-clients`;
  const body = buildCreateBody(args);

  // Warn on every real create, not just under --dry-run: an unsafe scope is
  // an unvalidated string reaching production.
  const usedUnsafe = args.scopes.filter((s) => !SUPPORTED_SCOPES.includes(s));
  if (usedUnsafe.length > 0) {
    process.stderr.write(
      `WARNING: provisioning with scope(s) outside the advertised catalog: ${usedUnsafe.join(', ')}\n`
    );
  }
  if (args.allowRadar && args.scopes.some((s) => RADAR_SCOPES.includes(s))) {
    process.stderr.write(
      'WARNING: granting radar scope — this client will spend the shared Inoreader Zone-1 budget.\n'
    );
  }

  if (args.dryRun) {
    process.stdout.write(
      [
        `DRY RUN — no client created.`,
        `POST ${url}`,
        `Authorization: Bearer $MCP_ADMIN_KEY`,
        '',
        JSON.stringify(body, null, 2),
        '',
      ].join('\n')
    );
    return;
  }

  const adminKey = process.env.MCP_ADMIN_KEY;
  if (!adminKey) {
    throw new Error(
      'MCP_ADMIN_KEY not set. There is no flag for it on purpose — see AUTH.md.\n' +
        "  PowerShell: $env:MCP_ADMIN_KEY = '<key>'\n" +
        "  bash/zsh:   export MCP_ADMIN_KEY='<key>'"
    );
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Admin API ${res.status} ${res.statusText}\n${text.slice(0, 800)}`);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Admin API returned non-JSON on 2xx:\n${text.slice(0, 800)}`);
  }
  if (!payload?.client?.clientId || typeof payload.clientSecret !== 'string') {
    throw new Error(`Unexpected admin API response shape:\n${text.slice(0, 800)}`);
  }

  const { client, clientSecret } = payload;

  process.stdout.write(renderCreatedSummary({ client, clientSecret, env: args.env }));
}

// Run the CLI only when invoked directly. Importing this module (from the
// unit tests) does not trigger CLI side effects.
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('provision-client.mjs');
if (isMain) {
  runCli().catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
}
