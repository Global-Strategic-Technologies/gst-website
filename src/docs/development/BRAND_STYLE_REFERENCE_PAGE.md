# Brand Style Reference Page

A single, shareable web page at `/brand` that renders the live design system — color palette, typography scale, spacing, component patterns, and brand guidelines — directly from the site's CSS variables and utility classes. Unlisted in navigation but publicly accessible for handoff, auditing, and integration reference.

**Status**: Complete
**Priority**: Medium — governance and handoff enablement
**Last Updated**: March 27, 2026

---

## Motivation

The design system is currently documented across several Markdown files (`VARIABLES_REFERENCE.md`, `TYPOGRAPHY_REFERENCE.md`, `BRAND_GUIDELINES.md`, `STYLES_GUIDE.md`). These are useful for developers working in the repo but have limitations:

- **Not shareable** — Markdown files require repo access; designers, brand reviewers, and integration partners don't have it
- **Not live** — documentation can drift from the actual CSS variables; a rendered page is always current
- **Not visual** — reading `--color-primary: #05cd99` is less useful than seeing a swatch with the value, its dark-theme counterpart, and its semantic usage
- **Scattered** — a reviewer must open 4 files to get the full picture; a single page consolidates everything

A `/brand` page solves all four: it's a URL anyone can open, it renders live values from the stylesheet, and it's one page.

---

## Page Design

### URL and Discoverability

- **Route**: `/brand` (or `/style-guide` — TBD)
- **Not linked** from navigation, footer, sitemap, or any public page
- **No `noindex` meta** — it's fine if search engines find it; the content isn't sensitive
- **Accessible to anyone with the URL** — no auth required

### Sections

#### 1. Brand Identity

- GST logo (light and dark variants) with usage rules (clear space, minimum size)
- Brand voice summary (authoritative, precise, technical — pulled from BRAND_GUIDELINES.md)
- Wordmark usage: "Global Strategic Technologies" vs "GST" context rules

#### 2. Color Palette

For each color variable, render:
- **Swatch** — filled rectangle with the actual computed color
- **Variable name** — e.g., `--color-primary`
- **Hex value** — e.g., `#05cd99`
- **Dark theme value** — shown side-by-side or via toggle
- **Usage note** — e.g., "Primary actions, active states, accents"

Groups:
- **Primary & Secondary** — `--color-primary`, `--color-secondary`, their dark variants
- **Semantic** — `--color-success`, `--color-warning`, `--color-error`, `--color-info`
- **Text hierarchy** — `--text-primary` through `--text-faded` (light + dark)
- **Backgrounds** — `--bg-light`, `--bg-light-alt`, `--bg-dark`, `--bg-dark-secondary`, `--bg-dark-tertiary`
- **Borders & Accents** — `--border-light`, `--accent-light-bg`, `--accent-light-bg-hover`
- **Tool-specific** — hub authority blue, DM domain colors, ICG maturity colors, TechPar zone colors, RegMap category colors

#### 3. Typography

- Render each typography utility class (`.heading-xl` through `.label-small`) as a live specimen with class name, computed size, weight, and line-height
- Font stack: `--font-family` value
- Font weight scale: normal (400), semibold (600), bold (700)
- Text size scale: `--text-xs` through `--text-2xl` with computed rem/px values

#### 4. Spacing Scale

- Visual blocks showing each spacing value (`--spacing-xs` through `--spacing-3xl`) as proportional rectangles with pixel values
- Gap scale: `--gap-tight` through `--gap-extra-wide`

#### 5. Component Patterns

Live-rendered examples of shared UI elements:
- **Buttons** — `.hub-btn--primary`, `.hub-btn--secondary`, `.hub-btn--full`, disabled states, `.cta-button` (branded)
- **Authority line** — `.tool-authority` specimen
- **Section label** — `.tool-section-label` specimen
- **Tool shell** — `.tool-shell` with width variants
- **Interactions** — `.interactive`, `.link-interactive`, `.focus-outline` examples
- **Skeleton loading** — `.skeleton-bar`, `.skeleton-dot` animations

#### 6. Dark Theme

- Full-page toggle between light and dark
- All swatches and specimens update live to show both theme states
- Already handled by the existing `ThemeToggle` component

#### 7. Transitions & Shadows

- `--transition-fast`, `--transition-normal`, `--transition-slow` — animated examples
- `--shadow-sm`, `--shadow-md`, `--shadow-lg` — box examples

#### 8. UI Component Library

A centralized reference for all shared UI controls and patterns used across the site. Over time this library grows to define the UX platform standards. Each specimen renders live markup using the real CSS classes — no mocks.

##### 8a. Navigation
- **Breadcrumb** — `.breadcrumb` trail pattern (Home / Section / Page) with link styling and current-page truncation
- **Nav Link** — `.nav-link` with default, hover, active, and focus states

##### 8a-2. Wizard Progress & Selection
- **Wizard Progress Bar (Desktop)** — `.wizard-progress` with `.progress-segment` steps showing completed (filled delta), active (scaled, primary stroke), and inactive (faded) states
- **Wizard Progress Bar (Mobile)** — `.wizard-progress-mobile` with `.progress-dot` delta triangles (even dots flipped 180°), step counter label
- **Option Card** — `.option-card` selectable button with delta icon, label, description; `.selected` state shows primary border + accent background; single-select behavior via JS

