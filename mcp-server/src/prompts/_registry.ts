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
import { emitForceToolsUsed } from '../metrics/irl-ingestion-events';
import { handlePrepareIrlBodyTool } from '../tools/prepare-irl-body';
import { safeLog } from '../auth/safe-logger';
import { computeIrlBodyHash } from '../schemas/compose-dossier-envelope';
import { UPSTASH_KEY_PREFIX } from '../cache/irl-body-cache';
import type { GstPrompt } from './types';
import { diligenceKickoffPrompt } from './diligence-kickoff';
import { targetQuickLookPrompt } from './target-quick-look';
import { comparableEngagementsMemoPrompt } from './comparable-engagements-memo';
import { regulatoryExposureBriefPrompt } from './regulatory-exposure-brief';
import { diligenceHandoffMemoPrompt } from './diligence-handoff-memo';
import { architectureLayerReviewPrompt } from './architecture-layer-review';
import { radarBriefTodayPrompt } from './radar-brief-today';
import { informationRequestListPrompt } from './information-request-list';
import { irlIngestionPrompt } from './irl-ingestion';

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
  irlIngestionPrompt,
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

export function registerPrompts(
  server: McpServer,
  metrics: MetricsContext = NOOP_METRICS_CONTEXT
): void {
  for (const prompt of ALL_PROMPTS) {
    assertPromptInvariants(prompt);
    // BL-045 PR B: instrument `gst_irl_ingestion`'s server-side-observable
    // signals (forceTools usage) at the build seam. Wrap the build function
    // with a forceTools sniffer; the wrapper emits the `force_tools_used`
    // counter then delegates to the original build. Other prompts pass
    // through unchanged.
    const wrappedBuild =
      prompt.name === 'gst_irl_ingestion'
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async (args: any) => {
            emitForceToolsUsed(metrics, args?.forceTools);
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
                await handlePrepareIrlBodyTool({ filledIrl: args.filledIrl }, metrics);
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
            return prompt.build(args);
          }
        : prompt.build;
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
