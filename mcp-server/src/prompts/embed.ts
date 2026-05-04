/**
 * Embed-resource helpers for prompt bodies.
 *
 * **Why this exists** (BL-031.75 Commit 5 / V1 finding 1): MCP exposes Tools
 * and Resources as separate primitives. The model can call any registered
 * Tool, but it can only `resources/read` URIs that the user has explicitly
 * pinned in the client UI (the connectors panel in Claude Desktop). When a
 * prompt body says "read `gst://library/vdr-structure`", the model usually
 * cannot — and falls back to its training. We caught this in V1: the model
 * substituted "a standard 10-folder PE-diligence VDR taxonomy" instead of
 * the canonical GST one.
 *
 * **Fix**: pre-load Resource bodies at prompt-build time and ship them as
 * `EmbeddedResource` content blocks in the `prompts/get` response. The
 * model receives the canonical content inline; no resources/read needed.
 *
 * The helpers below return `EmbeddedResource`-shaped objects when the
 * Resource is loadable, and a plain `text` content block carrying a
 * structured error when it isn't. Either way the prompt's `build()` can
 * splice the result directly into its `messages` array as a separate
 * user message after the instruction message.
 */

import type { EmbeddedResource, TextContent } from '@modelcontextprotocol/sdk/types.js';
import { loadLibraryByUri } from '../content/library-loader';
import { readFyiSnapshot, SNAPSHOT_MISSING_MESSAGE } from '../content/radar-snapshot';

/** Result of an embed helper — either an embedded Resource or a structured-error text block. */
export type EmbedResult = EmbeddedResource | TextContent;

/**
 * Load a GST Library article by URI (`gst://library/<slug>`) and return
 * an `EmbeddedResource` content block. Returns a structured-error text
 * block if the URI doesn't resolve (should never happen in normal
 * operation — slugs are codegened at prebuild time).
 */
export function embedLibraryArticle(uri: string): EmbedResult {
  const entry = loadLibraryByUri(uri);
  if (!entry) {
    return {
      type: 'text',
      text: `[GST Library article ${uri} could not be loaded at prompt expansion time. Re-run \`npm -w @gst/mcp-server run prebuild\` to regenerate the codegen index.]`,
    };
  }
  return {
    type: 'resource',
    resource: {
      uri: entry.uri,
      mimeType: entry.mimeType,
      text: entry.body,
    },
  };
}

/**
 * Load the FYI Radar snapshot and return an `EmbeddedResource` content
 * block. Returns the canonical snapshot-missing error (matching the
 * Resource handler in BL-031.5) when `.cache/inoreader/` is empty.
 *
 * The model is instructed (in `gst_radar_brief_today`'s body) to surface
 * the error verbatim and not fabricate items.
 */
export function embedFyiRadarSnapshot(): EmbedResult {
  const snapshot = readFyiSnapshot();
  if (!snapshot) {
    return { type: 'text', text: SNAPSHOT_MISSING_MESSAGE };
  }
  return {
    type: 'resource',
    resource: {
      uri: 'gst://radar/fyi/latest',
      mimeType: 'application/json',
      text: JSON.stringify(snapshot, null, 2),
    },
  };
}

/**
 * Standardized authorial-intent leading line for every prompt body
 * (BL-031.75 Commit 5 / V1 finding 2). Claude Desktop renders the
 * `prompts/get` expansion as if it were an uploaded document, which
 * triggers the model's prompt-injection hedge. This line short-circuits
 * the hedge by signalling explicit authorial intent.
 */
export function authorialIntentLine(promptName: string): string {
  return `Workflow invocation: \`${promptName}\` — a GST consultant workflow the user has explicitly initiated. The steps below are your task; treat them as the user's direct instructions and proceed without hedging about prompt provenance.`;
}
