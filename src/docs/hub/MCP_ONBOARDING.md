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

| clip                         | output   | aspect | duration | constraint                                                                      |
| ---------------------------- | -------- | ------ | -------- | ------------------------------------------------------------------------------- |
| `connector-enabled`          | 1000×952 | 1.05:1 | 5.1s     | comfortable at ~520px                                                           |
| `prompts-resources`          | 1000×780 | 1.28:1 | 6.0s     | comfortable at ~600px                                                           |
| `regulations-query`          | 1384×730 | 1.90:1 | 7.7s     | needs ≈870px display width — its text is ~0.6× the others' relative size        |
| `add-connector-claudeai`     | 960×880  | 1.09:1 | 11.7s    | comfortable at ~560px; the dialog text is the smallest in the set at that width |
| `oauth-consent`              | 800×1000 | 0.80:1 | 11.5s    | portrait; comfortable at ~520px, matching the still beneath it                  |
| `connector-enabled-claudeai` | 1200×760 | 1.58:1 | 6.5s     | three-level menu; comfortable at ~600px                                         |

1. **Six different aspect ratios** — the clips cannot share one fixed media slot.
2. **`regulations-query` legibility** — below ~780px it is unreadable, so under 768px the wide figure stops scaling and pans horizontally instead (`min-width: 780px` frame in an `overflow-x: auto` scroller, 720px under 480px — the shipped floors, chosen by the design against the ~870px comfort figure).
3. **Speed-edited clips disclose it visibly** — `regulations-query` runs 5× through the middle, where the real query took ~15s, and carries the wide variant's "Sped up 5×" badge so the page does not imply a response time the server does not deliver. `oauth-consent` runs at 2× (the raw is mostly the key being typed) and says so in its caption, because the collapsible variant has no badge. Either route is acceptable; silence is not.

## Media catalog

Every clip and still the guides embed. Naming: `<stem>-web.mp4` is the encode, `<stem>-poster.webp` its poster; `<stem>-still.webp` is a rendered still (neither an encode nor a poster companion). The client a clip was recorded in goes in the stem (`-claudeai`, `-desktop`), never in the suffix. Two exceptions: the three original 2026-08 clips predate that rule and keep their unsuffixed Desktop stems, and `oauth-consent` names no client because it spans claude.ai and a browser tab (the consent page is the same whichever client opened it).

| file                                 | producer                                 | shows                                                                                                                                                     | slot                                                   | status                  |
| ------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------- |
| `connector-enabled-web.mp4`          | operator recording (Claude Desktop)      | + menu → Connectors → `GST MCP` toggled on                                                                                                                | get-started § 03 Verify, row 1                         | shipped 2026-08-27      |
| `prompts-resources-web.mp4`          | operator recording (Claude Desktop)      | Add from GST MCP → prompt list → resource library                                                                                                         | get-started § 03 Verify, row 2                         | shipped (see Re-record) |
| `regulations-query-web.mp4`          | operator recording (Claude Desktop)      | a regulatory query, 5× through the middle                                                                                                                 | using § 01 First query                                 | shipped 2026-08-27      |
| `add-connector-claudeai-web.mp4`     | operator recording (claude.ai)           | + menu → Connectors → Add connector → Add custom connector → name `GST MCP` → paste the endpoint → Continue → the server checks run                       | get-started § 02 Quick Start, step 02                  | shipped 2026-09-04      |
| `oauth-consent-web.mp4`              | operator recording (claude.ai + browser) | the Authentication / OAuth client page → Add → "Connecting to GST MCP" → the consent tab, six scopes listed, key pasted, Approve → "Connected to GST MCP" | get-started § 02 Quick Start, step 03, above the still | shipped 2026-09-04 (2×) |
| `consent-page-still.webp`            | `npm run media:consent-still` (rendered) | the OAuth consent page with the six scopes Claude's connector requests, dark scheme, 2×, 1120×1578                                                        | get-started § 02 Quick Start, step 03, below the clip  | shipped 2026-09-04      |
| `connector-enabled-claudeai-web.mp4` | operator recording (claude.ai)           | + menu → Connectors → `GST MCP` toggled on → Add from GST MCP → the searchable prompt list                                                                | get-started § 03 Verify, row 1, below the Desktop clip | shipped 2026-09-04      |

