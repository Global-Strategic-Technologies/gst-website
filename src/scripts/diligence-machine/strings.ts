/**
 * Diligence Machine client strings (BL-153 Tier B): the shared island reader
 * (`src/scripts/tool-strings.ts`) bound to this tool's catalog and island.
 *
 * Two namespaces feed the island. `diligence-machine` is the page's own copy;
 * its English is imported here as the fallback. `diligence-machine-data`
 * mirrors the questions, attention areas and topics the engine (and the MCP
 * server) emit in English. Its English is deliberately NOT imported: the
 * script already bundles that text as the TypeScript data, so the lookups in
 * `logic.ts` fall back to the data object, and the English page ships it
 * once. On an es or pt page the template puts both namespaces' keys in the
 * island, and the island wins.
 */
import { createToolStrings } from '../tool-strings';
import EN from '../../i18n/en/diligence-machine.json';

const strings = createToolStrings({
  en: EN as Record<string, string>,
  prefixes: ['js.', 'option.'],
  selector: '[data-dm-strings]',
});

export const { SCRIPT_STRING_KEYS, hasString, s, sHtml, resetStringsForTest } = strings;
