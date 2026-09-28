import {
  DEFAULT_STATE,
  calculateResults,
  getMaturityLevel,
  getRecommendations,
  getQuickWins,
  encodeState,
  decodeState,
  buildSummaryText,
  buildExportPayload,
  compareSnapshots,
  contextualizeScore,
  findMatchingRange,
} from '../../utils/icg-engine';

import type { ICGState, ICGSnapshot, CompanyStage } from '../../utils/icg-engine';
import { trackEvent } from '../../utils/analytics';

import { DOMAINS, ANSWER_OPTIONS } from '../../data/infrastructure-cost-governance/domains';
import { RECOMMENDATIONS } from '../../data/infrastructure-cost-governance/recommendations';
import { copyWithFeedback } from '../../utils/copy-feedback';
import { escapeHtml } from '../../utils/escape-html';
import { emailHref, gaugeArcSVG, maturityDescription, radarChartSVG } from './logic';

// ─── DOM helpers ────────────────────────────────────────────────────────────

function qs<T extends HTMLElement>(sel: string): T {
  return document.querySelector(sel) as T;
}

// ─── URL state ──────────────────────────────────────────────────────────────

function pushUrlState(state: ICGState): void {
  const params = new URLSearchParams({ s: encodeState(state) });
  history.replaceState(null, '', '?' + params.toString());
}

function readUrlState(): Partial<ICGState> | null {
  const s = new URLSearchParams(window.location.search).get('s');
  return s ? decodeState(s) : null;
}

// ─── State ──────────────────────────────────────────────────────────────────

const state: ICGState = { ...DEFAULT_STATE, dismissed: [] };
let reviewMode = false;
let hasPendingResume = false;

// ─── localStorage persistence ──────────────────────────────────────────────

const ICG_STORAGE_KEY = 'icg-assessment-state';

