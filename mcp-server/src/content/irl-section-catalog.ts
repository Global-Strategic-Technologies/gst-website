/**
 * Human-readable catalog of the Information Request List's sections, derived
 * from the canonical article (`gst://library/information-request-list`).
 *
 * **Why this exists**: the `generate_information_request_list_xlsx` tool and
 * the `gst_information_request_list` prompt both take section-number arguments
 * (`includeSections`, `customRequests[].section`). A model — or a human filling
 * the Claude Desktop prompt form — can't guess which two-digit numbers exist or
 * what each maps to. Embedding this catalog in the argument `.describe()` text
 * makes those surfaces self-documenting: the section list travels with the
 * schema the client already shows, so no separate lookup (or reading the whole
 * Resource) is required to choose sections.
 *
 * Generated from the same bundled article body the tool renders, so it can
 * never drift from the actual sections.
 */

import { loadLibraryByUri } from './library-loader';
import { parseIrlArticle } from '../../../src/utils/irl/parse-article';

const IRL_RESOURCE_URI = 'gst://library/information-request-list';
const FALLBACK = '00–09 (see the canonical article at gst://library/information-request-list)';

/**
 * Returns e.g. `"00 Basics · 01 Product · … · 09 Governance & Compliance"`.
 * Defensive: if the library body is missing or unparseable at import time,
 * returns a fallback string rather than throwing (never break server startup
 * for a documentation string).
 */
export function irlSectionCatalog(): string {
  try {
    const entry = loadLibraryByUri(IRL_RESOURCE_URI);
    if (!entry) return FALLBACK;
    return parseIrlArticle(entry.body)
      .sections.map((section) => `${section.number} ${section.title}`)
      .join(' · ');
  } catch {
    return FALLBACK;
  }
}
