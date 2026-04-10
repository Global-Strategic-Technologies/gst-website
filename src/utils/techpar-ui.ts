import { Chart, registerables } from 'chart.js';
import type { ChartDataset, TooltipItem } from 'chart.js';
import { compute, buildTrajectory, buildHistoricalTrajectory, zoneColorVar, zoneBgVar, zoneLabel, kpiClass, formatDollars, formatPercent, serializeToParams, deserializeFromParams, buildSummaryText } from './techpar-engine';
import type { TechParInputs, TechParResult, StageConfig, HistoricalPoint, Stage } from './techpar-engine';
import { STAGES } from '../data/techpar/stages';
import { SIGNAL_COPY } from '../data/techpar/signal-copy';
import { INDUSTRY_NOTES } from '../data/techpar/industry-notes';
import type { Industry } from '../data/techpar/industry-notes';
import { RECOMMENDATIONS } from '../data/techpar/recommendations';
import { copyWithFeedback } from './copy-feedback';

Chart.register(...registerables);

// ─── State ─────────────────────────────────────────────────
let stageKey: string | null = null;
let growthRate: number | null = null;
let mode: 'quick' | 'deepdive' = 'quick';
let trajChart: Chart | null = null;
let baselineResult: TechParResult | null = null;
let baselineInputs: TechParInputs | null = null;
let currencySymbol = '$';
let infraPeriod: 'monthly' | 'annual' = 'monthly';
let industry: Industry = 'saas';
let historicalPoints: HistoricalPoint[] = [];
const MAX_HISTORICAL = 2;

// ─── Reset confirmation ──────────────────────────────────
let resetTimeout: ReturnType<typeof setTimeout> | null = null;

// ─── Scenarios ────────────────────────────────────────────
interface SavedScenario { name: string; inputs: TechParInputs; result: TechParResult; }
let scenarios: SavedScenario[] = [];
const MAX_SCENARIOS = 3;

// ─── DOM helpers ───────────────────────────────────────────
const $$ = (sel: string) => document.querySelectorAll(sel);
const g = (attr: string) => document.querySelector(`[data-${attr}]`) as HTMLElement | null;

function getInput(name: string): number {
    const el = document.querySelector(`[data-input="${name}"]`) as HTMLInputElement | null;
    const raw = el?.value?.replace(/,/g, '') || '';
    return parseFloat(raw) || 0;
}

function getStyle(varName: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

/** Currency-aware formatDollars wrapper */
function fmtD(n: number): string {
    return formatDollars(n, currencySymbol);
}

// ─── Tab navigation ────────────────────────────────────────
function goTab(tab: string) {
    $$('.tp-tab').forEach(t => t.classList.remove('tp-tab--active'));
    $$('.tp-panel').forEach(p => p.classList.remove('tp-panel--active'));
    document.querySelector(`.tp-tab[data-tab="${tab}"]`)?.classList.add('tp-tab--active');
    document.querySelector(`[data-panel="${tab}"]`)?.classList.add('tp-panel--active');
    document.querySelector('[data-tab-bar]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (tab === 'trajectory') {
        const result = runCompute();
        if (result) renderTrajectory(result);
    }
}

// Tab button clicks
$$('.tp-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        goTab((btn as HTMLElement).dataset.tab || 'profile');
    });
});

// Navigation action buttons
document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
        const action = (btn as HTMLElement).dataset.action;
        if (action === 'go-costs') goTab('costs');
        else if (action === 'go-profile') goTab('profile');
        else if (action === 'go-analysis') goTab('analysis');
        else if (action === 'go-trajectory') goTab('trajectory');
        else if (action === 'reset') handleReset(btn as HTMLButtonElement);
        else if (action === 'copy-link') copyLink(btn as HTMLButtonElement);
        else if (action === 'copy-summary') copySummary(btn as HTMLButtonElement);
        else if (action === 'export-pdf') exportPdf();
        else if (action === 'set-baseline') setBaseline();
        else if (action === 'clear-baseline') clearBaseline();
        else if (action === 'save-scenario') saveScenario();
    });
});

// ─── Copy link ──────────────────────────────────────────────
function copyLink(btn: HTMLButtonElement) {
    copyWithFeedback(window.location.href, btn, { copiedClass: 'tp-btn-share--copied' });
}

// ─── Copy summary ───────────────────────────────────────────
function copySummary(btn: HTMLButtonElement) {
    const inputs = buildInputs();
    if (!inputs) return;
    const result = compute(inputs);
    if (!result) return;
    const validHist = historicalPoints.filter(p => p.arr > 0 && p.totalTechSpend > 0);
    const text = buildSummaryText(inputs, result, window.location.href, validHist.length ? validHist : undefined);
    copyWithFeedback(text, btn, { copiedClass: 'tp-btn-share--copied' });
}

// ─── Export PDF ─────────────────────────────────────────────
function exportPdf() {
    const result = runCompute();

    // Temporarily show trajectory panel so Chart.js can measure the canvas
    const trajPanel = document.querySelector('[data-panel="trajectory"]') as HTMLElement | null;
    const trajContent = g('traj-content');
    if (trajPanel) trajPanel.style.display = 'block';
    if (trajContent) trajContent.style.display = 'block';

    // Render chart into the now-visible canvas
    if (result) renderTrajectory(result);

    // Force methodology <details> open for print
    const methodology = document.querySelector('[data-methodology]') as HTMLDetailsElement | null;
    const wasOpen = methodology?.open ?? false;
    if (methodology) methodology.open = true;

    // Let the browser complete the layout pass before printing
    requestAnimationFrame(() => {
        window.print();

        // Restore state after print dialog closes
        if (trajPanel) trajPanel.style.display = '';
        if (trajContent) trajContent.style.display = '';
        if (methodology && !wasOpen) methodology.open = false;
    });
}

// ─── Baseline ───────────────────────────────────────────────
function setBaseline() {
    const inputs = buildInputs();
    if (!inputs) return;
    const result = compute(inputs);
    if (!result) return;
    baselineResult = result;
    baselineInputs = inputs;
    const barLabel = document.querySelector('.tp-baseline-bar__label');
    if (barLabel) barLabel.textContent = `Baseline: ${formatPercent(result.totalTechPct)}`;
    const bar = g('baseline-bar');
    if (bar) bar.style.display = 'flex';
    const setBtn = document.querySelector('[data-action="set-baseline"]') as HTMLElement | null;
    if (setBtn) setBtn.style.display = 'none';
    updateAll();
}

function clearBaseline() {
    baselineResult = null;
    baselineInputs = null;
    const bar = g('baseline-bar');
    if (bar) bar.style.display = 'none';
    const setBtn = document.querySelector('[data-action="set-baseline"]') as HTMLElement | null;
    if (setBtn) setBtn.style.display = '';
    updateAll();
}

// ─── Scenarios ──────────────────────────────────────────────
function saveScenario() {
    const inputs = buildInputs();
    if (!inputs) return;
    const result = compute(inputs);
    if (!result) return;
    if (scenarios.length >= MAX_SCENARIOS) scenarios.shift();
    scenarios.push({ name: `Scenario ${scenarios.length + 1}`, inputs, result });
    updateAll();
}

function removeScenario(index: number) {
    scenarios.splice(index, 1);
    // Rename remaining scenarios sequentially
    scenarios.forEach((s, i) => { s.name = `Scenario ${i + 1}`; });
    updateAll();
}

