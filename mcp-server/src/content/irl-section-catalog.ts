/**
 * Human-readable catalog of the Information Request List's sections, derived
 * from the IRL generator source (`src/data/irl/information-request-list.md`,
 * bundled via `loadIrlSourceBody()`).
 *
 * **Why this exists**: the `generate_information_request_list_xlsx` tool and
 * the `gst_irl_create` prompt both take section-number arguments
 * (`includeSections`, `customRequests[].section`). A model — or a human filling
 * the Claude Desktop prompt form — can't guess which two-digit numbers exist or
 * what each maps to. Embedding this catalog in the argument `.describe()` text
 * makes those surfaces self-documenting: the section list travels with the
 * schema the client already shows, so no separate lookup is required to choose
 * sections.
 *
 * Derived from the SAME generator source the tool renders and the prompt embeds,
 * so it can never drift from the sections the .xlsx actually contains. (This is
 * the decoupled generator source — not the `gst://library/information-request-list`
 * library article, which may differ.)
 */

import { loadIrlSourceBody } from './irl-source-loader';
import { parseIrlArticle } from '../../../src/utils/irl/parse-article';

const FALLBACK = '00–09 (see the IRL generator source src/data/irl/information-request-list.md)';

/**
 * Returns e.g. `"00 Basics · 01 Product · … · 09 Governance & Compliance"`.
 * Defensive: if the source body is missing or unparseable at import time,
 * returns a fallback string rather than throwing (never break server startup
 * for a documentation string).
 */
export function irlSectionCatalog(): string {
  try {
    return parseIrlArticle(loadIrlSourceBody())
      .sections.map((section) => `${section.number} ${section.title}`)
      .join(' · ');
  } catch {
    return FALLBACK;
  }
}
