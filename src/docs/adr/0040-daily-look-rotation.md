# ADR-0040: The site's look rotates daily — palette by weekday, theme by week of the month

- **Status**: Accepted (2026-09-25)
- **Source initiative**: operator directive 2026-09-25, shipped alongside ambient motion's public default ([ADR-0039](0039-ambient-motion-is-a-per-browser-design-setting.md) § Amendment) on `feat/opus-5-bl-035`

## Context

The site had seven palettes (`src/data/palettes.ts`, ids 0–6) and four theme states ([ADR-0038](0038-four-state-theme-dim-light-dim-dark.md)), but visitors only ever saw palette 0 in light theme. The alternatives existed for stakeholder review and were documented as "not deployed to production". A visitor's own pick, made in the palette panel or with the footer toggle, was stored in `localStorage` and kept forever.

The operator asked for the look to change on its own, from day to day:

- **Palette by day of the week**, Monday = 0 through Sunday = 6. Seven palettes fill exactly seven days.
- **Theme by week of the month**, week 1 lightest to week 4 darkest.

The site is static (Vercel, prerendered HTML), so the look can only be chosen in the browser, before first paint, in BaseLayout's inline head script. That script already applied the stored theme and palette.

## Decision

**The rotation.** With no pick for today, the pre-paint script computes the look from the visitor's **local** date:

| Day of month | Theme     | State (ADR-0038) |
| ------------ | --------- | ---------------- |
| 1–7          | light     | 0                |
| 8–14         | dim light | 1                |
| 15–21        | dim dark  | 2                |
| 22 to end    | dark      | 3                |

- The palette is `DAY_TO_PALETTE[(getDay() + 6) % 7]`.
- The theme is `min(3, floor((date − 1) / 7))`. The fourth bucket absorbs days 29–31, so no month has a fifth. The operator chose this split over wrapping days 29–31 back to light, or using calendar weeks.
- The logic lives in [`src/scripts/daily-look.ts`](../../scripts/daily-look.ts). BaseLayout's inline copy is run against that module in `tests/unit/daily-look.test.ts`, over every weekday, every bucket, both ends of the month, midnight either side, and storage that throws.

**The visitor's local clock.** Monday is Monday wherever the visitor is, and nothing server-side is involved.

**A pick holds until local midnight, per dimension.**

- The three writers store a date stamp beside the value, through `rememberChoice()`:
  - palette tabs (`palette-manager.ts` `switchPalette`);
  - the panel's theme button (`handleThemeToggle`);
  - the footer toggle (`ThemeToggle.astro`).
- The keys are `palette` + `palette-date` and `theme` + `theme-date`, with the stamp as local `YYYY-MM-DD`.
- A stored value counts only when its stamp is today and the value is valid. Palette `'0'` stamped today holds, even on a day that rotates to another palette.
- The two dimensions are independent. Picking a theme leaves the palette on the rotation, which matches the two separate controls.
- Values stored before this shipped carry no stamp, so they read as expired and every visitor starts on the rotation. No migration exists.

**No switch at midnight.** An open tab keeps its look, and the next page load applies the new day.

**Colour edits are tied to their palette.** Palette-panel colour edits (`palette-overrides`) were re-applied before paint whatever the palette. The palette now changes between visits without a click, so:

- edits are tagged with the palette they were made on (`palette-overrides-palette`);
- the head script applies them only while that palette is on screen;
- `palette-manager.ts` clears a mismatched or untagged set on load.

**Rejected:**

- **`prefers-color-scheme`.** The operator wants the calendar to choose, not the OS. The site never followed the OS setting, even before this.
- **One combined stored object** (`{palette, theme, date}`). It couples the two dimensions, and it breaks every existing reader and test that sets `localStorage.theme` directly.
- **A server-side or UTC rotation.** The site is prerendered HTML, and a fixed zone would turn Monday into Sunday for half the world.
- **Deriving the weekday map from `palettes.length`.** An 8th palette would silently reshuffle every day. The map is a pinned seven-entry array, and adding a palette is a decision about its day.
- **Keeping picks forever,** the old behaviour. The operator chose picks that last until midnight, so the rotation stays visible to everyone, the operator included.

