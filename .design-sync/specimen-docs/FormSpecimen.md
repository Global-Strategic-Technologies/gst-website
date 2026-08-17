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

### Slider (bounded numeric)

`__header` holds `__label` (a `<label for>`) and the live `__value`; `__input` is a real
`<input type="range">`; `__hints` holds an optional `__direct` `<input type="number">` for
typed entry; `__clamp-msg` is a status line (pair with `brutal-text-tiny`) shown when a
typed value is clamped.

```jsx
<div className="brutal-slider">
  <div className="brutal-slider__header">
    <label className="brutal-slider__label" htmlFor="team">
      Team size
    </label>
    <span className="brutal-slider__value">8</span>
  </div>
  <input id="team" type="range" min="0" max="100" className="brutal-slider__input" />
  <div className="brutal-slider__hints">
    <input
      type="number"
      className="brutal-slider__direct"
      min="1"
      max="500"
      aria-label="Number of engineers"
    />
  </div>
  <span className="brutal-slider__clamp-msg brutal-text-tiny" role="status" aria-live="polite" />
</div>
```

### Filter drawer (static panel)

A bordered filter panel: `__header` (`__title` + `__close`), `__content` with a `__clear`
button and `__section`s each headed by a `__label` and holding `.brutal-filter-chips`.
Slide-out positioning is yours to add.

```jsx
<div className="brutal-filter-drawer">
  <div className="brutal-filter-drawer__header">
    <h2 className="brutal-filter-drawer__title">Filters</h2>
    <button className="brutal-filter-drawer__close" aria-label="Close" type="button">
      ×
    </button>
  </div>
  <div className="brutal-filter-drawer__content">
    <button className="brutal-filter-drawer__clear" type="button">
      Clear All
    </button>
    <div className="brutal-filter-drawer__section">
      <div className="brutal-filter-drawer__label">Growth Stage</div>
      <div className="brutal-filter-chips">
        <button className="brutal-filter-chip brutal-filter-chip--active" type="button">
          All
        </button>
      </div>
    </div>
  </div>
</div>
```

Use `min-height: var(--touch-target-min)` on interactive controls, and never `min-width`
— it clips `.brutal-segmented`.
