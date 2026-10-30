/**
 * IRL Generator client strings (BL-153 Tier B): the shared island reader
 * (`src/scripts/tool-strings.ts`) bound to this tool's catalog and island.
 *
 * Two namespaces feed the island. `information-request-list-generator` is the
 * page's own copy; its English is imported here as the fallback.
 * `information-request-list-generator-data` mirrors the shared IRL source and
 * the workbook's reader-facing labels, which the MCP server emits in English.
 * Its English is deliberately NOT imported: the script already bundles the
 * source and `IRL_XLSX_LABELS_EN`, so `logic.ts` falls back to those, and the
 * English page ships that text once. On an es or pt page the template puts
 * both namespaces' keys in the island, and the island wins.
 */
import { createToolStrings } from '../tool-strings';
import EN from '../../i18n/en/information-request-list-generator.json';

const strings = createToolStrings({
  en: EN as Record<string, string>,
  prefixes: ['js.', 'context.'],
  selector: '[data-irl-strings]',
});

export const { SCRIPT_STRING_KEYS, hasString, s, resetStringsForTest } = strings;
