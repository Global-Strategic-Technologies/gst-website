# design-sync notes — GST Website

Repo-specific gotchas for syncing this repo to claude.ai/design. Read before re-syncing.

## What this sync is

GST has **no React**. Components are 45 `.astro` files; there is no `@astrojs/react`
(or preact/svelte/vue/solid), no `.tsx`/`.jsx` under `src/`, and no compiled component
package. The converter builds `_ds_bundle.js` from React exports, so **none of the
`.astro` components can be imported** — see the "Scope" note in the skill's
`non-storybook/SKILL.md`.

What ships instead, in two parts:

1. **The CSS design system** — tokens, typography, palettes, and the full `.brutal-*`
   class vocabulary, flattened into `_ds_bundle.css`, plus four styling guideline docs.
2. **Eight specimen galleries** (`ButtonSpecimen`, `TypographySpecimen`, `CardSpecimen`,
   `DataSpecimen`, `FormSpecimen`, `FrostedSpecimen`, `ToolShellSpecimen`,
   `ColorSpecimen`) — React components that render GST _markup + classes_, giving the
   project browsable preview cards.

**The specimens are documentation, not UI components.** They are legitimate under
STYLES_GUIDE mechanism 3: these classes have no `.astro` component behind them, so
writing the markup _is_ rendering the real thing. **Never** hand-write React versions of
actual `.astro` components (`Breadcrumb`, `StatsBar`, `CTABox`, …) — that is the
reimplementation the skill forbids, and STYLES_GUIDE's own drift argument applies
("a specimen that has drifted from production teaches the wrong thing").

## How the build is wired (non-obvious bits)

- **`.design-sync/ds-entry.mjs`** is a zero-export stub. It makes the converter take a
  deterministic path instead of synthesizing an entry from `src/` (the synth walker
  matches `/\.(tsx|jsx|mdx?)$/` and would sweep in every `.md` under `src/docs/`).
- **`.design-sync/build-css.mjs`** flattens the stylesheet graph into
  `.design-sync/.cache/gst-styles.css`, which `cfg.cssEntry` points at. **Required, not
  cosmetic**: `cssEntry` is copied verbatim to `_ds_bundle.css` at the bundle root, so
  `global.css`'s `@import './variables.css'` would dangle there (designs receive only
  `styles.css`'s transitive closure). It uses the repo's own lightningcss + browserslist
  targets, matching `astro.config.mjs` — keep it that way or the shipped CSS stops
  matching production (notably the `-webkit-backdrop-filter` prefixes frosted glass needs).
- It also bundles the four **code-split** sheets `global.css` deliberately does NOT import
  (`filter`, `portfolio`, `map`, `progress`) plus `toc.css`, and **inlines root-absolute
  `url()` refs as data URIs** from `public/` (a `mask-image` that 404s hides its element).
- **The React the bundle vendors comes from `.ds-sync/node_modules`.** `lib/emit.mjs`'s
  `vendorReact()` hard throws without it. Hence `--node-modules ./.ds-sync/node_modules`.
  Do not add `react` to the repo's `package.json` (a `react@19` does sit transitively in
  the root `node_modules` via `@vercel/analytics`/`partysocket` — undeclared, so never rely
  on it). `@types/react` IS a declared devDependency: it exists only so
  `tsc -p .design-sync` (run by `tests/integration/design-sync-guards.test.ts`) can
  type-check the specimens — the root tsconfig's `**/*` never descends into
  dot-directories, so `astro check` does not see them.
- **Specimens reach `window.GST` via `cfg.extraEntries`** (`.design-sync/specimens/index.tsx`)
  AND are listed in `cfg.componentSrcMap`. Both are needed — see the gate below.
- **`cfg.docsDir` → `.design-sync/specimen-docs/`** supplies each specimen's `.prompt.md`.
  Without it the converter synthesizes one saying _"Use via `window.GST.ButtonSpecimen`"_,
  which invites the design agent to render a gallery row into a real design. Every doc
  opens by telling the agent NOT to import the specimen and gives copyable markup instead.

### The exact commands

```sh
node .design-sync/build-css.mjs
node .ds-sync/resync.mjs --config .design-sync/config.json \
  --node-modules ./.ds-sync/node_modules \
  --entry ./.design-sync/ds-entry.mjs --out ./ds-bundle \
  --remote .design-sync/.cache/remote-sync.json
```

## Hard-won findings (don't rediscover these)

- **`[BUNDLE_EXPORT]` is a hard gate.** `componentSrcMap` + an authored preview is NOT
  enough to ship a card: validate exits 1 with _"not a component on window.GST"_. A card
  requires a genuine bundle export. That is the entire reason `extraEntries` exists here.
  (The preview itself renders fine without the export — the gate is what blocks it.)
- **Grades go in `<Name>.grade.json`, not `<Name>.json`.** In
  `.design-sync/.cache/review/`, `<Name>.json` is machine-owned capture bookkeeping and is
  overwritten on every capture; `<Name>.grade.json` holds your verdicts. Writing verdicts
  into the wrong file silently yields "0 carried forward" on the next run.
- **A scoped `package-capture.mjs --components X` prunes the other review sheets.** Re-run
  it unscoped before grading a full set.
- **Specimen edits need a full `package-build.mjs`**, not `preview-rebuild.mjs` — the
  markup lives in the bundle (via `extraEntries`), and preview-rebuild only regenerates
  card HTML.
- **`[DTS_REACT] @types/react not found`** is benign: the `.d.ts` parse scans the repo root,
  not `.ds-sync/node_modules`. Specimens take no props, so nothing is lost.
- Playwright: the repo pins `playwright-core` 1.62.1 → chromium build **1234**, which was
  already in the local cache. No 200MB install was needed.

