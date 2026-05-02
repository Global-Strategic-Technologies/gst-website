/**
 * The Diligence Engine
 *
 * Pure-function module that maps user inputs to a prescriptive
 * "Inquisitor's Script" of due diligence questions and attention areas.
 * Zero DOM dependencies — fully testable with Vitest.
 */

import { QUESTIONS, TOPIC_META } from '../data/diligence-machine/questions';
import { ATTENTION_AREAS } from '../data/diligence-machine/attention-areas';
import { BRACKET_ORDER } from '../data/diligence-machine/wizard-config';
import type { DiligenceQuestion, QuestionCondition } from '../data/diligence-machine/questions';
import type { AttentionArea } from '../data/diligence-machine/attention-areas';

/**
 * Engine-facing input shape. Fields are typed as `string` so partial wizard
 * state (mid-flow, with sentinels) and validated MCP payloads (literal-typed
 * by `UserInputsSchema` in `src/schemas/diligence.ts`) both assign cleanly.
 *
 * The strict literal-union shape lives on the schema's `z.infer<>` —
 * callers that want the narrower type can derive it from the schema.
 */
export interface UserInputs {
  transactionType: string;
  productType: string;
  techArchetype: string;
  headcount: string;
  revenueRange: string;
  growthStage: string;
  companyAge: string;
  geographies: string[];
  businessModel: string;
  scaleIntensity: string;
  transformationState: string;
  dataSensitivity: string;
  operatingModel: string;
}

export interface TopicOutput {
  topicId: string;
  topicLabel: string;
  audienceLevel: string;
  subtitle?: string;
  questions: DiligenceQuestion[];
}

export interface GeneratedScript {
  topics: TopicOutput[];
  attentionAreas: AttentionArea[];
  triggerMap: Record<string, string[]>;
  metadata: {
    totalQuestions: number;
    generatedAt: string;
    inputSummary: Record<string, string | string[]>;
  };
}

const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  standard: 2,
};

const RELEVANCE_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Compare an ordinal bracket value against a minimum threshold.
 * Returns true if the user's selection is at or above the minimum.
 */
export function meetsMinimumBracket(
  bracketType: keyof typeof BRACKET_ORDER,
  userValue: string,
  minimumValue: string
): boolean {
  const order = BRACKET_ORDER[bracketType] as readonly string[];
  const userIndex = order.indexOf(userValue);
  const minIndex = order.indexOf(minimumValue);

  // If either value is not found in the ordering, don't filter it out
  if (userIndex === -1 || minIndex === -1) return true;

  return userIndex >= minIndex;
}

/**
 * Check if a set of conditions matches the user's inputs.
 * Undefined condition fields are wildcards (match everything).
 * Specified arrays use OR logic within, AND logic across fields.
 *
 * BL-031.95 Phase 2 — `'unknown'` widening: when an input value is the
 * `'unknown'` sentinel (or `geographies` is exactly `['unknown']`), the
 * corresponding filter is treated as wildcard. Only KNOWN values can
 * eliminate triggers; missing-information inputs widen the agenda
 * conservatively, mirroring ICG's `-1` "Not sure" pattern. The
 * `'unknown'` sentinel is documented in `src/schemas/diligence.ts`
 * (see `UNKNOWN_INPUT`).
 */
