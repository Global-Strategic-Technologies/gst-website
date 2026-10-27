import {
  syncMultiRegion,
  MULTI_REGION_ID,
  generateScript,
  type UserInputs,
  type GeneratedScript,
} from '../../utils/diligence-engine';
import {
  serializeToParams as serializeDiligenceUrl,
  deserializeFromParams as deserializeDiligenceUrl,
  isCompleteUrlState,
} from '../../utils/diligence-url';
import { WIZARD_STEPS } from '../../data/diligence-machine/wizard-config';
import { formatDate } from '../../i18n/formatters';
import { trackCTA, trackEvent } from '../../utils/analytics';
import { copyWithFeedback } from '../../utils/copy-feedback';
import { escapeHtml } from '../../utils/escape-html';
import { pageLang } from '../tool-strings';
import {
  DEFAULT_TARGET_IDENTIFIER,
  STORAGE_KEY,
  STORAGE_VERSION,
  areaDescription,
  areaTitle,
  buildClipboardText,
  canNavigateTo,
  displayTargetIdentifier,
  exitImpactLabel,
  exitImpactSlug,
  metaFields,
  navigate,
  normalizeTargetIdentifier,
  parseSavedState,
  priorityLabel,
  questionLookout,
  questionRationale,
  questionText,
  stepState,
  topicAudience,
  topicLabel,
  topicSubtitle,
  triggerLabel,
  type SavedState,
} from './logic';
import { s } from './strings';

// Analytics: fire dm_start once per page load on first wizard interaction
let dmStartFired = false;

// ─── STATE ────────────────────────────────────────────────────────────

let currentStep = 1;
let highestStepReached = 1;
const totalSteps = 10;
let inputs: Partial<UserInputs> = {
  geographies: [],
};
let targetIdentifier = DEFAULT_TARGET_IDENTIFIER;
let lastGeneratedScript: GeneratedScript | null = null;
let autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;
let dismissedAttention = new Set<string>();
let dismissedQuestions = new Set<string>();
let collapsedAttention = new Set<string>();
let collapsedQuestions = new Set<string>();

// ─── DOM REFERENCES ──────────────────────────────────────────────────

const wizardContainer = document.getElementById('wizardContainer')!;
const outputContainer = document.getElementById('outputContainer')!;
const btnBack = document.getElementById('btnBack') as HTMLButtonElement;
const btnNext = document.getElementById('btnNext') as HTMLButtonElement;
const btnGenerate = document.getElementById('btnGenerate') as HTMLButtonElement;
const btnGoBack = document.getElementById('btnGoBack') as HTMLButtonElement;
const btnCopy = document.getElementById('btnCopy') as HTMLButtonElement;
const btnPrint = document.getElementById('btnPrint') as HTMLButtonElement;
const btnRestart = document.getElementById('btnRestart') as HTMLButtonElement;
const attentionAreasSection = document.getElementById('attentionAreasSection')!;
const attentionAreasGrid = document.getElementById('attentionAreasGrid')!;
const scriptTopics = document.getElementById('scriptTopics')!;

// Links to the other tools, in the page's language (the template resolves them).
const toolRoot = document.querySelector<HTMLElement>('.diligence-machine')!;
const TECHPAR_HREF = toolRoot.dataset.techparHref ?? '/hub/tools/techpar/';
const TECH_DEBT_HREF = toolRoot.dataset.techDebtHref ?? '/hub/tools/tech-debt-calculator/';
const ICG_HREF = toolRoot.dataset.icgHref ?? '/hub/tools/infrastructure-cost-governance/';

/** The N/A toggle's text and tooltip for a card's dismissed state. */
function naButton(dismissed: boolean): { textContent: string; title: string } {
  return dismissed
    ? { textContent: s('js.restore'), title: s('js.restoreTitle') }
    : { textContent: s('js.na'), title: s('js.naTitle') };
}

function crossLink(href: string, key: string): string {
  return ` <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="color:var(--color-secondary-ink);text-decoration:underline;">${escapeHtml(s(key))}</a>`;
}

// Cached NodeLists — avoids re-querying the DOM on every step navigation
const cachedWizardSteps = document.querySelectorAll<HTMLElement>('.wizard-step');
const cachedProgressSteps = document.querySelectorAll<HTMLElement>('.tool-wizard-step');
const cachedProgressDots = document.querySelectorAll<HTMLElement>('.tool-wizard-dot');
const cachedProgressBar = document.querySelector<HTMLElement>('.tool-wizard-progress');
const cachedMobileCurrent = document.querySelector('.tool-wizard-progress-mobile__current');
const cachedMobileName = document.querySelector('.tool-wizard-progress-mobile__name');

// ─── LOCAL STORAGE ───────────────────────────────────────────────────

