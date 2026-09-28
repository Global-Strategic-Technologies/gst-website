import {
  DEPLOY_OPTIONS,
  DEFAULT_STATE,
  posToTeamSize,
  posToSalary,
  posTobudget,
  posToArr,
  teamSizeToPos,
  salaryToPos,
  arrToPos,
  budgetToPos,
  calculate,
  fmtPayback,
  encodeState,
  decodeState,
  buildSummaryText,
  burdenClassify,
  contextNote,
  parseShortCurrency,
} from '../../utils/tech-debt-engine';

import type { CalcState, CalcResult } from '../../utils/tech-debt-engine';
import { trackEvent } from '../../utils/analytics';
import { copyWithFeedback } from '../../utils/copy-feedback';
import { CURRENCIES, formatCurrency, formatShortCurrency, hasNonDefaultAdvanced } from './logic';

// Analytics: fire tdc_start once per page load on first slider interaction
let tdcStartFired = false;

// ─── DOM helpers ─────────────────────────────────────────────────────────────

function getInput(key: string): HTMLInputElement {
  return document.querySelector(`[data-input="${key}"]`) as HTMLInputElement;
}

function getDisplay(key: string): HTMLElement {
  return document.querySelector(`[data-display="${key}"]`) as HTMLElement;
}

function getMetric(key: string): HTMLElement {
  return document.querySelector(`[data-metric="${key}"]`) as HTMLElement;
}

