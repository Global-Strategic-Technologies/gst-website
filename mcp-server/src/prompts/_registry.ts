/**
 * Central prompt registry.
 *
 * Imports every prompt module, validates module-load-time invariants
 * (gst_ name prefix, semver version, ISO lastReviewedAt within 12 months,
 * non-empty orchestrates), and calls `server.registerPrompt(...)` on each
 * entry via `registerPrompts(server)`.
 *
 * Adding a new prompt: write a new TS file in `prompts/` exporting a
 * `GstPrompt<...>`-typed object, then add it to `ALL_PROMPTS` below. No
 * other file changes are needed — the registry test verifies each entry's
 * `orchestrates` resolves to either a registered tool name or a known
 * Resource URI scheme prefix, and the per-prompt unit test verifies the
 * message body mentions each `orchestrates` entry.
 */

import type { McpServer } from '@modelcontextprotocol/server';
import { NOOP_METRICS_CONTEXT, withPromptMetrics, type MetricsContext } from '../metrics/_index';
import { handlePrepareIrlBodyTool } from '../tools/prepare-irl-body';
import { safeLog } from '../auth/safe-logger';
import { computeIrlBodyHash } from '../schemas/compose-dossier-envelope';
import { UPSTASH_KEY_PREFIX } from '../cache/irl-body-cache';
import { NO_FRESH_CURATED_ITEMS, SNAPSHOT_MISSING_STDIO } from '../content/radar-messages';
import type { SnapshotReader } from '../content/radar-snapshot-reader';
import { embedFyiRadarSnapshot } from './embed';
import type { GstPrompt } from './types';
import { diligenceKickoffPrompt } from './diligence-kickoff';
import { targetQuickLookPrompt } from './target-quick-look';
import { comparableEngagementsMemoPrompt } from './comparable-engagements-memo';
import { regulatoryExposureBriefPrompt } from './regulatory-exposure-brief';
import { diligenceHandoffMemoPrompt } from './diligence-handoff-memo';
import { architectureLayerReviewPrompt } from './architecture-layer-review';
import { radarBriefTodayPrompt } from './radar-brief-today';
import { informationRequestListPrompt } from './information-request-list';
import { irlFillPrompt } from './irl-fill';
import { irlIngestionPrompt } from './irl-ingestion';
import { irlSweepPrompt } from './irl-sweep';

/** Frozen list of every prompt the server registers. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ALL_PROMPTS: ReadonlyArray<GstPrompt<any>> = [
  diligenceKickoffPrompt,
  targetQuickLookPrompt,
  comparableEngagementsMemoPrompt,
  regulatoryExposureBriefPrompt,
  diligenceHandoffMemoPrompt,
  architectureLayerReviewPrompt,
  radarBriefTodayPrompt,
  informationRequestListPrompt,
  irlFillPrompt,
  irlIngestionPrompt,
  // Trust-the-operator successor to gst_irl_ingestion — coexists during the
  // live-verification window; PR2 of the rebuild removes the old surface.
  // Deliberately NO name-based special case in the render wrapper below:
  // this prompt hashes nothing and seeds nothing.
  irlSweepPrompt,
];

const NAME_PATTERN = /^gst_[a-z][a-z_]*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[a-z0-9.-]+)?$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Module-load-time validation. Throws on the first invariant violation
 * so a malformed prompt fails the server boot rather than degrading
 * silently at runtime.
 */
function assertPromptInvariants(prompt: GstPrompt, now: Date = new Date()): void {
  if (!NAME_PATTERN.test(prompt.name)) {
    throw new Error(
      `[prompts/_registry] prompt name "${prompt.name}" must match /^gst_[a-z][a-z_]*$/`
    );
  }
  if (!SEMVER_PATTERN.test(prompt.version)) {
    throw new Error(
      `[prompts/_registry] prompt "${prompt.name}" version "${prompt.version}" is not semver`
    );
  }
  if (!ISO_DATE_PATTERN.test(prompt.lastReviewedAt)) {
    throw new Error(
      `[prompts/_registry] prompt "${prompt.name}" lastReviewedAt "${prompt.lastReviewedAt}" must be YYYY-MM-DD`
    );
  }
  const reviewedMs = Date.parse(prompt.lastReviewedAt);
  if (Number.isNaN(reviewedMs)) {
    throw new Error(
      `[prompts/_registry] prompt "${prompt.name}" lastReviewedAt "${prompt.lastReviewedAt}" is not a valid date`
    );
  }
  if (now.getTime() - reviewedMs > TWELVE_MONTHS_MS) {
    throw new Error(
      `[prompts/_registry] prompt "${prompt.name}" lastReviewedAt "${prompt.lastReviewedAt}" is more than 12 months old; senior-consultant review required`
    );
  }
  if (prompt.orchestrates.length === 0) {
    throw new Error(
      `[prompts/_registry] prompt "${prompt.name}" must declare at least one orchestrates entry`
    );
  }
}

/** Transport-supplied dependencies for prompts that embed the FYI Radar tier. */
export interface RegisterPromptsOptions {
  /**
   * Reader for the FYI tier. Omitted by callers that register no radar-backed
   * prompt path (and by tests) — a prompt declaring `needsFyiSnapshot` then
   * renders its "unavailable" block rather than throwing.
   *
   * The Worker supplies a CACHE-ONLY reader deliberately: see
   * `createWorkerCachedSnapshotReader`.
   */
  radarReader?: SnapshotReader;
  /**
   * Degraded-state wording for the two non-item states. Defaults to the stdio
   * pair, matching the no-`ctx` `createServer()` path; the Worker overrides it
   * with remote-appropriate remediation.
   */
  messages?: { unavailable: string; empty: string };
}

