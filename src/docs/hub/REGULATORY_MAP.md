# Regulatory Map — Technical Documentation

## Overview

The Regulatory Map is an interactive D3.js world map that visualizes global data privacy, AI, and industry compliance regulations across 74 regulatory frameworks. Users click highlighted countries, US states, or Canadian provinces to view regulation details in a side panel. Regions with multiple applicable regulations (e.g., an EU member state with both GDPR and the AI Act) display all of them.

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
│     *.json                      ← 74 regulation files (Zod-validated at build time)
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
  "category": "data-privacy",
  "scope": "Optional: who this regulation applies to",
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
| `category` | enum | Required: `data-privacy`, `ai-governance`, `industry-compliance`, `cybersecurity` |
| `scope` | string | Optional, describes who the regulation applies to |
| `keyRequirements` | string[] | Optional, list of key requirements |
| `penalties` | string | Optional, penalty description |

### Region Code Formats

| Format | Example | Scope |
|--------|---------|-------|
| `XXX` (alpha-3) | `DEU`, `BRA`, `JPN` | Country-level regulations |
| `US-XX` | `US-CA`, `US-TX`, `US-VA` | US state-level regulations |
| `CA-XX` | `CA-QC`, `CA-AB`, `CA-BC` | Canadian provincial regulations |

---

## Regulation Coverage (74 regulations)

The map covers three categories of regulation: **data privacy** (56 regulations), **artificial intelligence** (16 regulations), and **industry compliance** (2 regulations). All categories share the same data schema, rendering pipeline, and region code system. A single region may have multiple regulations from multiple categories.

---

### Data Privacy Regulations (56)

#### Multi-Country (2)

| File | Regulation | Coverage |
|------|-----------|---------|
| `EU-GDPR.json` | General Data Protection Regulation | 27 EU member states |
| `CA-PIPEDA.json` | Personal Information Protection and Electronic Documents Act | All Canadian provinces |

#### US State Privacy Laws (20)

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

#### Canadian Provincial Laws (3)

| File | Province | Law |
|------|----------|-----|
| `CA-QC-LAW25.json` | Quebec | Law 25 |
| `CA-AB-PIPA.json` | Alberta | PIPA |
| `CA-BC-PIPA.json` | British Columbia | PIPA |

#### Asia-Pacific (11)

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

#### Europe Non-EU (3)

| File | Country | Law |
|------|---------|-----|
| `GB-DPA.json` | United Kingdom | Data Protection Act 2018 |
| `CH-FADP.json` | Switzerland | nFADP |
| `TR-KVKK.json` | Turkey | KVKK (Law 6698) |

#### Middle East & Africa (7)

| File | Country | Law |
|------|---------|-----|
| `ZA-POPIA.json` | South Africa | POPIA |
| `NG-NDPA.json` | Nigeria | NDPA 2023 |
| `KE-DPA.json` | Kenya | DPA 2019 |
| `AE-PDPL.json` | UAE | PDPL |
| `SA-PDPL.json` | Saudi Arabia | PDPL |
| `EG-PDPL.json` | Egypt | PDPL |
| `RW-DPP.json` | Rwanda | DPP Law |

#### Latin America (6)

| File | Country | Law |
|------|---------|-----|
| `BR-LGPD.json` | Brazil | LGPD |
| `AR-PDPA.json` | Argentina | PDPA (Law 25.326) |
| `CO-LAW1581.json` | Colombia | Law 1581 of 2012 |
| `MX-LFPDPPP.json` | Mexico | LFPDPPP |
| `UY-LAW18331.json` | Uruguay | Law 18.331 |
| `PE-LAW29733.json` | Peru | Law 29.733 |

#### Other (4)

| File | Country | Law | Note |
|------|---------|-----|------|
| `SG-PDPA.json` | Singapore | PDPA | |
| `BH-PDPL.json` | Bahrain | PDPL | Not visible on 110m map (too small) |
| `CL-LAW19628.json` | Chile | Law 19.628 | |
| `RS-LPDP.json` | Serbia | LPDP | Not visible on 110m map |

---

### AI Regulations (16)

#### Multi-Country (1)

| File | Regulation | Coverage | Effective |
|------|-----------|---------|-----------|
| `EU-AI-ACT.json` | EU Artificial Intelligence Act (Regulation 2024/1689) | 27 EU member states | 2024-08-01 (phased through 2027) |

