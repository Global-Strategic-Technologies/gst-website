# design-sync notes — GST Website

Repo-specific gotchas for syncing this repo to claude.ai/design. Read before re-syncing.

## What this sync is

GST has **no React**. Components are `.astro` files throughout; there is no `@astrojs/react`
(or preact/svelte/vue/solid), no `.tsx`/`.jsx` under `src/`, and no compiled component
package. The converter builds `_ds_bundle.js` from React exports, so **none of the
`.astro` components can be imported** — see the "Scope" note in the skill's
`non-storybook/SKILL.md`.

What ships instead, in three parts:

1. **The CSS design system** — tokens, typography, palettes, and the full `.brutal-*`
   class vocabulary, flattened into `_ds_bundle.css`, plus four styling guideline docs.
2. **Ten specimen galleries** (`ButtonSpecimen`, `TypographySpecimen`, `CardSpecimen`,
   `DataSpecimen`, `FormSpecimen`, `FrostedSpecimen`, `ToolShellSpecimen`,
   `ToolChromeSpecimen`, `NavigationSpecimen`, `ColorSpecimen`) — React components that
   render GST _markup + classes_, giving the project browsable preview cards.
3. **The site chrome, extracted from the production build** (`extract-chrome.mjs`, BL-135
   Slice 3) — 19 static cards under `components/chrome/` sliced from `dist/client/**`:
   the real Header/Hero/sections/CTA/Footer (+ dark twins), Breadcrumb, StatsBar,
   EngagementFlow, the hub tools landing, TOC. Markup **is** production output; nothing is
   hand-authored. `/brand` is not a source (replicas — STYLES_GUIDE mechanism 2/3).

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
- **It also emits `.cache/gst-fonts.css`, which is `cfg.extraFonts`' input** — the pinned
  brand face (BL-144) ships through the converter's own font path, NOT through `cssEntry`.
  See the `[FONT_MISSING]` finding below for why it cannot ride in the flattened sheet.
  The file is derived from `src/styles/fonts.css` on every run (url()s re-pointed at
  `public/` relative to `.cache/`), so a re-cut of the font needs no edit here.
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

### The exact commands (in this order — it matters)

```sh
npm run build                                  # extract-chrome slices dist/client/
node .design-sync/build-css.mjs
node .ds-sync/resync.mjs --config .design-sync/config.json \
  --node-modules ./.ds-sync/node_modules \
  --entry ./.design-sync/ds-entry.mjs --out ./ds-bundle \
  --remote .design-sync/.cache/remote-sync.json
node .design-sync/extract-chrome.mjs --check   # AFTER resync — package-build wipes ds-bundle/
node .design-sync/font-probe.mjs               # AFTER extract-chrome — it probes a chrome card
```

Then the upload: `finalize_plan` writes must include `components/chrome/*/*` in addition
to the specimen paths (the resync verdict cannot list them — see below), then `write_files`
the lot. **Never re-run `package-validate.mjs` after extraction**: it counts `.html` under
`components/` against `componentCount` (the specimens) and the chrome cards make that a
harmless, expected mismatch. The extractor runs its own equivalents (marker line, link
resolution, non-empty slice, ≥1 scoped rule per cid-bearing slice, and with `--check` a
Playwright render using the validator's floors — height ≥ 8px, png ≥ 5000 bytes — plus
`--bg-light` resolving to `#0a0a0a` on every dark twin).

## Hard-won findings (don't rediscover these)

