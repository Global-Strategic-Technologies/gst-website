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
  encodeState,
  decodeState,
  buildSummaryText,
  burdenKeyOf,
  BURDEN_COLOR,
  SUMMARY_TEXT_EN,
  parseShortCurrency,
} from '../../utils/tech-debt-engine';

import type {
  BurdenKey,
  CalcState,
  CalcResult,
  StateFieldKey,
  SummaryText,
} from '../../utils/tech-debt-engine';
import { trackEvent } from '../../utils/analytics';
import { copyWithFeedback } from '../../utils/copy-feedback';
import {
  formatCurrency,
  formatShortCurrency,
  hasNonDefaultAdvanced,
  normalizeLocaleAmount,
} from './logic';
import {
  CURRENCY_SYMBOL,
  DEFAULT_CURRENCY,
  decimalSeparator,
  parseCurrencyParam,
  type Currency,
} from '../../i18n/currency';
import { formatFixed, formatPlain } from '../../i18n/formatters';
import { s } from './strings';

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

// ─── Page language ───────────────────────────────────────────────────────────

// Strings come from the page's island (English when there is none); numbers
// follow `<html lang>`, the tag the template formats its first paint with.
function pageLang(): string {
  return document.documentElement.lang || 'en';
}

const fixed = (n: number, decimals: number): string => formatFixed(n, pageLang(), decimals);
const plain = (n: number): string => formatPlain(n, pageLang());
const pct = (n: number): string => s('js.unit.pct', { n: plain(n) });
const perMonth = (amount: string): string => s('js.unit.perMonth', { amount });

function contextNoteText(key: BurdenKey, burdenPct: number, cost: string): string {
  return s(`burden.${key}.note`, { pct: plain(burdenPct), cost });
}

function paybackText(months: number): string {
  if (months < 1) return s('payback.under1');
  if (months > 60) return s('payback.over5');
  return s('payback.months', { n: fixed(months, 1) });
}

// ─── URL state ────────────────────────────────────────────────────────────────

// The display currency rides beside `s` (never inside it — `s` is the MCP
// deeplink contract). A link without `cur` means USD: a stored preference would
// relabel an `s`-only link (MCP deeplinks, older shares) in the reader's
// currency, so the URL is the only place the choice lives.
function pushUrlState(state: CalcState): void {
  const params = new URLSearchParams({ s: encodeState(state), cur: currency });
  history.replaceState(null, '', '?' + params.toString());
}

function readUrlState(): ReturnType<typeof decodeState> {
  const encoded = new URLSearchParams(window.location.search).get('s');
  return encoded ? decodeState(encoded) : null;
}

// Surface a visible notice when a shared link carried values outside the
// calculator's supported range (see decodeState's producer/consumer note).
// Without this, a clamped value looks indistinguishable from one the reader
// chose — the same silent-misreport failure mode this guard set out to fix.
function showSharedStateNotice(adjustedKeys: StateFieldKey[]): void {
  const noticeEl = document.querySelector('[data-shared-notice]') as HTMLElement | null;
  if (!noticeEl || adjustedKeys.length === 0) return;
  const labels = adjustedKeys.map((key) => s(`field.${key}`));
  noticeEl.textContent = s('js.sharedNotice', { fields: listOf(labels) });
  noticeEl.hidden = false;
}

// `Intl.ListFormat` joins in the page language ("a, b y c", "a, b e c"). The
// English page keeps the comma list it has always printed.
function listOf(items: string[]): string {
  const lang = pageLang();
  if (lang.startsWith('en') || typeof Intl.ListFormat !== 'function') return items.join(', ');
  return new Intl.ListFormat(lang, { style: 'long', type: 'conjunction' }).format(items);
}

// ─── Currency ─────────────────────────────────────────────────────────────────

let currency: Currency = DEFAULT_CURRENCY;

