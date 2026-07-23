/**
 * Type sidecar for `probe-latency.mjs` (same pattern as
 * `tests/fixtures/radar-mock-data.d.mts`) — lets the TS unit suite import
 * the probe's pure helpers with real types while the implementation stays
 * plain dependency-free Node.
 */

export interface ProbeSurface {
  readonly name: string;
  readonly kind: 'http-get' | 'tool';
  readonly path?: string;
  readonly args?: Record<string, unknown>;
  readonly sla: boolean;
  readonly fixedSamples?: number;
}

export interface ProbeStats {
  readonly count: number;
  readonly p50: number | null;
  readonly p95: number | null;
  readonly max: number | null;
}

export interface ProbeSurfaceResult {
  readonly name: string;
  readonly sla: boolean;
  readonly outcomes: Record<string, number>;
  readonly stats: ProbeStats;
}

export declare const PROBE_SURFACES: readonly ProbeSurface[];
export declare function buildToolCallBody(
  name: string,
  args: Record<string, unknown>,
  id?: number
): string;
export declare function parseSseEnvelope(bodyText: string): unknown;
export declare function readFirstSseEvent(body: ReadableStream<Uint8Array>): Promise<string>;
export declare function classifyOutcome(status: number, envelope: unknown): string;
export declare function percentile(samples: readonly number[], p: number): number | null;
export declare function computeStats(latenciesMs: readonly number[]): ProbeStats;
export declare function renderSummaryTable(
  results: readonly ProbeSurfaceResult[],
  meta: { regionLabel: string; mcpUrl: string }
): string;
