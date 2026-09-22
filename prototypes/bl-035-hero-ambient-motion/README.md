# BL-035 — hero ambient motion prototypes

Throwaway design prototypes for [BL-035](../../src/docs/development/BACKLOG.md) (Dynamic
Visual Effects). **Nothing here ships or is imported by the site** — no build step, no test, no
route references this directory. It exists so the candidate effects survive outside the design
canvas they were drawn on.

Canvas: `Hero Ambient Motion` (Artifact, private to the repo owner).

## What is here

`project/` holds one artboard per candidate, plus the canvas index:

| File                   | Candidate                                                     |
| ---------------------- | ------------------------------------------------------------- |
| `Main.dc.html`         | 01 Grid Pulse — checkerboard cells pulsing in the accent      |
| `GlowShift.dc.html`    | 02 Ambient Glow Shift — two slow radial gradients             |
| `ScanSweep.dc.html`    | 03 Scan Sweep — a band that decelerates and fades as it falls |
| `DataRails.dc.html`    | 04 Data Rails — 14 rails, four directions, marks that die out |
| `DeltaDrift.dc.html`   | 05 Delta Drift — brand deltas drifting (DeltaIcon geometry)   |
| `Combined.dc.html`     | 06 Combined — a thinned superset of all five                  |
| `PanelEffects.dc.html` | The proposed fourth `.palette-panel__section`, /brand only    |

`generate.cjs` regenerates the six hero artboards (`node generate.cjs`); `PanelEffects.dc.html`
is hand-written. The `.dc.html` format belongs to the design canvas and needs its runtime — these
files do not render as plain HTML in a browser.

## Constraints these honour (from the BL-035 stanza)

- CSS animation only, `transform`/`opacity`, no JS animation loop, no external dependency
- At most 15 animated elements per artboard (14 here)
- Effect layer is `aria-hidden` and `pointer-events: none`
- Colour comes from the accent token, so every palette and both themes follow

## Not yet proven

Lighthouse impact, mobile behaviour, and the real `prefers-reduced-motion` path. The artboards
carry a motion tweak that stands in for the media query; the shipped component must use the query
itself.
