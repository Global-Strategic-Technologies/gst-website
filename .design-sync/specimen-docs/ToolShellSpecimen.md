---
category: Specimens
---

**A specimen gallery, not a component. Do not render `<ToolShellSpecimen />` in a design.**
Copy the markup below.

`.brutal-tool-shell` is the standard container for every GST hub tool (calculators,
assessments, wizards). Use it for any tool-like surface.

```jsx
<section className="tool-section">
  <div className="container">
    <div className="brutal-tool-shell brutal-tool-shell--narrow">
      <div className="brutal-tool-shell__content">
        <div className="brutal-tool-shell__authority">Tool Authority Line</div>
        <div className="brutal-tool-shell__section-label">Section Label</div>
        <p className="brutal-text-base">Tool content goes here.</p>
        <button className="brutal-btn brutal-btn--primary">Start assessment</button>
      </div>
    </div>
  </div>
</section>
```

Width modifiers: `--narrow` (660px), default (700px), `--wide` (760px), `--document`
(800px), `--fluid` (100%). `__content` supplies the responsive padding — always use it
rather than padding the shell yourself.

### Skeleton loading

The brutalist family is **outlined**, not filled. Vary widths inline to suggest real
content, stagger `animationDelay`, and mark the wrapper `aria-hidden`.

```jsx
<div aria-hidden="true">
  <div className="brutal-skeleton-bar" style={{ width: '80%' }} />
  <div
    className="brutal-skeleton-bar brutal-skeleton-bar--sm"
    style={{ width: '40%', animationDelay: '0.3s' }}
  />
  <div className="brutal-skeleton-dot" />
</div>
```

Don't use a skeleton to defer a page's primary content on a page meant to be indexed.
