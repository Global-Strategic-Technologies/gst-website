# BL-014 Verification Test Plan

## Overview

Verify the Tech Debt Calculator's two new calculation model features:

1. **Remediation Efficiency slider** (0-100%, default 70%) in Advanced > ROI Analysis
2. **Context-Switch Overhead toggle** (+23%) in Advanced > Delivery & Incidents

## Prerequisites

- Dev server running: `npm run dev`
- Navigate to: `http://localhost:4321/hub/tools/tech-debt-calculator`
- Use Playwright MCP browser tools for all verification

---

## Test 1: Default Page Load

1. Navigate to the calculator page
2. Take a screenshot
3. Verify the page loads with default values and "Annual Cost of Debt" is displayed
4. The Advanced panel should be collapsed (not visible)

**Expected**: Page renders normally, no visual regressions from adding new controls

---

## Test 2: Advanced Panel — New Controls Present

1. Click "Show Advanced Inputs" button
2. Take a screenshot of the full advanced panel
3. Verify the following are visible:
   - A checkbox labeled "Include context-switch overhead (+23%)" in the Delivery & Incidents section
   - Hint text below it: "Weinberg's research: each concurrent task adds ~23% cognitive overhead to direct labor"
   - A "Remediation Efficiency" slider in the ROI Analysis section, displaying "70%"

**Expected**: Both new controls render in the correct sections with proper labels and defaults

---

## Test 3: Context-Switch Toggle — Enable

1. Note the current "Annual Cost of Debt" and "Direct Labor" values
2. Check the "Include context-switch overhead (+23%)" checkbox
3. Take a screenshot
4. Verify:
   - A new "Context-Switch Cost" line item appears in the advanced results grid
   - The "Annual Cost of Debt" value has increased
   - The "Direct Labor" value is unchanged (context-switch is a separate line item)
   - The context-switch cost value is displayed with a `/mo` suffix

**Expected**: Costs increase, new line item visible, direct labor stays the same

---

## Test 4: Context-Switch Toggle — Disable

1. Uncheck the context-switch checkbox
2. Take a screenshot
3. Verify:
   - The "Context-Switch Cost" line item disappears
   - The "Annual Cost of Debt" returns to the value from Test 2

**Expected**: Values revert, line item hidden

---

## Test 5: Remediation Slider — Drag to 100%

1. Set the remediation slider to 100 (far right)
2. Take a screenshot
3. Verify:
   - The display shows "100%"
   - "Est. Monthly Savings" equals approximately the monthly cost
   - Break-even period is at its shortest

**Expected**: Full remediation shows maximum savings

---

## Test 6: Remediation Slider — Drag to 0%

1. Set the remediation slider to 0 (far left)
2. Take a screenshot
3. Verify:
   - The display shows "0%"
   - "Est. Monthly Savings" shows "$0" or equivalent zero value
   - Break-even shows "> 5 yrs"

**Expected**: Zero remediation means zero savings and infinite payback

---

## Test 7: Payback Disclaimer Text

1. Set remediation slider back to 70%
2. Read the disclaimer text below the advanced results grid
3. Verify it reads: `Remediation efficiency: 70% · Budget: $500K` (or current budget value)

**Expected**: Disclaimer reflects the efficiency percentage, NOT "Assumes full resolution"

---

## Test 8: Combined — Both Features Active

1. Check the context-switch checkbox AND set remediation to 50%
2. Take a screenshot
3. Verify:
   - Context-Switch Cost line item is visible
   - Annual cost is elevated (context-switch adds ~23%)
   - Est. Monthly Savings reflects 50% of the elevated total
   - Break-even is longer than at 70%/100% remediation

**Expected**: Both features compose correctly

---

## Test 9: URL State Persistence

1. With both features active (context-switch ON, remediation at 50%), note the URL's `?s=` parameter
2. Copy the full URL
3. Navigate to a blank page, then navigate back to the copied URL
4. Take a screenshot
5. Verify:
   - The context-switch checkbox is checked
   - The remediation slider shows 50%
   - All result values match the pre-navigation state

**Expected**: Full state round-trips through URL encoding

---

## Test 10: Copy Summary Export

1. With context-switch ON and remediation at 50%, click "Copy Summary"
2. Read clipboard contents (or verify button text changes to "Copied!")
3. Verify the summary text includes:
   - A line containing "Context-switch overhead (+23%)"
   - A line containing "Remediation efficiency: 50%"

**Expected**: New fields appear in plain-text export

---

## Test 11: Currency Interaction

1. Switch currency selector to EUR
2. Take a screenshot
3. Verify the context-switch cost and savings values display with Euro symbol
4. Switch back to USD

**Expected**: Currency conversion applies to all new metrics

---

## Test 12: Label Change Verification

1. In the advanced results grid, verify the savings metric is labeled "Est. Monthly Savings" (not "Max Monthly Savings")

**Expected**: Label reflects that savings are now estimated based on efficiency, not assumed at 100%

---

## Test 13: Light/Dark Theme

1. Toggle to dark theme
2. Take a screenshot of the advanced panel with both features active
3. Verify:
   - Checkbox and label are legible
   - Hint text is visible but muted
   - Slider renders correctly
   - All result values are readable

**Expected**: No contrast or visibility issues in dark theme

---

## Pass Criteria

All 13 tests must pass. Screenshots should be captured for tests 1-9, 11, and 13 to provide visual evidence.