## Consequences

- **Every palette reaches visitors in every theme.** The accessibility suite now scans palettes 1–6 in all four themes on `/`, `/services/`, TechPar and `/brand/`, with zero serious violations allowed. This replaces the palette-6-only block. Palette 0 is scanned in all four themes by the existing blocks. The first run found two real failures, both fixed:
  - **Blaze's text-safe orange** (`--alt4-color-tertiary`, #b84a00) measured 4.46:1 on its tag chip in light and 3.81–4.38:1 on the dim-light surfaces. The operator chose one orange for the palette's light-side themes: #a34200, which is 4.58:1 at worst. Dark and dim dark keep the bright orange, which passes there. `ink-token-contrast.test.ts` now measures every palette's tertiary on every theme's surfaces; no test covered it before.
  - **The sash ink** lifted with `--bg-dark` to #1c1c1c in dim dark. That dropped the band's 85%-opacity detail text to 3.98:1 on palette 2's red. The ink sits on the band, not the page, so dim pins `--sash-ink` to #0a0a0a. A test measures the detail text on every palette's band.
- **Brand-colour text in palettes 1–5 is visitor-facing.**
  - Their primaries measure 2.87–3.80:1 as text on white and 2.63–3.48:1 on #f5f5f5. On the dim-light surfaces they measure 2.41–3.19:1 on #ebebeb and 2.09–2.77:1 on #dcdcdc.
  - As with teal, primary-coloured text is accepted below AA, down to a 1.5:1 legibility floor. The source is the scan helper (`tests/e2e/helpers/a11y.ts`, `exemptBrandTealText`), which follows the live `--color-primary` of whichever palette is on screen. Palette 6's neon set the precedent for alternative palettes. [ADR-0035](0035-ink-tokens-for-text-on-light-surfaces.md) § 1 itself rules only on brand teal.
- **Colour edits and the rotation.**
  - The first deploy clears every visitor's existing colour edits, the operator's included, because none carries a tag.
  - Tagged edits come back when their palette's weekday comes round again, but only if the site wasn't opened in between. Any load on another palette's day clears them. This is harmless.
- **E2E runs from a fixed look.** The visitor default now depends on the run date. `playwright.config.ts` sets a baseline `storageState`: palette 0 and light, both stamped today, with ambient motion off. It covers both the 4321 and 4325 origins, and a canary spec fails if it ever doesn't land. The rotation itself is tested in `tests/e2e/daily-look.test.ts` with a pinned clock and time zone. A run that crosses local midnight falls back to the rotation (TEST_BEST_PRACTICES § 29).
- **Lighthouse CI scores can vary slightly by weekday**, since its fresh profile gets the rotated look. CLS, the one failing assertion, is unaffected by colour.
- **Code that cites this ADR:**
  - `src/scripts/daily-look.ts`, `src/scripts/theme-state.ts`
  - the inline look and colour-edit blocks in `src/layouts/BaseLayout.astro`
  - `src/scripts/palette-manager.ts`, `src/components/ThemeToggle.astro`
  - `src/styles/palettes.css` (Blaze tertiary), `src/styles/variables.css` (dim sash ink)
  - `tests/e2e/helpers/storage-baseline.ts`
- **Docs:**
  - [BRAND_GUIDELINES.md § Alternative Palette System](../styles/BRAND_GUIDELINES.md#alternative-palette-system) and its "Picks, colour edits and the rotation" subsection
  - ADR-0038 § Consequences
- **Revisit when:**
  - **An 8th palette is added.** `tests/unit/daily-look.test.ts` fails until `DAY_TO_PALETTE` gives it a place. Decide whether to extend the cycle beyond seven days, or keep the palette panel-only.
  - **Visitors ask to keep their pick.** Picks lasting until midnight were a choice. Making them permanent means dropping the date check, not the rotation.
