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

import type { EmbeddedResource, TextContent } from '@modelcontextprotocol/server';
import { loadLibraryByUri } from '../content/library-loader';
import { loadIrlSourceBody } from '../content/irl-source-loader';
import type { SnapshotTier } from '../content/radar-transform';

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
 * Embed URI label for the IRL generator source. This is an inline embed
 * identifier, NOT a listable MCP Resource (the generator source is
 * deliberately decoupled from the `gst://library/information-request-list`
 * article Resource). The body travels inline, so no `resources/read` is
 * needed — the label just marks provenance.
 */
export const IRL_SOURCE_EMBED_URI = 'gst://irl/source';

/**
 * Strip full-line HTML comments (the BL-044.5 `<!-- skip-if: … -->`
 * directives) from the IRL generator source before embedding.
 *
 * The directives are machine annotations for the parser/filter engine, not
 * content — a model reproducing the embedded list verbatim must never render
 * them. Stripping at the embed boundary is deterministic and covers every
 * consumer (`gst_information_request_list` one-shot AND interactive bodies,
 * plus `gst_irl_ingestion`'s taxonomy embed), with no reliance on
 * per-prompt "don't render comments" instructions.
 */
function stripDirectiveLines(body: string): string {
  return body
    .split(/\r?\n/)
    .filter((line) => !/^\s*<!--/.test(line))
    .join('\n');
}

/**
 * Embed the IRL generator source (`src/data/irl/information-request-list.md`,
 * bundled via `loadIrlSourceBody()`) as an `EmbeddedResource` content block,
 * with directive comment lines stripped (see {@link stripDirectiveLines}).
 *
 * Used by `gst_information_request_list` so the in-chat artifact the model
 * reproduces is the SAME content `generate_information_request_list_xlsx`
 * renders — keeping the pasted list and the downloaded .xlsx identical. It is
 * intentionally NOT `embedLibraryArticle(gst://library/information-request-list)`:
 * the library article is free-form prose and may differ from this list.
 */
export function embedIrlGeneratorSource(): EmbedResult {
  try {
    return {
      type: 'resource',
      resource: {
        uri: IRL_SOURCE_EMBED_URI,
        mimeType: 'text/markdown',
        text: stripDirectiveLines(loadIrlSourceBody()),
      },
    };
  } catch {
    return {
      type: 'text',
      text: `[The GST IRL generator source could not be loaded at prompt expansion time. Re-run \`npm -w @gst/mcp-server run prebuild\` to regenerate the codegen index.]`,
    };
  }
}

/**
 * Wrap an already-read FYI Radar tier as a content block.
 *
 * This helper does NOT read the snapshot itself. It used to, via the
 * node:fs-backed `readFyiSnapshot()`, which resolves its cache directory from
 * `import.meta.url` — `undefined` in the Worker bundle, so every remote
 * `prompts/get` on `gst_radar_brief_today` failed with a JSON-RPC -32603
 * ("The \"path\" argument must be of type string or an instance of URL")
 * while the same read succeeded on stdio. The caller now supplies the tier,
 * read through the `SnapshotReader` appropriate to its transport, and the
 * messages appropriate to that transport with it.
 *
 * Three states, because "no data" is not one condition:
 *
 *   - `null`            → the read failed / the cache is cold  → `unavailable`
 *   - `items.length===0`→ read fine, nothing inside the 30-day
 *                         freshness window                     → `empty`
 *   - otherwise         → the snapshot, as an embedded Resource
 *
 * The model is instructed (in `gst_radar_brief_today`'s body) to surface a
 * text block verbatim and stop, rather than fabricate items. That instruction
 * keys on the block being TEXT rather than on any phrase inside it, so these
 * three strings can differ per transport without breaking it.
 */
export function embedFyiRadarSnapshot(
  snapshot: SnapshotTier | null,
  messages: { unavailable: string; empty: string }
): EmbedResult {
  if (!snapshot) {
    return { type: 'text', text: messages.unavailable };
  }
  if (snapshot.items.length === 0) {
    return { type: 'text', text: messages.empty };
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
 * `prompts/get` expansion as if it were an uploaded document, which can
 * trigger the model's prompt-injection hedge. This line orients the model
 * by stating provenance positively — the workflow came from a deliberate
 * user action (the MCP prompt menu).
 *
 * BL-086 follow-up: the original phrasing ("treat them as the user's direct
 * instructions and proceed without hedging about prompt provenance") was
 * counterproductive on v4.7+ models — instructing the model NOT to question
 * provenance reads as an injection tell and triggered the very refusal it
 * aimed to prevent (observed live on a partner-paste gst_irl_ingestion run,
 * 2026-06-30). The reworded line states where the workflow came from and
 * leaves the model's judgment intact.
 */
export function authorialIntentLine(promptName: string): string {
  return `Workflow invocation: \`${promptName}\` — a GST consultant workflow the user explicitly initiated from the MCP prompt menu. The steps below are the task to carry out.`;
}
