/**
 * Regulation loader — resolves a stable URI like `gst://regulations/eu/gdpr`
 * to a regulatory-framework JSON record.
 *
 * The URI taxonomy is:
 *   gst://regulations/<jurisdiction>/<framework-id>
 *
 * Jurisdiction parsing rules (from the regulation's `id` field):
 *   - `us-XX-<rest>` (XX = 2-letter US state) → jurisdiction `us-xx`, framework `<rest>`
 *   - `ca-XX-<rest>` (XX = 2-letter CA province) → jurisdiction `ca-xx`, framework `<rest>`
 *   - `<country>-<rest>` (otherwise) → jurisdiction `<country>`, framework `<rest>`
 *
 * Sub-region 2-letter codes are detected by structural pattern, not enumerated;
 * a country whose own ID begins `xx-yy-...` (where `yy` is a 2-letter token)
 * would be parsed as a sub-region. Today only `us-` and `ca-` use this form.
 */

import type { Regulation } from '../../../src/schemas/regulatory-map';
import { REGULATIONS } from './regulations-data.generated';

export interface RegulationEntry {
  readonly file: string;
  readonly data: Regulation;
  readonly uri: string;
  readonly jurisdiction: string;
  readonly frameworkId: string;
}

const SUB_REGION_RE = /^(us|ca)-([a-z]{2})-(.+)$/;

function parseId(id: string): { jurisdiction: string; frameworkId: string } {
  const subRegion = SUB_REGION_RE.exec(id);
  if (subRegion) {
    return {
      jurisdiction: `${subRegion[1]}-${subRegion[2]}`,
      frameworkId: subRegion[3],
    };
  }
  const idx = id.indexOf('-');
  if (idx === -1) {
    return { jurisdiction: 'global', frameworkId: id };
  }
  return {
    jurisdiction: id.slice(0, idx),
    frameworkId: id.slice(idx + 1),
  };
}

function buildEntry(record: { file: string; data: Regulation }): RegulationEntry {
  const { jurisdiction, frameworkId } = parseId(record.data.id);
  return {
    file: record.file,
    data: record.data,
    uri: `gst://regulations/${jurisdiction}/${frameworkId}`,
    jurisdiction,
    frameworkId,
  };
}

/** All regulatory framework records, indexed at module load. */
export const REGULATION_ENTRIES: readonly RegulationEntry[] = REGULATIONS.map(buildEntry);

const URI_INDEX: ReadonlyMap<string, RegulationEntry> = new Map(
  REGULATION_ENTRIES.map((entry) => [entry.uri, entry])
);

/** Resolve a `gst://regulations/...` URI to a record, or null if unknown. */
export function loadRegulationByUri(uri: string): RegulationEntry | null {
  return URI_INDEX.get(uri) ?? null;
}

/** Sorted list of distinct jurisdictions present in the dataset. */
export function listJurisdictions(): string[] {
  return Array.from(new Set(REGULATION_ENTRIES.map((e) => e.jurisdiction))).sort();
}

/** Sorted list of distinct categories present in the dataset. */
export function listCategories(): string[] {
  return Array.from(new Set(REGULATION_ENTRIES.map((e) => e.data.category))).sort();
}