function saveState(): void {
  try {
    const state: SavedState = {
      version: STORAGE_VERSION,
      currentStep,
      highestStepReached,
      inputs: { ...inputs },
      targetIdentifier,
      dismissedAttention: [...dismissedAttention],
      dismissedQuestions: [...dismissedQuestions],
      collapsedAttention: [...collapsedAttention],
      collapsedQuestions: [...collapsedQuestions],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable in private browsing
  }
  // BL-031.95 Phase 2: URL state sync runs alongside localStorage.
  syncUrlState();
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function saveStateDebounced(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 500);
}

// ─── BL-031.95 Phase 2: URL state sync ────────────────────────────────
//
// URL state augments localStorage. On page-load init, URL takes
// precedence (so a deep-link from the MCP tool / a shared URL hydrates
// correctly even when localStorage has different state); localStorage
// is the fallback for "I closed the tab, came back tomorrow." On input
// change, both URL and localStorage are updated.

function syncUrlState(): void {
  try {
    const params = serializeDiligenceUrl(inputs);
    const queryString = params.toString();
    const url = queryString
      ? `${window.location.pathname}?${queryString}`
      : window.location.pathname;
    history.replaceState(null, '', url);
  } catch {
    // history API may be unavailable in sandboxed contexts; ignore.
  }
}

function loadState(): SavedState | null {
  try {
    return parseSavedState(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

// ─── STEP NAVIGATION ─────────────────────────────────────────────────

function showStep(step: number): void {
  // Cancel any pending auto-advance timer to prevent stale navigations
  if (autoAdvanceTimer !== null) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }

  ({ currentStep, highestStepReached } = navigate({ currentStep, highestStepReached }, step));
  const position = { currentStep, highestStepReached };

  // Update step panels (cached NodeList)
  cachedWizardSteps.forEach((stepEl) => {
    stepEl.classList.toggle('active', stepEl.dataset.step === String(step));
  });

  // Update progress indicators (cached NodeList)
  cachedProgressSteps.forEach((segEl) => {
    const state = stepState(Number(segEl.dataset.stepIndicator), position);
    segEl.classList.toggle('tool-wizard-step--active', state === 'active');
    segEl.classList.toggle('tool-wizard-step--completed', state === 'completed');
    segEl.classList.toggle('tool-wizard-step--reachable', state === 'reachable');
  });

  // Update progress bar aria (cached ref)
  if (cachedProgressBar) cachedProgressBar.setAttribute('aria-valuenow', String(step));

  // Update mobile compact progress (cached refs)
  if (cachedMobileCurrent) cachedMobileCurrent.textContent = String(step);
  if (cachedMobileName) {
    const activeLabel = document.querySelector(
      `.tool-wizard-step[data-step-indicator="${step}"] .tool-wizard-step__label`
    );
    if (activeLabel) cachedMobileName.textContent = activeLabel.textContent ?? '';
  }
  cachedProgressDots.forEach((dot) => {
    const state = stepState(Number((dot as HTMLElement).dataset.dotStep), position);
    dot.classList.toggle('tool-wizard-dot--active', state === 'active');
    dot.classList.toggle('tool-wizard-dot--completed', state === 'completed');
    dot.classList.toggle('tool-wizard-dot--reachable', state === 'reachable');
  });

  // Update navigation buttons
  btnBack.disabled = step === 1;
  btnBack.style.display = '';

  if (step === totalSteps) {
    btnNext.style.display = 'none';
    btnGenerate.style.display = '';
  } else {
    btnNext.style.display = '';
    btnGenerate.style.display = 'none';
  }

  updateNextButtonState();
  saveState(); // Step transitions save immediately (debounce is for rapid option clicks)
}

/** Update the multi-region card's DOM state and sync the geographies array */
function syncMultiRegionDOM(): void {
  if (!inputs.geographies) return;
  const synced = syncMultiRegion(inputs.geographies);
  const changed =
    synced.length !== inputs.geographies.length ||
    !synced.every((g) => inputs.geographies!.includes(g));
  if (!changed) return;
  inputs.geographies = synced;
  const mrCard = document.querySelector(
    `.brutal-option-card[data-step-id="geography"][data-option-id="${MULTI_REGION_ID}"]`
  ) as HTMLElement | null;
  if (mrCard) {
    const shouldBeSelected = synced.includes(MULTI_REGION_ID);
    mrCard.classList.toggle('brutal-option-card--selected-outline', shouldBeSelected);
    mrCard.setAttribute('aria-pressed', String(shouldBeSelected));
  }
}

/** Deselect all geography cards in the DOM */
function clearAllGeographyCards(): void {
  document.querySelectorAll('.brutal-option-card[data-step-id="geography"]').forEach((el) => {
    el.classList.remove('brutal-option-card--selected-outline');
    el.setAttribute('aria-pressed', 'false');
  });
}

function isStepValid(step: number): boolean {
  const stepEl = document.querySelector(`.wizard-step[data-step="${step}"]`) as HTMLElement;
  if (!stepEl) return false;
  const inputType = stepEl.dataset.inputType;
  const stepId = stepEl.dataset.stepId!;

  if (inputType === 'single-select') {
    const key = stepIdToInputKey(stepId);
    return key ? !!(inputs as Record<string, unknown>)[key] : false;
  }

  if (inputType === 'multi-select') {
    return (inputs.geographies?.length ?? 0) > 0;
  }

  if (inputType === 'compound') {
    return !!(inputs.headcount && inputs.revenueRange && inputs.growthStage && inputs.companyAge);
  }

  return false;
}

function updateNextButtonState(): void {
  const valid = isStepValid(currentStep);
  if (currentStep === totalSteps) {
    btnGenerate.disabled = !valid;
  } else {
    btnNext.disabled = !valid;
  }
}

function stepIdToInputKey(stepId: string): keyof UserInputs | null {
  const map: Record<string, keyof UserInputs> = {
    'transaction-type': 'transactionType',
    'product-type': 'productType',
    'tech-archetype': 'techArchetype',
    'business-model': 'businessModel',
    'scale-intensity': 'scaleIntensity',
    'transformation-state': 'transformationState',
    'data-sensitivity': 'dataSensitivity',
    'operating-model': 'operatingModel',
  };
  return map[stepId] ?? null;
}

// ─── OPTION SELECTION ─────────────────────────────────────────────────

function handleOptionClick(card: HTMLButtonElement): void {
  const optionId = card.dataset.optionId!;
  const stepId = card.dataset.stepId!;
  const stepEl = card.closest('.wizard-step') as HTMLElement;
  const inputType = stepEl.dataset.inputType;

  if (inputType === 'single-select') {
    // Deselect siblings
    stepEl.querySelectorAll('.brutal-option-card').forEach((el) => {
      el.classList.remove('brutal-option-card--selected-outline');
      el.setAttribute('aria-pressed', 'false');
    });
    card.classList.add('brutal-option-card--selected-outline');
    card.setAttribute('aria-pressed', 'true');

    const key = stepIdToInputKey(stepId);
    if (key) {
      (inputs as Record<string, unknown>)[key] = optionId;
    }

    updateNextButtonState();
    saveStateDebounced();

    // Auto-advance to next step after brief delay for visual feedback
    autoAdvanceTimer = setTimeout(() => {
      autoAdvanceTimer = null;
      if (currentStep < totalSteps) {
        showStep(currentStep + 1);
      }
    }, 300);
  } else if (inputType === 'multi-select') {
    // BL-031.95 Phase 2.C: 'unknown' is a sentinel — clicking it sets
    // inputs.geographies = ['unknown'] and clears all specific selections.
    // Clicking any specific region while 'unknown' is set clears 'unknown'
    // and treats the click as a fresh single-region selection.
    if (optionId === 'unknown') {
      const isSelected = card.classList.toggle('brutal-option-card--selected-outline');
      card.setAttribute('aria-pressed', String(isSelected));
      if (isSelected) {
        inputs.geographies = ['unknown'];
        // Clear all specific-region cards visually.
        stepEl.querySelectorAll('.brutal-option-card').forEach((el) => {
          const id = (el as HTMLElement).dataset.optionId;
          if (id !== 'unknown') {
            el.classList.remove('brutal-option-card--selected-outline');
            el.setAttribute('aria-pressed', 'false');
          }
        });
      } else {
        inputs.geographies = [];
      }
      updateNextButtonState();
      saveStateDebounced();
      return;
    }

    // Specific-region click: if 'unknown' was active, clear it first.
    if (inputs.geographies && inputs.geographies.includes('unknown')) {
      inputs.geographies = inputs.geographies.filter((g) => g !== 'unknown');
      const unknownCard = stepEl.querySelector(
        '.brutal-option-card[data-option-id="unknown"]'
      ) as HTMLElement | null;
      if (unknownCard) {
        unknownCard.classList.remove('brutal-option-card--selected-outline');
        unknownCard.setAttribute('aria-pressed', 'false');
      }
    }

    const isSelected = card.classList.toggle('brutal-option-card--selected-outline');
    card.setAttribute('aria-pressed', String(isSelected));

    if (!inputs.geographies) inputs.geographies = [];

    // User deselects Multi-Region → clear all geographies
    if (optionId === MULTI_REGION_ID && !isSelected) {
      inputs.geographies = [];
      clearAllGeographyCards();
    } else {
      if (isSelected) {
        if (!inputs.geographies.includes(optionId)) {
          inputs.geographies.push(optionId);
        }
      } else {
        inputs.geographies = inputs.geographies.filter((g) => g !== optionId);
      }
      syncMultiRegionDOM();
    }

    updateNextButtonState();
    saveStateDebounced();
  }
}

function handleCompoundOptionClick(card: HTMLButtonElement): void {
  const optionId = card.dataset.optionId!;
  const fieldId = card.dataset.fieldId!;
  const fieldGrid = card.closest('.field-options-grid') as HTMLElement;

  // Deselect all cards in this field's grid (single-select)
  fieldGrid.querySelectorAll('.brutal-option-card').forEach((el) => {
    el.classList.remove('brutal-option-card--selected-outline');
    el.setAttribute('aria-pressed', 'false');
  });

  // Select clicked card
  card.classList.add('brutal-option-card--selected-outline');
  card.setAttribute('aria-pressed', 'true');

  // Update state (same field mapping as handleFieldChange)
  const fieldMap: Record<string, keyof UserInputs> = {
    headcount: 'headcount',
    'revenue-range': 'revenueRange',
    'growth-stage': 'growthStage',
    'company-age': 'companyAge',
  };

  const key = fieldMap[fieldId];
  if (key) {
    (inputs as Record<string, unknown>)[key] = optionId;
  }

  updateNextButtonState();
  saveStateDebounced();

  // Auto-advance once all compound fields are filled
  if (inputs.headcount && inputs.revenueRange && inputs.growthStage && inputs.companyAge) {
    autoAdvanceTimer = setTimeout(() => {
      autoAdvanceTimer = null;
      if (currentStep < totalSteps) {
        showStep(currentStep + 1);
      }
    }, 300);
  }
}

// ─── OUTPUT RENDERING ─────────────────────────────────────────────────

function renderOutput(script: GeneratedScript): void {
  lastGeneratedScript = script;

  // Hide wizard, show output
  wizardContainer.style.display = 'none';
  outputContainer.style.display = '';

  // Generation date
  const docDate = document.getElementById('docDate')!;
  const now = new Date();
  const lang = pageLang();
  docDate.textContent = s('js.generated', {
    date: formatDate(now, lang),
    time: formatDate(now, lang, { hour: '2-digit', minute: '2-digit' }),
  });

  // Metadata block
  renderMetaBlock();

  // Table of contents
  renderToc(script);

  // Render attention areas
  if (script.attentionAreas.length > 0) {
    attentionAreasSection.style.display = '';
    attentionAreasGrid.innerHTML = script.attentionAreas
      .map((area) => {
        const na = naButton(dismissedAttention.has(area.id));
        return `
                  <div class="doc-attention-card relevance-${escapeHtml(area.relevance)}${collapsedAttention.has(area.id) ? ' is-collapsed' : ''}${dismissedAttention.has(area.id) ? ' is-dismissed' : ''}" data-attention-id="${escapeHtml(area.id)}" data-card-toggle>
                      <div class="doc-attention-header">
                          <h3 class="doc-attention-title">${escapeHtml(areaTitle(area))}</h3>
                          <button class="brutal-na-btn" data-dismiss-attention="${escapeHtml(area.id)}" type="button" title="${escapeHtml(na.title)}">${escapeHtml(na.textContent)}</button>
                          <svg class="delta-chevron" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M32 12 L52 52 L12 52 Z" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="miter"/></svg>
                      </div>
                      <div class="doc-attention-divider"></div>
                      <p class="doc-attention-desc">${escapeHtml(areaDescription(area))}${area.id === 'attention-tech-debt' ? crossLink(TECH_DEBT_HREF, 'js.crossLink.techDebt') : ''}${['attention-high-scale-architecture', 'attention-multi-infra-cost'].includes(area.id) ? crossLink(ICG_HREF, 'js.crossLink.icg') : ''}</p>
                  </div>
              `;
      })
      .join('');
  } else {
    attentionAreasSection.style.display = 'none';
  }

  // Render topics
  scriptTopics.innerHTML = script.topics
    .map(
      (topic, topicIndex) => `
              <section class="doc-topic" id="topic-${topicIndex + 1}">
                  <div class="doc-topic-header">
                      <div class="doc-topic-label-row">
                          <span class="doc-topic-number">${escapeHtml(s('js.topicOf', { n: topicIndex + 1, total: script.topics.length }))}</span>
                      </div>
                      <h2 class="doc-topic-title">${escapeHtml(topicLabel(topic))}</h2>
                      ${topic.subtitle ? `<p class="doc-section-subtitle">${escapeHtml(topicSubtitle(topic))}</p>` : ''}
                      <p class="doc-topic-audience">${escapeHtml(s('js.audience', { audience: topicAudience(topic) }))}</p>
                  </div>
                  <ol class="doc-questions">
                      ${topic.questions
                        .map((q, qIndex) => {
                          const na = naButton(dismissedQuestions.has(q.id));
                          const lookout = questionLookout(q);
                          const triggers = script.triggerMap[q.id] ?? [];
                          return `
                          <li class="doc-question priority-${escapeHtml(q.priority)}${collapsedQuestions.has(q.id) ? ' is-collapsed' : ''}${dismissedQuestions.has(q.id) ? ' is-dismissed' : ''}" data-question-id="${escapeHtml(q.id)}" data-card-toggle>
                              <div class="doc-q-header">
                                  <span class="doc-q-number">${topicIndex + 1}.${qIndex + 1}</span>
                                  <div class="doc-q-badges">
                                      ${q.exitImpact ? `<span class="doc-q-exit-impact exit-impact-${escapeHtml(exitImpactSlug(q.exitImpact))}">${escapeHtml(exitImpactLabel(q.exitImpact))}</span>` : ''}
                                      <span class="doc-q-priority">${escapeHtml(priorityLabel(q.priority))}</span>
                                      <button class="brutal-na-btn" data-dismiss-question="${escapeHtml(q.id)}" type="button" title="${escapeHtml(na.title)}">${escapeHtml(na.textContent)}</button>
                                  </div>
                                  <svg class="delta-chevron" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M32 12 L52 52 L12 52 Z" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="miter"/></svg>
                              </div>
                              <p class="doc-q-text">${escapeHtml(questionText(q))}</p>
                              <div class="dm-card-body">
                                  ${lookout ? `<p class="doc-q-red-flag">${escapeHtml(lookout)}</p>` : ''}
                                  <p class="doc-q-rationale">${escapeHtml(questionRationale(q))}</p>
                                  ${triggers.length > 0 ? `<div class="doc-q-triggers">${escapeHtml(s('js.triggeredBy'))} ${triggers.map((t) => `<span class="doc-q-trigger-tag">${escapeHtml(triggerLabel(t))}</span>`).join('')}</div>` : ''}
                              </div>
                          </li>
                      `;
                        })
                        .join('')}
                  </ol>
              </section>
          `
    )
    .join('');

  // Wire collapse/expand and dismiss interactions
  wireCardInteractions();

  // Scroll to top of output
  outputContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  saveStateDebounced();
}

function wireCardInteractions(): void {
  // Collapse/expand toggle on card click
  document.querySelectorAll('[data-card-toggle]').forEach((card) => {
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('a, button')) return;
      const el = card as HTMLElement;
      const isNowCollapsed = el.classList.toggle('is-collapsed');
      const attentionId = el.dataset.attentionId;
      const questionId = el.dataset.questionId;
      if (attentionId) {
        if (isNowCollapsed) collapsedAttention.add(attentionId);
        else collapsedAttention.delete(attentionId);
      } else if (questionId) {
        if (isNowCollapsed) collapsedQuestions.add(questionId);
        else collapsedQuestions.delete(questionId);
      }
      saveStateDebounced();
    });
  });

  // Attention area N/A dismiss
  document.querySelectorAll('[data-dismiss-attention]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.dismissAttention!;
      const card = (btn as HTMLElement).closest('.doc-attention-card')!;
      if (dismissedAttention.has(id)) {
        dismissedAttention.delete(id);
        card.classList.remove('is-dismissed');
        Object.assign(btn as HTMLElement, naButton(false));
      } else {
        dismissedAttention.add(id);
        card.classList.add('is-dismissed');
        Object.assign(btn as HTMLElement, naButton(true));
      }
      saveStateDebounced();
    });
  });

  // Question N/A dismiss
  document.querySelectorAll('[data-dismiss-question]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.dismissQuestion!;
      const card = (btn as HTMLElement).closest('.doc-question')!;
      if (dismissedQuestions.has(id)) {
        dismissedQuestions.delete(id);
        card.classList.remove('is-dismissed');
        Object.assign(btn as HTMLElement, naButton(false));
      } else {
        dismissedQuestions.add(id);
        card.classList.add('is-dismissed');
        Object.assign(btn as HTMLElement, naButton(true));
      }
      saveStateDebounced();
    });
  });
}

