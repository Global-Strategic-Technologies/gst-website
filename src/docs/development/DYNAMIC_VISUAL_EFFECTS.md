# Dynamic Visual Effects — Exploration Initiative

An investigation into whether ambient, animated visual effects (particle fields, floating elements, subtle motion backgrounds) would enhance GST's homepage and key landing sections — or conflict with the brand's tech-brutalist identity.

**Status**: Proposed (exploration)
**Created**: April 9, 2026
**Priority**: Low — exploratory; no commitment to ship
**Effort**: Medium (prototype: 2-4h; polish + perf tuning: 4-8h if approved)

---

## Table of Contents

1. [Motivation](#1-motivation)
2. [Reference Effect](#2-reference-effect)
3. [Brand Alignment Assessment](#3-brand-alignment-assessment)
4. [Candidate Effects for GST](#4-candidate-effects-for-gst)
5. [Candidate Placements](#5-candidate-placements)
6. [Technical Constraints](#6-technical-constraints)
7. [Risk Assessment](#7-risk-assessment)
8. [Evaluation Criteria](#8-evaluation-criteria)
9. [Implementation Approach](#9-implementation-approach)
10. [Decision Framework](#10-decision-framework)

---

## 1. Motivation

GST's homepage hero section is currently static — clean typography, frosted-glass buttons, and the checkerboard grid background. While this aligns with tech-brutalist principles, the page lacks any ambient motion that signals "alive" or "active" to visitors.

An external reference (a sweepstakes landing page) demonstrated a **rising-bubble particle effect** — CSS-only animated circles floating upward with glow and varying opacity. The question: could a similar but brand-appropriate ambient effect add visual sophistication to GST without undermining the brutalist aesthetic?

The answer is not obviously yes. Brutalism values structure over decoration, and ambient particles lean decorative. This initiative exists to explore whether there's a version of this concept that reinforces rather than contradicts the brand.

---

## 2. Reference Effect

The observed implementation uses:

- **35 `<div>` elements** with `border-radius: 50%` (circles), randomly sized (10-48px)
- **CSS `@keyframes riseBubble`** — vertical translate from bottom to top over 8-20s, with fade-in/fade-out
- **Randomized properties**: position (left%), size, duration, delay, color (6-color palette)
- **`pointer-events: none`** and `position: fixed` — non-interactive overlay
- **Glow via `box-shadow`** matching each bubble's color
- **Pure CSS animation** — no JavaScript animation loop, no canvas, no WebGL

Performance characteristics: lightweight (no JS runtime cost), GPU-composited (`transform` + `opacity`), but 35 simultaneous animated elements.

---

## 3. Brand Alignment Assessment

### What conflicts with GST's identity

| Concern                                 | Reasoning                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| Decoration over structure               | Brutalism rejects ornament; floating particles are purely decorative         |
| Playful tone                            | Bubbles/circles evoke consumer/fun; GST targets PE firms and enterprise CIOs |
| Visual noise                            | Competing with the checkerboard grid background could feel cluttered         |
| Association with consumer landing pages | The reference is a sweepstakes page — exactly the opposite of GST's gravitas |

### What could align with GST's identity

| Opportunity                      | Reasoning                                                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Subtle data-stream motif         | Slow-moving geometric particles could evoke data flow, network topology, or signal processing — reinforcing "technology advisory" |
| Grid-aware motion                | Particles that follow the existing 50px checkerboard grid would feel structural rather than random                                |
| Monochrome restraint             | Using only `--color-primary` at very low opacity (2-8%) avoids the colorful "party" feel                                          |
| Controlled density               | 8-12 elements (not 35) at very slow speed reads as ambient atmosphere, not animation                                              |
| `prefers-reduced-motion` respect | Disabling entirely for users who opt out is essential and shows intentionality                                                    |

### Verdict

A direct port of the bubble effect would **not** align with GST's brand. However, a heavily restrained, geometrically structured variant — closer to a "data field" or "signal grid" than "bubbles" — could work if it passes the evaluation criteria in section 8.

---

## 4. Candidate Effects for GST

Listed from most to least aligned with tech-brutalist identity:

### 4a. Grid Pulse (strongest fit)

Subtle brightness pulses that travel across the existing checkerboard grid — as if data is flowing through a circuit board. No new elements; the existing `body::before` checkerboard gets intersection points that glow faintly.

- **Pros**: Uses existing visual language; structural, not decorative; zero DOM additions possible (CSS-only on grid intersections)
- **Cons**: Technically harder (requires modifying the checkerboard pattern or adding a canvas layer); may be too subtle to notice

### 4b. Floating Delta Particles

Tiny delta (triangle) shapes — GST's brand icon — drifting slowly upward or laterally. Monochrome, very low opacity (3-6%), slow (15-25s per cycle).

- **Pros**: Reinforces brand symbol; unique to GST; clearly intentional rather than generic
- **Cons**: Could read as "logo spam" if overused; deltas are angular, so float motion may feel wrong

### 4c. Rising Data Nodes

Small squares or dots (not circles) that rise slowly, connected by faint lines that appear/disappear as nodes pass proximity thresholds. Evokes network topology.

- **Pros**: Directly communicates "technology"; geometric shapes fit brutalism; interactive potential (nodes could respond to mouse proximity)
- **Cons**: Connected-node effects are overdone in tech sites (see: particles.js); risks looking generic

### 4d. Horizontal Scan Lines

Thin horizontal lines that sweep down the page slowly, like a terminal refresh or radar scan. Monochrome, very faint.

- **Pros**: CRT/terminal aesthetic fits "tech brutalist" perfectly; minimal DOM impact; can be CSS-only
- **Cons**: May feel retro rather than modern; could interfere with readability if not carefully tuned

### 4e. Ambient Glow Shift (lowest risk)

No particles. Instead, the hero background gets slow-cycling radial gradients that shift position over 20-30s — a breathing effect behind the content. Similar to the reference's `pulseGlow` keyframe but more restrained.

- **Pros**: Zero DOM additions; pure CSS; extremely subtle; adds "life" without any decorative elements
- **Cons**: May not be noticeable enough to justify the effort; gradient motion on large areas can be GPU-heavy on mobile

---

## 5. Candidate Placements

| Location                          | Suitability | Notes                                                                                                    |
| --------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| **Hero section** (homepage)       | High        | Most impactful first impression; contained area; no text readability risk if elements are behind content |
| **Hub gateway** (`/hub`)          | Medium      | The tool listing page could benefit from "active ecosystem" feel; but cards need to remain the focus     |
| **CTA section** (homepage footer) | Low-Medium  | Could draw attention to the conversion area; but risks distracting from the CTA itself                   |
| **Full-page background**          | Low         | Too much; conflicts with checkerboard; performance concerns                                              |
| **404 / error pages**             | Medium      | Low-stakes area to experiment; could make errors feel less harsh                                         |

**Recommendation**: If pursued, start with hero-only. Scope creep to other sections should require separate evaluation.

---

## 6. Technical Constraints

### Performance budget

- **LCP must stay < 2.5s** (current target per DEVELOPMENT_OPPORTUNITIES.md)
- **CLS must stay < 0.1** — animated elements must not shift layout
- **No JavaScript animation loops on the main thread** — CSS animations or `requestAnimationFrame` with GPU-composited properties only (`transform`, `opacity`)
- **Element count**: max 15 animated elements (avoid DOM bloat)
- **`will-change` or `contain`** declarations required to hint compositor
- **Mobile**: reduce or disable on viewports < 768px (CPU/battery consideration)

### Accessibility

- **`prefers-reduced-motion: reduce`** must disable all motion entirely (not just slow it down)
- **`pointer-events: none`** on all decorative layers
- **`aria-hidden="true"`** on container elements
- **No content conveyed through animation** — purely decorative

### Integration

- Must work with both light and dark themes (colors via CSS variables)
- Must work with all 6 palette variants (use `--color-primary` not hardcoded values)
- Must not interfere with the existing checkerboard grid z-indexing
- Must not add external dependencies (no particles.js, three.js, etc.)
- Astro component pattern: `.astro` file with scoped `<style>` and `<script>`

---

## 7. Risk Assessment

| Risk                                  | Likelihood | Impact | Mitigation                                                        |
| ------------------------------------- | ---------- | ------ | ----------------------------------------------------------------- |
| Performance regression on mobile      | Medium     | High   | Disable on < 768px; test on throttled devices; Lighthouse CI gate |
| Looks unprofessional / consumer-grade | Medium     | High   | Stakeholder review before merge; A/B if possible                  |
| Conflicts with checkerboard grid      | Low        | Medium | Careful z-index layering; prototype first                         |
| Scope creep to other pages            | Medium     | Low    | Explicit "hero-only" constraint in implementation                 |
| Accessibility complaint               | Low        | High   | `prefers-reduced-motion` mandatory; WCAG 2.3.3 compliance         |
| Wasted effort if rejected             | Medium     | Low    | Time-boxed prototype (2-4h max before decision point)             |

---

## 8. Evaluation Criteria

A prototype must pass all of these before proceeding to production implementation:

1. **Brand test**: Does a first-time visitor associate this with "technology advisory firm" or "consumer landing page"? (Stakeholder review)
2. **Subtlety test**: Can a user browse the page for 30 seconds without consciously noticing the effect? (If yes = too subtle. If it's the first thing they notice = too aggressive. It should register subconsciously after a few seconds.)
3. **Performance test**: Lighthouse performance score does not drop more than 2 points on mobile
4. **Theme test**: Looks correct in light, dark, and at least 2 alternative palettes
5. **Reduced-motion test**: Completely static when `prefers-reduced-motion: reduce` is active
6. **Mobile test**: Either gracefully degraded or disabled on < 768px without layout shift

---

## 9. Implementation Approach

### Phase 1: Prototype (2-4h, time-boxed)

1. Create `src/components/AmbientEffect.astro` with the top 2 candidate effects (likely 4a Grid Pulse and 4e Ambient Glow Shift)
2. Render in Hero section only, behind all content
3. Wire up `prefers-reduced-motion` and mobile disable
4. Test both themes + 2 palettes
5. Capture before/after Lighthouse scores

### Phase 2: Decision Point

- Stakeholder review of prototype
- **Go**: proceed to Phase 3
- **No-go**: archive the component; document findings in this file; no wasted effort beyond the time box

### Phase 3: Production Polish (4-8h, if approved)

1. Fine-tune timing, opacity, density based on feedback
2. Add to production Hero component
3. Unit test: verify `prefers-reduced-motion` behavior
4. E2E test: verify hero section renders correctly with effect
5. Performance regression test via Lighthouse CI

---

## 10. Decision Framework

This initiative should be **pursued** if:

- The team wants to differentiate GST's homepage from typical static consulting sites
- A prototype can be built that passes all 6 evaluation criteria
- The effect reinforces the "technology" aspect of the brand rather than decorating it

This initiative should be **shelved** if:

- Prototypes consistently read as "consumer" rather than "enterprise"
- Performance impact exceeds the budget on mobile
- Stakeholder feedback is lukewarm — a "meh" effect is worse than no effect

This initiative should be **killed** if:

- It requires external dependencies (particles.js, canvas libraries)
- It can't work with the palette system and theme toggling
- It becomes a rabbit hole exceeding 8h total investment

---

## Related Documentation

- [DEVELOPMENT_OPPORTUNITIES.md](./DEVELOPMENT_OPPORTUNITIES.md) — Performance budgets and monitoring
- [BRAND_GUIDELINES.md](../styles/BRAND_GUIDELINES.md) — Brand voice, color hierarchy, design philosophy
- [STYLES_GUIDE.md](../styles/STYLES_GUIDE.md) — CSS conventions and frosted-glass patterns
- [VARIABLES_REFERENCE.md](../styles/VARIABLES_REFERENCE.md) — Design token catalog

---

**Created**: April 9, 2026
