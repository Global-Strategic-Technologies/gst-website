# Regulatory Map — Technical Documentation

## Overview

The Regulatory Map is an interactive D3.js world map that visualizes global technology and data privacy regulations across 56 jurisdictions. Users click highlighted countries, US states, or Canadian provinces to view regulation details in a side panel.

**Entry point**: `src/pages/hub/tools/regulatory-map/index.astro`

**URL**: `https://globalstrategic.tech/hub/tools/regulatory-map`

---

## Architecture

```
User (Map UI)
│
├── src/components/hub/tools/regulatory-map/
│     MapVisualizer.astro         ← SVG map container, zoom controls, tooltip, path styles
│     CompliancePanel.astro       ← Regulation detail panel (cards, requirements, penalties)
│
├── src/data/regulatory-map/
│     *.json                      ← 56 regulation files (Zod-validated at build time)
│
├── src/data/canada-provinces.json ← TopoJSON for Canadian province boundaries
│
├── src/pages/hub/tools/regulatory-map/
│     index.astro                 ← Route entry, D3 rendering, event wiring, embedded data
│
├── src/types/regulatory-map.ts   ← TypeScript interfaces (Regulation, RegionSelectedDetail)
│
└── src/utils/
      fetchRegulations.ts         ← Build-time data loader with Zod schema validation
      countryCodeMap.ts           ← ISO numeric ↔ alpha-3 mapping + name lookups
      fipsToStateCode.ts          ← FIPS ↔ US-XX state code mapping + name lookups
      canadianProvinceMap.ts      ← CA-XX province code → name mapping
```

All rendering logic runs client-side. No server calls. Regulation data and TopoJSON are embedded at build time as `<script type="application/json">` blocks.

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Astro (SSG) | Static page generation |
| Visualization | `d3-geo`, `d3-selection`, `d3-zoom`, `d3-transition` | SVG map rendering, pan/zoom |
| Geospatial | `topojson-client`, `world-atlas`, `us-atlas` | Country, state, province boundaries |
| Validation | Zod | Build-time JSON schema enforcement |
| Rendering | SVG with CSS classes | Resolution-independent, theme-aware |
| State | Native `CustomEvent` | Decoupled component communication |

---

## Data Flow

1. **Build time**: `fetchAllRegulations()` loads all `src/data/regulatory-map/*.json` files via `import.meta.glob` and validates each against the Zod schema
2. **SSG output**: Validated regulation data, world TopoJSON, US states TopoJSON, and Canadian provinces TopoJSON are serialized into the HTML as `<script type="application/json">` blocks
3. **Client hydration**: D3 parses embedded data, projects geography with `geoEquirectangular`, renders SVG paths, and colors regions by regulation coverage
4. **Interaction**: Click dispatches `regionSelected` CustomEvent; the compliance panel listens and renders regulation cards

### Component Communication

```
MapVisualizer (Publisher)                CompliancePanel (Subscriber)
    │                                        │
    │── click country/state/province ──────>│
    │   dispatch('regionSelected',           │
    │     { regionId: 'DEU' })               │
    │                                        │── lookup regulations for 'DEU'
    │                                        │── render regulation cards
```

---

## Regulation Data Schema

Each JSON file in `src/data/regulatory-map/` follows this schema:

```json
{
  "id": "eu-gdpr",
  "name": "General Data Protection Regulation (GDPR)",
  "regions": ["AUT", "BEL", "BGR", ...],
  "effectiveDate": "2018-05-25",
  "summary": "Description of the regulation...",
  "keyRequirements": [
    "Requirement 1",
    "Requirement 2"
  ],
  "penalties": "Up to 4% of annual global turnover..."
}
```

| Field | Type | Validation |
|-------|------|------------|
| `id` | string | Required, unique identifier |
| `name` | string | Required, full regulation name |
| `regions` | string[] | ISO 3166-1 alpha-3 (countries), ISO 3166-2 (US-XX, CA-XX) |
| `effectiveDate` | string | ISO 8601 date format |
| `summary` | string | Required, regulation description |
| `keyRequirements` | string[] | Required, at least 1 item |
| `penalties` | string | Required, penalty description |

### Region Code Formats

| Format | Example | Scope |
|--------|---------|-------|
| `XXX` (alpha-3) | `DEU`, `BRA`, `JPN` | Country-level regulations |
| `US-XX` | `US-CA`, `US-TX`, `US-VA` | US state-level regulations |
| `CA-XX` | `CA-QC`, `CA-AB`, `CA-BC` | Canadian provincial regulations |

