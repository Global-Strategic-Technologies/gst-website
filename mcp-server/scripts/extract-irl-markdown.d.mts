/**
 * TypeScript declarations for the (plain JS) `extract-irl-markdown.mjs`
 * script. The runtime is JS so the CLI doesn't carry a build step; the
 * declarations let the round-trip unit tests + any future TS caller type-
 * check the exported helpers.
 */

export interface ExtractIrlMarkdownResult {
  /** Canonical IRL markdown body, ready to paste into `gst_irl_ingestion.filledIrl`. */
  readonly markdown: string;
  /** Number of bullet rows emitted (one per filled IRL request). */
  readonly bulletCount: number;
  /**
   * Two-digit section identifiers (e.g. `'00'`, `'01'`, `'09'`) discovered
   * in the workbook, in first-seen order. Useful for the operator-side
   * coverage sanity check.
   */
  readonly sectionsSeen: readonly string[];
  /**
   * BL-120 — refs whose Status says `CLOSED`/`PARTIAL` while every content
   * column (D/E/F/G) is empty. A genuine contradiction: the row renders
   * `<NO RESPONSE>` despite claiming an answer. The CLI prints these.
   */
  readonly statusContradictions: readonly string[];
  /**
   * BL-120 — refs whose answer came from Comments alone (Response empty,
   * Comments populated). Comments is read as an answer, but workbooks filled
   * before BL-120 were told Comments was also for caveats, so these are the
   * rows where a caveat could masquerade as the answer. Enumerated at extract
   * time because the distinction is unrecoverable from the body afterwards —
   * the operator can still open the xlsx and check.
   */
  readonly commentsSourcedAnswers: readonly string[];
}

export interface ExtractIrlMarkdownOptions {
  /** Override the target name (otherwise derived from workbook metadata header rows). */
  readonly targetName?: string;
}

export function extractIrlMarkdownFromRows(
  rows: ReadonlyArray<ReadonlyArray<string | number>>,
  opts?: ExtractIrlMarkdownOptions
): ExtractIrlMarkdownResult;

export function extractIrlMarkdownFromFile(
  xlsxPath: string,
  opts?: ExtractIrlMarkdownOptions
): ExtractIrlMarkdownResult;
