/**
 * Diligence Machine — the page script's DOM-free rules (ADR-0042): wizard
 * navigation and persistence, and the page's words.
 *
 * The script generation itself lives in `src/utils/diligence-engine.ts`, in
 * English (the MCP server emits the same output). This file turns it into the
 * page's language: data text is looked up by id in the strings island, falling
 * back to the engine's English (BL-153 Tier B). Tested by
 * `tests/integration/diligence-wizard-navigation.test.ts` and
 * `tests/unit/diligence-logic.test.ts`.
 */
import {
  CONDITION_LABELS,
  type GeneratedScript,
  type TopicOutput,
  type UserInputs,
} from '../../utils/diligence-engine';
import type { AttentionArea } from '../../data/diligence-machine/attention-areas';
import type { DiligenceQuestion } from '../../data/diligence-machine/questions';
import { formatDate, formatList } from '../../i18n/formatters';
import { hasString, s } from './strings';

export const STORAGE_KEY = 'diligence-machine-state';
export const STORAGE_VERSION = 3;

export interface SavedState {
  version: number;
  currentStep: number;
  highestStepReached: number;
  inputs: Partial<UserInputs>;
  targetIdentifier?: string;
  dismissedAttention?: string[];
  dismissedQuestions?: string[];
  collapsedAttention?: string[];
  collapsedQuestions?: string[];
}

export interface WizardPosition {
  currentStep: number;
  highestStepReached: number;
}

/** Moving to a step makes it current and raises the high-water mark. */
export function navigate(position: WizardPosition, step: number): WizardPosition {
  return {
    currentStep: step,
    highestStepReached: Math.max(position.highestStepReached, step),
  };
}

/**
 * How a progress indicator (desktop segment or mobile dot) for `step` renders:
 * the current step, a completed one behind it, or a step ahead of it that was
 * already reached and can be jumped back to.
 */
export type StepState = 'active' | 'completed' | 'reachable' | null;

export function stepState(step: number, position: WizardPosition): StepState {
  if (step === position.currentStep) return 'active';
  if (step < position.currentStep) return 'completed';
  if (step <= position.highestStepReached) return 'reachable';
  return null;
}

/** A progress indicator navigates to any reached step other than the current one. */
export function canNavigateTo(step: number, position: WizardPosition): boolean {
  return step !== position.currentStep && step <= position.highestStepReached;
}

/**
 * Read a saved wizard from storage. Anything unparseable, or written under a
 * different `STORAGE_VERSION`, reads as "nothing saved" so the wizard starts
 * fresh rather than restoring a shape it no longer understands. A state with
 * no high-water mark restores it as the saved step, so the wizard never
 * reopens with its current step beyond its reachable range.
 */
export function parseSavedState(raw: string | null): SavedState | null {
  if (!raw) return null;
  try {
    const state = JSON.parse(raw) as SavedState;
    if (state?.version !== STORAGE_VERSION) return null;
    return { ...state, highestStepReached: state.highestStepReached ?? state.currentStep };
  } catch {
    return null;
  }
}

// ─── The page's words ───────────────────────────────────────────────────────

/** A data string from the island, or the engine's English when there is none. */
function data(key: string, english: string): string {
  return hasString(key) ? s(key) : english;
}

export const questionText = (q: DiligenceQuestion) => data(`question.${q.id}.text`, q.text);
export const questionRationale = (q: DiligenceQuestion) =>
  data(`question.${q.id}.rationale`, q.rationale);
export const questionLookout = (q: DiligenceQuestion) =>
  q.lookoutSignal ? data(`question.${q.id}.lookout`, q.lookoutSignal) : '';
export const areaTitle = (a: AttentionArea) => data(`area.${a.id}.title`, a.title);
export const areaDescription = (a: AttentionArea) =>
  data(`area.${a.id}.description`, a.description);
export const topicLabel = (t: TopicOutput) => data(`topic.${t.topicId}.label`, t.topicLabel);
export const topicAudience = (t: TopicOutput) =>
  data(`topic.${t.topicId}.audience`, t.audienceLevel);
export const topicSubtitle = (t: TopicOutput) =>
  t.subtitle ? data(`topic.${t.topicId}.subtitle`, t.subtitle) : '';

/** `Valuation Drag` → `valuation-drag`: the CSS class and the catalog key. */
export const exitImpactSlug = (impact: string) => impact.toLowerCase().replaceAll(' ', '-');
export const exitImpactLabel = (impact: string) =>
  data(`exitImpact.${exitImpactSlug(impact)}`, impact);
