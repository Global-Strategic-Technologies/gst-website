# Styles Documentation

CSS conventions, design tokens, brand guidelines, and typography reference for the GST website.

## Start Here

**[STYLES_GUIDE.md](STYLES_GUIDE.md)** is the single entry point for all styling conventions. It links to the other docs when needed.

## All Documents

| Doc                                                            | Purpose                                                       | Audience               |
| -------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------- |
| [STYLES_GUIDE.md](STYLES_GUIDE.md)                             | CSS conventions, patterns, responsive design                  | All developers         |
| [VARIABLES_REFERENCE.md](VARIABLES_REFERENCE.md)               | Complete design token reference (colors, spacing, typography) | Developers writing CSS |
| [BRAND_GUIDELINES.md](BRAND_GUIDELINES.md)                     | Color hierarchy, palettes, voice, asset rules                 | Design decisions       |
| [TYPOGRAPHY_REFERENCE.md](TYPOGRAPHY_REFERENCE.md)             | Font stacks, size scale, utility classes                      | Developers, designers  |
| [STYLES_REMEDIATION_ROADMAP.md](STYLES_REMEDIATION_ROADMAP.md) | Planned CSS improvements and migrations                       | Maintainers            |

## Key Rules

- All colors must use CSS variables (never hardcode)
- All spacing uses the `--spacing-*` scale
- Desktop-first responsive design with `max-width` breakpoints
- Theme switching via `light-dark()` color values in `variables.css`; the `html.dark-theme` class (not `body`) only flips `color-scheme`
- Palette system: 6 alternatives in `src/styles/palettes.css`
- In-repo control examples: `src/pages/brand.astro` + `src/components/brand/` (see STYLES_GUIDE § In-repo Control Examples)

---

← Back to [Master Documentation Index](../README.md)
