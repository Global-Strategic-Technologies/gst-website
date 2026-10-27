// @vitest-environment jsdom
/**
 * The Diligence Machine page's words (BL-153 Tier B): option labels, the
 * target-parameters block, trigger tags, the saved identifier, and the
 * clipboard text — in English with no island, and from the island when the
 * page has one.
 */
import {
  buildClipboardText,
  displayTargetIdentifier,
  headcountValue,
  metaFields,
  normalizeTargetIdentifier,
  optionLabel,
  questionText,
  topicLabel,
  triggerLabel,
} from '../../src/scripts/diligence-machine/logic';
import { resetStringsForTest } from '../../src/scripts/diligence-machine/strings';
import { CONDITION_LABELS, type GeneratedScript } from '../../src/utils/diligence-engine';
import type { UserInputs } from '../../src/utils/diligence-engine';

const INPUTS: UserInputs = {
  transactionType: 'carve-out',
  productType: 'b2b-saas',
  techArchetype: 'hybrid-legacy',
  headcount: '51-200',
  revenueRange: '25-100m',
  growthStage: 'mature',
  companyAge: 'unknown',
  geographies: ['us', 'eu', 'multi-region'],
  businessModel: 'services-led',
  scaleIntensity: 'high',
  transformationState: 'mid-migration',
  dataSensitivity: 'high',
  operatingModel: 'hybrid',
};

const SCRIPT: GeneratedScript = {
  topics: [
    {
      topicId: 'architecture',
      topicLabel: 'Architecture',
      audienceLevel: 'CTO / VP Engineering / Senior Architect',
      subtitle: 'System design',
      questions: [
        {
          id: 'arch-01',
          topic: 'architecture',
          topicLabel: 'Architecture',
          audienceLevel: 'CTO',
          text: 'Q text?',
          rationale: 'Because.',
          priority: 'high',
          exitImpact: 'Valuation Drag',
          lookoutSignal: 'Watch for X',
          conditions: {},
        },
        {
          id: 'arch-02',
          topic: 'architecture',
          topicLabel: 'Architecture',
          audienceLevel: 'CTO',
          text: 'Dismissed?',
          rationale: 'Hidden.',
          priority: 'standard',
          conditions: {},
        },
      ],
    },
  ],
  attentionAreas: [
    { id: 'a1', title: 'Area One', description: 'Desc one.', relevance: 'high', conditions: {} },
    { id: 'a2', title: 'Area Two', description: 'Desc two.', relevance: 'medium', conditions: {} },
  ],
  triggerMap: { 'arch-01': ['Tech Stack', 'Revenue'], 'arch-02': [] },
  metadata: { totalQuestions: 2, generatedAt: '', inputSummary: {} },
};

const RULE = '═'.repeat(60);

afterEach(() => {
  document.body.innerHTML = '';
  document.documentElement.lang = '';
  resetStringsForTest();
});

describe('Diligence Machine logic — labels in English', () => {
  it('labels options of plain steps and compound fields', () => {
    expect(optionLabel('transaction-type', 'carve-out')).toBe('Carve-out');
    expect(optionLabel('headcount', '51-200')).toBe('51 – 200');
  });

  it('labels a "Not sure" answer as the button does, not as the raw sentinel', () => {
    expect(optionLabel('company-age', 'unknown')).toBe('Not sure');
    expect(headcountValue('unknown')).toBe('Not sure');
    expect(headcountValue('201-500')).toBe('201 – 500 employees');
  });

  it('every engine trigger label reads as itself in English', () => {
    for (const label of Object.values(CONDITION_LABELS)) expect(triggerLabel(label)).toBe(label);
  });

  it('lists the answered dimensions in order, with their wizard step', () => {
    const fields = metaFields(INPUTS, 'en');
    expect(fields.map((f) => [f.label, f.value])).toEqual([
      ['Transaction Type', 'Carve-out'],
      ['Product Type', 'B2B SaaS'],
      ['Tech Stack', 'Hybrid Legacy'],
      ['Company Size', '51 – 200 employees'],
      ['Revenue', '$25M – $100M'],
      ['Growth Stage', 'Mature'],
      ['Company Age', 'Not sure'],
      ['Geography', 'United States, European Union, Multi-Region'],
      ['Business Model', 'Services-Led'],
      ['Scale Intensity', 'High'],
      ['Transformation', 'Mid-Migration'],
      ['Data Sensitivity', 'High'],
      ['Operating Model', 'Hybrid'],
    ]);
    expect(fields[3].stepId).toBe('company-profile');
  });
});