- **The pinned face cannot ship through `cssEntry` — it must go through `cfg.extraFonts`.**
  Found 2026-08-29, the first sync after BL-144 pinned `--font-family-mono` to a self-hosted
  `GST Mono`. `cfg.cssEntry` becomes `_ds_bundle.css`, and the converter REWRITES that file's
  `@font-face` blocks (`lib/css.mjs` `rewriteBundleFontFaces`), dropping any whose `src` it
  judges unresolvable — correct in general, because a dead face declared after
  `fonts/fonts.css` would shadow the working one. Ours was dropped **either way**: a bare
  `/fonts/…` url genuinely is unresolvable there, and the data URI `inlineRootUrls`
  substitutes trips a quote-backtracking bug in the drop test
  (`url\(\s*['"]?(?!…data:…)` — the optional quote matches ZERO width, so the lookahead
  reads `"data:` and the negative lookahead passes). Either path left `GST Mono` referenced
  but undeclared and validate printed `[FONT_MISSING]`; designs would have rendered in the
  metric-matched fallbacks. **The fix is config, not a lib fork**: `build-css.mjs` emits
  `.cache/gst-fonts.css` and `cfg.extraFonts` points at it, so extractFonts copies the woff2
  into `fonts/`, rewrites the url to `./<name>`, and writes `fonts/fonts.css` — which
  `styles.css` imports BEFORE `_ds_bundle.css`, so it reaches designs and is never shadowed.
  `_ds_bundle.css` still logs `1 dead @font-face block(s) dropped` on every run: that is the
  now-redundant copy being removed, and it is expected, not a regression.
- **Measuring the font through `var(--font-family-mono)` proves NOTHING.** The fallbacks are
  metric-matched on purpose, so Consolas at `size-adjust: 109.1%` sets 599.84px where the
  pinned face sets 600.00 — indistinguishable at any sane tolerance. Mutation-proven on
  2026-08-29: with the woff2 deleted from `ds-bundle/fonts/`, the token still measured
  599.84px. The discriminating probe names `'GST Mono'` with **nothing behind it**, so a face
  that failed to load collapses to the browser default (611.19px measured). `font-probe.mjs`
  does that, on both surfaces.
- **Chrome cards resolve the face from TWO sources, so isolate before concluding.** Each card
  links `../../../styles.css` AND carries its own inlined `@font-face` blocks (three of them).
  Corrupting the inlined data URI still measured 600.00px because the shared stylesheet
  covered for it — the probe was re-testing the design surface while claiming to test
  extract-chrome's pipeline. `font-probe.mjs` now `route.abort()`s `**/styles.css` on the
  chrome page; with that block in place the same mutation correctly fails. Both arms are
  mutation-proven — don't weaken either without re-proving it.
- **`GST Mono Fallback error` in probe output is benign on Windows.** That face is
  `local('Menlo'), local('DejaVu Sans Mono')`; neither is installed here or in the Playwright
  engines, so it legitimately fails to load. `GST Mono Fallback WD` (Consolas) loads. Nothing
  to chase — it is the same gap TYPOGRAPHY_REFERENCE records as needing a Mac to close.
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
- **The bundle root ships `_ds_needs_recompile`, and the upload deletes nothing.** The
  build emits `_ds_needs_recompile` (`{"by":"design-sync-cli"}`) and does NOT emit
  `_ds_manifest.json` or `_adherence.oxlintrc.json`, both of which exist on the remote.
  They are compiled PRODUCT-SIDE from the uploaded files — CLAUDE_DESIGN_SYNC.md § Known
  limits says the manifest "cannot be checked from the repo", and the adherence config
  appears nowhere in this repo at all. So the marker is what asks the app to regenerate
  them: upload it, and pass an EMPTY `deletes` set. Deleting the two as orphans would
  remove artifacts this repo neither owns nor can rebuild. Confirmed on the 2026-08-18
  sync: 101 files written, both app-side files still present afterwards.
- **`_ds_sync.json` matching the remote proves NOTHING about the README.** `auxShaFor()`
  (`.ds-sync/lib/sync-hashes.mjs`) hashes `README.md` and `guidelines/` from the LOCAL
  output directory and writes that digest into the sidecar, which is then uploaded. So a
  remote sidecar that matches local is your own hash echoed back — not a server-side hash
  over the stored file. `sourceHashes` cannot cover the gap either: every key there is
  `components/specimens/*`. Worse, the failure is self-perpetuating —
  `remote-diff.mjs:211` sets `upload.aux` from `remote.auxSha !== local.auxSha`, so a
  README that landed wrong beside a sidecar that landed right is never re-uploaded. **The
  only way to confirm the README is `get_file` on it.** Done on the 2026-08-18 sync, and
  it earned its keep: it caught a sentence still pointing the sash at the `SiteHeader`
  chrome card, which is exactly what the same commit proved impossible.
