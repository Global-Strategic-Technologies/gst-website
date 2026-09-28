/**
 * Infrastructure Cost Governance — the page script's DOM-free logic (ADR-0042).
 *
 * Scoring lives in `src/utils/icg-engine.ts`; this file holds the page's
 * string builders: the maturity gauge and radar SVGs, the maturity blurb, and
 * the share-by-email link. Unit-tested by `tests/unit/icg-logic.test.ts`.
 */
import { buildRadarPoints } from '../../utils/icg-engine';

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
  return `<svg viewBox="0 0 220 112" role="img" style="width:100%;max-width:220px;display:block;margin:0 auto" aria-label="Maturity score: ${score} out of 100">
  <path d="${track}" fill="none" stroke="currentColor" stroke-width="14" stroke-linecap="round" opacity="0.15"/>
  ${fill ? `<path d="${fill}" fill="none" stroke="${resolvedColor}" stroke-width="14" stroke-linecap="round"/>` : ''}
  <text x="${cx}" y="84" text-anchor="middle"
    style="font-size:54px;font-weight:500;font-family:var(--font-family);fill:${resolvedColor}">${score}</text>
  <text x="${cx}" y="109" text-anchor="middle"
    style="font-size:12px;font-family:var(--font-family);fill:currentColor;opacity:0.5">out of 100</text>
</svg>`;
}

// ─── Maturity description ───────────────────────────────────────────────────

export function maturityDescription(score: number): string {
  if (score <= 25) return 'Cloud spend is a black box with no visibility or controls.';
  if (score <= 50) return 'Some monitoring exists but systematic optimization is absent.';
  if (score <= 75) return 'Active cost management in place with meaningful room to improve.';
  return 'Cloud spend is a managed, optimized discipline.';
}

// ─── Radar chart SVG ────────────────────────────────────────────────────────

export function radarChartSVG(domainScores: Array<{ name: string; score: number }>): string {
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
      // Abbreviate long names
      const short = ds.name.replace('and ', '& ').split(' ').slice(0, 2).join(' ');
      return `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${anchor}" style="font-size:10px;font-family:var(--font-family);fill:${labelColor}">${short}</text>`;
    })
    .join('');

  // Data polygon
  const dataPoints = buildRadarPoints(domainScores, cx, cy, r);

  return `<svg viewBox="0 0 300 300" role="img" aria-label="Radar chart showing domain scores" style="width:100%;max-width:300px;display:block;margin:0 auto">
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
    return `mailto:?subject=${encodeURIComponent('Infrastructure Cost Governance Assessment')}&body=${encodeURIComponent('Use this tool to identify useful opportunities for cloud cost optimization:\n\n' + baseUrl)}`;
  }
  return `mailto:?subject=${encodeURIComponent('Infrastructure Cost Governance - ' + score + '/100')}&body=${encodeURIComponent('Here are potential opportunities for improvement that were identified for your consideration:\n\n' + pageUrl)}`;
}