function renderScenarios(r: TechParResult) {
    const list = g('scenario-list');
    const chips = g('scenario-chips');
    const compare = g('scenario-compare');
    const table = g('scenario-table');
    const saveBtn = document.querySelector('[data-action="save-scenario"]') as HTMLButtonElement | null;

    if (saveBtn) saveBtn.disabled = scenarios.length >= MAX_SCENARIOS;

    if (!list || !chips || !compare || !table) return;

    if (scenarios.length === 0) {
        list.style.display = 'none';
        compare.style.display = 'none';
        return;
    }

    list.style.display = 'block';
    chips.innerHTML = scenarios.map((s, i) => {
        const col = getStyle(zoneColorVar(s.result.zone));
        return `<span class="tp-scenario-chip" style="border-left:3px solid ${col}"><span class="tp-zone-dot" style="background:${col}"></span>${s.name}: ${formatPercent(s.result.totalTechPct)} <span class="tp-scenario-chip__zone" style="color:${col}">${zoneLabel(s.result.zone)}</span><button class="tp-scenario-chip__remove" data-remove-scenario="${i}" type="button">&times;</button></span>`;
    }).join('');

    chips.querySelectorAll('[data-remove-scenario]').forEach(btn => {
        btn.addEventListener('click', () => {
            removeScenario(parseInt((btn as HTMLElement).dataset.removeScenario!, 10));
        });
    });

    compare.style.display = 'block';
    const rows = [
        { label: 'Total %', current: formatPercent(r.totalTechPct), values: scenarios.map(s => formatPercent(s.result.totalTechPct)) },
        { label: 'Zone', current: zoneLabel(r.zone), values: scenarios.map(s => zoneLabel(s.result.zone)) },
        { label: 'Annual cost', current: fmtD(r.total), values: scenarios.map(s => fmtD(s.result.total)) },
        { label: '36-mo gap', current: fmtD(r.gap.cumulative36), values: scenarios.map(s => fmtD(s.result.gap.cumulative36)) },
    ];

    let html = '<table><thead><tr><th></th><th>Current</th>';
    scenarios.forEach(s => { html += `<th>${s.name}</th>`; });
    html += '</tr></thead><tbody>';
    rows.forEach(row => {
        html += `<tr><td>${row.label}</td><td>${row.current}</td>`;
        row.values.forEach(v => { html += `<td>${v}</td>`; });
        html += '</tr>';
    });
    html += '</tbody></table>';
    table.innerHTML = html;
}

// ─── Reset ──────────────────────────────────────────────────
function handleReset(btn: HTMLButtonElement) {
    if (btn.dataset.confirming) {
        if (resetTimeout) { clearTimeout(resetTimeout); resetTimeout = null; }
        btn.textContent = 'Reset all inputs';
        btn.classList.remove('tp-toolbar__reset--confirming');
        delete btn.dataset.confirming;
        resetAll();
        return;
    }
    btn.dataset.confirming = '1';
    btn.textContent = 'Click again to reset';
    btn.classList.add('tp-toolbar__reset--confirming');
    resetTimeout = setTimeout(() => {
        btn.textContent = 'Reset all inputs';
        btn.classList.remove('tp-toolbar__reset--confirming');
        delete btn.dataset.confirming;
        resetTimeout = null;
    }, 3000);
}

function resetAll() {
    // Clear all inputs
    document.querySelectorAll<HTMLInputElement>('.techpar-shell input').forEach(el => {
        if (el.type === 'checkbox') el.checked = false;
        else if (el.dataset.input === 'exitMult') el.value = '12';
        else el.value = '';
    });

    // Reset JS state
    stageKey = null;
    growthRate = null;
    mode = 'quick';
    baselineResult = null;
    baselineInputs = null;
    scenarios = [];
    currencySymbol = '$';
    const baseBar = g('baseline-bar');
    if (baseBar) baseBar.style.display = 'none';
    const setBtn = document.querySelector('[data-action="set-baseline"]') as HTMLElement | null;
    if (setBtn) setBtn.style.display = '';
    // Reset currency selector
    $$('[data-currency]').forEach(b => {
        b.classList.toggle('tp-seg__btn--active', (b as HTMLElement).dataset.currency === '$');
    });
    document.querySelectorAll('.tp-input-pre').forEach(pre => {
        pre.textContent = '$';
    });

    // Reset historical data
    historicalPoints = [];
    renderHistRows();

    // Reset infra period toggle
    infraPeriod = 'monthly';
    syncInfraPeriodUI();

    // Reset industry selector
    industry = 'saas';
    $$('[data-industry]').forEach(b => {
        b.classList.toggle('tp-seg__btn--active', (b as HTMLElement).dataset.industry === 'saas');
    });

    // Reset stage cards — clear all selections
    $$('.tp-stage-card').forEach(c => c.classList.remove('tp-stage-card--active'));

    // Reset growth buttons and custom input — clear all selections
    $$('[data-growth]').forEach(b => b.classList.remove('tp-seg__btn--active'));
    const growthCustomEl = document.getElementById('tp-growth-custom') as HTMLInputElement | null;
    if (growthCustomEl) growthCustomEl.value = '';

    // Reset mode toggle
    $$('[data-mode]').forEach(b => b.classList.remove('tp-seg__btn--active'));
    document.querySelector('[data-mode="quick"]')?.classList.add('tp-seg__btn--active');
    const rdQuick = g('rd-quick');
    const rdDeep = g('rd-deep');
    if (rdQuick) rdQuick.style.display = 'block';
    if (rdDeep) rdDeep.classList.remove('tp-deep-wrap--on');

    // Reset deep-dive sum
    const deepTotal = g('deep-total');
    if (deepTotal) deepTotal.innerHTML = '\u2014';

    // Clear ARR chip highlights
    document.querySelectorAll('.tp-arr-chip').forEach(c => c.classList.remove('tp-arr-chip--active'));

    // Destroy trajectory chart
    if (trajChart) { trajChart.destroy(); trajChart = null; }

    // Clear URL state and localStorage
    history.replaceState(null, '', window.location.pathname);
    try { localStorage.removeItem(LS_KEY); } catch {}

    // Re-run update and go to profile tab
    updateAll();
    goTab('profile');
}

// ─── Stage selector ────────────────────────────────────────
$$('.tp-stage-card').forEach(card => {
    card.addEventListener('click', () => {
        $$('.tp-stage-card').forEach(c => c.classList.remove('tp-stage-card--active'));
        card.classList.add('tp-stage-card--active');
        stageKey = (card as HTMLElement).dataset.stage || 'series_bc';
        if (trajChart) { trajChart.destroy(); trajChart = null; }
        updateAll();
    });
});

// ─── Growth rate selector ──────────────────────────────────
const growthCustomInput = document.getElementById('tp-growth-custom') as HTMLInputElement | null;
if (growthCustomInput) growthCustomInput.value = growthRate !== null ? String(growthRate) : '';

$$('[data-growth]').forEach(btn => {
    btn.addEventListener('click', () => {
        $$('[data-growth]').forEach(b => b.classList.remove('tp-seg__btn--active'));
        btn.classList.add('tp-seg__btn--active');
        growthRate = parseInt((btn as HTMLElement).dataset.growth || '20', 10);
        if (growthCustomInput) growthCustomInput.value = String(growthRate);
        updateAll();
    });
});

// ─── Growth rate custom input ──────────────────────────────
growthCustomInput?.addEventListener('input', () => {
    const val = parseFloat(growthCustomInput.value);
    if (!isNaN(val) && val > 0) {
        $$('[data-growth]').forEach(b => b.classList.remove('tp-seg__btn--active'));
        growthRate = val;
        updateAll();
    }
});

// ─── Mode toggle ───────────────────────────────────────────
$$('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
        $$('[data-mode]').forEach(b => b.classList.remove('tp-seg__btn--active'));
        btn.classList.add('tp-seg__btn--active');
        mode = ((btn as HTMLElement).dataset.mode || 'quick') as 'quick' | 'deepdive';
        const rdQuick = g('rd-quick');
        const rdDeep = g('rd-deep');
        if (rdQuick) rdQuick.style.display = mode === 'quick' ? 'block' : 'none';
        if (rdDeep) rdDeep.classList.toggle('tp-deep-wrap--on', mode === 'deepdive');
        // Sync deep-dive sum into quick-mode R&D OpEx field when switching back
        if (mode === 'quick') {
            const sum = getInput('rdEng') + getInput('rdProd') + getInput('rdTool');
            if (sum > 0) {
                const rdInput = document.querySelector('[data-input="rdOpEx"]') as HTMLInputElement | null;
                if (rdInput) rdInput.value = String(sum);
            }
        }
        updateAll();
    });
});

// ─── Currency selector ─────────────────────────────────────
/** Update currency symbol shown on all preset chips */
function updateChipCurrencies() {
    document.querySelectorAll<HTMLButtonElement>('.tp-arr-chip[data-arr-val], [data-preset-for]').forEach(chip => {
        const txt = chip.textContent || '';
        const updated = txt.replace(/^[CA]?\$|^€|^£/, currencySymbol);
        if (updated !== txt) chip.textContent = updated;
    });
}