const fmtC = (n: number): string => formatCurrency(n, currency, pageLang());
const fmtShortC = (n: number): string => formatShortCurrency(n, currency, pageLang());

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
  getMetric('hrs-lost').textContent = s('js.unit.hours', { n: fixed(result.hoursLostPerEng, 0) });
  getMetric('cost-per-eng').textContent = fmtShortC(result.costPerEng);

  const engsLost = fixed((teamSize * state.maintPct) / 100, 1);
  const key = burdenKeyOf(state.maintPct);
  const color = BURDEN_COLOR[key];

  el('ctx-engs-lost').textContent = s('js.unit.ftes', { n: engsLost });
  el('ctx-engs-lost').style.color =
    state.maintPct >= 35 ? 'var(--color-secondary-ink)' : 'var(--color-primary)';
  el('ctx-burden-label').textContent = s(`burden.${key}.label`);
  el('ctx-burden-label').style.color = color;
  el('ctx-burden-range').textContent = s(`burden.${key}.range`);
  el('ctx-burden-range').style.color = color;
  el('ctx-note').textContent = contextNoteText(key, state.maintPct, fmtShortC(result.annualCost));

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
      labelEl.textContent = s(state.advancedOpen ? 'js.advanced.hide' : 'js.advanced.show');
    }
  }

  if (state.advancedOpen) {
    getMetric('direct-labor').textContent = perMonth(fmtShortC(result.directMonthly));
    getMetric('incident-labor').textContent = perMonth(fmtShortC(result.incidentMonthly));
    getMetric('velocity').textContent = s('js.velocity', {
      v: fixed(result.V, 2),
      dora: s(`dora.${result.doraLabel}`),
    });
    getMetric('debt-pct-arr').textContent = s('js.unit.pct', { n: fixed(result.debtPctArr, 1) });

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
    getMetric('context-switch').textContent = perMonth(fmtShortC(result.contextSwitchMonthly));
    getMetric('context-switch').style.color = state.contextSwitchOn
      ? 'var(--color-secondary-ink)'
      : '';

    el('payback-breakeven').textContent = paybackText(result.paybackMonths);
    el('payback-breakeven').style.color =
      result.paybackMonths < 24 ? 'var(--color-primary)' : 'var(--color-secondary-ink)';
    el('payback-savings').textContent = fmtShortC(result.monthlySavings);
    el('payback-disclaimer').textContent = s('js.paybackDisclaimer', {
      pct: plain(state.remediationPct),
      budget: fmtC(state.remediationBudget),
    });
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
    doraEl.textContent = s('js.dora.low');
    doraEl.style.color = 'var(--color-secondary-ink)';
  } else if (state.deployIdx >= 4) {
    doraEl.textContent = s('js.dora.medium');
    doraEl.style.color = 'var(--color-secondary-ink)';
  } else {
    doraEl.textContent = '';
    doraEl.style.color = '';
  }
}