function el(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

// ─── URL state ────────────────────────────────────────────────────────────────

function pushUrlState(state: CalcState): void {
  const params = new URLSearchParams({ s: encodeState(state) });
  history.replaceState(null, '', '?' + params.toString());
}

function readUrlState(): ReturnType<typeof decodeState> {
  const s = new URLSearchParams(window.location.search).get('s');
  return s ? decodeState(s) : null;
}

// Surface a visible notice when a shared link carried values outside the
// calculator's supported range (see decodeState's producer/consumer note).
// Without this, a clamped value looks indistinguishable from one the reader
// chose — the same silent-misreport failure mode this guard set out to fix.
function showSharedStateNotice(adjustedLabels: string[]): void {
  const noticeEl = document.querySelector('[data-shared-notice]') as HTMLElement | null;
  if (!noticeEl || adjustedLabels.length === 0) return;
  noticeEl.textContent =
    `Some values in this shared link were outside the calculator's supported range and have ` +
    `been adjusted to the nearest limit: ${adjustedLabels.join(', ')}. Results reflect the ` +
    `adjusted values.`;
  noticeEl.hidden = false;
}

// ─── Currency ─────────────────────────────────────────────────────────────────

let currency = 'USD';

const fmtC = (n: number): string => formatCurrency(n, currency);
const fmtShortC = (n: number): string => formatShortCurrency(n, currency);

// ─── State ────────────────────────────────────────────────────────────────────

const state: CalcState = { ...DEFAULT_STATE };

// ─── Render sub-functions ──────────────────────────────────────────────────────

let tdcCompleteFired = false;

function renderAnalytics(result: CalcResult): void {
  if (tdcStartFired && !tdcCompleteFired) {
    trackEvent({
      event: 'tdc_complete',
      category: 'tool',
      annual_cost: String(result.annualCost),
      page: 'tech-debt-calculator',
    });
    tdcCompleteFired = true;
  }
}

function renderCoreMetrics(state: CalcState, result: CalcResult, teamSize: number): void {
  getMetric('annual-cost').textContent = fmtShortC(result.annualCost);
  getMetric('per-month').textContent = fmtShortC(result.totalMonthly);
  getMetric('hrs-lost').textContent = result.hoursLostPerEng.toFixed(0) + 'h';
  getMetric('cost-per-eng').textContent = fmtShortC(result.costPerEng);

  const engsLost = ((teamSize * state.maintPct) / 100).toFixed(1);
  const burden = burdenClassify(state.maintPct);

  el('ctx-engs-lost').textContent = engsLost + ' FTEs';
  el('ctx-engs-lost').style.color =
    state.maintPct >= 35 ? 'var(--color-secondary-ink)' : 'var(--color-primary)';
  el('ctx-burden-label').textContent = burden.text;
  el('ctx-burden-label').style.color = burden.color;
  el('ctx-burden-range').textContent = burden.range;
  el('ctx-burden-range').style.color = burden.color;
  el('ctx-note').textContent = contextNote(state.maintPct, fmtShortC(result.annualCost));

  getMetric('annual-cost').style.color =
    state.maintPct >= 35 ? 'var(--color-secondary-ink)' : 'var(--color-primary)';
}

function renderAdvancedPanel(state: CalcState, result: CalcResult): void {
  const advPanel = document.querySelector('[data-advanced-panel]') as HTMLElement | null;
  const advResults = document.querySelector('[data-adv-results]') as HTMLElement | null;
  if (advPanel) advPanel.classList.toggle('is-hidden', !state.advancedOpen);
  if (advResults) advResults.classList.toggle('is-hidden', !state.advancedOpen);

  const toggleBtn = document.querySelector('[data-advanced-toggle]') as HTMLButtonElement | null;
  if (toggleBtn) {
    toggleBtn.setAttribute('aria-expanded', String(state.advancedOpen));
    const labelEl = toggleBtn.querySelector('[data-toggle-label]') as HTMLElement | null;
    if (labelEl) {
      labelEl.textContent = state.advancedOpen ? 'Hide Advanced Inputs' : 'Show Advanced Inputs';
    }
  }

  if (state.advancedOpen) {
    getMetric('direct-labor').textContent = fmtShortC(result.directMonthly) + '/mo';
    getMetric('incident-labor').textContent = fmtShortC(result.incidentMonthly) + '/mo';
    getMetric('velocity').textContent = result.V.toFixed(2) + '× ' + result.doraLabel;
    getMetric('debt-pct-arr').textContent = result.debtPctArr.toFixed(1) + '%';

    getMetric('velocity').style.color =
      result.V <= 1.0 ? 'var(--color-primary)' : 'var(--color-secondary-ink)';
    getMetric('debt-pct-arr').style.color =
      result.debtPctArr < 5 ? 'var(--color-primary)' : 'var(--color-secondary-ink)';
    getMetric('incident-labor').style.color = 'var(--color-secondary-ink)';
    getMetric('direct-labor').style.color = '';

    const ctxSwitchStat = document.getElementById('ctx-switch-stat');
    if (ctxSwitchStat) {
      ctxSwitchStat.style.display = state.contextSwitchOn ? '' : 'none';
    }
    getMetric('context-switch').textContent = fmtShortC(result.contextSwitchMonthly) + '/mo';
    getMetric('context-switch').style.color = state.contextSwitchOn
      ? 'var(--color-secondary-ink)'
      : '';

    el('payback-breakeven').textContent = fmtPayback(result.paybackMonths);
    el('payback-breakeven').style.color =
      result.paybackMonths < 24 ? 'var(--color-primary)' : 'var(--color-secondary-ink)';
    el('payback-savings').textContent = fmtShortC(result.monthlySavings);
    el('payback-disclaimer').textContent =
      `Remediation efficiency: ${state.remediationPct}% · Budget: ${fmtC(state.remediationBudget)}`;
  }
}

function renderDeployButtons(state: CalcState): void {
  document.querySelectorAll('[data-deploy-btn]').forEach((btn) => {
    const b = btn as HTMLElement;
    const isActive = Number(b.dataset.deployBtn) === state.deployIdx;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-pressed', String(isActive));
  });

  const doraEl = document.querySelector('[data-dora-message]') as HTMLElement;
  if (state.deployIdx >= 6) {
    doraEl.textContent =
      'DORA Low tier: constrained velocity signals debt is likely the rate-limiting factor';
    doraEl.style.color = 'var(--color-secondary-ink)';
  } else if (state.deployIdx >= 4) {
    doraEl.textContent =
      'DORA Medium tier: deployment lag suggests debt friction is dampening throughput';
    doraEl.style.color = 'var(--color-secondary-ink)';
  } else {
    doraEl.textContent = '';
    doraEl.style.color = '';
  }
}

function renderSliderValues(state: CalcState, teamSize: number): void {
  getDisplay('team-size').textContent = String(teamSize);
  getDisplay('salary').textContent = fmtShortC(state.salary);
  getDisplay('maint-pct').textContent = state.maintPct + '%';
  getDisplay('incidents').textContent = state.incidents === 0 ? 'None' : String(state.incidents);
  getDisplay('mttr').textContent = state.mttr + 'h';
  getDisplay('budget').textContent = fmtShortC(state.remediationBudget);
  getDisplay('arr').textContent = fmtShortC(state.arr);
  getDisplay('remediation').textContent = state.remediationPct + '%';

  const ctxCheckbox = document.getElementById('input-context-switch') as HTMLInputElement | null;
  if (ctxCheckbox) ctxCheckbox.checked = state.contextSwitchOn;

  const setAriaValue = (id: string, now: number, text: string) => {
    const slider = document.getElementById(id);
    if (slider) {
      slider.setAttribute('aria-valuenow', String(now));
      slider.setAttribute('aria-valuetext', text);
    }
  };
  setAriaValue('input-team-size', teamSizeToPos(state.teamSize), `${teamSize} engineers`);
  setAriaValue('input-salary', salaryToPos(state.salary), fmtShortC(state.salary));
  setAriaValue('input-maint-pct', state.maintPct, `${state.maintPct}%`);
  setAriaValue(
    'input-incidents',
    state.incidents,
    state.incidents === 0 ? 'None' : `${state.incidents} per month`
  );
  setAriaValue('input-mttr', state.mttr, `${state.mttr} hours`);
  setAriaValue('input-arr', arrToPos(state.arr), fmtShortC(state.arr));
  setAriaValue(
    'input-budget',
    budgetToPos(state.remediationBudget),
    fmtShortC(state.remediationBudget)
  );
  setAriaValue('input-remediation', state.remediationPct, `${state.remediationPct}%`);

  const hint = (key: string): HTMLElement | null => document.querySelector(`[data-hint="${key}"]`);
  const salaryMin = hint('salary-min');
  if (salaryMin) salaryMin.textContent = fmtShortC(60000);
  const salaryMax = hint('salary-max');
  if (salaryMax) salaryMax.textContent = fmtShortC(1000000);
  const arrMin = hint('arr-min');
  if (arrMin) arrMin.textContent = fmtShortC(100000);
  const arrMax = hint('arr-max');
  if (arrMax) arrMax.textContent = fmtShortC(1000000000);
  const budgetMin = hint('budget-min');
  if (budgetMin) budgetMin.textContent = fmtShortC(10000);
  const budgetMax = hint('budget-max');
  if (budgetMax) budgetMax.textContent = fmtShortC(50000000);
}

function render(): void {
  const result = calculate(state);
  const teamSize = state.teamSize;
  renderAnalytics(result);
  renderCoreMetrics(state, result, teamSize);
  renderAdvancedPanel(state, result);
  renderDeployButtons(state);
  renderSliderValues(state, teamSize);
  syncDirectInputs();
  pushUrlState(state);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function getDirect(key: string): HTMLInputElement | null {
  return document.querySelector(`[data-direct="${key}"]`) as HTMLInputElement | null;
}

// Visible feedback when a typed direct-input value gets clamped or rejected.
// Passing `null` clears the message. Aria-live announces changes to AT users.
function showClampMsg(key: string, reason: string | null): void {
  const msg = document.querySelector(`[data-clamp-msg="${key}"]`) as HTMLElement | null;
  if (!msg) return;
  if (reason) {
    msg.textContent = reason;
    msg.style.display = 'block';
  } else {
    msg.textContent = '';
    msg.style.display = 'none';
  }
}

function syncDirectInputs(): void {
  const ts = getDirect('team-size');
  if (ts) ts.value = String(state.teamSize);
  const sal = getDirect('salary');
  if (sal) sal.value = fmtShortC(state.salary);
  const mp = getDirect('maint-pct');
  if (mp) mp.value = String(state.maintPct);
  const inc = getDirect('incidents');
  if (inc) inc.value = String(state.incidents);
  const mttr = getDirect('mttr');
  if (mttr) mttr.value = String(state.mttr);
  const arr = getDirect('arr');
  if (arr) arr.value = fmtShortC(state.arr);
  const budget = getDirect('budget');
  if (budget) budget.value = fmtShortC(state.remediationBudget);
}

function initSliders(): void {
  getInput('team-size').value = String(teamSizeToPos(state.teamSize));
  getInput('salary').value = String(salaryToPos(state.salary));
  getInput('maint-pct').value = String(state.maintPct);
  getInput('incidents').value = String(state.incidents);
  getInput('mttr').value = String(state.mttr);
  getInput('budget').value = String(budgetToPos(state.remediationBudget));
  getInput('arr').value = String(arrToPos(state.arr));
  getInput('remediation').value = String(state.remediationPct);
  syncDirectInputs();
}

// ─── Event wiring ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Apply URL-encoded state before initialising sliders so DOM positions match
  const urlState = readUrlState();
  if (urlState) {
    Object.assign(state, urlState.state);
    if (hasNonDefaultAdvanced(state)) state.advancedOpen = true;
    showSharedStateNotice(urlState.adjusted);
  }

  initSliders();
  render();

  // Slider input handlers — slider drag updates raw state via posTo* mapping.
  // The slider's coarse 0-100 quantization is now contained to its own UI
  // surface; typed input bypasses it entirely (see direct-input handlers
  // below).
  getInput('team-size').addEventListener('input', (e) => {
    state.teamSize = posToTeamSize(Number((e.target as HTMLInputElement).value));
    render();
  });
  getInput('salary').addEventListener('input', (e) => {
    state.salary = posToSalary(Number((e.target as HTMLInputElement).value));
    render();
  });
  getInput('maint-pct').addEventListener('input', (e) => {
    state.maintPct = Number((e.target as HTMLInputElement).value);
    render();
  });
  getInput('incidents').addEventListener('input', (e) => {
    state.incidents = Number((e.target as HTMLInputElement).value);
    render();
  });
  getInput('mttr').addEventListener('input', (e) => {
    state.mttr = Number((e.target as HTMLInputElement).value);
    render();
  });
  getInput('budget').addEventListener('input', (e) => {
    state.remediationBudget = posTobudget(Number((e.target as HTMLInputElement).value));
    render();
  });
  getInput('arr').addEventListener('input', (e) => {
    state.arr = posToArr(Number((e.target as HTMLInputElement).value));
    render();
  });
  getInput('remediation').addEventListener('input', (e) => {
    state.remediationPct = Number((e.target as HTMLInputElement).value);
    render();
  });

  // Direct input handlers — write typed values to raw state verbatim
  // (no slider-position round-trip). Slider thumb position is recomputed
  // from the new raw value via `*ToPos()` for visual feedback only.
  //
  // Each handler tracks WHY a value changed (parse-fail, below-min, above-max)
  // and emits a visible clamp message via showClampMsg() so the user never
  // wonders why "$50" silently became "$100K". The message is auto-cleared
  // by the typed-value's `input` event (one keystroke ahead of next change).

  /** Resolve a numeric input with clamp + reason, in one place. */
  function resolveTyped(
    raw: string,
    parsed: number,
    min: number,
    max: number,
    fallback: number,
    label: string,
    fmt: (n: number) => string
  ): { value: number; reason: string | null } {
    if (!Number.isFinite(parsed)) {
      return { value: fallback, reason: `Couldn't read "${raw}" — kept ${fmt(fallback)}` };
    }
    if (parsed < min) {
      return { value: min, reason: `Minimum ${label} is ${fmt(min)}` };
    }
    if (parsed > max) {
      return { value: max, reason: `Maximum ${label} is ${fmt(max)}` };
    }
    return { value: parsed, reason: null };
  }

  const fmtInt = (n: number) => String(n);

  const tsInput = getDirect('team-size');
  if (tsInput) {
    tsInput.addEventListener('input', () => showClampMsg('team-size', null));
    tsInput.addEventListener('change', () => {
      const parsed = Math.round(Number(tsInput.value));
      const { value, reason } = resolveTyped(
        tsInput.value,
        parsed,
        1,
        500,
        state.teamSize,
        'team size',
        fmtInt
      );
      state.teamSize = value;
      showClampMsg('team-size', reason);
      getInput('team-size').value = String(teamSizeToPos(state.teamSize));
      render();
    });
  }

  const salInput = getDirect('salary');
  if (salInput) {
    salInput.addEventListener('input', () => showClampMsg('salary', null));
    salInput.addEventListener('change', () => {
      const parsed = parseShortCurrency(salInput.value);
      const { value, reason } = resolveTyped(
        salInput.value,
        parsed,
        60000,
        1000000,
        state.salary,
        'salary',
        fmtShortC
      );
      state.salary = value;
      showClampMsg('salary', reason);
      getInput('salary').value = String(salaryToPos(state.salary));
      render();
    });
  }

  const mpInput = getDirect('maint-pct');
  if (mpInput) {
    mpInput.addEventListener('input', () => showClampMsg('maint-pct', null));
    mpInput.addEventListener('change', () => {
      const parsed = Number(mpInput.value);
      const { value, reason } = resolveTyped(
        mpInput.value,
        parsed,
        0,
        100,
        state.maintPct,
        'maintenance burden',
        (n) => `${n}%`
      );
      state.maintPct = value;
      showClampMsg('maint-pct', reason);
      getInput('maint-pct').value = String(value);
      render();
    });
  }

  const incInput = getDirect('incidents');
  if (incInput) {
    incInput.addEventListener('input', () => showClampMsg('incidents', null));
    incInput.addEventListener('change', () => {
      const parsed = Number(incInput.value);
      const { value, reason } = resolveTyped(
        incInput.value,
        parsed,
        0,
        20,
        state.incidents,
        'incidents',
        fmtInt
      );
      state.incidents = value;
      showClampMsg('incidents', reason);
      getInput('incidents').value = String(value);
      render();
    });
  }

  const mttrInput = getDirect('mttr');
  if (mttrInput) {
    mttrInput.addEventListener('input', () => showClampMsg('mttr', null));
    mttrInput.addEventListener('change', () => {
      const parsed = Number(mttrInput.value);
      const { value, reason } = resolveTyped(
        mttrInput.value,
        parsed,
        1,
        48,
        state.mttr,
        'MTTR',
        (n) => `${n}h`
      );
      state.mttr = value;
      showClampMsg('mttr', reason);
      getInput('mttr').value = String(value);
      render();
    });
  }

  const arrInput = getDirect('arr');
  if (arrInput) {
    arrInput.addEventListener('input', () => showClampMsg('arr', null));
    arrInput.addEventListener('change', () => {
      const parsed = parseShortCurrency(arrInput.value);
      const { value, reason } = resolveTyped(
        arrInput.value,
        parsed,
        100000,
        1000000000,
        state.arr,
        'ARR',
        fmtShortC
      );
      state.arr = value;
      showClampMsg('arr', reason);
      getInput('arr').value = String(arrToPos(state.arr));
      render();
    });
  }

  const budgetInput = getDirect('budget');
  if (budgetInput) {
    budgetInput.addEventListener('input', () => showClampMsg('budget', null));
    budgetInput.addEventListener('change', () => {
      const parsed = parseShortCurrency(budgetInput.value);
      const { value, reason } = resolveTyped(
        budgetInput.value,
        parsed,
        10000,
        50000000,
        state.remediationBudget,
        'remediation budget',
        fmtShortC
      );
      state.remediationBudget = value;
      showClampMsg('budget', reason);
      getInput('budget').value = String(budgetToPos(state.remediationBudget));
      render();
    });
  }

  // Context-switch checkbox handler
  const ctxSwitch = document.getElementById('input-context-switch') as HTMLInputElement | null;
  if (ctxSwitch) {
    ctxSwitch.addEventListener('change', () => {
      state.contextSwitchOn = ctxSwitch.checked;
      trackEvent({
        event: 'tdc_context_switch_toggle',
        category: 'engagement',
        action: state.contextSwitchOn ? 'on' : 'off',
      });
      render();
    });
  }

  // Slider analytics (fire once on release, not every drag tick)
  const sliderIds = [
    'team-size',
    'salary',
    'maint-pct',
    'incidents',
    'mttr',
    'budget',
    'arr',
    'remediation',
  ] as const;
  sliderIds.forEach((id) => {
    getInput(id).addEventListener('change', (e) => {
      if (!tdcStartFired) {
        trackEvent({ event: 'tdc_start', category: 'tool', page: 'tech-debt-calculator' });
        tdcStartFired = true;
      }
      trackEvent({
        event: 'tdc_slider_change',
        category: 'engagement',
        slider: id,
        value: Number((e.target as HTMLInputElement).value),
      });
    });
  });

  document.querySelectorAll('[data-deploy-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number((btn as HTMLElement).dataset.deployBtn);
      trackEvent({
        event: 'tdc_deploy_frequency',
        category: 'engagement',
        value: DEPLOY_OPTIONS[idx]?.label ?? idx,
      });
      state.deployIdx = idx;
      render();
    });
  });

  const advancedToggle = document.querySelector('[data-advanced-toggle]');
  if (advancedToggle) {
    advancedToggle.addEventListener('click', () => {
      state.advancedOpen = !state.advancedOpen;
      trackEvent({
        event: 'tdc_advanced_toggle',
        category: 'engagement',
        action: state.advancedOpen ? 'open' : 'close',
      });
      render();
    });
  }

  const currencySelect = document.getElementById('currency-select') as HTMLSelectElement | null;
  if (currencySelect) {
    currencySelect.addEventListener('change', () => {
      currency = currencySelect.value;
      trackEvent({ event: 'tdc_currency_change', category: 'engagement', currency });
      const disclaimerEl = document.getElementById('currency-disclaimer');
      if (disclaimerEl) {
        disclaimerEl.textContent = currency === 'USD' ? '' : 'Approx. rate \u00b7 not live';
      }
      render();
    });
  }

  const pdfBtn = document.getElementById('export-pdf-btn') as HTMLButtonElement | null;
  if (pdfBtn) {
    pdfBtn.addEventListener('click', () => {
      trackEvent({ event: 'tdc_export_pdf', category: 'engagement' });
      window.print();
    });
  }

  const copyBtn = document.getElementById('copy-link-btn') as HTMLButtonElement | null;
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      trackEvent({ event: 'tdc_copy_link', category: 'engagement' });
      copyWithFeedback(window.location.href, copyBtn);
    });
  }

  const summaryBtn = document.getElementById('copy-summary-btn') as HTMLButtonElement | null;
  if (summaryBtn) {
    summaryBtn.addEventListener('click', () => {
      trackEvent({ event: 'tdc_copy_summary', category: 'engagement' });
      const result = calculate(state);
      const { symbol, multiplier } = CURRENCIES[currency];
      const text = buildSummaryText(state, result, symbol, multiplier, window.location.href);
      copyWithFeedback(text, summaryBtn);
    });
  }
});