$$('[data-currency]').forEach(btn => {
    btn.addEventListener('click', () => {
        $$('[data-currency]').forEach(b => b.classList.remove('tp-seg__btn--active'));
        btn.classList.add('tp-seg__btn--active');
        currencySymbol = (btn as HTMLElement).dataset.currency || '$';
        // Update input prefix labels
        document.querySelectorAll('.tp-input-pre').forEach(pre => {
            pre.textContent = currencySymbol;
        });
        updateChipCurrencies();
        updateAll();
    });
});

// ─── Infrastructure period toggle ─────────────────────────
function syncInfraPeriodUI() {
    const label = document.querySelector('[data-infra-label]');
    const suf = document.querySelector('[data-infra-suf]');
    const hint = document.querySelector('[data-infra-hint]');
    const monthlyChips = document.querySelector('[data-infra-chips-monthly]') as HTMLElement | null;
    const annualChips = document.querySelector('[data-infra-chips-annual]') as HTMLElement | null;
    if (label) label.textContent = infraPeriod === 'monthly' ? 'Monthly cloud spend' : 'Annual cloud spend';
    if (suf) suf.textContent = infraPeriod === 'monthly' ? '/ mo' : '/ yr';
    if (hint) hint.textContent = infraPeriod === 'monthly'
        ? 'Cloud, data center, CDN, observability, managed services. Auto-converted to annual.'
        : 'Cloud, data center, CDN, observability, managed services. Auto-converted to monthly.';
    if (monthlyChips) monthlyChips.style.display = infraPeriod === 'monthly' ? 'flex' : 'none';
    if (annualChips) annualChips.style.display = infraPeriod === 'annual' ? 'flex' : 'none';
    $$('[data-infra-period]').forEach(b => {
        b.classList.toggle('tp-seg__btn--active', (b as HTMLElement).dataset.infraPeriod === infraPeriod);
    });
}

$$('[data-infra-period]').forEach(btn => {
    btn.addEventListener('click', () => {
        infraPeriod = ((btn as HTMLElement).dataset.infraPeriod || 'monthly') as 'monthly' | 'annual';
        syncInfraPeriodUI();
        updateAll();
    });
});

// ─── Industry selector ──────────────────────────────────────
$$('[data-industry]').forEach(btn => {
    btn.addEventListener('click', () => {
        $$('[data-industry]').forEach(b => b.classList.remove('tp-seg__btn--active'));
        btn.classList.add('tp-seg__btn--active');
        industry = ((btn as HTMLElement).dataset.industry || 'saas') as Industry;
        updateAll();
    });
});

// ─── Historical data ─────────────────────────────────────
function renderHistRows() {
    const container = g('hist-rows');
    const addBtn = document.querySelector('[data-hist-add]') as HTMLButtonElement | null;
    if (!container) return;

    // Rows are ordered oldest-first visually (row 0 = furthest back)
    container.innerHTML = historicalPoints.map((pt, i) => {
        const yearHint = `FY${new Date().getFullYear() - (historicalPoints.length - i)}`;
        return `
        <div class="tp-hist-row" data-hist-row="${i}">
            <div class="tp-hist-field tp-hist-field--label">
                <span class="tp-hist-field__lbl">Year</span>
                <input data-hist-label="${i}" value="${pt.label}" placeholder="${yearHint}" class="tp-input--no-pre" />
            </div>
            <div class="tp-hist-field">
                <span class="tp-hist-field__lbl">ARR / Revenue</span>
                <div class="tp-input-wrap">
                    <span class="tp-input-pre">${currencySymbol}</span>
                    <input type="number" data-hist-arr="${i}" value="${pt.arr || ''}" placeholder="0" min="0" inputmode="numeric" />
                </div>
            </div>
            <div class="tp-hist-field">
                <span class="tp-hist-field__lbl">Total annual tech spend</span>
                <div class="tp-input-wrap">
                    <span class="tp-input-pre">${currencySymbol}</span>
                    <input type="number" data-hist-tech="${i}" value="${pt.totalTechSpend || ''}" placeholder="0" min="0" inputmode="numeric" />
                </div>
            </div>
            <button class="tp-hist-remove" data-hist-remove="${i}" type="button" title="Remove year">&times;</button>
        </div>`;
    }).join('');

    if (addBtn) addBtn.disabled = historicalPoints.length >= MAX_HISTORICAL;

    // Bind input events
    container.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('input', () => {
            syncHistFromDOM();
            updateAll();
        });
    });

    // Bind remove buttons
    container.querySelectorAll('[data-hist-remove]').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt((btn as HTMLElement).dataset.histRemove!, 10);
            historicalPoints.splice(idx, 1);
            renderHistRows();
            updateAll();
        });
    });
}

function syncHistFromDOM() {
    historicalPoints.forEach((pt, i) => {
        const labelEl = document.querySelector(`[data-hist-label="${i}"]`) as HTMLInputElement | null;
        const arrEl = document.querySelector(`[data-hist-arr="${i}"]`) as HTMLInputElement | null;
        const techEl = document.querySelector(`[data-hist-tech="${i}"]`) as HTMLInputElement | null;
        if (labelEl) pt.label = labelEl.value;
        if (arrEl) pt.arr = parseFloat(arrEl.value) || 0;
        if (techEl) pt.totalTechSpend = parseFloat(techEl.value) || 0;
    });
}

document.querySelector('[data-hist-add]')?.addEventListener('click', () => {
    if (historicalPoints.length >= MAX_HISTORICAL) return;
    // Insert oldest year first: if 0 rows exist, add Y-1; if 1 row exists, add Y-2 before it
    const nextYearBack = historicalPoints.length + 1;
    historicalPoints.unshift({ label: `FY${new Date().getFullYear() - nextYearBack}`, arr: 0, totalTechSpend: 0 });
    renderHistRows();
});

// ─── Deep Dive sum ─────────────────────────────────────────
function sumDeep() {
    const sum = getInput('rdEng') + getInput('rdProd') + getInput('rdTool');
    const el = g('deep-total');
    if (el) el.innerHTML = sum > 0 ? `<span>${fmtD(sum)}</span>` : '\u2014';
    updateAll();
}

['rdEng', 'rdProd', 'rdTool'].forEach(name => {
    document.querySelector(`[data-input="${name}"]`)?.addEventListener('input', sumDeep);
});

// ─── All other inputs ──────────────────────────────────────
['infra', 'infraPers', 'rdOpEx', 'rdCapEx', 'engFTE', 'exitMult', 'gaapChk'].forEach(name => {
    const el = document.querySelector(`[data-input="${name}"]`);
    if (el) el.addEventListener(el.getAttribute('type') === 'checkbox' ? 'change' : 'input', updateAll);
});

// ─── ARR: comma formatting + quick-pick chips ─────────────
const arrInput = document.getElementById('tp-arr') as HTMLInputElement | null;
const arrChips = document.querySelectorAll<HTMLButtonElement>('[data-arr-val]');

function formatWithCommas(n: number): string {
    return n.toLocaleString('en-US');
}

function setArrValue(val: number) {
    if (!arrInput) return;
    arrInput.value = val > 0 ? formatWithCommas(val) : '';
    arrInput.dispatchEvent(new Event('input', { bubbles: true }));
}

function syncArrChips() {
    const current = getInput('arr');
    arrChips.forEach(chip => {
        const chipVal = Number(chip.dataset.arrVal);
        chip.classList.toggle('tp-arr-chip--active', chipVal === current && current > 0);
    });
}

arrChips.forEach(chip => {
    chip.addEventListener('click', () => {
        const val = Number(chip.dataset.arrVal);
        const current = getInput('arr');
        // Toggle off if same value clicked again
        setArrValue(val === current ? 0 : val);
        syncArrChips();
    });
});