export const priorityLabel = (priority: string) => data(`priority.${priority}`, priority);
export const relevanceLabel = (relevance: string) => data(`relevance.${relevance}`, relevance);

/** The input dimensions, in the order the target-parameters block lists them. */
export const META_DIMENSIONS = [
  'transactionType',
  'productType',
  'techArchetype',
  'headcount',
  'revenueRange',
  'growthStage',
  'companyAge',
  'geographies',
  'businessModel',
  'scaleIntensity',
  'transformationState',
  'dataSensitivity',
  'operatingModel',
] as const satisfies readonly (keyof UserInputs)[];

export type MetaDimension = (typeof META_DIMENSIONS)[number];

/** The wizard step (or compound field) that holds each dimension's options. */
export const DIMENSION_SOURCE: Record<MetaDimension, { stepId: string; optionsId: string }> = {
  transactionType: { stepId: 'transaction-type', optionsId: 'transaction-type' },
  productType: { stepId: 'product-type', optionsId: 'product-type' },
  techArchetype: { stepId: 'tech-archetype', optionsId: 'tech-archetype' },
  headcount: { stepId: 'company-profile', optionsId: 'headcount' },
  revenueRange: { stepId: 'company-profile', optionsId: 'revenue-range' },
  growthStage: { stepId: 'company-profile', optionsId: 'growth-stage' },
  companyAge: { stepId: 'company-profile', optionsId: 'company-age' },
  geographies: { stepId: 'geography', optionsId: 'geography' },
  businessModel: { stepId: 'business-model', optionsId: 'business-model' },
  scaleIntensity: { stepId: 'scale-intensity', optionsId: 'scale-intensity' },
  transformationState: { stepId: 'transformation-state', optionsId: 'transformation-state' },
  dataSensitivity: { stepId: 'data-sensitivity', optionsId: 'data-sensitivity' },
  operatingModel: { stepId: 'operating-model', optionsId: 'operating-model' },
};

/**
 * An option's label. `optionsId` is the step id, or the field id inside the
 * compound company-profile step. A "Not sure" answer reads as the button does.
 */
export function optionLabel(optionsId: string, optionId: string): string {
  if (optionId === 'unknown') return s('option.unknown');
  const key = `option.${optionsId}.${optionId}.label`;
  return hasString(key) ? s(key) : optionId;
}

/** "51 – 200 employees"; a "Not sure" answer reads as itself. */
export function headcountValue(headcount: string): string {
  const range = optionLabel('headcount', headcount);
  return headcount === 'unknown' ? range : s('js.meta.headcountValue', { range });
}

/** The input dimension each engine condition key (and so each trigger label) stands for. */
export const CONDITION_DIMENSION: Record<string, MetaDimension> = {
  transactionTypes: 'transactionType',
  excludeTransactionTypes: 'transactionType',
  productTypes: 'productType',
  techArchetypes: 'techArchetype',
  growthStages: 'growthStage',
  geographies: 'geographies',
  headcountMin: 'headcount',
  revenueMin: 'revenueRange',
  companyAgeMin: 'companyAge',
  businessModels: 'businessModel',
  scaleIntensity: 'scaleIntensity',
  transformationStates: 'transformationState',
  dataSensitivity: 'dataSensitivity',
  operatingModels: 'operatingModel',
};

const TRIGGER_DIMENSION = new Map<string, MetaDimension>(
  Object.entries(CONDITION_LABELS).map(([key, label]) => [label, CONDITION_DIMENSION[key]])
);

/** An engine trigger label ("Tech Stack") in the page's language. */
export function triggerLabel(english: string): string {
  const dimension = TRIGGER_DIMENSION.get(english);
  return dimension ? s(`js.meta.${dimension}`) : english;
}

export interface MetaField {
  dimension: MetaDimension;
  stepId: string;
  label: string;
  value: string;
}

/** The answered dimensions, labelled and valued: the target-parameters block and the clipboard. */
export function metaFields(inputs: Partial<UserInputs>, lang: string): MetaField[] {
  const fields: MetaField[] = [];
  for (const dimension of META_DIMENSIONS) {
    const { stepId, optionsId } = DIMENSION_SOURCE[dimension];
    let value: string;
    if (dimension === 'geographies') {
      const geos = inputs.geographies ?? [];
      if (geos.length === 0) continue;
      value = formatList(
        geos.map((g) => optionLabel(optionsId, g)),
        lang,
        ', '
      );
    } else {
      const answer = inputs[dimension];
      if (!answer) continue;
      value = dimension === 'headcount' ? headcountValue(answer) : optionLabel(optionsId, answer);
    }
    fields.push({ dimension, stepId, label: s(`js.meta.${dimension}`), value });
  }
  return fields;
}

