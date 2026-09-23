// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applySettings,
  ATTR_LAYERED,
  ATTR_ON,
  ATTR_SCOPE,
  DEFAULT_SETTINGS,
  DEFAULT_STRENGTH,
  EFFECT_IDS,
  EFFECTS,
  PACE,
  parseSettings,
  SCOPES,
  serializeSettings,
  STORAGE_KEY,
  STRENGTH,
} from '../../src/scripts/ambient-motion';

const ALL_OFF = { on: [], strength: DEFAULT_STRENGTH, pace: PACE.default, scope: 'hero' };

describe('ambient-motion settings (BL-035)', () => {
  it('declares one labelled effect per id, in id order', () => {
    expect(EFFECTS.map((e) => e.id)).toEqual([...EFFECT_IDS]);
    for (const e of EFFECTS) expect(e.label.length).toBeGreaterThan(0);
  });

  it('visitors get nothing by default', () => {
    expect(DEFAULT_SETTINGS.on).toEqual([]);
    expect(parseSettings(null)).toEqual(ALL_OFF);
  });

  it('reads anything malformed as the default', () => {
    for (const raw of ['', 'not json', '[]', '"glow"', '42', 'null', '{"on":"glow"}']) {
      expect(parseSettings(raw), raw).toEqual(ALL_OFF);
    }
  });

  it('drops unknown ids and duplicates, and keeps canonical order', () => {
    const s = parseSettings(JSON.stringify({ on: ['rails', 'bubbles', 'glow', 'rails', 3] }));
    expect(s.on).toEqual(['glow', 'rails']);
  });

  it('clamps and snaps numbers; non-numbers fall back per field', () => {
    const s = parseSettings(
      JSON.stringify({
        on: ['grid'],
        strength: { grid: 250, glow: -8, scan: 42, rails: '90', deltas: null },
        pace: 999,
      })
    );
    expect(s.strength).toEqual({
      grid: STRENGTH.max,
      glow: STRENGTH.min,
      scan: 40,
      rails: DEFAULT_STRENGTH.rails,
      deltas: DEFAULT_STRENGTH.deltas,
    });
    expect(s.pace).toBe(PACE.max);
    expect(parseSettings(JSON.stringify({ pace: 64 })).pace).toBe(60);
    expect(parseSettings(JSON.stringify({ pace: 'fast' })).pace).toBe(PACE.default);
  });

  it('round-trips through serialize', () => {
    const s = parseSettings(
      JSON.stringify({ on: ['scan', 'deltas'], strength: { scan: 70 }, pace: 120, scope: 'site' })
    );
    expect(parseSettings(serializeSettings(s))).toEqual(s);
    expect(s.scope).toBe('site');
  });

  it('reads the scope, and anything unknown as the hero', () => {
    expect(SCOPES).toEqual(['hero', 'page', 'site']);
    expect(DEFAULT_SETTINGS.scope).toBe('hero');
    for (const scope of SCOPES)
      expect(parseSettings(JSON.stringify({ on: ['glow'], scope })).scope).toBe(scope);
    for (const junk of ['everywhere', 3, null])
      expect(parseSettings(JSON.stringify({ on: ['glow'], scope: junk })).scope).toBe('hero');
  });

  it('applySettings writes the scope only while something is on', () => {
    const el = document.createElement('div');
    applySettings(el, parseSettings(JSON.stringify({ on: ['scan'], scope: 'site' })));
    expect(el.getAttribute(ATTR_SCOPE)).toBe('site');
    applySettings(el, parseSettings(JSON.stringify({ on: [], scope: 'site' })));
    expect(el.hasAttribute(ATTR_SCOPE)).toBe(false);
  });

  it('applySettings writes the attributes and variables, and clears them when off', () => {
    const el = document.createElement('div');
    applySettings(el, parseSettings(JSON.stringify({ on: ['glow'], strength: { glow: 35 } })));
    expect(el.getAttribute(ATTR_ON)).toBe('glow');
    expect(el.hasAttribute(ATTR_LAYERED)).toBe(false);
    expect(el.style.getPropertyValue('--ambient-glow')).toBe('0.35');
    expect(el.style.getPropertyValue('--ambient-pace')).toBe('1');

    applySettings(el, parseSettings(JSON.stringify({ on: ['glow', 'rails'], pace: 150 })));
    expect(el.getAttribute(ATTR_ON)).toBe('glow rails');
    expect(el.hasAttribute(ATTR_LAYERED)).toBe(true);
    expect(el.style.getPropertyValue('--ambient-pace')).toBe('1.5');

    applySettings(el, parseSettings(null));
    expect(el.hasAttribute(ATTR_ON)).toBe(false);
    expect(el.hasAttribute(ATTR_LAYERED)).toBe(false);
  });
});

