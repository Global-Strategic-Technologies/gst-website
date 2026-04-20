/**
 * TechPar UI — orchestrator barrel.
 *
 * Imports the three sub-modules (state, dom, chart), wires up event
 * listeners, defines the updateAll() orchestrator, and runs initialisation.
 *
 * This file is loaded by hub/tools/techpar/index.astro via a <script> import.
 */
import { compute } from './techpar-engine';
import type { Industry } from '../data/techpar/industry-notes';
import { trackEvent } from './analytics';
import { tp, MAX_HISTORICAL, VISITED_KEY } from './techpar/state';
import {
  $$,
  g,
  getInput,
  goTab,
  copyLink,
  copySummary,
  exportPdf,
  setBaseline,
  clearBaseline,
  saveScenario,
  handleReset,
  resetAll,
  renderHistRows,
  sumDeep,
  formatWithCommas,
  syncArrChips,
  updateChipCurrencies,
  syncInfraPeriodUI,
  updateInfraAnnotation,
  checkSanity,
  buildInputs,
  runCompute,
  syncUrlState,
  hydrateFromUrl,
  syncRadioGroup,
} from './techpar/dom';
import { renderAnalysis, renderTrajectory } from './techpar/chart';

// ─── Dependency injection helpers ─────────────────────────
// Several dom.ts functions need updateAll/renderTrajectory/goTab but can't
// import them (circular). We pass them as callbacks.

const goTabBound = (tab: string) => goTab(tab, { runCompute, renderTrajectory });

// Analytics: fire tp_start once per page load on first stage selection
let tpStartFired = false;

// ─── Main update loop ─────────────────────────────────────
function updateAll() {
  const inputs = buildInputs();
  const r = inputs ? compute(inputs) : null;

  syncUrlState();
  updateInfraAnnotation();
  checkSanity();

  // Growth rate warning
  const growthWarn = g('growth-warn');
  if (growthWarn)
    growthWarn.style.display = tp.growthRate !== null && tp.growthRate > 100 ? 'block' : 'none';

  // Exit field visibility
  const showExit = tp.stageKey === 'pe' || tp.stageKey === 'enterprise';
  g('exit-field')?.classList.toggle('tp-exit-field--vis', showExit);

  // CapEx toggle visibility
  const hasCapEx = getInput('rdCapEx') > 0;
  g('capex-row')?.classList.toggle('tp-capex-row--vis', hasCapEx);
  if (!hasCapEx) {
    const chk = document.querySelector('[data-input="gaapChk"]') as HTMLInputElement;
    if (chk) chk.checked = false;
  }

  // Analysis button + hint
  const btnAnalysis = document.querySelector('[data-btn-analysis]') as HTMLButtonElement;
  if (btnAnalysis) btnAnalysis.disabled = !r;
  const analysisHint = g('analysis-hint');
  if (analysisHint) {
    if (r) {
      analysisHint.textContent = '';
    } else if (!tp.stageKey) {
      analysisHint.textContent = 'Select a company stage on the Profile tab';
    } else if (!inputs || !inputs.arr) {
      analysisHint.textContent = 'Enter ARR on the Profile tab';
    } else {
      analysisHint.textContent = 'Enter infrastructure spend above';
    }
  }

  if (!r) {
    const missingStage = !tp.stageKey;
    const missingArr = !inputs || !inputs.arr;
    const emptyMsg = document.querySelector('[data-analysis-empty-msg]');
    const emptyCta = document.querySelector(
      '[data-analysis-empty-cta]'
    ) as HTMLButtonElement | null;
    if (missingStage || missingArr) {
      const msg = missingStage
        ? 'Select a company stage on the Profile\ntab to compute TechPar.'
        : 'Enter your ARR on the Profile tab\nto compute TechPar.';
      if (emptyMsg) emptyMsg.textContent = msg;
      if (emptyCta) {
        emptyCta.dataset.action = 'go-profile';
        emptyCta.textContent = 'Go to profile →';
      }
    } else {
      if (emptyMsg)
        emptyMsg.textContent = 'Enter infrastructure spend on the\nCosts tab to compute TechPar.';
      if (emptyCta) {
        emptyCta.dataset.action = 'go-costs';
        emptyCta.textContent = 'Go to costs →';
      }
    }
    const trajMsg = document.querySelector('[data-traj-empty-msg]');
    const trajCta = document.querySelector('[data-traj-empty-cta]') as HTMLButtonElement | null;
    if (missingStage || missingArr) {
      const msg = missingStage
        ? 'Select a company stage on the Profile\ntab to generate trajectory.'
        : 'Enter your ARR on the Profile tab\nto generate trajectory.';
      if (trajMsg) trajMsg.textContent = msg;
      if (trajCta) {
        trajCta.dataset.action = 'go-profile';
        trajCta.textContent = 'Go to profile →';
      }
    } else {
      if (trajMsg)
        trajMsg.textContent =
          'Enter infrastructure spend on the\nCosts tab to generate trajectory.';
      if (trajCta) {
        trajCta.dataset.action = 'go-costs';
        trajCta.textContent = 'Go to costs →';
      }
    }
    g('analysis-empty')?.classList.remove('tp-empty--hidden');
    g('analysis-content')?.classList.remove('tp-analysis-content--on');
    g('traj-empty')?.classList.remove('tp-empty--hidden');
    g('traj-content')?.classList.remove('tp-traj-content--on');
    if (tp.trajChart) {
      tp.trajChart.destroy();
      tp.trajChart = null;
    }
    return;
  }

  g('analysis-empty')?.classList.add('tp-empty--hidden');
  g('analysis-content')?.classList.add('tp-analysis-content--on');
  g('traj-empty')?.classList.add('tp-empty--hidden');
  g('traj-content')?.classList.add('tp-traj-content--on');

  renderAnalysis(r, updateAll);
  if (document.querySelector('[data-panel="trajectory"]')?.classList.contains('tp-panel--active')) {
    renderTrajectory(r);
  }
}