##### 8b. Cards
- **Trust Card** — accent-wash background, hover lift + shadow, used in credibility sections (`.trust-card`)
- **Project Card** — header with year badge, metrics box with primary-color left border, 3-line summary clamp, tag row, full-width CTA (`.project-card`)
- **Teaser Card** — centered card for hub tool/article teasers with feature bullet list, status badge, and launch CTA (`.teaser-card`)
- **Recommendation Card** — collapsible card with priority/effort badges (`.icg-rec-badge--high`, `--medium`, `--low`, `--effort`), N/A dismiss button, delta chevron toggle, and `is-collapsed`/`is-dismissed` states (`.icg-rec-card`)
- **Attention Card** — left-border accent colored by relevance level (`relevance-high` = authority blue, `relevance-medium` = methodology brown), collapsible with divider + description, N/A dismiss (`.doc-attention-card`)

##### 8c. Form Controls
- **Search Input** — `.search-box` with icon overlay and `.search-input` focus states
- **Range Slider** — `.calc-slider` with synced `.hint-input` for direct numeric entry, cross-browser thumb/track styling, and `.slider-value` display
- **Filter Chips** — `.filter-chip` with inactive, hover, and `.active` states
- **Filter Button with Badge** — `.filter-button` with `.filter-badge` count indicator (pulsing animation)

##### 8d. Overlays
- **Modal Dialog** — HTML5 `<dialog>` with backdrop blur, clip-path beveled corners, close button, scrollable content (`.project-modal`)
- **Filter Drawer** — slide-out panel (right on desktop, bottom sheet on mobile) with overlay dismiss

##### 8e. Collapsible Content
- **Methodology Panel** — `.tool-methodology` using `<details>` with unicode triangle trigger (rotates 90°), plus `.tool-methodology--delta` variant using brand delta SVG mask (rotates 180°), expandable body with author attribution
- **Details/Summary** — native `<details>` pattern with custom +/− toggle indicator

##### 8f. Data Display
- **Stats Bar** — `.stats-bar` with `.stat-item` grid showing value + label pairs on primary-color background
- **Bench Table** — `.tool-bench-table` with active row highlighting (`.bench-row--active`) and label badges (`.bench-label--score`, `.bench-label--stage`)
- **Badges/Tags** — `.year-badge`, `.tech-tag`, `.badge`, `.bench-label` variants with theme-aware colors

##### 8g. Layout Containers
- **Container** — `.container` (1600px max-width, 3rem horizontal padding)
- **CTA Box** — `.cta-box` with primary-color border, corner bracket pseudo-elements, heading + description + button

##### 8h. Feedback & Loading
- **Skeleton loading** — `.skeleton-bar`, `.skeleton-bar--sm`, `.skeleton-dot` with pulse animation (already rendered in design primitives section)

---

## Implementation

### Approach

A single Astro page that reads live CSS variable values via `getComputedStyle()` at render time. No hardcoded values — if a variable changes in `variables.css`, the page automatically reflects it.

### File Structure

| File | Purpose |
|------|---------|
| `src/pages/brand.astro` | Page route — imports BaseLayout, renders all sections |
| `src/styles/global.css` | No changes — page consumes existing variables and classes |

### Key Implementation Details

- Use `getComputedStyle(document.documentElement).getPropertyValue('--color-primary')` in a client script to populate hex value labels
- Typography specimens use the actual utility classes — no mocked styles
- Component examples use the real global classes (`.hub-btn--primary`, `.tool-authority`, etc.)
- Dark theme toggle uses the existing `ThemeToggle` component; all swatches react automatically via CSS variables
- Page uses `BaseLayout.astro` for consistent header/footer
- Minimal custom CSS scoped to the page — mostly layout grid for swatches

### Rendering Strategy

Since this is an Astro SSG site, the hex value labels need client-side JS to read computed styles. Two options:

1. **Client script** — a small `<script>` that reads `getComputedStyle` on mount and populates `[data-color-value]` spans
2. **Hardcoded with build-time extraction** — parse `variables.css` at build time and inject values

Option 1 is simpler and always accurate. Option 2 avoids a flash of empty labels but adds build complexity. Recommend option 1.

---

## Verification

### Design Tokens
- All color swatches render with correct computed values
- Toggle dark theme — all swatches and specimens update
- Typography specimens match the actual rendered sizes on tool pages
- Spacing blocks are proportionally correct
- Button specimens are interactive (hover, focus, disabled states work)

### UI Component Library
- Card specimens display at realistic sizes with hover lift/shadow effects
- Modal demo opens and closes via button
- Filter chips toggle active state on click
- Collapsible methodology panel expands and collapses
- Stats bar and bench table render with correct styling
- Breadcrumb specimen renders static trail with link styling
- All specimens respond to dark theme toggle

### General
- Page renders correctly at 768px and 480px
- Print: page prints cleanly (useful for physical handoff)
- URL is not linked from any navigation element

---

## Related

- [VARIABLES_REFERENCE.md](../styles/VARIABLES_REFERENCE.md) — source of truth for all design tokens
- [TYPOGRAPHY_REFERENCE.md](../styles/TYPOGRAPHY_REFERENCE.md) — typography utility classes
- [BRAND_GUIDELINES.md](../styles/BRAND_GUIDELINES.md) — brand voice, color hierarchy, asset rules
- [STYLES_GUIDE.md](../styles/STYLES_GUIDE.md) — CSS conventions and patterns
