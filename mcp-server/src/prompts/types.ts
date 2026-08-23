/**
 * Uniform shape every prompt module satisfies.
 *
 * The fields capture both the SDK contract (`name` / `description` /
 * `argsSchema` / `build`) and the operational metadata that makes the
 * prompt library scalable (`version` / `lastReviewedAt` / `orchestrates`).
 *
 * `_registry.ts` iterates an `ALL_PROMPTS: GstPrompt<any>[]` array, validates
 * every entry's invariants at module-load time, and calls
 * `server.registerPrompt(...)` on each one. See
 * `mcp-server/src/docs/prompts/README.md` (authored alongside Commit 3) for
 * the conceptual explanation.
 */

import type { z } from 'zod';
import type { GetPromptResult } from '@modelcontextprotocol/server';
import type { EmbedResult } from './embed';

export interface GstPrompt<TArgs extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>> {
  /** Slash-menu name. Must match `/^gst_[a-z_]+$/`. */
  name: string;
  /** Human-readable label rendered in the slash-menu picker. */
  description: string;
  /** Semver. Bump on non-trivial body changes; surfaces in CI tests. */
  version: string;
  /** ISO date (YYYY-MM-DD). Vitest fails when older than 12 months. */
  lastReviewedAt: string;
  /**
   * Manifest of every Tool name and Resource URI scheme this prompt
   * expects the model to use. Two purposes: (a) docs at a glance,
   * (b) drift detection — the registry test asserts each entry resolves
   * to a registered tool name or a Resource URI scheme prefix, and the
   * per-prompt unit test asserts the message body literally mentions
   * each entry. Both checks are symmetric — drift in either direction
   * fails the suite.
   */
  orchestrates: ReadonlyArray<string>;
  /** Zod schema for the slash-menu form fields. Compose from existing schemas. */
  argsSchema: TArgs;
  /**
   * Declares that this prompt embeds the FYI Radar tier. `_registry.ts` reads
   * it to decide whether to resolve a snapshot block before calling `build`.
   *
   * Declarative rather than a `prompt.name === '…'` check in the registry:
   * one name-match is a special case, two would be a pattern.
   */
  needsFyiSnapshot?: true;
  /**
   * Declares that this prompt takes TARGET inputs and must therefore carry
   * `irlEvidencePrecedence()` — the clause telling the model to resolve inputs
   * from canonical GST target evidence (a filled IRL, an IRL extract record, a
   * target document) before synthesizing anything.
   *
   * Declared rather than inferred, for the same reason as `needsFyiSnapshot`:
   * no existing property expresses "takes target inputs", and a
   * `prompt.name === '…'` check in the registry is a special case at one and a
   * pattern at two. The guard asserts clause-present ⇔ flag-set across
   * `ALL_PROMPTS`, so every new prompt has to make a choice rather than
   * silently opting out — prompt #10 (`gst_irl_fill`, BL-140) chose exclusion
   * for its stop-at-artifact ruling; the guard's rationale block records why.
   *
   * The literal type (matching `needsFyiSnapshot`) is deliberate: there is no
   * third `false` state for the guard to define.
   */
  consumesTargetEvidence?: true;
  /**
   * Builds the user/assistant messages spliced into the conversation.
   *
   * Synchronous by contract. Any async work — reading a snapshot, writing the
   * IRL body cache — happens in `_registry.ts`'s wrapper, which is where the
   * transport and its bindings are known. Keeping `build` sync is also what
   * lets every prompt unit test call it directly and read `.messages` without
   * awaiting.
   *
   * `fyiEmbed` is the ALREADY-RESOLVED content block, supplied only to prompts
   * declaring `needsFyiSnapshot`. The registry resolves it because only the
   * registry knows which transport (and therefore which reader and which
   * degraded-state wording) applies; a prompt module choosing for itself would
   * have to import the constants directly and would ship stdio remediation
   * advice to remote clients.
   */
  build: (args: z.infer<TArgs>, fyiEmbed?: EmbedResult) => GetPromptResult;
}
