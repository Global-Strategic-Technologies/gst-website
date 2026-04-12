/**
 * TechPar UI — Chart.js rendering for analysis and trajectory tabs.
 */
import { Chart, registerables } from 'chart.js';
import type { ChartDataset, TooltipItem } from 'chart.js';
import {
  buildTrajectory,
  buildHistoricalTrajectory,
  zoneColorVar,
  zoneBgVar,
  zoneLabel,
  kpiClass,
  formatPercent,
} from '../techpar-engine';
import type { TechParInputs, TechParResult, StageConfig } from '../techpar-engine';
import { SIGNAL_COPY } from '../../data/techpar/signal-copy';
import { INDUSTRY_NOTES } from '../../data/techpar/industry-notes';
import { RECOMMENDATIONS } from '../../data/techpar/recommendations';
import { tp } from './state';
import { g, $$, getInput, getStyle, fmtD, buildInputs, renderScenarios } from './dom';

Chart.register(...registerables);

// ─── Analysis render ──────────────────────────────────────
export function renderAnalysis(r: TechParResult, updateAll: () => void) {
  const zoneCol = getStyle(zoneColorVar(r.zone));
  const zoneBg = getStyle(zoneBgVar(r.zone));
  const s = r.stageConfig;
  const gaapEl = document.querySelector('[data-input="gaapChk"]') as HTMLInputElement;
  const isGAAP = gaapEl?.checked ?? false;

  // Hero number
  const heroNum = g('hero-num');
  if (heroNum) {
    let heroText = formatPercent(r.totalTechPct);
    if (tp.baselineResult) {
      const delta = r.totalTechPct - tp.baselineResult.totalTechPct;
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
  const bw = Math.min((r.totalTechPct / maxB) * 100, 100);
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

  // Benchmark table
  const ratio = r.totalTechPct;
  let ratioMatched = false;
  $$('[data-bench-row]').forEach((tr) => {
    const el = tr as HTMLElement;
    const isStage = el.dataset.benchRow === tp.stageKey;
    tr.classList.toggle('bench-row--active', isStage);

    const firstTd = el.querySelector('td')!;
    firstTd.querySelectorAll('.bench-label').forEach((b) => b.remove());

    if (isStage) {
      firstTd.insertAdjacentHTML(
        'beforeend',
        ' <span class="bench-label bench-label--stage">Your stage</span>'
      );
    }

    if (!ratioMatched && el.dataset.bench) {
      const [lo, hi] = el.dataset.bench.split('-').map(Number);
      if (ratio >= lo && ratio <= hi) {
        ratioMatched = true;
        firstTd.insertAdjacentHTML(
          'beforeend',
          ' <span class="bench-label bench-label--score">Your ratio</span>'
        );
      }
    }
  });

  // Industry context
  const industryData = INDUSTRY_NOTES[tp.industry];
  const industryDisc = g('industry-disc');
  if (industryDisc) industryDisc.textContent = industryData.disclaimer;
  const industryNote = g('industry-note');
  if (industryNote) {
    if (tp.industry !== 'saas' && industryData.note) {
      industryNote.textContent = industryData.note;
      industryNote.style.display = 'block';
    } else {
      industryNote.style.display = 'none';
    }
  }

  // Signal card
  const copy = SIGNAL_COPY[tp.stageKey as TechParInputs['stage']]?.[r.zone];
  const sigStage = g('sig-stage');
  if (sigStage) sigStage.textContent = s.label;
  const sigZone = g('sig-zone');
  if (sigZone) {
    sigZone.textContent = zoneLabel(r.zone);
    sigZone.style.color = zoneCol;
  }
  const sigHead = g('sig-head');
  if (sigHead) {
    sigHead.textContent = copy?.headline || '';
    sigHead.style.color = zoneCol;
  }
  const sigBody = g('sig-body');
  if (sigBody) sigBody.textContent = copy?.body || '';
  const sigMets = g('sig-mets');
  const sigDiv = g('sig-div');
  const metricsHtml = buildMetrics(r, zoneCol, s);
  if (sigMets) sigMets.innerHTML = metricsHtml;
  if (sigDiv) sigDiv.style.display = metricsHtml ? '' : 'none';

  // Recommendations
  const recsContainer = g('recommendations');
  const recsList = g('recs-list');
  if (recsContainer && recsList) {
    const actionableZone = r.zone !== 'healthy' && r.zone !== 'ahead';
    const recs = actionableZone
      ? RECOMMENDATIONS[tp.stageKey as TechParInputs['stage']]?.[r.zone]
      : null;
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
      unit: string = 'pp'
    ) => {
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
    cells += kc(
      'Infra hosting',
      formatPercent(r.kpis.infraHostingPct),
      `bench ${s.benchmarks.infraHosting[0]}\u2013${s.benchmarks.infraHosting[1]}%`,
      kpiClass(r.kpis.infraHostingPct, s.benchmarks.infraHosting[0], s.benchmarks.infraHosting[1]),
      deltaHtml(r.kpis.infraHostingPct, br?.kpis.infraHostingPct)
    );
    if (r.kpis.infraPersonnelPct !== null)
      cells += kc(
        'Infra personnel',
        formatPercent(r.kpis.infraPersonnelPct),
        `bench ${s.benchmarks.infraPersonnel[0]}\u2013${s.benchmarks.infraPersonnel[1]}%`,
        kpiClass(
          r.kpis.infraPersonnelPct,
          s.benchmarks.infraPersonnel[0],
          s.benchmarks.infraPersonnel[1]
        ),
        deltaHtml(r.kpis.infraPersonnelPct, br?.kpis.infraPersonnelPct)
      );
    if (r.kpis.rdOpExPct !== null)
      cells += kc(
        'R&D OpEx',
        formatPercent(r.kpis.rdOpExPct),
        `bench ${s.benchmarks.rdOpEx[0]}\u2013${s.benchmarks.rdOpEx[1]}%`,
        kpiClass(r.kpis.rdOpExPct, s.benchmarks.rdOpEx[0], s.benchmarks.rdOpEx[1]),
        deltaHtml(r.kpis.rdOpExPct, br?.kpis.rdOpExPct)
      );
    if (r.kpis.rdCapExPct !== null)
      cells += kc(
        'R&D CapEx % rev',
        formatPercent(r.kpis.rdCapExPct),
        'capitalized dev',
        '',
        deltaHtml(r.kpis.rdCapExPct, br?.kpis.rdCapExPct)
      );
    if (r.kpis.rdCapExOfRD !== null)
      cells += kc(
        'CapEx of total R&D',
        formatPercent(r.kpis.rdCapExOfRD),
        `bench ${s.benchmarks.rdCapExOfRD[0]}\u2013${s.benchmarks.rdCapExOfRD[1]}%`,
        '',
        deltaHtml(r.kpis.rdCapExOfRD, br?.kpis.rdCapExOfRD)
      );
    cells += kc(
      'Blended infra',
      formatPercent(r.kpis.blendedInfra),
      'hosting + personnel',
      '',
      deltaHtml(r.kpis.blendedInfra, br?.kpis.blendedInfra)
    );
    if (r.kpis.revenuePerEngineer !== null)
      cells += kc('Revenue / engineer', fmtD(r.kpis.revenuePerEngineer), 'ARR per engineering FTE');
    if (r.kpis.engPctOfRD !== null)
      cells += kc(
        'Engineering % R&D',
        formatPercent(r.kpis.engPctOfRD),
        '',
        '',
        deltaHtml(r.kpis.engPctOfRD, br?.kpis.engPctOfRD)
      );
    if (r.kpis.prodPctOfRD !== null)
      cells += kc(
        'Product % R&D',
        formatPercent(r.kpis.prodPctOfRD),
        '',
        '',
        deltaHtml(r.kpis.prodPctOfRD, br?.kpis.prodPctOfRD)
      );
    kpiGrid.innerHTML = cells;
  }

  // Deep Dive prompt
  const ddPrompt = g('deepdive-prompt');
  if (ddPrompt) {
    const rdCat = r.categories.find((c) => c.label === 'R&D OpEx');
    const showPrompt =
      tp.mode === 'quick' && rdCat && (rdCat.zone === 'elevated' || rdCat.zone === 'critical');
    if (showPrompt) {
      ddPrompt.style.display = 'block';
      ddPrompt.innerHTML = `R&D spend is ${zoneLabel(rdCat.zone).toLowerCase()}. <button class="tp-deepdive-prompt__btn" type="button">Switch to Deep Dive mode</button> to break down engineering, product, and tooling costs.`;
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

  // Cross-link
  const crossLink = g('cross-link');
  if (crossLink) {
    const rdCat = r.categories.find((c) => c.label === 'R&D OpEx');
    if (
      rdCat &&
      (rdCat.zone === 'elevated' || rdCat.zone === 'critical' || rdCat.zone === 'above')
    ) {
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
      const annualDrag = (buildInputs()!.arr * (r.totalTechPct - s.zones.hi)) / 100;
      const exitDrag = annualDrag * exitMult;
      ctxBlock.innerHTML = `You are <strong style="color:var(--text-light-primary)">${excessPct}%</strong> above the ${s.zones.hi}% ceiling — <strong style="color:var(--color-primary)">${fmtD(annualDrag)}</strong> in annual excess spend. At a ${exitMult}&times; revenue multiple that represents <strong style="color:var(--color-primary)">${fmtD(exitDrag)}</strong> in recoverable exit value. Identify the highest-cost categories above and prioritise optimisation there first.`;
    } else if (isUnder) {
      const floorPct = s.zones.lo;
      const annualGap = (buildInputs()!.arr * (floorPct - r.totalTechPct)) / 100;
      ctxBlock.innerHTML = `Spend is <strong style="color:var(--text-light-primary)">${fmtD(annualGap)}</strong> per year below the ${floorPct}% benchmark floor. This gap often reflects deferred investment in engineering capacity or infrastructure that surfaces later as reliability issues, slower product velocity, or a higher cost to remediate at scale.`;
    } else {
      ctxBlock.innerHTML = '';
    }
  }

  renderScenarios(r, updateAll);
}

export function buildMetrics(r: TechParResult, col: string, s: StageConfig): string {
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

// ─── Trajectory render ────────────────────────────────────
export function renderTrajectory(r: TechParResult) {
  const s = r.stageConfig;
  const zoneCol = getStyle(zoneColorVar(r.zone));

  // Note banner
  const note = g('traj-note');
  if (note) {
    const isUnder = r.zone === 'underinvest' || r.zone === 'ahead';
    note.className =
      'tp-traj-note' + (s.frame === 'convergence' ? ' tp-traj-note--convergence' : '');
    const baseNote = isUnder && s.noteUnder ? s.noteUnder : s.note;
    note.textContent =
      baseNote +
      ' This projection assumes a constant technology cost ratio. Actual trajectory depends on optimization and scaling decisions.';
  }

  const inputs = buildInputs();
  if (!inputs) return;
  const traj = buildTrajectory(inputs, s);

  const validHist = tp.historicalPoints.filter((p) => p.arr > 0 && p.totalTechSpend > 0);
  const hist = validHist.length
    ? buildHistoricalTrajectory(validHist, s, inputs.arr, r.total)
    : null;
  const histLen = hist ? hist.labels.length : 0;

  const labels = hist ? [...hist.labels, ...traj.labels] : traj.labels;
  const spend = hist ? [...hist.spend, ...traj.spend] : traj.spend;
  const bandLoData = hist ? [...hist.bandLo, ...traj.bandLo] : traj.bandLo;
  const bandHiData = hist ? [...hist.bandHi, ...traj.bandHi] : traj.bandHi;
  const underFloorData = hist ? [...hist.underFloor, ...traj.underFloor] : traj.underFloor;
  const aboveCeilingData = hist ? [...hist.aboveCeiling, ...traj.aboveCeiling] : traj.aboveCeiling;
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
      label: 'Underinvestment floor',
      data: underFloorData,
      borderColor: underBorder,
      borderWidth: 1,
      borderDash: [3, 3],
      pointRadius: 0,
      fill: { target: '-1', above: underFill, below: 'transparent' },
      tension: 0.3,
    },
    {
      label: 'Efficiency band',
      data: bandLoData,
      borderColor: aheadBorder,
      borderWidth: 1,
      borderDash: [3, 3],
      pointRadius: 0,
      fill: { target: '-1', above: aheadFill, below: 'transparent' },
      tension: 0.3,
    },
    {
      label: 'Healthy range',
      data: bandHiData,
      borderColor: bandBorder,
      borderWidth: 1,
      borderDash: [4, 3],
      pointRadius: 0,
      fill: { target: '-1', above: bandFill, below: 'transparent' },
      tension: 0.3,
    },
    {
      label: 'Caution ceiling',
      data: aboveCeilingData,
      borderColor: aboveBorder,
      borderWidth: 1,
      borderDash: [3, 3],
      pointRadius: 0,
      fill: { target: '-1', above: aboveFill, below: 'transparent' },
      tension: 0.3,
    },
    {
      label: 'Monthly tech spend',
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
    resize(chart: Chart) {
      syncDot(chart);
    },
    afterRender(chart: Chart) {
      syncDot(chart);
    },
  };

  tp.trajChart = new Chart(canvas.getContext('2d')!, {
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
          titleFont: {
            family: getStyle('--font-family') || "'Helvetica Neue', Arial, sans-serif",
            size: 9,
          },
          bodyFont: {
            family: getStyle('--font-family') || "'Helvetica Neue', Arial, sans-serif",
            size: 9,
          },
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
          ticks: {
            color: txtMuted,
            font: {
              family: getStyle('--font-family') || "'Helvetica Neue', Arial, sans-serif",
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
            text: `Monthly spend (${tp.currencySymbol})`,
            color: txtMuted,
            font: { size: 10 },
          },
          grid: { color: borderLight + '33', lineWidth: 0.5 },
          ticks: {
            color: txtMuted,
            font: {
              family: getStyle('--font-family') || "'Helvetica Neue', Arial, sans-serif",
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
      l: `Underinvestment zone (<${s.zones.underinvest}%)`,
    },
    {
      sw: `background:${aheadFill};border:1px solid ${aheadBorder}`,
      l: `Ahead (${s.zones.underinvest}\u2013${s.zones.lo}%)`,
    },
    {
      sw: `background:${bandFill};border:1px solid ${bandBorder}`,
      l: `Healthy range (${s.zones.lo}\u2013${s.zones.hi}%)`,
    },
    {
      sw: `background:${aboveFill};border:1px solid ${aboveBorder}`,
      l: `Caution zone (>${s.zones.hi}%)`,
    },
  ];
  const seriesItems: { cls: string; sw: string; l: string }[] = [
    { cls: 'tp-tleg--line', sw: `border-color:${zoneCol}`, l: 'Monthly tech spend' },
    { cls: 'tp-tleg--dot', sw: `border-color:${zoneCol}`, l: 'Your position today' },
  ];
  if (histLen > 0) {
    seriesItems.push({
      cls: 'tp-tleg--dot',
      sw: `border-color:${zoneCol}`,
      l: 'Historical actuals',
    });
  }
  if (tp.baselineResult) {
    const baseZoneCol = getStyle(zoneColorVar(tp.baselineResult.zone));
    seriesItems.push({
      cls: 'tp-tleg--line tp-tleg--dashed',
      sw: `border-color:${baseZoneCol}80`,
      l: 'Baseline spend',
    });
  }
  for (const scenario of tp.scenarios) {
    const scenCol = getStyle(zoneColorVar(scenario.result.zone));
    seriesItems.push({
      cls: 'tp-tleg--line tp-tleg--dashed',
      sw: `border-color:${scenCol}80`,
      l: scenario.name,
    });
  }
  if (s.frame === 'convergence') {
    seriesItems.push({
      cls: 'tp-tleg--line tp-tleg--dashed',
      sw: `border-color:${revLineCol}`,
      l: 'Monthly revenue',
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
}
