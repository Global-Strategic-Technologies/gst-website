import { z } from 'zod';

/**
 * Zod schema for a single regulation record.
 *
 * This schema is the single source of truth for regulation data shape.
 * The TypeScript `Regulation` type is re-exported from `src/types/regulatory-map.ts`
 * and `RegulationCategory` is derived from the enum below.
 *
 * The human-readable reference for the `search_regulations` /
 * `list_regulation_facets` MCP tools (jurisdiction code conventions,
 * URI taxonomy, sub-region detection rules) lives at:
 *   `mcp-server/src/docs/tools/regulatory-map/CONTRACT.md`
 */
export const REGULATION_CATEGORY_VALUES = [
  'data-privacy',
  'ai-governance',
  'industry-compliance',
  'cybersecurity',
] as const;

export const RegulationCategorySchema = z.enum(REGULATION_CATEGORY_VALUES);

export const RegulationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  aliases: z
    .array(z.string().min(1))
    .optional()
    .describe(
      'BL-073 — alternative names a person or model may use that should match this framework. ' +
        'Add when the common short form has no substring overlap with the canonical name. ' +
        'Example: "UK GDPR" for the canonical "UK Data Protection Act 2018". ' +
        'A duplicate-alias detection guard in `mcp-server/scripts/generate-regulations-index.mjs` ' +
        "fails if any normalized alias appears in two entries — it runs as that workspace's " +
        'prebuild/pretest, so `npm run test:mcp` surfaces a collision and the root build does not. ' +
        // BL-119 cycle 4: this describe() previously named ONE consumer and ONE
        // match rule, and that is exactly how the field ended up wired into one
        // of three. A fix that added aliases here was verified against
        // `findMatchedHubFramework` alone and shipped with search still blind.
        // Keep this list complete — adding a consumer means adding a line.
        'THREE CONSUMERS read this field, with deliberately different match rules — ' +
        '(1) `findMatchedHubFramework` in `mcp-server/src/schemas/compose-dossier-envelope.ts`: ' +
        'exact-equality on normalized form (lowercase, non-alphanumeric stripped); ' +
        '(2) `scoreQuery` in `mcp-server/src/tools/regulations.ts`: normalized substring, folded ' +
        'into the name-relevance bucket, skipped for queries under 4 normalized characters; ' +
        '(3) `buildRegulationSearchText` in `src/utils/regulation-search-text.ts`, which feeds the ' +
        "/hub/tools/regulatory-map/ page's raw term-wise substring filter — no normalization. " +
        'Verify a change against all three, not whichever one you found first.'
    ),
  regions: z
    .array(
      z
        .string()
        .regex(
          /^[A-Z]{3}$|^US-[A-Z]{2}$|^CA-[A-Z]{2}$/,
          'Must be ISO 3166-1 alpha-3, US state (US-XX), or CA province (CA-XX)'
        )
    )
    .min(1),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  summary: z.string().min(1),
  category: RegulationCategorySchema,
  scope: z.string().min(1).optional(),
  keyRequirements: z.array(z.string()).optional(),
  penalties: z.string().optional(),
});

export type RegulationCategory = z.infer<typeof RegulationCategorySchema>;
export type Regulation = z.infer<typeof RegulationSchema>;

// ─── MCP tool inputs ─────────────────────────────────────────────────────────
//
// Used by the `search_regulations` and `list_regulation_facets` MCP tools.

// Accept either a single string or an array; normalize to a non-empty
// array so consumers always see `string[] | undefined`. Backward-
// compatible for existing callers that pass `jurisdiction: 'eu'`.
//
// Union+transform (not preprocess) for two reasons: (a) clearer parse
// error on garbage input — `{jurisdiction: 42}` reports `invalid_union`
// with both arm errors instead of a single "expected array" message;
// (b) sharper TS inference — the transformed output type is
// `string[] | undefined`, never `unknown`. See BL-032.75 K-section
// follow-up audit findings (2026-05-27).
const StringOrStringArray = z
  .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
  .transform((v) => (Array.isArray(v) ? v : [v]))
  .optional();

const CategoryOrArray = z
  .union([RegulationCategorySchema, z.array(RegulationCategorySchema).min(1)])
  .transform((v) => (Array.isArray(v) ? v : [v]))
  .optional();

export const RegulationSearchInputSchema = z.object({
  jurisdiction: StringOrStringArray,
  category: CategoryOrArray,
  query: z.string().optional(),
  limit: z.number().int().positive().max(120).default(20),
});

export const RegulationFacetsInputSchema = z.object({});

export type RegulationSearchInput = z.infer<typeof RegulationSearchInputSchema>;
export type RegulationFacetsInput = z.infer<typeof RegulationFacetsInputSchema>;
