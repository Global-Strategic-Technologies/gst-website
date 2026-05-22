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

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GstPrompt } from './types';
import { diligenceKickoffPrompt } from './diligence-kickoff';
import { targetQuickLookPrompt } from './target-quick-look';
import { comparableEngagementsMemoPrompt } from './comparable-engagements-memo';
import { regulatoryExposureBriefPrompt } from './regulatory-exposure-brief';
import { diligenceHandoffMemoPrompt } from './diligence-handoff-memo';
import { vdrAuditPrompt } from './vdr-audit';
import { architectureLayerReviewPrompt } from './architecture-layer-review';
import { radarBriefTodayPrompt } from './radar-brief-today';
import { informationRequestListPrompt } from './information-request-list';

/** Frozen list of every prompt the server registers. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ALL_PROMPTS: ReadonlyArray<GstPrompt<any>> = [
  diligenceKickoffPrompt,
  targetQuickLookPrompt,
  comparableEngagementsMemoPrompt,
  regulatoryExposureBriefPrompt,
  diligenceHandoffMemoPrompt,
  vdrAuditPrompt,
  architectureLayerReviewPrompt,
  radarBriefTodayPrompt,
  informationRequestListPrompt,
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

export function registerPrompts(server: McpServer): void {
  for (const prompt of ALL_PROMPTS) {
    assertPromptInvariants(prompt);
    // SDK v1.29's `registerPrompt` expects `argsSchema` to be a ZodRawShape
    // (the `{ key: ZodType }` map), not a wrapped `z.object({...})`. Passing
    // the wrapped object causes the SDK to enumerate ZodObject's prototype
    // methods (keyof / catchall / passthrough / loose / strict / strip) as
    // if they were arguments — surfacing in Claude Desktop as bogus form
    // fields. `.shape` extracts the raw map. See registry-shape regression
    // test alongside this file.
    server.registerPrompt(
      prompt.name,
      {
        description: prompt.description,
        argsSchema: prompt.argsSchema.shape,
      },
      prompt.build
    );
  }
}

export { assertPromptInvariants };
