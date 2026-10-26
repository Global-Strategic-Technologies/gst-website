/**
 * Infrastructure Cost Governance — the page script's DOM-free logic (ADR-0042).
 *
 * Scoring lives in `src/utils/icg-engine.ts`; this file holds the page's
 * string builders: the maturity gauge and radar SVGs, the maturity blurb, the
 * share-by-email link, the copied summary and the stage-context sentence. The
 * last two are page-only copy (the MCP server emits neither), so they live here
 * rather than in the Worker-deployed engine (ADR-0042).
 *
 * Every word comes from the `infrastructure-cost-governance` catalog through
 * `s()` (BL-153 Tier B). Domain, question and recommendation text is the
 * engine's English for the MCP server and is translated here by id; the
 * English catalog is pinned to the data by `tests/unit/icg-logic.test.ts`.
 */
import { BENCHMARK_RANGES, buildRadarPoints, getMaturityLevel } from '../../utils/icg-engine';
import { escapeHtml } from '../../utils/escape-html';
import { formatList, pluralKey } from '../../i18n/formatters';
import { pageLang } from '../tool-strings';
import { s } from './strings';
import type { CompanyStage, ICGResult, ICGState } from '../../utils/icg-engine';
import type { Domain } from '../../data/infrastructure-cost-governance/domains';
import type { Recommendation } from '../../data/infrastructure-cost-governance/recommendations';

// ─── Lookups by id ──────────────────────────────────────────────────────────

export const domainName = (id: string): string => s(`domain.${id}.name`);
export const domainDescription = (id: string): string => s(`domain.${id}.description`);
/** Radar axis label: written per domain, never derived from the full name. */
export const radarLabel = (id: string): string => s(`domain.${id}.short`);
export const questionText = (id: string): string => s(`question.${id}.text`);
export const questionRationale = (id: string): string => s(`question.${id}.rationale`);
export const recTitle = (id: string): string => s(`rec.${id}.title`);
export const recDescription = (id: string): string => s(`rec.${id}.description`);
export const answerLabel = (score: number): string => s(`answer.${score}`);
export const maturityLabel = (level: ICGResult['maturityLevel']): string => s(`maturity.${level}`);
export const impactLabel = (impact: string): string => s(`impact.${impact}`);
export const effortLabel = (effort: string): string => s(`effort.${effort}`);

/** A count with its one/other wording, e.g. `3 recs`. */
export function counted(key: 'js.recCount' | 'js.skipped', n: number): string {
  return s(`${key}.${pluralKey(n, pageLang())}`, { n });
}

/** The foundational-gap title for one or two domains (at most two are foundational). */
export function foundationalTitle(domainIds: string[]): string {
  const [first, second] = domainIds.map(domainName);
  return second === undefined
    ? s('js.foundational.one', { name: first })
    : s('js.foundational.two', { first, second });
}

// ─── Gauge SVG ──────────────────────────────────────────────────────────────

/** `resolvedColor` is a concrete colour: SVG attributes can't take `var()` in every browser. */
export function gaugeArcSVG(score: number, resolvedColor: string): string {
  const cx = 110,
    cy = 92,
    r = 78;
  const a = Math.PI * (1 - score / 100);
  const ex = (cx + r * Math.cos(a)).toFixed(2);
  const ey = (cy - r * Math.sin(a)).toFixed(2);
  const track = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const fill = score > 0 ? `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${ex} ${ey}` : null;
  return `<svg viewBox="0 0 220 112" role="img" style="width:100%;max-width:220px;display:block;margin:0 auto" aria-label="${escapeHtml(s('js.gauge.aria', { score }))}">
  <path d="${track}" fill="none" stroke="currentColor" stroke-width="14" stroke-linecap="round" opacity="0.15"/>
  ${fill ? `<path d="${fill}" fill="none" stroke="${resolvedColor}" stroke-width="14" stroke-linecap="round"/>` : ''}
  <text x="${cx}" y="84" text-anchor="middle"
    style="font-size:54px;font-weight:500;font-family:var(--font-family);fill:${resolvedColor}">${score}</text>
  <text x="${cx}" y="109" text-anchor="middle"
    style="font-size:12px;font-family:var(--font-family);fill:currentColor;opacity:0.5">${escapeHtml(s('js.gauge.outOf'))}</text>
</svg>`;
}

