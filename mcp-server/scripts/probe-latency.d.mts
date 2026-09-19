/**
 * Type sidecar for `probe-latency.mjs` (same pattern as
 * `tests/fixtures/radar-mock-data.d.mts`) — lets the TS unit suite import
 * the probe's pure helpers with real types while the implementation stays
 * plain dependency-free Node.
 */

export interface ProbeSurface {
  readonly name: string;
  readonly kind: 'http-get' | 'http-post-form' | 'tool';
  readonly path?: string;
  readonly args?: Record<string, unknown>;
  /** `http-post-form` only: the urlencoded body, built per call. */
  readonly body?: () => string;
  /** Statuses that count as an `ok` sample for this surface (e.g. an expected 401). */
  readonly okStatuses?: readonly number[];
  readonly sla: boolean;
  /** Never part of the scheduled set; reachable only via `--surfaces`. */
  readonly adhoc?: boolean;
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

export interface TimedCallResult {
  readonly outcome: string;
  readonly latencyMs: number | null;
  readonly detail?: string;
}

export declare const PROBE_SURFACES: readonly ProbeSurface[];
export declare function selectSurfaces(
  names: readonly string[] | null | undefined,
  surfaces?: readonly ProbeSurface[]
): ProbeSurface[];
export declare function surfaceNeedsAuth(surface: ProbeSurface): boolean;
export declare function timedCall(
  surface: ProbeSurface,
  ctx: { mcpUrl: string; mcpKey?: string; id: number },
  fetchImpl?: typeof fetch
): Promise<TimedCallResult>;
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