/**
 * BaseLayout's inline init script cannot import the module, so it repeats the
 * key, ids, ranges and default list. Rather than match its text, run it: seed
 * localStorage, execute the real block against the real <html>, and require
 * the same result applySettings() produces from parseSettings().
 */
describe("BaseLayout's inline ambient-motion block matches the module", () => {
  const src = readFileSync(resolve(__dirname, '../../src/layouts/BaseLayout.astro'), 'utf8');
  const start = src.indexOf("const ids = ['grid'");
  const endMarker = '// Ambient motion is decoration';
  const end = src.indexOf('}', src.indexOf(endMarker));
  // The try { … } catch { … } that owns the block.
  const tryStart = src.lastIndexOf('try {', start);
  const block = src.slice(tryStart, end + 1);

  const html = document.documentElement;
  const reset = () => {
    localStorage.clear();
    html.removeAttribute(ATTR_ON);
    html.removeAttribute(ATTR_LAYERED);
    html.removeAttribute(ATTR_SCOPE);
    html.removeAttribute('style');
  };
  beforeEach(reset);
  afterEach(reset);

  it('the block is located', () => {
    expect(start, 'inline block located').toBeGreaterThan(-1);
    expect(block).toContain(`localStorage.getItem('${STORAGE_KEY}')`);
    expect(block.trim().endsWith('}')).toBe(true);
  });

  const run = () => new Function(block)();

  const cases: Array<[string, string | null]> = [
    ['nothing stored', null],
    ['one effect', JSON.stringify({ on: ['scan'], strength: { scan: 70 }, pace: 80 })],
    ['layered, reordered', JSON.stringify({ on: ['rails', 'grid', 'glow'] })],
    ['all five', JSON.stringify({ on: [...EFFECT_IDS] })],
    [
      'out-of-range and junk numbers',
      JSON.stringify({ on: ['glow'], strength: { glow: 'loud', grid: 999, scan: 33 }, pace: -4 }),
    ],
    ['unknown ids only', JSON.stringify({ on: ['bubbles'] })],
    ['page scope', JSON.stringify({ on: ['rails'], scope: 'page' })],
    ['site scope, layered', JSON.stringify({ on: ['grid', 'deltas'], scope: 'site' })],
    ['junk scope', JSON.stringify({ on: ['glow'], scope: 'everywhere' })],
    ['a scope with nothing on', JSON.stringify({ on: [], scope: 'site' })],
    ['malformed JSON', '{on:'],
    ['an array', '["glow"]'],
  ];

  for (const [name, raw] of cases) {
    it(`agrees with applySettings: ${name}`, () => {
      if (raw !== null) localStorage.setItem(STORAGE_KEY, raw);
      run();
      const inline = {
        on: html.getAttribute(ATTR_ON),
        layered: html.hasAttribute(ATTR_LAYERED),
        scope: html.getAttribute(ATTR_SCOPE),
        vars: [...EFFECT_IDS, 'pace'].map((k) => html.style.getPropertyValue(`--ambient-${k}`)),
      };

      const expected = parseSettings(raw);
      const ref = document.createElement('div');
      applySettings(ref, expected);

      expect(inline.on).toBe(ref.getAttribute(ATTR_ON));
      expect(inline.layered).toBe(ref.hasAttribute(ATTR_LAYERED));
      expect(inline.scope).toBe(ref.getAttribute(ATTR_SCOPE));
      if (expected.on.length) {
        // Every variable is set, so no layer falls back to opacity 0 (or, via
        // an invalid value, to 1).
        expect(inline.vars).toEqual(
          [...EFFECT_IDS, 'pace'].map((k) => ref.style.getPropertyValue(`--ambient-${k}`))
        );
        for (const v of inline.vars) expect(v).not.toBe('');
      } else {
        // A still hero leaves <html> untouched for every visitor.
        expect(inline.vars.every((v) => v === '')).toBe(true);
      }
    });
  }

  it('its scope list is SCOPES, and its fallback is the default scope', () => {
    const m = /const scopes = \[([^\]]*)\]/.exec(block);
    expect(m, 'scopes located').not.toBeNull();
    const list = [...m![1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
    expect(list).toEqual([...SCOPES]);
    expect(block).toContain(': scopes[0]');
    expect(list[0]).toBe(DEFAULT_SETTINGS.scope);
  });

  it('its fallback default list is DEFAULT_SETTINGS.on', () => {
    const m = /const defaultOn = \[([^\]]*)\]/.exec(block);
    expect(m, 'defaultOn located').not.toBeNull();
    const list = [...m![1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
    expect(list).toEqual(DEFAULT_SETTINGS.on);
  });

  it('never throws, even when storage does', () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('denied');
    };
    try {
      expect(run).not.toThrow();
      expect(html.hasAttribute(ATTR_ON)).toBe(DEFAULT_SETTINGS.on.length > 0);
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
