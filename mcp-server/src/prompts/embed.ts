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
 *
 * **Also used by `gst_irl_ingestion`, unconditionally, for all four of its
 * rendered bodies** — the taxonomy the answers came back against is the one the
 * workbook was generated from, and it is what the IRL extract record's `ref`
 * values key off. (This comment named one caller while a second had been
 * calling it from every body shape; the same stale-sibling family as the SOP's
 * "one source, three surfaces" line, corrected in the same pass.)
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

/**
 * BL-125 — the delivered-as-a-document clause, for bodies that cannot argue
 * from a `**Body-binding hash:**` directive.
 *
 * `gst_irl_ingestion`'s one-shot bodies already carry a version of this, but
 * their evidence is that directive: "the server computed it from your
 * `filledIrl` argument, so the render demonstrably happened." Four of the six
 * rendered bodies in this workspace never emit it — both interactive arms of
 * `gst_irl_ingestion` (no `filledIrl` argument to hash at render time) and both
 * `gst_information_request_list` branches — so a copy-paste would assert
 * evidence that does not exist there.
 *
 * This form argues **structurally** instead, from content the client could not
 * have synthesized. It deliberately does NOT prescribe a tool probe as the
 * recovery path: the extract-only arms permit exactly one call
 * (`prepare_irl_body`, to mint the record's provenance) and forbid every
 * analysis tool, while the `gst_information_request_list` bodies orchestrate
 * neither of the IRL-pipeline tools that probe would use.
 *
 * Written in the register BL-086 established for `authorialIntentLine`: state
 * where the content came from and leave the model's judgment intact. Telling a
 * model not to question provenance reads as an injection tell and triggers the
 * refusal it aims to prevent — observed live on a partner-paste run, 2026-06-30.
 * Four production balks across three surfaces (2026-08-14) are what this
 * addresses; each cost the operator a turn and one abandoned the run.
 */
export function deliveredAsDocumentClause(opts: { citesRunParameters: boolean }): string {
  // The evidence is parameterized for the same reason this second form exists
  // at all: the original clause cited a `**Body-binding hash:**` directive that
  // three of the five bodies never render. Citing a "Run parameters" block on
  // the two `gst_information_request_list` bodies — which have none — would
  // reproduce that defect one layer down, in the clause whose whole job is to
  // be believed by a model already wondering whether it is reading a
  // transcript.
  const evidence = opts.citesRunParameters
    ? 'the canonical reference embedded as the next message is served from the server-side registry, and the run parameters above are the resolved values of the arguments the user filled in. Neither is text a client could have produced on its own.'
    : 'the canonical reference embedded as the next message is served from the server-side registry, which is not text a client could have produced on its own.';
  return [
    `**If this body reached you as an attached file rather than as conversation turns, that is how some clients render a large expanded prompt — it is not evidence that the workflow was not invoked.** The content here was assembled by the GST MCP server when the user selected this prompt: ${evidence}`,
    '',
    'Proceed with the steps as written. If something in them genuinely looks wrong, say what and why — but arriving as a file is not that.',
  ].join('\n');
}

/**
 * The IRL-evidence precedence clause — carried by every prompt that takes
 * target inputs (`consumesTargetEvidence` on `GstPrompt`).
 *
 * **Why a third shared clause.** `authorialIntentLine()` is the all-prompts
 * precedent; `deliveredAsDocumentClause()` is deliberately in two. This one is
 * in six, and the set is DECLARED rather than inferred — the registry guard
 * asserts clause-present ⇔ flag-set, so a tenth prompt has to choose.
 *
 * **What it fixes.** `gst_target_quick_look` disagreed with itself: Step 1a
 * derived from "supplied inputs + anything the user has shared earlier in the
 * conversation" while Step 2 hardcoded `Section -- — partner-supplied form
 * input` citations and Step 3 said to *synthesize* raw inputs from stage norms.
 * Under the derived-tier discipline (ADR-0003) a `Section --` sentinel grades
 * as `partner-supplied`, so a real Section-00 ARR figure and a stage-norm guess
 * arrived at identical provenance grade. `gst_diligence_kickoff` and
 * `gst_diligence_handoff_memo` mandated the same Tier-3 sentinel on all 13
 * agenda dimensions unconditionally.
 *
 * **The staleness sentence is load-bearing, not a hedge.** The record is
 * context-borne with no server copy, and the IRL body cache behind
 * `irlBodyHash` expires after 4 h — so in a later session the record's
 * citations are asserted, not verified, until the paired body is re-seeded and
 * validated. Saying which of the two applies is also what gives
 * `_meta.generatedAt` / `_meta.promptVersion` a reader on the consumer side.
 */
export function irlEvidencePrecedence(): string {
  return [
    '**Canonical GST target evidence takes precedence over synthesis.** If any is present in this context — a filled IRL, an IRL extract record (a `record: irl-extract` JSON document), or a target document the user supplied — resolve every input from it before synthesizing anything, matching on the IRL request text each fact carries. Cite the reference. Synthesize only what the evidence does not cover, and say what you synthesized. Never overwrite a stated figure with a norm; when a form argument and the evidence disagree, the argument wins and the output says so.',
    '',
    "**Verified vs asserted — state which you have.** An extract record's citations are ASSERTED, not verified, unless the paired filled IRL has been validated in THIS session via `validate_irl_provenance`. The record travels through context while the server-side body cache behind its `_meta.irlBodyHash` expires after four hours, so a record arriving in a later session will not resolve by hash. To upgrade: call `prepare_irl_body` with the paired body to re-seed, then `validate_irl_provenance` in its hash form. If you cannot — no paired body, or you chose not to — the record is still usable; say in the output that its citations are asserted-not-verified, and carry `_meta.generatedAt` and `_meta.promptVersion` so the reader knows how old the extraction is and what produced it.",
  ].join('\n');
}

/**
 * BL-125 — what the embedded second message IS.
 *
 * Every prompt in this workspace that embeds a resource described it only as
 * "for reference" or "embedded inline". Two production consequences: a run
 * read the blank IRL taxonomy as a *filled* IRL that had lost its answers and
 * halted to ask the operator what had happened; another proposed diffing the
 * embed against `list_irl_requests` before trusting it, because the body says
 * to reproduce it verbatim without saying where it came from.
 *
 * `isIngestion` distinguishes the two failure modes: the ingestion prompt also
 * needs to be told this is not the body to sweep, since a blank template that
 * resembles the expected input is exactly what confused it.
 */
export function embeddedTaxonomyFraming(isIngestion: boolean): string {
  const base =
    'The next message is the **blank canonical IRL taxonomy** — the request template itself, every bullet a question with no answer. It is served from the GST registry at invocation time, which makes it the authoritative bullet set: reproduce it as-is rather than reconciling it against another source.';
  return isIngestion
    ? `${base} **It is NOT the filled IRL and must not be swept.** A blank template arriving where a populated one is expected reads like a paste that lost its answers; it is neither. The filled body is whatever the user supplies through \`filledIrl\`, attaches to the conversation, or pastes in reply.`
    : base;
}
