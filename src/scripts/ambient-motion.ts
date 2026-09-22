/**
 * Hero ambient motion settings (BL-035, ADR-0039).
 *
 * A per-browser design-tool setting, chosen in the /brand palette panel and
 * applied to <html> the same way the palette is:
 *
 *   data-ambient="glow rails"   which effect layers render (space-separated)
 *   data-ambient-layered        present when two or more are on — thins each
 *                               layer to its share of the 15-element budget
 *   --ambient-<id>              layer opacity, 0–1
 *   --ambient-pace              animation speed multiplier, 0.5–1.5
 *
 * localStorage['ambient-motion'] stores the settings. It is deliberately NOT
 * part of 'palette-overrides', so picking a new palette (which wipes colour
 * edits) leaves motion alone.
 *
 * This module is pure — no storage, no Sentry — so it unit-tests cleanly; the
 * panel controls own persistence. The inline init script in BaseLayout.astro
 * cannot import it and repeats the key, ids, ranges and default list;
 * tests/unit/ambient-motion.test.ts pins the two together.
 */

export const EFFECT_IDS = ['grid', 'glow', 'scan', 'rails', 'deltas'] as const;
export type EffectId = (typeof EFFECT_IDS)[number];

export const EFFECTS: ReadonlyArray<{ id: EffectId; label: string }> = [
  { id: 'grid', label: 'Grid Pulse' },
  { id: 'glow', label: 'Glow Shift' },
  { id: 'scan', label: 'Scan Sweep' },
  { id: 'rails', label: 'Data Rails' },
  { id: 'deltas', label: 'Delta Drift' },
];

export const STORAGE_KEY = 'ambient-motion';
export const ATTR_ON = 'data-ambient';
export const ATTR_LAYERED = 'data-ambient-layered';

export const STRENGTH = { min: 0, max: 100, step: 5 } as const;
export const PACE = { min: 50, max: 150, step: 10, default: 100 } as const;

/** The approved design's starting strengths — 100 is the drawn intensity. */
export const DEFAULT_STRENGTH: Readonly<Record<EffectId, number>> = {
  grid: 45,
  glow: 35,
  scan: 40,
  rails: 50,
  deltas: 30,
};

export interface AmbientSettings {
  on: EffectId[];
  strength: Record<EffectId, number>;
  pace: number;
}

/** The visitor default: nothing moves until someone opts in from /brand. */
export const DEFAULT_SETTINGS: Readonly<AmbientSettings> = {
  on: [],
  strength: { ...DEFAULT_STRENGTH },
  pace: PACE.default,
};

export function defaultSettings(): AmbientSettings {
  return { on: [...DEFAULT_SETTINGS.on], strength: { ...DEFAULT_STRENGTH }, pace: PACE.default };
}

function isEffectId(v: unknown): v is EffectId {
  return typeof v === 'string' && (EFFECT_IDS as readonly string[]).includes(v);
}

/** Clamp to [min, max] and snap to the slider step; non-numbers get `fallback`. */
export function clampStep(
  v: unknown,
  range: { min: number; max: number; step: number },
  fallback: number
): number {
  const n = typeof v === 'number' ? v : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  const snapped = Math.round(n / range.step) * range.step;
  return Math.min(range.max, Math.max(range.min, snapped));
}

/** Anything malformed reads as the default; partial objects keep what is valid. */
export function parseSettings(raw: string | null): AmbientSettings {
  const out = defaultSettings();
  if (!raw) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out;
  const obj = parsed as Record<string, unknown>;

  if (Array.isArray(obj.on)) {
    // Keep the canonical order and drop duplicates, whatever order was stored.
    const wanted = new Set(obj.on.filter(isEffectId));
    out.on = EFFECT_IDS.filter((id) => wanted.has(id));
  }
  if (obj.strength && typeof obj.strength === 'object' && !Array.isArray(obj.strength)) {
    const s = obj.strength as Record<string, unknown>;
    for (const id of EFFECT_IDS)
      out.strength[id] = clampStep(s[id], STRENGTH, DEFAULT_STRENGTH[id]);
  }
  out.pace = clampStep(obj.pace, PACE, PACE.default);
  return out;
}

export function serializeSettings(s: AmbientSettings): string {
  return JSON.stringify({ on: s.on, strength: s.strength, pace: s.pace });
}

export function applySettings(el: HTMLElement, s: AmbientSettings): void {
  if (s.on.length) el.setAttribute(ATTR_ON, s.on.join(' '));
  else el.removeAttribute(ATTR_ON);
  el.toggleAttribute(ATTR_LAYERED, s.on.length > 1);
  for (const id of EFFECT_IDS)
    el.style.setProperty(`--ambient-${id}`, String(s.strength[id] / 100));
  el.style.setProperty('--ambient-pace', String(s.pace / 100));
}