function renderMetaBlock(): void {
  const docMeta = document.getElementById('docMeta')!;
  const fields = metaFields(inputs, pageLang());

  docMeta.innerHTML = `
          <h2 class="doc-section-heading">
              <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" width="14" height="14" class="bullet-icon" style="flex-shrink:0;color:var(--color-primary)"><path d="M32 12 L52 52 L12 52 Z" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="miter"></path></svg>
              ${escapeHtml(s('js.meta.heading'))}
          </h2>
          <div class="doc-meta-grid">
              <div class="doc-meta-card doc-meta-card--identifier">
                  <span class="doc-meta-label">${escapeHtml(s('js.meta.identifier'))}</span>
                  <input
                      type="text"
                      class="doc-meta-identifier-input"
                      id="targetIdentifierInput"
                      value="${escapeHtml(displayTargetIdentifier(targetIdentifier))}"
                      maxlength="20"
                      aria-label="${escapeHtml(s('js.meta.identifierLabel'))}"
                  />
              </div>
              ${fields
                .map((f, i) => {
                  const col = (i + 1) % 3; // 0=col1, 1=col2, 2=col3
                  const colClass =
                    col === 1 ? ' doc-meta-card--col2' : col === 2 ? ' doc-meta-card--col3' : '';
                  return `
                  <div class="doc-meta-card${colClass}">
                      <span class="doc-meta-label doc-meta-label--clickable" data-step-id="${escapeHtml(f.stepId)}">${escapeHtml(f.label)}</span>
                      <span class="doc-meta-value">${escapeHtml(f.value)}</span>
                  </div>
              `;
                })
                .join('')}
          </div>
          <div class="doc-meta-actions">
              <a href="${escapeHtml(TECHPAR_HREF)}"
                 target="_blank"
                 rel="noopener"
                 class="brutal-btn brutal-btn--secondary doc-meta-cta-button"
                 data-testid="techpar-cross-link">
                  ${escapeHtml(s('js.meta.techparCta'))}
              </a>
              <a href="https://calendarbridge.com/book/globalstrategictech/"
                 target="_blank"
                 rel="noopener noreferrer"
                 class="brutal-btn brutal-btn--primary doc-meta-cta-button"
                 id="metaCtaButton"
                 data-testid="meta-cta-button">
                  ${escapeHtml(s('js.meta.callCta'))}
              </a>
          </div>
      `;

  // Wire up identifier input
  const identifierInput = document.getElementById('targetIdentifierInput') as HTMLInputElement;
  identifierInput.addEventListener('input', () => {
    targetIdentifier = identifierInput.value || DEFAULT_TARGET_IDENTIFIER;
    saveStateDebounced();
  });

  // Wire up CTA analytics tracking
  const metaCtaButton = document.getElementById('metaCtaButton');
  if (metaCtaButton) {
    metaCtaButton.addEventListener('click', () => {
      trackCTA('calendarbridge', 'diligence-machine-target-parameters');
    });
  }

  // Wire up clickable labels to navigate back to wizard steps
  const clickableLabels = docMeta.querySelectorAll('.doc-meta-label--clickable');
  clickableLabels.forEach((label) => {
    const stepId = (label as HTMLElement).dataset.stepId;
    if (!stepId) return;

    // Find the step number (1-based) from the step ID
    const stepIndex = WIZARD_STEPS.findIndex((s) => s.id === stepId);
    if (stepIndex === -1) return;

    const stepNumber = stepIndex + 1;

    // Add click handler
    label.addEventListener('click', () => {
      trackEvent({
        event: 'dm_edit_parameter',
        category: 'engagement',
        step_id: stepId,
        step: stepNumber,
      });

      // Hide output, show wizard
      outputContainer.style.display = 'none';
      wizardContainer.style.display = '';

      // Navigate to the step
      showStep(stepNumber);
    });
  });
}

