# MCP Onboarding Pages & Screen-Capture Media

The three onboarding guides under `/hub/mcp/` — `get-started/`, `using/`, `advanced-operations/` — implement the 2026-08 design handoff for the GST MCP Server. This doc records what is not obvious from the pages themselves: the clip-player pattern (the site's first `<video>` usage), the per-clip constraints the media imposes, the reduced-motion rule nothing in CI checks, and the re-encode recipes for regenerating the media. The hosting decision (media in git, WebP posters, the rejected alternatives) is [ADR-0022](../adr/0022-mcp-onboarding-media-in-git.md).

**Drift guard**: published server facts on these pages (prompt count, sweep engine count, fill-ratio halt rule, every cited `gst_*`/tool name, hostnames, the em-dash prohibition) are pinned against `mcp-server` source by `tests/integration/mcp-onboarding-parity.test.ts`. Page shape and behavior are covered by `tests/e2e/hub-mcp-onboarding.test.ts`; all three routes are in the `accessibility.test.ts` scan.

## The clip player

Markup: `src/components/hub/mcp/ClipFigure.astro` (three variants — a collapsible `<details>` block, an always-visible wide figure, and a `still`: the collapsible frame around a lazy `<img>` for a screen rendered from source rather than recorded; it carries `data-still-details` instead of `data-clip`, so none of the clip behavior below applies and the image itself is the reduced-motion state). Behavior: `src/utils/mcp-onboarding.ts`, imported by each page's bundled script. The contract:

- **Lazy source attach** — `<video data-clip>` ships with no `<source>` children; sources attach from `data-mp4`/`data-webm`/`data-poster` when the clip nears the viewport (IntersectionObserver, 600px margin) or when its wrapping `<details>` opens. `preload="none"` until then.
- **Autoplay muted loop** while ≥35% visible and the tab is foreground; paused off-view and on hidden tabs. A Pause/Play overlay button carries the state in its accessible name (no `aria-pressed` — one state signal).
- **`prefers-reduced-motion: reduce`** — no autoplay, no loop, native controls; **the poster is the reduced-motion state**. This is why each clip has a poster and why a poster may be dropped **only** once that clip's reduced-motion state is satisfied some other way (a shared still, a first-frame extraction, a static alternative block). Nothing in CI checks this — it is enforced only by this paragraph.
- **Error fallback** — a failed load hides the overlay and hands the element native controls.
- Same-origin video requires `media-src 'self'` in the CSP (both `vercel.json` strings + `src/middleware.ts`); without it the poster loads (`img-src`) while playback silently fails.

## Per-clip constraints

None of these are visible in the files themselves:

| clip                | output   | aspect | duration | constraint                                                               |
| ------------------- | -------- | ------ | -------- | ------------------------------------------------------------------------ |
| `connector-enabled` | 1000×952 | 1.05:1 | 5.1s     | comfortable at ~520px                                                    |
| `prompts-resources` | 1000×780 | 1.28:1 | 6.0s     | comfortable at ~600px                                                    |
| `regulations-query` | 1384×730 | 1.90:1 | 7.7s     | needs ≈870px display width — its text is ~0.6× the others' relative size |

1. **Three different aspect ratios** — the clips cannot share one fixed media slot.
2. **`regulations-query` legibility** — below ~780px it is unreadable, so under 768px the wide figure stops scaling and pans horizontally instead (`min-width: 780px` frame in an `overflow-x: auto` scroller, 720px under 480px — the shipped floors, chosen by the design against the ~870px comfort figure).
3. **`regulations-query` is speed-edited** — 5× through the middle, where the real query took ~15s. It carries a mandatory visible "Sped up 5×" badge so the page does not imply a response time the server does not deliver.

## Media catalog

Every clip and still the guides embed, plus the ones the pages are written around but that do not exist yet. Naming: `<stem>-web.mp4` is the encode, `<stem>-poster.webp` its poster; `<stem>-still.webp` is a rendered still (neither an encode nor a poster companion). The client a clip was recorded in goes in the stem (`-claudeai`, `-desktop`), never in the suffix.

| file                                | producer                                 | shows                                                                                                                 | slot                                               | status                   |
| ----------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------ |
| `connector-enabled-web.mp4`         | operator recording (Claude Desktop)      | + menu → Connectors → `GST MCP` toggled on                                                                            | get-started § 03 Verify, row 1                     | shipped 2026-08-27       |
| `prompts-resources-web.mp4`         | operator recording (Claude Desktop)      | Add from GST MCP → prompt list → resource library                                                                     | get-started § 03 Verify, row 2                     | shipped (re-record owed) |
| `regulations-query-web.mp4`         | operator recording (Claude Desktop)      | a regulatory query, 5× through the middle                                                                             | using § 01 First query                             | shipped 2026-08-27       |
| `consent-page-still.webp`           | `npm run media:consent-still` (rendered) | the OAuth consent page, empty scope request, dark scheme, 2×, 1120×1030                                               | get-started § 02 Quick Start, step 03              | shipped 2026-09-03       |
| `add-connector-claudeai-web.mp4`    | operator recording (claude.ai)           | Settings → Connectors → Add custom connector → paste the endpoint → name it `GST MCP` → Add                           | get-started § 02 Quick Start, step 02              | **owed** (BL-152)        |
| `add-connector-desktop-web.mp4`     | operator recording (Claude Desktop)      | the same actions in Desktop; keep only one of the two if the dialogs prove identical                                  | get-started § 02 Quick Start, step 02, below       | **owed** (BL-152)        |
| `oauth-consent-web.mp4`             | operator recording (browser)             | the tab opening on the consent page, the key paste (a password field, nothing to mask), Approve, the return to Claude | get-started § 02 Quick Start, step 03, above still | **owed** (BL-152)        |
| `connector-enabled-desktop-web.mp4` | operator recording (Claude Desktop)      | optional: only if Desktop's + → Connectors menu differs visibly from the shipped verify clip                          | get-started § 03 Verify, row 1                     | optional (BL-152)        |

### Recording briefs for the owed clips

Common to all three: 15 fps, `-an`, the libx264 recipe below, 6–8 s, cropped to the dialog or tab so the smallest text stays legible at the slot's `maxWidth`; poster from a frame where the key UI element is fully drawn. Target aspects: the add-connector dialogs ≈4:3 (slot `maxWidth="560px"`), the consent tab ≈1.1:1 (slot `maxWidth="520px"`, matching the still it sits above). Each poster is the clip's reduced-motion state, so it must exist.

When a file lands: put the pair in `public/images/hub/mcp/`, paste the snippet into the slot named above, fill `{W}`/`{H}` from the encode, and bump `clips` for Get Started in `tests/e2e/hub-mcp-onboarding.test.ts` (the count is pinned). No other code changes.

```astro
<ClipFigure
  variant="collapsible"
  mp4="/images/hub/mcp/add-connector-claudeai-web.mp4"
  poster="/images/hub/mcp/add-connector-claudeai-poster.webp"
  width={W}
  height={H}
  maxWidth="560px"
  summary="See it on claude.ai"
  ariaLabel="Screen capture: Settings opens on Connectors, Add custom connector is chosen, the GST endpoint is pasted, the connector is named GST MCP and added"
  caption="Screen capture: adding the custom connector on claude.ai"
/>
<ClipFigure
  variant="collapsible"
  mp4="/images/hub/mcp/add-connector-desktop-web.mp4"
  poster="/images/hub/mcp/add-connector-desktop-poster.webp"
  width={W}
  height={H}
  maxWidth="560px"
  summary="See it in Claude Desktop"
  ariaLabel="Screen capture: the same connector dialog in Claude Desktop, from Settings through Add"
  caption="Screen capture: adding the custom connector in Claude Desktop"
/>
<ClipFigure
  variant="collapsible"
  mp4="/images/hub/mcp/oauth-consent-web.mp4"
  poster="/images/hub/mcp/oauth-consent-poster.webp"
  width={W}
  height={H}
  maxWidth="520px"
  summary="See the consent round trip"
  ariaLabel="Screen capture: a browser tab opens on the GST consent page, the MCP key is pasted into the password field, Approve is clicked, and Claude shows the connector connected"
  caption="Screen capture: approving at the consent page and returning to Claude"
/>
```

## Re-record trigger

`prompts-resources-web.mp4` was recorded when the server registered **nine** prompts; the page copy (correctly) says **twelve**. The clip also shows the pre-em-dash-strip phrasing of the starter regulatory query. Both are accepted mismatches: re-record when Claude Desktop's UI or the prompt roster changes materially, and drop the replacement in under the **same filename** — no code change. Same rule for the other two clips when the Desktop UI drifts.

## Re-encode recipes

Sources: `GST_MCP_Claude_Connection_Verify.mp4` (1506×1170, 10.4s) and `GST_MCP_Claude_Regulations_First_Query.mp4` (1384×760, 18.4s), both in the gitignored `media-raw/` at the repo root (operator machine only — the raws are recordings of a live Claude Desktop session and are **not reproducible**; losing an output costs an ffmpeg re-run, losing a raw costs a re-record plus re-derivation of every timing below).

- **connector-enabled** — from source 1: `-ss 0.25 -t 3.60`, `crop=980:934:0:232`, `tpad=stop_mode=clone:stop_duration=1.5`, then `scale=1000:952`. Poster at master `t=3.2`.
- **prompts-resources** — from source 1: `-ss 4.00 -t 6.00`, `crop=1006:784:490:112`, then `scale=1000:780`. Poster at master `t=1.6`.
- **regulations-query** — from source 2, variable-speed concat: `trim=0.8:2.9` at 1×, `trim=2.9:16.2` at 5× (`setpts=(PTS-STARTPTS)/5`), `trim=16.2:18.4` at 1×; then `crop=1384:730:0:0`, `fps=30`, `tpad=stop_mode=clone:stop_duration=0.7`. Native width, no scaling. Poster at `t=7.2`.
- **All**: `-an`. mp4 `libx264 -profile:v high -crf 30 -preset slow -pix_fmt yuv420p -movflags +faststart` at `fps=15`.
- **Posters**: WebP at quality 82 (`ffmpeg -i poster.png -q:v 82 poster.webp`), measured 82% smaller than PNG with no visible loss at full size against the smallest text in the set. Do not commit the intermediate PNGs.
- **consent-page-still** — not a recording: `npm run media:consent-still` (`scripts/render-consent-still.mjs`) bundles `mcp-server/src/oauth/consent.ts` with esbuild, drives the exported `handleAuthorizeGet` with a stub provider (client `Claude`, empty scope request, so the page renders its "your key's full scope set" branch) and an in-memory KV, screenshots the HTML with Playwright chromium (560px viewport, full page, 2×, dark colour scheme to match the always-dark frame), and converts to WebP with the poster recipe above. No Worker source, deployed environment, or credential is involved. **Rendered on Windows**: the shell's mono stack resolves through `local('Consolas')`, so another OS renders a different face; treat the output as write-once and regenerate only when `html-shell.ts` or the consent copy changes. If a real consent ever shows a scope list, set it in the script's `AUTH_REQUEST.scope` and re-render under the same filename.
- **WebM**: do not re-add — measured 12.6% larger in total than the mp4s while reaching no additional browser; the numbers live in ADR-0022 so the rejection stays checkable.

### GIF pass (deleted variants, recorded so the deletion is reversible)

Two-stage from the same master: ffmpeg `fps=$F,scale=$W:$H:flags=lanczos,split[a][b];[a]palettegen=max_colors=$C[p];[b][p]paletteuse=dither=bayer:bayer_scale=3` with `-loop 0`, then `gifsicle -O3 --lossy=60 --colors $C` for the `.min.gif`. Per clip: connector-enabled `fps=12` / `max_colors=128` / `scale=1000:952`; prompts-resources `fps=10` / `max_colors=64` / `scale=1000:780`; regulations-query `fps=10` / `max_colors=64` / native size.

- **Why the motion-heavy clips use lower settings** — the `.min.gif` is the shipping artifact. prompts-resources at `fps=12`/128 produced `1.20 MiB`; walking the levers gave `1.03 MiB` (fps 10) then **`0.90 MiB`** (fps 10 + 64 colours). regulations-query went `0.98 MiB` → **`0.67 MiB`** the same way. Scale was never reduced, because text legibility is the binding constraint. Do not "restore" the higher settings.
- **Both colour stages are real — the check that proves it.** The full-size `.gif` files declare a 256-entry global colour table even though `max_colors` was 128/64, because `palettegen` emits a 16×16 palette image and the muxer writes all 256 slots. Counting **distinct RGB triples** rather than slots settles it: the three full-size files held **127 / 64 / 64** distinct colours in those padded tables, which is stage 1 working. The `.min.gif` tables then read 128/64/64 because gifsicle rewrites them. Neither stage is redundant — do not "simplify" the recipe by dropping `max_colors`. If in doubt, count triples, not slots; slot count alone will mislead you.

### Tooling

Neither binary ships with the repo or the machine by default. ffmpeg via `winget install Gyan.FFmpeg`. gifsicle has no winget package; use `npx gifsicle` or a standalone install. **Do not `npm install gifsicle` in this repo** — it would dirty `package.json` and the lockfile with a binary-downloading dependency for a one-off task.
