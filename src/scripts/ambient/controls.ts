/**
 * The palette panel's Ambient Motion controls (BL-035, ADR-0039), built when
 * the panel first opens (palette-manager.ts loadMotionControls), so no page
 * carries their markup, script or CSS for a visitor who never opens it.
 *
 * PalettePanel.astro keeps the section's wrapper, heading
 * (#ambient-controls-title, which the chip group is labelled by) and hint
 * (#ambient-scope-hint), since the rail's Motion button jumps there; this
 * fills its #ambient-controls-mount. Toggles and tunes the effect through
 * src/scripts/ambient-motion.ts; what is chosen is saved for this browser
 * under localStorage['ambient-motion'], separate from colour edits, so
 * neither Reset clears the other.
 *
 * The toggles are `.brutal-choice-btn`, the sliders `.brutal-slider*` and the
 * scope `.brutal-segmented` (form.css, site-wide); this module's own rules are
 * controls.css, inserted as a string (?inline), like ambient.css.
 */
import * as Sentry from '@sentry/browser';
import css from './controls.css?inline';
import { deltaSvg } from './build';
import {
  applySettings,
  DEFAULT_STRENGTH,
  defaultSettings,
  EFFECT_IDS,
  EFFECTS,
  PACE,
  parseSettings,
  SCOPE_LABELS,
  SCOPES,
  serializeSettings,
  STORAGE_KEY,
  STRENGTH,
  type AmbientSettings,
  type EffectId,
  type Scope,
} from '../ambient-motion';

const STYLE_ID = 'ambient-controls-css';

const SCOPE_HINTS: Record<Scope, string> = {
  hero: 'Homepage hero',
  page: 'Whole homepage',
  site: 'Every page',
};

/** Static copy and constants only: nothing here comes from the visitor. */
function markup(): string {
  const chips = EFFECTS.map(
    (e) =>
      `<button type="button" class="brutal-choice-btn" aria-pressed="false" data-ambient-effect="${e.id}" data-testid="ambient-chip-${e.id}">${e.label}</button>`
  ).join('');
  const scopes = SCOPES.map(
    (scope, i) =>
      `<button type="button" class="brutal-segmented__btn${i === 0 ? ' brutal-segmented__btn--active' : ''}" aria-pressed="${i === 0}" disabled data-ambient-scope-option="${scope}" data-testid="ambient-scope-${scope}">${SCOPE_LABELS[scope]}</button>`
  ).join('');
  const rows = EFFECTS.map(
    (e) =>
      `<div class="ambient-controls__row">` +
      `<label class="brutal-slider__label" for="ambient-strength-${e.id}">${e.label}</label>` +
      `<input id="ambient-strength-${e.id}" type="range" class="brutal-slider__input" min="${STRENGTH.min}" max="${STRENGTH.max}" step="${STRENGTH.step}" value="${DEFAULT_STRENGTH[e.id]}" disabled data-ambient-strength="${e.id}" data-testid="ambient-strength-${e.id}">` +
      `<span class="brutal-slider__value" data-ambient-value="${e.id}">${DEFAULT_STRENGTH[e.id]}%</span>` +
      `</div>`
  ).join('');
  return `
    <div class="ambient-controls__chips" role="group" aria-labelledby="ambient-controls-title">${chips}</div>
    <div class="ambient-controls__scope">
      <span class="brutal-slider__label" id="ambient-scope-label">Scope</span>
      <div class="brutal-segmented brutal-segmented--wide" role="group" aria-labelledby="ambient-scope-label">${scopes}</div>
    </div>
    <div class="ambient-controls__rows">${rows}</div>
    <div class="brutal-slider ambient-controls__pace">
      <div class="brutal-slider__header">
        <label class="brutal-slider__label" for="ambient-pace">Pace · all effects</label>
        <span class="brutal-slider__value" id="ambient-pace-value">${PACE.default}%</span>
      </div>
      <input id="ambient-pace" type="range" class="brutal-slider__input" min="${PACE.min}" max="${PACE.max}" step="${PACE.step}" value="${PACE.default}" disabled data-testid="ambient-pace">
      <div class="ambient-controls__scale" aria-hidden="true"><span>Slower</span><span>Faster</span></div>
    </div>
    <p class="ambient-controls__note">
      <span><strong>Reduced motion wins.</strong> A system set to reduce motion switches every effect off, whatever is chosen here. Colour follows the palette.</span>
    </p>
    <div class="ambient-controls__foot">
      <span class="ambient-controls__state" id="ambient-state" aria-live="polite">Nothing on — the hero stays still</span>
      <button type="button" class="brutal-btn brutal-btn--secondary ambient-controls__reset" id="ambient-reset" data-testid="ambient-reset" title="Switch every effect off and restore the default strengths and pace">Reset motion</button>
    </div>`;
}