// ─── Event listeners ──────────────────────────────────────

// Tab buttons
$$('.tool-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = (btn as HTMLElement).dataset.tab || 'profile';
    trackEvent({ event: 'tp_tab_change', category: 'tool', tab, page: 'techpar' });
    goTabBound(tab);
  });
});

// Navigation action buttons
document.querySelectorAll('[data-action]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const action = (btn as HTMLElement).dataset.action;
    if (action === 'go-costs') goTabBound('costs');
    else if (action === 'go-profile') goTabBound('profile');
    else if (action === 'go-analysis') goTabBound('analysis');
    else if (action === 'go-trajectory') goTabBound('trajectory');
    else if (action === 'reset')
      handleReset(btn as HTMLButtonElement, () => {
        trackEvent({ event: 'tp_reset', category: 'tool', page: 'techpar' });
        resetAll({
          goTab: goTabBound,
          updateAll,
          renderHistRows: () => renderHistRows(updateAll),
        });
      });
    else if (action === 'copy-link') copyLink(btn as HTMLButtonElement);
    else if (action === 'copy-summary') copySummary(btn as HTMLButtonElement);
    else if (action === 'export-pdf') exportPdf({ runCompute, renderTrajectory });
    else if (action === 'set-baseline') setBaseline(updateAll);
    else if (action === 'clear-baseline') clearBaseline(updateAll);
    else if (action === 'save-scenario') saveScenario(updateAll);
  });
});

// Stage selector
$$('.brutal-option-card[data-stage]').forEach((card) => {
  card.addEventListener('click', () => {
    $$('.brutal-option-card[data-stage]').forEach((c) => {
      c.classList.remove('brutal-option-card--selected');
      c.setAttribute('aria-checked', 'false');
    });
    card.classList.add('brutal-option-card--selected');
    card.setAttribute('aria-checked', 'true');
    tp.stageKey = (card as HTMLElement).dataset.stage || 'series_bc';
    trackEvent({ event: 'tp_stage_select', category: 'tool', stage: tp.stageKey, page: 'techpar' });
    if (!tpStartFired) {
      trackEvent({ event: 'tp_start', category: 'tool', page: 'techpar' });
      tpStartFired = true;
    }
    if (tp.trajChart) {
      tp.trajChart.destroy();
      tp.trajChart = null;
    }
    updateAll();
  });
});

// Growth rate selector
const growthCustomInput = document.getElementById('tp-growth-custom') as HTMLInputElement | null;
if (growthCustomInput)
  growthCustomInput.value = tp.growthRate !== null ? String(tp.growthRate) : '';

$$('[data-growth]').forEach((btn) => {
  btn.addEventListener('click', () => {
    syncRadioGroup('[data-growth]', btn);
    tp.growthRate = parseInt((btn as HTMLElement).dataset.growth || '20', 10);
    if (growthCustomInput) growthCustomInput.value = String(tp.growthRate);
    updateAll();
  });
});

growthCustomInput?.addEventListener('input', () => {
  const val = parseFloat(growthCustomInput.value);
  if (!isNaN(val) && val > 0) {
    $$('[data-growth]').forEach((b) => {
      b.classList.remove('tp-seg__btn--active');
      b.setAttribute('aria-checked', 'false');
    });
    tp.growthRate = val;
    updateAll();
  }
});

// Mode toggle
$$('[data-mode]').forEach((btn) => {
  btn.addEventListener('click', () => {
    syncRadioGroup('[data-mode]', btn);
    tp.mode = ((btn as HTMLElement).dataset.mode || 'quick') as 'quick' | 'deepdive';
    trackEvent({ event: 'tp_mode_change', category: 'tool', mode: tp.mode, page: 'techpar' });
    const rdQuick = g('rd-quick');
    const rdDeep = g('rd-deep');
    if (rdQuick) rdQuick.style.display = tp.mode === 'quick' ? 'block' : 'none';
    if (rdDeep) rdDeep.classList.toggle('tp-deep-wrap--on', tp.mode === 'deepdive');
    if (tp.mode === 'quick') {
      const sum = getInput('rdEng') + getInput('rdProd') + getInput('rdTool');
      if (sum > 0) {
        const rdInput = document.querySelector('[data-input="rdOpEx"]') as HTMLInputElement | null;
        if (rdInput) rdInput.value = String(sum);
      }
    }
    updateAll();
  });
});