- **A specimen edit does NOT show up as `changed` in the verification partition — because
  in this repo the card's markup lives in the BUNDLE.** Found 2026-08-30. `sourceKeys`
  (the verification identity) hash the authored preview under `.design-sync/previews/`,
  which is only the mount composition; the markup a specimen card actually displays comes
  from `.design-sync/specimens/*.tsx` compiled into `_ds_bundle.js` via `cfg.extraEntries`.
  The skill's design treats bundle churn as never invalidating grades — correct for a
  normal DS, where the bundle is upstream `dist/` and the card content is the authored
  preview. Here the relationship is inverted, so the rule silently protects the wrong
  thing. Concretely: commit `5957c21c` rewrote two rows of `CardSpecimen.tsx` (dropping a
  double-applied `.brutal-frosted` from the FAQ items) and the driver still reported
  `CardSpecimen` **unchanged**, `renderChurned: []`, and skipped capture entirely
  (`empty_worklist`) — while `bundleSha12` moved, which is where the change really was.
  **So on any re-sync whose commits touched `.design-sync/specimens/`, do not let
  "0 changed" stand in for visual verification**: diff `git log <last-sync>..HEAD --
.design-sync/specimens/` and look at the affected card's fresh
  `_screenshots/specimens__<Name>.png` (the render-check screenshot IS regenerated every
  run, unlike the `_screenshots/review/` sheets, which a carried-forward capture leaves
  stale). Done for `CardSpecimen` on 2026-08-30 — renders complete and correctly
  single-frosted, grade holds. The same gap covers pure CSS changes: `styleChanged: true`
  never enters the verification partition either.
- **The upload set is 103 files, and the two exclusions are deliberate.** (101 before
  2026-08-29; the two added are `fonts/fonts.css` and the pinned woff2 — which first
  actually REACHED the remote on the SECOND 2026-08-29 session. The first session
  verified the build and wrote this bullet, but its upload never ran; see the
  upload-silence risk below.) Everything under
  `ds-bundle/` except the 8 root dotfiles (local telemetry — `.resync-verdict.json`,
  `.sync-diff.json`, `.render-check.json`, `.review.html`, …) and `_screenshots/` (32
  render proofs). The verdict's `upload.components` block lists only specimens, so the
  `finalize_plan` write set must add `components/chrome/*/*` by hand or the 19 chrome
  cards silently never ship.

## Known render warns (expected — not new)

- None outstanding. The latest run (2026-08-29) was `render check: 10/10 previews render
cleanly`, `validate ✓ bundle is complete` with **zero** warnings, `10 verified-by-upload
/ 0 changed / 0 new`; `extract-chrome.mjs --check` 19/19 with zero page errors;
  `font-probe.mjs` PASS on both surfaces; dark 4/7, all six palettes as expected.
- `[FONT_MISSING] "GST Mono"` fired on that run's FIRST driver pass and was **resolved, not
  tolerated** (the `cfg.extraFonts` finding above). If it reappears, the font stopped
  shipping — do not record it as known.
- The second 2026-08-29 session re-ran the whole pipeline from a clean tree and reproduced
  that result exactly — `10/10 render cleanly`, `validate ✓`, zero warnings, `10
verified-by-upload / 0 changed / 0 new`, chrome 19/19, `font-probe` PASS on both
  surfaces (600.00px vs 549.81px control), dark 4/7, all six palettes. Its only real work
  was the upload the first session never performed.