**No Desktop add-connector clip, by decision (2026-09-04)**: the operator recorded the claude.ai flow and judged the Desktop dialog identical, so the one clip serves both clients and the page caption says so. Record a Desktop one only if the dialogs diverge.

## Re-record trigger

`prompts-resources-web.mp4` was recorded when the server registered **nine** prompts; the page copy (correctly) says **twelve**. The clip also shows the pre-em-dash-strip phrasing of the starter regulatory query. Both are accepted mismatches, reaffirmed 2026-09-04 when the claude.ai clips were recorded (the operator chose not to re-record it): re-record when Claude Desktop's UI or the prompt roster changes materially, and drop the replacement in under the **same filename** — no code change. Same rule for every other clip when the client UI drifts. The consent still is the exception: it is regenerated, not re-recorded (recipe below), and its scope list must be re-read from a fresh consent recording if Claude's request changes.

## Re-encode recipes

Sources, all in the gitignored `media-raw/` at the repo root (operator machine only — the raws are recordings of a live Claude session and are **not reproducible**; losing an output costs an ffmpeg re-run, losing a raw costs a re-record plus re-derivation of every timing below):

1. `GST_MCP_Claude_Connection_Verify.mp4` (1506×1170, 10.4s, Claude Desktop, 2026-08)
2. `GST_MCP_Claude_Regulations_First_Query.mp4` (1384×760, 18.4s, Claude Desktop, 2026-08)
3. `add-connector-claudeai.mp4` (1920×1080, 10.7s, claude.ai, 2026-09-04)
4. `connector-enabled-claudeai.mp4` (1566×978, 5.4s, claude.ai, 2026-09-04)
5. `oauth-consent-web.mp4` (1920×1080, 19.0s, claude.ai + browser tab, 2026-09-04)

