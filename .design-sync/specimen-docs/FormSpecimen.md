---
category: Specimens
---

**A specimen gallery, not a component. Do not render `<FormSpecimen />` in a design.**
Copy the markup below.

### Text input (standalone)

`.brutal-input` is the compact standalone input (0.7rem mono, secondary text, tinted
surface, intrinsic width) for a control with no label of its own — a search box, an inline
filter. Inside a labelled field use `.brutal-field__input` instead — see below.

```jsx
<input className="brutal-input" type="text" placeholder="Search portfolio" />
```

### Field

`.brutal-field` styles its **own** children — `__label` (not `.brutal-label-small`),
`__input` (not `.brutal-input`: full-width, `--text-sm`, primary text, transparent —
both are dashed and go solid on focus), optional `__req` inside
the label, optional `__hint` (+ `--warn`) below.

```jsx
<div className="brutal-field">
  <label className="brutal-field__label" htmlFor="company">
    Portfolio company <span className="brutal-field__req">(required)</span>
  </label>
  <input id="company" className="brutal-field__input" type="text" />
  <div className="brutal-field__hint brutal-text-tiny">Legal entity as it appears in the SPA.</div>
</div>
```

For a unit prefix or suffix, wrap the input in `__input-wrap`, add `__prefix` / `__suffix`,
and pad the input with `__input--has-prefix` / `__input--has-suffix`:

```jsx
<div className="brutal-field__input-wrap">
  <span className="brutal-field__prefix">$</span>
  <input
    className="brutal-field__input brutal-field__input--has-prefix"
    type="text"
    inputMode="numeric"
  />
</div>
```

### Filter chips

```jsx
<div className="brutal-filter-chips">
  <button className="brutal-filter-chip brutal-filter-chip--active" type="button">
    All
  </button>
  <button className="brutal-filter-chip" type="button">
    Diligence
  </button>
</div>
```

### Segmented control

Children are `__btn`; the active one adds `__btn--active`. Width modifiers: `--sm`, `--wide`.

```jsx
<div className="brutal-segmented">
  <button className="brutal-segmented__btn brutal-segmented__btn--active" type="button">
    Overview
  </button>
  <button className="brutal-segmented__btn" type="button">
    Detail
  </button>
</div>
```

Use `min-height: var(--touch-target-min)` on interactive controls, and never `min-width`
— it clips `.brutal-segmented`.
