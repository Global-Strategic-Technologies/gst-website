/**
 * TechPar UI — DOM helpers, formatting, tab navigation, input validation,
 * and UI-sync utilities.
 */
import { pageLang } from '../tool-strings';
import { zoneColorVar, SUMMARY_TEXT_EN } from '../../utils/techpar-engine';
import type {
  TechParInputs,
  TechParResult,
  Stage,
  Zone,
  SummaryText,
} from '../../utils/techpar-engine';
import { STAGES } from '../../data/techpar/stages';
import { tp, MAX_HISTORICAL, MAX_SCENARIOS } from './state';
import { compute } from '../../utils/techpar-engine';
import { copyWithFeedback } from '../../utils/copy-feedback';
import { trackEvent } from '../../utils/analytics';
import {
  serializeToParams,
  deserializeFromParams,
  buildSummaryText,
} from '../../utils/techpar-engine';
import type { Industry } from '../../data/techpar/industry-notes';
import { LS_KEY } from './state';
import {
  CURRENCY_SYMBOL,
  DEFAULT_CURRENCY,
  formatMoneyChip,
  formatMoneyShort,
  parseCurrencyParam,
} from '../../i18n/currency';
import type { Currency } from '../../i18n/currency';
import { escapeHtml } from '../../utils/escape-html';
import { s, hasString } from './strings';
import { formatNumber } from '../../i18n/formatters';
import {
  categoryKeyOf,
  formatArrInput,
  formatFixed,
  formatPct,
  formatPlain,
  parseArrInput,
} from './logic';

// ─── DOM query helpers ────────────────────────────────────
export const $$ = (sel: string) => document.querySelectorAll(sel);
export const g = (attr: string) => document.querySelector(`[data-${attr}]`) as HTMLElement | null;

/** Sync aria-checked on a radiogroup: set one button active, rest inactive. */
export function syncRadioGroup(selector: string, active: Element): void {
  $$(selector).forEach((b) => {
    const isActive = b === active;
    b.classList.toggle('tp-seg__btn--active', isActive);
    b.setAttribute('aria-checked', String(isActive));
  });
}

export function getInput(name: string): number {
  const el = document.querySelector(`[data-input="${name}"]`) as HTMLInputElement | null;
  // ARR is the one text field, shown with locale grouping (`1.000.000` in
  // es/pt-BR): strip every separator. The rest are type="number", whose
  // `.value` is always dot-decimal, so they keep parseFloat.
  if (name === 'arr') return parseArrInput(el?.value);
  const raw = el?.value?.replace(/,/g, '') || '';
  return parseFloat(raw) || 0;
}