describe('Diligence Machine logic — the target identifier', () => {
  it('reads the old saved English default as "none", and keeps anything else', () => {
    expect(normalizeTargetIdentifier('Target')).toBe('');
    expect(normalizeTargetIdentifier(undefined)).toBe('');
    expect(normalizeTargetIdentifier('Project Falcon')).toBe('Project Falcon');
  });

  it('shows the default when there is none', () => {
    expect(displayTargetIdentifier('')).toBe('Target');
    expect(displayTargetIdentifier('Project Falcon')).toBe('Project Falcon');
  });
});

describe('Diligence Machine logic — clipboard text', () => {
  it('is the English agenda the page has always copied, minus dismissed items', () => {
    const text = buildClipboardText({
      script: SCRIPT,
      inputs: INPUTS,
      targetIdentifier: '',
      dismissedAttention: new Set(['a2']),
      dismissedQuestions: new Set(['arch-02']),
      now: new Date(2026, 9, 27, 14, 5),
      lang: 'en',
    });
    expect(text).toBe(
      [
        'OVERVIEW AND AGENDA',
        'GST',
        'Generated: October 27, 2026',
        '',
        RULE,
        'TARGET PARAMETERS',
        RULE,
        '',
        'Identifier:        Target',
        'Transaction Type:  Carve-out',
        'Product Type:      B2B SaaS',
        'Tech Stack:        Hybrid Legacy',
        'Company Size:      51 – 200 employees',
        'Revenue:           $25M – $100M',
        'Growth Stage:      Mature',
        'Company Age:       Not sure',
        'Geography:         United States, European Union, Multi-Region',
        'Business Model:    Services-Led',
        'Scale Intensity:   High',
        'Transformation:    Mid-Migration',
        'Data Sensitivity:  High',
        'Operating Model:   Hybrid',
        '',
        RULE,
        'ATTENTION AREAS',
        RULE,
        '',
        '[HIGH] Area One',
        '  Desc one.',
        '',
        RULE,
        'TOPIC 1: ARCHITECTURE',
        'Audience: CTO / VP Engineering / Senior Architect',
        RULE,
        '',
        '1.1 [HIGH] [Valuation Drag] Q text?',
        '    Watch for X',
        '    Rationale: Because.',
        '    Triggered by: Tech Stack, Revenue',
        '',
        '─'.repeat(60),
        'Global Strategic Technologies | globalstrategic.tech',
      ].join('\n')
    );
  });
});

describe('Diligence Machine logic — reads the island when there is one', () => {
  function island(strings: Record<string, string>, lang: string) {
    document.documentElement.lang = lang;
    document.body.innerHTML = `<script type="application/json" data-dm-strings>${JSON.stringify(strings)}</script>`;
    resetStringsForTest();
  }

  it('translates data by id over the engine English, and falls back per key', () => {
    island(
      {
        'question.arch-01.text': '¿Pregunta?',
        'topic.architecture.label': 'Arquitectura',
        'js.meta.techArchetype': 'Stack tecnológico',
        'option.unknown': 'No estoy seguro',
      },
      'es'
    );
    expect(questionText(SCRIPT.topics[0].questions[0])).toBe('¿Pregunta?');
    expect(questionText(SCRIPT.topics[0].questions[1])).toBe('Dismissed?');
    expect(topicLabel(SCRIPT.topics[0])).toBe('Arquitectura');
    expect(triggerLabel('Tech Stack')).toBe('Stack tecnológico');
    expect(triggerLabel('Revenue')).toBe('Revenue');
    expect(optionLabel('geography', 'unknown')).toBe('No estoy seguro');
  });

  it('lists geographies in the page language and pads the clipboard to its own labels', () => {
    island(
      {
        'option.geography.us.label': 'Estados Unidos',
        'option.geography.eu.label': 'Unión Europea',
        'option.geography.multi-region.label': 'Multirregión',
        'js.meta.geographies': 'Geografía',
        'js.meta.dataSensitivity': 'Sensibilidad de los datos',
      },
      'es'
    );
    const geo = metaFields(INPUTS, 'es').find((f) => f.dimension === 'geographies')!;
    expect(geo.value).toBe('Estados Unidos, Unión Europea y Multirregión');
    const text = buildClipboardText({
      script: SCRIPT,
      inputs: INPUTS,
      targetIdentifier: 'Falcon',
      dismissedAttention: new Set(),
      dismissedQuestions: new Set(),
      now: new Date(2026, 9, 27),
      lang: 'es',
    });
    const width = 'Sensibilidad de los datos:'.length + 2;
    expect(text).toContain(`${'Identifier:'.padEnd(width)}Falcon`);
    expect(text).toContain(`${'Geografía:'.padEnd(width)}Estados Unidos`);
    expect(text).toContain('Generated: 27 de octubre de 2026');
  });
});
