/**
 * Information Request List (IRL) — structural AST.
 *
 * The generator source markdown lives at `src/data/irl/information-request-list.md`
 * (decoupled from the library article under #291) and is parsed into this
 * shape by `parse-article.ts`. Every downstream consumer — the XLSX
 * generator, the MCP tools, the Hub generator page, and the directive
 * filter engine (`applyDirectives`) — reads this AST rather than the
 * markdown directly.
 *
 * **Stability contract**: this file IS a library API. Callers depend on
 * the named exports. Backward-compatible extensions (new optional fields)
 * are allowed; renames or required-field additions are breaking.
 *
 * **Forward-compat note — realized**: bullets were modeled as `{ text }`
 * objects rather than plain `string`s precisely so per-bullet metadata
 * could attach additively later. That bet paid off twice:
 *
 *   - `ordinal` (per-question removal): the bullet's 1-based position in
 *     its section as authored. The XLSX generator renders Reference IDs
 *     from it, so removing a bullet leaves a GAP (`2-01, 2-02, 2-04…`)
 *     instead of silently renumbering — recipient-quoted refs and the
 *     filled-IRL ingestion round-trip stay stable.
 *   - `skipIf` (BL-044.5 directive engine): parsed from
 *     `<!-- skip-if: dim=v1,v2 -->` comment lines in the source.
 *     Consumed only by `customize-article.ts`'s `applyDirectives`.
 *
 * Both are optional: hand-built fixture articles without them keep the
 * original dense-numbering / no-filtering behavior everywhere.
 *
 * The directive dimension registry (which `dim`s and values are legal)
 * lives in `parse-article.ts` — the validator — keeping this file
 * types-only.
 */

/**
 * Parsed `skip-if` directive map: dimension name → the values for which
 * the tagged bullet/section is removed. Example:
 * `{ context: ['sell-side', 'buy-side'] }` — removed when the engagement
 * context is either of those; kept otherwise.
 */
export type IRLSkipIf = Readonly<Record<string, readonly string[]>>;

export interface IRLBullet {
  readonly text: string;
  /**
   * 1-based position within the section AS AUTHORED in the source.
   * Reference IDs derive from this, so removal leaves gaps rather than
   * renumbering. Absent on hand-built articles → dense fallback.
   */
  readonly ordinal?: number;
  /** Skip-if directive attached to this bullet in the source, if any. */
  readonly skipIf?: IRLSkipIf;
}

export interface IRLSection {
  /** Two-character section number, zero-padded. Examples: `"00"`, `"03"`, `"09"`. */
  readonly number: string;
  /** Section title without the leading number/dash (e.g. `"Software Architecture"`). */
  readonly title: string;
  /** Optional prose between the heading and the first bullet. Today no section has this; future-proof. */
  readonly intro?: string;
  readonly bullets: readonly IRLBullet[];
  /**
   * The number of bullets the section had AS AUTHORED. Custom requests
   * appended after removal continue numbering from this count (a custom on
   * an 8-bullet section is ordinal 9 even if bullet 8 was removed), so a
   * custom's Reference ID can never collide with a removed canonical one.
   * Absent on hand-built articles → falls back to live length.
   */
  readonly canonicalBulletCount?: number;
  /** Skip-if directive attached to this section's heading in the source, if any. */
  readonly skipIf?: IRLSkipIf;
}

export interface IRLArticle {
  /** The H1 line text (e.g. `"Information Request List"`). */
  readonly title: string;
  /** Top-of-file prose paragraph(s) between the H1 and the first section heading. */
  readonly intro: string;
  readonly sections: readonly IRLSection[];
  /** Post-horizontal-rule trailing content (e.g. `"_Last updated: 2026-05-22._"`). Optional. */
  readonly footer?: string;
}
