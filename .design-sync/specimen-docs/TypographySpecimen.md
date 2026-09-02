---
category: Specimens
---

**A specimen gallery, not a component. Do not render `<TypographySpecimen />` in a design.**
Use the classes below on real elements.

```jsx
<h1 className="brutal-heading-xl">Page title</h1>
<h2 className="brutal-heading-lg">Section</h2>
<h3 className="brutal-heading-md">Subsection</h3>
<h4 className="brutal-heading-sm">Minor heading</h4>

<p className="brutal-text-base">Body copy for the primary reading line.</p>
<p className="brutal-text-small">Supporting detail and captions.</p>
<p className="brutal-text-tiny">Footnotes and metadata.</p>

<span className="brutal-label">Eyebrow Label</span>
<span className="brutal-label-small">Label Small</span>
<span className="brutal-content-label">Section Content Label</span>

{/* Monospace figures — use for any number the reader will compare */}
<span className="brutal-data">42.7%</span>
<span className="brutal-data-sm">1,204 units</span>
```

Prefer these classes over raw `font-size`. If you must set one, use the `--text-*` scale
(`--text-2xs` … `--text-3xl`) — never a pixel value.

The system ships **one** family and pins it: `--font-family-mono` is `'GST Mono'` — a
self-hosted subset of Geist Mono Variable — and `--font-family` points at the same token,
so there is no sans. That single monospace face is what gives the brutalist surfaces their
character. Never name a typeface in a style; always go through `var(--font-family-mono)`.
