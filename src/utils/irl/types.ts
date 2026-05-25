/**
 * Information Request List (IRL) — structural AST.
 *
 * The canonical markdown lives at `src/data/library/information-request-list/article.md`
 * (BL-043) and is parsed into this shape by `parse-irl-article.ts` (BL-044
 * Phase 1). Every downstream consumer — the XLSX generator, the MCP tool,
 * a future DOCX or CSV emitter, and the post-v1 directive-based filter
 * engine (BACKLOG.md BL-044 § "Scope expansion") — reads this AST rather
 * than the markdown directly.
 *
 * **Stability contract**: this file IS a library API. Callers depend on
 * the named exports. Backward-compatible extensions (new optional fields)
 * are allowed; renames or required-field additions are breaking.
 *
 * **Forward-compat note** (the `IRLBullet` wrapping decision): bullets are
 * modeled as `{ text }` objects rather than plain `string`s so the future
 * subtractive-filter directives (`<!-- skip-if: productType=b2c -->`) can
 * attach to an individual bullet via an additive `directives?` field
 * without churning every consumer. The cost today is one `.text` accessor
 * per bullet; the cost saved later is touching every parser/generator/test.
 */

export interface IRLBullet {
  readonly text: string;
}

export interface IRLSection {
  /** Two-character section number, zero-padded. Examples: `"00"`, `"03"`, `"09"`. */
  readonly number: string;
  /** Section title without the leading number/dash (e.g. `"Software Architecture"`). */
  readonly title: string;
  /** Optional prose between the heading and the first bullet. Today no section has this; future-proof. */
  readonly intro?: string;
  readonly bullets: readonly IRLBullet[];
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
