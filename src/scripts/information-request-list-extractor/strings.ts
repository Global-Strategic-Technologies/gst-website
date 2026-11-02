/**
 * IRL Extractor client strings (BL-153 Tier B): the shared island reader
 * (`src/scripts/tool-strings.ts`) bound to this tool's catalog and island.
 */
import { createToolStrings } from '../tool-strings';
import EN from '../../i18n/en/information-request-list-extractor.json';

const strings = createToolStrings({
  en: EN as Record<string, string>,
  prefixes: ['js.'],
  selector: '[data-irl-ext-strings]',
});

export const { SCRIPT_STRING_KEYS, s, resetStringsForTest } = strings;
