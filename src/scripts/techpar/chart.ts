/**
 * TechPar UI — Chart.js rendering for analysis and trajectory tabs.
 */
import type { Chart as ChartType, ChartDataset, TooltipItem } from 'chart.js';
import {
  buildTrajectory,
  buildHistoricalTrajectory,
  zoneColorVar,
  zoneInkVar,
  zoneBgVar,
  kpiClass,
  CATEGORY_LABELS,
} from '../../utils/techpar-engine';
import type { TechParResult, StageConfig } from '../../utils/techpar-engine';
import { tp } from './state';
import { s as str, sHtml, hasString } from './strings';
import { trajLabelKind } from './logic';
import { escapeHtml } from '../../utils/escape-html';
import { trackEvent } from '../../utils/analytics';
import * as Sentry from '@sentry/browser';
import { pageLang } from '../tool-strings';
import {
  g,
  $$,
  getInput,
  getStyle,
  chartFontFamily,
  fmtD,
  fmtPct,
  fmtNum,
  fmtPlain,
  zoneName,
  stageLabel,
  categoryName,
  currencySymbol,
  buildInputs,
  renderScenarios,
} from './dom';

/** Signed delta (`+1.2pp`, `-0.4pp`) in the page's number format. */
function signedDelta(d: number, unit: 'pp' | ''): string {
  const value = (d > 0 ? '+' : '') + fmtNum(d, 1);
  return unit === 'pp' ? str('js.delta.pp', { value }) : value;
}

/** Recommendations for a stage × zone: `rec.<stage>.<zone>.1`, `.2`, … */
function recommendations(stage: string, zone: string): string[] {
  const out: string[] = [];
  for (let n = 1; hasString(`rec.${stage}.${zone}.${n}`); n++) {
    out.push(str(`rec.${stage}.${zone}.${n}`));
  }
  return out;
}

/** Fill a catalog sentence whose `{slot}` is an element built in code. */
function withSlot(key: string, slot: string, html: string): string {
  return sHtml(key).replace(`{${slot}}`, html);
}

// Lazy-load Chart.js — only downloaded when the trajectory tab is first activated.
// This removes ~180 KB from the initial TechPar bundle.
let ChartCtor: typeof ChartType | null = null;

async function ensureChart(): Promise<typeof ChartType> {
  if (ChartCtor) return ChartCtor;
  const { Chart, registerables } = await import('chart.js');
  Chart.register(...registerables);
  ChartCtor = Chart;
  return Chart;
}

// ─── Analysis render ──────────────────────────────────────
let lastReportedZone: string | null = null;