// ─── Maturity description ───────────────────────────────────────────────────

export function maturityDescription(score: number): string {
  return s(`maturityDesc.${getMaturityLevel(score).level}`);
}

// ─── Radar chart SVG ────────────────────────────────────────────────────────

/** Longest radar label line, in characters, before it wraps (10px mono ≈ 6px each). */
const RADAR_LINE_CHARS = 14;

/**
 * Split an axis label into at most two lines at the space nearest its middle,
 * when it is longer than one line holds. Translated labels run longer than
 * English, and the side axes have about 100 units of room.
 */
export function wrapRadarLabel(label: string): string[] {
  if (label.length <= RADAR_LINE_CHARS) return [label];
  const spaces = [...label.matchAll(/ /g)].map((m) => m.index ?? 0);
  if (spaces.length === 0) return [label];
  const mid = label.length / 2;
  const cut = spaces.reduce((best, i) => (Math.abs(i - mid) < Math.abs(best - mid) ? i : best));
  return [label.slice(0, cut), label.slice(cut + 1)];
}

export function radarChartSVG(domainScores: Array<{ label: string; score: number }>): string {
  const cx = 150,
    cy = 150,
    r = 110;
  const n = domainScores.length;

  // Use explicit colors so the SVG is print-safe (currentColor fails
  // when dark-mode text color meets white print paper)
  const gridColor = 'var(--text-muted)';
  const labelColor = 'var(--text-muted)';
  const primaryColor = 'var(--color-primary)';

  // Grid rings at 25%, 50%, 75%, 100%
  const rings = [25, 50, 75, 100]
    .map((pct) => {
      const ringR = (pct / 100) * r;
      const pts = Array.from({ length: n }, (_, i) => {
        const a = (Math.PI * 2 * i) / n - Math.PI / 2;
        return `${(cx + ringR * Math.cos(a)).toFixed(1)},${(cy + ringR * Math.sin(a)).toFixed(1)}`;
      }).join(' ');
      return `<polygon points="${pts}" style="fill:none;stroke:${gridColor};opacity:${pct === 100 ? 0.4 : 0.2};stroke-width:1"/>`;
    })
    .join('');

  // Axis lines
  const axes = Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    const ex = (cx + r * Math.cos(a)).toFixed(1);
    const ey = (cy + r * Math.sin(a)).toFixed(1);
    return `<line x1="${cx}" y1="${cy}" x2="${ex}" y2="${ey}" style="stroke:${gridColor};opacity:0.2;stroke-width:1"/>`;
  }).join('');

  // Labels
  const labelOffset = 18;
  const labels = domainScores
    .map((ds, i) => {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      const lx = cx + (r + labelOffset) * Math.cos(a);
      const ly = cy + (r + labelOffset) * Math.sin(a);
      const anchor = Math.abs(lx - cx) < 5 ? 'middle' : lx > cx ? 'start' : 'end';
      const lines = wrapRadarLabel(ds.label);
      // A two-line label grows away from the chart: upward at the top axis,
      // downward at the bottom one, centred on its point at the sides.
      const firstDy =
        ly < cy - 5
          ? -(lines.length - 1) * 12
          : ly > cy + 5 && Math.abs(lx - cx) < 5
            ? 0
            : -(lines.length - 1) * 6;
      const tspans = lines
        .map(
          (line, li) =>
            `<tspan x="${lx.toFixed(1)}" dy="${li === 0 ? firstDy : 12}">${escapeHtml(line)}</tspan>`
        )
        .join('');
      return `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${anchor}" style="font-size:10px;font-family:var(--font-family);fill:${labelColor}">${tspans}</text>`;
    })
    .join('');

  // Data polygon
  const dataPoints = buildRadarPoints(domainScores, cx, cy, r);

  // The viewBox runs 80 units past the chart on each side so the side labels,
  // which start 128 units from the centre, are not clipped by the SVG edge.
  return `<svg viewBox="-80 0 460 300" role="img" aria-label="${escapeHtml(s('js.radar.aria'))}" style="width:100%;max-width:460px;display:block;margin:0 auto">
  ${rings}${axes}${labels}
  <polygon points="${dataPoints}" style="fill:${primaryColor};fill-opacity:0.15;stroke:${primaryColor};stroke-width:2"/>
  ${domainScores
    .map((ds, i) => {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      const dr = (ds.score / 100) * r;
      const dx = cx + dr * Math.cos(a);
      const dy = cy + dr * Math.sin(a);
      return `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="4" style="fill:${primaryColor}"/>`;
    })
    .join('')}
</svg>`;
}

