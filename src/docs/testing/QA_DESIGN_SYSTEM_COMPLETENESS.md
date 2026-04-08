# QA Verification: Design System Completeness Initiative

**Date**: April 5, 2026
**Commits**: `3bae9cb`, `8581dbe`, `c5f6b7c`, `09eb0e9`, `15f1662`, `3baa7e6`, `2a2f787`
**Scope**: Two workstreams — (A) ~108 hardcoded font-sizes replaced with `var(--text-*)` design tokens across 11 files, (B) 11 missing component specimens added to the brand page. The **expected visual result is no change** to rendered pages — font sizes should look the same as production. Brand page gains new component entries.

---

## How to Test

1. Run `npm run dev` and open `http://localhost:4321`
2. For each page, verify in **both light and dark mode** (use the header theme toggle)
3. Compare against production at `https://globalstrategic.tech` for any visual differences
4. Check each viewport: **desktop (1440px)**, **tablet (768px)**, **mobile (480px)**
5. Mark each checkpoint as PASS or FAIL

---

## Workstream A: Font-Size Token Replacements

All changes are CSS-only — no content, layout, or behavior changes. Expected result: **pixel-identical rendering** at all viewports and themes.

### Page 1: M&A Portfolio (`/ma-portfolio`)

Affected files: PortfolioGrid, ProjectModal, PortfolioHeader, StickyControls, PortfolioSummary

| ID | Checkpoint | What to Verify | Viewport |
|----|-----------|----------------|----------|
| MA-1 | Portfolio page title | Large heading, correct size hierarchy | All |
| MA-2 | Summary stats section | Metric values and labels properly sized | All |
| MA-3 | Project card titles | Consistent size, readable at all widths | All |
| MA-4 | Project card industry labels | Small uppercase text, legible | All |
| MA-5 | Project card year badges | Extra-small monospace text | All |
| MA-6 | Project card metric values (ARR) | Slightly larger than other metrics | All |
| MA-7 | Project card summary text | Body-small size, doesn't overflow | All |
| MA-8 | Project card technology tags | Extra-small pill text | All |
| MA-9 | Project card CTA button text | Consistent with other buttons | All |
| MA-10 | Click a project → modal title | Large heading, scales down on mobile | Desktop + 480px |
| MA-11 | Modal industry label | Small text below title | All |
| MA-12 | Modal metric labels and values | Consistent small/medium sizing | All |
| MA-13 | Modal section titles | Small uppercase headings | All |
| MA-14 | Modal body text | Readable body size | All |
| MA-15 | Modal technology tags | Extra-small, same as card tags | All |
| MA-16 | Filter drawer title | Medium heading when drawer opens | 768px + 480px |
| MA-17 | Filter labels and badges | Extra-small label text, badges legible | All |
| MA-18 | Search input text | Consistent with other inputs | All |
| MA-19 | Filter chip text | Small readable text | All |
| MA-20 | Responsive: cards reflow correctly | No text overflow or truncation at 480px | 480px |

### Page 2: About (`/about`)

| ID | Checkpoint | What to Verify | Viewport |
|----|-----------|----------------|----------|
| AB-1 | Section h2 headings ("What We Do", etc.) | Large heading, scales down progressively | All |
| AB-2 | Section body paragraphs | Body text legible at all widths | All |
| AB-3 | Experience card h3 headings | Medium heading size | All |
| AB-4 | Experience card description text | Small body text | All |
| AB-5 | Founder bio heading | Large heading, scales appropriately | All |
| AB-6 | Founder bio paragraph text | Body text | All |
| AB-7 | Responsive: headings scale smoothly | No jumps or disproportionate sizes at breakpoints | 1024px → 768px → 480px |

### Page 3: Services (`/services`)

| ID | Checkpoint | What to Verify | Viewport |
|----|-----------|----------------|----------|
| SV-1 | Service card h2 headings | Medium-large heading size | All |
| SV-2 | Service subtitle text | Extra-small uppercase | Desktop |
| SV-3 | Service list items | Base body text size | All |
| SV-4 | Audience card h3 headings | Slightly larger than body | All |
| SV-5 | Audience card descriptions | Small body text | All |
| SV-6 | Responsive: service cards stack cleanly | Text sizes reduce proportionally | 768px + 480px |

### Page 4: Hub Gateway (`/hub`)

| ID | Checkpoint | What to Verify | Viewport |
|----|-----------|----------------|----------|
| HB-1 | Hub intro paragraph | Large text below hero | All |
| HB-2 | Hub card headings | Medium-large heading | All |
| HB-3 | Hub card descriptions | Base body text | All |
| HB-4 | Hub card CTA links | Body/small text size | All |
| HB-5 | Hub card category labels | Extra-small uppercase | Desktop |
| HB-6 | Responsive: cards scale text down | No overflow at 480px | 480px |

### Page 5: Homepage (`/`)

| ID | Checkpoint | What to Verify | Viewport |
|----|-----------|----------------|----------|
| EF-1 | Engagement flow step numbers | Medium-large, scales down at breakpoints | All |
| EF-2 | Engagement flow step labels | Small text below numbers | All |
| EF-3 | Footer link text | Small text, readable | All |

