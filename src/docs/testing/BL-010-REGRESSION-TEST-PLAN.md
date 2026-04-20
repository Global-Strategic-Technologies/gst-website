# BL-010 Regression Test Plan — Navigation and Form Pattern Unification

## Context

BL-010 extracted tool-specific navigation and form patterns into shared CSS classes. This plan verifies no visual or functional regressions across all affected tools and the brand page. All checks must pass in **both light and dark themes**.

## Prerequisites

- Dev server running (`npm run dev`)
- Browser with keyboard accessible (for focus testing)
- Test at desktop (1280px+) and mobile (480px)

---

## 1. TechPar (`/hub/tools/techpar`)

### 1.1 Tab Bar

- [ ] Tab bar is sticky — stays visible when scrolling down the page
- [ ] Tab bar has frosted glass background (semi-transparent with blur)
- [ ] "Profile" tab is active by default (teal border-bottom, light tinted background)
- [ ] Clicking each tab (Profile, Costs, Analysis, Trajectory) switches the visible panel
- [ ] Inactive tabs show muted text, hover shows secondary text color
- [ ] Keyboard: tabbing to a tab button shows teal outline (not browser default black box)
- [ ] Mobile (480px): tab bar scrolls horizontally if needed

### 1.2 Segmented Controls

- [ ] Industry buttons (SaaS, Fintech, Marketplace, Hardware, Other): clicking toggles active state (teal text + border)
- [ ] Currency buttons (USD, EUR, GBP, CAD, AUD): clicking toggles active state and updates all `$` prefixes across form fields
- [ ] Growth rate buttons: clicking toggles active state
- [ ] R&D mode toggle (Quick/Deep Dive): switching reveals/hides deep-dive fields
- [ ] Infra period toggle (Monthly/Annual): switching updates infra field label and hint
- [ ] Keyboard: tabbing to any segmented button shows teal outline (not black box)
- [ ] Mobile (480px): industry buttons wrap to multiple rows and center

### 1.3 Form Fields

- [ ] ARR input shows `$` prefix inside the field
- [ ] Growth rate input shows `%` suffix
- [ ] Exit multiple input shows `x` suffix
- [ ] Infra cost input shows `$` prefix and `/ mo` or `/ yr` suffix
- [ ] All inputs: dashed border turns solid teal on focus
- [ ] Hint text appears below each field in muted color
- [ ] Warning hints (e.g., "exceeds typical range") appear in orange when triggered
- [ ] Fields with no prefix (e.g., FTE count) have correct left padding

### 1.4 ARR Quick-Pick Chips

- [ ] Clicking a chip ($10M, $25M, $50M, $100M, $250M) populates the ARR field
- [ ] Active chip shows teal styling
- [ ] Keyboard: teal outline on focus (not black box)

### 1.5 Collapsible Panels

- [ ] "How to use TechPar" opens/closes on click
- [ ] "Historical data" section opens/closes on click
- [ ] "How it works" methodology panel opens/closes on click
- [ ] Keyboard: all three triggers show teal outline on focus (not black box)

### 1.6 Buttons

- [ ] "Reset All Inputs" resets all form values
- [ ] Next/Back navigation buttons work across tabs
- [ ] Copy Summary / Share buttons function correctly
- [ ] Keyboard: all buttons show teal outline on focus (not black box)

---

## 2. Diligence Machine (`/hub/tools/diligence-machine`)

### 2.1 Wizard Progress (Desktop)

- [ ] Step 1 is active on load (scaled up, teal delta icon, teal step number)
- [ ] Inactive steps are faded (opacity ~0.4)
- [ ] Advancing to step 2+ marks previous steps as "completed" (filled teal delta)
- [ ] Clicking a completed step navigates back to that step
- [ ] Clicking an unreached future step does nothing
- [ ] Progress bar `aria-valuenow` updates as steps change

### 2.2 Wizard Progress (Mobile — 480px)

