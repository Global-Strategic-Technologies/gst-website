---
category: Specimens
---

**A specimen gallery, not a component. Do not render `<ToolChromeSpecimen />` in a design.**
Copy the markup below.

The shared furniture of every GST hub tool. It sits inside a `.brutal-tool-shell`
(see ToolShellSpecimen). Every family below is a plain CSS class — the markup _is_ the
real thing.

### Action bar

A row of `.brutal-btn` actions under a result. Modifiers: `--center` / `--end` (alignment),
`--bordered` (top hairline + padding), `--frosted` (surface + blur), `--stack` (column at
480px). Positioning (sticky, floating) is yours to add.

```jsx
<div className="tool-action-bar tool-action-bar--center tool-action-bar--bordered tool-action-bar--stack">
  <button type="button" className="brutal-btn brutal-btn--secondary">
    Copy summary
  </button>
  <button type="button" className="brutal-btn brutal-btn--secondary">
    Copy link
  </button>
  <a href="#" className="brutal-btn brutal-btn--secondary">
    Send to engineering lead
  </a>
</div>
```

### Tab bar (in-tool panel switching)

Frosted, sticky (`top: 0`) by default. `--active` is the only styling hook — keep
`aria-selected` in sync yourself. `__icon` is optional; `__label` is not.

```jsx
<div className="tool-tab-bar" role="tablist" aria-label="Sections">
  <button className="tool-tab tool-tab--active" type="button" role="tab" aria-selected="true">
    <span className="tool-tab__label">Profile</span>
  </button>
  <button className="tool-tab" type="button" role="tab" aria-selected="false">
    <span className="tool-tab__label">Costs</span>
  </button>
</div>
```

There is a second strip, `.brutal-tab-bar` / `.brutal-tab` (opaque, has `--done` and a
`__badge` dot) — see NavigationSpecimen. Use `.tool-tab` for frosted in-content panels;
reach for `.brutal-tab` only when you need visited-step marking or the attention dot.

### Wizard stepper

`.tool-wizard-progress` holds `.tool-wizard-step`s; each is the 64×64 delta with an SVG
`<text>` number (`__number`) and a `__label`. States: `--completed`, `--active`,
`--reachable`; anything else renders faded. Desktop only — pages swap in
`.tool-wizard-progress-mobile` (`__label`, `__current`, `__name`, `__dots` of
`.tool-wizard-dot` buttons) at 480px in their own media query; the CSS ships the mobile
variant `display: none` and never flips it for you.

```jsx
<div
  className="tool-wizard-progress"
  role="progressbar"
  aria-valuemin={1}
  aria-valuemax={5}
  aria-valuenow={2}
>
  <div className="tool-wizard-step tool-wizard-step--completed">
    <svg className="tool-wizard-step__icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path
        d="M32 12 L52 52 L12 52 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="miter"
      />
      <text
        x="32"
        y="40"
        textAnchor="middle"
        dominantBaseline="middle"
        className="tool-wizard-step__number"
      >
        1
      </text>
    </svg>
    <span className="tool-wizard-step__label">Transaction</span>
  </div>
  <div className="tool-wizard-step tool-wizard-step--active">…</div>
  <div className="tool-wizard-step">…</div>
</div>
```

For a simple percentage bar use `.brutal-progress-bar` (DataSpecimen).

### Bench table + note

Two `<td>`s per row, no `<thead>`: first cell is the uppercase label (where `__label`
pills go), last cell is the mono right-aligned value. `__active` on the user's row.
`.tool-bench-note` carries no font-size — always pair it with `brutal-text-tiny`.

```jsx
<table className="brutal-bench-table">
  <tbody>
    <tr><td>Seed / Pre-A</td><td>60–100%</td></tr>
    <tr className="brutal-bench-table__active">
      <td>Series A <span className="brutal-bench-table__label brutal-bench-table__label--stage">Your stage</span></td>
      <td>45–75%</td>
    </tr>
  </tbody>
</table>
<div className="tool-bench-note brutal-text-tiny">Ranges reflect illustrative patterns from GST engagements.</div>
```

### Methodology disclosure

Must be `<details>` / `<summary>` — the marker rotation keys on the native `[open]`
attribute and `__trigger` must be the direct child. `--delta` swaps the ▶ glyph for the
GST delta. `__updated` and the `__author` block are optional.

```jsx
<details className="tool-methodology tool-methodology--delta">
  <summary className="tool-methodology__trigger">How the assessment works</summary>
  <div className="tool-methodology__body">
    <h4 className="tool-methodology__heading">Scoring model</h4>
    <p>…</p>
    <p className="tool-methodology__updated">Methodology last updated March 2026</p>
    <div className="tool-methodology__author">
      <span className="tool-methodology__author-name">Reid Peryam</span>
      <span className="tool-methodology__author-sep">·</span>
      <span>Strategic Technology Advisor</span>
      <a href="#" className="tool-methodology__author-link">
        LinkedIn
      </a>
    </div>
  </div>
</details>
```