---

## Regulation Coverage (56 regulations)

### Multi-Country (2)

| File | Regulation | Coverage |
|------|-----------|---------|
| `EU-GDPR.json` | General Data Protection Regulation | 27 EU member states |
| `CA-PIPEDA.json` | Personal Information Protection and Electronic Documents Act | All Canadian provinces |

### US State Laws (20)

| File | State | Law |
|------|-------|-----|
| `US-CA-CCPA.json` | California | CCPA/CPRA |
| `US-CO-CPA.json` | Colorado | CPA |
| `US-CT-CTDPA.json` | Connecticut | CTDPA |
| `US-DE-DPDPA.json` | Delaware | DPDPA |
| `US-FL-FDBR.json` | Florida | FDBR |
| `US-IA-ICDPA.json` | Iowa | ICDPA |
| `US-IN-INCDPA.json` | Indiana | INCDPA |
| `US-KY-KCDPA.json` | Kentucky | KCDPA |
| `US-MD-MODPA.json` | Maryland | MODPA |
| `US-MN-MCDPA.json` | Minnesota | MCDPA |
| `US-MT-MTCDPA.json` | Montana | MTCDPA |
| `US-NE-NDPA.json` | Nebraska | NDPA |
| `US-NH-NHPA.json` | New Hampshire | NHPA |
| `US-NJ-NJDPA.json` | New Jersey | NJDPA |
| `US-OR-OCPA.json` | Oregon | OCPA |
| `US-RI-RIDTPPA.json` | Rhode Island | RIDTPPA |
| `US-TN-TIPA.json` | Tennessee | TIPA |
| `US-TX-TDPSA.json` | Texas | TDPSA |
| `US-UT-UCPA.json` | Utah | UCPA |
| `US-VA-VCDPA.json` | Virginia | VCDPA |

### Canadian Provincial Laws (3)

| File | Province | Law |
|------|----------|-----|
| `CA-QC-LAW25.json` | Quebec | Law 25 |
| `CA-AB-PIPA.json` | Alberta | PIPA |
| `CA-BC-PIPA.json` | British Columbia | PIPA |

### Asia-Pacific (11)

| File | Country | Law |
|------|---------|-----|
| `JP-APPI.json` | Japan | APPI |
| `KR-PIPA.json` | South Korea | PIPA |
| `AU-PRIVACY-ACT.json` | Australia | Privacy Act 1988 |
| `IN-DPDPA.json` | India | DPDP Act 2023 |
| `TH-PDPA.json` | Thailand | PDPA |
| `CN-PIPL.json` | China | PIPL |
| `NZ-PRIVACY-ACT.json` | New Zealand | Privacy Act 2020 |
| `PH-DPA.json` | Philippines | Data Privacy Act 2012 |
| `ID-PDP.json` | Indonesia | PDP Law |
| `VN-PDPL.json` | Vietnam | PDPL |
| `MY-PDPA.json` | Malaysia | PDPA 2010 |

### Europe Non-EU (3)

| File | Country | Law |
|------|---------|-----|
| `GB-DPA.json` | United Kingdom | Data Protection Act 2018 |
| `CH-FADP.json` | Switzerland | nFADP |
| `TR-KVKK.json` | Turkey | KVKK (Law 6698) |

### Middle East & Africa (7)

| File | Country | Law |
|------|---------|-----|
| `ZA-POPIA.json` | South Africa | POPIA |
| `NG-NDPA.json` | Nigeria | NDPA 2023 |
| `KE-DPA.json` | Kenya | DPA 2019 |
| `AE-PDPL.json` | UAE | PDPL |
| `SA-PDPL.json` | Saudi Arabia | PDPL |
| `EG-PDPL.json` | Egypt | PDPL |
| `RW-DPP.json` | Rwanda | DPP Law |

### Latin America (6)

| File | Country | Law |
|------|---------|-----|
| `BR-LGPD.json` | Brazil | LGPD |
| `AR-PDPA.json` | Argentina | PDPA (Law 25.326) |
| `CO-LAW1581.json` | Colombia | Law 1581 of 2012 |
| `MX-LFPDPPP.json` | Mexico | LFPDPPP |
| `UY-LAW18331.json` | Uruguay | Law 18.331 |
| `PE-LAW29733.json` | Peru | Law 29.733 |

### Other (3)