function saveToStorage(s: ICGState): void {
  try {
    localStorage.setItem(ICG_STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* private browsing */
  }
}

function loadFromStorage(): ICGState | null {
  try {
    const raw = localStorage.getItem(ICG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (typeof parsed.currentStep !== 'number') return null;
    return parsed as ICGState;
  } catch {
    return null;
  }
}

function clearStorage(): void {
  try {
    localStorage.removeItem(ICG_STORAGE_KEY);
  } catch {
    /* noop */
  }
}

// ─── Snapshot storage ───────────────────────────────────────────────────────

const ICG_SNAPSHOTS_KEY = 'icg-snapshots';
const MAX_SNAPSHOTS = 3;

function loadSnapshots(): ICGSnapshot[] {
  try {
    const raw = localStorage.getItem(ICG_SNAPSHOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSnapshot(snap: ICGSnapshot): void {
  try {
    const all = loadSnapshots();
    all.push(snap);
    if (all.length > MAX_SNAPSHOTS) all.shift();
    localStorage.setItem(ICG_SNAPSHOTS_KEY, JSON.stringify(all));
  } catch {
    /* noop */
  }
}

function deleteSnapshot(id: string): void {
  try {
    const all = loadSnapshots().filter((s) => s.id !== id);
    localStorage.setItem(ICG_SNAPSHOTS_KEY, JSON.stringify(all));
  } catch {
    /* noop */
  }
}

function clearAllSnapshots(): void {
  try {
    localStorage.removeItem(ICG_SNAPSHOTS_KEY);
  } catch {
    /* noop */
  }
}

// ─── Browser reads passed into logic.ts ─────────────────────────────────────

// Resolve a CSS variable to a concrete colour for the gauge's SVG attributes.
// Every maturity colour is a defined token, so the fallback only matters if a
// token goes missing; currentColor keeps it on the theme rather than a hex.
function resolveColor(color: string): string {
  return color.startsWith('var(')
    ? getComputedStyle(document.documentElement).getPropertyValue(color.slice(4, -1)).trim() ||
        'currentColor'
    : color;
}

// ─── Render ─────────────────────────────────────────────────────────────────

function render(): void {
  const landingView = qs<HTMLElement>('[data-view="landing"]');
  const wizardView = qs<HTMLElement>('[data-view="wizard"]');
  const resultsView = qs<HTMLElement>('[data-view="results"]');
  const comparisonView = qs<HTMLElement>('[data-view="comparison"]');

  // Toggle views
  landingView.classList.toggle('is-hidden', state.currentStep !== 0);
  wizardView.classList.toggle('is-hidden', state.currentStep < 1 || state.currentStep > 6);
  resultsView.classList.toggle('is-hidden', state.currentStep !== 7);
  comparisonView.classList.add('is-hidden');

  // Hide the back link during wizard/results — at every viewport, not just
  // mobile: the toggle has no media-query scope. It was inert until 2026-07-29
  // (`.icg-back-link { display: inline-block }` out-specified `.is-hidden`), so
  // this reads as new behaviour even though the intent is original. Returning to
  // the landing view restores it; both directions are pinned by E2E.
  const backLink = document.querySelector('.icg-back-link') as HTMLElement | null;
  if (backLink) backLink.classList.toggle('is-hidden', state.currentStep !== 0);

  if (state.currentStep >= 1 && state.currentStep <= 6) {
    renderWizard();
  } else if (state.currentStep === 7) {
    renderResults();
  }

  pushUrlState(state);
  if (!hasPendingResume) {
    saveToStorage(state);
  }
}

function renderWizard(): void {
  const domain = DOMAINS[state.currentStep - 1];

  // Progress
  const fill = qs<HTMLElement>('[data-progress-fill]');
  const label = qs<HTMLElement>('[data-progress-label]');
  fill.style.width = `${(state.currentStep / 6) * 100}%`;
  label.textContent = `${state.currentStep} of 6`;

  // Domain header
  qs<HTMLElement>('[data-domain-label]').textContent = `Domain ${state.currentStep}`;
  qs<HTMLElement>('[data-domain-name]').textContent = domain.name;
  qs<HTMLElement>('[data-domain-desc]').textContent = domain.description;

  // Foundational badge and note
  const badge = qs<HTMLElement>('[data-foundational-badge]');
  const note = qs<HTMLElement>('[data-foundational-note]');
  badge.classList.toggle('is-hidden', !domain.foundational);
  note.classList.toggle('is-hidden', !domain.foundational);

  // Questions — use global numbering (1–20) instead of per-domain
  const globalOffset = DOMAINS.slice(0, state.currentStep - 1).reduce(
    (sum, d) => sum + d.questions.length,
    0
  );
  const container = qs<HTMLElement>('[data-questions-container]');
  container.innerHTML = domain.questions
    .map((q, qi) => {
      const unsureSel = state.answers[q.id] === -1;
      const optBtns =
        ANSWER_OPTIONS.map((opt) => {
          const sel = state.answers[q.id] === opt.score;
          return `<button class="brutal-choice-btn${sel ? ' brutal-choice-btn--selected' : ''}" data-answer="${q.id}" data-score="${opt.score}" type="button" aria-pressed="${sel}">${opt.label}</button>`;
        }).join('') +
        `<button class="brutal-choice-btn brutal-choice-btn--unsure${unsureSel ? ' brutal-choice-btn--selected' : ''}" data-answer="${q.id}" data-score="-1" type="button" aria-pressed="${unsureSel}">Not sure</button>`;
      return `
    <div class="icg-question-card">
      <p class="icg-question-text">
        <span class="icg-question-num">${globalOffset + qi + 1}.</span>${q.text}
      </p>
      <div class="icg-options-row">${optBtns}</div>
      ${q.rationale ? `<details class="icg-rationale"><summary class="icg-rationale__trigger">Why this matters</summary><p class="icg-rationale__text">${q.rationale}</p></details>` : ''}
    </div>`;
    })
    .join('');

  // Wire answer buttons
  container.querySelectorAll('[data-answer]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const qId = (btn as HTMLElement).dataset.answer!;
      const score = Number((btn as HTMLElement).dataset.score);
      state.answers[qId] = score;
      render();
    });
  });

  // Navigation
  const answered = domain.questions.filter((q) => state.answers[q.id] !== undefined).length;
  const canNext = answered === domain.questions.length;

  const backBtn = qs<HTMLButtonElement>('[data-action="back"]');
  const nextBtn = qs<HTMLButtonElement>('[data-action="next"]');

  if (reviewMode) {
    backBtn.textContent = state.currentStep === 1 ? 'Back to results' : 'Previous';
    nextBtn.textContent = state.currentStep === 6 ? 'Back to results' : 'Next domain';
    nextBtn.disabled = false;
  } else {
    backBtn.textContent = state.currentStep === 1 ? 'Back to intro' : 'Previous';
    nextBtn.textContent = state.currentStep === 6 ? 'View results' : 'Next domain';
    nextBtn.disabled = !canNext;
  }
}

function renderResults(): void {
  const result = calculateResults(state, DOMAINS);
  const recs = getRecommendations(state, RECOMMENDATIONS);

  // Gauge
  qs<HTMLElement>('[data-gauge-container]').innerHTML = gaugeArcSVG(
    result.overallScore,
    resolveColor(result.maturityColor)
  );

  // Level and description
  const levelEl = qs<HTMLElement>('[data-score-level]');
  levelEl.textContent = result.maturityLevel;
  levelEl.style.color = result.maturityInk;
  qs<HTMLElement>('[data-score-desc]').textContent = maturityDescription(result.overallScore);

  // Stage context
  const stageCtxEl = qs<HTMLElement>('[data-stage-context]');
  const stageCtx = contextualizeScore(result.overallScore, state.companyStage);
  stageCtxEl.classList.toggle('is-hidden', !stageCtx);
  if (stageCtx) stageCtxEl.textContent = stageCtx;

  // Skipped questions note
  const skippedEl = qs<HTMLElement>('[data-skipped-note]');
  skippedEl.classList.toggle('is-hidden', result.skippedCount === 0);
  if (result.skippedCount > 0) {
    skippedEl.textContent = `${result.skippedCount} of ${result.totalQuestions} questions marked "Not sure" \u2014 these score as zero and may indicate governance blind spots`;
  }

  // Foundational warning
  const warningEl = qs<HTMLElement>('[data-foundational-warning]');
  warningEl.classList.toggle('is-hidden', !result.showFoundationalFlag);
  if (result.showFoundationalFlag) {
    const belowNames = result.domainScores
      .filter((ds) => ds.isFoundational && ds.belowFoundationalThreshold)
      .map((ds) => ds.name);
    qs<HTMLElement>('[data-foundational-warning-title]').textContent =
      `${belowNames.join(' and ')} scored below the foundational threshold`;
    qs<HTMLElement>('[data-foundational-warning-text]').textContent =
      'Without foundational visibility and cost structure in place, scores in other domains may understate the true optimization gap. It is difficult to right-size or govern what you cannot see or attribute.';
  }

  // Domain bars
  // Radar chart
  qs<HTMLElement>('[data-radar-chart]').innerHTML = radarChartSVG(result.domainScores);

  // Rec counts by domain (for domain bar badges)
  const dismissed = new Set(state.dismissed);
  const recCountByDomain: Record<string, number> = {};
  recs
    .filter((r) => !dismissed.has(r.id))
    .forEach((r) => {
      recCountByDomain[r.domain] = (recCountByDomain[r.domain] || 0) + 1;
    });

  // Domain bars
  const barsContainer = qs<HTMLElement>('[data-domain-bars]');
  barsContainer.innerHTML = result.domainScores
    .map((ds) => {
      const { color, ink } = getMaturityLevel(ds.score);
      const { level } = getMaturityLevel(ds.score);
      const recCount = recCountByDomain[ds.domainId] || 0;
      const recBadge =
        recCount > 0
          ? `<span class="icg-domain-bar__rec-count">${recCount} rec${recCount > 1 ? 's' : ''}</span>`
          : '';
      const skippedBadge =
        ds.skippedCount > 0
          ? `<span class="icg-domain-bar__skipped">${ds.skippedCount} skipped</span>`
          : '';
      const hasLink = recCount > 0;
      return `
    <div class="icg-domain-bar"${hasLink ? ` data-domain-link="${ds.domainId}"` : ''}>
      <div class="icg-domain-bar__header">
        <span class="icg-domain-bar__name">${ds.name}</span>
        <span class="icg-domain-bar__score" style="color:${ink}">${ds.score} <span class="icg-domain-bar__maturity">${level}</span>${recBadge}${skippedBadge}</span>
      </div>
      <div class="icg-domain-bar__track">
        <div class="icg-domain-bar__fill" style="width:${ds.score}%;background:${color}"></div>
      </div>
    </div>`;
    })
    .join('');

  // Wire domain bar click-to-scroll
  barsContainer.querySelectorAll('[data-domain-link]').forEach((bar) => {
    bar.addEventListener('click', () => {
      const domainId = (bar as HTMLElement).dataset.domainLink;
      const target = document.querySelector(`[data-rec-domain="${domainId}"]`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  // Benchmark highlighting — show "YOUR RANGE" badge on the first matching range row
  const matchedRange = findMatchingRange(result.overallScore);
  document.querySelectorAll<HTMLElement>('[data-bench]').forEach((td) => {
    const range = td.dataset.bench!;
    const [lo, hi] = range.split('-').map(Number);
    const inRange = matchedRange !== null && matchedRange.low === lo && matchedRange.high === hi;
    td.classList.toggle('in-range', inRange);
    td.textContent = range;
    const firstTd = td.closest('tr')?.querySelector('td');
    if (firstTd) {
      const existingScore = firstTd.querySelector('.brutal-bench-table__label--score');
      if (existingScore) existingScore.remove();
      if (inRange) {
        firstTd.insertAdjacentHTML(
          'beforeend',
          ' <span class="brutal-bench-table__label brutal-bench-table__label--score">Your range</span>'
        );
      }
    }
  });

  // Benchmark stage row highlighting — show "YOUR STAGE" badge
  document.querySelectorAll<HTMLElement>('[data-stage-row]').forEach((tr) => {
    const isActive = tr.dataset.stageRow === state.companyStage;
    tr.classList.toggle('bench-row--active', isActive);
    const firstTd = tr.querySelector('td')!;
    const existingLabel = firstTd.querySelector('.brutal-bench-table__label--stage');
    if (existingLabel) existingLabel.remove();
    if (isActive) {
      firstTd.insertAdjacentHTML(
        'beforeend',
        ' <span class="brutal-bench-table__label brutal-bench-table__label--stage">Your stage</span>'
      );
    }
  });

  // Email link
  const emailLink = qs<HTMLAnchorElement>('[data-action="email"]');
  emailLink.href = emailHref('results', window.location.href, result.overallScore);
  emailLink.onclick = () => {
    trackEvent({
      event: 'icg_send_email',
      category: 'engagement',
      location: 'results',
      score: result.overallScore,
    });
  };

  // Quick wins
  const quickWinsContainer = qs<HTMLElement>('[data-quick-wins]');
  const quickWins = getQuickWins(recs);
  if (quickWins.length > 0) {
    quickWinsContainer.classList.remove('is-hidden');
    quickWinsContainer.innerHTML = `
    <div class="brutal-tool-shell__section-label">Start here</div>
    ${quickWins
      .map(
        (qw) => `
      <div class="icg-quick-win-item">
        <span class="brutal-rec-card__badge brutal-rec-card__badge--${qw.impact}">${qw.impact}</span>
        <span class="brutal-rec-card__badge brutal-rec-card__badge--effort">${qw.effort.replace('-', ' ')}</span>
        <span class="icg-quick-win-item__title">${qw.title}</span>
      </div>
    `
      )
      .join('')}
  `;
  } else {
    quickWinsContainer.classList.add('is-hidden');
  }

  // Recommendations
  const recsContainer = qs<HTMLElement>('[data-recs-container]');
  if (recs.length === 0) {
    recsContainer.innerHTML =
      '<div class="icg-recs-empty">No recommendations triggered. All domains scored above threshold.</div>';
  } else {
    const activeCount = recs.filter((r) => !dismissed.has(r.id)).length;
    const high = recs.filter((r) => r.impact === 'high');
    const med = recs.filter((r) => r.impact === 'medium');
    const low = recs.filter((r) => r.impact === 'low');

    const renderGroup = (items: typeof recs, label: string, labelColor: string) => {
      if (items.length === 0) return '';
      return `
      <div class="icg-recs-group">
        <div class="icg-recs-group__label" style="color:${labelColor}">${label} impact</div>
        ${items
          .map((rec) => {
            const isDismissed = dismissed.has(rec.id);
            return `
          <div class="brutal-rec-card${state.expanded?.includes(rec.id) ? '' : ' is-collapsed'}${isDismissed ? ' is-dismissed' : ''}" data-rec-id="${rec.id}" data-rec-domain="${rec.domain}" data-rec-toggle>
            <div class="brutal-rec-card__body">
              <div class="brutal-rec-card__title"><span class="brutal-rec-card__badge brutal-rec-card__badge--${rec.impact}">${rec.impact}</span><span class="brutal-rec-card__badge brutal-rec-card__badge--effort">${rec.effort.replace('-', ' ')}</span><button class="brutal-rec-card__na" data-dismiss="${rec.id}" type="button" title="${isDismissed ? 'Restore this recommendation to the active list' : 'Mark as not applicable. Dismissed items are excluded from the printed report.'}">${isDismissed ? 'Restore' : 'N/A'}</button><span class="brutal-rec-card__text">${rec.title}<svg class="delta-chevron" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M32 12 L52 52 L12 52 Z" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="miter"/></svg></span></div>
              <div class="brutal-rec-card__desc">${rec.description}</div>
            </div>
          </div>`;
          })
          .join('')}
      </div>`;
    };

    recsContainer.innerHTML = `
    <div class="brutal-tool-shell__section-label">Prioritized recommendations (${activeCount} of ${recs.length})</div>
    ${renderGroup(high, 'High', '#E24B4A')}
    ${renderGroup(med, 'Medium', 'var(--color-secondary)')}
    ${renderGroup(low, 'Low', 'var(--text-muted)')}
  `;

    // Wire expand/collapse toggle on the entire card
    recsContainer.querySelectorAll('[data-rec-toggle]').forEach((card) => {
      card.addEventListener('click', () => {
        const recId = (card as HTMLElement).dataset.recId!;
        const isNowCollapsed = card.classList.toggle('is-collapsed');
        if (!state.expanded) state.expanded = [];
        if (isNowCollapsed) {
          state.expanded = state.expanded.filter((id) => id !== recId);
        } else {
          if (!state.expanded.includes(recId)) state.expanded.push(recId);
        }
        pushUrlState(state);
      });
    });

    // Wire N/A dismiss buttons (stop propagation so card doesn't toggle)
    recsContainer.querySelectorAll('[data-dismiss]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const recId = (btn as HTMLElement).dataset.dismiss!;
        const idx = state.dismissed.indexOf(recId);
        const action = idx === -1 ? 'dismiss' : 'restore';
        if (idx === -1) {
          state.dismissed.push(recId);
        } else {
          state.dismissed.splice(idx, 1);
        }
        trackEvent({
          event: 'icg_recommendation_toggle',
          category: 'engagement',
          action,
          recommendation_id: recId,
        });
        renderResults();
        pushUrlState(state);
      });
    });
  }
}

// ─── Init ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Restore state: URL params take priority, then localStorage fallback
  const urlState = readUrlState();
  if (urlState && (urlState.currentStep ?? 0) > 0) {
    // URL has in-progress state — restore directly
    Object.assign(state, urlState);
  } else {
    const saved = loadFromStorage();
    if (saved && saved.currentStep > 0) {
      // localStorage has in-progress state — show resume prompt
      hasPendingResume = true;
      const prompt = qs<HTMLElement>('[data-resume-prompt]');
      prompt.classList.remove('is-hidden');

      qs<HTMLElement>('[data-action="resume"]').addEventListener('click', () => {
        Object.assign(state, saved);
        prompt.classList.add('is-hidden');
        hasPendingResume = false;
        render();
      });

      qs<HTMLElement>('[data-action="discard"]').addEventListener('click', () => {
        clearStorage();
        prompt.classList.add('is-hidden');
        hasPendingResume = false;
      });
    }
  }

  render();

  // ── Stage selector ──
  function syncStageCards(): void {
    document
      .querySelectorAll('[data-stage]')
      .forEach((b) =>
        b.classList.toggle(
          'brutal-option-card--selected-outline',
          (b as HTMLElement).dataset.stage === state.companyStage
        )
      );
  }
  syncStageCards();

  document.querySelectorAll('[data-stage]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const stage = (btn as HTMLElement).dataset.stage as CompanyStage;
      state.companyStage = state.companyStage === stage ? undefined : stage;
      syncStageCards();
    });
  });

  // ── Global actions ──
  qs<HTMLElement>('[data-action="start"]').addEventListener('click', () => {
    trackEvent({ event: 'icg_assessment_start', category: 'engagement' });
    state.currentStep = 1;
    render();
  });

  qs<HTMLElement>('[data-action="back"]').addEventListener('click', () => {
    if (reviewMode && state.currentStep === 1) {
      reviewMode = false;
      state.currentStep = 7;
    } else {
      state.currentStep = state.currentStep > 1 ? state.currentStep - 1 : 0;
    }
    render();
  });

  qs<HTMLElement>('[data-action="next"]').addEventListener('click', () => {
    if (reviewMode && state.currentStep === 6) {
      reviewMode = false;
      state.currentStep = 7;
      render();
      qs<HTMLElement>('[data-icg]').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const nextStep = state.currentStep < 6 ? state.currentStep + 1 : 7;
    if (!reviewMode) {
      if (nextStep <= 6) {
        trackEvent({
          event: 'icg_domain_advance',
          category: 'engagement',
          domain: DOMAINS[nextStep - 1].name,
          step: nextStep,
        });
      } else {
        const result = calculateResults(state, DOMAINS);
        trackEvent({
          event: 'icg_assessment_complete',
          category: 'engagement',
          score: result.overallScore,
          maturity_level: result.maturityLevel,
        });
      }
    }
    state.currentStep = nextStep;
    render();
    if (nextStep === 7) {
      qs<HTMLElement>('[data-icg]').scrollIntoView({ behavior: 'smooth' });
    }
  });

  qs<HTMLElement>('[data-action="review"]').addEventListener('click', () => {
    trackEvent({ event: 'icg_review_answers', category: 'engagement' });
    reviewMode = true;
    state.currentStep = 1;
    render();
  });

  qs<HTMLElement>('[data-action="reset"]').addEventListener('click', () => {
    trackEvent({ event: 'icg_start_over', category: 'engagement' });
    state.currentStep = 0;
    state.answers = {};
    state.dismissed = [];
    state.expanded = [];
    state.companyStage = undefined;
    clearStorage();
    render();
    syncStageCards();
  });

  qs<HTMLElement>('[data-action="print"]').addEventListener('click', () => {
    trackEvent({ event: 'icg_print', category: 'engagement' });
    window.print();
  });

  qs<HTMLElement>('[data-action="export-json"]').addEventListener('click', () => {
    trackEvent({ event: 'icg_export_json', category: 'engagement' });
    const result = calculateResults(state, DOMAINS);
    const recs = getRecommendations(state, RECOMMENDATIONS).filter(
      (r) => !state.dismissed.includes(r.id)
    );
    const payload = buildExportPayload(state, result, recs);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `icg-assessment-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  qs<HTMLElement>('[data-action="copy-summary"]').addEventListener('click', () => {
    trackEvent({ event: 'icg_copy_summary', category: 'engagement' });
    const btn = qs<HTMLButtonElement>('[data-action="copy-summary"]');
    const result = calculateResults(state, DOMAINS);
    const recs = getRecommendations(state, RECOMMENDATIONS).filter(
      (r) => !state.dismissed.includes(r.id)
    );
    const text = buildSummaryText(state, result, DOMAINS, recs, window.location.href);
    copyWithFeedback(text, btn);
  });

  qs<HTMLElement>('[data-action="copy"]').addEventListener('click', () => {
    trackEvent({ event: 'icg_copy_link', category: 'engagement', location: 'results' });
    const btn = qs<HTMLButtonElement>('[data-action="copy"]');
    copyWithFeedback(window.location.href, btn, { label: 'Link copied' });
  });

  // ── Landing actions ──
  const landingCopy = qs<HTMLButtonElement>('[data-action="landing-copy"]');
  landingCopy.addEventListener('click', () => {
    trackEvent({ event: 'icg_copy_link', category: 'engagement', location: 'landing' });
    copyWithFeedback(window.location.href.split('?')[0], landingCopy, { label: 'Link copied' });
  });

  const landingEmail = qs<HTMLAnchorElement>('[data-action="landing-email"]');
  landingEmail.href = emailHref('landing', window.location.href);
  landingEmail.addEventListener('click', () => {
    trackEvent({ event: 'icg_send_email', category: 'engagement', location: 'landing' });
  });

  // ── Snapshot & comparison ──
  const saveSnapshotBtn = qs<HTMLButtonElement>('[data-action="save-snapshot"]');
  const compareBtn = qs<HTMLButtonElement>('[data-action="compare"]');

  function renderSnapshotManager(): void {
    const snaps = loadSnapshots();
    const manager = qs<HTMLElement>('[data-snapshot-manager]');
    const list = qs<HTMLElement>('[data-snapshot-list]');

    compareBtn.classList.toggle('is-hidden', snaps.length < 2);
    manager.classList.toggle('is-hidden', snaps.length === 0);

    if (snaps.length === 0) return;

    list.innerHTML = snaps
      .map((s) => {
        const decoded = decodeState(s.encodedState);
        const score = decoded?.answers
          ? calculateResults({ ...DEFAULT_STATE, ...decoded }, DOMAINS).overallScore
          : '?';
        return `
      <div class="icg-snapshot-row">
        <span class="icg-snapshot-row__info">
          <span>${escapeHtml(s.label)}</span>
          <span class="icg-snapshot-row__score">${score}/100</span>
        </span>
        <button class="icg-snapshot-row__delete" data-delete-snapshot="${s.id}" type="button" title="Delete this snapshot">&times;</button>
      </div>`;
      })
      .join('');

    // Wire delete buttons
    list.querySelectorAll('[data-delete-snapshot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.deleteSnapshot!;
        deleteSnapshot(id);
        renderSnapshotManager();
      });
    });
  }

  saveSnapshotBtn.addEventListener('click', () => {
    trackEvent({ event: 'icg_save_snapshot', category: 'engagement' });
    const labelInput = qs<HTMLInputElement>('[data-snapshot-label]');
    const customLabel = labelInput.value.trim();
    const defaultLabel = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const snap: ICGSnapshot = {
      id: crypto.randomUUID?.() ?? Date.now().toString(36),
      label: customLabel || defaultLabel,
      timestamp: new Date().toISOString(),
      encodedState: encodeState(state),
    };
    saveSnapshot(snap);
    labelInput.value = '';
    saveSnapshotBtn.textContent = 'Saved!';
    setTimeout(() => {
      saveSnapshotBtn.textContent = 'Save snapshot';
    }, 2000);
    renderSnapshotManager();
  });

  function showComparison(snapA: ICGSnapshot, snapB: ICGSnapshot): void {
    const comparison = compareSnapshots(snapA, snapB, DOMAINS);
    if (!comparison) return;

    const compBody = qs<HTMLElement>('[data-comparison-body]');
    const deltaClass = (d: number) =>
      d > 0 ? 'icg-delta--positive' : d < 0 ? 'icg-delta--negative' : 'icg-delta--neutral';
    const deltaText = (d: number) => (d > 0 ? `+${d}` : `${d}`);

    compBody.innerHTML = `
    <div class="icg-comparison-overall icg-comparison-row">
      <span class="icg-comparison-row__name">Overall score</span>
      <span class="icg-comparison-row__scores">
        <span class="icg-comparison-row__score">${comparison.a.overallScore}</span>
        <span class="icg-comparison-row__score">&rarr;</span>
        <span class="icg-comparison-row__score">${comparison.b.overallScore}</span>
        <span class="icg-delta ${deltaClass(comparison.overallDelta)}">${deltaText(comparison.overallDelta)}</span>
      </span>
    </div>
    <div class="brutal-tool-shell__section-label" style="margin-top:var(--spacing-md)">${escapeHtml(comparison.a.label)} &rarr; ${escapeHtml(comparison.b.label)}</div>
    ${comparison.domainDeltas
      .map(
        (dd) => `
      <div class="icg-comparison-row">
        <span class="icg-comparison-row__name">${dd.name}</span>
        <span class="icg-comparison-row__scores">
          <span class="icg-comparison-row__score">${dd.scoreA}</span>
          <span class="icg-comparison-row__score">&rarr;</span>
          <span class="icg-comparison-row__score">${dd.scoreB}</span>
          <span class="icg-delta ${deltaClass(dd.delta)}">${deltaText(dd.delta)}</span>
        </span>
      </div>
    `
      )
      .join('')}
  `;

    qs<HTMLElement>('[data-view="results"]').classList.add('is-hidden');
    qs<HTMLElement>('[data-view="comparison"]').classList.remove('is-hidden');
    qs<HTMLElement>('[data-icg]').scrollIntoView({ behavior: 'smooth' });
  }

  compareBtn.addEventListener('click', () => {
    trackEvent({ event: 'icg_compare', category: 'engagement' });
    const snaps = loadSnapshots();
    if (snaps.length < 2) return;

    // Auto-compare when exactly 2 snapshots
    if (snaps.length === 2) {
      showComparison(snaps[0], snaps[1]);
      return;
    }

    // Show selection UI for 3+ snapshots
    const compBody = qs<HTMLElement>('[data-comparison-body]');
    compBody.innerHTML = `
    <div class="icg-snapshot-select">
      <p class="brutal-text-small" style="margin-bottom:var(--spacing-md)">Select two snapshots to compare:</p>
      ${snaps
        .map((s, i) => {
          const decoded = decodeState(s.encodedState);
          const score = decoded?.answers
            ? calculateResults({ ...DEFAULT_STATE, ...decoded }, DOMAINS).overallScore
            : '?';
          return `
          <div class="icg-snapshot-item">
            <input type="checkbox" id="snap-sel-${i}" data-snap-select="${i}" />
            <label for="snap-sel-${i}">${escapeHtml(s.label)} <span class="icg-snapshot-item__date">${score}/100</span></label>
          </div>`;
        })
        .join('')}
      <button data-action="compare-selected" type="button" class="brutal-btn brutal-btn--primary brutal-btn--full" disabled style="margin-top:var(--spacing-md)">Compare selected</button>
    </div>`;

    const checkboxes = compBody.querySelectorAll<HTMLInputElement>('[data-snap-select]');
    const compareSelBtn = compBody.querySelector<HTMLButtonElement>(
      '[data-action="compare-selected"]'
    )!;

    checkboxes.forEach((cb) => {
      cb.addEventListener('change', () => {
        const checked = Array.from(checkboxes).filter((c) => c.checked);
        if (checked.length > 2) {
          cb.checked = false;
          return;
        }
        compareSelBtn.disabled = checked.length !== 2;
      });
    });

    compareSelBtn.addEventListener('click', () => {
      const checked = Array.from(checkboxes).filter((c) => c.checked);
      if (checked.length !== 2) return;
      const idxA = Number(checked[0].dataset.snapSelect);
      const idxB = Number(checked[1].dataset.snapSelect);
      showComparison(snaps[idxA], snaps[idxB]);
    });

    qs<HTMLElement>('[data-view="results"]').classList.add('is-hidden');
    qs<HTMLElement>('[data-view="comparison"]').classList.remove('is-hidden');
    qs<HTMLElement>('[data-icg]').scrollIntoView({ behavior: 'smooth' });
  });

  qs<HTMLElement>('[data-action="back-to-results"]').addEventListener('click', () => {
    qs<HTMLElement>('[data-view="comparison"]').classList.add('is-hidden');
    qs<HTMLElement>('[data-view="results"]').classList.remove('is-hidden');
    qs<HTMLElement>('[data-icg]').scrollIntoView({ behavior: 'smooth' });
  });

  qs<HTMLElement>('[data-action="clear-snapshots"]').addEventListener('click', () => {
    clearAllSnapshots();
    renderSnapshotManager();
  });

  // Initial render of snapshot manager
  renderSnapshotManager();
});
