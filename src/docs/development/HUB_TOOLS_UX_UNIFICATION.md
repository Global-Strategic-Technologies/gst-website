# Hub Tools — UX Unification Initiative

Migrate the five hub tools from independent, tool-prefixed CSS patterns to a shared UX/design system rooted in the tokens and components documented on the [/brand](https://globalstrategic.tech/brand) reference page. The goal is brand cohesion, reduced maintenance surface, and faster tool development.

**Status**: Defined, not started
**Priority**: High — brand cohesion and developer velocity
**Last Updated**: March 27, 2026

---

## Current State

Each hub tool was built independently. Shared patterns exist (`HubHeader`, `.tool-shell`, `.tool-methodology`, `.hub-btn`, `.tool-action-bar`) but adoption is uneven, and many controls are duplicated under tool-specific prefixes.

| Metric                           | TechPar | TDC     | DM    | ICG     | RegMap |
| -------------------------------- | ------- | ------- | ----- | ------- | ------ |
| Scoped CSS lines                 | 1,688   | 627     | 1,870 | 1,243   | 825    |
| Tool-prefixed selectors          | 236     | 62      | 148   | 72      | 80     |
| Dark theme `:global()` overrides | 0       | 1       | 27    | 31      | 24     |
| Uses `.tool-shell`               | No      | Yes     | No    | Yes     | No     |
| Uses `.hub-btn`                  | No      | Yes     | Yes   | Partial | No     |
| Uses `.tool-action-bar`          | No      | Partial | Yes   | Yes     | No     |
| Print styles                     | Yes     | Yes     | Yes   | Yes     | No     |

**Total**: ~6,250 lines of scoped CSS, ~598 tool-prefixed selectors, 83 hardcoded dark theme overrides.

---

## Divergence Map

### 1. Option / Stage Card — 3 independent implementations

The same UX pattern (clickable card with label, optional description, selected state) exists under three different class names:

| Tool    | Class                                         | Usage                                     |
| ------- | --------------------------------------------- | ----------------------------------------- |
| TechPar | `.tp-stage-card` + `.tp-stage-card--active`   | Company stage selection (5 options)       |
| DM      | `.option-card` + `.option-card.selected`      | Wizard multi-choice (5+ options per step) |
| ICG     | `.icg-stage-card` + `.icg-stage-card--active` | Pre-assessment stage (4 options)          |
| ICG     | `.icg-opt-btn` + `.icg-opt-btn.selected`      | Assessment questions (2-4 options)        |

**Target**: Unify on DM's `.option-card` pattern (already the most complete — icon, label, description, selected state, dark theme, focus-visible). Add modifiers: `.option-card--compact` for ICG's button-style questions.

### 2. Button System — 3 different approaches

| Tool    | Primary                                  | Secondary               | Navigation          |
| ------- | ---------------------------------------- | ----------------------- | ------------------- |
| TechPar | `.tp-btn-share`, `.tp-btn-next` (custom) | `.tp-btn-back` (custom) | Tab bar (`.tp-tab`) |
| TDC     | `.cta-button.primary`                    | `.cta-button.secondary` | None                |
| DM      | `.cta-button.primary`                    | `.cta-button.secondary` | `.wizard-nav`       |
| ICG     | `.icg-btn-primary` (wraps `.hub-btn`)    | `.icg-btn-secondary`    | `.icg-wizard-nav`   |
| RegMap  | None                                     | None                    | None                |

**Target**: All tools use `.hub-btn--primary` / `.hub-btn--secondary` for tool actions, `.cta-button` for page-level CTAs. Remove `.tp-btn-*` and `.icg-btn-*` wrappers.

### 3. Dark Theme — variable-based vs. selector-based

TechPar uses **zero** `:global(html.dark-theme)` selectors — it relies entirely on CSS variables that auto-switch. This is the correct approach per `STYLES_GUIDE.md`. The other tools use 27-31 explicit dark overrides each.

| Tool    | Explicit dark overrides | Approach                       |
| ------- | ----------------------- | ------------------------------ |
| TechPar | 0                       | CSS variables only             |
| TDC     | 1                       | CSS variables (near-complete)  |
| DM      | 27                      | Explicit `:global()` selectors |
| ICG     | 31                      | Explicit `:global()` selectors |
| RegMap  | 24                      | Explicit `:global()` selectors |

**Target**: Migrate DM, ICG, RegMap to variable-based dark theme. Define new variables in `variables.css` where needed. Eliminate all tool-scoped `:global(html.dark-theme)` overrides.

### 4. Tool Shell — inconsistent container usage

| Tool    | Container                    | Max-width                              |
| ------- | ---------------------------- | -------------------------------------- |
| TechPar | `.techpar-shell` (custom)    | Fluid                                  |
| TDC     | `.tool-shell--wide`          | 760px                                  |
| DM      | `.wizard-container` (custom) | None (full-width wizard, 800px output) |
| ICG     | `.tool-shell--narrow`        | 660px                                  |
| RegMap  | `.map-layout` (custom)       | Full-width (map requires it)           |

TechPar, DM, and RegMap skip `.tool-shell` for valid reasons (fluid layout, wizard pattern, map visualization). These should keep custom containers but **adopt `.tool-shell` naming conventions** where possible (e.g., `.tool-shell--fluid` already exists).

### 5. Form Controls — no shared patterns

| Pattern             | TechPar                        | TDC                            | DM             | ICG            |
| ------------------- | ------------------------------ | ------------------------------ | -------------- | -------------- |
| Text/number input   | `.tp-field` + `.tp-input-wrap` | None                           | None           | None           |
| Range slider        | None                           | `.calc-slider` + `.slider-row` | None           | None           |
| Direct number entry | None                           | `.hint-input`                  | None           | None           |
| Option cards        | `.tp-stage-card`               | None                           | `.option-card` | `.icg-opt-btn` |

Only TDC has sliders and only TechPar has text inputs. These patterns should be documented in the design system but not forcibly consolidated until a second tool needs them.

### 6. Progress / Navigation — 3 paradigms

| Tool    | Pattern             | Implementation                                    |
| ------- | ------------------- | ------------------------------------------------- |
| TechPar | Horizontal tabs     | `.tp-tab-bar` + `.tp-tab` (custom)                |
| DM      | Segmented wizard    | `.wizard-progress` + `.progress-segment` (custom) |
| ICG     | Linear progress bar | `.icg-progress` + `.icg-progress__fill` (custom)  |
| TDC     | Single page         | None                                              |
| RegMap  | Map + search        | None                                              |

Three different navigation paradigms for three different UX needs. These should be named under a shared convention (`.tool-tabs`, `.tool-progress`, `.tool-wizard`) but not merged — they solve different problems.

### 7. Print Styles — RegMap missing

Four tools have `@media print` blocks; RegMap does not. All print blocks independently hide navigation chrome and action bars. A shared `.no-print` utility would reduce duplication.

---

## Phased Implementation

### Phase 1: Quick Wins (button + option card unification)

**Scope**: Unify the two most duplicated patterns. No visual changes to end users — same appearance, shared classes.

| Item                   | Files                      | Change                                                                                                                                                                       |
| ---------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1a. Option card**    | `global.css`, TechPar, ICG | Move DM's `.option-card` to `global.css`. Migrate TechPar `.tp-stage-card` and ICG `.icg-stage-card` / `.icg-opt-btn` to shared class. Add `.option-card--compact` modifier. |
| **1b. Button cleanup** | TechPar, ICG               | Replace `.tp-btn-share/back/next` with `.hub-btn--secondary` / `.cta-button`. Remove `.icg-btn-primary/secondary` wrappers.                                                  |
| **1c. Print utility**  | `global.css`, RegMap       | Add `.no-print { display: none !important }` to global. Add `@media print` block to RegMap.                                                                                  |

**Estimated CSS impact**: -90 tool-specific lines, +30 shared lines.

### Phase 2: Dark Theme Variable Migration

**Scope**: Eliminate all tool-scoped `:global(html.dark-theme)` overrides by mapping hardcoded values to CSS variables.

| Item                   | Files           | Change                                                                                         |
| ---------------------- | --------------- | ---------------------------------------------------------------------------------------------- |
| **2a. Audit**          | DM, ICG, RegMap | Catalog all 82 explicit dark overrides. Map each to an existing variable or propose a new one. |
| **2b. New variables**  | `variables.css` | Add any missing dark-theme variables (estimated 5-10 new vars).                                |
| **2c. Migrate DM**     | DM page         | Replace 27 `:global(html.dark-theme)` selectors with variable references.                      |
| **2d. Migrate ICG**    | ICG page        | Replace 31 selectors.                                                                          |
| **2e. Migrate RegMap** | RegMap page     | Replace 24 selectors.                                                                          |

**Estimated CSS impact**: -82 dark theme selectors removed, +10 variables added.

### Phase 3: Navigation Naming + Form Patterns

**Scope**: Standardize class naming for navigation paradigms and extract form field patterns.

| Item                       | Files                 | Change                                                                                                                                                             |
| -------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **3a. Tab bar**            | `global.css`, TechPar | Extract `.tp-tab-bar` / `.tp-tab` to shared `.tool-tabs` / `.tool-tab` in global. TechPar adopts shared classes.                                                   |
| **3b. Progress patterns**  | `global.css`, DM, ICG | Rename DM's `.wizard-progress` → `.tool-wizard-progress` and ICG's `.icg-progress` → `.tool-progress-bar` in global. Tools adopt shared classes.                   |
| **3c. Form field pattern** | `global.css`, TechPar | Extract `.tp-field` / `.tp-hint` / `.tp-input-wrap` to shared `.tool-field` / `.tool-field__hint` / `.tool-field__input` in global. TechPar adopts shared classes. |
| **3d. Slider pattern**     | `global.css`, TDC     | Extract `.calc-slider` / `.slider-row` to shared `.tool-slider` / `.tool-slider-row` in global. TDC adopts shared classes. Document on `/brand` page.              |

**Estimated CSS impact**: -150 tool-specific lines, +120 shared lines (net -30, but major reusability gain).

### Phase 4: Tool Shell Alignment

**Scope**: Bring TechPar, DM, and RegMap containers into the `.tool-shell` naming family where feasible.

| Item              | Files   | Change                                                                                       |
| ----------------- | ------- | -------------------------------------------------------------------------------------------- |
| **4a. TechPar**   | TechPar | Rename `.techpar-shell` to `.tool-shell--fluid` (already exists in global).                  |
| **4b. DM wizard** | DM      | Keep `.wizard-container` but wrap output in `.tool-shell--document` (800px, already exists). |
| **4c. RegMap**    | RegMap  | Keep `.map-layout` (full-width map is intentional). No change.                               |

---

## Verification Strategy

Each phase must pass before proceeding:

1. `npm run build` — no build errors
2. `npm run test:run` — all unit/integration tests pass
3. Visual diff at desktop, 768px, and 480px in both themes
4. E2E spot-check: run the 3-4 most relevant E2E tests for modified tools
5. Print output check for tools with `@media print`

---

## Out of Scope

These patterns are **tool-specific by design** and should not be consolidated:

- **DM document output** (`.doc-*`) — unique generated-document structure
- **RegMap map/timeline visualization** (`.map-*`, `.timeline-*`) — unique interactive map
- **TechPar KPI/trajectory** (`.tp-kpi-*`, `.tp-traj-*`) — domain-specific financial metrics
- **ICG recommendation cards** (`.icg-rec-*`) — assessment-specific results
- **ICG snapshot manager** (`.icg-snapshot-*`) — session persistence UI

---

## Success Metrics

| Metric                              | Before      | After (Target)       |
| ----------------------------------- | ----------- | -------------------- |
| Total scoped CSS lines              | ~6,250      | ~5,200 (-17%)        |
| Tool-prefixed selectors             | ~598        | ~450 (-25%)          |
| Dark theme `:global()` overrides    | 83          | 0 (-100%)            |
| Tools using `.option-card`          | 1 (DM)      | 3 (DM, TechPar, ICG) |
| Tools using `.hub-btn` consistently | 2 (DM, TDC) | 5 (all)              |
| Tools with print styles             | 4           | 5 (all)              |

---

## Related

- [/brand](https://globalstrategic.tech/brand) — Live design system reference (target state for shared components)
- [STYLES_GUIDE.md](../styles/STYLES_GUIDE.md) — CSS conventions and hub tool patterns
- [VARIABLES_REFERENCE.md](../styles/VARIABLES_REFERENCE.md) — Design token catalog