## Known render warns (expected — not new)

- None outstanding. The final run was `render check: 8/8 previews render cleanly`,
  `validate ✓ bundle is complete`, `8 carried forward / 0 captured / 0 errors`.

## Re-syncing from a fresh clone (what it costs)

Everything authored is committed; everything machine-owned is gitignored. On a new machine:

- `.ds-sync/` (the skill's staged scripts + isolated deps incl. React) is re-staged by the
  `/design-sync` skill; `ds-bundle/` is rebuilt by `package-build`.
- `.design-sync/.cache/remote-sync.json` holds only content hashes, so a fresh clone does a
  **full re-upload** rather than an incremental one — nothing is lost (the `projectId` is in
  `config.json`), it just takes longer.
- `.design-sync/.cache/review/*.grade.json` (the "8 carried forward" human verdicts) is
  also gone, so the capture/grade step runs from scratch — **re-grade all eight**.
- `dark-probe.mjs` and `palette-probe.mjs` need `ds-bundle/` — run them only after a full
  `package-build`; both exit non-zero with a pointer here if it is missing.

## Re-sync risks (what can silently go stale)

- **`conventions.md` and the eight `specimen-docs/*.md` enumerate real class and token
  names.** CSS refactors rot them silently — the agent trusts these names and will emit
  unstyled markup for any that disappear. **This is now guarded in CI** (BL-135):
  `tests/integration/design-sync-guards.test.ts` under `npm run test:docs` asserts every
  `` `.class` ``/`__sub`/`--mod`/`--token` in `conventions.md`, `specimen-docs/*.md` and
  `specimens/*.tsx` exists in `src/styles/**/*.css`; the two intentional negatives
  (`.brutal-card`, `.brutal-hero`) live in its `INTENTIONAL_NEGATIVES` allowlist, which
  fails if either ever comes into existence or stops being mentioned. The skill's own
  bundle-side check still runs at sync time. Real catches so far: there is **no bare
  `.brutal-card`**, **no bare `.brutal-hero`** (only `__title`/`__description`/`__trustline`),
  the segmented control's child is **`__btn` not `__option`**, a field's label is
  **`.brutal-field__label`, not `.brutal-label-small`**, and its input is
  **`.brutal-field__input`, not `.brutal-input`** (D2 in the BL-135 audit — the guard could
  not catch that one because both classes exist; it was caught by diffing against the
  `/brand` source, which is why "curate from the real consumer" below is the rule).
- **The README header has a hard size ceiling.** The converter prepends `conventions.md`
  to the uploaded README precisely because the consumer truncates the README inline at
  **32,000 characters, cutting the TAIL** (skill `lib/emit.mjs`, `emitReadme`). The
  header is ~13 KB today. If it outgrows the ceiling, move the overflow into a shipped
  guideline doc under `guidelinesGlob` rather than letting the tail (the boilerplate) or,
  worse, the end of the header be cut.
- **Specimen markup was ported from real sources** — `BrandComponents.astro`,
  `BrandUILibrary.astro`, and `src/pages/hub/library/index.astro` for the gateway card.
  If those change materially, re-port. The gateway card was _invented_ on the first pass
  and was wrong (used `.brutal-btn` and heading classes instead of the BEM sub-elements
  and `cta-button brutal-gateway-card__cta`); curate from the real consumer, don't invent.
- **The `ROOTS` list in `build-css.mjs` is hand-maintained — and guarded.** If someone splits a
  new sheet out of `global.css` (its top comment tracks these), add it there or its classes stop
  shipping; `design-sync-guards.test.ts` fails `test:docs` when any sheet under `src/styles/`
  is unreachable from ROOTS, so the omission is caught in CI rather than in a design.
- **Dark theme is VERIFIED (by measurement, not by a card).** Run
  `node .design-sync/dark-probe.mjs` — it opens a real card, toggles `html.dark-theme`,
  and prints which tokens switch. Current result: 4/7 switch (`--text-primary`,
  `--bg-light`, `--bg-light-alt`, body color); `--color-primary` and `--border-light`
  correctly do not (teal is theme-invariant, and `--border-light` is a light-only token).
  `body { background-color: var(--bg-light) }` IS in the shipped bundle, so designs the
  agent builds do go dark correctly.
  - **Dark-mode preview cards are not buildable**, for two independent reasons: the
    converter's card scaffold hardcodes `body{background:#fff}`, and the tokens resolve
    only at `:root` — a nested `color-scheme: dark` or `.dark-theme` flips nothing
    (probed and confirmed). Getting a dark card would mean forking `lib/emit.mjs`, which
    the skill forbids. Don't burn time re-attempting this; re-run the probe instead.
- **The six palettes are VERIFIED (by measurement).** Run `node .design-sync/palette-probe.mjs`
  — it applies `html.palette-0…5` to a real card and checks `--color-primary` plus a painted
  element (`.brutal-progress-bar__fill`). Result 2026-08-16: palette-0 (the default) leaves
  the primary at `#05cd99` as designed; 1–5 re-point both the token and the fill
  (`#1e40af`, `#7c3aed`, `#b45309`, `#059669`, `#166534`). Same root-only constraint as dark
  theme applies — the class must sit on `<html>`.
- **Specimen misuse remains the standing risk.** Every `.prompt.md` says not to import the
  specimen, but the converter's auto-generated first line still says
  "Use via `window.GST.<Name>`". If designs start showing gallery rows, that line is why —
  the fix is stronger doc copy, not removing the exports (the `[BUNDLE_EXPORT]` gate needs them).
- The four `guidelinesGlob` docs ship **verbatim** and contain repo-internal references
  (test paths, BL-### ids, `/brand` URLs). Acceptable context, but they leave the repo.