export function matchesConditions(conditions: QuestionCondition, inputs: UserInputs): boolean {
  // Single-value enum fields: skip the filter if the input is 'unknown'.
  if (
    conditions.transactionTypes &&
    inputs.transactionType !== 'unknown' &&
    !conditions.transactionTypes.includes(inputs.transactionType)
  ) {
    return false;
  }

  if (
    conditions.excludeTransactionTypes &&
    inputs.transactionType !== 'unknown' &&
    conditions.excludeTransactionTypes.includes(inputs.transactionType)
  ) {
    return false;
  }

  if (
    conditions.productTypes &&
    inputs.productType !== 'unknown' &&
    !conditions.productTypes.includes(inputs.productType)
  ) {
    return false;
  }

  if (
    conditions.techArchetypes &&
    inputs.techArchetype !== 'unknown' &&
    !conditions.techArchetypes.includes(inputs.techArchetype)
  ) {
    return false;
  }

  if (
    conditions.growthStages &&
    inputs.growthStage !== 'unknown' &&
    !conditions.growthStages.includes(inputs.growthStage)
  ) {
    return false;
  }

  // Geographies array: when ['unknown'], treat as wildcard.
  if (conditions.geographies) {
    const isUnknownOnly = inputs.geographies.length === 1 && inputs.geographies[0] === 'unknown';
    if (!isUnknownOnly && !conditions.geographies.some((g) => inputs.geographies.includes(g))) {
      return false;
    }
  }

  // Ordinal fields: meetsMinimumBracket already returns true when the
  // value isn't in the bracket order; the explicit 'unknown' guard
  // here makes the intent self-documenting at the call site.
  if (
    conditions.headcountMin &&
    inputs.headcount !== 'unknown' &&
    !meetsMinimumBracket('headcount', inputs.headcount, conditions.headcountMin)
  ) {
    return false;
  }

  if (
    conditions.revenueMin &&
    inputs.revenueRange !== 'unknown' &&
    !meetsMinimumBracket('revenue-range', inputs.revenueRange, conditions.revenueMin)
  ) {
    return false;
  }

  if (
    conditions.companyAgeMin &&
    inputs.companyAge !== 'unknown' &&
    !meetsMinimumBracket('company-age', inputs.companyAge, conditions.companyAgeMin)
  ) {
    return false;
  }

  // v2 condition dimensions
  if (
    conditions.businessModels &&
    inputs.businessModel !== 'unknown' &&
    !conditions.businessModels.includes(inputs.businessModel)
  ) {
    return false;
  }

  if (
    conditions.scaleIntensity &&
    inputs.scaleIntensity !== 'unknown' &&
    !conditions.scaleIntensity.includes(inputs.scaleIntensity)
  ) {
    return false;
  }

  if (
    conditions.transformationStates &&
    inputs.transformationState !== 'unknown' &&
    !conditions.transformationStates.includes(inputs.transformationState)
  ) {
    return false;
  }

  if (
    conditions.dataSensitivity &&
    inputs.dataSensitivity !== 'unknown' &&
    !conditions.dataSensitivity.includes(inputs.dataSensitivity)
  ) {
    return false;
  }

  if (
    conditions.operatingModels &&
    inputs.operatingModel !== 'unknown' &&
    !conditions.operatingModels.includes(inputs.operatingModel)
  ) {
    return false;
  }

  return true;
}

/**
 * Sort questions by priority (high first, then medium, then standard).
 */
export function sortByPriority(questions: DiligenceQuestion[]): DiligenceQuestion[] {
  return [...questions].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2)
  );
}

/**
 * Balance question selection across topics while respecting a total cap.
 * Ensures minimum representation per topic (3 if available), then fills
 * remaining slots by priority across all topics.
 */
export function balanceAcrossTopics(
  questions: DiligenceQuestion[],
  _minTotal: number,
  maxTotal: number
): DiligenceQuestion[] {
  const topicIds = Object.keys(TOPIC_META) as Array<keyof typeof TOPIC_META>;
  const byTopic: Record<string, DiligenceQuestion[]> = {};

  for (const id of topicIds) {
    byTopic[id] = [];
  }

  for (const q of questions) {
    if (byTopic[q.topic]) {
      byTopic[q.topic].push(q);
    }
  }

  // Sort each topic's questions by priority
  for (const id of topicIds) {
    byTopic[id] = sortByPriority(byTopic[id]);
  }

  const selected = new Set<string>();
  const result: DiligenceQuestion[] = [];
  const minPerTopic = 3;

  // Phase 1: Reserve minimum per topic
  for (const id of topicIds) {
    const topicQuestions = byTopic[id];
    const take = Math.min(minPerTopic, topicQuestions.length);
    for (let i = 0; i < take; i++) {
      selected.add(topicQuestions[i].id);
      result.push(topicQuestions[i]);
    }
  }

  // Phase 2: Fill remaining slots from all topics by priority
  if (result.length < maxTotal) {
    const remaining = questions.filter((q) => !selected.has(q.id));
    const sorted = sortByPriority(remaining);

    for (const q of sorted) {
      if (result.length >= maxTotal) break;
      selected.add(q.id);
      result.push(q);
    }
  }

  return result;
}

