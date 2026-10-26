/**
 * TechPar client strings (BL-153 Tier B): the shared island reader
 * (`src/scripts/tool-strings.ts`) bound to TechPar's catalog and island.
 */
import { createToolStrings } from '../tool-strings';
import EN from '../../i18n/en/techpar.json';

const strings = createToolStrings({
  en: EN as Record<string, string>,
  prefixes: ['js.', 'signal.', 'rec.', 'summary.', 'zone.', 'category.', 'stage.', 'industry.'],
  selector: '[data-techpar-strings]',
});

export const { SCRIPT_STRING_KEYS, hasString, s, sHtml, resetStringsForTest } = strings;
