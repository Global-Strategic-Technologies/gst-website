/**
 * TechPar UI — DOM helpers, formatting, tab navigation, input validation,
 * and UI-sync utilities.
 */
import { formatDollars, formatPercent, zoneColorVar, zoneLabel } from '../techpar-engine';
import type { TechParInputs, TechParResult, Stage } from '../techpar-engine';
import { STAGES } from '../../data/techpar/stages';
import { tp, MAX_HISTORICAL, MAX_SCENARIOS } from './state';
import { compute } from '../techpar-engine';
import { copyWithFeedback } from '../copy-feedback';
import { trackEvent } from '../analytics';
import { serializeToParams, deserializeFromParams, buildSummaryText } from '../techpar-engine';
import type { Industry } from '../../data/techpar/industry-notes';
import { LS_KEY } from './state';

// ─── DOM query helpers ────────────────────────────────────
export const $$ = (sel: string) => document.querySelectorAll(sel);
export const g = (attr: string) => document.querySelector(`[data-${attr}]`) as HTMLElement | null;

export function getInput(name: string): number {
  const el = document.querySelector(`[data-input="${name}"]`) as HTMLInputElement | null;
  const raw = el?.value?.replace(/,/g, '') || '';
  return parseFloat(raw) || 0;
}

export function getStyle(varName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

/** Currency-aware formatDollars wrapper */
export function fmtD(n: number): string {
  return formatDollars(n, tp.currencySymbol);
}

// ─── Tab navigation ───────────────────────────────────────
export function goTab(
  tab: string,
  deps: { runCompute: () => TechParResult | null; renderTrajectory: (r: TechParResult) => void }
) {
  $$('.tool-tab').forEach((t) => t.classList.remove('tool-tab--active'));
  $$('.tp-panel').forEach((p) => p.classList.remove('tp-panel--active'));
  document.querySelector(`.tool-tab[data-tab="${tab}"]`)?.classList.add('tool-tab--active');
  document.querySelector(`[data-panel="${tab}"]`)?.classList.add('tp-panel--active');
  document.querySelector('[data-tab-bar]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (tab === 'trajectory') {
    const result = deps.runCompute();
    if (result) deps.renderTrajectory(result);
  }
}

// ─── Copy link ────────────────────────────────────────────
export function copyLink(btn: HTMLButtonElement) {
  trackEvent({ event: 'tp_copy_link', category: 'tool', page: 'techpar' });
  copyWithFeedback(window.location.href, btn, { copiedClass: 'brutal-btn--copied' });
}

// ─── Copy summary ─────────────────────────────────────────
export function copySummary(btn: HTMLButtonElement) {
  trackEvent({ event: 'tp_copy_summary', category: 'tool', page: 'techpar' });
  const inputs = buildInputs();
  if (!inputs) return;
  const result = compute(inputs);
  if (!result) return;
  const validHist = tp.historicalPoints.filter((p) => p.arr > 0 && p.totalTechSpend > 0);
  const text = buildSummaryText(
    inputs,
    result,
    window.location.href,
    validHist.length ? validHist : undefined
  );
  copyWithFeedback(text, btn, { copiedClass: 'brutal-btn--copied' });
}

// ─── Export PDF ───────────────────────────────────────────
export function exportPdf(deps: {
  runCompute: () => TechParResult | null;
  renderTrajectory: (r: TechParResult) => void;
}) {
  trackEvent({ event: 'tp_export_pdf', category: 'tool', page: 'techpar' });
  const result = deps.runCompute();
  const trajPanel = document.querySelector('[data-panel="trajectory"]') as HTMLElement | null;
  const trajContent = g('traj-content');
  if (trajPanel) trajPanel.style.display = 'block';
  if (trajContent) trajContent.style.display = 'block';
  if (result) deps.renderTrajectory(result);
  const methodology = document.querySelector('[data-methodology]') as HTMLDetailsElement | null;
  const wasOpen = methodology?.open ?? false;
  if (methodology) methodology.open = true;
  requestAnimationFrame(() => {
    window.print();
    if (trajPanel) trajPanel.style.display = '';
    if (trajContent) trajContent.style.display = '';
    if (methodology && !wasOpen) methodology.open = false;
  });
}

// ─── Baseline ─────────────────────────────────────────────
export function setBaseline(updateAll: () => void) {
  const inputs = buildInputs();
  if (!inputs) return;
  const result = compute(inputs);
  if (!result) return;
  trackEvent({ event: 'tp_baseline_set', category: 'tool', page: 'techpar' });
  tp.baselineResult = result;
  tp.baselineInputs = inputs;
  const barLabel = document.querySelector('.tp-baseline-bar__label');
  if (barLabel) barLabel.textContent = `Baseline: ${formatPercent(result.totalTechPct)}`;
  const bar = g('baseline-bar');
  if (bar) bar.style.display = 'flex';
  const setBtn = document.querySelector('[data-action="set-baseline"]') as HTMLElement | null;
  if (setBtn) setBtn.style.display = 'none';
  updateAll();
}

export function clearBaseline(updateAll: () => void) {
  tp.baselineResult = null;
  tp.baselineInputs = null;
  const bar = g('baseline-bar');
  if (bar) bar.style.display = 'none';
  const setBtn = document.querySelector('[data-action="set-baseline"]') as HTMLElement | null;
  if (setBtn) setBtn.style.display = '';
  updateAll();
}

// ─── Scenarios ────────────────────────────────────────────
export function saveScenario(updateAll: () => void) {
  const inputs = buildInputs();
  if (!inputs) return;
  const result = compute(inputs);
  if (!result) return;
  trackEvent({ event: 'tp_scenario_save', category: 'tool', page: 'techpar' });
  if (tp.scenarios.length >= MAX_SCENARIOS) tp.scenarios.shift();
  tp.scenarios.push({ name: `Scenario ${tp.scenarios.length + 1}`, inputs, result });
  updateAll();
}

export function removeScenario(index: number, updateAll: () => void) {
  tp.scenarios.splice(index, 1);
  tp.scenarios.forEach((s, i) => {
    s.name = `Scenario ${i + 1}`;
  });
  updateAll();
}

export function renderScenarios(r: TechParResult, updateAll: () => void) {
  const list = g('scenario-list');
  const chips = g('scenario-chips');
  const compare = g('scenario-compare');
  const table = g('scenario-table');
  const saveBtn = document.querySelector(
    '[data-action="save-scenario"]'
  ) as HTMLButtonElement | null;

  if (saveBtn) saveBtn.disabled = tp.scenarios.length >= MAX_SCENARIOS;

  if (!list || !chips || !compare || !table) return;

  if (tp.scenarios.length === 0) {
    list.style.display = 'none';
    compare.style.display = 'none';
    return;
  }

  list.style.display = 'block';
  chips.innerHTML = tp.scenarios
    .map((s, i) => {
      const col = getStyle(zoneColorVar(s.result.zone));
      return `<span class="tp-scenario-chip" style="border-left:3px solid ${col}"><span class="tp-zone-dot" style="background:${col}"></span>${s.name}: ${formatPercent(s.result.totalTechPct)} <span class="tp-scenario-chip__zone" style="color:${col}">${zoneLabel(s.result.zone)}</span><button class="tp-scenario-chip__remove" data-remove-scenario="${i}" type="button">&times;</button></span>`;
    })
    .join('');

  chips.querySelectorAll('[data-remove-scenario]').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeScenario(parseInt((btn as HTMLElement).dataset.removeScenario!, 10), updateAll);
    });
  });

  compare.style.display = 'block';
  const rows = [
    {
      label: 'Total %',
      current: formatPercent(r.totalTechPct),
      values: tp.scenarios.map((s) => formatPercent(s.result.totalTechPct)),
    },
    {
      label: 'Zone',
      current: zoneLabel(r.zone),
      values: tp.scenarios.map((s) => zoneLabel(s.result.zone)),
    },
    {
      label: 'Annual cost',
      current: fmtD(r.total),
      values: tp.scenarios.map((s) => fmtD(s.result.total)),
    },
    {
      label: '36-mo gap',
      current: fmtD(r.gap.cumulative36),
      values: tp.scenarios.map((s) => fmtD(s.result.gap.cumulative36)),
    },
  ];

  let html = '<table><thead><tr><th></th><th>Current</th>';
  tp.scenarios.forEach((s) => {
    html += `<th>${s.name}</th>`;
  });
  html += '</tr></thead><tbody>';
  rows.forEach((row) => {
    html += `<tr><td>${row.label}</td><td>${row.current}</td>`;
    row.values.forEach((v) => {
      html += `<td>${v}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  table.innerHTML = html;
}

// ─── Reset ────────────────────────────────────────────────
export function handleReset(btn: HTMLButtonElement, resetAll: () => void) {
  if (btn.dataset.confirming) {
    if (tp.resetTimeout) {
      clearTimeout(tp.resetTimeout);
      tp.resetTimeout = null;
    }
    btn.textContent = 'Reset all inputs';
    btn.classList.remove('tp-toolbar__reset--confirming');
    delete btn.dataset.confirming;
    resetAll();
    return;
  }
  btn.dataset.confirming = '1';
  btn.textContent = 'Click again to reset';
  btn.classList.add('tp-toolbar__reset--confirming');
  tp.resetTimeout = setTimeout(() => {
    btn.textContent = 'Reset all inputs';
    btn.classList.remove('tp-toolbar__reset--confirming');
    delete btn.dataset.confirming;
    tp.resetTimeout = null;
  }, 3000);
}

export function resetAll(deps: {
  goTab: (tab: string) => void;
  updateAll: () => void;
  renderHistRows: () => void;
}) {
  document.querySelectorAll<HTMLInputElement>('.techpar-shell input').forEach((el) => {
    if (el.type === 'checkbox') el.checked = false;
    else if (el.dataset.input === 'exitMult') el.value = '12';
    else el.value = '';
  });

  tp.stageKey = null;
  tp.growthRate = null;
  tp.mode = 'quick';
  tp.baselineResult = null;
  tp.baselineInputs = null;
  tp.scenarios = [];
  tp.currencySymbol = '$';
  const baseBar = g('baseline-bar');
  if (baseBar) baseBar.style.display = 'none';
  const setBtn = document.querySelector('[data-action="set-baseline"]') as HTMLElement | null;
  if (setBtn) setBtn.style.display = '';
  $$('[data-currency]').forEach((b) => {
    b.classList.toggle('tp-seg__btn--active', (b as HTMLElement).dataset.currency === '$');
  });
  document.querySelectorAll('.brutal-field__prefix').forEach((pre) => {
    pre.textContent = '$';
  });

  tp.historicalPoints = [];
  deps.renderHistRows();

  tp.infraPeriod = 'monthly';
  syncInfraPeriodUI();

  tp.industry = 'saas';
  $$('[data-industry]').forEach((b) => {
    b.classList.toggle('tp-seg__btn--active', (b as HTMLElement).dataset.industry === 'saas');
  });

  $$('.brutal-option-card[data-stage]').forEach((c) =>
    c.classList.remove('brutal-option-card--selected')
  );
  $$('[data-growth]').forEach((b) => b.classList.remove('tp-seg__btn--active'));
  const growthCustomEl = document.getElementById('tp-growth-custom') as HTMLInputElement | null;
  if (growthCustomEl) growthCustomEl.value = '';

  $$('[data-mode]').forEach((b) => b.classList.remove('tp-seg__btn--active'));
  document.querySelector('[data-mode="quick"]')?.classList.add('tp-seg__btn--active');
  const rdQuick = g('rd-quick');
  const rdDeep = g('rd-deep');
  if (rdQuick) rdQuick.style.display = 'block';
  if (rdDeep) rdDeep.classList.remove('tp-deep-wrap--on');

  const deepTotal = g('deep-total');
  if (deepTotal) deepTotal.innerHTML = '\u2014';

  document
    .querySelectorAll('.tp-arr-chip')
    .forEach((c) => c.classList.remove('tp-arr-chip--active'));

  if (tp.trajChart) {
    tp.trajChart.destroy();
    tp.trajChart = null;
  }

  history.replaceState(null, '', window.location.pathname);
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore — localStorage unavailable */
  }

  deps.updateAll();
  deps.goTab('profile');
}

// ─── Historical data ──────────────────────────────────────
export function renderHistRows(updateAll: () => void) {
  const container = g('hist-rows');
  const addBtn = document.querySelector('[data-hist-add]') as HTMLButtonElement | null;
  if (!container) return;

  container.innerHTML = tp.historicalPoints
    .map((pt, i) => {
      const yearHint = `FY${new Date().getFullYear() - (tp.historicalPoints.length - i)}`;
      return `
    <div class="tp-hist-row" data-hist-row="${i}">
        <div class="tp-hist-field tp-hist-field--label">
            <span class="tp-hist-field__lbl">Year</span>
            <input data-hist-label="${i}" value="${pt.label}" placeholder="${yearHint}" class="brutal-field__input--no-prefix" />
        </div>
        <div class="tp-hist-field">
            <span class="tp-hist-field__lbl">ARR / Revenue</span>
            <div class="brutal-field__input-wrap">
                <span class="brutal-field__prefix">${tp.currencySymbol}</span>
                <input type="number" data-hist-arr="${i}" value="${pt.arr || ''}" placeholder="0" min="0" inputmode="numeric" />
            </div>
        </div>
        <div class="tp-hist-field">
            <span class="tp-hist-field__lbl">Total annual tech spend</span>
            <div class="brutal-field__input-wrap">
                <span class="brutal-field__prefix">${tp.currencySymbol}</span>
                <input type="number" data-hist-tech="${i}" value="${pt.totalTechSpend || ''}" placeholder="0" min="0" inputmode="numeric" />
            </div>
        </div>
        <button class="tp-hist-remove" data-hist-remove="${i}" type="button" title="Remove year">&times;</button>
    </div>`;
    })
    .join('');

  if (addBtn) addBtn.disabled = tp.historicalPoints.length >= MAX_HISTORICAL;

  container.querySelectorAll('input').forEach((inp) => {
    inp.addEventListener('input', () => {
      syncHistFromDOM();
      updateAll();
    });
  });

  container.querySelectorAll('[data-hist-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn as HTMLElement).dataset.histRemove!, 10);
      tp.historicalPoints.splice(idx, 1);
      renderHistRows(updateAll);
      updateAll();
    });
  });
}

export function syncHistFromDOM() {
  tp.historicalPoints.forEach((pt, i) => {
    const labelEl = document.querySelector(`[data-hist-label="${i}"]`) as HTMLInputElement | null;
    const arrEl = document.querySelector(`[data-hist-arr="${i}"]`) as HTMLInputElement | null;
    const techEl = document.querySelector(`[data-hist-tech="${i}"]`) as HTMLInputElement | null;
    if (labelEl) pt.label = labelEl.value;
    if (arrEl) pt.arr = parseFloat(arrEl.value) || 0;
    if (techEl) pt.totalTechSpend = parseFloat(techEl.value) || 0;
  });
}

// ─── Deep Dive sum ────────────────────────────────────────
export function sumDeep(updateAll: () => void) {
  const sum = getInput('rdEng') + getInput('rdProd') + getInput('rdTool');
  const el = g('deep-total');
  if (el) el.innerHTML = sum > 0 ? `<span>${fmtD(sum)}</span>` : '\u2014';
  updateAll();
}

// ─── ARR formatting ───────────────────────────────────────
export function formatWithCommas(n: number): string {
  return n.toLocaleString('en-US');
}

export function syncArrChips() {
  const current = getInput('arr');
  document.querySelectorAll<HTMLButtonElement>('[data-arr-val]').forEach((chip) => {
    const chipVal = Number(chip.dataset.arrVal);
    chip.classList.toggle('tp-arr-chip--active', chipVal === current && current > 0);
  });
}

// ─── Config display sync ──────────────────────────────────
export function updateChipCurrencies() {
  document
    .querySelectorAll<HTMLButtonElement>('.tp-arr-chip[data-arr-val], [data-preset-for]')
    .forEach((chip) => {
      const txt = chip.textContent || '';
      const updated = txt.replace(/^[CA]?\$|^€|^£/, tp.currencySymbol);
      if (updated !== txt) chip.textContent = updated;
    });
}

export function syncInfraPeriodUI() {
  const label = document.querySelector('[data-infra-label]');
  const suf = document.querySelector('[data-infra-suf]');
  const hint = document.querySelector('[data-infra-hint]');
  const monthlyChips = document.querySelector('[data-infra-chips-monthly]') as HTMLElement | null;
  const annualChips = document.querySelector('[data-infra-chips-annual]') as HTMLElement | null;
  if (label)
    label.textContent = tp.infraPeriod === 'monthly' ? 'Monthly cloud spend' : 'Annual cloud spend';
  if (suf) suf.textContent = tp.infraPeriod === 'monthly' ? '/ mo' : '/ yr';
  if (hint)
    hint.textContent =
      tp.infraPeriod === 'monthly'
        ? 'Cloud, data center, CDN, observability, managed services. Auto-converted to annual.'
        : 'Cloud, data center, CDN, observability, managed services. Auto-converted to monthly.';
  if (monthlyChips) monthlyChips.style.display = tp.infraPeriod === 'monthly' ? 'flex' : 'none';
  if (annualChips) annualChips.style.display = tp.infraPeriod === 'annual' ? 'flex' : 'none';
  $$('[data-infra-period]').forEach((b) => {
    b.classList.toggle(
      'tp-seg__btn--active',
      (b as HTMLElement).dataset.infraPeriod === tp.infraPeriod
    );
  });
}

// ─── Input validation ─────────────────────────────────────
export function updateInfraAnnotation() {
  const infra = getInput('infra');
  const annualEl = g('infra-annual');
  const warnEl = g('infra-warn');
  if (annualEl) {
    if (infra > 0) {
      if (tp.infraPeriod === 'monthly') {
        annualEl.textContent = `= ${fmtD(infra * 12)}/yr`;
      } else {
        annualEl.textContent = `= ${fmtD(infra / 12)}/mo`;
      }
      annualEl.style.display = 'block';
    } else {
      annualEl.style.display = 'none';
    }
  }
  if (warnEl) {
    const arr = getInput('arr');
    const annualInfra = tp.infraPeriod === 'monthly' ? infra * 12 : infra;
    if (arr > 0 && infra > 0 && annualInfra > arr * 0.5) {
      warnEl.textContent =
        tp.infraPeriod === 'monthly'
          ? 'This value is monthly. If you entered an annual figure, switch to Annual above.'
          : 'This value is annual. If you entered a monthly figure, switch to Monthly above.';
      warnEl.style.display = 'block';
    } else {
      warnEl.style.display = 'none';
    }
  }
}

export function checkSanity() {
  if (!tp.stageKey) {
    document.querySelectorAll('[data-sanity-warn]').forEach((el) => {
      (el as HTMLElement).style.display = 'none';
    });
    return;
  }
  const config = STAGES[tp.stageKey as Stage];
  const arr = getInput('arr');
  if (!arr || !config) return;

  const totalCeiling = config.zones.hi;
  const checks: Array<{ warnAttr: string; value: number }> = [
    { warnAttr: 'infraPers', value: getInput('infraPers') },
    {
      warnAttr: 'rdOpEx',
      value:
        tp.mode === 'deepdive'
          ? getInput('rdEng') + getInput('rdProd') + getInput('rdTool')
          : getInput('rdOpEx'),
    },
    { warnAttr: 'rdCapEx', value: getInput('rdCapEx') },
  ];

  for (const { warnAttr, value } of checks) {
    const el = document.querySelector(`[data-sanity-warn="${warnAttr}"]`) as HTMLElement | null;
    if (!el) continue;
    const pct = (value / arr) * 100;
    if (value > 0 && pct > totalCeiling) {
      el.textContent = `This category alone exceeds the total technology benchmark ceiling for ${config.label}. Verify the figure is correct.`;
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  }
}

// ─── Build inputs from DOM ────────────────────────────────
export function buildInputs(): TechParInputs | null {
  if (!tp.stageKey) return null;
  const gaapEl = document.querySelector('[data-input="gaapChk"]') as HTMLInputElement | null;
  return {
    arr: getInput('arr'),
    stage: tp.stageKey as TechParInputs['stage'],
    mode: tp.mode,
    capexView: gaapEl?.checked ? 'gaap' : 'cash',
    growthRate: tp.growthRate || 0,
    exitMultiple: getInput('exitMult') || 12,
    infraHosting: tp.infraPeriod === 'annual' ? getInput('infra') / 12 : getInput('infra'),
    infraPersonnel: getInput('infraPers'),
    rdOpEx: getInput('rdOpEx'),
    rdCapEx: getInput('rdCapEx'),
    engFTE: getInput('engFTE'),
    engCost: getInput('rdEng'),
    prodCost: getInput('rdProd'),
    toolingCost: getInput('rdTool'),
  };
}

export function runCompute() {
  const inputs = buildInputs();
  return inputs ? compute(inputs) : null;
}

// ─── State persistence ────────────────────────────────────
export function syncUrlState() {
  const inputs = buildInputs();
  if (inputs) {
    const validHist = tp.historicalPoints.filter((p) => p.arr > 0 || p.totalTechSpend > 0);
    const params = serializeToParams(inputs, validHist.length ? validHist : undefined);
    // Override infraHosting with the raw DOM value — buildInputs() converts
    // annual→monthly for the engine, but the URL must store what the user sees
    // so that hydration doesn't double-convert on reload.
    const rawInfra = getInput('infra');
    if (rawInfra) params.set('h', String(rawInfra));
    if (tp.currencySymbol !== '$') params.set('u', tp.currencySymbol);
    if (tp.infraPeriod !== 'monthly') params.set('b', tp.infraPeriod);
    if (tp.industry !== 'saas') params.set('n', tp.industry);
    const url = `${window.location.pathname}?${params.toString()}`;
    history.replaceState(null, '', url);
    if (tp.saveTimeout) clearTimeout(tp.saveTimeout);
    tp.saveTimeout = setTimeout(() => {
      try {
        localStorage.setItem(LS_KEY, params.toString());
      } catch {
        /* ignore — localStorage unavailable */
      }
    }, 300);
  } else {
    history.replaceState(null, '', window.location.pathname);
  }
}

// ─── Hydrate from URL or localStorage ─────────────────────
export function hydrateFromUrl() {
  let params = new URLSearchParams(window.location.search);

  if (params.toString() === '') {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) params = new URLSearchParams(saved);
    } catch {
      /* ignore — localStorage unavailable */
    }
  }

  if (params.toString() === '') return;

  const state = deserializeFromParams(params);

  const u = params.get('u');
  if (u) {
    tp.currencySymbol = u;
    $$('[data-currency]').forEach((b) => {
      b.classList.toggle('tp-seg__btn--active', (b as HTMLElement).dataset.currency === u);
    });
    document.querySelectorAll('.brutal-field__prefix').forEach((pre) => {
      pre.textContent = tp.currencySymbol;
    });
    updateChipCurrencies();
  }

  const b = params.get('b');
  if (b === 'annual') {
    tp.infraPeriod = 'annual';
    syncInfraPeriodUI();
  }

  const n = params.get('n');
  if (n && ['saas', 'fintech', 'marketplace', 'infra_hw', 'other'].includes(n)) {
    tp.industry = n as Industry;
    $$('[data-industry]').forEach((btn) => {
      btn.classList.toggle(
        'tp-seg__btn--active',
        (btn as HTMLElement).dataset.industry === tp.industry
      );
    });
  }

  if (state.stage) {
    tp.stageKey = state.stage;
    $$('.brutal-option-card[data-stage]').forEach((c) => {
      c.classList.toggle(
        'brutal-option-card--selected',
        (c as HTMLElement).dataset.stage === tp.stageKey
      );
    });
  }

  if (state.growthRate !== undefined) {
    tp.growthRate = state.growthRate;
    $$('[data-growth]').forEach((b) => {
      b.classList.toggle(
        'tp-seg__btn--active',
        parseInt((b as HTMLElement).dataset.growth || '0', 10) === tp.growthRate
      );
    });
    const gc = document.getElementById('tp-growth-custom') as HTMLInputElement | null;
    if (gc) gc.value = String(tp.growthRate);
  }

  if (state.mode) {
    tp.mode = state.mode;
    $$('[data-mode]').forEach((b) => {
      b.classList.toggle('tp-seg__btn--active', (b as HTMLElement).dataset.mode === tp.mode);
    });
    const rdQuick = g('rd-quick');
    const rdDeep = g('rd-deep');
    if (rdQuick) rdQuick.style.display = tp.mode === 'quick' ? 'block' : 'none';
    if (rdDeep) rdDeep.classList.toggle('tp-deep-wrap--on', tp.mode === 'deepdive');
  }

  if (state.capexView) {
    const gaapEl = document.querySelector('[data-input="gaapChk"]') as HTMLInputElement | null;
    if (gaapEl) gaapEl.checked = state.capexView === 'gaap';
  }

  const setInput = (name: string, val: number | undefined) => {
    if (val === undefined) return;
    const el = document.querySelector(`[data-input="${name}"]`) as HTMLInputElement | null;
    if (el) el.value = String(val);
  };

  if (state.arr) {
    const arrEl = document.getElementById('tp-arr') as HTMLInputElement | null;
    if (arrEl) arrEl.value = state.arr.toLocaleString('en-US');
  }

  setInput('exitMult', state.exitMultiple);
  setInput('infra', state.infraHosting);
  setInput('infraPers', state.infraPersonnel);
  setInput('rdOpEx', state.rdOpEx);
  setInput('rdCapEx', state.rdCapEx);
  setInput('engFTE', state.engFTE);
  setInput('rdEng', state.engCost);
  setInput('rdProd', state.prodCost);
  setInput('rdTool', state.toolingCost);

  if (state.historical?.length) {
    tp.historicalPoints = state.historical;
    // renderHistRows is called by the orchestrator after hydration
  }
}
