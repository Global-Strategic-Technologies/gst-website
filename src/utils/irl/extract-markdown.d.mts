/**
 * TypeScript declarations for the (plain JS) `extract-markdown.mjs` module.
 *
 * The runtime is `.mjs` rather than `.ts` because the operator CLI
 * (`mcp-server/scripts/extract-irl-markdown.mjs`) runs under raw Node with no
 * build step and cannot import TypeScript; these declarations let the browser
 * page, the round-trip tests, and any future TS caller type-check against it.
 * Same pattern as `mcp-server/tests/fixtures/radar-mock-data.d.mts`.
 */

export interface ExtractIrlMarkdownResult {
  /** Canonical IRL markdown body, ready to paste into the sweep's `filledIrl`. */
  readonly markdown: string;
  /** Number of bullet rows emitted (one per filled IRL request). */
  readonly bulletCount: number;
  /**
   * Two-digit section identifiers (e.g. `'00'`, `'01'`, `'09'`) discovered
   * in the workbook, in first-seen order. These are NUMBERS, not titles.
   */
  readonly sectionsSeen: readonly string[];
  /**
   * BL-120 — refs whose Status says `CLOSED`/`PARTIAL` while every content
   * column (D/E/F/G) is empty. A genuine contradiction: the row renders
   * `<NO RESPONSE>` despite claiming an answer.
   */
  readonly statusContradictions: readonly string[];
  /**
   * BL-120 — refs whose answer came from Comments alone (Response empty,
   * Comments populated). Comments is read as an answer, but workbooks filled
   * before BL-120 were told Comments was also for caveats, so these are the
   * rows where a caveat could masquerade as the answer. Enumerated at extract
   * time because the distinction is unrecoverable from the body afterwards.
   */
  readonly commentsSourcedAnswers: readonly string[];
}

export interface ExtractIrlMarkdownOptions {
  /** Override the target name (otherwise derived from workbook metadata header rows). */
  readonly targetName?: string;
}

/** The sheet the IRL generator writes its request table to. */
export const PRIMARY_SHEET_NAME: string;

/** Join the Response (G) and Comments (E) cells into one contiguous answer span. */
export function joinAnswerSpan(response: string, comments: string): string;

export function extractIrlMarkdownFromRows(
  rows: ReadonlyArray<ReadonlyArray<string | number>>,
  opts?: ExtractIrlMarkdownOptions
): ExtractIrlMarkdownResult;
