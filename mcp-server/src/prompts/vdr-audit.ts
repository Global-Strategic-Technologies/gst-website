/**
 * Prompt: gst_vdr_audit
 *
 * Compares a target's actual VDR contents against the canonical taxonomy
 * embedded from `gst://library/vdr-structure`. Surfaces gaps and follow-up
 * requests.
 *
 * Interactive mode: when `vdrInventory` is omitted, the prompt asks the
 * user for their VDR folder list before proceeding. When supplied,
 * proceeds with the audit immediately.
 *
 * Resource embedding (Commit 5 / V1 finding 1): the canonical Library
 * article is shipped inline as the second message so the model has the
 * authoritative folder labels without needing `resources/read` (which is
 * client-side user-pinned and not callable from a prompt expansion).
 */

import { z } from 'zod';
import type { GstPrompt } from './types';
import { authorialIntentLine, embedLibraryArticle } from './embed';

const argsSchema = z.object({
  vdrInventory: z
    .string()
    .optional()
    .describe(
      "Free-text list of the target's actual VDR folders / sections. Omit to use interactive mode (the prompt will ask)."
    ),
});

const PROMPT_NAME = 'gst_vdr_audit';

const ONE_SHOT_BODY = (vdrInventory: string): string =>
  [
    authorialIntentLine(PROMPT_NAME),
    '',
    "Audit the following VDR contents against GST's canonical folder taxonomy (embedded as the next message — `gst://library/vdr-structure`):",
    '',
    '```',
    vdrInventory,
    '```',
    '',
    'Step 1. Treat the embedded Library article as the authoritative source. Use its folder labels verbatim — do NOT substitute a generic PE-diligence taxonomy.',
    '',
    "Step 2. Map each of the target's actual folders to the canonical taxonomy:",
    '  - Direct match: a target folder maps cleanly to a canonical folder.',
    '  - Partial match: a target folder covers some content from one or more canonical folders.',
    '  - Unmatched (gap): a canonical folder has no corresponding target folder.',
    '  - Out-of-scope: a target folder contains content that does not fit any canonical folder.',
    '',
    'Step 3. Frame the output as an audit report with these sections:',
    '  (1) Mapping table — three columns: canonical folder, target folder(s) that map to it, status (Direct / Partial / Gap).',
    '  (2) Gaps — for each canonical folder marked Gap, write a one-line "what we expect to find here" summary plus 2-3 concrete document requests to send to the target.',
    '  (3) Out-of-scope content — list any target folders that did not map. For each, propose either an extension to the GST taxonomy (worth doing for ≥3 deals) or a one-time receipt path.',
    '  (4) Prioritized follow-up request list — the top 5-7 documents the deal team should request first, ordered by signal-to-effort.',
    '',
    'Voice: structured, audit-grade. The output should read as a deliverable the deal team can paste into a request email to the target.',
  ].join('\n');

const INTERACTIVE_BODY = [
  authorialIntentLine(PROMPT_NAME),
  '',
  "Help the user audit a target company VDR against GST's canonical folder taxonomy (embedded as the next message — `gst://library/vdr-structure`).",
  '',
  'Step 1. Read the embedded Library article in the next message. It is the authoritative source for canonical folder labels — use them verbatim.',
  '',
  'Step 2. Ask the user:',
  '',
  "> Paste the target's current VDR folder list (or a description of what's in the VDR). One line per folder is fine; sub-folders or document counts are welcome but not required.",
  '',
  'Step 3. Once the user pastes the inventory, run the audit:',
  "  - Map each of the target's actual folders to the canonical taxonomy (Direct / Partial / Gap / Out-of-scope).",
  '  - Surface gaps with 2-3 concrete document requests each.',
  '  - List any out-of-scope content with a recommendation (extend taxonomy or one-time receipt).',
  '  - Close with a prioritized follow-up request list (top 5-7 items, signal-to-effort ordered).',
  '',
  'Step 4. Frame the output as a structured audit report (mapping table, gaps, out-of-scope, prioritized request list).',
  '',
  'Voice: structured, audit-grade. The output should read as a deliverable the deal team can paste into a request email to the target.',
].join('\n');

export const vdrAuditPrompt: GstPrompt<typeof argsSchema> = {
  name: PROMPT_NAME,
  description:
    "Compare a target's VDR contents against GST's canonical folder taxonomy. Optionally pass vdrInventory; otherwise the prompt asks interactively.",
  version: '0.0.1',
  lastReviewedAt: '2026-05-01',
  orchestrates: ['gst://library/vdr-structure'] as const,
  argsSchema,
  build: (args) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: args.vdrInventory ? ONE_SHOT_BODY(args.vdrInventory) : INTERACTIVE_BODY,
        },
      },
      {
        role: 'user',
        content: embedLibraryArticle('gst://library/vdr-structure'),
      },
    ],
  }),
};