if (arrInput) {
    arrInput.addEventListener('input', () => {
        const raw = arrInput.value.replace(/[^0-9]/g, '');
        const num = parseInt(raw, 10);
        if (raw && !isNaN(num)) {
            // Preserve cursor position relative to end
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

// ─── Cost preset chips ────────────────────────────────────
document.querySelectorAll<HTMLButtonElement>('[data-preset-for]').forEach(chip => {
    chip.addEventListener('click', () => {
        const inputName = chip.dataset.presetFor!;
        const val = Number(chip.dataset.presetVal);
        const input = document.querySelector(`[data-input="${inputName}"]`) as HTMLInputElement | null;
        if (!input) return;
        const current = parseFloat(input.value) || 0;
        input.value = val === current ? '' : String(val);
        // Sync chip highlights for this input group
        document.querySelectorAll<HTMLButtonElement>(`[data-preset-for="${inputName}"]`).forEach(c => {
            c.classList.toggle('tp-arr-chip--active', Number(c.dataset.presetVal) === (val === current ? 0 : val));
        });
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
});

// ─── Build inputs from DOM ─────────────────────────────────
function buildInputs(): TechParInputs | null {
    if (!stageKey) return null;
    const gaapEl = document.querySelector('[data-input="gaapChk"]') as HTMLInputElement | null;
    return {
        arr: getInput('arr'),
        stage: stageKey as TechParInputs['stage'],
        mode,
        capexView: gaapEl?.checked ? 'gaap' : 'cash',
        growthRate: growthRate || 0,
        exitMultiple: getInput('exitMult') || 12,
        infraHosting: infraPeriod === 'annual' ? getInput('infra') / 12 : getInput('infra'),
        infraPersonnel: getInput('infraPers'),
        rdOpEx: getInput('rdOpEx'),
        rdCapEx: getInput('rdCapEx'),
        engFTE: getInput('engFTE'),
        engCost: getInput('rdEng'),
        prodCost: getInput('rdProd'),
        toolingCost: getInput('rdTool'),
    };
}

function runCompute() {
    const inputs = buildInputs();
    return inputs ? compute(inputs) : null;
}

// ─── State persistence ─────────────────────────────────────
const LS_KEY = 'techpar-state';
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function syncUrlState() {
    const inputs = buildInputs();
    if (inputs) {
        const validHist = historicalPoints.filter(p => p.arr > 0 || p.totalTechSpend > 0);
        const params = serializeToParams(inputs, validHist.length ? validHist : undefined);
        if (currencySymbol !== '$') params.set('u', currencySymbol);
        if (infraPeriod !== 'monthly') params.set('b', infraPeriod);
        if (industry !== 'saas') params.set('n', industry);
        const url = `${window.location.pathname}?${params.toString()}`;
        history.replaceState(null, '', url);
        // Debounced localStorage save
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            try { localStorage.setItem(LS_KEY, params.toString()); } catch {}
        }, 300);
    } else {
        history.replaceState(null, '', window.location.pathname);
    }
}

// ─── Infra monthly/annual annotation ─────────────────────────
function updateInfraAnnotation() {
    const infra = getInput('infra');
    const annualEl = g('infra-annual');
    const warnEl = g('infra-warn');
    if (annualEl) {
        if (infra > 0) {
            if (infraPeriod === 'monthly') {
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
        const annualInfra = infraPeriod === 'monthly' ? infra * 12 : infra;
        if (arr > 0 && infra > 0 && annualInfra > arr * 0.5) {
            warnEl.textContent = infraPeriod === 'monthly'
                ? 'This value is monthly. If you entered an annual figure, switch to Annual above.'
                : 'This value is annual. If you entered a monthly figure, switch to Monthly above.';
            warnEl.style.display = 'block';
        } else {
            warnEl.style.display = 'none';
        }
    }
}

// ─── Input sanity warnings ───────────────────────────────────
function checkSanity() {
    if (!stageKey) {
        document.querySelectorAll('[data-sanity-warn]').forEach(el => {
            (el as HTMLElement).style.display = 'none';
        });
        return;
    }
    const config = STAGES[stageKey as Stage];
    const arr = getInput('arr');
    if (!arr || !config) return;

    const totalCeiling = config.zones.hi;
    const checks: Array<{ warnAttr: string; value: number }> = [
        { warnAttr: 'infraPers', value: getInput('infraPers') },
        { warnAttr: 'rdOpEx', value: mode === 'deepdive' ? (getInput('rdEng') + getInput('rdProd') + getInput('rdTool')) : getInput('rdOpEx') },
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

// ─── Main update ───────────────────────────────────────────
function updateAll() {
    const inputs = buildInputs();
    const r = inputs ? compute(inputs) : null;

    syncUrlState();
    updateInfraAnnotation();
    checkSanity();

    // Growth rate warning
    const growthWarn = g('growth-warn');
    if (growthWarn) growthWarn.style.display = (growthRate !== null && growthRate > 100) ? 'block' : 'none';

    // Exit field visibility
    const showExit = stageKey === 'pe' || stageKey === 'enterprise';
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
        } else if (!stageKey) {
            analysisHint.textContent = 'Select a company stage on the Profile tab';
        } else if (!inputs || !inputs.arr) {
            analysisHint.textContent = 'Enter ARR on the Profile tab';
        } else {
            analysisHint.textContent = 'Enter infrastructure spend above';
        }
    }

    // Tab completion — teal bottom border on done tabs
    const profileDone = !!inputs && inputs.arr > 0 && !!stageKey;
    const costsDone = r !== null;
    document.querySelector('[data-tab="profile"]')?.classList.toggle('tp-tab--done', profileDone);
    document.querySelector('[data-tab="costs"]')?.classList.toggle('tp-tab--done', costsDone);

    // Analysis badge
    const analysisAlert = r && (r.zone === 'above' || r.zone === 'elevated' || r.zone === 'critical');
    document.querySelector('[data-badge="analysis"]')?.classList.toggle('tp-tab__badge--on', !!analysisAlert);

    if (!r) {
        // Determine what's missing to show targeted guidance
        const missingStage = !stageKey;
        const missingArr = !inputs || !inputs.arr;
        const emptyMsg = document.querySelector('[data-analysis-empty-msg]');
        const emptyCta = document.querySelector('[data-analysis-empty-cta]') as HTMLButtonElement | null;
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
            if (emptyMsg) emptyMsg.textContent = 'Enter infrastructure spend on the\nCosts tab to compute TechPar.';
            if (emptyCta) {
                emptyCta.dataset.action = 'go-costs';
                emptyCta.textContent = 'Go to costs →';
            }
        }
        // Trajectory empty state
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
            if (trajMsg) trajMsg.textContent = 'Enter infrastructure spend on the\nCosts tab to generate trajectory.';
            if (trajCta) {
                trajCta.dataset.action = 'go-costs';
                trajCta.textContent = 'Go to costs →';
            }
        }
        // Show empty states
        g('analysis-empty')?.classList.remove('tp-empty--hidden');
        g('analysis-content')?.classList.remove('tp-analysis-content--on');
        g('traj-empty')?.classList.remove('tp-empty--hidden');
        g('traj-content')?.classList.remove('tp-traj-content--on');
        if (trajChart) { trajChart.destroy(); trajChart = null; }
        return;
    }

    // Show content
    g('analysis-empty')?.classList.add('tp-empty--hidden');
    g('analysis-content')?.classList.add('tp-analysis-content--on');
    g('traj-empty')?.classList.add('tp-empty--hidden');
    g('traj-content')?.classList.add('tp-traj-content--on');

    renderAnalysis(r);
    // Only render trajectory if that tab is active
    if (document.querySelector('[data-panel="trajectory"]')?.classList.contains('tp-panel--active')) {
        renderTrajectory(r);
    }
}

// ─── Analysis render ───────────────────────────────────────
function renderAnalysis(r: TechParResult) {
    const zoneCol = getStyle(zoneColorVar(r.zone));
    const zoneBg = getStyle(zoneBgVar(r.zone));
    const s = r.stageConfig;
    const gaapEl = document.querySelector('[data-input="gaapChk"]') as HTMLInputElement;
    const isGAAP = gaapEl?.checked ?? false;

    // Hero number
    const heroNum = g('hero-num');
    if (heroNum) {
        let heroText = formatPercent(r.totalTechPct);
        if (baselineResult) {
            const delta = r.totalTechPct - baselineResult.totalTechPct;
            if (Math.abs(delta) >= 0.05) {
                const sign = delta > 0 ? '+' : '';
                const cls = delta <= 0 ? 'tp-delta--improve' : 'tp-delta--worsen';
                heroText += ` <span class="tp-delta ${cls}">${sign}${delta.toFixed(1)}pp</span>`;
            }
        }
        heroNum.innerHTML = heroText;
        heroNum.style.color = zoneCol;
    }

    // Basis label
    const heroBasis = g('hero-basis');
    if (heroBasis) {
        heroBasis.textContent = isGAAP ? 'GAAP basis: R&D CapEx excluded' : 'Cash basis';
        heroBasis.style.color = isGAAP ? getStyle('--color-warning') : '';
    }

    // Zone pill
    const pillContainer = g('hero-zone-pill');
    if (pillContainer) {
        pillContainer.innerHTML = `<div class="tp-zone-pill" style="border-color:${zoneCol};background:${zoneBg};color:${zoneCol}"><span class="tp-zone-dot" style="background:${zoneCol}"></span>${zoneLabel(r.zone)}</div>`;
    }

    // Benchmark bar
    const maxB = s.zones.critical * 1.2;
    const bw = Math.min(r.totalTechPct / maxB * 100, 100);
    const benchFill = g('bench-fill');
    if (benchFill) {
        benchFill.style.width = `${bw}%`;
        benchFill.style.background = zoneCol;
    }
    const mid = (s.zones.lo + s.zones.hi) / 2;
    const benchMid = g('bench-mid');
    if (benchMid) benchMid.textContent = `\u25BC ${mid.toFixed(0)}% midpoint`;
    const benchMax = g('bench-max');
    if (benchMax) benchMax.textContent = maxB.toFixed(0) + '%';

    // Benchmark table — dual markers: "Your stage" + "Your ratio"
    const ratio = r.totalTechPct;
    let ratioMatched = false;
    $$('[data-bench-row]').forEach(tr => {
        const el = tr as HTMLElement;
        const isStage = el.dataset.benchRow === stageKey;
        tr.classList.toggle('bench-row--active', isStage);

        // Clear previous badges
        const firstTd = el.querySelector('td')!;
        firstTd.querySelectorAll('.bench-label').forEach(b => b.remove());

        // "Your stage" badge
        if (isStage) {
            firstTd.insertAdjacentHTML('beforeend', ' <span class="bench-label bench-label--stage">Your stage</span>');
        }

        // "Your ratio" badge — first matching range wins
        if (!ratioMatched && el.dataset.bench) {
            const [lo, hi] = el.dataset.bench.split('-').map(Number);
            if (ratio >= lo && ratio <= hi) {
                ratioMatched = true;
                firstTd.insertAdjacentHTML('beforeend', ' <span class="bench-label bench-label--score">Your ratio</span>');
            }
        }
    });

    // Industry context
    const industryData = INDUSTRY_NOTES[industry];
    const industryDisc = g('industry-disc');
    if (industryDisc) industryDisc.textContent = industryData.disclaimer;
    const industryNote = g('industry-note');
    if (industryNote) {
        if (industry !== 'saas' && industryData.note) {
            industryNote.textContent = industryData.note;
            industryNote.style.display = 'block';
        } else {
            industryNote.style.display = 'none';
        }
    }

    // Signal card
    const copy = SIGNAL_COPY[stageKey as TechParInputs['stage']]?.[r.zone];
    const sigStage = g('sig-stage');
    if (sigStage) sigStage.textContent = s.label;
    const sigZone = g('sig-zone');
    if (sigZone) { sigZone.textContent = zoneLabel(r.zone); sigZone.style.color = zoneCol; }
    const sigHead = g('sig-head');
    if (sigHead) { sigHead.textContent = copy?.headline || ''; sigHead.style.color = zoneCol; }
    const sigBody = g('sig-body');
    if (sigBody) sigBody.textContent = copy?.body || '';
    const sigMets = g('sig-mets');
    const sigDiv = g('sig-div');
    const metricsHtml = buildMetrics(r, zoneCol, s);
    if (sigMets) sigMets.innerHTML = metricsHtml;
    if (sigDiv) sigDiv.style.display = metricsHtml ? '' : 'none';

    // Recommendations — only shown for zones that warrant action (not healthy/ahead)
    const recsContainer = g('recommendations');
    const recsList = g('recs-list');
    if (recsContainer && recsList) {
        const actionableZone = r.zone !== 'healthy' && r.zone !== 'ahead';
        const recs = actionableZone ? RECOMMENDATIONS[stageKey as TechParInputs['stage']]?.[r.zone] : null;
        if (recs?.length) {
            recsList.innerHTML = recs.map(rec => `<li>${rec}</li>`).join('');
            recsContainer.style.display = 'block';
        } else {
            recsContainer.style.display = 'none';
        }
    }

    // KPI grid
    const kpiGrid = g('kpi-grid');
    if (kpiGrid) {
        let cells = '';
        const br = baselineResult;
        const deltaHtml = (current: number, baseline: number | null | undefined, unit: string = 'pp') => {
            if (!br || baseline === null || baseline === undefined) return '';
            const d = current - baseline;
            if (Math.abs(d) < 0.05) return '';
            const sign = d > 0 ? '+' : '';
            const cls = d <= 0 ? 'tp-delta--improve' : 'tp-delta--worsen';
            return ` <span class="tp-delta ${cls}">${sign}${d.toFixed(1)}${unit}</span>`;
        };
        const kc = (l: string, v: string, sub: string, cls: string = '', delta: string = '') =>
            `<div class="tp-kpi-cell"><div class="tp-kpi-lbl">${l}</div><div class="tp-kpi-val${cls ? ' tp-kpi-val--' + cls : ''}">${v}${delta}</div>${sub ? `<div class="tp-kpi-sub">${sub}</div>` : ''}</div>`;

        const costDelta = br ? deltaHtml(r.total, br.total, '') : '';
        cells += `<div class="tp-kpi-cell tp-kpi-cell--highlight"><div class="tp-kpi-lbl">Annual tech cost</div><div class="tp-kpi-val">${fmtD(r.total)}${costDelta}</div><div class="tp-kpi-sub">${isGAAP ? 'GAAP' : 'cash basis'}</div></div>`;
        cells += kc('Infra hosting', formatPercent(r.kpis.infraHostingPct), `bench ${s.benchmarks.infraHosting[0]}\u2013${s.benchmarks.infraHosting[1]}%`, kpiClass(r.kpis.infraHostingPct, s.benchmarks.infraHosting[0], s.benchmarks.infraHosting[1]), deltaHtml(r.kpis.infraHostingPct, br?.kpis.infraHostingPct));
        if (r.kpis.infraPersonnelPct !== null) cells += kc('Infra personnel', formatPercent(r.kpis.infraPersonnelPct), `bench ${s.benchmarks.infraPersonnel[0]}\u2013${s.benchmarks.infraPersonnel[1]}%`, kpiClass(r.kpis.infraPersonnelPct, s.benchmarks.infraPersonnel[0], s.benchmarks.infraPersonnel[1]), deltaHtml(r.kpis.infraPersonnelPct, br?.kpis.infraPersonnelPct));
        if (r.kpis.rdOpExPct !== null) cells += kc('R&D OpEx', formatPercent(r.kpis.rdOpExPct), `bench ${s.benchmarks.rdOpEx[0]}\u2013${s.benchmarks.rdOpEx[1]}%`, kpiClass(r.kpis.rdOpExPct, s.benchmarks.rdOpEx[0], s.benchmarks.rdOpEx[1]), deltaHtml(r.kpis.rdOpExPct, br?.kpis.rdOpExPct));
        if (r.kpis.rdCapExPct !== null) cells += kc('R&D CapEx % rev', formatPercent(r.kpis.rdCapExPct), 'capitalized dev', '', deltaHtml(r.kpis.rdCapExPct, br?.kpis.rdCapExPct));
        if (r.kpis.rdCapExOfRD !== null) cells += kc('CapEx of total R&D', formatPercent(r.kpis.rdCapExOfRD), `bench ${s.benchmarks.rdCapExOfRD[0]}\u2013${s.benchmarks.rdCapExOfRD[1]}%`, '', deltaHtml(r.kpis.rdCapExOfRD, br?.kpis.rdCapExOfRD));
        cells += kc('Blended infra', formatPercent(r.kpis.blendedInfra), 'hosting + personnel', '', deltaHtml(r.kpis.blendedInfra, br?.kpis.blendedInfra));
        if (r.kpis.revenuePerEngineer !== null) cells += kc('Revenue / engineer', fmtD(r.kpis.revenuePerEngineer), 'ARR per engineering FTE');
        if (r.kpis.engPctOfRD !== null) cells += kc('Engineering % R&D', formatPercent(r.kpis.engPctOfRD), '', '', deltaHtml(r.kpis.engPctOfRD, br?.kpis.engPctOfRD));
        if (r.kpis.prodPctOfRD !== null) cells += kc('Product % R&D', formatPercent(r.kpis.prodPctOfRD), '', '', deltaHtml(r.kpis.prodPctOfRD, br?.kpis.prodPctOfRD));
        kpiGrid.innerHTML = cells;
    }

    // Deep Dive prompt
    const ddPrompt = g('deepdive-prompt');
    if (ddPrompt) {
        const rdCat = r.categories.find(c => c.label === 'R&D OpEx');
        const showPrompt = mode === 'quick' && rdCat && (rdCat.zone === 'elevated' || rdCat.zone === 'critical');
        if (showPrompt) {
            ddPrompt.style.display = 'block';
            ddPrompt.innerHTML = `R&D spend is ${zoneLabel(rdCat.zone).toLowerCase()}. <button class="tp-deepdive-prompt__btn" type="button">Switch to Deep Dive mode</button> to break down engineering, product, and tooling costs.`;
            ddPrompt.querySelector('.tp-deepdive-prompt__btn')?.addEventListener('click', () => {
                const deepBtn = document.querySelector('[data-mode="deepdive"]') as HTMLElement | null;
                if (deepBtn) deepBtn.click();
                goTab('costs');
            });
        } else {
            ddPrompt.style.display = 'none';
        }
    }

    // Category bars
    const catSection = g('cat-section');
    const catBars = g('cat-bars');
    if (catSection && catBars) {
        if (r.categories.length >= 2) {
            catSection.classList.add('tp-cat-section--on');
            let bHtml = '';
            r.categories.forEach(cat => {
                const catCol = getStyle(cat.colorVar);
                const pct = cat.pctArr;
                const benchHi = cat.benchmarkHi > 0 ? cat.benchmarkHi : pct * 1.5;
                const maxV = Math.max(pct, benchHi) * 1.2;
                const fw = Math.min(pct / maxV * 100, 100);
                const bx = cat.benchmarkLo > 0 ? cat.benchmarkLo / maxV * 100 : 0;
                const bw = cat.benchmarkHi > 0 ? (cat.benchmarkHi - cat.benchmarkLo) / maxV * 100 : 0;
                bHtml += `<div class="tp-cat-row">
                    <div class="tp-cat-meta">
                        <div class="tp-cat-name"><span class="tp-cat-dot" style="width:7px;height:7px;border-radius:50%;background:${catCol}"></span>${cat.label}</div>
                        <div style="display:flex;align-items:baseline;gap:var(--spacing-sm)">
                            <span class="tp-cat-pct" style="color:${catCol}">${formatPercent(pct)}</span>
                            ${cat.benchmarkHi > 0 ? `<span class="tp-cat-bench">bench ${cat.benchmarkLo}\u2013${cat.benchmarkHi}%</span>` : ''}
                        </div>
                    </div>
                    <div class="tp-cat-track">
                        ${cat.benchmarkHi > 0 ? `<div class="tp-cat-band" style="left:${bx}%;width:${bw}%"></div>` : ''}
                        <div class="tp-cat-fill" style="width:${fw}%;background:${catCol}"></div>
                    </div>
                </div>`;
            });
            catBars.innerHTML = bHtml;
        } else {
            catSection.classList.remove('tp-cat-section--on');
        }
    }

    // Cross-link: Tech Debt Calculator (when R&D OpEx is elevated or critical)
    const crossLink = g('cross-link');
    if (crossLink) {
        const rdCat = r.categories.find(c => c.label === 'R&D OpEx');
        if (rdCat && (rdCat.zone === 'elevated' || rdCat.zone === 'critical' || rdCat.zone === 'above')) {
            crossLink.style.display = 'block';
            crossLink.innerHTML = `R&D spend is ${zoneLabel(rdCat.zone).toLowerCase()}. <a href="/hub/tools/tech-debt-calculator">Explore the Tech Debt Calculator</a> to understand the structural drivers.`;
        } else {
            crossLink.style.display = 'none';
            crossLink.innerHTML = '';
        }
    }

    // Context block
    const ctxBlock = g('ctx-block');
    if (ctxBlock) {
        const isOver = r.zone === 'above' || r.zone === 'elevated' || r.zone === 'critical';
        const isUnder = r.zone === 'underinvest';
        if (isOver && r.stageConfig.key !== 'seed') {
            const exitMult = getInput('exitMult') || 12;
            const excessPct = (r.totalTechPct - s.zones.hi).toFixed(1);
            const annualDrag = buildInputs()!.arr * (r.totalTechPct - s.zones.hi) / 100;
            const exitDrag = annualDrag * exitMult;
            ctxBlock.innerHTML = `You are <strong style="color:var(--text-light-primary)">${excessPct}%</strong> above the ${s.zones.hi}% ceiling — <strong style="color:var(--color-primary)">${fmtD(annualDrag)}</strong> in annual excess spend. At a ${exitMult}&times; revenue multiple that represents <strong style="color:var(--color-primary)">${fmtD(exitDrag)}</strong> in recoverable exit value. Identify the highest-cost categories above and prioritise optimisation there first.`;
        } else if (isUnder) {
            const floorPct = s.zones.lo;
            const annualGap = buildInputs()!.arr * (floorPct - r.totalTechPct) / 100;
            ctxBlock.innerHTML = `Spend is <strong style="color:var(--text-light-primary)">${fmtD(annualGap)}</strong> per year below the ${floorPct}% benchmark floor. This gap often reflects deferred investment in engineering capacity or infrastructure that surfaces later as reliability issues, slower product velocity, or a higher cost to remediate at scale.`;
        } else {
            ctxBlock.innerHTML = '';
        }
    }

    renderScenarios(r);
}

function buildMetrics(r: TechParResult, col: string, s: StageConfig): string {
    let h = '';
    if (r.zone === 'underinvest') {
        h = `<div class="tp-sig-met"><div class="tp-sig-mlbl">Investment to healthy floor: 36 months</div>
            <div class="tp-sig-mval" style="color:${col}">${fmtD(r.gap.underinvestGap)}</div></div>`;
    } else if (r.zone === 'ahead') {
        h = `<div class="tp-sig-met"><div class="tp-sig-mlbl">Annual advantage vs ${s.zones.hi}% ceiling</div>
            <div class="tp-sig-mval" style="color:${col}">${fmtD(r.gap.annualAdvantage)}</div></div>`;
    } else if (r.zone !== 'healthy') {
        h = `<div class="tp-sig-met"><div class="tp-sig-mlbl">Annual excess above ${s.zones.hi}% ceiling</div>
            <div class="tp-sig-mval" style="color:${col}">${fmtD(r.gap.annualExcess)}</div></div>`;
        h += `<div class="tp-sig-met" style="margin-top:var(--spacing-sm)"><div class="tp-sig-mlbl">Cumulative excess: 36-month hold</div>
            <div class="tp-sig-mval" style="color:${col}">${fmtD(r.gap.cumulative36)}</div></div>`;
        if (s.frame === 'dollars') {
            const exitMult = getInput('exitMult') || 12;
            h += `<div class="tp-sig-met" style="margin-top:var(--spacing-sm)"><div class="tp-sig-mlbl">Hold-period exit impact at ${exitMult}&times;</div>
                <div class="tp-sig-mval" style="color:var(--color-primary)">${fmtD(r.gap.exitValue)}</div>
                <div class="tp-sig-msub">cumulative drag over 36-month hold</div></div>`;
        } else {
            h += `<div class="tp-sig-met" style="margin-top:var(--spacing-sm);padding-top:var(--spacing-sm);border-top:1px solid var(--border-light)">
                <div class="tp-sig-note">At ${s.label}, trajectory matters more than the current number. The key question is whether this ratio declines as revenue scales.</div></div>`;
        }
    }
    return h;
}

// ─── Trajectory render ─────────────────────────────────────
function renderTrajectory(r: TechParResult) {
    const s = r.stageConfig;
    const zoneCol = getStyle(zoneColorVar(r.zone));

    // Note banner
    const note = g('traj-note');
    if (note) {
        const isUnder = r.zone === 'underinvest' || r.zone === 'ahead';
        note.className = 'tp-traj-note' + (s.frame === 'convergence' ? ' tp-traj-note--convergence' : '');
        const baseNote = (isUnder && s.noteUnder) ? s.noteUnder : s.note;
        note.textContent = baseNote + ' This projection assumes a constant technology cost ratio. Actual trajectory depends on optimization and scaling decisions.';
    }

    // Build chart data
    const inputs = buildInputs();
    if (!inputs) return;
    const traj = buildTrajectory(inputs, s);

    // Build historical prefix (if any valid points exist)
    const validHist = historicalPoints.filter(p => p.arr > 0 && p.totalTechSpend > 0);
    const hist = validHist.length ? buildHistoricalTrajectory(validHist, s, inputs.arr, r.total) : null;
    const histLen = hist ? hist.labels.length : 0;

    // Prepend historical data to all arrays
    const labels = hist ? [...hist.labels, ...traj.labels] : traj.labels;
    const spend = hist ? [...hist.spend, ...traj.spend] : traj.spend;
    const bandLoData = hist ? [...hist.bandLo, ...traj.bandLo] : traj.bandLo;
    const bandHiData = hist ? [...hist.bandHi, ...traj.bandHi] : traj.bandHi;
    const underFloorData = hist ? [...hist.underFloor, ...traj.underFloor] : traj.underFloor;
    const aboveCeilingData = hist ? [...hist.aboveCeiling, ...traj.aboveCeiling] : traj.aboveCeiling;
    const revenueData = hist ? [...hist.revenue, ...traj.revenue] : traj.revenue;
    const totalLen = labels.length;
    // Index of "Now" in combined arrays
    const nowIdx = histLen;

    if (trajChart) { trajChart.destroy(); trajChart = null; }

    const canvas = document.querySelector('[data-traj-canvas]') as HTMLCanvasElement;
    if (!canvas) return;

    const bandFill = getStyle('--techpar-chart-band-fill');
    const bandBorder = getStyle('--techpar-chart-band-border');
    const aheadFill = getStyle('--techpar-chart-ahead-fill');
    const aheadBorder = getStyle('--techpar-chart-ahead-border');
    const underFill = getStyle('--techpar-chart-under-fill');
    const underBorder = getStyle('--techpar-chart-under-border');
    const aboveFill = getStyle('--techpar-chart-above-fill');
    const aboveBorder = getStyle('--techpar-chart-above-border');
    const revLineCol = getStyle('--techpar-chart-revenue-line');
    const txtMuted = getStyle('--text-light-muted');
    const borderLight = getStyle('--border-light');
    const bgLight = getStyle('--bg-light-alt');

    // Point radius: show dots at the start of each historical year (every 12th point), hide elsewhere
    const spendPointRadius = spend.map((_: number, i: number) => {
        if (i >= histLen) return 0;                 // forward projection: no dots
        if (i % 12 === 0) return 4;                 // start of each historical year
        return 0;
    });

    const datasets: ChartDataset<'line'>[] = [
        { label: '_z', data: Array(totalLen).fill(0), borderColor: 'transparent', borderWidth: 0, pointRadius: 0, fill: false },
        { label: 'Underinvestment floor', data: underFloorData, borderColor: underBorder, borderWidth: 1, borderDash: [3, 3], pointRadius: 0, fill: { target: '-1', above: underFill, below: 'transparent' }, tension: 0.3 },
        { label: 'Efficiency band', data: bandLoData, borderColor: aheadBorder, borderWidth: 1, borderDash: [3, 3], pointRadius: 0, fill: { target: '-1', above: aheadFill, below: 'transparent' }, tension: 0.3 },
        { label: 'Healthy range', data: bandHiData, borderColor: bandBorder, borderWidth: 1, borderDash: [4, 3], pointRadius: 0, fill: { target: '-1', above: bandFill, below: 'transparent' }, tension: 0.3 },
        { label: 'Caution ceiling', data: aboveCeilingData, borderColor: aboveBorder, borderWidth: 1, borderDash: [3, 3], pointRadius: 0, fill: { target: '-1', above: aboveFill, below: 'transparent' }, tension: 0.3 },
        { label: 'Monthly tech spend', data: spend, borderColor: zoneCol, borderWidth: 2, pointRadius: spendPointRadius, pointBackgroundColor: zoneCol, fill: false, tension: 0.3 },
    ];

    // Helper to pad overlay datasets: NaN for historical portion so line starts at "Now"
    const padForward = (data: number[]) => histLen > 0 ? [...Array(histLen).fill(NaN), ...data] : data;

    // Baseline overlay (dashed spend line)
    if (baselineInputs && baselineResult) {
        const baseTraj = buildTrajectory(baselineInputs, baselineResult.stageConfig);
        const baseZoneCol = getStyle(zoneColorVar(baselineResult.zone));
        datasets.push({
            label: 'Baseline spend',
            data: padForward(baseTraj.spend),
            borderColor: baseZoneCol + '80',
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false,
            tension: 0.3,
            spanGaps: false,
        });
    }

    // Scenario overlays
    for (const scenario of scenarios) {
        const scenTraj = buildTrajectory(scenario.inputs, scenario.result.stageConfig);
        const scenCol = getStyle(zoneColorVar(scenario.result.zone));
        datasets.push({
            label: scenario.name,
            data: padForward(scenTraj.spend),
            borderColor: scenCol + '80',
            borderWidth: 1.5,
            borderDash: [4, 4],
            pointRadius: 0,
            fill: false,
            tension: 0.3,
            spanGaps: false,
        });
    }

    if (s.frame === 'convergence') {
        datasets.push({
            label: 'Monthly revenue',
            data: revenueData,
            borderColor: revLineCol,
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false,
            tension: 0.3,
        });
    }

    const allSpend = [...spend, ...aboveCeilingData];
    if (baselineInputs && baselineResult) {
        const baseTraj = buildTrajectory(baselineInputs, baselineResult.stageConfig);
        allSpend.push(...baseTraj.spend);
    }
    for (const scenario of scenarios) {
        const scenTraj = buildTrajectory(scenario.inputs, scenario.result.stageConfig);
        allSpend.push(...scenTraj.spend);
    }
    // Growth rate chart guard: cap revenue line display at 2x the above-ceiling band
    if (s.frame === 'convergence') {
        const maxAbove = Math.max(...aboveCeilingData);
        const revCap = maxAbove * 2;
        if (inputs.growthRate > 100) {
            const cappedRevenue = revenueData.map(v => Math.min(v, revCap));
            const revDs = datasets[datasets.length - 1];
            revDs.data = cappedRevenue;
            allSpend.push(...cappedRevenue);
        } else {
            allSpend.push(...revenueData);
        }
    }
    const maxY = Math.max(...allSpend.filter(v => !isNaN(v))) * 1.12;

    function syncDot(chart: Chart) {
        const m = chart.getDatasetMeta(5);
        if (!m?.data?.[nowIdx]) return;
        const pt = m.data[nowIdx];
        const dot = document.querySelector('[data-traj-dot]') as HTMLElement;
        if (!dot) return;
        dot.style.background = zoneCol;
        dot.style.boxShadow = `0 0 0 5px ${zoneCol}33`;
        dot.style.left = pt.x + 'px';
        dot.style.top = pt.y + 'px';
        dot.style.display = 'block';
    }

    const dotPlugin = {
        id: 'positionDot',
        resize(chart: Chart) { syncDot(chart); },
        afterRender(chart: Chart) { syncDot(chart); },
    };

    trajChart = new Chart(canvas.getContext('2d')!, {
        type: 'line',
        data: { labels, datasets },
        plugins: [dotPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false as const,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: bgLight,
                    titleColor: getStyle('--text-light-primary'),
                    bodyColor: txtMuted,
                    borderColor: borderLight,
                    borderWidth: 1,
                    padding: 8,
                    titleFont: { family: getStyle('--font-family') || "'Helvetica Neue', Arial, sans-serif", size: 9 },
                    bodyFont: { family: getStyle('--font-family') || "'Helvetica Neue', Arial, sans-serif", size: 9 },
                    filter: (item: TooltipItem<'line'>) => item.dataset.label !== '_z',
                    callbacks: {
                        title: (c: TooltipItem<'line'>[]) => `Month ${c[0].dataIndex}`,
                        label: (c: TooltipItem<'line'>) => `${c.dataset.label}: ${fmtD(c.parsed.y ?? 0)}/mo`,
                    },
                },
            },
            scales: {
                x: {
                    grid: { color: borderLight + '33', lineWidth: 0.5 },
                    ticks: { color: txtMuted, font: { family: getStyle('--font-family') || "'Helvetica Neue', Arial, sans-serif", size: 9 }, maxTicksLimit: 7 },
                },
                y: {
                    min: 0,
                    max: maxY,
                    title: { display: true, text: `Monthly spend (${currencySymbol})`, color: txtMuted, font: { size: 10 } },
                    grid: { color: borderLight + '33', lineWidth: 0.5 },
                    ticks: {
                        color: txtMuted,
                        font: { family: getStyle('--font-family') || "'Helvetica Neue', Arial, sans-serif", size: 9 },
                        callback: (v: string | number) => fmtD(typeof v === 'number' ? v : Number(v)),
                        maxTicksLimit: window.innerWidth < 480 ? 5 : undefined,
                    },
                },
            },
        },
    });

    // User position dot is handled by the dotPlugin afterRender hook

    // Legend — zones (fill swatches) + series (line/point swatches)
    const zoneItems = [
        { sw: `background:${underFill};border:1px solid ${underBorder}`, l: `Underinvestment zone (<${s.zones.underinvest}%)` },
        { sw: `background:${aheadFill};border:1px solid ${aheadBorder}`, l: `Ahead (${s.zones.underinvest}\u2013${s.zones.lo}%)` },
        { sw: `background:${bandFill};border:1px solid ${bandBorder}`, l: `Healthy range (${s.zones.lo}\u2013${s.zones.hi}%)` },
        { sw: `background:${aboveFill};border:1px solid ${aboveBorder}`, l: `Caution zone (>${s.zones.hi}%)` },
    ];
    const seriesItems: { cls: string; sw: string; l: string }[] = [
        { cls: 'tp-tleg--line', sw: `border-color:${zoneCol}`, l: 'Monthly tech spend' },
        { cls: 'tp-tleg--dot', sw: `border-color:${zoneCol}`, l: 'Your position today' },
    ];
    if (histLen > 0) {
        seriesItems.push({ cls: 'tp-tleg--dot', sw: `border-color:${zoneCol}`, l: 'Historical actuals' });
    }
    if (baselineResult) {
        const baseZoneCol = getStyle(zoneColorVar(baselineResult.zone));
        seriesItems.push({ cls: 'tp-tleg--line tp-tleg--dashed', sw: `border-color:${baseZoneCol}80`, l: 'Baseline spend' });
    }
    for (const scenario of scenarios) {
        const scenCol = getStyle(zoneColorVar(scenario.result.zone));
        seriesItems.push({ cls: 'tp-tleg--line tp-tleg--dashed', sw: `border-color:${scenCol}80`, l: scenario.name });
    }
    if (s.frame === 'convergence') {
        seriesItems.push({ cls: 'tp-tleg--line tp-tleg--dashed', sw: `border-color:${revLineCol}`, l: 'Monthly revenue' });
    }
    const renderItem = (x: { cls?: string; sw: string; l: string }) =>
        `<div class="tp-tleg ${x.cls || ''}"><div class="tp-tleg__sw" style="${x.sw}"></div>${x.l}</div>`;
    const legend = g('traj-legend');
    if (legend) {
        legend.innerHTML =
            `<div class="tp-tleg-group tp-tleg-group--zones">${zoneItems.map(renderItem).join('')}</div>` +
            `<div class="tp-tleg-group tp-tleg-group--series">${seriesItems.map(renderItem).join('')}</div>`;
    }
}

// ─── Hydrate from URL or localStorage ───────────────────────
function hydrateFromUrl() {
    let params = new URLSearchParams(window.location.search);

    // URL params take precedence; fall back to localStorage
    if (params.toString() === '') {
        try {
            const saved = localStorage.getItem(LS_KEY);
            if (saved) params = new URLSearchParams(saved);
        } catch {}
    }

    if (params.toString() === '') return;

    const state = deserializeFromParams(params);

    // Currency
    const u = params.get('u');
    if (u) {
        currencySymbol = u;
        $$('[data-currency]').forEach(b => {
            b.classList.toggle('tp-seg__btn--active', (b as HTMLElement).dataset.currency === u);
        });
        document.querySelectorAll('.tp-input-pre').forEach(pre => {
            pre.textContent = currencySymbol;
        });
        updateChipCurrencies();
    }

    // Infra period
    const b = params.get('b');
    if (b === 'annual') {
        infraPeriod = 'annual';
        syncInfraPeriodUI();
    }

    // Industry
    const n = params.get('n');
    if (n && ['saas', 'fintech', 'marketplace', 'infra_hw', 'other'].includes(n)) {
        industry = n as Industry;
        $$('[data-industry]').forEach(btn => {
            btn.classList.toggle('tp-seg__btn--active', (btn as HTMLElement).dataset.industry === industry);
        });
    }

    // Stage
    if (state.stage) {
        stageKey = state.stage;
        $$('.tp-stage-card').forEach(c => {
            c.classList.toggle('tp-stage-card--active', (c as HTMLElement).dataset.stage === stageKey);
        });
    }

    // Growth rate
    if (state.growthRate !== undefined) {
        growthRate = state.growthRate;
        $$('[data-growth]').forEach(b => {
            b.classList.toggle('tp-seg__btn--active',
                parseInt((b as HTMLElement).dataset.growth || '0', 10) === growthRate);
        });
        const gc = document.getElementById('tp-growth-custom') as HTMLInputElement | null;
        if (gc) gc.value = String(growthRate);
    }

    // Mode
    if (state.mode) {
        mode = state.mode;
        $$('[data-mode]').forEach(b => {
            b.classList.toggle('tp-seg__btn--active', (b as HTMLElement).dataset.mode === mode);
        });
        const rdQuick = g('rd-quick');
        const rdDeep = g('rd-deep');
        if (rdQuick) rdQuick.style.display = mode === 'quick' ? 'block' : 'none';
        if (rdDeep) rdDeep.classList.toggle('tp-deep-wrap--on', mode === 'deepdive');
    }

    // CapEx view
    if (state.capexView) {
        const gaapEl = document.querySelector('[data-input="gaapChk"]') as HTMLInputElement | null;
        if (gaapEl) gaapEl.checked = state.capexView === 'gaap';
    }

    // Numeric inputs — set DOM values
    const setInput = (name: string, val: number | undefined) => {
        if (val === undefined) return;
        const el = document.querySelector(`[data-input="${name}"]`) as HTMLInputElement | null;
        if (el) el.value = String(val);
    };

    // ARR needs comma formatting
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

    // Historical data
    if (state.historical?.length) {
        historicalPoints = state.historical;
        renderHistRows();
        // Open the historical section if data exists
        const histDetails = document.querySelector('[data-historical]') as HTMLDetailsElement | null;
        if (histDetails) histDetails.open = true;
    }
}

// ─── Onboarding ─────────────────────────────────────────────
const VISITED_KEY = 'techpar-visited';
try {
    const onboarding = document.querySelector('[data-onboarding]') as HTMLDetailsElement | null;
    if (onboarding && localStorage.getItem(VISITED_KEY)) {
        onboarding.open = false;
    }
    localStorage.setItem(VISITED_KEY, '1');
} catch {}

// ─── Init ──────────────────────────────────────────────────
hydrateFromUrl();
updateAll();