/** Saved when the visitor leaves the identifier alone; shown as the default. */
export const DEFAULT_TARGET_IDENTIFIER = '';

/**
 * A saved identifier as the page keeps it. Before BL-153 the default was saved
 * as the English word `'Target'`; it reads as "no identifier" now, so a
 * returning visitor on /es/ or /pt/ sees the default in their language.
 */
export function normalizeTargetIdentifier(saved: string | undefined): string {
  return !saved || saved === 'Target' ? DEFAULT_TARGET_IDENTIFIER : saved;
}

/** The identifier to show: the visitor's own, or the default. */
export function displayTargetIdentifier(identifier: string): string {
  return identifier || s('js.defaultTarget');
}

export interface ClipboardInput {
  script: GeneratedScript;
  inputs: Partial<UserInputs>;
  targetIdentifier: string;
  dismissedAttention: ReadonlySet<string>;
  dismissedQuestions: ReadonlySet<string>;
  now: Date;
  lang: string;
}

/** The plain-text agenda the Copy button puts on the clipboard. */
export function buildClipboardText({
  script,
  inputs,
  targetIdentifier,
  dismissedAttention,
  dismissedQuestions,
  now,
  lang,
}: ClipboardInput): string {
  const upper = (text: string) => text.toLocaleUpperCase(lang);
  const rule = '═'.repeat(60);
  const fields = metaFields(inputs, lang);
  const identifierLabel = s('js.clip.identifier');
  // Values line up two columns past the longest "label:", in every language.
  const width = Math.max(identifierLabel.length, ...fields.map((f) => f.label.length)) + 3;
  const row = (label: string, value: string) => `${label}:`.padEnd(width) + value;

  const lines: string[] = [];
  lines.push(upper(s('js.clip.title')));
  lines.push('GST');
  lines.push(s('js.clip.generated', { date: formatDate(now, lang) }));
  lines.push('');
  lines.push(rule);
  lines.push(upper(s('js.meta.heading')));
  lines.push(rule);
  lines.push('');
  lines.push(row(identifierLabel, displayTargetIdentifier(targetIdentifier)));
  for (const f of fields) lines.push(row(f.label, f.value));
  lines.push('');

  const activeAreas = script.attentionAreas.filter((a) => !dismissedAttention.has(a.id));
  if (activeAreas.length > 0) {
    lines.push(rule);
    lines.push(upper(s('js.attentionHeading')));
    lines.push(rule);
    lines.push('');
    for (const area of activeAreas) {
      lines.push(`[${upper(relevanceLabel(area.relevance))}] ${areaTitle(area)}`);
      lines.push(`  ${areaDescription(area)}`);
      lines.push('');
    }
  }

  for (const [topicIndex, topic] of script.topics.entries()) {
    const activeQuestions = topic.questions.filter((q) => !dismissedQuestions.has(q.id));
    if (activeQuestions.length === 0) continue;

    lines.push(rule);
    lines.push(upper(s('js.clip.topic', { n: topicIndex + 1, label: topicLabel(topic) })));
    lines.push(s('js.clip.audience', { audience: topicAudience(topic) }));
    lines.push(rule);
    lines.push('');

    for (const [qIndex, q] of activeQuestions.entries()) {
      const impactTag = q.exitImpact ? ` [${exitImpactLabel(q.exitImpact)}]` : '';
      const priority = upper(priorityLabel(q.priority));
      lines.push(`${topicIndex + 1}.${qIndex + 1} [${priority}]${impactTag} ${questionText(q)}`);
      const lookout = questionLookout(q);
      if (lookout) lines.push(`    ${lookout}`);
      lines.push(`    ${s('js.clip.rationale', { text: questionRationale(q) })}`);
      const triggers = (script.triggerMap[q.id] ?? []).map(triggerLabel);
      if (triggers.length > 0) lines.push(`    ${s('js.triggeredBy')} ${triggers.join(', ')}`);
      lines.push('');
    }
  }

  lines.push('─'.repeat(60));
  lines.push('Global Strategic Technologies | globalstrategic.tech');
  return lines.join('\n');
}
