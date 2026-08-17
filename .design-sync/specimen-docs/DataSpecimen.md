---
category: Specimens
---

**A specimen gallery, not a component. Do not render `<DataSpecimen />` in a design.**
Copy the markup below.

### Stat tiles

```jsx
<div style={{ display: 'flex', gap: 'var(--gap-normal)' }}>
  <div className="brutal-stat-tile">
    <div className="brutal-stat-tile__value">6</div>
    <div className="brutal-stat-tile__label">domains</div>
  </div>
</div>
```

### Progress bar

`__fill` carries the percentage as an inline width.

```jsx
<div className="brutal-progress-bar">
  <div className="brutal-progress-bar__track">
    <div className="brutal-progress-bar__fill" style={{ width: '66%' }} />
  </div>
  <span className="brutal-progress-bar__label">4 of 6</span>
</div>
```

### Callouts

Body text is a bare sibling of `__title`, not a wrapped element.

```jsx
<div className="brutal-callout">
  <span className="brutal-callout__title">Who should complete this assessment.</span>
  This tool takes 5 to 7 minutes.
</div>

<div className="brutal-callout brutal-callout--warning">
  <span className="brutal-callout__title">Foundational domain scored below threshold</span>
  Scores in other domains may understate the true gap.
</div>
```

Also available: `.brutal-bench-table` (benchmark rows with an `__active` highlight — ToolChromeSpecimen), `.brutal-breadcrumb` (NavigationSpecimen).

### Editor's pick tag

A small outlined tag in the editor's-pick colour, for curated feed items.

```jsx
<span className="editors-pick-tag">Editor's Pick</span>
```
