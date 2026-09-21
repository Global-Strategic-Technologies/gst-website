/**
 * TypeScript declarations for the (plain JS) `reset-trial.mjs` script.
 * Same arrangement as `provision-client.d.mts`: the runtime is JS so the CLI
 * carries no build step, and this sidecar is what makes the test-side imports
 * type-safe (`tsconfig.json` includes only `src/**` and `tests/**`, so the
 * script itself is never type-checked).
 */

/** Mirror of `TRIAL_CLIENT_NAME` in `src/trial/signup.ts`. */
export declare const TRIAL_CLIENT_NAME: string;

export interface ResetTrialArgs {
  client: string | undefined;
  env: string;
  list: boolean;
  yes: boolean;
}

/** Parse CLI args; throws on anything unrecognized or missing. */
export declare function parseArgs(argv: string[]): ResetTrialArgs;

/** Render the trial-only roster for `--list`. */
export declare function renderTrialList(clients: Array<Record<string, unknown>>): string;

/** Render the confirm-me preview `--client` prints without `--yes`. */
export declare function renderPreview(client: Record<string, unknown>, env: string): string;

/** Run the CLI (invoked directly by the script's own main guard). */
export declare function runCli(): Promise<void>;
