/**
 * TypeScript declarations for the (plain JS) `provision-client.mjs` script.
 * The runtime is JS so the CLI doesn't carry a build step; the declarations
 * let the unit tests + any future TS caller type-check the exported helpers.
 *
 * (`tsconfig.json` includes only `src/**` and `tests/**`, so the script
 * itself is never type-checked — this sidecar is what makes the test-side
 * imports type-safe.)
 */

export declare const BASE_URLS: Readonly<{
  staging: 'https://mcp-staging.globalstrategic.tech';
  production: 'https://mcp.globalstrategic.tech';
}>;

/** Mirror of `ASSIGNABLE_TIERS` in `src/ratelimit/tiers.ts`. */
export declare const ASSIGNABLE_TIERS: readonly string[];

/** Mirror of `SCOPES_SUPPORTED` in `src/auth/scopes.ts`. */
export declare const SUPPORTED_SCOPES: readonly string[];

/** Scopes granted when `--scopes` is omitted (radar-free by construction). */
export declare const MINIMUM_SCOPES: readonly string[];

/** Scopes that spend the shared Inoreader Zone-1 budget (ADR-0006). */
export declare const RADAR_SCOPES: readonly string[];

export interface ProvisionArgs {
  readonly name: string;
  readonly tier: string;
  readonly scopes: readonly string[];
  readonly env: keyof typeof BASE_URLS;
  readonly allowRadar: boolean;
  readonly unsafeScopes: readonly string[];
  readonly dryRun: boolean;
}

/** Throws on unknown flags, a missing `--name`/`--tier`, or a bad `--env`. */
export declare function parseArgs(argv: readonly string[]): ProvisionArgs;

/** Throws on scopes outside the advertised catalog, or radar without the flag. */
export declare function assertScopesValid(
  scopes: readonly string[],
  opts?: { allowRadar?: boolean; unsafeScopes?: readonly string[] }
): void;

export interface CreateM2mClientBody {
  readonly name: string;
  readonly allowedScopes: string[];
  readonly tier: string;
}

export declare function buildCreateBody(input: {
  name: string;
  scopes: readonly string[];
  tier: string;
}): CreateM2mClientBody;

/** Renders the hand-off email. Never contains the client secret. */
export declare function renderOnboardingEmail(input: {
  clientId: string;
  name: string;
  tier: string;
  scopes: readonly string[];
  env?: keyof typeof BASE_URLS;
}): string;

export interface CreatedClientRecord {
  readonly clientId: string;
  readonly name: string;
  readonly tier: string;
  readonly allowedScopes: readonly string[];
  readonly createdAt: string;
}

/**
 * Renders the post-create operator output. The secret appears exactly once
 * here and never inside the embedded email — asserted in the unit tests.
 */
export declare function renderCreatedSummary(input: {
  client: CreatedClientRecord;
  clientSecret: string;
  env?: keyof typeof BASE_URLS;
}): string;
