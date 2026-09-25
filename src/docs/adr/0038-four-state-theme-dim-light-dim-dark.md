# ADR-0038: The theme has four states, encoded as two orthogonal classes

- **Status**: Accepted (2026-09-22)
- **Source initiative**: operator directive 2026-09-22 (the palette panel's theme button gains two intermediate states); shipped with BL-165 in one PR

## Context

The theme was binary: `html.dark-theme` sets `color-scheme: dark`, and every colour switches through `light-dark()` — 97 pairs in `variables.css`, about 400 across `src/`. LightningCSS lowers `light-dark()` to a `--lightningcss-light` / `--lightningcss-dark` switch keyed on `color-scheme`, so a colour has exactly two values and nothing can pick a third.

The operator asked for two intermediate states between light and dark, "not just white/black", cycled by the palette panel's theme button (the delta turns 90° counter-clockwise per click), with light and dark unchanged as positions 0 and 3. The footer's delta toggle was to keep its behaviour. Neutral grays were chosen over palette-tinted surfaces, and the setting is persisted for every visitor who picks it.

## Decision

**Two orthogonal classes, four states.** `theme-dim` joins `dark-theme`:

| State       | Classes                | `localStorage.theme` |
| ----------- | ---------------------- | -------------------- |
| 0 light     | —                      | `light`              |
| 1 dim light | `theme-dim`            | `dim-light`          |
| 2 dim dark  | `dark-theme theme-dim` | `dim-dark`           |
| 3 dark      | `dark-theme`           | `dark`               |

`dark-theme` still picks the colour scheme, so every `light-dark()` pair keeps working. `html.theme-dim` (in `variables.css`) re-declares only the **surface** tokens, each still as `light-dark(dim light, dim dark)`, so one block serves both dim states. It declares no `color-scheme`, so the lowered switch variables are untouched. The fixed dark constants (`--bg-dark`, `-secondary`, `-tertiary`) lift too; without that, components that paint panels with them would sit darker than a dim-dark page.

The mapping lives once, in [`src/scripts/theme-state.ts`](../../scripts/theme-state.ts). The palette panel cycles with `nextState`, the footer flips with `toggleBinary` (light side → dark, dark side → light), and the `/brand` responsive frames sync with `applyState`. The one copy is the inline head script in `BaseLayout.astro`, which cannot import a module; `tests/unit/theme-state.test.ts` pins its literals to the module's storage values. The state is applied before first paint, so TEST_BEST_PRACTICES #29's rule (set `localStorage.theme`, never toggle classes after load) covers the dim states unchanged.

**Values are measured, not derived.** Dim-light surfaces are `#ebebeb` / `#dcdcdc`, dim-dark `#1c1c1c` / `#202020` / `#262626`. Any page grayer than `#f5f5f5` drops some inks below [ADR-0035](0035-ink-tokens-for-text-on-light-surfaces.md)'s floors, so dim light re-points each failing ink to a darker measured value (`palettes.css` § Dim-light inks). It also deepens Phosphor's (palette 6) neon primary and success to `#18b64f`, holding brand-colour text to ADR-0035's 1.5:1 legibility floor on the gray surfaces (2026-09-25); that palette's `--color-primary-rgb` follows in dim light. Dim-dark surfaces stop at `#262626`, the ceiling under which the palettes' dark inks already pass. Palette 0's dark error ink is the one exception, and it gets its own override. `tests/integration/ink-token-contrast.test.ts` measures every ink against both dim-light surfaces and its 12% tint over each.

**Rejected:**

- **A third colour per `light-dark()` pair.** CSS has no three-way `light-dark()`, and rewriting about 400 pairs into a custom-property switch would touch every stylesheet for two states.
- **One class per state** (`theme-dim-light`, `theme-dim-dark`). This duplicates every dim value across two blocks and loses the free "which scheme" answer `dark-theme` already gives.
- **Palette-tinted dim surfaces.** Rejected by the operator: it multiplies the contrast measurement by six palettes.
- **Deriving dim inks at runtime with `color-mix()`.** Values would be unmeasured, and an ink cannot mix itself without a cycle.

## Consequences

- **Primary washes are accepted unmeasured.** The `--color-primary-NN` tints, `--filter-chip-bg` and `--search-input-bg` are decorative rather than text grounds; they were checked by screenshot only.
- **A new palette must join the `:not(.palette-1, …, .palette-6)` lists** in `palettes.css` § Dim-light inks. Otherwise it inherits palette 0's dim ink values. BRAND_GUIDELINES § Alternative Palette System says so.
- **The panel button shows the real state, not its click history.** Its label, `data-theme-state` and rotation are refreshed from the classes by the `<html>` class observer in `palette-manager.ts`. `data-theme-turns` only grows, so the delta always turns counter-clockwise, including after an outside jump such as a footer click.
- **Analytics are unchanged.** `trackThemeToggle` is still binary and fires only from the footer.
- **Revisit** if a third scheme is ever wanted (e.g. high contrast). Dim is a surface swap within a scheme, not a new scheme.