const DEFAULT_RADAR_MESSAGES = {
  unavailable: SNAPSHOT_MISSING_STDIO,
  empty: NO_FRESH_CURATED_ITEMS,
} as const;

export function registerPrompts(
  server: McpServer,
  metrics: MetricsContext = NOOP_METRICS_CONTEXT,
  options: RegisterPromptsOptions = {}
): void {
  const { radarReader, messages = DEFAULT_RADAR_MESSAGES } = options;
  for (const prompt of ALL_PROMPTS) {
    assertPromptInvariants(prompt);
    // EVERY prompt is wrapped, not just the ones needing async work.
    //
    // Two things happen in here. BL-079 pre-populates the IRL body cache at
    // `gst_irl_ingestion`'s build seam, for that prompt only.
    // Separately, any prompt declaring `needsFyiSnapshot` gets its content
    // block resolved below.
    //
    // The SDK's `PromptCallback` is `(args, ctx: ServerContext)` and
    // `withPromptMetrics` forwards `...args`, so handing it a two-parameter
    // `build` directly would alias the per-request `ServerContext` into the
    // `fyiEmbed` slot. Wrapping uniformly means every registered callback has
    // arity 1 and the SDK's second argument is never aliased. It also keeps
    // `build` assignable to `PromptCallback` by arity widening, with no cast.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedBuild = async (args: any) => {
      if (prompt.name === 'gst_irl_ingestion') {
        // BL-079 Part B — prompt-render-time cache pre-population.
        //
        // When the operator supplied `filledIrl` as a prompt arg, write
        // the body to the shared IrlBodyCache BEFORE returning the
        // rendered prompt body to the model. This is the structural fix
        // for the model output stream emission ceiling: subsequent
        // `compose_dossier_envelope` and `validate_irl_provenance` calls
        // can read the EXACT operator-pasted bytes from cache via
        // `irlBodyHash` without the model ever emitting the body.
        //
        // ALT-D PATTERN: reuse `handlePrepareIrlBodyTool` so the size
        // cap, the BL-077a read-after-write probe, the `bl077.cache.set`
        // safeLog instrumentation, and the `IrlBodyCacheWriteFailedError`
        // surfacing logic are inherited for free.
        //
        // SYNC AWAIT (audit revision — NOT fire-and-forget): Cloudflare
        // Workers terminate pending I/O at request completion unless
        // `ctx.waitUntil` extends them. The ~50–100ms Upstash PUT cost
        // is unmeasurable next to model TTFT on a 50KB prompt body.
        //
        // Failure is non-fatal — prompt render still completes; model
        // falls through to legacy `prepare_irl_body` path on the first
        // cache-miss. The `bl079.cache.preload.failed` safeLog event
        // surfaces the failure for `wrangler tail` correlation.
        if (args?.filledIrl && metrics.irlBodyCache) {
          try {
            // 'prompt-render' is the ONLY mint that can support
            // `partner-paste-verbatim-prepop`: the server computed the hash from
            // the operator's own prompt argument, with no model emission in the
            // path. It must be passed explicitly — the write site is shared with
            // the `prepare_irl_body` tool (ALT-D reuse above) and cannot tell the
            // two callers apart on its own.
            await handlePrepareIrlBodyTool({ filledIrl: args.filledIrl }, metrics, 'prompt-render');
          } catch (err) {
            const hash = computeIrlBodyHash(args.filledIrl);
            safeLog({
              event: 'bl079.cache.preload.failed',
              key: `${UPSTASH_KEY_PREFIX}${hash}`,
              storeId:
                'storeId' in metrics.irlBodyCache
                  ? (metrics.irlBodyCache as { storeId?: number }).storeId
                  : undefined,
              reason: err instanceof Error ? err.message.slice(0, 300) : String(err),
              success: false,
              errorCode: 'bl079-preload-failed',
            });
          }
        }
      }

      // Resolve the FYI block HERE, not inside `build`. Only this layer knows
      // which transport it is on, and therefore which reader to read through
      // and which degraded-state wording applies. A prompt module deciding for
      // itself would have to import the message constants directly and would
      // hand remote clients the stdio `npm run radar:seed` remediation.
      const fyiEmbed = prompt.needsFyiSnapshot
        ? embedFyiRadarSnapshot((await radarReader?.readFyi()) ?? null, messages)
        : undefined;
      return prompt.build(args, fyiEmbed);
    };
    server.registerPrompt(
      prompt.name,
      {
        description: prompt.description,
        // BL-106 — the wrapped `z.object({...})`, not `.shape`.
        //
        // SDK v1 accepted only a ZodRawShape here, and passing the wrapped
        // object made it enumerate ZodObject's prototype methods (keyof /
        // catchall / passthrough / loose / strict / strip) as if they were
        // arguments — surfacing in Claude Desktop as bogus form fields, which
        // is why `.shape` was here. SDK v2 takes a StandardSchema directly and
        // derives the argument list via `~standard.jsonSchema`, so the raw map
        // is unnecessary and its overload is `@deprecated`. The prompts-args
        // regression tests still pin the resulting argument names.
        argsSchema: prompt.argsSchema,
      },
      withPromptMetrics(prompt.name, metrics, wrappedBuild)
    );
  }
}

export { assertPromptInvariants };