// ─── Email helper ────────────────────────────────────────────────────────────

/** `pageUrl` is the current location; the landing mail drops its query string. */
export function emailHref(context: 'landing' | 'results', pageUrl: string, score?: number): string {
  const baseUrl = pageUrl.split('?')[0];
  if (context === 'landing') {
    return `mailto:?subject=${encodeURIComponent(s('js.email.landingSubject'))}&body=${encodeURIComponent(s('js.email.landingBody') + '\n\n' + baseUrl)}`;
  }
  return `mailto:?subject=${encodeURIComponent(s('js.email.resultsSubject', { score: score ?? '' }))}&body=${encodeURIComponent(s('js.email.resultsBody') + '\n\n' + pageUrl)}`;
}

// ─── Summary text ───────────────────────────────────────────────────────────

/**
 * The copied plain-text summary, in the page language. Plain text for the
 * clipboard: catalog text through `s()`, never escaped. The English output is
 * pinned in full by `tests/unit/icg-summary-golden.test.ts`.
 */
export function buildSummaryText(
  _state: ICGState,
  result: ICGResult,
  _domains: readonly Domain[],
  recs: readonly Recommendation[],
  url?: string
): string {
  const date = new Date().toISOString().slice(0, 10);
  const lang = pageLang();
  const level = (score: number) => maturityLabel(getMaturityLevel(score).level);

  const lines: string[] = [
    s('summary.title'),
    s('summary.generated', { date }),
    '────────────────────────────────────────',
    s('summary.overall', { score: result.overallScore, level: level(result.overallScore) }),
    // "Responses recorded" intentionally over "Questions answered" — the
    // counter is `answeredCount`, defined as "distinct keys in answers"
    // (see CONTRACT.md). That count INCLUDES `-1` ("Not sure") responses,
    // which colloquially aren't what a reader means by "answered." The
    // disclosure on the next line ("Not sure" responses: N) honestly carves
    // out the subset — surfaced 2026-05-26 during the BL-034 sweep.
    s('summary.responses', { answered: result.answeredCount, total: result.totalQuestions }),
  ];

  if (result.skippedCount > 0) {
    // "Not sure" answers are stored as -1 and contribute -1 to rawScore, but
    // the domain score floors at 0, so they cost more than "Not in place" (0)
    // only in a domain with positive answers (BL-129). Earlier copy here
    // ("scored as zero") was misleading — surfaced during BL-032 soak T.B.4.c.
    lines.push(s('summary.notSure', { count: result.skippedCount }));
  }

  if (result.showFoundationalFlag) {
    const belowNames = result.domainScores
      .filter((ds) => ds.isFoundational && ds.belowFoundationalThreshold)
      .map((ds) => domainName(ds.domainId));
    lines.push(s('summary.foundational', { names: formatList(belowNames, lang, ' and ') }));
  }

  lines.push('', s('summary.breakdown'));
  for (const ds of result.domainScores) {
    lines.push(
      '  ' +
        s('summary.domainLine', {
          name: domainName(ds.domainId),
          score: ds.score,
          level: level(ds.score),
        })
    );
  }

  if (recs.length > 0) {
    lines.push('', s('summary.recs', { count: recs.length }));
    for (const r of recs) {
      lines.push(
        '  ' +
          s('summary.recLine', {
            impact: impactLabel(r.impact).toLocaleUpperCase(lang),
            title: recTitle(r.id),
          })
      );
    }
  }

  if (url) {
    lines.push('', s('summary.footer', { url }));
  }

  return lines.join('\n');
}

// ─── Stage context ─────────────────────────────────────────────────────────

export function contextualizeScore(score: number, stage?: CompanyStage): string | null {
  if (!stage) return null;
  const range = BENCHMARK_RANGES.find((r) => r.stageKey === stage);
  if (!range) return null;
  const position = score < range.low ? 'below' : score > range.high ? 'above' : 'within';
  return s(`context.${position}`, {
    score,
    stage: s(`stage.${stage}`),
    low: range.low,
    high: range.high,
  });
}
