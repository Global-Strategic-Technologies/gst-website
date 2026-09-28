import {
  emailHref,
  gaugeArcSVG,
  maturityDescription,
  radarChartSVG,
} from '../../src/scripts/infrastructure-cost-governance/logic';
import { DOMAINS } from '../../src/data/infrastructure-cost-governance/domains';

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
  const scores = DOMAINS.map((d, i) => ({ name: d.name, score: (i * 17) % 101 }));
  const svg = radarChartSVG(scores);

  it('draws four grid rings plus the data polygon, and one axis, label and point per domain', () => {
    expect(count(svg, '<polygon')).toBe(5);
    expect(count(svg, '<line')).toBe(scores.length);
    expect(count(svg, '<text')).toBe(scores.length);
    expect(count(svg, '<circle')).toBe(scores.length);
  });

  it('abbreviates labels to two words, with "and" as "&"', () => {
    const one = radarChartSVG([
      { name: 'Tagging and Allocation Policy', score: 50 },
      { name: 'Forecasting', score: 50 },
      { name: 'Unit Economics', score: 50 },
    ]);
    expect(one).toContain('>Tagging &</text>');
    expect(one).toContain('>Forecasting</text>');
    expect(one).toContain('>Unit Economics</text>');
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
