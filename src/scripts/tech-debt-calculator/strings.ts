/**
 * Tech Debt Calculator client strings (BL-153 Tier B): the shared island
 * reader (`src/scripts/tool-strings.ts`) bound to this tool's catalog and island.
 */
import { createToolStrings } from '../tool-strings';
import EN from '../../i18n/en/tech-debt-calculator.json';

const strings = createToolStrings({
  en: EN as Record<string, string>,
  prefixes: ['js.', 'burden.', 'deploy.', 'dora.', 'field.', 'payback.', 'summary.'],
  selector: '[data-tech-debt-strings]',
});

export const { SCRIPT_STRING_KEYS, hasString, s, sHtml, resetStringsForTest } = strings;
