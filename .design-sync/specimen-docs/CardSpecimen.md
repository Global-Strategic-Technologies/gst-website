---
category: Specimens
---

**A specimen gallery, not a component. Do not render `<CardSpecimen />` in a design** —
it draws every card family at once. Copy the markup below.

There is **no generic `.brutal-card`**. Cards are a named family and each one requires its
own BEM sub-elements; the block class alone renders unstyled content.

### Recommendation card

```jsx
<div className="brutal-rec-card">
  <div className="brutal-rec-card__body">
    <div className="brutal-rec-card__title">
      <span className="brutal-rec-card__badge brutal-rec-card__badge--high">High</span>
      <span className="brutal-rec-card__badge brutal-rec-card__badge--effort">Quick Win</span>
      Deploy a cloud cost visibility dashboard
    </div>
    <div className="brutal-rec-card__desc">Implement AWS Cost Explorer or a FinOps platform.</div>
  </div>
</div>
```

### Attention card

```jsx
<div className="brutal-attention-card brutal-attention-card--high">
  <div className="brutal-attention-card__header">
    <h3 className="brutal-attention-card__title">Key-Person Technical Dependencies</h3>
  </div>
  <p className="brutal-attention-card__desc">Assess key person dependencies before close.</p>
</div>
```

### Gateway card

Pairs with `.brutal-frosted`, sits inside `.brutal-gateway-grid`, and its CTA is
`cta-button brutal-gateway-card__cta` — **not** a `.brutal-btn`.

```jsx
<div className="brutal-gateway-grid">
  <article className="brutal-gateway-card brutal-frosted">
    <div className="brutal-gateway-card__header">
      <h2>Business &amp; Technology Architectures</h2>
    </div>
    <ul className="brutal-gateway-card__features">
      <li>How architecture choices cascade into business outcomes</li>
      <li>Five layers from software foundations to industry forces</li>
    </ul>
    <a href="/hub/library/" className="cta-button brutal-gateway-card__cta">
      Read Article
    </a>
  </article>
</div>
```

A gateway card with no live CTA carries a status pill instead: `<span className="brutal-gateway-card__badge">Planned</span>` as the last child.

### Option cards (a choice presented as cards)

Real `<button>`s. `.options-grid` owns the column. Children: `__label` (may wrap a
`.brutal-option-card__icon` delta) and `__description`. Modifiers: `--selected` (teal
label), `--selected-outline` (teal text + border), `--unsure` for the "Not sure" peer,
`--compact` for dense text-only groups (stage pickers, as a `role="radiogroup"`).

```jsx
<div className="options-grid">
  <button
    className="brutal-option-card brutal-option-card--selected-outline"
    type="button"
    aria-pressed="true"
  >
    <span className="brutal-option-card__label">Full Acquisition</span>
    <span className="brutal-option-card__description">Complete purchase of the target entity</span>
  </button>
  <button
    className="brutal-option-card brutal-option-card--unsure"
    type="button"
    aria-pressed="false"
  >
    <span className="brutal-option-card__label">Not sure</span>
  </button>
</div>
```

### Teaser card

Promotes a tool: `__header > h2` (element selector — it must be an `<h2>`), a
`__features` `<ul>` with `.bullet-icon` deltas, a `__badge`, and a `__cta` that is also
a `.brutal-btn`.

```jsx
<article className="brutal-teaser-card">
  <div className="brutal-teaser-card__header">
    <h2>Technology Cost Benchmarking</h2>
  </div>
  <ul className="brutal-teaser-card__features">
    <li>Revenue-normalized cost analysis</li>
  </ul>
  <span className="brutal-teaser-card__badge">Live</span>
  <button className="brutal-btn brutal-btn--primary brutal-teaser-card__cta" type="button">
    Launch Tool
  </button>
</article>
```

### Trust card

Heading + one paragraph; keys on bare `h3` and `p`, no BEM children. Grids of 2–4.

```jsx
<div className="brutal-trust-card">
  <h3>Vendor-Neutral Analysis</h3>
  <p>Independent assessment without platform bias.</p>
</div>
```

### FAQ (accordion)

Native `<details>` / `<summary>` — the `[open]` attribute drives the border, so the
elements are not optional. `__item` is frosted by its own base rule, so do NOT
co-apply `.brutal-frosted` — it double-blurs. Put a `.delta-chevron` in the summary (it rotates via `details[open]`). `--lg` for
marketing/gateway pages.

```jsx
<div className="brutal-faq brutal-faq--lg">
  <details className="brutal-faq__item">
    <summary className="brutal-faq__question">
      <span>How long does an engagement take?</span>
      <svg className="delta-chevron" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <path
          d="M32 12 L52 52 L12 52 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinejoin="miter"
        />
      </svg>
    </summary>
    <div className="brutal-faq__answer">
      <p>Two to three weeks.</p>
    </div>
  </details>
</div>
```

### Project card

`.brutal-project-card` is a portfolio/case card with an explicit CTA (used on /brand).
Children of `.brutal-project-card`: `__header` (wrapping `__title` + `__industry`, and
`__year`), `__metrics` (a 2-column grid of `__value`, `__value--arr`), `__summary`
(3-line clamp), `__tags` of `__tag` (+ `__tag--theme`), and a full-width `__cta` button
pinned to the bottom.

```jsx
<div className="brutal-project-card">
  <div className="brutal-project-card__header">
    <div>
      <div className="brutal-project-card__title">Meridian</div>
      <div className="brutal-project-card__industry">Healthcare SaaS</div>
    </div>
    <div className="brutal-project-card__year">2025</div>
  </div>
  <div className="brutal-project-card__metrics">
    <div>
      <div className="brutal-label-small">ARR</div>
      <div className="brutal-project-card__value brutal-project-card__value--arr">$18M</div>
    </div>
    <div>
      <div className="brutal-label-small">Stage</div>
      <div className="brutal-project-card__value">Growth</div>
    </div>
  </div>
  <p className="brutal-project-card__summary">…</p>
  <div className="brutal-project-card__tags">
    <span className="brutal-project-card__tag brutal-project-card__tag--theme">Digital Health</span>
    <span className="brutal-project-card__tag">Cloud Migration</span>
  </div>
  <button className="brutal-project-card__cta" type="button">
    View Project Details
  </button>
</div>
```

Cards must never set `max-width` or `margin: 0 auto` on themselves — the grid owns the columns.