- **2026-08-30 reproduced it again on the post-frost tree, and UPLOADED (confirmed).**
  Same clean result across the board (`10/10 render cleanly`, `validate ✓`, zero warnings,
  chrome 19/19, `font-probe` PASS both surfaces at 600.00px vs 549.81px, dark 4/7, all six
  palettes, capture `10 carried forward / 0 cleared`). 103 files written, 0 deletes;
  post-upload `list_files` shows 105 = our 103 plus the two app-side files
  (`_ds_manifest.json`, `_adherence.oxlintrc.json`), and the remote anchor now reads
  `styleSha de30af52…` / `bundleSha12 920f57047564` / `auxSha f44e69da…`. The README was
  re-fetched and carries the header including today's frost paragraph.
  - **Worth knowing for next time: `finalize_plan` was denied on the first attempt by the
    HARNESS, not the user** — the session started in "don't ask" permission mode, where
    the approval prompt cannot be raised at all. The failure is loud (an explicit denial
    message), unlike the 2026-08-29 non-interactive case, and the fix is entirely
    client-side: the user switches to accept-edits/default mode and the same plan goes
    through. Everything built before the denial stayed valid — no rebuild was needed, only
    a re-fetch of the sidecar to confirm nothing had moved.
- **2026-08-31 reproduced it again and UPLOADED (confirmed).** Same clean result
  (`10/10 render cleanly`, `validate ✓`, zero warnings, chrome 19/19, `font-probe` PASS
  both surfaces at 600.00px vs 549.81px, dark 4/7, all six palettes, `10
verified-by-upload / 0 changed / 0 new`). 103 files written, 0 deletes; post-upload
  `list_files` shows 105 = our 103 plus the two app-side files. Remote anchor now
  `styleSha de30af52…` (UNCHANGED — see below) / `bundleSha12 920f57047564` /
  `auxSha 75ee39e4…`. README re-fetched: header intact, generated body not truncated.
  The real content delta was outside the anchor's reach on both counts — two guideline
  docs (`STYLES_GUIDE`, `VARIABLES_REFERENCE`) and the `HubToolsLanding` chrome slice,
  which picked up the new IRL Extractor card and the `HubHeader` spacing fix.

## The remote-sync cache is written by hand, and silently rots

`--remote .design-sync/.cache/remote-sync.json` is a LOCAL file the driver reads; nothing
in the pipeline refreshes it after an upload. On 2026-08-31 it still held the **2026-08-16**
sidecar (`styleSha 50cd2a28…`), two syncs behind, so the driver reported `styleChanged:
true` and a phantom `upload.components: ["CardSpecimen"]` against a remote that in fact
matched local on every hash but `auxSha`. Harmless here — it only over-uploads — but it
burns a debugging cycle every time, and it is indistinguishable from a real style change.

**So: after a confirmed upload, `cp ds-bundle/_ds_sync.json
.design-sync/.cache/remote-sync.json`.** Done for this run. And when the driver reports
`styleChanged`, confirm it against `get_file _ds_sync.json` before believing it — the
cache is a guess, the remote sidecar is the fact. (`.cache/` is gitignored, so a fresh
clone has no cache at all and correctly does a full re-upload.)

## Re-syncing from a fresh clone (what it costs)

Everything authored is committed; everything machine-owned is gitignored. On a new machine:

- `.ds-sync/` (the skill's staged scripts + isolated deps incl. React) is re-staged by the
  `/design-sync` skill; `ds-bundle/` is rebuilt by `package-build`.
- `.design-sync/.cache/remote-sync.json` holds only content hashes, so a fresh clone does a
  **full re-upload** rather than an incremental one — nothing is lost (the `projectId` is in
  `config.json`), it just takes longer.
- `.design-sync/.cache/review/*.grade.json` (the "8 carried forward" human verdicts) is
  also gone, so the capture/grade step runs from scratch — **re-grade all ten**.
- `dark-probe.mjs` and `palette-probe.mjs` need `ds-bundle/` — run them only after a full
  `package-build`; both exit non-zero with a pointer here if it is missing. `font-probe.mjs`
  needs it too, and its chrome arm additionally needs `extract-chrome.mjs` to have run (it
  reports that arm as unbuilt rather than failing, so read its output, not just its exit code).

## Re-sync risks (what can silently go stale)

- **A sync that verifies everything and then never uploads leaves NO trace — check the
  remote file list, not this file.** Found 2026-08-29 (second session): the first session
  did the full BL-144 font work, went green on every probe, wrote its findings here as
  though shipped — and its upload never ran. Nothing detects that afterwards. The local
  `ds-bundle/` is correct, `_ds_sync.json` on disk is correct, the driver reports
  `10 verified-by-upload`, and the REMOTE anchor is untouched, so it agrees with itself
  at the OLD value; `.cache/remote-sync.json` matching the remote proves only that the
  fetch worked. The tell was structural and took one read-only call: `list_files` showed
  **no `fonts/` directory at all** and 101 repo-owned files where the local build makes 103. So on every re-sync, **diff the remote path list against `find ds-bundle -type f`
  before trusting any verdict** — a whole missing directory is the signature, because
  `upload.styling`/`bundle`/`aux` are booleans over hashes and cannot tell "not uploaded
  yet" from "uploaded and stale". Corollary: **never write "uploaded/shipped" into this
  file until a post-upload `list_files` has confirmed it** — a premature note is worse
  than no note, since the next session reads it as done and skips the only step that
  mattered. (Related: the anchor already can't see the README or the chrome cards; this
  is the third and widest blind spot.)

  **Why that first upload never ran — recorded by the session it happened in, since the
  second session could only see the hole, not its cause.** It was NOT a denied
  `finalize_plan`: that call was never reached. Every `DesignSync` method, starting with
  the opening `get_project`, failed with _"DesignSync needs design-system authorization,
  and /design-login cannot run in this non-interactive session"_ — the VS Code extension
  session reports as non-interactive, and `/design-login` is unavailable there, so the
  authorization could not be obtained from inside it at all. The session did the whole
  build and verification (that work is what commit `9aa71a16` carries) and told the user
  plainly, twice, that the upload had not happened. **What it got wrong was this file**:
  it updated the upload-set bullet to 103 as though the number described something
  shipped. So the guard above is the right one, but note the shape of the real failure —
  it was loud in the transcript and silent in the durable record, not silent everywhere.
  Practically: a session that cannot authorize should write the build-and-verified state
  here **explicitly marked unshipped**, and hand the upload to a session that can.

- **After editing `conventions.md`, grep the WHOLE file for the family you touched — do
  not review the hunk.** The uploaded README is read as one document by the agent, and a
  family is usually described in three or four places (token bullet, class-families
  bullet, BEM line, a rule, sometimes a worked example). Adding one and leaving another
  stale produces a document that contradicts itself, which no diff shows and which is
  worse than either sentence alone: a reader who checks the wrong one discards the rest.
  This is not hypothetical — the 2026-08-18 sash pass shipped exactly that, a bullet still
  saying "real markup is in the `SiteHeader` chrome card" while a new section 173 lines
  and seven headings later (lines 88 and 261) explained why that slice structurally cannot
  contain it. The DISTANCE is the argument for the rule: a contradiction three paragraphs
  apart would plausibly be caught by rereading the section, which makes the grep look
  optional; 173 lines apart in a 20,000-character document, a whole-file grep is the only
  thing that finds it. It survived FOUR
  review rounds, all of them reading diffs, and was found only by reading the published
  README end to end. `grep -n "<family>" .design-sync/conventions.md` is the whole check.

- **`conventions.md` and the ten `specimen-docs/*.md` enumerate real class and token
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
- **conventions.md uses bullet lists, not tables, for the big enumerations — on purpose.**
  Prettier pads markdown table cells to the widest cell in the column; with a 400-char
  dataviz cell in the token table the header hit 31.8 KB (see the ceiling below). The
  same content as lists is 16 KB. Do not convert them back to tables.
- **Chrome cards are outside `_ds_sync.json`, so nothing detects remote↔local
  divergence for them.** `remote-diff` derives everything from `sourceHashes`, which
  covers only bundle components; the chrome dirs are never listed as changed, never
  deleted, never flagged. If a re-sync skips the manual chrome upload, the remote keeps the
  previous slices with no signal. The upload step is part of the re-sync, not polish. A
  renamed landmark/selector in source is caught earlier: `design-sync-guards.test.ts`
  guard 4 asserts every `SLICES` entry resolves to `.astro` source, and the extractor
  itself exits 1 naming the selector.
- **The README header has a hard size ceiling.** The converter prepends `conventions.md`
  to the uploaded README precisely because the consumer truncates the README inline at
  **32,000 characters, cutting the TAIL** (skill `lib/emit.mjs`, `emitReadme`). The
  header **no longer has comfortable headroom** — it grew past 26k during August 2026 and
  now sits within a few hundred characters of guard 5's 28,000 limit, so the next
  substantive addition is the one that trips CI. Treat "add a section to conventions.md"
  as "and move something out". Read the exact figure off the guard rather than from here,
  since a prose edit moves it and a hand-kept number in this file has already gone stale
  twice:
  `node -e "console.log(require('fs').readFileSync('.design-sync/conventions.md','utf-8').length)"`.
  `design-sync-guards.test.ts` guard 5 fails `test:docs` at 28,000 chars. Measure it in
  CHARACTERS, not bytes — the guard does, and the two differ once the prose carries
  non-ASCII. If it outgrows that, move the overflow into a shipped guideline doc under
  `guidelinesGlob` rather than raising the number and letting the tail (the boilerplate) or,
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
- **The pinned typeface is a silent-staleness surface, and is VERIFIED (by measurement).**
  Run `node .design-sync/font-probe.mjs` after `extract-chrome.mjs`. Result 2026-08-29:
  600.00px for ten characters at 100px on BOTH surfaces — the design closure (`styles.css`
  alone) and a chrome card with the shared sheet blocked — against 549.81px for the generic
  control. Nothing else catches this: the face reaches designs through two independent
  pipelines (`cfg.extraFonts` → `fonts/fonts.css` for the bundle; `inlineRootUrls` from
  `dist/client/` for the chrome cards), neither is covered by `_ds_sync.json`, and a bundle
  that has lost the font still validates clean **and still looks plausible on the contact
  sheet**, because the metric-matched fallbacks occupy the same box by design. A re-cut that
  renames the woff2, a ROOTS change that drops `fonts.css`, or an upstream fix to the
  drop-test bug (which would make `_ds_bundle.css` re-declare the family after
  `fonts/fonts.css`) all land here first.
- **Dark theme is VERIFIED (by measurement, not by a card).** Run
  `node .design-sync/dark-probe.mjs` — it opens a real card, toggles `html.dark-theme`,
  and prints which tokens switch. Current result: 4/7 switch (`--text-primary`,
  `--bg-light`, `--bg-light-alt`, body color); `--color-primary` and `--border-light`
  correctly do not (teal is theme-invariant, and `--border-light` is a light-only token).
  `body { background-color: var(--bg-light) }` IS in the shipped bundle, so designs the
  agent builds do go dark correctly.
  - **Dark-mode _converter_ cards are not buildable**, for two independent reasons: the
    converter's card scaffold hardcodes `body{background:#fff}`, and the tokens resolve
    only at `:root` — a nested `color-scheme: dark` or `.dark-theme` flips nothing
    (probed and confirmed). Getting a dark specimen card would mean forking `lib/emit.mjs`,
    which the skill forbids. Don't burn time re-attempting this; re-run the probe instead.
    **The chrome cards are different**: their scaffold is ours, and the class sits on the
    card's own root `<html>` — both reasons answered — so seven ship as dark twins, verified
    by `extract-chrome.mjs --check` (`--bg-light` → `#0a0a0a`).
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

## Sync 2026-09-02 — ADR-0028 spacing tokens (tokens + docs only, no specimen change)

- **Every addition is invisible to the name-parity guard, and a new CLASS is the worst case —
  not a new token.** Guard 1 in `design-sync-guards.test.ts` resolves docs→src only, so nothing
  ever fails for a thing that exists in `src/styles` but is missing from the published
  vocabulary. Tokens have a backstop that classes do not: `docs-variables-sync.test.ts` asserts
  bidirectionally (":291 — every `:root` token is documented in VARIABLES_REFERENCE.md"), and
  that file is one of the four uploaded guidelines, so CI drags a new token onto a shipped
  surface. Nothing forces a new `.brutal-*` class or BEM modifier into `conventions.md` at all.
  Neither forces the UPLOAD. If you are here after adding a class, you have less coverage than
  this sync had, not more.
- **Resync verdict: all ten specimens `unchanged`, zero components in the upload list** — the
  correct result for a tokens-and-prose change, not a skipped upload. What moved was
  `styling: true` (the flattened bundle) and `aux: true` (README + the four guideline docs).
  An empty `components` array is still a real upload. ("Unchanged" is the diff stage's verdict
  keyed on `sourceKeys`; do not describe it as a hash comparison — the artifacts do not say.)
- **THREE chrome cards changed, and the verdict could not show any of them** — `SiteFooter`,
  `SiteFooterDark` (`--spacing-1_25`, from `Footer.astro:17,67` and `FooterLinks.astro:162`)
  and `StatsBar` (`--spacing-1_75`, from `StatsBar.astro:170`). Both new tokens reached the
  bundle. This is the concrete case the standing rule ("the `finalize_plan` write set must
  include `components/chrome/*/*`") exists for: nothing tracks those files, so no verdict can
  list them, and reading the verdict alone ships a stale footer and a stale StatsBar.
- **Upload the FULL 103-file set. Do not scope writes to what changed** — I did, and it was
  wrong. The first pass here uploaded 48 paths (the styling/aux files plus all 19 chrome cards)
  and skipped 55 as "unchanged": the ten specimens ×4, the ten `_preview/*.js`, the two
  `_vendor` files, the font pair and `_ds_needs_recompile`. Nothing went stale — specimen HTML
  LINKS `styles.css` and `_ds_bundle.css` rather than inlining them, and `_preview/*.js` carry
  no token text — but the skill is explicit that this is luck, not method:
  `.ds-sync/storybook/SKILL.md:279` ("Writes — everything, always … an under-scoped writes list
  silently and permanently desyncs the project") and `:335` ("never scope writes by the
  verification partition"), and `lib/remote-diff.mjs:31-37` says the `components` array is NOT
  a write scope. The remaining 55 were uploaded immediately after, so the project holds the
  full set — but the correct plan is the one-line glob list from SKILL.md:279, first time.
  Note especially `fonts/` in that list: Guard 6 records that the pinned face reaches designs
  only via `cfg.extraFonts` and fails invisibly when lost.
- Verified after upload rather than assumed: re-read
  `guidelines/src/docs/styles/VARIABLES_REFERENCE.md` off the REMOTE and confirmed both new
  rows sit in the Spacing Scale table at the right ladder positions.
- **Probe scope, so a future run compares like with like.** `extract-chrome --check` is the
  broad one: 19/19 cards, each asserted for height, a byte floor, zero page errors, and a dark
  twin whose background differs from its light sibling. `dark-probe` and `palette-probe` are
  **single-card** — both hardcode `DataSpecimen.html`. `dark-probe` read 4/7 switched; the three
  that did not are `--border-light` and `--color-primary` (both correct — VARIABLES_REFERENCE
  documents them as deliberately not theme-switched) and `_bodyBg`, a RENDERED proxy, expected
  to stay put because the converter's card scaffold hardcodes `body{background:#fff}` in a
  `<style>` that FOLLOWS both stylesheet links — reason one of the two under "Dark-mode
  converter cards are not buildable" above. The card's tokens themselves do switch; the
  root-only reason is NOT why, since the probe puts `.dark-theme` on `documentElement` and four
  values moved. `palette-probe`: all six as expected, on that one card.
- **Run the probes from the repo root — this is intrinsic, not a papercut.** Both resolve a bare
  relative `ds-bundle/...` against `process.cwd()`. A leftover `cd ds-bundle` earlier in a
  session makes them fail with `MODULE_NOT_FOUND` on a path under `ds-bundle/.design-sync/`,
  which reads like a broken probe. `palette-probe` already had a header comment and an
  `existsSync` guard that exits with a clear message; `dark-probe` did not, and now does.
