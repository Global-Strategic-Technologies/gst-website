/**
 * Prompt: gst_diligence_kickoff
 *
 * Starter agenda for a new diligence engagement, framed in GST's house
 * style. Orchestrates the diligence-agenda Tool and embeds the VDR
 * Structure Library Resource so the model has the canonical taxonomy
 * inline (no resources/read needed — see Commit 5 / V1 finding 1).
 */

import { z } from 'zod';
import type { GstPrompt } from './types';
import { userInputsShapeFromWire } from './diligence-shape';
import { authorialIntentLine, embedLibraryArticle, irlEvidencePrecedence } from './embed';

// targetName comes first so it surfaces as the first form field in clients
// (Claude Desktop renders inputs in argsSchema property order). The 13
// UserInputs enums and the geographies array all arrive case-tolerantly
// via userInputsShapeFromWire — see the helper for rationale.
const argsSchema = z.object({
  targetName: z.string().min(1),
  ...userInputsShapeFromWire(),
});

const PROMPT_NAME = 'gst_diligence_kickoff';

export const diligenceKickoffPrompt: GstPrompt<typeof argsSchema> = {
  name: PROMPT_NAME,
  description:
    'Generate a starter diligence agenda for a new engagement. Use at the kickoff of a buy-side or sell-side review.',
  version: '0.1.0',
  lastReviewedAt: '2026-08-20',
  orchestrates: ['generate_diligence_agenda', 'gst://library/vdr-structure'] as const,
  consumesTargetEvidence: true,
  argsSchema,
  build: (args) => {
    // BL-031.95 Phase 2.D: count how many dimensions defaulted to 'unknown'
    // so the body can lead with a low-confidence callout when the agent
    // had little to derive from. Threshold ≥ 7-of-13 mirrors the spec
    // (parallels ICG's ≥ 10/20 threshold in `gst_target_quick_look`).
    const isUnknown = (v: string | string[]): boolean =>
      Array.isArray(v) ? v.length === 1 && v[0] === 'unknown' : v === 'unknown';
    const unknownDimensions = [
      args.transactionType,
      args.productType,
      args.techArchetype,
      args.headcount,
      args.revenueRange,
      args.growthStage,
      args.companyAge,
      args.geographies,
      args.businessModel,
      args.scaleIntensity,
      args.transformationState,
      args.dataSensitivity,
      args.operatingModel,
    ].filter(isUnknown).length;

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              authorialIntentLine(PROMPT_NAME),
              '',
              `You are advising on the diligence kickoff for ${args.targetName}.`,
              '',
              irlEvidencePrecedence(),
              '',
              `Step 1. Call the \`generate_diligence_agenda\` tool with the supplied parameters. Any field defaulted to \`'unknown'\` (BL-031.95 Phase 2 sentinel) tells the engine "agent could not derive this from supplied context"; the engine widens the agenda conservatively rather than guessing. You should pass \`'unknown'\` (rather than guessing) for any dimension you cannot derive from the user's prose; only known values should narrow the agenda.`,
              `  transactionType=${args.transactionType}, productType=${args.productType}, techArchetype=${args.techArchetype},`,
              `  headcount=${args.headcount}, revenueRange=${args.revenueRange}, growthStage=${args.growthStage},`,
              `  companyAge=${args.companyAge}, geographies=${JSON.stringify(args.geographies)},`,
              `  businessModel=${args.businessModel}, scaleIntensity=${args.scaleIntensity},`,
              `  transformationState=${args.transformationState}, dataSensitivity=${args.dataSensitivity},`,
              `  operatingModel=${args.operatingModel}.`,
              '',
              `  **BL-045 PR B \`_audit\` sibling (REQUIRED — the schema rejects the call without it).** Which shape you supply depends on where each dimension's value actually came from, and the two are graded differently on purpose.`,
              '',
              '  **Evidence branch (per dimension).** If canonical target evidence in context covers a dimension — most often an IRL extract record fact — cite THAT: `"citation": "Section NN — <the fact\'s verbatim excerpt>"`, with the section derived from the fact\'s reference (`0-03` → `Section 00`), and grade it honestly. Tier `"1"` when the excerpt contains the enum value as a whole-token literal; tier `"2"` for a one-step derivation — which is most of them, since the IRL rarely uses the exact enum literal. The excerpt must be at least 20 characters of substantive content and the separator is an EM-DASH (—), not a hyphen. No schema change is involved: `diligence-audit.ts` already validates exactly this and will return a structured diagnostic naming the field to fix.',
              '',
              "  **`'unknown'` survives the evidence branch.** A dimension the evidence does not cover keeps the existing behavior — pass `'unknown'` with tier `\"3\"` rather than inferring, so the engine still widens the agenda conservatively. Rule 0 couples the two bidirectionally: `'unknown'` REQUIRES tier `\"3\"`, and tier `\"3\"` REQUIRES `'unknown'`. Having a record in context must not suppress that sentinel, and mapping a record fact onto a dimension's enum is your job here — the record deliberately does not carry this tool's 13-dimension enum set.",
              '',
              `  **No-evidence branch.** With only partner form input, every entry is Tier-3 with the \`Section --\` sentinel. That sentinel is what makes it honest: under the derived-tier discipline it grades as \`partner-supplied\` rather than as a verified IRL citation. Minimum shape — every field is mandatory by schema:`,
              '',
              '  ```json',
              '  "_audit": {',
              '    "transactionType":     { "tier": "3", "citation": "Section -- — partner-supplied form input — transactionType picked from prompt form, no IRL provenance available" },',
              '    "productType":         { "tier": "3", "citation": "Section -- — partner-supplied form input — productType picked from prompt form, no IRL provenance available" },',
              '    "techArchetype":       { "tier": "3", "citation": "Section -- — partner-supplied form input — techArchetype picked from prompt form, no IRL provenance available" },',
              '    "headcount":           { "tier": "3", "citation": "Section -- — partner-supplied form input — headcount bracket picked from prompt form, no IRL provenance available", "scope": "engineering-only" },',
              '    "revenueRange":        { "tier": "3", "citation": "Section -- — partner-supplied form input — revenueRange bracket picked from prompt form, no IRL provenance available", "nativeCurrency": "USD" },',
              '    "growthStage":         { "tier": "3", "citation": "Section -- — partner-supplied form input — growthStage picked from prompt form, no IRL provenance available", "velocityEvidence": "unknown" },',
              '    "companyAge":          { "tier": "3", "citation": "Section -- — partner-supplied form input — companyAge bracket picked from prompt form, no IRL provenance available" },',
              '    "geographies":         { "tier": "3", "citation": "Section -- — partner-supplied form input — geographies picked from prompt form, no IRL provenance available" },',
              '    "businessModel":       { "tier": "3", "citation": "Section -- — partner-supplied form input — businessModel picked from prompt form, no IRL provenance available" },',
              '    "scaleIntensity":      { "tier": "3", "citation": "Section -- — partner-supplied form input — scaleIntensity picked from prompt form, no IRL provenance available" },',
              '    "transformationState": { "tier": "3", "citation": "Section -- — partner-supplied form input — transformationState picked from prompt form, no IRL provenance available" },',
              '    "dataSensitivity":     { "tier": "3", "citation": "Section -- — partner-supplied form input — dataSensitivity picked from prompt form, no IRL provenance available", "piiCategoriesPresent": ["none"] },',
              '    "operatingModel":      { "tier": "3", "citation": "Section -- — partner-supplied form input — operatingModel picked from prompt form, no IRL provenance available" }',
              '  }',
              '  ```',
              '',
              `  If \`growthStage\` is non-\`'unknown'\`, set \`_audit.growthStage.velocityEvidence\` to one of the explicit-evidence values (e.g., \`"revenue-growth-explicit"\`) — the partner's form pick implicitly claims that evidence. If \`dataSensitivity\` is non-\`'unknown'\`, set \`_audit.dataSensitivity.piiCategoriesPresent\` to a category matching the bucket (\`['phi']\` for \`high\`, \`['customer-pii-at-scale']\` for \`moderate\`, \`['employee-pii']\` for \`low\`). If you don't, the tool will reject the call with a structured diagnostic — fix the field and retry.`,
              '',
              'Step 2. The canonical `gst://library/vdr-structure` Library article is embedded in the next message. Treat it as the authoritative source for VDR-folder taxonomy and use its folder labels verbatim — do NOT substitute a generic PE-diligence taxonomy.',
              '',
              `Step 3. Frame the result as a one-page kickoff memo for ${args.targetName} in GST's house style with four sections:`,
              unknownDimensions >= 7
                ? `  (0) **Low-confidence baseline** — ${unknownDimensions} of 13 dimensions were unknown when the agenda was generated. Lead with a one-line note that this is a placeholder kickoff awaiting more deal context; suggest the user re-run with the full deal profile once it lands. The \`unknownDimensionCount\` field on the tool response carries the live count.`
                : `  (0) Note: when ${unknownDimensions === 0 ? 'no' : `only ${unknownDimensions}`} dimensions were unknown, omit any low-confidence framing — the agenda has full signal.`,
              '  (1) Target context — one paragraph anchoring the engagement (transaction, product, stage, geography). Surface every dimension that was passed as `unknown` under an "Assumptions / unknowns" sub-bullet so the deal team sees where the model widened the agenda. When target evidence was in context, also say which dimensions were resolved from it and whether those citations are verified this session or carried asserted-not-verified from a record.',
              '  (2) Prioritized agenda by topic — pull from the diligence-agenda tool result, ordered by signal-to-effort.',
              '  (3) Attention areas — the surfaced attention areas from the agenda result, with one-line "why this matters" framing.',
              '  (4) Suggested VDR requests — for each topic and attention area, name the canonical VDR folder (verbatim from the embedded Library article) and 2 concrete document requests prioritized by signal-to-effort.',
              `  (5) Open in Hub — embed the \`deeplink\` field from the \`generate_diligence_agenda\` tool result as a single "Open Diligence Wizard" link. The deeplink opens the Diligence Machine pre-populated with the same dimensions (any \`'unknown'\` fields land as the wizard's "Not sure" affordance — BL-031.95 Phase 2). If \`deeplink\` is absent (older server build), omit this section silently — never invent a URL.`,
              '',
              'Voice: declarative, terse, deal-team-ready. Avoid hedging language and tutorial framing. The output should read as if a senior consultant wrote it.',
            ].join('\n'),
          },
        },
        {
          role: 'user',
          content: embedLibraryArticle('gst://library/vdr-structure'),
        },
      ],
    };
  },
};
