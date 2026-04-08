/**
 * Shared palette metadata — imported by BaseLayout and brand page.
 */

export interface Palette {
  id: number;
  name: string;
  concept: string;
}

export const palettes: Palette[] = [
  { id: 0, name: 'Current', concept: 'The production palette \u2014 teal primary with amber secondary. This is the baseline for comparison.' },
  { id: 1, name: 'Steel Authority', concept: 'Deep cobalt blue anchored by hot magenta secondary. PE gravitas with an unexpected edge.' },
  { id: 2, name: 'Indigo Signal', concept: 'Vivid violet primary paired with electric lime. Breaks every finance-blue convention.' },
  { id: 3, name: 'Copper Forge', concept: 'Dark rust and electric cyan \u2014 industrial heat meets cold precision.' },
  { id: 4, name: 'Jade Edge', concept: 'Vivid emerald with hot rose contrast. The current teal pushed to its boldest form.' },
  { id: 5, name: 'Shadow Garden', concept: 'Deep forest green rooted in near-black, lit by electric violet. Terminal in an old-growth forest.' },
];

export const PALETTE_NAMES: Record<number, string> = {
  0: '0. Current',
  1: '1. Steel Authority',
  2: '2. Indigo Signal',
  3: '3. Copper Forge',
  4: '4. Jade Edge',
  5: '5. Shadow Garden',
};

export const PALETTE_CONCEPTS: Record<number, string> = Object.fromEntries(
  palettes.map(p => [p.id, p.concept])
);

export const TOKEN_TIPS: Record<string, string> = {
  '--color-primary': 'Brand accent \u2014 links, buttons, active states, hub cards',
  '--color-primary-dark': 'Hover/pressed variant of primary',
  '--color-secondary': 'Secondary emphasis \u2014 alternative CTAs, TechPar R&D CapEx',
  '--color-success': 'Positive outcomes \u2014 DM positive, ICG optimizing, TechPar ahead',
  '--color-warning': 'Caution \u2014 DM warning, ICG aware, TechPar underinvest/above',
  '--color-error': 'Errors/critical \u2014 DM negative, ICG reactive, TechPar elevated, RegMap cyber',
  '--color-authority': 'Institutional credibility \u2014 hub authority line, DM results, TechPar personnel',
  '--color-distinguish': 'Differentiation accent \u2014 RegMap industry, TechPar R&D OpEx',
  '--color-subdued': 'Muted neutral \u2014 DM methodology, process/background contexts',
  '--techpar-zone-healthy': 'TechPar: within benchmark range. Derives from --color-primary',
  '--techpar-zone-ahead': 'TechPar: spending below benchmark. Derives from --color-success',
  '--techpar-zone-underinvest': 'TechPar: potential underinvestment. Derives from --color-warning',
  '--techpar-zone-elevated': 'TechPar: elevated overspend. Derives from --color-error',
  '--techpar-category-personnel': 'TechPar: personnel spend category. Derives from --color-authority',
  '--techpar-category-rd-opex': 'TechPar: R&D OpEx spend category. Derives from --color-distinguish',
  '--dm-methodology-brown': 'Diligence Machine: methodology section accent. Derives from --color-subdued',
  '--dm-results-blue': 'Diligence Machine: results/output accent. Derives from --color-authority',
  '--dm-positive': 'Diligence Machine: positive findings. Derives from --color-success',
  '--dm-negative': 'Diligence Machine: negative/risk findings. Derives from --color-error',
  '--dm-warning': 'Diligence Machine: caution-level findings. Derives from --color-warning',
  '--icg-maturity-reactive': 'ICG: lowest maturity level (0\u201325). Derives from --color-error',
  '--icg-maturity-aware': 'ICG: early-stage maturity (26\u201350). Derives from --color-warning',
  '--icg-maturity-optimizing': 'ICG: active optimization (51\u201375). Derives from --color-success',
  '--icg-maturity-strategic': 'ICG: highest maturity (76\u2013100). Derives from --color-primary',
  '--regmap-category-industry': 'Regulatory Map: industry compliance category. Derives from --color-distinguish',
  '--regmap-category-cyber': 'Regulatory Map: cybersecurity category. Derives from --color-error',
};
