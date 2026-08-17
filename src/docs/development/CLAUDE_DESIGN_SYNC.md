# Claude Design System Sync

How the GST design system is published to **claude.ai/design**, so the Claude Design
agent builds on-brand UI using GST's real tokens and class vocabulary.

**Project**: <https://claude.ai/design/p/660c7df6-e99f-4f47-b9f7-b1ab32e52969>
(the `projectId` is pinned in `.design-sync/config.json` — re-syncs find it automatically)

---

## What this is

Claude Design is a tool where users prompt an agent and it builds working UI. Out of the
box it designs with generic components. Syncing GST's design system means every design it
produces uses **our** tokens, our `.brutal-*` classes, our dark theme and palettes.

The sync is driven by the `/design-sync` skill (bundled with Claude Code, not in this
repo). This document is the repo-side record: what we publish, why it takes the shape it
does, and what to do when the design system changes.

## The shape of this sync, and why

The converter normally bundles a package's **React** components so the design agent can
import them. **GST has no React** — components are `.astro` files, there is no
`@astrojs/react` integration, and no compiled component package. So the standard path
does not apply here.

What we publish instead is two things:

1. **The CSS design system.** `src/styles/` flattened into one stylesheet — every token,
   `html.dark-theme`, all six `html.palette-N` blocks, and the full `.brutal-*` class
   vocabulary — plus four guideline docs from [`src/docs/styles/`](../styles/README.md).
2. **Eight specimen galleries.** React components that render GST _markup + classes_
   (`ButtonSpecimen`, `TypographySpecimen`, `CardSpecimen`, `DataSpecimen`,
   `FormSpecimen`, `FrostedSpecimen`, `ToolShellSpecimen`, `ColorSpecimen`). They give the
   project browsable preview cards and give the agent worked examples.

The design agent therefore writes its own JSX and styles it with our classes. It **cannot**
import `Header.astro` or any other real component.

### Two rules that are not negotiable

- **Never hand-write React versions of real `.astro` components.** A React `<Breadcrumb>`
  would drift from `Breadcrumb.astro` with nothing to catch it — exactly the failure
  [STYLES_GUIDE](../styles/STYLES_GUIDE.md) warns about ("a specimen that has drifted from
  production teaches the wrong thing"). The specimens are legitimate only because the
  classes they demonstrate have **no component behind them** (STYLES_GUIDE mechanism 3:
  writing the markup _is_ rendering the real thing).
- **Curate specimen markup from real sources**, never invent it. Ported from
  [`BrandComponents.astro`](../../components/brand/BrandComponents.astro),
  [`BrandUILibrary.astro`](../../components/brand/BrandUILibrary.astro), and
  [`src/pages/hub/library/index.astro`](../../pages/hub/library/index.astro). The gateway
  card was invented on the first pass and was wrong.

## When you must re-sync

| You changed                                        | Why it matters                                                                                                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any `.brutal-*` class name, or a BEM sub-element   | The uploaded docs name classes explicitly. A renamed class means the agent emits markup that resolves to nothing — **silently unstyled output**.               |
| A design token in `variables.css` / `palettes.css` | Same: tokens are enumerated by name in the conventions header.                                                                                                 |
| Split a new sheet out of `global.css`              | The `ROOTS` list in `.design-sync/build-css.mjs` is hand-maintained; a new sheet not added there stops shipping (CI catches it: `design-sync-guards.test.ts`). |
| Brand colors, typography scale, or the palettes    | The published system silently diverges from production.                                                                                                        |
| The four docs under `src/docs/styles/`             | They ship verbatim as guidelines.                                                                                                                              |

Nothing breaks loudly when this is skipped — the design system just quietly goes stale, so
treat a class rename as a re-sync trigger.

## How to re-sync

Invoke the `/design-sync` skill in Claude Code from the repo root. It reads
`.design-sync/config.json`, so the target project and all prior fixes are reused.

The underlying commands (what the skill runs):

```bash
node .design-sync/build-css.mjs                    # flatten src/styles/ → .cache/gst-styles.css
node .ds-sync/resync.mjs --config .design-sync/config.json \
  --node-modules ./.ds-sync/node_modules \
  --entry ./.design-sync/ds-entry.mjs --out ./ds-bundle \
  --remote .design-sync/.cache/remote-sync.json
```

`.ds-sync/` holds the skill's staged scripts and an isolated dep tree (including React,
which this repo does not otherwise have). Both `.ds-sync/` and `ds-bundle/` are gitignored
and regenerated — never commit them.

## What lives where (all committed)