/**
 * Group selected questions into topic-ordered output sections.
 */
export function groupByTopic(questions: DiligenceQuestion[]): TopicOutput[] {
  const topicIds = Object.keys(TOPIC_META) as Array<keyof typeof TOPIC_META>;
  const topics: TopicOutput[] = [];

  for (const id of topicIds) {
    const meta = TOPIC_META[id];
    const topicQuestions = sortByPriority(questions.filter((q) => q.topic === id));

    if (topicQuestions.length > 0) {
      topics.push({
        topicId: id,
        topicLabel: meta.label,
        audienceLevel: meta.audience,
        subtitle: meta.subtitle,
        questions: topicQuestions,
      });
    }
  }

  return topics;
}

/**
 * Filter out questions that are exclusively cloud-native when the target
 * is on-premise or self-managed infrastructure.
 *
 * Trigger: productType === 'on-premise-enterprise' OR
 *          techArchetype in ['self-managed-infra', 'datacenter-vendor']
 */
export function applyArchetypePivot(
  questions: DiligenceQuestion[],
  inputs: UserInputs
): DiligenceQuestion[] {
  const isOnPrem =
    inputs.productType === 'on-premise-enterprise' ||
    inputs.techArchetype === 'self-managed-infra' ||
    inputs.techArchetype === 'datacenter-vendor';

  if (!isOnPrem) return questions;

  return questions.filter((q) => {
    // Remove questions whose conditions specify ONLY modern-cloud-native
    if (
      q.conditions.techArchetypes &&
      q.conditions.techArchetypes.length > 0 &&
      q.conditions.techArchetypes.every((a) => a === 'modern-cloud-native')
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Inject computed attention areas based on cross-field logic that cannot be
 * expressed as simple condition arrays.
 *
 * Maturity Override: high-revenue + low headcount + mature growth →
 * inject "Manual Operations Masking" attention area.
 */
export function applyMaturityOverrides(
  areas: AttentionArea[],
  inputs: UserInputs
): AttentionArea[] {
  const isHighRevLowHead =
    meetsMinimumBracket('revenue-range', inputs.revenueRange, '25-100m') &&
    !meetsMinimumBracket('headcount', inputs.headcount, '201-500') &&
    inputs.growthStage === 'mature';

  if (!isHighRevLowHead) return areas;

  const alreadyPresent = areas.some((a) => a.id === 'attention-manual-ops-masking');
  if (alreadyPresent) return areas;

  return [
    ...areas,
    {
      id: 'attention-manual-ops-masking',
      title: 'Manual Operations Masking',
      description:
        'High-revenue companies with low headcount growth may be masking manual operations behind a technology facade. Revenue per employee ratios that appear favorable may actually indicate process bottlenecks that limit scalability.',
      relevance: 'high',
      conditions: {},
    },
  ];
}

/** Human-readable labels for condition dimensions */
const CONDITION_LABELS: Record<string, string> = {
  transactionTypes: 'Transaction Type',
  excludeTransactionTypes: 'Transaction Type',
  productTypes: 'Product Type',
  techArchetypes: 'Tech Stack',
  growthStages: 'Growth Stage',
  geographies: 'Geography',
  headcountMin: 'Company Size',
  revenueMin: 'Revenue',
  companyAgeMin: 'Company Age',
  businessModels: 'Business Model',
  scaleIntensity: 'Scale Intensity',
  transformationStates: 'Transformation',
  dataSensitivity: 'Data Sensitivity',
  operatingModels: 'Operating Model',
};

/**
 * Compute the human-readable trigger labels for a question based on which
 * condition fields are non-wildcard (i.e., actually constrain the match).
 */
export function computeTriggers(conditions: QuestionCondition): string[] {
  const triggers: string[] = [];
  for (const [key, label] of Object.entries(CONDITION_LABELS)) {
    const value = conditions[key as keyof QuestionCondition];
    if (value !== undefined && value !== null) {
      if (Array.isArray(value) && value.length === 0) continue;
      if (!triggers.includes(label)) triggers.push(label);
    }
  }
  return triggers;
}

/**
 * Main engine function: takes user inputs, returns the generated script.
 * Pure function, no side effects, fully testable.
 */
export function generateScript(inputs: UserInputs): GeneratedScript {
  // 1. Filter questions by conditions
  const matchedQuestions = QUESTIONS.filter((q) => matchesConditions(q.conditions, inputs));

  // 2. Apply archetype pivot (filter cloud-native Qs for on-prem targets)
  const pivotedQuestions = applyArchetypePivot(matchedQuestions, inputs);

  // 3. Balance across topics
  const selected = balanceAcrossTopics(pivotedQuestions, 15, 20);
  const topics = groupByTopic(selected);

  // 4. Build trigger map for input-to-output traceability
  const triggerMap: Record<string, string[]> = {};
  for (const q of selected) {
    triggerMap[q.id] = computeTriggers(q.conditions);
  }

  // 5. Filter attention areas by conditions
  const matchedAreas = ATTENTION_AREAS.filter((a) => matchesConditions(a.conditions, inputs));

  // 6. Apply maturity overrides (inject computed attention areas)
  const enrichedAreas = applyMaturityOverrides(matchedAreas, inputs);

  return {
    topics,
    triggerMap,
    // 7. Sort attention areas by relevance
    attentionAreas: [...enrichedAreas].sort(
      (a, b) => (RELEVANCE_ORDER[a.relevance] ?? 2) - (RELEVANCE_ORDER[b.relevance] ?? 2)
    ),
    metadata: {
      totalQuestions: selected.length,
      generatedAt: new Date().toISOString(),
      inputSummary: {
        transactionType: inputs.transactionType,
        productType: inputs.productType,
        techArchetype: inputs.techArchetype,
        headcount: inputs.headcount,
        revenueRange: inputs.revenueRange,
        growthStage: inputs.growthStage,
        companyAge: inputs.companyAge,
        geographies: inputs.geographies,
        businessModel: inputs.businessModel,
        scaleIntensity: inputs.scaleIntensity,
        transformationState: inputs.transformationState,
        dataSensitivity: inputs.dataSensitivity,
        operatingModel: inputs.operatingModel,
      },
    },
  };
}

export const MULTI_REGION_ID = 'multi-region';

/**
 * Synchronize 'multi-region' based on non-MR geography count.
 * - 2+ non-MR geos → ensure MR is included
 * - 1 non-MR geo → ensure MR is removed
 * - 0 non-MR geos → no change (standalone MR allowed)
 *
 * Does NOT handle the "user deselects MR" clear-all case;
 * that is a UI-level concern handled in the click handler.
 *
 * Returns a new array (does not mutate the input).
 */
export function syncMultiRegion(geographies: string[]): string[] {
  const nonMR = geographies.filter((g) => g !== MULTI_REGION_ID);
  const hasMR = geographies.includes(MULTI_REGION_ID);

  if (nonMR.length >= 2 && !hasMR) {
    return [...geographies, MULTI_REGION_ID];
  }
  if (nonMR.length === 1 && hasMR) {
    return nonMR;
  }
  return geographies;
}
