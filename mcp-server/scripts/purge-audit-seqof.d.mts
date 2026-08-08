/**
 * TypeScript declarations for the (plain JS) `purge-audit-seqof.mjs` script.
 * The runtime is JS so the operator CLI carries no build step; these let the
 * unit tests type-check the exported safety helpers.
 */

export const SEQOF_PREFIX: string;
export const CHAIN_TIP_ENVS: readonly string[];
export const UNLINK_BATCH_SIZE: number;

export interface PurgeArgs {
  readonly execute: boolean;
  readonly help: boolean;
}

/** Dry-run is the default; throws on unknown flags. */
export function parsePurgeArgs(argv: readonly string[]): PurgeArgs;

/** Defensive partition — only `mcp:audit:seqof:*` keys may reach the delete path. */
export function partitionSeqofKeys(keys: readonly string[]): {
  valid: string[];
  invalid: string[];
};

export function batchKeys(keys: readonly string[], size?: number): string[][];

export function summarizeByEnv(keys: readonly string[]): Record<string, number>;

/** Minimal Redis surface the collectors need (matches @upstash/redis). */
export interface ScanRedisLike {
  scan(
    cursor: string | number,
    opts: { match: string; count: number }
  ): Promise<[string, string[]]>;
}

export interface MgetRedisLike {
  mget(...keys: string[]): Promise<(unknown | null)[]>;
}

export function collectSeqofKeys(redis: ScanRedisLike): Promise<string[]>;

export function approxBytesHeld(redis: MgetRedisLike, keys: readonly string[]): Promise<number>;
