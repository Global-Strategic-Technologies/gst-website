---
category: Specimens
---

**A specimen gallery, not a component. Do not render `<FrostedSpecimen />` in a design.**
Apply the utility classes below to your own containers.

Frosted glass is a core part of the GST aesthetic. Four strengths:

```jsx
<div className="brutal-frosted">Standard containers, action bars (3px blur)</div>
<div className="brutal-frosted brutal-frosted--heavy">Drawers, sticky bars over content (6px)</div>
<div className="brutal-frosted brutal-frosted--blur-only">Subtle wet-glass sheen (1.5px)</div>
<div className="brutal-frosted brutal-frosted--overlay">Modal / panel overlays (12px + 92% opacity)</div>
```

Two rules:

- **`.brutal-btn` is already frosted.** Never add `.brutal-frosted` to a button.
- **Frosting only reads over content.** A frosted pane on a flat background is
  indistinguishable from an unfrosted one — put it over an image, a colored surface, or
  scrolling content, or don't use it.

For frosted edges and highlights use the `--frost-highlight` / `--frost-edge` tokens
rather than retyping the rgba pair.
