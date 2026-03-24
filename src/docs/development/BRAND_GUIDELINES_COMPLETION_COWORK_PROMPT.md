# Cowork Prompt: Brand Guidelines Completion (Init 1A)

Copy the prompt below into a Claude Cowork session. The Cowork agent will use its Chrome browser automation to explore the live site alongside the codebase to make and verify decisions.

---

## Prompt

```
You are completing the Brand Guidelines for the GST website — the last open initiative (Init 1A) on the styles remediation roadmap.

## Your Task

Read `src/docs/development/BRAND_GUIDELINES_COMPLETION.md` for full context. That document contains 5 requirement areas (R1-R5), each with a concrete recommendation and decision checkboxes. Your job is to:

1. Review each recommendation
2. Browse the live site at http://localhost:4321/ using Chrome to see how colors, text, and brand assets currently render
3. Make implementation decisions based on what you observe
4. Implement the approved changes
5. Verify the results visually in the browser and with tests

## How to Use the Browser

The dev server is running at http://localhost:4321/. Browse these pages to inform your decisions:

**For R1 (Semantic Colors) and R2 (Color Hierarchy)**:
- Browse http://localhost:4321/hub/tools/infrastructure-cost-governance — see maturity level colors (reactive red, aware orange, optimizing green, strategic teal) in the results view
- Browse http://localhost:4321/hub/tools/diligence-machine — see authority blue and methodology brown in the output document
- Browse http://localhost:4321/hub/tools/techpar — see TechPar zone colors and KPI indicators
- Note how success/warning/error colors are used across tools — these should become shared semantic variables

**For R3 (Contrast Compliance)**:
- Browse http://localhost:4321/ and look for faded/placeholder text — check if it's readable
- Toggle dark theme (click the theme toggle in the header) and verify the same elements
- Run Lighthouse accessibility audit in Chrome DevTools on the homepage in both themes
- Pay special attention to filter chip text on http://localhost:4321/ma-portfolio

**For R4 (Data Visualization)**:
- Browse http://localhost:4321/hub/tools/regulatory-map — see the purple-blue (#6c63ff) industry and red (#e74c3c) cybersecurity category colors. These are the 2 hardcoded colors that need variables.
- Browse TechPar and ICG results to see their chart color palettes
- Toggle dark theme on each to verify colors work in both modes

**For R5 (Brand Asset)**:
- Observe the delta icon in the navigation header (top-left)
- Browse http://localhost:4321/hub/tools/infrastructure-cost-governance and expand/collapse recommendation cards to see the .delta-chevron toggle in action
- Check icon sizing and clearance at mobile viewport (resize browser to 480px width)

## Implementation Steps

After reviewing the site:

1. **Add semantic color variables** to `src/styles/variables.css` — 4 new variables (`--color-success`, `--color-warning`, `--color-error`, `--color-info`) with dark theme overrides. Use the values from R1 in BRAND_GUIDELINES_COMPLETION.md.

2. **Fix --text-faded contrast** — In `src/styles/variables.css`, change `--text-faded` opacity from 0.5 to 0.6 (both light and dark values). Then browse the site to verify placeholder/disabled text is still visually distinct but now more readable.

3. **Add regulatory map color variables** — Add `--regmap-category-industry` and `--regmap-category-cyber` to `src/styles/variables.css`. Then replace the hardcoded hex values in `src/pages/hub/tools/regulatory-map/index.astro`. Browse the regulatory map page to verify colors render correctly.

4. **Finalize BRAND_GUIDELINES.md** — Replace each R1-R5 "Requirements" section with the approved permanent guideline content. Remove all "Stakeholder decisions needed" checkboxes and "Pending Stakeholder Review" header.

5. **Update supporting docs** — Add semantic colors to `src/docs/styles/VARIABLES_REFERENCE.md`. Add color hierarchy to `src/docs/styles/STYLES_GUIDE.md`. Mark Init 1A complete in `src/docs/styles/STYLES_REMEDIATION_ROADMAP.md`.

6. **Verify**:
   - Run `npm run test:run` — all tests must pass
   - Run `npm run lint:css` — no violations
   - Browse the site in both themes at desktop and mobile widths
   - Run Lighthouse accessibility audit and confirm no contrast failures

## Key Constraints

- Use CSS variables from the design system — never hardcode colors
- All new variables need both `:root` (light) and `html.dark-theme` (dark) values
- Follow the existing variable naming convention: `--color-*` for semantic, `--regmap-*` for regulatory map
- Test in BOTH light and dark themes
- Create atomic git commits for each logical change
- Reference `src/docs/development/BRAND_GUIDELINES_COMPLETION.md` for detailed rationale behind each recommendation
```

---

**Note**: Ensure `npm run dev` is running before starting the Cowork session so that http://localhost:4321/ is accessible.
