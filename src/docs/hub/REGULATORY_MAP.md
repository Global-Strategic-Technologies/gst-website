# Regulatory Map — Technical Documentation

## Overview

The Regulatory Map is an interactive D3.js world map that visualizes global data privacy, AI, and industry compliance regulations across 120 regulations in 29 jurisdictions. Users click highlighted countries, US states, or Canadian provinces to view regulation details in a side panel. Regions with multiple applicable regulations (e.g., an EU member state with both GDPR and the AI Act) display all of them.

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
│     *.json                      ← 120 regulation files (Zod-validated at build time)
│
├── src/data/canada-provinces.json ← TopoJSON for Canadian province boundaries (simplified)
│
├── public/data/
│     world-110m.json             ← World country boundaries (fetched at runtime)
│     us-states-10m.json          ← US state boundaries (fetched at runtime)
│     canada-provinces.json       ← Canadian province boundaries (fetched at runtime)
│
├── src/pages/data/
│     regulations.json.ts         ← Prerendered API endpoint for regulation data
│
├── src/pages/hub/tools/regulatory-map/
│     index.astro                 ← Route entry, D3 rendering, event wiring
│
├── src/types/regulatory-map.ts   ← TypeScript interfaces (Regulation, RegionSelectedDetail)
│
└── src/utils/
      fetchRegulations.ts         ← Build-time data loader with Zod schema validation
      countryCodeMap.ts           ← ISO numeric ↔ alpha-3 mapping + name lookups
      fipsToStateCode.ts          ← FIPS ↔ US-XX state code mapping + name lookups
      canadianProvinceMap.ts      ← CA-XX province code → name mapping
