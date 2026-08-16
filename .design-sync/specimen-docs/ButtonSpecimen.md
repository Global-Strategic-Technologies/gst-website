---
category: Specimens
---

**A specimen gallery, not a component. Do not render `<ButtonSpecimen />` in a design** —
it draws a row of every variant at once. Copy the markup below and use the classes directly.

GST buttons are pure CSS classes with no component behind them, so this markup _is_ the
design system. Only two variants exist — `--primary` and `--secondary`.

```jsx
<button className="brutal-btn brutal-btn--primary">Primary</button>
<button className="brutal-btn brutal-btn--secondary">Secondary</button>
<button className="brutal-btn brutal-btn--primary" disabled>Disabled</button>

{/* Full-bleed inside a container */}
<button className="brutal-btn brutal-btn--primary brutal-btn--full">Full Width</button>

{/* Wizard / assessment answer buttons */}
<button className="brutal-choice-btn" type="button">Default Choice</button>
<button className="brutal-choice-btn brutal-choice-btn--selected" type="button">Selected</button>
<button className="brutal-choice-btn brutal-choice-btn--unsure" type="button">Unsure</button>

{/* Marketing CTA — solid fill, used for the primary page action */}
<a className="cta-button" href="/contact/">Request diligence</a>
```

`.brutal-btn` already carries the frosted-glass treatment (`backdrop-filter`, inset
highlight) — never re-add it. Interactive controls should clear
`min-height: var(--touch-target-min)`.