#### National AI Laws (6)

| File | Country | Law | Effective |
|------|---------|-----|-----------|
| `CN-ALGO-REC.json` | China | Algorithm Recommendation Regulation | 2022-03-01 |
| `CN-DEEP-SYNTHESIS.json` | China | Deep Synthesis Provisions (deepfakes) | 2023-01-10 |
| `CN-GENAI.json` | China | Interim Measures for Generative AI | 2023-08-15 |
| `KR-AI-BASIC-ACT.json` | South Korea | AI Basic Act | 2026-01-22 |
| `JP-AI-PROMOTION.json` | Japan | AI Promotion Act | 2025-06-04 |
| `PE-AI-LAW31814.json` | Peru | AI Promotion Law (Law 31814) | 2023-07-05 |

#### US State AI Laws (9)

| File | State | Law | Focus | Effective |
|------|-------|-----|-------|-----------|
| `US-IL-AIVRA.json` | Illinois | AI Video Interview Act | AI in employment video interviews | 2020-01-01 |
| `US-NY-LL144.json` | New York | NYC Local Law 144 (AEDT) | Automated employment decision tools | 2023-07-05 |
| `US-TN-ELVIS.json` | Tennessee | ELVIS Act | AI voice cloning and deepfakes | 2024-07-01 |
| `US-UT-AIPA.json` | Utah | AI Policy Act (SB 149) | AI consumer protection and disclosure | 2024-05-01 |
| `US-NY-APDA.json` | New York | Algorithmic Pricing Disclosure Act | AI-driven personalized pricing | 2025-11-10 |
| `US-CO-AI-ACT.json` | Colorado | AI Act (SB 24-205) | Algorithmic discrimination in consequential decisions | 2026-06-30 |
| `US-IL-AI-EMPLOYMENT.json` | Illinois | AI Employment Discrimination Law (HB 3773) | AI discrimination in employment | 2026-01-01 |
| `US-TX-TRAIGA.json` | Texas | TRAIGA (HB 149) | Harmful AI prohibition, state/healthcare disclosure | 2026-01-01 |
| `US-CA-AI-TRANSPARENCY.json` | California | AI Transparency Act (SB 942) | AI content watermarking and detection | 2026-08-02 |

---

### Industry Compliance Regulations (2)

| File | Regulation | Coverage | Effective |
|------|-----------|---------|-----------|
| `US-HIPAA.json` | Health Insurance Portability and Accountability Act (HIPAA) | 51 US jurisdictions (50 states + DC) | 1996-08-21 |
| `GLOBAL-PCI-DSS.json` | Payment Card Industry Data Security Standard (PCI DSS) | Global (~104 regions: US, Canada, EU, major economies) | 2004-12-15 |

**Note:** HIPAA is a US federal law applying to healthcare entities handling Protected Health Information (PHI). PCI DSS is a global industry standard (not a government law) enforced contractually by card networks (Visa, Mastercard, etc.), applicable to any organization that stores, processes, or transmits payment cardholder data.

---

#### Multi-Regulation Regions

Some regions display regulations from multiple categories:

| Region | Privacy | AI | Industry |
|--------|---------|-----|----------|
| EU member states (27) | GDPR | EU AI Act | PCI DSS |
| China | PIPL | Algorithm Rec, Deep Synthesis, Generative AI | PCI DSS |
| South Korea | PIPA | AI Basic Act | PCI DSS |
| Japan | APPI | AI Promotion Act | PCI DSS |
| Peru | Law 29.733 | AI Promotion Law 31814 | — |
| California | CCPA/CPRA | AI Transparency Act | HIPAA, PCI DSS |
| Colorado | CPA | AI Act (SB 24-205) | HIPAA, PCI DSS |
| Illinois | — | AIVRA, AI Employment (HB 3773) | HIPAA, PCI DSS |
| New York | — | NYC LL144, Algorithmic Pricing Act | HIPAA, PCI DSS |
| Tennessee | TIPA | ELVIS Act | HIPAA, PCI DSS |
| Texas | TDPSA | TRAIGA | HIPAA, PCI DSS |
| Utah | UCPA | AI Policy Act | HIPAA, PCI DSS |

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

### Feature Roadmap

