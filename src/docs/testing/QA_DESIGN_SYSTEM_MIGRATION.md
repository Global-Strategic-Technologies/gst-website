# QA Verification: Design System Token Migration

**Date**: April 4, 2026
**Commits**: `cfde25f`, `2fa4b17`
**Scope**: Tool-specific CSS variables migrated from hardcoded hex values to shared semantic token derivations in `variables.css`. Visual output should be identical to production.

---

## What Changed

All tool-specific color variables (TechPar, ICG, Diligence Machine, Regulatory Map) now derive from 9 shared brand tokens instead of independent hardcoded hex values. The **expected visual result is no change** — colors should look the same as production. This QA pass confirms nothing regressed.

Additionally, the Regulatory Map FAQ was updated to match the site-wide accordion pattern (frosted glass, delta chevron).

---

## How to Test

1. Run `npm run dev` and open `http://localhost:4321`
2. For each page below, verify in **both light and dark mode** (use the header theme toggle)
3. Compare against production at `https://globalstrategic.tech` for any visual differences
4. Mark each checkpoint as PASS or FAIL

---

## Page 1: TechPar (`/hub/tools/techpar`)

Requires completing the TechPar wizard to generate results.

### Zone Colors (in signal cards and deepdive panels)

| Checkpoint | What to Look For | Expected |
|---|---|---|
| TP-1 | "Healthy" zone indicators | Teal (#05cd99) |
| TP-2 | "Ahead" zone indicators | Green — should differ from teal |
| TP-3 | "Underinvest" zone indicators | Amber/orange |
| TP-4 | "Above" zone indicators | Amber/orange (same as underinvest) |
| TP-5 | "Elevated" zone indicators | Red |
| TP-6 | "Critical" zone indicators | Red (same as elevated) |
| TP-7 | Signal card left borders change color based on zone | Colors match zone |

### Category Dots (colored squares next to section headers)

| Checkpoint | What to Look For | Expected |
|---|---|---|
| TP-8 | "Infrastructure and Hosting" section dot | Teal |
| TP-9 | "Infrastructure Personnel" section dot | Muted blue (not teal, not bright blue) |
| TP-10 | "R&D OpEx" section dot | Purple |
| TP-11 | "R&D CapEx" section dot | Amber/orange |
| TP-12 | All 4 category dots are visually distinct | 4 different colors |

### KPI Values (numeric values in KPI grid)

| Checkpoint | What to Look For | Expected |
|---|---|---|
| TP-13 | Positive KPI values | Teal text |
| TP-14 | Warning KPI values | Amber/orange text |
| TP-15 | Negative KPI values | Red text |

---

## Page 2: Diligence Machine (`/hub/tools/diligence-machine`)

Requires completing the diligence wizard to generate a report.

### Attention Area Cards

| Checkpoint | What to Look For | Expected |
|---|---|---|
| DM-1 | High-relevance attention cards | Left border in muted blue |
| DM-2 | Medium-relevance attention cards | Left border in warm brown/tan |
| DM-3 | Card divider line matches border color | Same color as left border |
| DM-4 | "LOOKOUT" red flag badges | Red background tint, red text |

### Question Priority Indicators

| Checkpoint | What to Look For | Expected |
|---|---|---|
| DM-5 | High priority questions | Left border in muted blue |
| DM-6 | Medium priority questions | Left border in warm brown/tan |
| DM-7 | Standard priority questions | Left border in teal |

### Exit Impact Tags

| Checkpoint | What to Look For | Expected |
|---|---|---|
| DM-8 | "Multiple Expander" tags | Green text |
| DM-9 | "Valuation Drag" tags | Amber/orange text |
| DM-10 | "Operational Risk" tags | Red text |
| DM-11 | Success checkmarks | Green |

---

## Page 3: ICG (`/hub/tools/infrastructure-cost-governance`)

Requires completing the ICG assessment to generate results.

### Maturity Score Display

| Checkpoint | What to Look For | Expected |
|---|---|---|
| ICG-1 | Score 0–25: "Reactive" label and gauge | Red |
| ICG-2 | Score 26–50: "Aware" label and gauge | Amber/orange |
| ICG-3 | Score 51–75: "Optimizing" label and gauge | Green |
| ICG-4 | Score 76–100: "Strategic" label and gauge | Teal |

### Domain Bars

| Checkpoint | What to Look For | Expected |
|---|---|---|
| ICG-5 | Domain bar fill colors match score maturity level | Red/orange/green/teal based on score |
| ICG-6 | Domain score text color matches bar | Same color as fill |

### Radar Chart (CRITICAL — uses inline SVG styles)

| Checkpoint | What to Look For | Expected |
|---|---|---|
| ICG-7 | Radar grid rings visible (25%, 50%, 75%, 100%) | Subtle gray lines, NOT invisible |
| ICG-8 | Domain labels visible around radar perimeter | Gray text, readable |
| ICG-9 | Data polygon renders with teal fill | Semi-transparent teal shape |
| ICG-10 | Score dots visible at each axis | Teal dots |

> **Risk note**: The radar chart builds SVG with inline styles that reference CSS variables. If grid lines or labels are invisible, this indicates a CSS variable resolution failure in SVG context. Flag as HIGH priority.

---

## Page 4: Regulatory Map (`/hub/tools/regulatory-map`)

### Map and Data Loading

| Checkpoint | What to Look For | Expected |
|---|---|---|
| RM-1 | World map renders with country boundaries | Countries visible, highlighted regions in teal |
| RM-2 | Clicking a highlighted country shows regulation details | Side panel or bottom sheet opens |

### Filter Chips

| Checkpoint | What to Look For | Expected |
|---|---|---|
| RM-3 | "All" chip active state | Teal text and border |
| RM-4 | "Data Privacy" chip active state | Teal text and border |
| RM-5 | "AI Governance" chip active state | Amber/orange text and border |
| RM-6 | "Industry Compliance" chip active state | Purple text and border |
| RM-7 | "Cybersecurity" chip active state | Red text and border |
| RM-8 | All 5 filter chips have distinct active colors | 4 unique colors (All = same as Privacy) |

### Timeline

| Checkpoint | What to Look For | Expected |
|---|---|---|
| RM-9 | Timeline dots colored by category | Privacy=teal, AI=amber, Industry=purple, Cyber=red |
| RM-10 | Timeline entry left border on hover matches category | Same color as dot |

### FAQ Accordion (NEW — markup updated)

| Checkpoint | What to Look For | Expected |
|---|---|---|
| RM-11 | FAQ items have frosted glass background | Slight blur/transparency effect |
| RM-12 | Delta chevron icon visible on each FAQ item | Small triangle, rotates on expand |
| RM-13 | FAQ expand/collapse works | Click opens answer, chevron rotates |
| RM-14 | FAQ styling matches Services page (`/services`) FAQ | Same visual pattern |

---

## Page 5: Hub Home (`/hub`)

| Checkpoint | What to Look For | Expected |
|---|---|---|
| HUB-1 | Hub cards have teal top border | 3px teal stripe at top |
| HUB-2 | Card icons and labels in teal | Consistent primary color |
| HUB-3 | "Explore →" links in teal | Primary color |
| HUB-4 | FAQ accordion matches Services page pattern | Frosted glass, delta chevron |

---

## Page 6: Homepage (`/`)

| Checkpoint | What to Look For | Expected |
|---|---|---|
| HOME-1 | CTA buttons render in teal | Primary color fill |
| HOME-2 | Stats bar background is teal | Solid primary color |
| HOME-3 | Trust card borders turn teal on hover | Primary color border |
| HOME-4 | No visual regressions in any section | Compare to production |

---

## Cross-Cutting: Dark Mode

For each page above, toggle dark mode and verify:

| Checkpoint | What to Look For | Expected |
|---|---|---|
| DARK-1 | All teal elements remain teal | #05cd99 unchanged |
| DARK-2 | Success colors brighten slightly | Lighter green |
| DARK-3 | Warning colors brighten | Lighter amber/gold |
| DARK-4 | Error colors brighten | Lighter red |
| DARK-5 | Authority color brightens | Lighter muted blue |
| DARK-6 | Subdued color brightens | Lighter warm tan |
| DARK-7 | Distinguish color brightens | Lighter purple |
| DARK-8 | No elements appear black/invisible | All colored elements visible |

---

## Severity Guide

| Severity | Criteria | Example |
|---|---|---|
| **P0 — Blocker** | Element invisible, data not loading, page broken | Radar chart grid lines invisible |
| **P1 — High** | Wrong color that changes meaning (e.g., error shown as success) | Red flag badge renders green |
| **P2 — Medium** | Color slightly different from production but same meaning | Authority blue shifted slightly |
| **P3 — Low** | Cosmetic — spacing, opacity, minor shade difference | Dark theme 5% opacity difference |

---

## Total Checkpoints: 47

- TechPar: 15
- Diligence Machine: 11
- ICG: 10
- Regulatory Map: 14
- Hub Home: 4
- Homepage: 4
- Dark Mode: 8 (cross-cutting, applied to all pages)

**Expected result**: All checkpoints PASS with no visual difference from production.