function renderSliderValues(state: CalcState, teamSize: number): void {
  getDisplay('team-size').textContent = String(teamSize);
  getDisplay('salary').textContent = fmtShortC(state.salary);
  getDisplay('maint-pct').textContent = pct(state.maintPct);
  getDisplay('incidents').textContent =
    state.incidents === 0 ? s('js.none') : String(state.incidents);
  getDisplay('mttr').textContent = s('js.unit.hours', { n: state.mttr });
  getDisplay('budget').textContent = fmtShortC(state.remediationBudget);
  getDisplay('arr').textContent = fmtShortC(state.arr);
  getDisplay('remediation').textContent = pct(state.remediationPct);

  const ctxCheckbox = document.getElementById('input-context-switch') as HTMLInputElement | null;
  if (ctxCheckbox) ctxCheckbox.checked = state.contextSwitchOn;

  const setAriaValue = (id: string, now: number, text: string) => {
    const slider = document.getElementById(id);
    if (slider) {
      slider.setAttribute('aria-valuenow', String(now));
      slider.setAttribute('aria-valuetext', text);
    }
  };
  setAriaValue(
    'input-team-size',
    teamSizeToPos(state.teamSize),
    s('js.aria.engineers', { n: teamSize })
  );
  setAriaValue('input-salary', salaryToPos(state.salary), fmtShortC(state.salary));
  setAriaValue('input-maint-pct', state.maintPct, pct(state.maintPct));
  setAriaValue(
    'input-incidents',
    state.incidents,
    state.incidents === 0 ? s('js.none') : s('js.aria.perMonth', { n: state.incidents })
  );
  setAriaValue('input-mttr', state.mttr, s('js.aria.hours', { n: state.mttr }));
  setAriaValue('input-arr', arrToPos(state.arr), fmtShortC(state.arr));
  setAriaValue(
    'input-budget',
    budgetToPos(state.remediationBudget),
    fmtShortC(state.remediationBudget)
  );
  setAriaValue('input-remediation', state.remediationPct, pct(state.remediationPct));
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
  currency = parseCurrencyParam(new URLSearchParams(window.location.search).get('cur'));
  const urlState = readUrlState();
  if (urlState) {
    Object.assign(state, urlState.state);
    if (hasNonDefaultAdvanced(state)) state.advancedOpen = true;
    showSharedStateNotice(urlState.adjustedKeys);
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
    field: string,
    fmt: (n: number) => string
  ): { value: number; reason: string | null } {
    // `raw` is the visitor's own text; it reaches the page through
    // `textContent` only (showClampMsg), never as markup.
    if (!Number.isFinite(parsed)) {
      return { value: fallback, reason: s('js.clamp.unreadable', { raw, value: fmt(fallback) }) };
    }
    const label = s(`js.clampField.${field}`);
    if (parsed < min) {
      return { value: min, reason: s('js.clamp.min', { field: label, value: fmt(min) }) };
    }
    if (parsed > max) {
      return { value: max, reason: s('js.clamp.max', { field: label, value: fmt(max) }) };
    }
    return { value: parsed, reason: null };
  }

  const fmtInt = (n: number) => String(n);
  // Typed amounts arrive in the page language (`1,5M` on /pt/ and /es/).
  const readAmount = (raw: string): number =>
    parseShortCurrency(normalizeLocaleAmount(raw, decimalSeparator(pageLang())));

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
        'teamSize',
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
      const parsed = readAmount(salInput.value);
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
        'maintPct',
        pct
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
        'mttr',
        (n) => s('js.unit.hours', { n })
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
      const parsed = readAmount(arrInput.value);
      const { value, reason } = resolveTyped(
        arrInput.value,
        parsed,
        100000,
        1000000000,
        state.arr,
        'arr',
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
      const parsed = readAmount(budgetInput.value);
      const { value, reason } = resolveTyped(
        budgetInput.value,
        parsed,
        10000,
        50000000,
        state.remediationBudget,
        'budget',
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
    currencySelect.value = currency;
    currencySelect.addEventListener('change', () => {
      currency = parseCurrencyParam(currencySelect.value);
      trackEvent({ event: 'tdc_currency_change', category: 'engagement', currency });
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
      copyWithFeedback(window.location.href, copyBtn, { label: s('js.copied') });
    });
  }

  const summaryBtn = document.getElementById('copy-summary-btn') as HTMLButtonElement | null;
  if (summaryBtn) {
    summaryBtn.addEventListener('click', () => {
      trackEvent({ event: 'tdc_copy_summary', category: 'engagement' });
      const result = calculate(state);
      const text = buildSummaryText(
        state,
        result,
        CURRENCY_SYMBOL[currency],
        window.location.href,
        {
          text: summaryText(),
          money: fmtShortC,
          num: (n, digits) => (digits === undefined ? plain(n) : fixed(n, digits)),
          deployLabel: (idx) => s(`deploy.${idx}`),
          doraLabel: (label) => s(`dora.${label}`),
          burdenLabel: (key) => s(`burden.${key}.plain`),
          contextNote: contextNoteText,
          payback: paybackText,
        }
      );
      copyWithFeedback(text, summaryBtn, { label: s('js.copied') });
    });
  }
});

/** The summary's line templates in the page language (`summary.<key>`). */
function summaryText(): SummaryText {
  return Object.fromEntries(
    Object.keys(SUMMARY_TEXT_EN).map((key) => [key, s(`summary.${key}`)])
  ) as SummaryText;
}
