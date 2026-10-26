// @vitest-environment jsdom
/**
 * The shared Tier B island reader (`src/scripts/tool-strings.ts`, BL-153):
 * key selection by prefix, lazy island parse, per-key English fallback, and
 * param escaping in `sHtml`. Each tool binds it in `src/scripts/<tool>/strings.ts`.
 */
import { createToolStrings } from '../../src/scripts/tool-strings';

const EN = {
  'js.greeting': 'Hello {name}',
  'js.bye': 'Goodbye',
  'js.rich': '<strong>{who}</strong> wins',
  'meta.title': 'Server-only title',
} as const;

const make = () =>
  createToolStrings({ en: EN, prefixes: ['js.'], selector: '[data-demo-strings]' });

afterEach(() => {
  document.body.innerHTML = '';
});

describe('createToolStrings', () => {
  it('selects the island keys by prefix', () => {
    expect(make().SCRIPT_STRING_KEYS).toEqual(['js.greeting', 'js.bye', 'js.rich']);
  });

  it('falls back to English when there is no island', () => {
    const t = make();
    expect(t.s('js.greeting', { name: 'Ana' })).toBe('Hello Ana');
  });

  it('prefers the island and falls back per key', () => {
    document.body.innerHTML =
      '<script type="application/json" data-demo-strings>{"js.greeting":"Olá {name}"}</script>';
    const t = make();
    expect(t.s('js.greeting', { name: 'Ana' })).toBe('Olá Ana');
    expect(t.s('js.bye')).toBe('Goodbye');
  });

  it('reads the island once until reset', () => {
    const t = make();
    expect(t.s('js.bye')).toBe('Goodbye');
    document.body.innerHTML =
      '<script type="application/json" data-demo-strings>{"js.bye":"Tchau"}</script>';
    expect(t.s('js.bye')).toBe('Goodbye');
    t.resetStringsForTest();
    expect(t.s('js.bye')).toBe('Tchau');
  });

  it('treats a malformed island as empty', () => {
    document.body.innerHTML = '<script type="application/json" data-demo-strings>{oops</script>';
    expect(make().s('js.bye')).toBe('Goodbye');
  });

  it('returns the key for an unknown string, and hasString says so', () => {
    const t = make();
    expect(t.s('js.missing')).toBe('js.missing');
    expect(t.hasString('js.missing')).toBe(false);
    expect(t.hasString('js.bye')).toBe(true);
  });

  it('sHtml escapes params but not the template', () => {
    expect(make().sHtml('js.rich', { who: '<img src=x>' })).toBe(
      '<strong>&lt;img src=x&gt;</strong> wins'
    );
  });
});
