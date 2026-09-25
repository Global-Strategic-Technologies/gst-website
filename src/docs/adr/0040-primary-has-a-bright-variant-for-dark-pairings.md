# ADR-0040: The primary has a bright variant for pairings with dark

- **Status**: Accepted (2026-09-25)
- **Source initiative**: palette 6 "Phosphor" (added on the BL-035 branch). No design doc; the decision and its measurements live here.

## Context

`--color-primary` does two jobs that pull in opposite directions:

- **Foreground on light surfaces.** Text, delta icons, focus rings, borders and standalone indicators: about 350 declarations across the site. Text needs 4.5:1 against `#f5f5f5`; icons and indicators need 3:1.
- **Paired with dark.** A fill under dark ink (`--bg-dark` on `.cta-button`, `.skip-nav`, `.control-active`, the announcement sash), text on the always-dark language band, and the ambient glows. Dark ink needs a _light_ colour under it.

Brand teal gets away with one colour for both because ADR-0035 § 1 exempts it as text (2.06:1 on white). Palette 6's bright green cannot. The owner asked for its green to be compliant as text, and one green cannot do both jobs:

| Green            | On `#f5f5f5` | `#0a0a0a` on it |
| ---------------- | ------------ | --------------- |
| `#1fd65f` (neon) | 1.78         | 10.22           |
| `#0b7a35`        | 5.00         | 3.63            |

A green light enough for dark ink is too light for text, and one dark enough for text is too dark for dark ink. No value clears 4.5:1 both ways.

## Decision

Add **`--color-primary-bright`** (plus `--color-primary-bright-dark` for hover): **the primary wherever it pairs with a dark colour**, and nothing else. The three cases:

1. a fill under dark ink (`--bg-dark`, `--text-light-primary`, `--sash-ink`), together with the border that frames that fill;
2. text or icons on a constant-dark surface (`--bg-dark` in both themes);
3. decorative glows that carry no information: the ambient layers.

Everything else stays `--color-primary`: text, icons, focus rings, borders, standalone dots, bars and scrollbar thumbs on light surfaces, fills that carry _light_ text (white on a text-safe green passes), token specimens, and every TypeScript colour emitter (none pairs primary with dark ink). `--sash-bg` becomes `--color-primary-bright`.

Both tokens default to the primary in `variables.css`, so palettes 0–5 render exactly as before. Palette 6 sets:

|                               | Light     | Dim light   | Dark           |
| ----------------------------- | --------- | ----------- | -------------- |
| `--color-primary`             | `#097030` | `#065f27`   | `#39ff6e`      |
| `--color-primary-dark`        | `#07632a` | `#055724`   | `#2ef062`      |
| `--color-primary-bright`      | `#1fd65f` | (unchanged) | = primary      |
| `--color-primary-bright-dark` | `#17c255` | (unchanged) | = primary-dark |

The light primary is `#097030`, not the first candidate `#0b7a35`. The worst backdrop its text meets is the primary button's 25% neon hover tint (`buttons.css`). There `#0b7a35` measured 4.23; `#097030` measures 4.83 over `#f5f5f5` and 5.17 over white, and 5.71 on `#f5f5f5` itself. In dark theme one neon does both jobs, as teal does.

Palette 6 keeps the **neon** `--color-primary-rgb` triplet. It feeds background tints, and a neon tint is lighter than the text-safe green's own tint, so text over it keeps more contrast.

**Rejected:**

- **A primary text token** (`--color-primary-ink`, with every foreground use switched to it). It moves about 350 declarations instead of about 20. It would also give brand teal an ink that ADR-0035 § 1 ruled against, and it would break that ADR's "primary has no ink" guard.
- **Choosing by CSS property** ("every background uses the bright token"). The first draft of this decision did that. It picked the failing green in four places: fills with white text, where white on neon is 1.94. It also made standalone indicators neon, 1.94 against white, below the 3:1 non-text bar. The rule is about what the colour is _paired with_, not which property sets it.
- **A middle green at about 3.4:1.** It passes for large text, icons and focus rings but not small text, so it is only partly compliant.

## Consequences

- **Guarded by:**
  - `tests/integration/primary-pairing-guard.test.ts`, which catches a primary fill under dark ink, primary text on a `--bg-dark` surface, and a primary border framing a bright fill. It covers inline styles and has one accepted pairing: `.brutal-interactive:focus-visible`, whose border is the focus ring. It reads one rule at a time; a fill whose ink is set in another rule, as in `StatsBar.astro`, is checked by reading the site when it changes.
  - `tests/integration/ink-token-contrast.test.ts` ("palette 6 two greens"), which holds the light primary to the ink bars and the hover tint, the dim values to the dim bars, dark ink on both bright fills, and the default mapping.
  - `tests/e2e/accessibility.test.ts`, which scans palette 6 in light and dim light with the teal exemption off.
  - `tests/e2e/announcement-sash.test.ts` and `hover-ink-invariance.test.ts`, which cover palette 6.
- **Cited by:** `src/styles/variables.css`, `src/styles/palettes.css`, `src/styles/interactions.css`, `src/styles/components/lang-band.css`, `src/styles/components/sash.css`, `src/page-templates/HubMcpTrialPage.astro`.
- **Amends ADR-0035's authoring rule.** "Fills keep the base token" now reads: fills keep the base token unless they sit under dark ink, in which case they use `--color-primary-bright`.
- **Palettes 1–5 are unchanged by decision.** As text on white their primaries measure 2.87–3.80 (teal, palette 0, is 2.06 and exempt). That is the current state of those palettes. Applying the split to any of them means giving it a text-safe primary and a bright one, as palette 6 has.
- **Adding a palette:** one whose light-theme primary is too dark for dark ink sets `--altN-color-primary-bright` (and `-bright-dark`), maps both in its `html.palette-N` block, and, if its _bright_ primary is itself dark, re-points `--sash-ink` (`palettes.css` § Announcement sash ink).
- **Revisit if** a design needs primary text on a surface that is dark only in light theme. The rule's case 2 assumes the surface is dark in both themes.