```

All rendering logic runs client-side. Regulation data and TopoJSON geodata are served as static files and fetched in parallel at page load via `Promise.all`, keeping the HTML payload small (~48KB) for fast FCP.

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

1. **Build time**: `fetchAllRegulations()` loads all `src/data/regulatory-map/*.json` files via `import.meta.glob` and validates each against the Zod schema. The result is prerendered to `/data/regulations.json` via a static API endpoint
2. **Static assets**: TopoJSON files (world, US states, Canadian provinces) are served from `public/data/`
3. **Client load**: Page fetches all four data files in parallel via `Promise.all([...fetch()])`, then D3 projects geography with `geoEquirectangular`, renders SVG paths, and colors regions by regulation coverage
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

## Regulation Coverage (120 regulations)

The map covers four categories of regulation: **data privacy** (69), **cybersecurity** (20), **AI governance** (19), and **industry compliance** (12). All categories share the same data schema, rendering pipeline, and region code system. A single region may have multiple regulations from multiple categories.

---

### Data Privacy Regulations (69)

#### Multi-Country (2)

| File | Regulation | Coverage |
|------|-----------|---------|
| `EU-GDPR.json` | General Data Protection Regulation | 27 EU member states |
| `CA-PIPEDA.json` | Personal Information Protection and Electronic Documents Act | All Canadian provinces |

#### US State Privacy Laws (24)

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
| `US-PA-PADPA.json` | Pennsylvania | PADPA |
| `US-RI-RIDTPPA.json` | Rhode Island | RIDTPPA |
| `US-TN-TIPA.json` | Tennessee | TIPA |
| `US-TX-TDPSA.json` | Texas | TDPSA |
| `US-UT-UCPA.json` | Utah | UCPA |
| `US-VA-VCDPA.json` | Virginia | VCDPA |
| `US-VT-DPA.json` | Vermont | DPA |
| `US-WI-WDPA.json` | Wisconsin | WDPA |

#### Canadian Provincial Laws (3)

| File | Province | Law |
|------|----------|-----|
| `CA-QC-LAW25.json` | Quebec | Law 25 |
| `CA-AB-PIPA.json` | Alberta | PIPA |
| `CA-BC-PIPA.json` | British Columbia | PIPA |

#### Asia-Pacific (12)

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
| `BD-DSA.json` | Bangladesh | Data Protection Act 2023 |

#### Europe Non-EU (4)

| File | Country | Law |
|------|---------|-----|
| `GB-DPA.json` | United Kingdom | Data Protection Act 2018 |
| `CH-FADP.json` | Switzerland | nFADP |
| `TR-KVKK.json` | Turkey | KVKK (Law 6698) |
| `RS-LPDP.json` | Serbia | LPDP |

#### Middle East & Africa (11)

| File | Country | Law |
|------|---------|-----|
| `ZA-POPIA.json` | South Africa | POPIA |
| `NG-NDPA.json` | Nigeria | NDPA 2023 |
| `KE-DPA.json` | Kenya | DPA 2019 |
| `AE-PDPL.json` | UAE | PDPL |
| `SA-PDPL.json` | Saudi Arabia | PDPL |
| `EG-PDPL.json` | Egypt | PDPL |
| `RW-DPP.json` | Rwanda | DPP Law |
| `QA-PDPL.json` | Qatar | PDPL |
| `GH-DPA.json` | Ghana | DPA 2012 |
| `TZ-EPDA.json` | Tanzania | PDP Act |
| `UG-DPPA.json` | Uganda | Data Protection and Privacy Act 2019 |

#### Latin America (7)

| File | Country | Law |
|------|---------|-----|
| `BR-LGPD.json` | Brazil | LGPD |
| `AR-PDPA.json` | Argentina | PDPA (Law 25.326) |
| `CO-LAW1581.json` | Colombia | Law 1581 of 2012 |
| `MX-LFPDPPP.json` | Mexico | LFPDPPP |
| `UY-LAW18331.json` | Uruguay | Law 18.331 |
| `PE-LAW29733.json` | Peru | Law 29.733 |
| `EC-LOPDP.json` | Ecuador | LOPDP |

#### Central & South Asia (3)

| File | Country | Law |
|------|---------|-----|
| `PK-POPA.json` | Pakistan | PDP Act |
| `KZ-PDP.json` | Kazakhstan | PDP Law |
| `UZ-PDP.json` | Uzbekistan | PDP Law |

#### Other (3)

| File | Country | Law | Note |
|------|---------|-----|------|
| `SG-PDPA.json` | Singapore | PDPA | |
| `BH-PDPL.json` | Bahrain | PDPL | Not visible on 110m map (too small) |
| `CL-LAW19628.json` | Chile | Law 19.628 | |
| `IL-PPL.json` | Israel | Privacy Protection Law | |

---

### AI Governance Regulations (19)

#### Multi-Country (2)

| File | Regulation | Coverage | Effective |
|------|-----------|---------|-----------|
| `EU-AI-ACT.json` | EU Artificial Intelligence Act (Regulation 2024/1689) | 27 EU member states | 2024-08-01 |
| `US-EXEC-AI.json` | US Executive Order on Safe, Secure, and Trustworthy AI (EO 14110) | 51 US jurisdictions | 2023-10-30 |

#### National AI Laws (8)

| File | Country | Law | Effective |
|------|---------|-----|-----------|
| `CN-ALGO-REC.json` | China | Algorithm Recommendation Regulation | 2022-03-01 |
| `CN-DEEP-SYNTHESIS.json` | China | Deep Synthesis Provisions (deepfakes) | 2023-01-10 |
| `CN-GENAI.json` | China | Interim Measures for Generative AI | 2023-08-15 |
| `KR-AI-BASIC-ACT.json` | South Korea | AI Basic Act | 2026-01-22 |
| `KR-AI-FRAMEWORK.json` | South Korea | AI Basic Act (Framework Act) | 2025-01-22 |
| `JP-AI-PROMOTION.json` | Japan | AI Promotion Act | 2025-06-04 |
| `PE-AI-LAW31814.json` | Peru | AI Promotion Law (Law 31814) | 2023-07-05 |
| `BR-AI-ACT.json` | Brazil | AI Act (PL 2338/2023) | 2025-07-01 |

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

### Cybersecurity Regulations (20)

#### Multi-Country (1)

| File | Regulation | Coverage | Effective |
|------|-----------|---------|-----------|
| `EU-NIS2.json` | Network and Information Security Directive 2 (NIS2) | 27 EU member states | 2024-10-17 |

#### US Federal (2)

| File | Regulation | Coverage | Effective |
|------|-----------|---------|-----------|
| `US-CIRCIA.json` | Cyber Incident Reporting for Critical Infrastructure Act | 51 US jurisdictions | 2026-04-01 |
| `US-CMMC.json` | Cybersecurity Maturity Model Certification 2.0 | 51 US jurisdictions | 2025-03-15 |

#### Asia-Pacific (7)

| File | Country | Law | Effective |
|------|---------|-----|-----------|
| `AU-SOCI.json` | Australia | Security of Critical Infrastructure Act 2018 | 2022-04-02 |
| `CN-CSL.json` | China | Cybersecurity Law | 2017-06-01 |
| `JP-APCS.json` | Japan | Act on Protection of Critical Infrastructure Services | 2024-06-14 |
| `KR-NCIA.json` | South Korea | National Cybersecurity Infrastructure Act | 2024-09-15 |
| `SG-CSA.json` | Singapore | Cybersecurity Act | 2018-08-31 |
| `MY-CSA.json` | Malaysia | Cyber Security Act 2024 | 2024-08-26 |
| `TH-CSA.json` | Thailand | Cybersecurity Act B.E. 2562 | 2019-05-28 |

#### Europe Non-EU (1)

| File | Country | Law | Effective |
|------|---------|-----|-----------|
| `GB-NIS.json` | United Kingdom | NIS Regulations 2018 | 2018-05-10 |

#### Americas (3)

| File | Country | Law | Effective |
|------|---------|-----|-----------|
| `CA-CCCS.json` | Canada | Critical Cyber Systems Protection Act | 2025-06-01 |
| `BR-CNCS.json` | Brazil | National Cybersecurity Policy | 2024-01-01 |
| `IN-CERT.json` | India | CERT-In Cybersecurity Directions | 2022-06-28 |

#### Middle East & Africa (5)

| File | Country | Law | Effective |
|------|---------|-----|-----------|
| `AE-CSL.json` | UAE | Cybersecurity Law | 2023-01-02 |
| `IL-CNDA.json` | Israel | Cyber Network Defense Act | 2022-11-14 |
| `SA-NCA.json` | Saudi Arabia | NCA Essential Cybersecurity Controls | 2018-05-01 |
| `KE-CMCA.json` | Kenya | Computer Misuse and Cybercrimes Act 2018 | 2018-05-30 |
| `NG-NCPS.json` | Nigeria | National Cybersecurity Policy and Strategy 2021 | 2021-02-25 |

#### Oceania (1)

| File | Country | Law | Effective |
|------|---------|-----|-----------|
| `NZ-NCSC.json` | New Zealand | Intelligence and Security Act 2017 | 2017-04-01 |

---

### Industry Compliance Regulations (12)

#### Global Standards (2)

| File | Regulation | Coverage | Effective |
|------|-----------|---------|-----------|
| `GLOBAL-PCI-DSS.json` | Payment Card Industry Data Security Standard (PCI DSS) | ~104 regions (US, Canada, EU, major economies) | 2004-12-15 |
| `GLOBAL-BASEL3.json` | Basel III International Banking Standards | 37 regions | 2023-01-01 |

#### EU (3)

| File | Regulation | Coverage | Effective |
|------|-----------|---------|-----------|
| `EU-DORA.json` | Digital Operational Resilience Act (DORA) | 27 EU member states | 2025-01-17 |
| `EU-AMLD6.json` | Anti-Money Laundering Directive 6 (AMLD6) | 27 EU member states | 2021-06-03 |
| `EU-MIFID2.json` | Markets in Financial Instruments Directive II (MiFID II) | 27 EU member states | 2018-01-03 |

#### US Federal (4)

| File | Regulation | Coverage | Effective |
|------|-----------|---------|-----------|
| `US-HIPAA.json` | Health Insurance Portability and Accountability Act (HIPAA) | 51 US jurisdictions | 1996-08-21 |
| `US-SOX.json` | Sarbanes-Oxley Act (SOX) | 51 US jurisdictions | 2002-07-30 |
| `US-GLBA.json` | Gramm-Leach-Bliley Act (GLBA) | 51 US jurisdictions | 1999-11-12 |
| `US-FCPA.json` | Foreign Corrupt Practices Act (FCPA) | 51 US jurisdictions | 1977-12-19 |

#### Other (3)

| File | Country | Law | Effective |
|------|---------|-----|-----------|
| `AU-AML-CTF.json` | Australia | AML/CTF Act 2006 | 2006-12-12 |
| `GB-FSMA.json` | United Kingdom | Financial Services and Markets Act 2023 | 2023-06-29 |
| `SG-PSA.json` | Singapore | Payment Services Act | 2020-01-28 |

---

## Map Rendering

### Projection

Uses `geoEquirectangular` fitted to the SVG viewport. Countries are rendered from `public/data/world-110m.json`, US states from `public/data/us-states-10m.json`, and Canadian provinces from `public/data/canada-provinces.json`. All three are fetched at runtime in parallel.

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
| Runtime fetch of geodata from `public/data/` | Keeps HTML at ~48KB for fast FCP; data loads in parallel |
| `CustomEvent` for component communication | Native browser API, no framework dependency, decoupled |
| `remove()` for CTA dismissal | Permanent removal rather than `hidden` avoids layout recalculation |

---

## Future Expansion

### Shipped Features

- **Category filter UI** — Filter chips for data privacy, AI governance, industry compliance, cybersecurity. Updates map highlighting and panel cards in real time.
- **Regulation timeline/tracker** — Horizontal scrollable timeline with Today marker and filter-aware display.
- **Search/filter** — Text search across regulation names, summaries, and key requirements with keyboard navigation and map integration.
- **Region bookmarking/sharing** — URL state encoding (`?region=DEU&filter=ai-governance`) with copy-link button in panel header.
- **Cybersecurity frameworks** — 20 cybersecurity regulations including NIS2 (EU), CIRCIA (US), SOCI Act (Australia), and 17 more.
- **Industry compliance expansion** — 12 regulations including DORA, SOX, GLBA, Basel III, AMLD6, MiFID II.
- **Mobile UX** — Bottom sheet panel, two-tap flow with tap bar, quick-zoom region buttons, drag handle, overlay dismiss.

### Feature Roadmap

**UX Improvements:**
- Coverage stats strip — Compact stat counters between the page header and the map showing key metrics at a glance (see design spec below)
- Print/export — PDF export of selected region's regulation cards for inclusion in diligence reports
- Regulation change alerts — Flag regulations with recent amendments or pending changes

**Data Expansion:**
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

### Design Spec: Coverage Stats Strip

**Purpose:** Fill the empty space between the page header and the map with a compact stats strip that communicates the map's breadth at a glance — before the user interacts with anything.

**Placement:** Between `<HubHeader>` and `<div class="map-layout">` in `index.astro` (line ~58).

**Layout:**

```
┌──────────────────────────────────────────────────────────────────┐
│  120            4                  60+              2004–2027    │
│  Regulations    Categories         Jurisdictions    Date Range  │
└──────────────────────────────────────────────────────────────────┘
```

- Horizontal row of 4 stat items, divided by subtle vertical separators
- Desktop: single row, centered, with `gap: var(--spacing-xl)`
- Mobile: 2×2 grid (matches existing `StatsBar.astro` responsive pattern)
- Values are large (`heading-md` / `--text-2xl`), labels are small (`--text-xs`, muted)

**Stats (computed at build time from `regulations` array):**

| Value | Label | Source |
|-------|-------|--------|
| `regulations.length` | Regulations | Count of all JSON files |
| `4` | Categories | Hardcoded (data-privacy, ai-governance, industry-compliance, cybersecurity) |
| Unique region count | Jurisdictions | `new Set(regulations.flatMap(r => r.regions)).size` |
| Date range | Date Range | `min(effectiveDate)` – `max(effectiveDate)` year |

**Styling approach:**
- Reuse the existing `.stats-bar` / `.stat-item` pattern from `global.css` (already handles dark theme, responsive grid, separator borders)
- OR scope new styles inside `index.astro`'s `<style>` block if the global pattern doesn't fit visually (the global stats bar has a dark background which may clash)
- Use CSS variables for all colors, spacing, typography — no hardcoded values
- Primary color accent on the numeric values (`var(--color-primary)`) for visual pop

**Animation (optional, low priority):**
- Count-up animation on scroll-into-view using `IntersectionObserver` + `requestAnimationFrame`
- Falls back to static numbers if `prefers-reduced-motion: reduce`

**Implementation notes:**
- All values are available at build time in the frontmatter (`regulations` is already fetched)
- No client JS required for the base implementation — pure SSG HTML
- Responsive breakpoint matches existing page: `@media (min-width: 1024px)`

**Files to modify:**
- `src/pages/hub/tools/regulatory-map/index.astro` — add HTML + scoped styles in frontmatter/template

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
- The 634 KB payload increase would add to the runtime fetch payload — significant for a single missing country. (Note: geodata is now fetched at runtime from `public/data/`, not embedded inline, so the impact is on network transfer rather than HTML size.)
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
**Last updated:** March 2026 (120 regulations across 4 categories, URL bookmarking, shipped features documented)