function readSettings(): AmbientSettings {
  try {
    return parseSettings(localStorage.getItem(STORAGE_KEY));
  } catch {
    return defaultSettings();
  }
}

function persist(s: AmbientSettings | null): void {
  try {
    if (s) localStorage.setItem(STORAGE_KEY, serializeSettings(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    Sentry.addBreadcrumb({
      category: 'ambient-motion',
      message: 'localStorage write failed',
      level: 'warning',
    });
  }
}

/** Build the controls into #ambient-controls-mount and wire them. Idempotent. */
export function mountAmbientControls(): void {
  const mount = document.getElementById('ambient-controls-mount');
  if (!mount || document.getElementById('ambient-controls')) return;

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.append(style);
  }

  const section = document.createElement('div');
  section.id = 'ambient-controls';
  section.className = 'ambient-controls';
  section.dataset.testid = 'ambient-controls';
  section.innerHTML = markup();
  section.querySelector('.ambient-controls__note')?.prepend(deltaSvg(12));
  mount.append(section);

  let settings = readSettings();
  const chips = section.querySelectorAll<HTMLButtonElement>('[data-ambient-effect]');
  const strengths = section.querySelectorAll<HTMLInputElement>('[data-ambient-strength]');
  const pace = section.querySelector<HTMLInputElement>('#ambient-pace');
  const paceValue = section.querySelector<HTMLElement>('#ambient-pace-value');
  const state = section.querySelector<HTMLElement>('#ambient-state');
  const scopes = section.querySelectorAll<HTMLButtonElement>('[data-ambient-scope-option]');
  // The hint lives in PalettePanel's section heading, outside the mount.
  const hint = document.getElementById('ambient-scope-hint');
  const reset = section.querySelector<HTMLButtonElement>('#ambient-reset');

  function render(): void {
    chips.forEach((chip) => {
      const on = settings.on.includes(chip.dataset.ambientEffect as EffectId);
      chip.setAttribute('aria-pressed', String(on));
      chip.classList.toggle('brutal-choice-btn--selected', on);
    });
    strengths.forEach((input) => {
      const id = input.dataset.ambientStrength as EffectId;
      input.value = String(settings.strength[id]);
      input.disabled = !settings.on.includes(id);
      const label = section.querySelector(`[data-ambient-value="${id}"]`);
      if (label) label.textContent = `${settings.strength[id]}%`;
    });
    if (pace) {
      pace.value = String(settings.pace);
      pace.disabled = settings.on.length === 0;
    }
    if (paceValue) paceValue.textContent = `${settings.pace}%`;
    scopes.forEach((btn) => {
      const active = btn.dataset.ambientScopeOption === settings.scope;
      btn.classList.toggle('brutal-segmented__btn--active', active);
      btn.setAttribute('aria-pressed', String(active));
      btn.disabled = settings.on.length === 0;
    });
    if (hint) hint.textContent = SCOPE_HINTS[settings.scope];
    if (state) {
      state.textContent = settings.on.length
        ? `${settings.on.length} of ${EFFECT_IDS.length} on · ${SCOPE_LABELS[settings.scope].toLowerCase()} · saved for this browser`
        : 'Nothing on — the hero stays still';
    }
  }

  function commit(): void {
    applySettings(document.documentElement, settings);
    persist(settings);
    render();
  }

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const id = chip.dataset.ambientEffect as EffectId;
      const next = new Set(settings.on);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      settings.on = EFFECT_IDS.filter((x) => next.has(x));
      commit();
    });
  });

  strengths.forEach((input) => {
    input.addEventListener('input', () => {
      settings.strength[input.dataset.ambientStrength as EffectId] = Number(input.value);
      commit();
    });
  });

  scopes.forEach((btn) => {
    btn.addEventListener('click', () => {
      settings.scope = btn.dataset.ambientScopeOption as Scope;
      commit();
    });
  });

  pace?.addEventListener('input', () => {
    settings.pace = Number(pace.value);
    commit();
  });

  reset?.addEventListener('click', () => {
    settings = defaultSettings();
    applySettings(document.documentElement, settings);
    // Forget the choice rather than store the default, so a public default
    // shipped later reaches this browser too.
    persist(null);
    render();
  });

  render();
  section.dataset.ready = 'true';
}
