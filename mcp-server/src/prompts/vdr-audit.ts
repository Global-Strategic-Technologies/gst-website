/**
 * Prompt: gst_vdr_audit
 *
 * Compares a target's actual VDR contents against the canonical taxonomy
 * embedded from `gst://library/vdr-structure`. Surfaces gaps and follow-up
 * requests.
 *
 * Three input modes:
 *   1. Structured `vdrFolders` (`{ name, files? }[]`) — Tier 1 enhancement:
 *      when individual file names are supplied, the audit reasons about
 *      contents quality (stale versioning, single-file folders, dump-vs-
 *      curated patterns) on top of structural mapping.
 *   2. Free-text `vdrInventory` (multiline string) — original shape; still
 *      works for users who paste a flat folder list.
 *   3. Neither supplied — interactive mode; the model asks for the list
 *      before producing the audit.
 *
 * `vdrFolders` takes precedence when both are supplied.
 *
 * Resource embedding (Commit 5 / V1 finding 1): the canonical Library
 * article is shipped inline as the second message so the model has the
 * authoritative folder labels without needing `resources/read` (which is
 * client-side user-pinned and not callable from a prompt expansion).
 */

import { z } from 'zod';
import type { GstPrompt } from './types';
import { arrayFromWire } from './wire-shape';
import { authorialIntentLine, embedLibraryArticle } from './embed';

const VdrFolderSchema = z.object({
  name: z.string().min(1),
  files: z.array(z.string().min(1)).optional(),
});

type VdrFolderInput = z.infer<typeof VdrFolderSchema>;

const argsSchema = z.object({
  vdrInventory: z
    .string()
    .optional()
    .describe(
      "Free-text list of the target's actual VDR folders / sections. One folder per line; sub-folders or document counts welcome but not required. Omit (and leave vdrFolders empty) to use interactive mode."
    ),
  vdrFolders: arrayFromWire(z.array(VdrFolderSchema).min(1))
    .optional()
    .describe(
      'Structured VDR contents — array of `{ name, files? }`. When `files` is populated, the audit reasons about contents quality (staleness, dump-vs-curated patterns) on top of structural folder mapping. Takes precedence over `vdrInventory` if both are supplied.'
    ),
});

const PROMPT_NAME = 'gst_vdr_audit';

/**
 * Format a structured folder list back into the multiline text shape the
 * audit body expects, with files indented under each folder when present.
 * Equivalent to a `tree`-style rendering of the inventory.
 */
function formatStructuredInventory(folders: VdrFolderInput[]): string {
  return folders
    .map((f) => {
      if (f.files && f.files.length > 0) {
        return `${f.name}\n${f.files.map((file) => `  - ${file}`).join('\n')}`;
      }
      return f.name;
    })
    .join('\n');
}

const ONE_SHOT_BODY = (vdrInventory: string, hasFileLevelDetail: boolean): string =>
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
    ...(hasFileLevelDetail
      ? [
          '',
          'Step 2b. File-level signal — individual file names are listed under each folder. Use them to (a) REFINE the structural mapping (a folder named `06_Tech_Stack_Inventory` with one stale `stack.pdf` is materially different from one with twelve files covering each subsystem), and (b) FLAG content-quality concerns visible from names alone: stale versioning patterns (`_v17`, `_FINAL_REVISED`, dates older than 12 months), single-file folders too thin for their canonical bucket, dump-vs-curated patterns (e.g., a Security folder with hundreds of files all dated within two days suggests a rushed assembly), or generic placeholders (`README.docx`, `notes.txt`) where structured artifacts are expected. Surface these as `Quality flag:` annotations in the mapping table.',
        ]
      : []),
    '',
    'Step 3. Frame the output as an audit report with these sections:',
    '  (1) Mapping table — three columns: canonical folder, target folder(s) that map to it, status (Direct / Partial / Gap)' +
      (hasFileLevelDetail
        ? ', plus a fourth `Quality flag` column when file-level signal warrants.'
        : '.'),
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
  "> Paste the target's current VDR folder list (or a description of what's in the VDR). One line per folder is fine; sub-folders or document counts are welcome but not required. If you can include a few key file names per folder (especially in Security, Software Architecture, and SDLC), the audit will surface contents-quality flags on top of the structural mapping.",
  '',
  'Step 3. Once the user pastes the inventory, run the audit:',
  "  - Map each of the target's actual folders to the canonical taxonomy (Direct / Partial / Gap / Out-of-scope).",
  '  - When file-level detail is present, surface contents-quality flags (stale versioning, single-file folders, dump-vs-curated patterns).',
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
    "Compare a target's VDR contents against GST's canonical folder taxonomy. Pass `vdrFolders` (structured) or `vdrInventory` (free-text); omit both for interactive mode.",
  version: '0.0.1',
  lastReviewedAt: '2026-05-01',
  orchestrates: ['gst://library/vdr-structure'] as const,
  argsSchema,
  build: (args) => {
    let bodyText: string;
    if (args.vdrFolders && args.vdrFolders.length > 0) {
      const inventory = formatStructuredInventory(args.vdrFolders);
      const hasFileLevelDetail = args.vdrFolders.some(
        (f) => f.files !== undefined && f.files.length > 0
      );
      bodyText = ONE_SHOT_BODY(inventory, hasFileLevelDetail);
    } else if (args.vdrInventory) {
      bodyText = ONE_SHOT_BODY(args.vdrInventory, false);
    } else {
      bodyText = INTERACTIVE_BODY;
    }
    return {
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: bodyText },
        },
        {
          role: 'user',
          content: embedLibraryArticle('gst://library/vdr-structure'),
        },
      ],
    };
  },
};