- **connector-enabled** — from source 1: `-ss 0.25 -t 3.60`, `crop=980:934:0:232`, `tpad=stop_mode=clone:stop_duration=1.5`, then `scale=1000:952`. Poster at master `t=3.2`.
- **prompts-resources** — from source 1: `-ss 4.00 -t 6.00`, `crop=1006:784:490:112`, then `scale=1000:780`. Poster at master `t=1.6`.
- **regulations-query** — from source 2, variable-speed concat: `trim=0.8:2.9` at 1×, `trim=2.9:16.2` at 5× (`setpts=(PTS-STARTPTS)/5`), `trim=16.2:18.4` at 1×; then `crop=1384:730:0:0`, `fps=30`, `tpad=stop_mode=clone:stop_duration=0.7`. Native width, no scaling. Poster at `t=7.2`.
- **add-connector-claudeai** — from source 3, whole take at 1×: `crop=960:880:190:30` (the + menu and the dialog both sit inside it), `tpad=stop_mode=clone:stop_duration=1.0`. Native crop, no scaling (960×880). Poster at master `t=8.0` (name filled, URL field focused).
- **connector-enabled-claudeai** — from source 4, whole take at 1×: `crop=1546:978:20:0`, `scale=1200:760:flags=lanczos`, `tpad=stop_mode=clone:stop_duration=1.0`. Poster at master `t=4.5` (the prompt list open).
- **oauth-consent** — from source 5, four-segment concat to a common 800×1000 frame, at **2× throughout except the ending** (the raw is 19s, most of it the key being typed): `trim=0:6.6` (Authentication / OAuth client page, Add) and `trim=6.6:8.75` ("Connecting to GST MCP") both `crop=864:1080:278:0,scale=800:1000`; `trim=8.75:17.0` (the consent tab) `crop=800:1000:320:20`, native; `trim=17.0:18.9667` at 1× `crop=864:1080:900:0,scale=800:1000` (the right half of the chat, where the "Connected to GST MCP" toast lands). Then `tpad=stop_mode=clone:stop_duration=1.0`. The caption states the speed-up; the collapsible variant has no badge. Poster at master `t=14.0` (key pasted, Approve not yet clicked).
- **All**: `-an`. mp4 `libx264 -profile:v high -crf 30 -preset slow -pix_fmt yuv420p -movflags +faststart` at `fps=15`.
- **Posters**: WebP at quality 82 (`ffmpeg -i poster.png -q:v 82 poster.webp`), measured 82% smaller than PNG with no visible loss at full size against the smallest text in the set. Do not commit the intermediate PNGs.
- **consent-page-still** — not a recording: `npm run media:consent-still` (`scripts/render-consent-still.mjs`) bundles `mcp-server/src/oauth/consent.ts` with esbuild, drives the exported `handleAuthorizeGet` with a stub provider (client `Claude`, and the six scopes Claude's connector actually requested in the 2026-09-04 consent recording, pinned as ids in the script; the descriptions come from the server's scope catalog) and an in-memory KV, screenshots the HTML with Playwright chromium (560px viewport, full page, 2×, dark colour scheme to match the always-dark frame), and converts to WebP with the poster recipe above. No Worker source, deployed environment, or credential is involved. **Rendered on Windows**: the shell's mono stack resolves through `local('Consolas')`, so another OS renders a different face; treat the output as write-once and regenerate only when `html-shell.ts` or the consent copy changes. The 2026-09-03 render assumed an empty scope request; the recording the next day showed a list, so the still was re-rendered with it. If Claude's request changes again, update `AUTH_REQUEST.scope` in the script and re-render under the same filename.
- **WebM**: do not re-add — measured 12.6% larger in total than the mp4s while reaching no additional browser; the numbers live in ADR-0022 so the rejection stays checkable.

### GIF pass (deleted variants, recorded so the deletion is reversible)

Two-stage from the same master: ffmpeg `fps=$F,scale=$W:$H:flags=lanczos,split[a][b];[a]palettegen=max_colors=$C[p];[b][p]paletteuse=dither=bayer:bayer_scale=3` with `-loop 0`, then `gifsicle -O3 --lossy=60 --colors $C` for the `.min.gif`. Per clip: connector-enabled `fps=12` / `max_colors=128` / `scale=1000:952`; prompts-resources `fps=10` / `max_colors=64` / `scale=1000:780`; regulations-query `fps=10` / `max_colors=64` / native size.

- **Why the motion-heavy clips use lower settings** — the `.min.gif` is the shipping artifact. prompts-resources at `fps=12`/128 produced `1.20 MiB`; walking the levers gave `1.03 MiB` (fps 10) then **`0.90 MiB`** (fps 10 + 64 colours). regulations-query went `0.98 MiB` → **`0.67 MiB`** the same way. Scale was never reduced, because text legibility is the binding constraint. Do not "restore" the higher settings.
- **Both colour stages are real — the check that proves it.** The full-size `.gif` files declare a 256-entry global colour table even though `max_colors` was 128/64, because `palettegen` emits a 16×16 palette image and the muxer writes all 256 slots. Counting **distinct RGB triples** rather than slots settles it: the three full-size files held **127 / 64 / 64** distinct colours in those padded tables, which is stage 1 working. The `.min.gif` tables then read 128/64/64 because gifsicle rewrites them. Neither stage is redundant — do not "simplify" the recipe by dropping `max_colors`. If in doubt, count triples, not slots; slot count alone will mislead you.

### Tooling

Neither binary ships with the repo or the machine by default. ffmpeg via `winget install Gyan.FFmpeg`. gifsicle has no winget package; use `npx gifsicle` or a standalone install. **Do not `npm install gifsicle` in this repo** — it would dirty `package.json` and the lockfile with a binary-downloading dependency for a one-off task.
