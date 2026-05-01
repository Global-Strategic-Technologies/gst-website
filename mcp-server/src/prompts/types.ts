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
  /** Builds the user/assistant messages spliced into the conversation. */
  build: (args: z.infer<TArgs>) => GetPromptResult;
}