### Cross-Page Checks

| ID | Checkpoint | What to Verify |
|----|-----------|----------------|
| XP-1 | Dark theme: all pages above | No text becomes invisible, unreadable, or wrong-colored |
| XP-2 | Font consistency | No mixed sizing within same component type across pages |
| XP-3 | Print preview (any page) | Print styles unaffected (these changes don't touch print) |

---

## Workstream B: Brand Page Component Specimens

### Page 6: Brand Page (`/brand`)

Navigate to the UI Component Library section (scroll down or use `#ui-library` anchor).

#### New Components (at end of UI Library section)

| ID | Checkpoint | What to Verify |
|----|-----------|----------------|
| BP-1 | Choice Button specimen | Three buttons visible: Default, Selected (primary accent), Unsure (dashed border). Monospace uppercase text. |
| BP-2 | Content Label specimen | Primary-colored uppercase monospace label text |
| BP-3 | Text Input specimen | Dashed-border input field. Focus → border becomes solid primary. |
| BP-4 | Bottom Sheet specimen | Contained demo showing a sheet with handle bar rising from bottom. Primary border-top accent. |
| BP-5 | Map Hint specimen | Bordered hint box with muted monospace text |
| BP-6 | Map Tap Bar specimen | Horizontal bar: bold name on left, primary-bordered action button on right |
| BP-7 | Quick Zoom specimen | Stacked +/- buttons with light borders |

#### New Variants (near parent components)

| ID | Checkpoint | What to Verify | Location |
|----|-----------|----------------|----------|
| BP-8 | Option Card — Compact | Reduced-padding text-only card | After existing Option Card section |
| BP-9 | Option Card — Selected Outline | Primary border, no fill, primary text | After existing Option Card section |
| BP-10 | FAQ Large | Larger FAQ item with increased spacing and font | After existing FAQ section |
| BP-11 | Frosted Heavy | Strong white frosted glass effect (visible blur) | After Hub Header section |
| BP-12 | Frosted Blur-Only | Blur without tint | Same row as BP-11 |
| BP-13 | Frosted Overlay | Nearly opaque frost | Same row as BP-11 |
| BP-14 | Segmented Wide | Full-width segmented control with 3 options | After existing Segmented Control section |

#### Existing Functionality (regression checks)

| ID | Checkpoint | What to Verify |
|----|-----------|----------------|
| BP-15 | Palette panel toggle | Click delta icon on right edge → panel opens/closes |
| BP-16 | Palette tab switching | Click tabs 0–5 → all swatches and specimens update colors |
| BP-17 | Color picker | Edit any swatch via picker/hex/sliders → color changes live |
| BP-18 | Reset button | Click "Reset" → all overrides cleared |
| BP-19 | Theme toggle | Switch dark/light → all swatches show correct theme values, overrides reset |
| BP-20 | Panel resize | Drag resize bar on left edge of panel → panel width changes |
| BP-21 | Existing UI library components | All pre-existing specimens render correctly (buttons, cards, tabs, forms, etc.) |
| BP-22 | Interactive demos | Option card toggle, filter chip toggle, slider sync, rec card collapse, modal open/close all still work |

#### Dark Theme Checks

| ID | Checkpoint | What to Verify |
|----|-----------|----------------|
| BP-23 | New specimens in dark mode | All 14 new specimens (BP-1 through BP-14) render correctly in dark theme |
| BP-24 | Choice Button dark | Borders visible, selected state has primary accent |
| BP-25 | Input dark | Dashed border visible, focus ring works |
| BP-26 | Frosted variants dark | Heavy/blur/overlay effects visible against dark background |

---

## Workstream C: Typography Documentation (non-visual)

| ID | Checkpoint | What to Verify |
|----|-----------|----------------|
| DOC-1 | Open `src/docs/styles/TYPOGRAPHY_REFERENCE.md` | All class names use `.brutal-*` prefix (no legacy `.heading-*`, `.text-*`, `.label-*`) |
| DOC-2 | Text size token scale | Includes `--text-2xs` (0.65rem) and `--text-3xl` (2rem) |
| DOC-3 | Button text section | Documents `.button-text` and `.button-text-lg` |
| DOC-4 | Data display section | Documents `.brutal-data` and `.brutal-data-sm` |

---

## Automated Test Results

These should already pass (verified during implementation):

| Check | Command | Expected |
|-------|---------|----------|
| Build | `npm run build` | Clean, no errors |
| Unit/Integration tests | `npm run test:run` | 857 tests pass |

---

## Sign-Off

| Role | Name | Date | Result |
|------|------|------|--------|
| QA Tester | | | |
| Developer | | | |

**Notes / Issues Found:**

_(Record any deviations, visual differences, or issues here)_

---

**Created**: April 5, 2026
**Initiative**: [DESIGN_SYSTEM_COMPLETENESS.md](../development/DESIGN_SYSTEM_COMPLETENESS.md)
