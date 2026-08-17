---
category: Specimens
---

**A specimen gallery, not a component. Do not render `<ColorSpecimen />` in a design.**
It exists so you can see what each color token resolves to.

Every color in a GST design comes from a token. Hardcoded colors are a lint error in the
source repo, and they break both dark mode and all six alternative palettes.

| Need                                | Token                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| Interactive elements, brand accents | `--color-primary` (teal `#05cd99`), `--color-primary-dark`                        |
| Secondary / tertiary brand          | `--color-secondary`, `--color-tertiary`                                           |
| Status                              | `--color-success`, `--color-warning`, `--color-error`, `--color-info`             |
| Tinted primary fills                | `--color-primary-02` … `--color-primary-65` (opacity scale)                       |
| Text                                | `--text-primary`, `--text-secondary`, `--text-muted`                              |
| Backgrounds                         | `--bg-light`, `--bg-light-alt`, `--surface-*-bg`                                  |
| Borders                             | `--border-light`, `--border-hairline`, `--border-dark-subtle/-default/-prominent` |
| Scrims / backdrops                  | `--scrim-15` … `--scrim-60`                                                       |

```jsx
<div style={{ background: 'var(--surface-subtle-bg)', color: 'var(--text-primary)' }} />
```

**Need a tint with no token?** Use
`color-mix(in srgb, var(--color-success) 12%, transparent)` — it stays correct across
themes and all six palettes, which a frozen `rgba()` does not.

Theme and palette are classes on `<html>`: `html.dark-theme` (which flips every
`light-dark()` token) and `html.palette-0` … `html.palette-5`. Token-built UI follows
both automatically.
