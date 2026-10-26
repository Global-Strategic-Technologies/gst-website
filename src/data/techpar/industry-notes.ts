/**
 * TechPar - Industry types
 *
 * The five industry types the Analysis tab's context notes cover. The note
 * and disclaimer prose lives in the page catalog
 * (`industry.<id>.note` / `industry.<id>.disclaimer` in
 * `src/i18n/<locale>/techpar*.json`) so it can be translated; SaaS has no
 * note. Benchmarks remain SaaS-derived either way.
 */

export type { Industry } from '../../schemas/techpar';

export { INDUSTRY_KEYS } from '../../schemas/techpar';