- [ ] Desktop progress bar is hidden
- [ ] Compact "Step X of 6 — [step name]" text is visible
- [ ] Delta dot indicators are visible below the label
- [ ] Active dot is scaled and teal, completed dots are filled teal
- [ ] Tapping a completed/reachable dot navigates to that step

### 2.3 Buttons

- [ ] Next/Back/Generate buttons function correctly
- [ ] Option cards (brutal-option-card) are clickable and show selected state
- [ ] Keyboard: all interactive elements show teal outline on focus

---

## 3. Infrastructure Cost Governance (`/hub/tools/infrastructure-cost-governance`)

### 3.1 Progress Bar

- [ ] Progress bar fill animates from 0% to 100% as questions are answered
- [ ] Label updates (e.g., "2 of 6") as domains are completed
- [ ] Spacing below progress bar is consistent (not collapsed or oversized)
- [ ] Mobile (480px): progress bar has tighter gap and reduced bottom margin

### 3.2 Buttons

- [ ] "Begin assessment" starts the wizard
- [ ] Choice buttons (brutal-choice-btn) toggle selected state
- [ ] Keyboard: choice buttons show teal outline on focus (not black box)

---

## 4. Tech Debt Calculator (`/hub/tools/tech-debt-calculator`)

### 4.1 Sliders

- [ ] All 7 sliders render with visible track and thumb
- [ ] Dragging the thumb updates the value display in real-time
- [ ] Direct number input below slider syncs bidirectionally with the slider
- [ ] Thumb shows hover glow effect on mouseover
- [ ] Slider labels and values are visible and properly aligned (label left, value right)
- [ ] Currency-prefixed sliders (Salary, ARR, Budget) show formatted values

### 4.2 Advanced Section

- [ ] "Advanced Inputs" toggle opens/closes the section
- [ ] Sliders within advanced section function identically to primary sliders

### 4.3 Currency Select

- [ ] Currency dropdown options have correct background in dark theme

---

## 5. Brand Page (`/brand`)

### 5.1 Wizard Progress Demo

- [ ] Desktop progress demo renders 5 steps: 2 completed, 1 active, 2 inactive
- [ ] Completed steps show filled teal deltas
- [ ] Active step is scaled with teal color
- [ ] Inactive steps are faded
- [ ] Mobile progress demo renders with delta dots and "Step X of 5" label

### 5.2 Slider Demos

- [ ] Brutalist slider demo renders with square thumb and 2px track
- [ ] Dragging the slider updates the value display and direct input
- [ ] Direct input syncs back to the slider

### 5.3 Field Demo

- [ ] Input field demos render with dashed border, solid on focus

---

## 6. Header (all pages)

- [ ] Keyboard: tabbing to the GST logo shows teal outline with offset (not browser default)
- [ ] Logo outline does not appear on mouse click (only keyboard focus-visible)

---

## 7. Cross-Tool Keyboard Focus Audit

Tab through every interactive element on each tool page. Every focusable element must show a **teal outline** (`2px solid primary`), never the browser's default black/blue rectangle:

- [ ] TechPar: tabs, segmented buttons, chips, inputs, collapsible triggers, nav buttons, share buttons
- [ ] DM: progress steps, progress dots, option cards, nav buttons, methodology trigger
- [ ] ICG: choice buttons, nav buttons, methodology trigger
- [ ] TDC: sliders (thumb focus), direct inputs, advanced toggle, methodology trigger, copy button
- [ ] Header: logo, nav links (all pages)

---

## 8. Dark Theme

Repeat all checks above with dark theme enabled. Specifically verify:

- [ ] Tab bar frosted glass has dark background tint (not light leak)
- [ ] Wizard progress inactive steps use dark border color (not light gray)
- [ ] Slider tracks use dark border color
- [ ] Form field dashed borders use dark border color
- [ ] All teal focus outlines remain visible against dark backgrounds
