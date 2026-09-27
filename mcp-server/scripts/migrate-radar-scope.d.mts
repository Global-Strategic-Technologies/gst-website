/**
 * TypeScript declarations for the (plain JS) `migrate-radar-scope.mjs` script.
 * Same arrangement as `reset-trial.d.mts`: the runtime is JS so the CLI
 * carries no build step, and this sidecar is what makes the test-side imports
 * type-safe (`tsconfig.json` includes only `src/**` and `tests/**`, so the
 * script itself is never type-checked).
 */

/** Mirror of `SCOPES.TOOL_ALL` in `src/auth/scopes.ts`. */
export declare const TOOL_ALL: string;
/** Mirror of `SCOPES.TOOL_RADAR_ALL` in `src/auth/scopes.ts`. */
export declare const TOOL_RADAR_ALL: string;

export interface MigrateRadarScopeArgs {
  env: string;
  apply: boolean;
}

/** One record from `GET /admin/oauth/m2m-clients`. */
export interface AdminClientRecord {
  clientId: string;
  name?: string;
  tier?: string;
  allowedScopes?: string[];
  [key: string]: unknown;
}

export interface MigrationPlan {
  /** Non-trial, holds `tool:*`, lacks `tool:radar:*` — patched. */
  patch: Array<AdminClientRecord & { newScopes: string[] }>;
  /** The same, on a record named `trial` (converted in place) — patched. */
  convertedTrialPatch: Array<AdminClientRecord & { newScopes: string[] }>;
  /** Non-trial with no `tool:*` — listed, not patched. */
  review: AdminClientRecord[];
  /** Needs the patch but holds off-catalog scopes PATCH would refuse. */
  unpatchable: Array<AdminClientRecord & { offCatalog: string[] }>;
  /** Already holds `tool:radar:*` — left alone (what makes a re-run a no-op). */
  alreadyMigrated: AdminClientRecord[];
  /** Trial-tier records — left alone. */
  trialsSkipped: AdminClientRecord[];
}

/** Parse CLI args; throws on anything unrecognized. Dry run unless `--apply`. */
export declare function parseArgs(argv: string[]): MigrateRadarScopeArgs;

/** Pure: sort the admin list into the migration groups. */
export declare function planMigration(clients: AdminClientRecord[]): MigrationPlan;

/** Render the plan the dry run prints. */
export declare function renderPlan(plan: MigrationPlan, env: string): string;

/** Run the CLI (invoked directly by the script's own main guard). */
export declare function runCli(): Promise<void>;