| Path                              | Role                                                                                                                                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.design-sync/config.json`        | Converter config + the pinned `projectId`                                                                                                                                                          |
| `.design-sync/conventions.md`     | **The highest-value file.** Prepended to the uploaded README and inlined into the design agent's system prompt: the class vocabulary, token families, BEM sub-elements, layout and dark-mode rules |
| `.design-sync/specimens/*.tsx`    | The eight galleries — the markup, single-sourced                                                                                                                                                   |
| `.design-sync/specimen-docs/*.md` | Per-specimen `.prompt.md` content the agent reads                                                                                                                                                  |
| `.design-sync/previews/*.tsx`     | Thin card renderers                                                                                                                                                                                |
| `.design-sync/build-css.mjs`      | Flattens the stylesheet graph (see below)                                                                                                                                                          |
| `.design-sync/ds-entry.mjs`       | Zero-export bundle entry stub                                                                                                                                                                      |
| `.design-sync/dark-probe.mjs`     | Verifies dark mode still switches tokens                                                                                                                                                           |
| `.design-sync/palette-probe.mjs`  | Verifies the six palettes still re-point `--color-primary` and a painted element                                                                                                                   |
| `.design-sync/tsconfig.json`      | Type-check config for the specimens (`tsc -p .design-sync`, run by the guards test — the root tsconfig never sees dot-directories)                                                                 |
| `.design-sync/NOTES.md`           | Operational gotchas, hard-won findings, re-sync risks — **read before re-syncing**                                                                                                                 |

### Why the CSS is flattened

`cfg.cssEntry` is copied verbatim to the bundle root, so `global.css`'s
`@import './variables.css'` would dangle there — rendered designs receive only the
stylesheet's transitive import closure. `build-css.mjs` flattens the graph using the repo's
own lightningcss + browserslist targets, matching [astro.config.mjs](../../../astro.config.mjs),
so the published CSS is what production ships (including the `-webkit-backdrop-filter`
prefixes frosted glass depends on). It also bundles the four code-split sheets `global.css`
deliberately omits, and inlines root-absolute `url()` assets as data URIs.

## Verifying

- **Dark mode**: `node .design-sync/dark-probe.mjs` — toggles `html.dark-theme` on a real
  card and prints which tokens switch. Expected: `--text-primary`, `--bg-light`,
  `--bg-light-alt` and body color switch; `--color-primary` and `--border-light` do not
  (teal is theme-invariant; `--border-light` is a light-only token).
- **Palettes**: `node .design-sync/palette-probe.mjs` — applies `html.palette-0…5` to the
  same card and checks that `--color-primary` AND a painted element (the progress-bar
  fill) re-point under 1–5 and stay put under 0 (the default palette). Verified 2026-08-16:
  all six behave as expected against the shipped bundle.
- **Names — guarded in CI.** `tests/integration/design-sync-guards.test.ts` (part of
  `npm run test:docs`, a required check) asserts every class, BEM sub-element, modifier
  and token named in `conventions.md`, `specimen-docs/*.md` and `specimens/*.tsx` exists in
  `src/styles/**/*.css`; that the `ROOTS` list in `build-css.mjs` reaches every sheet under
  `src/styles/`; and that the specimens type-check (`tsc -p .design-sync`). The two
  intentional negatives the docs state (`.brutal-card`, `.brutal-hero`) sit in an
  allowlist that fails when it goes stale. The skill's own name check still runs at sync
  time; the vitest is what fires between syncs.
- **The real test**: prompt the design agent for something GST-shaped and check the output
  uses teal accents, `.brutal-*` classes, and `var(--spacing-*)` rather than pixel values.

### Known limits

- **Dark-mode preview cards are not buildable.** The converter's card scaffold hardcodes
  `body{background:#fff}`, and the tokens resolve only at `:root` — a nested
  `color-scheme: dark` flips nothing. Dark mode is verified by the probe instead.
- **What the published system does not cover** — see [BL-135](BACKLOG.md#bl-135-claude-design-sync--correct-it-guard-it-and-publish-the-design-system-rather-than-its-content-level-subset):
  the class vocabulary conventions.md teaches is a subset of `src/styles` (Slice 2 widens
  it), and the site chrome (`Header`, `Hero`, `Footer`, section cards) lives in
  Astro-scoped `<style>` blocks that never reach the bundle — the agent cannot reproduce
  it from the CSS alone (Slice 3 publishes it by extraction from the built `/brand` page).
- **`/brand` remains the human-browsable surface** for the design system; the Design
  project exists to steer the agent, not to replace [`/brand`](../../pages/brand.astro).

---

<- Back to [Development Documentation](./README.md) | [Master Documentation Index](../README.md)

_Last Updated: August 16, 2026 (initial sync — tokens + 8 specimen galleries; BL-135 Slice 1 — defects fixed, CI guards, palettes verified)_
