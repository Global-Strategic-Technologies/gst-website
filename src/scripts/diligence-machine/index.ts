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
import { getOptionLabel, WIZARD_STEPS } from '../../data/diligence-machine/wizard-config';
import { trackCTA, trackEvent } from '../../utils/analytics';
import { copyWithFeedback } from '../../utils/copy-feedback';
import { escapeHtml } from '../../utils/escape-html';
import {
  STORAGE_KEY,
  STORAGE_VERSION,
  canNavigateTo,
  navigate,
  parseSavedState,
  stepState,
  type SavedState,
} from './logic';

// Analytics: fire dm_start once per page load on first wizard interaction
let dmStartFired = false;

// ─── STATE ────────────────────────────────────────────────────────────

let currentStep = 1;
let highestStepReached = 1;
const totalSteps = 10;
let inputs: Partial<UserInputs> = {
  geographies: [],
};
let targetIdentifier = 'Target';
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
  docDate.textContent = `Generated ${now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })} at ${now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;

  // Metadata block
  renderMetaBlock();

  // Table of contents
  renderToc(script);

  // Render attention areas
  if (script.attentionAreas.length > 0) {
    attentionAreasSection.style.display = '';
    attentionAreasGrid.innerHTML = script.attentionAreas
      .map(
        (area) => `
                  <div class="doc-attention-card relevance-${escapeHtml(area.relevance)}${collapsedAttention.has(area.id) ? ' is-collapsed' : ''}${dismissedAttention.has(area.id) ? ' is-dismissed' : ''}" data-attention-id="${escapeHtml(area.id)}" data-card-toggle>
                      <div class="doc-attention-header">
                          <h3 class="doc-attention-title">${escapeHtml(area.title)}</h3>
                          <button class="brutal-na-btn" data-dismiss-attention="${escapeHtml(area.id)}" type="button" title="${dismissedAttention.has(area.id) ? 'Restore this item' : 'Mark as not applicable'}">${dismissedAttention.has(area.id) ? 'Restore' : 'N/A'}</button>
                          <svg class="delta-chevron" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M32 12 L52 52 L12 52 Z" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="miter"/></svg>
                      </div>
                      <div class="doc-attention-divider"></div>
                      <p class="doc-attention-desc">${escapeHtml(area.description)}${area.id === 'attention-tech-debt' ? ' <a href="/hub/tools/tech-debt-calculator/" target="_blank" rel="noopener noreferrer" style="color:var(--color-secondary-ink);text-decoration:underline;">Quantify it with the Tech Debt Cost Calculator →</a>' : ''}${['attention-high-scale-architecture', 'attention-multi-infra-cost'].includes(area.id) ? ' <a href="/hub/tools/infrastructure-cost-governance/" target="_blank" rel="noopener noreferrer" style="color:var(--color-secondary-ink);text-decoration:underline;">Assess cost governance maturity with ICG →</a>' : ''}</p>
                  </div>
              `
      )
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
                          <span class="doc-topic-number">Topic ${topicIndex + 1} of ${script.topics.length}</span>
                      </div>
                      <h2 class="doc-topic-title">${escapeHtml(topic.topicLabel)}</h2>
                      ${topic.subtitle ? `<p class="doc-section-subtitle">${escapeHtml(topic.subtitle)}</p>` : ''}
                      <p class="doc-topic-audience">Target audience: ${escapeHtml(topic.audienceLevel)}</p>
                  </div>
                  <ol class="doc-questions">
                      ${topic.questions
                        .map(
                          (q, qIndex) => `
                          <li class="doc-question priority-${escapeHtml(q.priority)}${collapsedQuestions.has(q.id) ? ' is-collapsed' : ''}${dismissedQuestions.has(q.id) ? ' is-dismissed' : ''}" data-question-id="${escapeHtml(q.id)}" data-card-toggle>
                              <div class="doc-q-header">
                                  <span class="doc-q-number">${topicIndex + 1}.${qIndex + 1}</span>
                                  <div class="doc-q-badges">
                                      ${q.exitImpact ? `<span class="doc-q-exit-impact exit-impact-${escapeHtml(q.exitImpact.toLowerCase().replaceAll(' ', '-'))}">${escapeHtml(q.exitImpact)}</span>` : ''}
                                      <span class="doc-q-priority">${escapeHtml(q.priority)}</span>
                                      <button class="brutal-na-btn" data-dismiss-question="${escapeHtml(q.id)}" type="button" title="${dismissedQuestions.has(q.id) ? 'Restore this item' : 'Mark as not applicable'}">${dismissedQuestions.has(q.id) ? 'Restore' : 'N/A'}</button>
                                  </div>
                                  <svg class="delta-chevron" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M32 12 L52 52 L12 52 Z" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="miter"/></svg>
                              </div>
                              <p class="doc-q-text">${escapeHtml(q.text)}</p>
                              <div class="dm-card-body">
                                  ${q.lookoutSignal ? `<p class="doc-q-red-flag">${escapeHtml(q.lookoutSignal)}</p>` : ''}
                                  <p class="doc-q-rationale">${escapeHtml(q.rationale)}</p>
                                  ${(script.triggerMap[q.id] ?? []).length > 0 ? `<div class="doc-q-triggers">Triggered by: ${(script.triggerMap[q.id] ?? []).map((t) => `<span class="doc-q-trigger-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
                              </div>
                          </li>
                      `
                        )
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
        (btn as HTMLElement).textContent = 'N/A';
        (btn as HTMLElement).title = 'Mark as not applicable';
      } else {
        dismissedAttention.add(id);
        card.classList.add('is-dismissed');
        (btn as HTMLElement).textContent = 'Restore';
        (btn as HTMLElement).title = 'Restore this item';
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
        (btn as HTMLElement).textContent = 'N/A';
        (btn as HTMLElement).title = 'Mark as not applicable';
      } else {
        dismissedQuestions.add(id);
        card.classList.add('is-dismissed');
        (btn as HTMLElement).textContent = 'Restore';
        (btn as HTMLElement).title = 'Restore this item';
      }
      saveStateDebounced();
    });
  });
}

function renderMetaBlock(): void {
  const docMeta = document.getElementById('docMeta')!;
  const fields: { label: string; value: string; stepId: string }[] = [];

  if (inputs.transactionType) {
    fields.push({
      label: 'Transaction Type',
      value: getOptionLabel('transaction-type', inputs.transactionType),
      stepId: 'transaction-type',
    });
  }
  if (inputs.productType) {
    fields.push({
      label: 'Product Type',
      value: getOptionLabel('product-type', inputs.productType),
      stepId: 'product-type',
    });
  }
  if (inputs.techArchetype) {
    fields.push({
      label: 'Tech Stack',
      value: getOptionLabel('tech-archetype', inputs.techArchetype),
      stepId: 'tech-archetype',
    });
  }
  if (inputs.headcount) {
    fields.push({
      label: 'Company Size',
      value: getOptionLabel('company-profile', inputs.headcount) + ' employees',
      stepId: 'company-profile',
    });
  }
  if (inputs.revenueRange) {
    fields.push({
      label: 'Revenue',
      value: getOptionLabel('company-profile', inputs.revenueRange),
      stepId: 'company-profile',
    });
  }
  if (inputs.growthStage) {
    fields.push({
      label: 'Growth Stage',
      value: getOptionLabel('company-profile', inputs.growthStage),
      stepId: 'company-profile',
    });
  }
  if (inputs.companyAge) {
    fields.push({
      label: 'Company Age',
      value: getOptionLabel('company-profile', inputs.companyAge),
      stepId: 'company-profile',
    });
  }
  if (inputs.geographies && inputs.geographies.length > 0) {
    fields.push({
      label: 'Geography',
      value: inputs.geographies.map((g) => getOptionLabel('geography', g)).join(', '),
      stepId: 'geography',
    });
  }
  if (inputs.businessModel) {
    fields.push({
      label: 'Business Model',
      value: getOptionLabel('business-model', inputs.businessModel),
      stepId: 'business-model',
    });
  }
  if (inputs.scaleIntensity) {
    fields.push({
      label: 'Scale Intensity',
      value: getOptionLabel('scale-intensity', inputs.scaleIntensity),
      stepId: 'scale-intensity',
    });
  }
  if (inputs.transformationState) {
    fields.push({
      label: 'Transformation',
      value: getOptionLabel('transformation-state', inputs.transformationState),
      stepId: 'transformation-state',
    });
  }
  if (inputs.dataSensitivity) {
    fields.push({
      label: 'Data Sensitivity',
      value: getOptionLabel('data-sensitivity', inputs.dataSensitivity),
      stepId: 'data-sensitivity',
    });
  }
  if (inputs.operatingModel) {
    fields.push({
      label: 'Operating Model',
      value: getOptionLabel('operating-model', inputs.operatingModel),
      stepId: 'operating-model',
    });
  }

  docMeta.innerHTML = `
          <h2 class="doc-section-heading">
              <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" width="14" height="14" class="bullet-icon" style="flex-shrink:0;color:var(--color-primary)"><path d="M32 12 L52 52 L12 52 Z" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="miter"></path></svg>
              Target Parameters
          </h2>
          <div class="doc-meta-grid">
              <div class="doc-meta-card doc-meta-card--identifier">
                  <span class="doc-meta-label">Target Identifier</span>
                  <input
                      type="text"
                      class="doc-meta-identifier-input"
                      id="targetIdentifierInput"
                      value="${escapeHtml(targetIdentifier)}"
                      maxlength="20"
                      aria-label="Target or project identifier"
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
              <a href="/hub/tools/techpar/"
                 target="_blank"
                 rel="noopener"
                 class="brutal-btn brutal-btn--secondary doc-meta-cta-button"
                 data-testid="techpar-cross-link">
                  Run costs through TechPar &rarr;
              </a>
              <a href="https://calendarbridge.com/book/globalstrategictech/"
                 target="_blank"
                 rel="noopener noreferrer"
                 class="brutal-btn brutal-btn--primary doc-meta-cta-button"
                 id="metaCtaButton"
                 data-testid="meta-cta-button">
                  Schedule a Call to Discuss &rarr;
              </a>
          </div>
      `;

  // Wire up identifier input
  const identifierInput = document.getElementById('targetIdentifierInput') as HTMLInputElement;
  identifierInput.addEventListener('input', () => {
    targetIdentifier = identifierInput.value || 'Target';
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
              Table of Contents
          </h2>
          <nav class="doc-toc-list" aria-label="Topic navigation">
              ${script.topics
                .map(
                  (topic, i) => `
                  <a href="#topic-${i + 1}" class="doc-toc-link">
                      <span class="doc-toc-topic-name">${escapeHtml(topic.topicLabel)}</span>
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
  const script = lastGeneratedScript;

  const lines: string[] = [];
  lines.push('OVERVIEW AND AGENDA');
  lines.push('GST');
  lines.push(
    `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
  );
  lines.push('');
  lines.push('\u2550'.repeat(60));
  lines.push('TARGET PARAMETERS');
  lines.push('\u2550'.repeat(60));
  lines.push('');
  lines.push(`Identifier:        ${targetIdentifier}`);

  if (inputs.transactionType)
    lines.push(`Transaction Type:  ${getOptionLabel('transaction-type', inputs.transactionType)}`);
  if (inputs.productType)
    lines.push(`Product Type:      ${getOptionLabel('product-type', inputs.productType)}`);
  if (inputs.techArchetype)
    lines.push(`Tech Stack:        ${getOptionLabel('tech-archetype', inputs.techArchetype)}`);
  if (inputs.headcount)
    lines.push(
      `Company Size:      ${getOptionLabel('company-profile', inputs.headcount)} employees`
    );
  if (inputs.revenueRange)
    lines.push(`Revenue:           ${getOptionLabel('company-profile', inputs.revenueRange)}`);
  if (inputs.growthStage)
    lines.push(`Growth Stage:      ${getOptionLabel('company-profile', inputs.growthStage)}`);
  if (inputs.companyAge)
    lines.push(`Company Age:       ${getOptionLabel('company-profile', inputs.companyAge)}`);
  if (inputs.geographies && inputs.geographies.length > 0) {
    lines.push(
      `Geography:         ${inputs.geographies.map((g) => getOptionLabel('geography', g)).join(', ')}`
    );
  }
  if (inputs.businessModel)
    lines.push(`Business Model:    ${getOptionLabel('business-model', inputs.businessModel)}`);
  if (inputs.scaleIntensity)
    lines.push(`Scale Intensity:   ${getOptionLabel('scale-intensity', inputs.scaleIntensity)}`);
  if (inputs.transformationState)
    lines.push(
      `Transform State:   ${getOptionLabel('transformation-state', inputs.transformationState)}`
    );
  if (inputs.dataSensitivity)
    lines.push(`Data Sensitivity:  ${getOptionLabel('data-sensitivity', inputs.dataSensitivity)}`);
  if (inputs.operatingModel)
    lines.push(`Operating Model:   ${getOptionLabel('operating-model', inputs.operatingModel)}`);
  lines.push('');

  // Attention areas (exclude dismissed)
  const activeAreas = script.attentionAreas.filter((a) => !dismissedAttention.has(a.id));
  if (activeAreas.length > 0) {
    lines.push('\u2550'.repeat(60));
    lines.push('ATTENTION AREAS');
    lines.push('\u2550'.repeat(60));
    lines.push('');
    for (const area of activeAreas) {
      lines.push(`[${area.relevance.toUpperCase()}] ${area.title}`);
      lines.push(`  ${area.description}`);
      lines.push('');
    }
  }

  // Topics (exclude dismissed questions, skip empty topics)
  for (const [topicIndex, topic] of script.topics.entries()) {
    const activeQuestions = topic.questions.filter((q) => !dismissedQuestions.has(q.id));
    if (activeQuestions.length === 0) continue;

    lines.push('\u2550'.repeat(60));
    lines.push(`TOPIC ${topicIndex + 1}: ${topic.topicLabel.toUpperCase()}`);
    lines.push(`Audience: ${topic.audienceLevel}`);
    lines.push('\u2550'.repeat(60));
    lines.push('');

    for (const [qIndex, q] of activeQuestions.entries()) {
      const impactTag = q.exitImpact ? ` [${q.exitImpact}]` : '';
      lines.push(
        `${topicIndex + 1}.${qIndex + 1} [${q.priority.toUpperCase()}]${impactTag} ${q.text}`
      );
      if (q.lookoutSignal) lines.push(`    ${q.lookoutSignal}`);
      lines.push(`    Rationale: ${q.rationale}`);
      const triggers = script.triggerMap[q.id] ?? [];
      if (triggers.length > 0) lines.push(`    Triggered by: ${triggers.join(', ')}`);
      lines.push('');
    }
  }

  lines.push('\u2500'.repeat(60));
  lines.push('Global Strategic Technologies | globalstrategic.tech');

  const text = lines.join('\n');

  const btn = document.getElementById('btnCopy')!;
  const label = document.getElementById('btnCopyLabel')!;
  copyWithFeedback(text, btn, { feedbackTarget: label });
}

// ─── RESTART ──────────────────────────────────────────────────────────

function restart(): void {
  inputs = { geographies: [] };
  targetIdentifier = 'Target';
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
      targetIdentifier: 'Target',
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
  if (saved.targetIdentifier) targetIdentifier = saved.targetIdentifier;
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