// Currency selector
$$('[data-currency]').forEach((btn) => {
  btn.addEventListener('click', () => {
    syncRadioGroup('[data-currency]', btn);
    tp.currencySymbol = (btn as HTMLElement).dataset.currency || '$';
    document.querySelectorAll('.brutal-field__prefix').forEach((pre) => {
      pre.textContent = tp.currencySymbol;
    });
    updateChipCurrencies();
    updateAll();
  });
});

// Infrastructure period toggle
$$('[data-infra-period]').forEach((btn) => {
  btn.addEventListener('click', () => {
    tp.infraPeriod = ((btn as HTMLElement).dataset.infraPeriod || 'monthly') as
      | 'monthly'
      | 'annual';
    syncInfraPeriodUI();
    updateAll();
  });
});

// Industry selector
$$('[data-industry]').forEach((btn) => {
  btn.addEventListener('click', () => {
    syncRadioGroup('[data-industry]', btn);
    tp.industry = ((btn as HTMLElement).dataset.industry || 'saas') as Industry;
    updateAll();
  });
});

// Historical data add button
document.querySelector('[data-hist-add]')?.addEventListener('click', () => {
  if (tp.historicalPoints.length >= MAX_HISTORICAL) return;
  const nextYearBack = tp.historicalPoints.length + 1;
  tp.historicalPoints.unshift({
    label: `FY${new Date().getFullYear() - nextYearBack}`,
    arr: 0,
    totalTechSpend: 0,
  });
  renderHistRows(updateAll);
});

// Deep Dive inputs
['rdEng', 'rdProd', 'rdTool'].forEach((name) => {
  document
    .querySelector(`[data-input="${name}"]`)
    ?.addEventListener('input', () => sumDeep(updateAll));
});

// All other inputs
['infra', 'infraPers', 'rdOpEx', 'rdCapEx', 'engFTE', 'exitMult', 'gaapChk'].forEach((name) => {
  const el = document.querySelector(`[data-input="${name}"]`);
  if (el)
    el.addEventListener(el.getAttribute('type') === 'checkbox' ? 'change' : 'input', updateAll);
});

// ARR: comma formatting + quick-pick chips
const arrInput = document.getElementById('tp-arr') as HTMLInputElement | null;
const arrChips = document.querySelectorAll<HTMLButtonElement>('[data-arr-val]');

arrChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    const val = Number(chip.dataset.arrVal);
    const current = getInput('arr');
    if (!arrInput) return;
    arrInput.value = val === current ? '' : val > 0 ? formatWithCommas(val) : '';
    arrInput.dispatchEvent(new Event('input', { bubbles: true }));
    syncArrChips();
  });
});

if (arrInput) {
  arrInput.addEventListener('input', () => {
    const raw = arrInput.value.replace(/[^0-9]/g, '');
    const num = parseInt(raw, 10);
    if (raw && !isNaN(num)) {
      const distFromEnd = arrInput.value.length - (arrInput.selectionStart || 0);
      arrInput.value = formatWithCommas(num);
      const newPos = Math.max(0, arrInput.value.length - distFromEnd);
      arrInput.setSelectionRange(newPos, newPos);
    } else if (!raw) {
      arrInput.value = '';
    }
    syncArrChips();
    updateAll();
  });
}

// Cost preset chips
document.querySelectorAll<HTMLButtonElement>('[data-preset-for]').forEach((chip) => {
  chip.addEventListener('click', () => {
    const inputName = chip.dataset.presetFor!;
    const val = Number(chip.dataset.presetVal);
    const input = document.querySelector(`[data-input="${inputName}"]`) as HTMLInputElement | null;
    if (!input) return;
    const current = parseFloat(input.value) || 0;
    input.value = val === current ? '' : String(val);
    document
      .querySelectorAll<HTMLButtonElement>(`[data-preset-for="${inputName}"]`)
      .forEach((c) => {
        c.classList.toggle(
          'tp-arr-chip--active',
          Number(c.dataset.presetVal) === (val === current ? 0 : val)
        );
      });
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
});

// ─── Onboarding ───────────────────────────────────────────
try {
  const onboarding = document.querySelector('[data-onboarding]') as HTMLDetailsElement | null;
  if (onboarding && localStorage.getItem(VISITED_KEY)) {
    onboarding.open = false;
  }
  localStorage.setItem(VISITED_KEY, '1');
} catch {
  /* ignore — localStorage unavailable */
}

// ─── Init ─────────────────────────────────────────────────
hydrateFromUrl();
// If historical data was loaded, render the rows before updateAll
if (tp.historicalPoints.length > 0) {
  renderHistRows(updateAll);
  const histDetails = document.querySelector('[data-historical]') as HTMLDetailsElement | null;
  if (histDetails) histDetails.open = true;
}
updateAll();