function renderToc(script: GeneratedScript): void {
  const docToc = document.getElementById('docToc')!;
  docToc.innerHTML = `
          <h2 class="doc-section-heading">
              <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" width="14" height="14" class="bullet-icon" style="flex-shrink:0;color:var(--color-primary)"><path d="M32 12 L52 52 L12 52 Z" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="miter"></path></svg>
              ${escapeHtml(s('js.toc.heading'))}
          </h2>
          <nav class="doc-toc-list" aria-label="${escapeHtml(s('js.toc.label'))}">
              ${script.topics
                .map(
                  (topic, i) => `
                  <a href="#topic-${i + 1}" class="doc-toc-link">
                      <span class="doc-toc-topic-name">${escapeHtml(topicLabel(topic))}</span>
                  </a>
              `
                )
                .join('')}
          </nav>
      `;

  // Wire up smooth-scroll click handlers
  docToc.querySelectorAll('.doc-toc-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const href = (link as HTMLAnchorElement).getAttribute('href')!;
      document.querySelector(href)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

// ─── COPY TO CLIPBOARD ───────────────────────────────────────────────

function copyToClipboard(): void {
  if (!lastGeneratedScript) return;
  const text = buildClipboardText({
    script: lastGeneratedScript,
    inputs,
    targetIdentifier,
    dismissedAttention,
    dismissedQuestions,
    now: new Date(),
    lang: pageLang(),
  });

  const btn = document.getElementById('btnCopy')!;
  const label = document.getElementById('btnCopyLabel')!;
  copyWithFeedback(text, btn, { feedbackTarget: label, label: s('js.copied') });
}

// ─── RESTART ──────────────────────────────────────────────────────────

function restart(): void {
  inputs = { geographies: [] };
  targetIdentifier = DEFAULT_TARGET_IDENTIFIER;
  dismissedAttention.clear();
  dismissedQuestions.clear();
  collapsedAttention.clear();
  collapsedQuestions.clear();
  clearState();

  // Reset all option cards
  document.querySelectorAll('.brutal-option-card').forEach((el) => {
    el.classList.remove('brutal-option-card--selected-outline');
    el.setAttribute('aria-pressed', 'false');
  });

  // Reset all selects
  document.querySelectorAll('.field-select').forEach((el) => {
    (el as unknown as HTMLSelectElement).value = '';
  });

  // Reset output
  outputContainer.style.display = 'none';
  wizardContainer.style.display = '';
  attentionAreasGrid.innerHTML = '';
  scriptTopics.innerHTML = '';
  lastGeneratedScript = null;

  // Clear document sections
  const docMeta = document.getElementById('docMeta');
  if (docMeta) docMeta.innerHTML = '';
  const docToc = document.getElementById('docToc');
  if (docToc) docToc.innerHTML = '';

  showStep(1);
}

// ─── RESTORE STATE ───────────────────────────────────────────────────

function restoreState(): void {
  // BL-031.95 Phase 2: URL state takes precedence over localStorage —
  // but only when the URL is COMPLETE (all 13 dimensions + ≥1 geography).
  // A complete URL is the deeplink-to-results case (from the MCP
  // `deeplink` field, or a shared results URL) → hydrate at results.
  // A PARTIAL URL (user mid-wizard whose syncUrlState() wrote their
  // 3-of-13 progress to the URL, then they refreshed) must NOT jump
  // to results with incomplete data; fall through to localStorage so
  // they land on their actual step. Empty URL → standard localStorage
  // fallback for "I closed the tab, came back tomorrow."
  //
  // Completeness predicate is the canonical export from
  // `src/utils/diligence-url.ts` — pure-logic so it lives at the
  // unit-test tier (`tests/unit/diligence-url.test.ts`) per the
  // project test pyramid; the tool page's client script (ADR-0042) just imports it.
  const urlParams = new URLSearchParams(window.location.search);
  const urlInputs = urlParams.toString() ? deserializeDiligenceUrl(urlParams) : null;
  const hasCompleteUrlState = isCompleteUrlState(urlInputs);

  let saved: SavedState | null;
  if (hasCompleteUrlState) {
    saved = {
      version: STORAGE_VERSION,
      currentStep: totalSteps,
      highestStepReached: totalSteps,
      inputs: urlInputs!,
      targetIdentifier: DEFAULT_TARGET_IDENTIFIER,
      dismissedAttention: [],
      dismissedQuestions: [],
      collapsedAttention: [],
      collapsedQuestions: [],
    };
  } else {
    saved = loadState();
  }
  if (!saved) return;

  inputs = { geographies: [], ...saved.inputs };
  targetIdentifier = normalizeTargetIdentifier(saved.targetIdentifier);
  highestStepReached = saved.highestStepReached;
  dismissedAttention = new Set(saved.dismissedAttention ?? []);
  dismissedQuestions = new Set(saved.dismissedQuestions ?? []);
  collapsedAttention = new Set(saved.collapsedAttention ?? []);
  collapsedQuestions = new Set(saved.collapsedQuestions ?? []);

  // Restore single-select options
  for (const [stepId, key] of Object.entries({
    'transaction-type': 'transactionType',
    'product-type': 'productType',
    'tech-archetype': 'techArchetype',
    'business-model': 'businessModel',
    'scale-intensity': 'scaleIntensity',
    'transformation-state': 'transformationState',
    'data-sensitivity': 'dataSensitivity',
    'operating-model': 'operatingModel',
  })) {
    const value = (inputs as Record<string, unknown>)[key] as string | undefined;
    if (value) {
      const card = document.querySelector(
        `.brutal-option-card[data-step-id="${stepId}"][data-option-id="${value}"]`
      );
      if (card) {
        card.classList.add('brutal-option-card--selected-outline');
        card.setAttribute('aria-pressed', 'true');
      }
    }
  }

  // Restore multi-select (geography)
  if (inputs.geographies && inputs.geographies.length > 0) {
    for (const geo of inputs.geographies) {
      const card = document.querySelector(
        `.brutal-option-card[data-step-id="geography"][data-option-id="${geo}"]`
      );
      if (card) {
        card.classList.add('brutal-option-card--selected-outline');
        card.setAttribute('aria-pressed', 'true');
      }
    }
    syncMultiRegionDOM();
  }

  // Restore compound field option cards
  const compoundFieldMap: Record<string, string> = {
    headcount: 'headcount',
    'revenue-range': 'revenueRange',
    'growth-stage': 'growthStage',
    'company-age': 'companyAge',
  };
  for (const [fieldId, key] of Object.entries(compoundFieldMap)) {
    const value = (inputs as Record<string, unknown>)[key] as string | undefined;
    if (value) {
      const card = document.querySelector(
        `.brutal-option-card.compound-option[data-field-id="${fieldId}"][data-option-id="${value}"]`
      );
      if (card) {
        card.classList.add('brutal-option-card--selected-outline');
        card.setAttribute('aria-pressed', 'true');
      }
    }
  }

  showStep(saved.currentStep);
}

// ─── EVENT BINDING ────────────────────────────────────────────────────

// Option card clicks
document.querySelectorAll('.brutal-option-card').forEach((card) => {
  card.addEventListener('click', () => handleOptionClick(card as HTMLButtonElement));
});

// Compound field option cards
document.querySelectorAll('.brutal-option-card.compound-option').forEach((card) => {
  card.addEventListener('click', () => handleCompoundOptionClick(card as HTMLButtonElement));
});

// Progress segment click navigation (back to completed steps or forward to previously reached steps)
document.querySelectorAll('.tool-wizard-step').forEach((el) => {
  el.addEventListener('click', () => {
    const segStep = Number((el as HTMLElement).dataset.stepIndicator);
    if (canNavigateTo(segStep, { currentStep, highestStepReached })) {
      showStep(segStep);
    }
  });
});

// Mobile dot navigation
document.querySelectorAll('.tool-wizard-dot').forEach((dot) => {
  dot.addEventListener('click', () => {
    const dotStep = Number((dot as HTMLElement).dataset.dotStep);
    if (canNavigateTo(dotStep, { currentStep, highestStepReached })) {
      showStep(dotStep);
    }
  });
});

// Navigation
btnBack.addEventListener('click', () => {
  if (currentStep > 1) showStep(currentStep - 1);
});

btnNext.addEventListener('click', () => {
  if (currentStep < totalSteps && isStepValid(currentStep)) {
    if (!dmStartFired) {
      trackEvent({ event: 'dm_start', category: 'tool', page: 'diligence-machine' });
      dmStartFired = true;
    }
    const nextStep = currentStep + 1;
    trackEvent({
      event: 'dm_step_advance',
      category: 'engagement',
      step: nextStep,
      step_id: WIZARD_STEPS[nextStep - 1]?.id ?? '',
    });
    showStep(nextStep);
  }
});

btnGenerate.addEventListener('click', async () => {
  if (!isStepValid(currentStep)) return;

  trackEvent({ event: 'dm_generate', category: 'engagement' });

  // Hide wizard and generate output immediately
  wizardContainer.style.display = 'none';

  const fullInputs: UserInputs = {
    transactionType: inputs.transactionType!,
    productType: inputs.productType!,
    techArchetype: inputs.techArchetype!,
    headcount: inputs.headcount!,
    revenueRange: inputs.revenueRange!,
    growthStage: inputs.growthStage!,
    companyAge: inputs.companyAge!,
    geographies: inputs.geographies ?? [],
    businessModel: inputs.businessModel!,
    scaleIntensity: inputs.scaleIntensity!,
    transformationState: inputs.transformationState!,
    dataSensitivity: inputs.dataSensitivity!,
    operatingModel: inputs.operatingModel!,
  };

  const script = generateScript(fullInputs);
  renderOutput(script);
});

btnGoBack.addEventListener('click', () => {
  trackEvent({ event: 'dm_go_back', category: 'engagement' });
  outputContainer.style.display = 'none';
  wizardContainer.style.display = '';
  showStep(totalSteps);
});
btnCopy.addEventListener('click', () => {
  trackEvent({ event: 'dm_copy', category: 'engagement' });
  copyToClipboard();
});
btnPrint.addEventListener('click', () => {
  trackEvent({ event: 'dm_print', category: 'engagement' });
  window.print();
});
btnRestart.addEventListener('click', () => {
  trackEvent({ event: 'dm_restart', category: 'engagement' });
  restart();
});

// ─── INITIALIZE ───────────────────────────────────────────────────────

restoreState();
// Signal to E2E tests that the wizard has finished hydrating. The static
// HTML marks step 1 active by default; `restoreState()` may advance to
// a later step from localStorage / URL. Tests that reload the page need
// to wait for this attribute before asserting which step is active —
// otherwise they race the script and see the pre-restoration state.
document.querySelector('[data-testid="wizard-container"]')?.setAttribute('data-restored', 'true');