**High Impact:**
- **Category filter UI** — Toggle chips/buttons to filter by data privacy, AI governance, industry compliance, cybersecurity. Leverages existing `category` field on all 74 regulations. Updates map highlighting and panel cards in real time.
- **Regulation timeline/tracker** — Visualize upcoming effective dates on a timeline. Several AI laws take effect 2026-2027; useful for diligence teams planning ahead.
- **Search/filter** — Text search across regulation names, summaries, and key requirements. Quick answers to questions like "which regions require breach notification?"

**UX Improvements:**
- Region bookmarking/sharing — URL state encoding so users can share a link to a specific region's regulations
- Print/export — PDF export of selected region's regulation cards for inclusion in diligence reports
- Regulation change alerts — Flag regulations with recent amendments or pending changes

**Data Expansion:**
- Cybersecurity frameworks — NIS2 Directive (EU), CIRCIA (US), Australia's SOCI Act (fills unused `cybersecurity` category)
- Sector-specific regulations — DORA (EU financial services), telecommunications, critical infrastructure
- Enforcement actions/fines database — Real-world penalty data to contextualize penalties (e.g., "GDPR: 2,000+ fines totaling EUR 4.5B+")

**Cross-Tool Integration:**
- Diligence Machine cross-link — When a user runs a diligence wizard for a healthcare SaaS, surface HIPAA automatically from regulatory map data
- VDR Structure cross-reference — Link regulation requirements to recommended VDR document categories

### Geographic Expansion Roadmap

Prioritized list of regulations and jurisdictions for future phases:

**Tier 1 — EU National Implementations** (complements existing GDPR/AI Act):
- Germany: BDSG (Bundesdatenschutzgesetz)
- France: Loi Informatique et Libertes (CNIL enforcement framework)
- Italy: Legislative Decree 196/2003 (Codice Privacy)
- Spain: LOPDGDD (Ley Organica de Proteccion de Datos)
- Netherlands: UAVG (Uitvoeringswet AVG)
- Poland: Act on Personal Data Protection (2018)

**Tier 2 — Asia-Pacific Sub-nationals**:
- India: state-level IT Act implementations (Karnataka, Maharashtra)
- Australia: state privacy acts (Victoria, NSW)
- China: provincial data regulations (Shanghai, Shenzhen)

**Tier 3 — Latin American Sub-nationals**:
- Brazil: state-level LGPD implementations
- Mexico: state data protection laws
- Argentina: provincial data protection agencies

**Tier 4 — Additional Countries**:
- Israel: Privacy Protection Regulations
- UAE: DIFC and ADGM data protection frameworks (free zone regulations)
- Nigeria: sector-specific data regulations
- Kenya: sector-specific guidelines

**Tier 5 — Healthcare-Specific Regulations**:
- Australia: My Health Records Act 2012
- Japan: Next Generation Medical Infrastructure Act (2018)
- Canada: provincial health information acts (Ontario PHIPA, Alberta HIA, BC E-Health Act)

---

### Deprioritized: 50m TopoJSON Upgrade

**Status:** Deprioritized — cost/benefit does not justify implementation at current regulation count.

**Research (March 2026):**

| | 110m (current) | 50m |
|--|--|--|
| Countries | 177 | 241 (+64) |
| File size | 105 KB | 739 KB (+634 KB, 7x increase) |
| Bahrain | Missing entirely | Present |
| Serbia | Exists, small polygon | Better polygon |
| Singapore | Present | Present (no change) |

- Of 64 countries gained, only **Bahrain** (`BH-PDPL.json`) has a regulation in our data but no renderable polygon. Serbia exists in 110m but is small. Singapore is present in both.
- The 634 KB payload increase is embedded inline at build time — significant for a single missing country.
- No user-reported issues with current resolution.

**Cheaper alternatives if Bahrain visibility becomes needed:**
1. Delete `BH-PDPL.json` (remove unrenderable regulation data)
2. Inject a manual marker/circle at Bahrain's coordinates as a clickable target

**Revisit when:**
- Regulation count for small-island/small-country nations exceeds 5+
- Geographic expansion Tiers 2-4 add sub-national data requiring higher fidelity boundaries
- Users report inability to find or interact with specific countries

---

**Created:** March 2026
**Last updated:** March 2026 (added industry compliance regulations HIPAA and PCI DSS, category/scope schema fields, total 74)