export function getStyle(varName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

/**
 * The chart font family, read from the design system rather than named here.
 *
 * Chart.js takes a font family as a plain string, so it cannot use `var()` — it
 * has to be resolved at call time. The literal fallback exists only for the case
 * where the custom property reads empty (a detached document, or a canvas built
 * before the stylesheet lands), and it must not be a bare generic: BL-144 pinned
 * the brand face precisely so that no surface silently renders in an OS-chosen
 * one. Charts previously fell back to `'Helvetica Neue', Arial, sans-serif`,
 * which stopped being the site's sans when the token collapsed onto the mono.
 *
 * The guard in tests/integration/font-token-pin.test.ts covers Chart.js's
 * `family:` key as well as CSS `font-family`, so a literal reintroduced here
 * fails the build.
 */
export function chartFontFamily(): string {
  return getStyle('--font-family-mono') || getStyle('--font-family') || CHART_FONT_FALLBACK;
}

/** Named so the guard can find it in one place instead of at four call sites. */
const CHART_FONT_FALLBACK = "'GST Mono Fallback', 'GST Mono Fallback WD', ui-monospace, monospace";

/** The symbol for the selected display currency (allowlisted — see i18n/currency). */
export function currencySymbol(): string {
  return CURRENCY_SYMBOL[tp.currency];
}

/** Short money in the selected display currency and the page's number format. */
export function fmtD(n: number): string {
  return formatMoneyShort(n, tp.currency, pageLang());
}

/** A percentage in the page's number format (`formatPercent`, localized). */
export function fmtPct(n: number, decimals = 1): string {
  return formatPct(n, pageLang(), decimals);
}

/** A fixed-decimal number (no %) in the page's number format. */
export function fmtNum(n: number, decimals: number): string {
  return formatFixed(n, pageLang(), decimals);
}

/** A plain number such as an exit multiple, in the page's number format. */
export function fmtPlain(n: number): string {
  return formatPlain(n, pageLang());
}

/** Zone display name from the catalog (the engine's `zoneLabel`, translated). */
export function zoneName(zone: Zone): string {
  return s(`zone.${zone}`);
}

/** Stage display name: the island's when it carries one, else STAGES' English. */
export function stageLabel(key: string): string {
  const k = `stage.${key}.label`;
  return hasString(k) ? s(k) : (STAGES[key as Stage]?.label ?? key);
}

/** Category display name for an engine category label (a `CATEGORY_LABELS` value). */
export function categoryName(label: string): string {
  const key = categoryKeyOf(label);
  return key ? s(`category.${key}`) : label;
}

/** Select a display currency and repaint everything that shows its symbol. */
export function applyCurrency(code: Currency): void {
  tp.currency = code;
  $$('[data-currency]').forEach((b) => {
    const isActive = (b as HTMLElement).dataset.currency === code;
    b.classList.toggle('tp-seg__btn--active', isActive);
    b.setAttribute('aria-checked', String(isActive));
  });
  document.querySelectorAll('.brutal-field__prefix').forEach((pre) => {
    pre.textContent = currencySymbol();
  });
  updateChipCurrencies();
}

// ─── Tab navigation ───────────────────────────────────────
export function goTab(
  tab: string,
  deps: {
    runCompute: () => TechParResult | null;
    renderTrajectory: (r: TechParResult) => void | Promise<void>;
  }
) {
  $$('.tool-tab').forEach((t) => {
    t.classList.remove('tool-tab--active');
    t.setAttribute('aria-selected', 'false');
  });
  $$('.tp-panel').forEach((p) => p.classList.remove('tp-panel--active'));
  const activeTab = document.querySelector(`.tool-tab[data-tab="${tab}"]`);
  activeTab?.classList.add('tool-tab--active');
  activeTab?.setAttribute('aria-selected', 'true');
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
  copyWithFeedback(window.location.href, btn, {
    copiedClass: 'brutal-btn--copied',
    label: s('js.copied'),
  });
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
    validHist.length ? validHist : undefined,
    {
      money: fmtD,
      pct: (n: number) => fmtPct(n),
      num: (n: number) =>
        formatNumber(n, pageLang(), { maximumFractionDigits: 2, useGrouping: false }),
      text: Object.fromEntries(
        Object.keys(SUMMARY_TEXT_EN).map((k) => [k, s(`summary.${k}`)])
      ) as SummaryText,
      stageLabel: stageLabel(inputs.stage),
      zoneName,
      categoryName,
    }
  );
  copyWithFeedback(text, btn, { copiedClass: 'brutal-btn--copied', label: s('js.copied') });
}

