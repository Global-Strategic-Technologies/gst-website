# Interactive Regulatory Map

**Status:** In Development
**Priority:** High
**Feature Target:** `/hub/tools/regulatory-map`
**Branch:** `feature/regulatory-map`

---

## Overview

An interactive 2D world map visualization that allows users to explore global technology and data privacy regulations by region. Users click countries to view regulatory compliance details in a side panel.

## Objectives

- Deliver a responsive, accessible SVG-based world map using D3.js
- Display regulation data (GDPR, CCPA, LGPD, etc.) with build-time validated JSON
- Support both mobile (stacked) and desktop (side-by-side) layouts
- Integrate seamlessly with the existing GST design system and dark theme

## Architecture

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Astro (SSG) | Static page generation |
| Visualization | D3.js (`d3-geo`, `d3-selection`) | SVG map rendering |
| Geospatial | TopoJSON (`topojson-client`, `world-atlas`) | Country border data |
| Validation | Zod | Build-time JSON schema validation |
| Rendering | SVG with CSS classes | Resolution-independent, theme-aware |
| State | Native `CustomEvent` | Decoupled component communication |

### Directory Structure

```
src/
  components/hub/tools/regulatory-map/
    MapVisualizer.astro         # D3 SVG map container
    CompliancePanel.astro       # Regulation detail panel
  data/regulatory-map/
    EU-GDPR.json                # European GDPR
    US-CCPA.json                # California CCPA
    BR-LGPD.json                # Brazil LGPD
    SG-PDPA.json                # Singapore PDPA
    GB-DPA.json                 # UK Data Protection Act
  pages/hub/tools/regulatory-map/
    index.astro                 # Route entry point
  types/
    regulatory-map.ts           # TypeScript interfaces
  utils/
    fetchRegulations.ts         # Build-time data loader with Zod validation
    countryCodeMap.ts           # ISO numeric <-> alpha-3 code mapping
```

### Data Flow

1. **Build time**: `fetchAllRegulations()` loads and validates all JSON files via Zod
2. **SSG output**: Regulation data + world TopoJSON serialized into HTML as `<script type="application/json">`
3. **Client hydration**: D3 reads embedded data, renders SVG map, colors countries by regulation coverage
4. **Interaction**: Click dispatches `regionSelected` CustomEvent; panel listens and updates DOM

### Component Communication

```
MapVisualizer (Publisher)                CompliancePanel (Subscriber)
    |                                        |
    |-- click country path ----------------->|
    |   dispatch('regionSelected',           |
    |     { regionId: 'DEU' })               |
    |                                        |-- lookup regulations for 'DEU'
    |                                        |-- render regulation cards
```

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| `d3-geo` + `d3-selection` only (not full D3) | Reduces client bundle from ~240KB to ~35KB gzipped |
| `world-atlas` npm package | Standard D3 ecosystem, maintained, pre-built TopoJSON |
| CSS classes on SVG paths (not inline fills) | Enables dark theme via `:global(html.dark-theme)` |
| No zoom/pan on mobile | Prevents scroll trap; users can scroll page normally |
| Build-time TopoJSON embedding | No runtime fetch, fully static SSG output |
| Numeric-to-alpha3 mapping utility | Bridges world-atlas IDs to regulation data codes |

## Responsive Behavior

| Breakpoint | Layout |
|-----------|--------|
| Base (mobile) | Single column: map stacked above panel |
| >= 768px | Same stack with increased spacing |
| >= 1024px | CSS Grid: map (1fr) + panel (380px) side-by-side |

## Seed Regulations

Initial launch includes 5 major frameworks covering 30+ countries:

1. **EU GDPR** - General Data Protection Regulation (27 EU member states)
2. **US CCPA** - California Consumer Privacy Act (USA)
3. **BR LGPD** - Lei Geral de Protecao de Dados (Brazil)
4. **SG PDPA** - Personal Data Protection Act (Singapore)
5. **GB DPA** - Data Protection Act 2018 (United Kingdom)

## Future Expansion

- Additional regulations (HIPAA, SOX, PCI-DSS, AI Act)
- Regulation category filtering (data privacy, cybersecurity, AI governance)
- Timeline view showing regulation effective dates
- Comparison mode for multi-jurisdiction analysis
- Search/filter by regulation name or keyword

---

**Created:** March 2026
