/**
 * Regulatory Map client strings (BL-153 Tier B): the shared island reader
 * (`src/scripts/tool-strings.ts`) bound to this tool's catalog and island.
 *
 * Three namespaces serve the page. `regulatory-map` is the page's own copy;
 * its English is imported here as the fallback. `regulatory-map-geo` holds
 * the country, state and province names. Its English is deliberately NOT
 * imported: the script already bundles those names as the TypeScript maps,
 * so `regionName` in `logic.ts` falls back to them and the English page ships
 * the names once. On an es or pt page the template puts both namespaces' keys
 * in the island, and the island wins. `regulatory-map-data`, the regulation
 * texts, never travels in the island: the page fetches each regulation from
 * that locale's prerendered `/data/` endpoint.
 */
import { createToolStrings } from '../tool-strings';
import EN from '../../i18n/en/regulatory-map.json';

const strings = createToolStrings({
  en: EN as Record<string, string>,
  prefixes: ['js.'],
  selector: '[data-rm-strings]',
});

export const { SCRIPT_STRING_KEYS, hasString, s, sHtml, resetStringsForTest } = strings;