// ─── Export PDF ───────────────────────────────────────────
export function exportPdf(deps: {
  runCompute: () => TechParResult | null;
  renderTrajectory: (r: TechParResult) => void | Promise<void>;
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
  if (barLabel) barLabel.textContent = s('js.baseline.label', { pct: fmtPct(result.totalTechPct) });
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
  tp.scenarios.push({
    name: s('js.scenario.name', { n: tp.scenarios.length + 1 }),
    inputs,
    result,
  });
  updateAll();
}

export function removeScenario(index: number, updateAll: () => void) {
  tp.scenarios.splice(index, 1);
  tp.scenarios.forEach((sc, i) => {
    sc.name = s('js.scenario.name', { n: i + 1 });
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
    .map((sc, i) => {
      const col = getStyle(zoneColorVar(sc.result.zone));
      return `<span class="tp-scenario-chip" style="border-left:3px solid ${col}"><span class="tp-zone-dot" style="background:${col}"></span>${escapeHtml(sc.name)}: ${fmtPct(sc.result.totalTechPct)} <span class="tp-scenario-chip__zone" style="color:${col}">${escapeHtml(zoneName(sc.result.zone))}</span><button class="tp-scenario-chip__remove" data-remove-scenario="${i}" type="button">&times;</button></span>`;
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
      label: s('js.scenario.row.totalPct'),
      current: fmtPct(r.totalTechPct),
      values: tp.scenarios.map((sc) => fmtPct(sc.result.totalTechPct)),
    },
    {
      label: s('js.scenario.row.zone'),
      current: zoneName(r.zone),
      values: tp.scenarios.map((sc) => zoneName(sc.result.zone)),
    },
    {
      label: s('js.scenario.row.annualCost'),
      current: fmtD(r.total),
      values: tp.scenarios.map((sc) => fmtD(sc.result.total)),
    },
    {
      label: s('js.scenario.row.gap36'),
      current: fmtD(r.gap.cumulative36),
      values: tp.scenarios.map((sc) => fmtD(sc.result.gap.cumulative36)),
    },
  ];

  let html = `<table><thead><tr><th></th><th>${escapeHtml(s('js.scenario.current'))}</th>`;
  tp.scenarios.forEach((sc) => {
    html += `<th>${escapeHtml(sc.name)}</th>`;
  });
  html += '</tr></thead><tbody>';
  rows.forEach((row) => {
    html += `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.current)}</td>`;
    row.values.forEach((v) => {
      html += `<td>${escapeHtml(v)}</td>`;
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
    btn.textContent = s('js.reset.idle');
    btn.classList.remove('tp-toolbar__reset--confirming');
    delete btn.dataset.confirming;
    resetAll();
    return;
  }
  btn.dataset.confirming = '1';
  btn.textContent = s('js.reset.confirm');
  btn.classList.add('tp-toolbar__reset--confirming');
  tp.resetTimeout = setTimeout(() => {
    btn.textContent = s('js.reset.idle');
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
  document.querySelectorAll<HTMLInputElement>('.brutal-tool-shell--fluid input').forEach((el) => {
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
  const baseBar = g('baseline-bar');
  if (baseBar) baseBar.style.display = 'none';
  const setBtn = document.querySelector('[data-action="set-baseline"]') as HTMLElement | null;
  if (setBtn) setBtn.style.display = '';
  applyCurrency(DEFAULT_CURRENCY);

  tp.historicalPoints = [];
  deps.renderHistRows();

  tp.infraPeriod = 'monthly';
  syncInfraPeriodUI();

  tp.industry = 'saas';
  $$('[data-industry]').forEach((b) => {
    const isActive = (b as HTMLElement).dataset.industry === 'saas';
    b.classList.toggle('tp-seg__btn--active', isActive);
    b.setAttribute('aria-checked', String(isActive));
  });

  $$('.brutal-option-card[data-stage]').forEach((c) => {
    c.classList.remove('brutal-option-card--selected');
    c.setAttribute('aria-checked', 'false');
  });
  $$('[data-growth]').forEach((b) => {
    b.classList.remove('tp-seg__btn--active');
    b.setAttribute('aria-checked', 'false');
  });
  const growthCustomEl = document.getElementById('tp-growth-custom') as HTMLInputElement | null;
  if (growthCustomEl) growthCustomEl.value = '';

  $$('[data-mode]').forEach((b) => {
    b.classList.remove('tp-seg__btn--active');
    b.setAttribute('aria-checked', 'false');
  });
  const quickBtn = document.querySelector('[data-mode="quick"]');
  quickBtn?.classList.add('tp-seg__btn--active');
  quickBtn?.setAttribute('aria-checked', 'true');
  const rdQuick = g('rd-quick');
  const rdDeep = g('rd-deep');
  if (rdQuick) rdQuick.style.display = 'block';
  if (rdDeep) rdDeep.classList.remove('tp-deep-wrap--on');

  const deepTotal = g('deep-total');
  if (deepTotal) deepTotal.innerHTML = '\u2014';

  document.querySelectorAll('.tp-arr-chip').forEach((c) => {
    c.classList.remove('tp-arr-chip--active');
    c.setAttribute('aria-pressed', 'false');
  });

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
      const yearHint = escapeHtml(
        s('js.hist.fyLabel', { year: new Date().getFullYear() - (tp.historicalPoints.length - i) })
      );
      return `
    <div class="tp-hist-row" data-hist-row="${i}">
        <div class="tp-hist-field tp-hist-field--label">
            <span class="tp-hist-field__lbl">${escapeHtml(s('js.hist.year'))}</span>
            <input data-hist-label="${i}" value="${escapeHtml(pt.label)}" placeholder="${yearHint}" class="brutal-field__input--no-prefix" />
        </div>
        <div class="tp-hist-field">
            <span class="tp-hist-field__lbl">${escapeHtml(s('js.hist.arr'))}</span>
            <div class="brutal-field__input-wrap">
                <span class="brutal-field__prefix">${currencySymbol()}</span>
                <input type="number" data-hist-arr="${i}" value="${pt.arr || ''}" placeholder="0" min="0" inputmode="numeric" />
            </div>
        </div>
        <div class="tp-hist-field">
            <span class="tp-hist-field__lbl">${escapeHtml(s('js.hist.tech'))}</span>
            <div class="brutal-field__input-wrap">
                <span class="brutal-field__prefix">${currencySymbol()}</span>
                <input type="number" data-hist-tech="${i}" value="${pt.totalTechSpend || ''}" placeholder="0" min="0" inputmode="numeric" />
            </div>
        </div>
        <button class="tp-hist-remove" data-hist-remove="${i}" type="button" title="${escapeHtml(s('js.hist.remove'))}">&times;</button>
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
/** ARR for the `#tp-arr` text field, grouped in the page's number format. */
export function formatWithCommas(n: number): string {
  return formatArrInput(n, pageLang());
}

export function syncArrChips() {
  const current = getInput('arr');
  document.querySelectorAll<HTMLButtonElement>('[data-arr-val]').forEach((chip) => {
    const chipVal = Number(chip.dataset.arrVal);
    const isActive = chipVal === current && current > 0;
    chip.classList.toggle('tp-arr-chip--active', isActive);
    chip.setAttribute('aria-pressed', String(isActive));
  });
}

// BL-042: chip-active paint helper used by hydrateFromUrl's setInput(). The
// per-control sync (chip click + input typing) lives inside <PresetInput>; this
// helper is the only direct caller path remaining and avoids fanning out via
// 'input' events when restoring deeplinked URL state.
export function paintCostChips(inputName: string): void {
  const input = document.querySelector<HTMLInputElement>(`[data-input="${inputName}"]`);
  const current = input ? parseFloat(input.value.replace(/,/g, '')) || 0 : 0;
  document
    .querySelectorAll<HTMLButtonElement>(`[data-preset-for="${inputName}"]`)
    .forEach((chip) => {
      const isActive = Number(chip.dataset.presetVal) === current && current > 0;
      chip.classList.toggle('tp-arr-chip--active', isActive);
      chip.setAttribute('aria-pressed', String(isActive));
    });
}

// ─── Config display sync ──────────────────────────────────
/** Repaint every money chip's label from its value in the selected currency.
 *  Money chips carry `data-money` (ARR chips and the cost presets); exit-multiple
 *  and FTE chips do not, so they are never touched. */
export function updateChipCurrencies() {
  document.querySelectorAll<HTMLElement>('[data-money]').forEach((chip) => {
    const value = Number(chip.dataset.arrVal ?? chip.dataset.presetVal);
    if (value > 0) chip.textContent = formatMoneyChip(value, tp.currency);
  });
}

export function syncInfraPeriodUI() {
  const label = document.querySelector('[data-infra-label]');
  const suf = document.querySelector('[data-infra-suf]');
  const hint = document.querySelector('[data-infra-hint]');
  const monthlyChips = document.querySelector('[data-infra-chips-monthly]') as HTMLElement | null;
  const annualChips = document.querySelector('[data-infra-chips-annual]') as HTMLElement | null;
  if (label) label.textContent = s(`js.infra.label.${tp.infraPeriod}`);
  if (suf) suf.textContent = s(`js.infra.suffix.${tp.infraPeriod}`);
  if (hint) hint.textContent = s(`js.infra.hint.${tp.infraPeriod}`);
  if (monthlyChips) monthlyChips.style.display = tp.infraPeriod === 'monthly' ? 'flex' : 'none';
  if (annualChips) annualChips.style.display = tp.infraPeriod === 'annual' ? 'flex' : 'none';
  $$('[data-infra-period]').forEach((b) => {
    const isActive = (b as HTMLElement).dataset.infraPeriod === tp.infraPeriod;
    b.classList.toggle('tp-seg__btn--active', isActive);
    b.setAttribute('aria-checked', String(isActive));
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
        annualEl.textContent = s('js.infra.perYear', { amount: fmtD(infra * 12) });
      } else {
        annualEl.textContent = s('js.infra.perMonth', { amount: fmtD(infra / 12) });
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
      warnEl.textContent = s(`js.infra.warn.${tp.infraPeriod}`);
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
      el.textContent = s('js.sanity.warn', { stage: stageLabel(config.key) });
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
    // The exit-multiple field is only shown for PE / Enterprise stages (see the
    // `showExit` toggle in `index.ts`). On any other stage the field is hidden,
    // so a value entered while on PE/Enterprise must not silently persist into
    // results or URL state (`syncUrlState` serializes this output). Force the
    // default unless the stage actually exposes the field.
    exitMultiple:
      tp.stageKey === 'pe' || tp.stageKey === 'enterprise' ? getInput('exitMult') || 12 : 12,
    // BL-031.95: schema field is `infraHostingAnnual` (always annual). UI's
    // monthly mode multiplies by 12 here; annual mode passes through.
    infraHostingAnnual: tp.infraPeriod === 'monthly' ? getInput('infra') * 12 : getInput('infra'),
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
    // Always written, as a code: a missing `u` means USD (every pre-codes link
    // and saved state did), so omitting the default would be ambiguous.
    params.set('u', tp.currency);
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

  // Allowlisted: `u` is painted into the page, so only a known code (or a
  // pre-codes legacy symbol) is accepted; anything else is USD.
  applyCurrency(parseCurrencyParam(params.get('u')));

  const b = params.get('b');
  if (b === 'annual') {
    tp.infraPeriod = 'annual';
    syncInfraPeriodUI();
  }

  const n = params.get('n');
  if (n && ['saas', 'fintech', 'marketplace', 'infra_hw', 'other'].includes(n)) {
    tp.industry = n as Industry;
    $$('[data-industry]').forEach((btn) => {
      const isActive = (btn as HTMLElement).dataset.industry === tp.industry;
      btn.classList.toggle('tp-seg__btn--active', isActive);
      btn.setAttribute('aria-checked', String(isActive));
    });
  }

  if (state.stage) {
    tp.stageKey = state.stage;
    $$('.brutal-option-card[data-stage]').forEach((c) => {
      const isActive = (c as HTMLElement).dataset.stage === tp.stageKey;
      c.classList.toggle('brutal-option-card--selected', isActive);
      c.setAttribute('aria-checked', String(isActive));
    });
  }

  if (state.growthRate !== undefined) {
    tp.growthRate = state.growthRate;
    $$('[data-growth]').forEach((b) => {
      const isActive = parseInt((b as HTMLElement).dataset.growth || '0', 10) === tp.growthRate;
      b.classList.toggle('tp-seg__btn--active', isActive);
      b.setAttribute('aria-checked', String(isActive));
    });
    const gc = document.getElementById('tp-growth-custom') as HTMLInputElement | null;
    if (gc) gc.value = String(tp.growthRate);
  }

  if (state.mode) {
    tp.mode = state.mode;
    $$('[data-mode]').forEach((b) => {
      const isActive = (b as HTMLElement).dataset.mode === tp.mode;
      b.classList.toggle('tp-seg__btn--active', isActive);
      b.setAttribute('aria-checked', String(isActive));
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
    if (!el) return;
    el.value = String(val);
    // BL-042: paint matching chip directly. We deliberately do NOT dispatch
    // an 'input' event here — that would fan out to ~9 updateAll() listeners
    // on every hydrated field. updateAll() is invoked once at the end of
    // hydration anyway.
    paintCostChips(name);
  };

  if (state.arr) {
    const arrEl = document.getElementById('tp-arr') as HTMLInputElement | null;
    if (arrEl) arrEl.value = formatWithCommas(state.arr);
  }

  setInput('exitMult', state.exitMultiple);
  // BL-031.95: state.infraHostingAnnual carries the raw DOM value (URL `?h=`
  // is overridden in syncUrlState to preserve what the user typed). Restore
  // as-is; period flag has already been applied by `tp.infraPeriod`
  // hydration above.
  setInput('infra', state.infraHostingAnnual);
  setInput('infraPers', state.infraPersonnel);
  setInput('rdOpEx', state.rdOpEx);
  setInput('rdCapEx', state.rdCapEx);
  setInput('engFTE', state.engFTE);
  setInput('rdEng', state.engCost);
  setInput('rdProd', state.prodCost);
  setInput('rdTool', state.toolingCost);

  if (state.historical?.length) {
    // The engine names an unlabelled year `Y-{n}` in English; show the
    // catalog's form instead (only when the URL carried no label of its own).
    state.historical.forEach((pt) => {
      const m = /^Y-(\d+)$/.exec(pt.label);
      if (m && !params.get(`y${m[1]}l`)) pt.label = s('js.hist.defaultLabel', { n: m[1] });
    });
    tp.historicalPoints = state.historical;
    // renderHistRows is called by the orchestrator after hydration
  }
}
