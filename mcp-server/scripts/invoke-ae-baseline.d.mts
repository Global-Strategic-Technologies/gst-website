/**
 * TypeScript declarations for the (plain JS) `invoke-ae-baseline.mjs`
 * script. The runtime is JS so the CLI doesn't carry a build step; the
 * declarations let the unit tests + any future TS caller type-check the
 * exported helpers.
 */

export declare const DATASETS: Readonly<{
  staging: 'mcp_events_staging';
  production: 'mcp_events';
}>;

export declare const CALIBRATION: Readonly<{
  latencyMultiplier: number;
  availabilitySustainedPct: number;
  availabilitySpikePct: number;
  freshnessSeconds: number;
}>;

export declare const MIN_EVENTS_FOR_SLO: number;

export interface BaselineQueries {
  readonly latencySql: string;
  readonly spendSql: string;
}

export declare function buildBaselineQueries(opts: {
  dataset: string;
  windowDays: number;
}): BaselineQueries;

/** AE SQL API `FORMAT JSON` response rows are stringly-typed. */
export type AeResponseRow = Record<string, string | number | null | undefined>;

export interface AeResponse {
  readonly data: readonly AeResponseRow[];
}

export declare function assertAeResponseShape(
  json: unknown,
  label: string
): readonly AeResponseRow[];

export declare function formatLatencyTable(aeJson: AeResponse): string;

export declare function formatSpendTable(aeJson: AeResponse): string;

export declare function proposeSloTargets(aeJson: AeResponse): string;
