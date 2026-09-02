# MCP Onboarding Pages & Screen-Capture Media

The three onboarding guides under `/hub/mcp/` — `get-started/`, `using/`, `advanced-operations/` — implement the 2026-08 design handoff for the GST MCP Server. This doc records what is not obvious from the pages themselves: the clip-player pattern (the site's first `<video>` usage), the per-clip constraints the media imposes, the reduced-motion rule nothing in CI checks, and the re-encode recipes for regenerating the media. The hosting decision (media in git, WebP posters, the rejected alternatives) is [ADR-0022](../adr/0022-mcp-onboarding-media-in-git.md).

**Drift guard**: published server facts on these pages (prompt count, sweep engine count, fill-ratio halt rule, every cited `gst_*`/tool name, hostnames, the em-dash prohibition) are pinned against `mcp-server` source by `tests/integration/mcp-onboarding-parity.test.ts`. Page shape and behavior are covered by `tests/e2e/hub-mcp-onboarding.test.ts`; all three routes are in the `accessibility.test.ts` scan.

## The clip player

Markup: `src/components/hub/mcp/ClipFigure.astro` (two variants — a collapsible `<details>` block and an always-visible wide figure). Behavior: `src/utils/mcp-onboarding.ts`, imported by each page's bundled script. The contract:

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

## Re-record trigger

`prompts-resources-web.mp4` was recorded when the server registered **nine** prompts; the page copy (correctly) says **twelve**. The clip also shows the pre-em-dash-strip phrasing of the starter regulatory query. Both are accepted mismatches: re-record when Claude Desktop's UI or the prompt roster changes materially, and drop the replacement in under the **same filename** — no code change. Same rule for the other two clips when the Desktop UI drifts.

## Re-encode recipes

Sources: `GST_MCP_Claude_Connection_Verify.mp4` (1506×1170, 10.4s) and `GST_MCP_Claude_Regulations_First_Query.mp4` (1384×760, 18.4s), both in the gitignored `media-raw/` at the repo root (operator machine only — the raws are recordings of a live Claude Desktop session and are **not reproducible**; losing an output costs an ffmpeg re-run, losing a raw costs a re-record plus re-derivation of every timing below).

- **connector-enabled** — from source 1: `-ss 0.25 -t 3.60`, `crop=980:934:0:232`, `tpad=stop_mode=clone:stop_duration=1.5`, then `scale=1000:952`. Poster at master `t=3.2`.
- **prompts-resources** — from source 1: `-ss 4.00 -t 6.00`, `crop=1006:784:490:112`, then `scale=1000:780`. Poster at master `t=1.6`.
- **regulations-query** — from source 2, variable-speed concat: `trim=0.8:2.9` at 1×, `trim=2.9:16.2` at 5× (`setpts=(PTS-STARTPTS)/5`), `trim=16.2:18.4` at 1×; then `crop=1384:730:0:0`, `fps=30`, `tpad=stop_mode=clone:stop_duration=0.7`. Native width, no scaling. Poster at `t=7.2`.
- **All**: `-an`. mp4 `libx264 -profile:v high -crf 30 -preset slow -pix_fmt yuv420p -movflags +faststart` at `fps=15`.
- **Posters**: WebP at quality 82 (`ffmpeg -i poster.png -q:v 82 poster.webp`), measured 82% smaller than PNG with no visible loss at full size against the smallest text in the set. Do not commit the intermediate PNGs.
- **WebM**: do not re-add — measured 12.6% larger in total than the mp4s while reaching no additional browser; the numbers live in ADR-0022 so the rejection stays checkable.

### GIF pass (deleted variants, recorded so the deletion is reversible)

Two-stage from the same master: ffmpeg `fps=$F,scale=$W:$H:flags=lanczos,split[a][b];[a]palettegen=max_colors=$C[p];[b][p]paletteuse=dither=bayer:bayer_scale=3` with `-loop 0`, then `gifsicle -O3 --lossy=60 --colors $C` for the `.min.gif`. Per clip: connector-enabled `fps=12` / `max_colors=128` / `scale=1000:952`; prompts-resources `fps=10` / `max_colors=64` / `scale=1000:780`; regulations-query `fps=10` / `max_colors=64` / native size.

- **Why the motion-heavy clips use lower settings** — the `.min.gif` is the shipping artifact. prompts-resources at `fps=12`/128 produced `1.20 MiB`; walking the levers gave `1.03 MiB` (fps 10) then **`0.90 MiB`** (fps 10 + 64 colours). regulations-query went `0.98 MiB` → **`0.67 MiB`** the same way. Scale was never reduced, because text legibility is the binding constraint. Do not "restore" the higher settings.
- **Both colour stages are real — the check that proves it.** The full-size `.gif` files declare a 256-entry global colour table even though `max_colors` was 128/64, because `palettegen` emits a 16×16 palette image and the muxer writes all 256 slots. Counting **distinct RGB triples** rather than slots settles it: the three full-size files held **127 / 64 / 64** distinct colours in those padded tables, which is stage 1 working. The `.min.gif` tables then read 128/64/64 because gifsicle rewrites them. Neither stage is redundant — do not "simplify" the recipe by dropping `max_colors`. If in doubt, count triples, not slots; slot count alone will mislead you.

### Tooling

Neither binary ships with the repo or the machine by default. ffmpeg via `winget install Gyan.FFmpeg`. gifsicle has no winget package; use `npx gifsicle` or a standalone install. **Do not `npm install gifsicle` in this repo** — it would dirty `package.json` and the lockfile with a binary-downloading dependency for a one-off task.
