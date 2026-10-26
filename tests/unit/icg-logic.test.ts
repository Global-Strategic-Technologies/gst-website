// @vitest-environment jsdom
import {
  counted,
  emailHref,
  foundationalTitle,
  gaugeArcSVG,
  maturityDescription,
  radarChartSVG,
  radarLabel,
} from '../../src/scripts/infrastructure-cost-governance/logic';
import { resetStringsForTest } from '../../src/scripts/infrastructure-cost-governance/strings';
import { ANSWER_OPTIONS, DOMAINS } from '../../src/data/infrastructure-cost-governance/domains';
import { RECOMMENDATIONS } from '../../src/data/infrastructure-cost-governance/recommendations';
import { BENCHMARK_RANGES } from '../../src/utils/icg-engine';
import { COMPANY_STAGE_VALUES, EffortSchema, ImpactSchema } from '../../src/schemas/icg';
import EN from '../../src/i18n/en/infrastructure-cost-governance.json';

const count = (s: string, needle: string) => s.split(needle).length - 1;

describe('ICG logic — maturityDescription', () => {
  it.each([
    [0, 'black box'],
    [25, 'black box'],
    [26, 'Some monitoring'],
    [50, 'Some monitoring'],
    [51, 'Active cost management'],
    [75, 'Active cost management'],
    [76, 'managed, optimized discipline'],
    [100, 'managed, optimized discipline'],
  ])('score %i reads "%s"', (score, phrase) => {
    expect(maturityDescription(score)).toContain(phrase);
  });
});

describe('ICG logic — gaugeArcSVG', () => {
  it('labels the score for assistive tech and prints it in the given colour', () => {
    const svg = gaugeArcSVG(62, '#123456');
    expect(svg).toContain('aria-label="Maturity score: 62 out of 100"');
    expect(svg).toContain('fill:#123456">62</text>');
    expect(svg).toContain('stroke="#123456"');
  });

  it('draws no fill arc at zero, only the track', () => {
    const svg = gaugeArcSVG(0, '#123456');
    expect(count(svg, '<path')).toBe(1);
    expect(svg).not.toContain('stroke="#123456"');
  });

  it('ends a full score at the right-hand end of the track', () => {
    // cx 110, r 78: the track runs from x=32 to x=188 at y=92
    expect(gaugeArcSVG(100, '#123456')).toContain('A 78 78 0 0 1 188.00 92.00');
  });
});

describe('ICG logic — radarChartSVG', () => {
  const scores = DOMAINS.map((d, i) => ({ label: radarLabel(d.id), score: (i * 17) % 101 }));
  const svg = radarChartSVG(scores);

  it('draws four grid rings plus the data polygon, and one axis, label and point per domain', () => {
    expect(count(svg, '<polygon')).toBe(5);
    expect(count(svg, '<line')).toBe(scores.length);
    expect(count(svg, '<text')).toBe(scores.length);
    expect(count(svg, '<circle')).toBe(scores.length);
  });

  it('labels each axis with its written short name, escaped', () => {
    expect(svg).toContain('>Visibility &amp; Tagging</text>');
    expect(svg).toContain('>Right-Sizing</text>');
    expect(svg).not.toMatch(/&amp;<\/text>/);
    for (const d of DOMAINS) expect(radarLabel(d.id), d.id).not.toBe(`domain.${d.id}.short`);
  });

  it('uses theme tokens, not currentColor, so it prints on white paper', () => {
    expect(svg).not.toContain('currentColor');
    expect(svg).toContain('var(--color-primary)');
  });
});

describe('ICG logic — emailHref', () => {
  const url = 'https://globalstrategic.tech/hub/tools/infrastructure-cost-governance/?s=abc';

  it('landing: shares the tool without the query string', () => {
    const href = emailHref('landing', url);
    expect(href.startsWith('mailto:?subject=')).toBe(true);
    const body = decodeURIComponent(href.split('&body=')[1]);
    expect(body).toContain('/hub/tools/infrastructure-cost-governance/');
    expect(body).not.toContain('?s=abc');
  });

  it('results: puts the score in the subject and keeps the full link with state', () => {
    const href = emailHref('results', url, 64);
    const [subject, body] = href.slice('mailto:?subject='.length).split('&body=');
    expect(decodeURIComponent(subject)).toBe('Infrastructure Cost Governance - 64/100');
    expect(decodeURIComponent(body)).toContain(url);
  });
});

// ─── Localization (BL-153 Tier B) ─────────────────────────────────────────

describe('ICG catalog — English equals the data and engine it mirrors', () => {
  const en = EN as Record<string, string>;

  it('domains, questions and their rationale', () => {
    for (const d of DOMAINS) {
      expect(en[`domain.${d.id}.name`]).toBe(d.name);
      expect(en[`domain.${d.id}.description`]).toBe(d.description);
      for (const q of d.questions) {
        expect(en[`question.${q.id}.text`]).toBe(q.text);
        if (q.rationale) expect(en[`question.${q.id}.rationale`]).toBe(q.rationale);
      }
    }
  });

  it('recommendations', () => {
    for (const r of RECOMMENDATIONS) {
      expect(en[`rec.${r.id}.title`]).toBe(r.title);
      expect(en[`rec.${r.id}.description`]).toBe(r.description);
    }
  });

  it('answer labels, stages, maturity levels, impact and effort', () => {
    for (const o of ANSWER_OPTIONS) expect(en[`answer.${o.score}`]).toBe(o.label);
    for (const b of BENCHMARK_RANGES) expect(en[`stage.${b.stageKey}`]).toBe(b.label);
    for (const stage of COMPANY_STAGE_VALUES) expect(en[`stageRow.${stage}`]).toBeTruthy();
    for (const level of ['Reactive', 'Aware', 'Optimizing', 'Strategic']) {
      expect(en[`maturity.${level}`]).toBe(level);
    }
    for (const id of ImpactSchema.options) expect(en[`impact.${id}`]).toBe(id);
    for (const id of EffortSchema.options) expect(en[`effort.${id}`]).toBe(id.replace('-', ' '));
  });
});

describe('ICG logic — counts and the foundational title', () => {
  it('picks one or other in English', () => {
    expect(counted('js.recCount', 1)).toBe('1 rec');
    expect(counted('js.recCount', 3)).toBe('3 recs');
    expect(counted('js.skipped', 2)).toBe('2 skipped');
  });

  it('names one or two foundational domains in a whole sentence', () => {
    expect(foundationalTitle(['d1'])).toBe(
      'Visibility and Tagging scored below the foundational threshold'
    );
    expect(foundationalTitle(['d1', 'd2'])).toBe(
      'Visibility and Tagging and Account Structure and Attribution scored below the foundational threshold'
    );
  });
});

describe('ICG logic — reads the island when there is one', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.lang = '';
    resetStringsForTest();
  });

  it('translates by id, falls back per key, and counts in the page language', () => {
    document.documentElement.lang = 'pt-BR';
    document.body.innerHTML =
      '<script type="application/json" data-icg-strings>' +
      '{"domain.d1.short":"Visibilidade","js.recCount.one":"{n} rec.","js.recCount.other":"{n} recs."}' +
      '</script>';
    resetStringsForTest();
    expect(radarLabel('d1')).toBe('Visibilidade');
    expect(radarLabel('d3')).toBe('Right-Sizing');
    expect(counted('js.recCount', 1)).toBe('1 rec.');
    expect(counted('js.recCount', 2)).toBe('2 recs.');
  });
});
