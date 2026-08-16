---
category: Specimens
---

**A specimen gallery, not a component. Do not render `<FormSpecimen />` in a design.**
Copy the markup below.

### Text input

```jsx
<input className="brutal-input" type="text" placeholder="Search portfolio" />
```

### Field

`__label` is the field's own label class — **not** `.brutal-label-small`. It already
stacks above the control.

```jsx
<div className="brutal-field">
  <label className="brutal-field__label" htmlFor="company">
    Portfolio company
  </label>
  <input id="company" className="brutal-input" type="text" />
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