export function renderAnalysis(r: TechParResult, updateAll: () => void) {
  try {
    if (r.zone !== lastReportedZone) {
      trackEvent({
        event: 'tp_complete',
        category: 'tool',
        zone: r.zone,
        tech_pct: String(r.totalTechPct.toFixed(1)),
        page: 'techpar',
      });
      lastReportedZone = r.zone;
    }
    const zoneCol = getStyle(zoneColorVar(r.zone));
    // Text ink for labels and figures; zoneCol stays the fill/stroke (ADR-0035).
    const zoneInk = getStyle(zoneInkVar(r.zone));
    const zoneBg = getStyle(zoneBgVar(r.zone));
    const s = r.stageConfig;
    const gaapEl = document.querySelector('[data-input="gaapChk"]') as HTMLInputElement;
    const isGAAP = gaapEl?.checked ?? false;

    // Hero number
    const heroNum = g('hero-num');
    if (heroNum) {
      let heroText = fmtPct(r.totalTechPct);
      if (tp.baselineResult) {
        const delta = r.totalTechPct - tp.baselineResult.totalTechPct;
        if (Math.abs(delta) >= 0.05) {
          const cls = delta <= 0 ? 'tp-delta--improve' : 'tp-delta--worsen';
          heroText += ` <span class="tp-delta ${cls}">${escapeHtml(signedDelta(delta, 'pp'))}</span>`;
        }
      }
      heroNum.innerHTML = heroText;
      heroNum.style.color = zoneInk;
    }

    // Basis label
    const heroBasis = g('hero-basis');
    if (heroBasis) {
      heroBasis.textContent = str(isGAAP ? 'js.basis.gaap' : 'js.basis.cash');
      heroBasis.style.color = isGAAP ? getStyle('--color-warning-ink') : '';
    }

    // Zone pill
    const pillContainer = g('hero-zone-pill');
    if (pillContainer) {
      pillContainer.innerHTML = `<div class="tp-zone-pill" style="border-color:${zoneCol};background:${zoneBg};color:${zoneInk}"><span class="tp-zone-dot" style="background:${zoneCol}"></span>${escapeHtml(zoneName(r.zone))}</div>`;
    }

    // Benchmark bar
    const maxB = s.zones.critical * 1.2;
    const bw = Math.min((r.totalTechPct / maxB) * 100, 100);
    const benchFill = g('bench-fill');
    if (benchFill) {
      benchFill.style.width = `${bw}%`;
      benchFill.style.background = zoneCol;
    }
    const mid = (s.zones.lo + s.zones.hi) / 2;
    const benchMid = g('bench-mid');
    if (benchMid) benchMid.textContent = str('js.bench.midpoint', { mid: fmtNum(mid, 0) });
    const benchMax = g('bench-max');
    if (benchMax) benchMax.textContent = fmtPct(maxB, 0);

    // Benchmark table
    const ratio = r.totalTechPct;
    let ratioMatched = false;
    $$('[data-bench-row]').forEach((tr) => {
      const el = tr as HTMLElement;
      const isStage = el.dataset.benchRow === tp.stageKey;
      tr.classList.toggle('brutal-bench-table__active', isStage);

      const firstTd = el.querySelector('td')!;
      firstTd.querySelectorAll('.brutal-bench-table__label').forEach((b) => b.remove());

      if (isStage) {
        firstTd.insertAdjacentHTML(
          'beforeend',
          ` <span class="brutal-bench-table__label brutal-bench-table__label--stage">${sHtml('js.bench.yourStage')}</span>`
        );
      }

      if (!ratioMatched && el.dataset.bench) {
        const [lo, hi] = el.dataset.bench.split('-').map(Number);
        if (ratio >= lo && ratio <= hi) {
          ratioMatched = true;
          firstTd.insertAdjacentHTML(
            'beforeend',
            ` <span class="brutal-bench-table__label brutal-bench-table__label--score">${sHtml('js.bench.yourRatio')}</span>`
          );
        }
      }
    });

    // Industry context
    const industryDisc = g('industry-disc');
    if (industryDisc) industryDisc.textContent = str(`industry.${tp.industry}.disclaimer`);
    const industryNote = g('industry-note');
    if (industryNote) {
      // SaaS has no note (its catalog entry is absent, not empty).
      const noteKey = `industry.${tp.industry}.note`;
      if (tp.industry !== 'saas' && hasString(noteKey)) {
        industryNote.textContent = str(noteKey);
        industryNote.style.display = 'block';
      } else {
        industryNote.style.display = 'none';
      }
    }

    // Signal card
    const sigKey = `signal.${tp.stageKey}.${r.zone}`;
    const sigStage = g('sig-stage');
    if (sigStage) sigStage.textContent = stageLabel(s.key);
    const sigZone = g('sig-zone');
    if (sigZone) {
      sigZone.textContent = zoneName(r.zone);
      sigZone.style.color = zoneInk;
    }
    const sigHead = g('sig-head');
    if (sigHead) {
      sigHead.textContent = hasString(`${sigKey}.headline`) ? str(`${sigKey}.headline`) : '';
      sigHead.style.color = zoneInk;
    }
    const sigBody = g('sig-body');
    if (sigBody) sigBody.textContent = hasString(`${sigKey}.body`) ? str(`${sigKey}.body`) : '';
    const sigMets = g('sig-mets');
    const sigDiv = g('sig-div');
    const metricsHtml = buildMetrics(r, zoneInk, s);
    if (sigMets) sigMets.innerHTML = metricsHtml;
    if (sigDiv) sigDiv.style.display = metricsHtml ? '' : 'none';

    // Recommendations
    const recsContainer = g('recommendations');
    const recsList = g('recs-list');
    if (recsContainer && recsList) {
      const actionableZone = r.zone !== 'healthy' && r.zone !== 'ahead';
      const recs = actionableZone ? recommendations(String(tp.stageKey), r.zone) : null;
      if (recs?.length) {
        recsList.innerHTML = recs.map((rec) => `<li>${rec}</li>`).join('');
        recsContainer.style.display = 'block';
      } else {
        recsContainer.style.display = 'none';
      }
    }

    // KPI grid
    const kpiGrid = g('kpi-grid');
    if (kpiGrid) {
      let cells = '';
      const br = tp.baselineResult;
      const deltaHtml = (
        current: number,
        baseline: number | null | undefined,
        unit: 'pp' | '' = 'pp'
      ) => {
        if (!br || baseline === null || baseline === undefined) return '';
        const d = current - baseline;
        if (Math.abs(d) < 0.05) return '';
        const cls = d <= 0 ? 'tp-delta--improve' : 'tp-delta--worsen';
        return ` <span class="tp-delta ${cls}">${escapeHtml(signedDelta(d, unit))}</span>`;
      };
      const kc = (l: string, v: string, sub: string, cls: string = '', delta: string = '') =>
        `<div class="tp-kpi-cell"><div class="tp-kpi-lbl">${l}</div><div class="tp-kpi-val${cls ? ' tp-kpi-val--' + cls : ''}">${v}${delta}</div>${sub ? `<div class="tp-kpi-sub">${sub}</div>` : ''}</div>`;
      const bench = (range: readonly [number, number]) =>
        sHtml('js.kpi.bench', { lo: range[0], hi: range[1] });

      const costDelta = br ? deltaHtml(r.total, br.total, '') : '';
      cells += `<div class="tp-kpi-cell tp-kpi-cell--highlight"><div class="tp-kpi-lbl">${sHtml('js.kpi.annualCost')}</div><div class="tp-kpi-val">${fmtD(r.total)}${costDelta}</div><div class="tp-kpi-sub">${sHtml(isGAAP ? 'js.kpi.sub.gaap' : 'js.kpi.sub.cash')}</div></div>`;
      cells += kc(
        sHtml('category.infraHosting'),
        fmtPct(r.kpis.infraHostingPct),
        bench(s.benchmarks.infraHosting),
        kpiClass(
          r.kpis.infraHostingPct,
          s.benchmarks.infraHosting[0],
          s.benchmarks.infraHosting[1]
        ),
        deltaHtml(r.kpis.infraHostingPct, br?.kpis.infraHostingPct)
      );
      if (r.kpis.infraPersonnelPct !== null)
        cells += kc(
          sHtml('category.infraPersonnel'),
          fmtPct(r.kpis.infraPersonnelPct),
          bench(s.benchmarks.infraPersonnel),
          kpiClass(
            r.kpis.infraPersonnelPct,
            s.benchmarks.infraPersonnel[0],
            s.benchmarks.infraPersonnel[1]
          ),
          deltaHtml(r.kpis.infraPersonnelPct, br?.kpis.infraPersonnelPct)
        );
      if (r.kpis.rdOpExPct !== null)
        cells += kc(
          sHtml('category.rdOpEx'),
          fmtPct(r.kpis.rdOpExPct),
          bench(s.benchmarks.rdOpEx),
          kpiClass(r.kpis.rdOpExPct, s.benchmarks.rdOpEx[0], s.benchmarks.rdOpEx[1]),
          deltaHtml(r.kpis.rdOpExPct, br?.kpis.rdOpExPct)
        );
      if (r.kpis.rdCapExPct !== null)
        cells += kc(
          sHtml('js.kpi.rdCapExPct'),
          fmtPct(r.kpis.rdCapExPct),
          sHtml('js.kpi.sub.capitalized'),
          '',
          deltaHtml(r.kpis.rdCapExPct, br?.kpis.rdCapExPct)
        );
      if (r.kpis.rdCapExOfRD !== null)
        cells += kc(
          sHtml('js.kpi.rdCapExOfRD'),
          fmtPct(r.kpis.rdCapExOfRD),
          bench(s.benchmarks.rdCapExOfRD),
          '',
          deltaHtml(r.kpis.rdCapExOfRD, br?.kpis.rdCapExOfRD)
        );
      cells += kc(
        sHtml('js.kpi.blendedInfra'),
        fmtPct(r.kpis.blendedInfra),
        sHtml('js.kpi.sub.blended'),
        '',
        deltaHtml(r.kpis.blendedInfra, br?.kpis.blendedInfra)
      );
      if (r.kpis.revenuePerEngineer !== null)
        cells += kc(
          sHtml('js.kpi.revPerEng'),
          fmtD(r.kpis.revenuePerEngineer),
          sHtml('js.kpi.sub.revPerEng')
        );
      if (r.kpis.engPctOfRD !== null)
        cells += kc(
          sHtml('js.kpi.engPctOfRD'),
          fmtPct(r.kpis.engPctOfRD),
          '',
          '',
          deltaHtml(r.kpis.engPctOfRD, br?.kpis.engPctOfRD)
        );
      if (r.kpis.prodPctOfRD !== null)
        cells += kc(
          sHtml('js.kpi.prodPctOfRD'),
          fmtPct(r.kpis.prodPctOfRD),
          '',
          '',
          deltaHtml(r.kpis.prodPctOfRD, br?.kpis.prodPctOfRD)
        );
      kpiGrid.innerHTML = cells;
    }

    // Deep Dive prompt
    const ddPrompt = g('deepdive-prompt');
    if (ddPrompt) {
      const rdCat = r.categories.find((c) => c.label === CATEGORY_LABELS.rdOpEx);
      const showPrompt =
        tp.mode === 'quick' && rdCat && (rdCat.zone === 'elevated' || rdCat.zone === 'critical');
      if (showPrompt) {
        ddPrompt.style.display = 'block';
        ddPrompt.innerHTML = withSlot(
          `js.deepdive.prompt.${rdCat.zone}`,
          'button',
          `<button class="tp-deepdive-prompt__btn" type="button">${sHtml('js.deepdive.button')}</button>`
        );
        ddPrompt.querySelector('.tp-deepdive-prompt__btn')?.addEventListener('click', () => {
          const deepBtn = document.querySelector('[data-mode="deepdive"]') as HTMLElement | null;
          if (deepBtn) deepBtn.click();
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
        r.categories.forEach((cat) => {
          const catCol = getStyle(cat.colorVar);
          const pct = cat.pctArr;
          const benchHi = cat.benchmarkHi > 0 ? cat.benchmarkHi : pct * 1.5;
          const maxV = Math.max(pct, benchHi) * 1.2;
          const fw = Math.min((pct / maxV) * 100, 100);
          const bx = cat.benchmarkLo > 0 ? (cat.benchmarkLo / maxV) * 100 : 0;
          const bw = cat.benchmarkHi > 0 ? ((cat.benchmarkHi - cat.benchmarkLo) / maxV) * 100 : 0;
          bHtml += `<div class="tp-cat-row">
                    <div class="tp-cat-meta">
                        <div class="tp-cat-name"><span class="tp-cat-dot" style="width:7px;height:7px;border-radius:50%;background:${catCol}"></span>${categoryName(cat.label)}</div>
                        <div style="display:flex;align-items:baseline;gap:var(--spacing-sm)">
                            <span class="tp-cat-pct" style="color:${catCol}">${fmtPct(pct)}</span>
                            ${cat.benchmarkHi > 0 ? `<span class="tp-cat-bench">${sHtml('js.kpi.bench', { lo: cat.benchmarkLo, hi: cat.benchmarkHi })}</span>` : ''}
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

    // Cross-link
    const crossLink = g('cross-link');
    if (crossLink) {
      const rdCat = r.categories.find((c) => c.label === CATEGORY_LABELS.rdOpEx);
      if (
        rdCat &&
        (rdCat.zone === 'elevated' || rdCat.zone === 'critical' || rdCat.zone === 'above')
      ) {
        crossLink.style.display = 'block';
        crossLink.innerHTML = withSlot(
          `js.crossLink.${rdCat.zone}`,
          'link',
          `<a href="${escapeHtml(techDebtHref())}">${sHtml('js.crossLink.link')}</a>`
        );
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
        const annualDrag = (buildInputs()!.arr * (r.totalTechPct - s.zones.hi)) / 100;
        const exitDrag = annualDrag * exitMult;
        ctxBlock.innerHTML = sHtml('js.ctx.over', {
          excess: fmtPct(r.totalTechPct - s.zones.hi),
          ceiling: s.zones.hi,
          annualDrag: fmtD(annualDrag),
          multiple: fmtPlain(exitMult),
          exitDrag: fmtD(exitDrag),
        });
      } else if (isUnder) {
        const floorPct = s.zones.lo;
        const annualGap = (buildInputs()!.arr * (floorPct - r.totalTechPct)) / 100;
        ctxBlock.innerHTML = sHtml('js.ctx.under', { gap: fmtD(annualGap), floor: floorPct });
      } else {
        ctxBlock.innerHTML = '';
      }
    }

    renderScenarios(r, updateAll);
  } catch (error) {
    Sentry.captureException(error, { tags: { area: 'techpar-calculation' } });
  }
}

export function buildMetrics(r: TechParResult, col: string, s: StageConfig): string {
  let h = '';
  if (r.zone === 'underinvest') {
    h = `<div class="tp-sig-met"><div class="tp-sig-mlbl">${sHtml('js.metrics.underinvest')}</div>
            <div class="tp-sig-mval" style="color:${col}">${fmtD(r.gap.underinvestGap)}</div></div>`;
  } else if (r.zone === 'ahead') {
    h = `<div class="tp-sig-met"><div class="tp-sig-mlbl">${sHtml('js.metrics.advantage', { ceiling: s.zones.hi })}</div>
            <div class="tp-sig-mval" style="color:${col}">${fmtD(r.gap.annualAdvantage)}</div></div>`;
  } else if (r.zone !== 'healthy') {
    h = `<div class="tp-sig-met"><div class="tp-sig-mlbl">${sHtml('js.metrics.excess', { ceiling: s.zones.hi })}</div>
            <div class="tp-sig-mval" style="color:${col}">${fmtD(r.gap.annualExcess)}</div></div>`;
    h += `<div class="tp-sig-met" style="margin-top:var(--spacing-sm)"><div class="tp-sig-mlbl">${sHtml('js.metrics.cumulative')}</div>
            <div class="tp-sig-mval" style="color:${col}">${fmtD(r.gap.cumulative36)}</div></div>`;
    if (s.frame === 'dollars') {
      const exitMult = getInput('exitMult') || 12;
      h += `<div class="tp-sig-met" style="margin-top:var(--spacing-sm)"><div class="tp-sig-mlbl">${sHtml('js.metrics.exitImpact', { multiple: fmtPlain(exitMult) })}</div>
                <div class="tp-sig-mval" style="color:var(--color-primary)">${fmtD(r.gap.exitValue)}</div>
                <div class="tp-sig-msub">${sHtml('js.metrics.exitSub')}</div></div>`;
    } else {
      // One whole sentence per convergence stage, so translations can agree.
      h += `<div class="tp-sig-met" style="margin-top:var(--spacing-sm);padding-top:var(--spacing-sm);border-top:1px solid var(--border-light)">
                <div class="tp-sig-note">${sHtml(`js.metrics.trajNote.${s.key}`)}</div></div>`;
    }
  }
  return h;
}

// ─── Trajectory render ────────────────────────────────────
export async function renderTrajectory(r: TechParResult) {
  try {
    const s = r.stageConfig;
    const zoneCol = getStyle(zoneColorVar(r.zone));

    // Note banner
    const note = g('traj-note');
    if (note) {
      const isUnder = r.zone === 'underinvest' || r.zone === 'ahead';
      note.className =
        'tp-traj-note' + (s.frame === 'convergence' ? ' tp-traj-note--convergence' : '');
      const baseNote =
        isUnder && s.noteUnder ? str(`stage.${s.key}.noteUnder`) : str(`stage.${s.key}.note`);
      note.textContent = baseNote + ' ' + str('js.traj.projectionNote');
    }

    const inputs = buildInputs();
    if (!inputs) return;
    const traj = buildTrajectory(inputs, s);

    const validHist = tp.historicalPoints.filter((p) => p.arr > 0 && p.totalTechSpend > 0);
    const hist = validHist.length
      ? buildHistoricalTrajectory(validHist, s, inputs.arr, r.total)
      : null;
    const histLen = hist ? hist.labels.length : 0;

    // The engine's forward labels are English ('Now', 'M6', …); translate at
    // render. Historical labels are the user's own and pass through.
    const trajLabels = traj.labels.map((l) => {
      const kind = trajLabelKind(l);
      if (kind.kind === 'now') return str('js.traj.now');
      if (kind.kind === 'month') return str('js.traj.month', { m: kind.m });
      return l;
    });
    const labels = hist ? [...hist.labels, ...trajLabels] : trajLabels;
    const spend = hist ? [...hist.spend, ...traj.spend] : traj.spend;
    const bandLoData = hist ? [...hist.bandLo, ...traj.bandLo] : traj.bandLo;
    const bandHiData = hist ? [...hist.bandHi, ...traj.bandHi] : traj.bandHi;
    const underFloorData = hist ? [...hist.underFloor, ...traj.underFloor] : traj.underFloor;
    const aboveCeilingData = hist
      ? [...hist.aboveCeiling, ...traj.aboveCeiling]
      : traj.aboveCeiling;
    const revenueData = hist ? [...hist.revenue, ...traj.revenue] : traj.revenue;
    const totalLen = labels.length;
    const nowIdx = histLen;

    if (tp.trajChart) {
      tp.trajChart.destroy();
      tp.trajChart = null;
    }

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

    const spendPointRadius = spend.map((_: number, i: number) => {
      if (i >= histLen) return 0;
      if (i % 12 === 0) return 4;
      return 0;
    });

    const datasets: ChartDataset<'line'>[] = [
      {
        label: '_z',
        data: Array(totalLen).fill(0),
        borderColor: 'transparent',
        borderWidth: 0,
        pointRadius: 0,
        fill: false,
      },
      {
        label: str('js.chart.underFloor'),
        data: underFloorData,
        borderColor: underBorder,
        borderWidth: 1,
        borderDash: [3, 3],
        pointRadius: 0,
        fill: { target: '-1', above: underFill, below: 'transparent' },
        tension: 0.3,
      },
      {
        label: str('js.chart.efficiencyBand'),
        data: bandLoData,
        borderColor: aheadBorder,
        borderWidth: 1,
        borderDash: [3, 3],
        pointRadius: 0,
        fill: { target: '-1', above: aheadFill, below: 'transparent' },
        tension: 0.3,
      },
      {
        label: str('js.chart.healthyRange'),
        data: bandHiData,
        borderColor: bandBorder,
        borderWidth: 1,
        borderDash: [4, 3],
        pointRadius: 0,
        fill: { target: '-1', above: bandFill, below: 'transparent' },
        tension: 0.3,
      },
      {
        label: str('js.chart.cautionCeiling'),
        data: aboveCeilingData,
        borderColor: aboveBorder,
        borderWidth: 1,
        borderDash: [3, 3],
        pointRadius: 0,
        fill: { target: '-1', above: aboveFill, below: 'transparent' },
        tension: 0.3,
      },
      {
        label: str('js.chart.monthlySpend'),
        data: spend,
        borderColor: zoneCol,
        borderWidth: 2,
        pointRadius: spendPointRadius,
        pointBackgroundColor: zoneCol,
        fill: false,
        tension: 0.3,
      },
    ];

    const padForward = (data: number[]) =>
      histLen > 0 ? [...Array(histLen).fill(NaN), ...data] : data;

    if (tp.baselineInputs && tp.baselineResult) {
      const baseTraj = buildTrajectory(tp.baselineInputs, tp.baselineResult.stageConfig);
      const baseZoneCol = getStyle(zoneColorVar(tp.baselineResult.zone));
      datasets.push({
        label: str('js.chart.baselineSpend'),
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

    for (const scenario of tp.scenarios) {
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
        label: str('js.chart.monthlyRevenue'),
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
    if (tp.baselineInputs && tp.baselineResult) {
      const baseTraj = buildTrajectory(tp.baselineInputs, tp.baselineResult.stageConfig);
      allSpend.push(...baseTraj.spend);
    }
    for (const scenario of tp.scenarios) {
      const scenTraj = buildTrajectory(scenario.inputs, scenario.result.stageConfig);
      allSpend.push(...scenTraj.spend);
    }
    if (s.frame === 'convergence') {
      const maxAbove = Math.max(...aboveCeilingData);
      const revCap = maxAbove * 2;
      if (inputs.growthRate > 100) {
        const cappedRevenue = revenueData.map((v) => Math.min(v, revCap));
        const revDs = datasets[datasets.length - 1];
        revDs.data = cappedRevenue;
        allSpend.push(...cappedRevenue);
      } else {
        allSpend.push(...revenueData);
      }
    }
    const maxY = Math.max(...allSpend.filter((v) => !isNaN(v))) * 1.12;

    function syncDot(chart: ChartType) {
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
      resize(chart: ChartType) {
        syncDot(chart);
      },
      afterRender(chart: ChartType) {
        syncDot(chart);
      },
    };

    const Chart = await ensureChart();
    tp.trajChart = new Chart(canvas.getContext('2d')!, {
      type: 'line',
      data: { labels, datasets },
      plugins: [dotPlugin],
      options: {
        locale: pageLang(),
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
            titleFont: {
              family: chartFontFamily(),
              size: 9,
            },
            bodyFont: {
              family: chartFontFamily(),
              size: 9,
            },
            filter: (item: TooltipItem<'line'>) => item.dataset.label !== '_z',
            callbacks: {
              title: (c: TooltipItem<'line'>[]) =>
                str('js.chart.tooltipTitle', { n: c[0].dataIndex }),
              label: (c: TooltipItem<'line'>) =>
                str('js.chart.tooltipLabel', {
                  label: c.dataset.label ?? '',
                  value: fmtD(c.parsed.y ?? 0),
                }),
            },
          },
        },
        scales: {
          x: {
            grid: { color: borderLight + '33', lineWidth: 0.5 },
            ticks: {
              color: txtMuted,
              font: {
                family: chartFontFamily(),
                size: 9,
              },
              maxTicksLimit: 7,
            },
          },
          y: {
            min: 0,
            max: maxY,
            title: {
              display: true,
              text: str('js.chart.yAxis', { symbol: currencySymbol() }),
              color: txtMuted,
              font: { size: 10 },
            },
            grid: { color: borderLight + '33', lineWidth: 0.5 },
            ticks: {
              color: txtMuted,
              font: {
                family: chartFontFamily(),
                size: 9,
              },
              callback: (v: string | number) => fmtD(typeof v === 'number' ? v : Number(v)),
              maxTicksLimit: window.innerWidth < 480 ? 5 : undefined,
            },
          },
        },
      },
    });

    // Legend
    const zoneItems = [
      {
        sw: `background:${underFill};border:1px solid ${underBorder}`,
        l: sHtml('js.legend.underinvest', { n: s.zones.underinvest }),
      },
      {
        sw: `background:${aheadFill};border:1px solid ${aheadBorder}`,
        l: sHtml('js.legend.ahead', { lo: s.zones.underinvest, hi: s.zones.lo }),
      },
      {
        sw: `background:${bandFill};border:1px solid ${bandBorder}`,
        l: sHtml('js.legend.healthy', { lo: s.zones.lo, hi: s.zones.hi }),
      },
      {
        sw: `background:${aboveFill};border:1px solid ${aboveBorder}`,
        l: sHtml('js.legend.caution', { hi: s.zones.hi }),
      },
    ];
    const seriesItems: { cls: string; sw: string; l: string }[] = [
      { cls: 'tp-tleg--line', sw: `border-color:${zoneCol}`, l: sHtml('js.chart.monthlySpend') },
      { cls: 'tp-tleg--dot', sw: `border-color:${zoneCol}`, l: sHtml('js.legend.position') },
    ];
    if (histLen > 0) {
      seriesItems.push({
        cls: 'tp-tleg--dot',
        sw: `border-color:${zoneCol}`,
        l: sHtml('js.legend.historical'),
      });
    }
    if (tp.baselineResult) {
      const baseZoneCol = getStyle(zoneColorVar(tp.baselineResult.zone));
      seriesItems.push({
        cls: 'tp-tleg--line tp-tleg--dashed',
        sw: `border-color:${baseZoneCol}80`,
        l: sHtml('js.chart.baselineSpend'),
      });
    }
    for (const scenario of tp.scenarios) {
      const scenCol = getStyle(zoneColorVar(scenario.result.zone));
      seriesItems.push({
        cls: 'tp-tleg--line tp-tleg--dashed',
        sw: `border-color:${scenCol}80`,
        l: escapeHtml(scenario.name),
      });
    }
    if (s.frame === 'convergence') {
      seriesItems.push({
        cls: 'tp-tleg--line tp-tleg--dashed',
        sw: `border-color:${revLineCol}`,
        l: sHtml('js.chart.monthlyRevenue'),
      });
    }
    const renderItem = (x: { cls?: string; sw: string; l: string }) =>
      `<div class="tp-tleg ${x.cls || ''}"><div class="tp-tleg__sw" style="${x.sw}"></div>${x.l}</div>`;
    const legend = g('traj-legend');
    if (legend) {
      legend.innerHTML =
        `<div class="tp-tleg-group tp-tleg-group--zones">${zoneItems.map(renderItem).join('')}</div>` +
        `<div class="tp-tleg-group tp-tleg-group--series">${seriesItems.map(renderItem).join('')}</div>`;
    }
  } catch (error) {
    Sentry.captureException(error, { tags: { area: 'techpar-calculation' } });
  }
}

/**
 * The Tech Debt Calculator in the page's locale. The template resolves it with
 * `localizedHref` (scripts never build locale paths); the English path is the
 * fallback when there is no shell, as in the jsdom tests.
 */
function techDebtHref(): string {
  const shell = document.querySelector<HTMLElement>('[data-techpar]');
  return shell?.dataset.techDebtHref ?? '/hub/tools/tech-debt-calculator/';
}
