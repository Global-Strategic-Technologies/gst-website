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

Cards must never set `max-width` or `margin: 0 auto` on themselves — the grid owns the columns.
