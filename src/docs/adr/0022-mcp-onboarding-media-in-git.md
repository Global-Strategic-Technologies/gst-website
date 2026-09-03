# ADR-0022: The MCP onboarding screen-capture media lives in git

- **Status**: Accepted (2026-08-27)
- **Source initiative**: BL-138 (a standalone BACKLOG stanza, not an archived design doc — its full text is recoverable via `git log -- src/docs/development/BACKLOG.md`, last pre-prune revision noted in the BACKLOG header's cleanup-wave list)

## Context

The `/hub/mcp/get-started/` and `/hub/mcp/using/` onboarding pages ship three screen-capture clips of a Claude Desktop session (connector setup, prompt/resource listing, a regulatory query). The optimised outputs live at `public/images/hub/mcp/` — three mp4 clips plus three posters. The two raw captures they derive from are **not reproducible by anything**: they are recordings of a live Claude Desktop session, and every trim window in the re-encode recipes is meaningless against a different recording. The raws live in a gitignored `media-raw/` at the repo root (operator machine only), so nothing under `public/` can sweep them into a deploy.

Measured basis at decision time: repo pack `16.79 MiB`; largest tracked file `package-lock.json` at `0.62 MiB`; the shipping set measured `948 KiB` as three mp4 + three PNG posters. At implementation (2026-08-27) the posters were converted to WebP q82 per the measurement recorded in BL-138 — `621 KB` of PNG became `~113 KB` of WebP with no visible loss at full size against the smallest text in the set (the regulations-query tool labels) — so the committed set is **three mp4 + three webp, ~440 KB**.

Serving same-origin media also required the CSP change this ADR's initiative carried: `media-src 'self'` in both `vercel.json` CSP strings and `src/middleware.ts` (previously undefined, so `<video>` fell back to `default-src 'none'` and was denied site-wide). See [SECURITY_HEADERS.md](../security/SECURITY_HEADERS.md) § CSP Breakdown.

## Decision

**Commit the optimised media to the repo**; keep the raw captures out of git on the operator machine.

Rejected alternatives:

- **Git LFS** — adds a build-config dependency, and a fresh clone without `git-lfs` installed silently receives pointer files instead of media.
- **Cloudflare R2 / Vercel Blob** — would require allowlisting an external origin in `media-src`, weakening the `'self'`-only posture; decouples media from code versioning, so a code rollback would not roll back media; preview deploys would share production assets; and it adds a publish step, a cache strategy, and a new secret for [SECRETS_INVENTORY.md](../operations/SECRETS_INVENTORY.md).

Media-in-git is a real problem for large, frequently re-rendered binaries; these are write-once onboarding captures that change only when Claude Desktop's UI changes.

**WebM twins were produced and then removed 2026-08-19 — do not re-add them.** Measured against the mp4s (recipe `libvpx-vp9 -crf 38 -b:v 0 -row-mt 1` at `fps=15`): connector-enabled `50.0` vs `48.3 KB` (+3.5%), prompts-resources `182.5` vs `184.6 KB` (−1.1%, noise), regulations-query `135.4` vs `93.9 KB` (**+44%**) — `367.9 KB` of WebM against `326.8 KB` of mp4, i.e. 12.6% larger in total. H.264/MP4 is the universally supported baseline and WebM/VP9 support is narrower, so the twins reached no browser the mp4 misses while costing bytes. If a future encode makes VP9 or AV1 genuinely smaller **and** legibility holds, re-measure before re-adding — do not re-add on convention. (The `ClipFigure.astro` component keeps `webm` as an optional prop so a future measured win needs no component change.)

## Consequences

- The clip player, per-clip page constraints, reduced-motion poster rule, and the ffmpeg re-encode recipes live in [src/docs/hub/MCP_ONBOARDING.md](../hub/MCP_ONBOARDING.md). BL-138's acceptance criterion suggested `scripts/` or this ADR's Consequences as the recipes' home; the hub doc is the deliberate deviation — the recipes belong beside the clip-player pattern and page constraints they serve, and that doc is link-integrity-tested.
- Consumers: `src/components/hub/mcp/ClipFigure.astro` (markup), `src/utils/mcp-onboarding.ts` (lazy attach / autoplay / reduced-motion behavior), `public/images/hub/mcp/` (the six files).
- **Revisit threshold — a judgment call, not a measurement**: if this media set exceeds roughly `25–50 MiB` against the `16.79 MiB` pack measured at decision time, or shifts from write-once to a regular re-render cadence, move to R2 and allowlist that origin in `media-src`.
- **Rendered stills follow the same rule** (2026-09-03): `consent-page-still.webp` is regenerated from Worker source by `npm run media:consent-still` rather than recorded, so unlike the clips it is reproducible, but it is committed for the same reasons (same-origin `img-src`, versioned with the copy that describes it, no publish step). The revisit threshold is unchanged; a 50 KB still does not move it. The full inventory, including the operator-recorded clips still owed, is the media catalog in [MCP_ONBOARDING.md](../hub/MCP_ONBOARDING.md#media-catalog).
- A re-record is already owed for `prompts-resources-web.mp4` (recorded when nine prompts existed; the copy says twelve) — the trigger is recorded in MCP_ONBOARDING.md, and the replacement is a drop-in under the same filename.
