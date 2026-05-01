/**
 * Prompt: gst_vdr_audit
 *
 * Compares a target's actual VDR contents against the canonical 10-folder
 * taxonomy from the Library. Surfaces gaps and follow-up requests.
 *
 * Interactive mode: when `vdrInventory` is omitted, the prompt asks the
 * user for their VDR folder list before proceeding. When supplied,
 * proceeds with the audit immediately. Both branches are covered by the
 * unit test.
 */

import { z } from 'zod';
import type { GstPrompt } from './types';

const argsSchema = z.object({
  vdrInventory: z
    .string()
    .optional()
    .describe(
      "Free-text list of the target's actual VDR folders / sections. Omit to use interactive mode (the prompt will ask)."
    ),
});

const ONE_SHOT_BODY = (vdrInventory: string): string =>
  [
    'Audit the following VDR contents against the canonical GST 10-folder taxonomy:',
    '',
    '```',
    vdrInventory,
    '```',
    '',
    'Step 1. Read `gst://library/vdr-structure` to anchor the audit in the canonical 10-folder taxonomy.',
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
  'Help the user audit a target company VDR against the canonical GST 10-folder taxonomy.',
  '',
  'Step 1. Read `gst://library/vdr-structure` to load the canonical 10-folder taxonomy. Once loaded, ask the user:',
  '',
  "> Paste the target's current VDR folder list (or a description of what's in the VDR). One line per folder is fine; sub-folders or document counts are welcome but not required.",
  '',
  'Step 2. Once the user pastes the inventory, run the audit per the same procedure as the one-shot mode:',
  "  - Map each of the target's actual folders to the canonical taxonomy (Direct / Partial / Gap / Out-of-scope).",
  '  - Surface gaps with 2-3 concrete document requests each.',
  '  - List any out-of-scope content with a recommendation (extend taxonomy or one-time receipt).',
  '  - Close with a prioritized follow-up request list (top 5-7 items, signal-to-effort ordered).',
  '',
  'Step 3. Frame the output as a structured audit report (mapping table, gaps, out-of-scope, prioritized request list).',
  '',
  'Voice: structured, audit-grade. The output should read as a deliverable the deal team can paste into a request email to the target.',
].join('\n');

export const vdrAuditPrompt: GstPrompt<typeof argsSchema> = {
  name: 'gst_vdr_audit',
  description:
    "Compare a target's VDR contents against GST's canonical 10-folder taxonomy. Optionally pass vdrInventory; otherwise the prompt asks interactively.",
  version: '0.1.0',
  lastReviewedAt: '2026-04-29',
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
    ],
  }),
};
