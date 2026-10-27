/**
 * Infrastructure Cost Governance client strings (BL-153 Tier B): the shared
 * island reader (`src/scripts/tool-strings.ts`) bound to this tool's catalog
 * and island. The domain, question and recommendation text is here too: the
 * wizard and results render it client-side, translated by id.
 */
import { createToolStrings } from '../tool-strings';
import EN from '../../i18n/en/infrastructure-cost-governance.json';

const strings = createToolStrings({
  en: EN as Record<string, string>,
  prefixes: [
    'js.',
    'answer.',
    'domain.',
    'question.',
    'rec.',
    'stage.',
    'maturity.',
    'maturityDesc.',
    'impact.',
    'impactGroup.',
    'effort.',
    'summary.',
    'context.',
  ],
  selector: '[data-icg-strings]',
});

export const { SCRIPT_STRING_KEYS, hasString, s, sHtml, resetStringsForTest } = strings;