| File | Country | Law | Note |
|------|---------|-----|------|
| `SG-PDPA.json` | Singapore | PDPA | |
| `BH-PDPL.json` | Bahrain | PDPL | Not visible on 110m map (too small) |
| `CL-LAW19628.json` | Chile | Law 19.628 | |
| `RS-LPDP.json` | Serbia | LPDP | Not visible on 110m map |

---

## Map Rendering

### Projection

Uses `geoEquirectangular` fitted to the SVG viewport. Countries are rendered from `world-atlas/countries-110m.json`, US states from `us-atlas/states-10m.json`, and Canadian provinces from a custom `canada-provinces.json` TopoJSON.

### Country Suppression

The USA and Canada country-level paths are rendered but excluded from click handling and active styling — their sub-national paths (states/provinces) handle interaction instead. This prevents the country polygon from intercepting clicks meant for individual states or provinces.

### Zoom & Pan

- `d3-zoom` with scale extent `[1, 8]` and translate extent locked to the map bounds
- Zoom controls (in/out/reset) in the top-right corner
- Touch devices: `touchAction: pan-x pan-y` allows single-finger page scroll; pinch-to-zoom interacts with the map
- Double-click zoom is disabled to avoid conflicts with region selection clicks

### Path Styling

| Class | Purpose |
|-------|---------|
| `.country-path` | Base country path (neutral fill) |
| `.country-path--active` | Country with regulation data (green fill, pointer cursor) |
| `.country-path--selected` | Currently selected country (deeper green fill, gold stroke) |
| `.state-path` | Base US state / Canadian province path (transparent fill) |
| `.state-path--active` | State/province with regulation data |
| `.state-path--selected` | Currently selected state/province |

All styles support dark theme via `:global(html.dark-theme)` overrides.

---

## Responsive Behavior

| Breakpoint | Layout |
|-----------|--------|
| Base (mobile) | Single column: map stacked above panel |
| >= 1024px | CSS Grid: map (`1fr`) + panel (`380px`) side-by-side |

On desktop, the compliance panel has `position: sticky` and its `max-height` is synced to the map container height via JS to prevent the back-link from shifting when panel content changes.

---

## Adding a New Regulation

1. Create a new JSON file in `src/data/regulatory-map/` following the naming convention: `{COUNTRY_CODE}-{LAW_ABBREVIATION}.json` (e.g., `JP-APPI.json`)
2. Populate all required fields matching the schema above
3. Use valid region codes — verify country alpha-3 codes exist in `src/utils/countryCodeMap.ts`, US state codes in `src/utils/fipsToStateCode.ts`, or Canadian province codes in `src/utils/canadianProvinceMap.ts`
4. Run `npm run build` — Zod validation will catch schema errors at build time
5. The map will automatically highlight the new regions and display regulation cards on click

No code changes are needed to add new country-level regulations — only the JSON file.

### Adding Sub-National Support for a New Country

Adding state/province-level rendering for a new country (beyond the US and Canada) requires:

1. A TopoJSON file with sub-national boundaries
2. A code-to-name mapping utility (like `fipsToStateCode.ts`)
3. Updates to the Zod validation regex to accept the new code format
4. D3 rendering logic in `index.astro` to render and wire up the new paths
5. Suppression of the parent country path from click handling

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| `d3-geo` + `d3-selection` only (not full D3) | Reduces client bundle from ~240KB to ~35KB gzipped |
| `world-atlas` 110m resolution | Sufficient detail for country-level interaction; smaller than 50m/10m |
| `us-atlas` 10m for US states | Higher resolution needed for small states (RI, CT, DE) |
| CSS classes on SVG paths (not inline fills) | Enables dark theme via `:global(html.dark-theme)` selectors |
| Build-time TopoJSON embedding | No runtime fetch, fully static SSG output |
| `CustomEvent` for component communication | Native browser API, no framework dependency, decoupled |
| `remove()` for CTA dismissal | Permanent removal rather than `hidden` avoids layout recalculation |

---

## Future Expansion

- Additional regulations (AI Act, HIPAA, SOX, PCI-DSS)
- Regulation category filtering (data privacy, cybersecurity, AI governance)
- Timeline view showing regulation effective dates
- Comparison mode for multi-jurisdiction analysis
- Search/filter by regulation name or keyword
- Upgrade to 50m TopoJSON for better small-country visibility (Bahrain, Serbia, etc.)

---

**Created:** March 2026
