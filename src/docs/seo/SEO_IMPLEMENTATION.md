# SEO Implementation Guide

Complete technical documentation for the GST website SEO system.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [JSON-LD Structured Data](#json-ld-structured-data)
4. [Meta Tags](#meta-tags)
5. [Open Graph Tags](#open-graph-tags)
6. [Sitemap & Robots](#sitemap--robots)
7. [Semantic HTML](#semantic-html)
8. [Updating Metadata](#updating-metadata)
9. [Testing and Verification](#testing-and-verification)

## Overview

The GST website implements a comprehensive SEO foundation designed to maximize search engine visibility and social media sharing authority for Reid Peryam's M&A technical advisory practice.

**Key Metrics:**
- 18 professional credentials documented
- 10+ expertise areas indexed
- 2 LinkedIn profiles linked
- Full sitemap and robots.txt coverage
- Single `<h1>` on homepage with proper heading hierarchy
- **17 social media meta tags** (11 Open Graph + 6 Twitter Card)
- **Dynamic URL generation** for all environments
- **Enhanced image metadata** with alt text and dimensions

## Architecture

### Component Hierarchy

```
BaseLayout (src/layouts/BaseLayout.astro)
├── SEO Component (src/components/SEO.astro)
│   ├── JSON-LD structured data (ProfessionalService + Person)
│   ├── BreadcrumbList schema (auto-generated from URL)
│   ├── FAQPage schema (conditional, via faqItems prop)
│   ├── Meta tags
│   ├── Open Graph tags
│   └── Twitter Card tags
├── Header
├── Main Content
└── Footer
```

### SEO Component Properties

The `SEO` component accepts the following props:

```typescript
interface Props {
    title?: string;
    description?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    ogType?: string;
    ogUrl?: string;
    canonicalUrl?: string;
    // Enhanced social media meta tags (February 2026)
    ogImageAlt?: string;
    ogImageWidth?: number;
    ogImageHeight?: number;
    ogImageType?: string;
    ogSiteName?: string;
    ogLocale?: string;
    twitterSite?: string;
}
```

**Default Values:**
- `title`: "GST | M&A Strategic Technology Advisory"
- `description`: "M&A technical due diligence, post-acquisition integration, and platform modernization. Led by Reid Peryam, 20-year technology strategy veteran."
- `ogTitle`: "GST | Strategic Technology Advisory"
- `ogDescription`: "Specialized technical diligence and AI strategy for organizations navigating complex product transitions."
- `ogImage`: "/og-image.png" (auto-converted to absolute URL)
- `ogType`: "website"
- `ogUrl`: Auto-generated from Astro.url
- `canonicalUrl`: Auto-generated from Astro.url
- **`ogImageAlt`**: "GST - M&A Strategic Technology Advisory and Technical Due Diligence"
- **`ogImageWidth`**: 1200 (pixels)
- **`ogImageHeight`**: 630 (pixels)
- **`ogImageType`**: "image/png"
- **`ogSiteName`**: "GST"
- **`ogLocale`**: "en_US"
- **`twitterSite`**: "@globalstrategic"
- `faqItems`: undefined (optional array of `{question, answer}` for FAQPage schema)

## JSON-LD Structured Data

### Schema Types Used

#### 1. ProfessionalService
**Location**: Root schema for the organization

```json
{
  "@type": "ProfessionalService",
  "name": "GST",
  "url": "https://globalstrategic.tech",
  "logo": "https://globalstrategic.tech/icon.svg",
  "sameAs": ["https://www.linkedin.com/company/global-strategic-technologies/"]
}
```

**Purpose**: Establishes the organization as a professional services provider and links to company LinkedIn profile.

#### 2. Person (Founder)
**Location**: Nested under ProfessionalService.founder

```json
{
  "@type": "Person",
  "name": "Reid Peryam",
  "jobTitle": "Strategic Technology Advisor",
  "sameAs": ["https://www.linkedin.com/in/reidperyam/"],
  "alumniOf": [
    {
      "@type": "CollegeOrUniversity",
      "name": "UC Berkeley Haas School of Business"
    }
  ],
  "hasCredential": [ /* 18 credential objects */ ]
}
```

**Purpose**: Identifies the founder, establishes authority through education and credentials.

#### 3. EducationalOccupationalCredential
**Location**: Nested under Person.hasCredential (18 instances)

```json
{
  "@type": "EducationalOccupationalCredential",
  "name": "Microsoft Certified: DevOps Engineer Expert",
  "credentialCategory": "Professional Certification",
  "publisher": {
    "@type": "Organization",
    "name": "Microsoft"
  },
  "datePublished": "2021-06",
  "expires": "2027-06",
  "identifier": "6C14577815D1D876",
  "competencyRequired": "Azure DevOps, Software Development Life Cycle (SDLC), Software Development, Azure Solutions"
}
```

**Purpose**: Documents professional certifications with expiration dates and associated skills.

### Complete Credential List

**Microsoft Certifications (5):**
1. DevOps Engineer Expert (2021-06 → 2027-06)
2. Azure Solutions Architect Expert (2021-04 → 2027-04)
3. Azure Developer Associate (2021-05 → 2027-05)
4. Azure AI Engineer Associate (2021-09 → 2026-09)
5. Azure AI Fundamentals (2021-08)

**UC Berkeley Haas Executive Education (11):**
6. Certificate of Business Excellence (2023-09)
7. Berkeley Executive Leadership Program (2023-03)
8. Digital Transformation (2023-01)
9. Artificial Intelligence: Business Strategies and Applications (2023-04)
10. Blockchain and Cryptocurrencies (2023-08)
11. Excellence In Technology Strategy (2022-04)
12. Data Strategy (2022-06)
13. Product Management Studio (2022-08)
14. Business Analytics for Leaders (2022-04)
15. Leading Complex Projects (2022-01)

**Infrastructure Certifications (2):**
16. CKAD: Kubernetes Application Developer (2021-02 → 2024-02)
17. CKA: Kubernetes Administrator (2021-01 → 2024-01)

**Agile Certification (1):**
18. Certified SAFe® 5 Agilist (2021-07 → 2022-07)

### Expertise Areas (knowsAbout)

The following expertise areas are indexed for semantic search:

```json
"knowsAbout": [
  "Technical Due Diligence",
  "M&A Tech Strategy",
  "AI Strategy",
  "Platform Modernization",
  "Cloud Architecture",
  "Digital Transformation",
  "Data Strategy",
  "Kubernetes",
  "Blockchain",
  "Cloud-Native Architecture"
]
```

## Meta Tags

### Standard Meta Tags

**Title Tag** (in `<title>`)
```html
<title>GST | M&A Strategic Technology Advisory</title>
```
- **Length**: 43 characters (optimal for SERPs)
- **Contains**: Primary keyword "M&A Strategic Technology Advisory"
- **Brand**: "GST"

**Meta Description**
```html
<meta name="description" content="Expert strategic technology advisory for M&A buy-side and sell-side technical due diligence, post-acquisition integration, value creation, and platform modernization. Led by Reid Peryam, 20-year veteran in technology strategy execution." />
```
- **Length**: 160 characters (optimal for SERPs)
- **Keywords**: M&A, technical due diligence, platform modernization, Reid Peryam
- **CTR Optimization**: Establishes authority and specific expertise

**Keywords Meta**
```html
<meta name="keywords" content="M&A technical due diligence, technology advisory, platform modernization, AI strategy, technical diligence" />
```

**Author Meta**
```html
<meta name="author" content="Reid Peryam" />
```

**Robots Meta**
```html
<meta name="robots" content="index, follow" />
```
- Allows search engines to index and follow links
- Pass `noindex` to `BaseLayout` to emit `noindex, follow` instead — see [SEO_COMPONENT.md § Keeping a page out of the index](./SEO_COMPONENT.md). Every `noindex` page must also be excluded in `src/utils/sitemap-filter.ts`

**Canonical URL**
```html
<link rel="canonical" href="https://globalstrategic.tech" />
```
- Prevents duplicate content issues
- Specifies preferred version of page

## Open Graph Tags

### Purpose

Open Graph tags control how the site appears when shared on social platforms. Essential for professional networks like LinkedIn.

### Implemented Tags (Enhanced February 2026)

```html
<!-- Open Graph Tags (11 tags) -->
<meta property="og:title" content="GST | Strategic Technology Advisory" />
<meta property="og:description" content="Specialized technical diligence and AI strategy for organizations navigating complex product transitions." />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://globalstrategic.tech/" />
<meta property="og:image" content="https://globalstrategic.tech/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:alt" content="GST - M&A Strategic Technology Advisory and Technical Due Diligence" />
<meta property="og:site_name" content="GST" />
<meta property="og:locale" content="en_US" />

<!-- Twitter Card Tags (6 tags) -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@globalstrategic" />
<meta name="twitter:title" content="GST | Strategic Technology Advisory" />
<meta name="twitter:description" content="Specialized technical diligence and AI strategy for organizations navigating complex product transitions." />
<meta name="twitter:image" content="https://globalstrategic.tech/og-image.png" />
<meta name="twitter:image:alt" content="GST - M&A Strategic Technology Advisory and Technical Due Diligence" />
```

**Total**: 17 meta tags (up from 9 before February 2026 enhancement)

### Platform-Specific Rendering

| Platform | Primary Tag | Fallback |
|----------|------------|----------|
| LinkedIn | og:* tags | Meta description |
| Twitter | twitter:* tags | og:* tags |
| Facebook | og:* tags | Meta description |
| Default | og:image | Favicon |

## Sitemap & Robots

### Sitemap

**Generated at build time** by `@astrojs/sitemap`. There is no checked-in `public/sitemap.xml` — do not add one.

**Submit `https://globalstrategic.tech/sitemap-index.xml`** to Search Console. The integration emits a sitemap _index_ plus per-batch children (`sitemap-0.xml`, …), and `public/robots.txt` already points there.

> **Submitting `/sitemap.xml` instead is the known cause of a duplicate, permanently-stale entry in Search Console.** That path 301s to the index (`vercel.json`), so it is harmless but never updates, and it lingers in the Sitemaps report showing whatever page count it first saw. If you see two sitemaps listed, remove the `/sitemap.xml` one. This doc previously described a static `public/sitemap.xml` and told readers to submit that URL, which is almost certainly how the duplicate got submitted.

**What is excluded**: [`src/utils/sitemap-filter.ts`](../../utils/sitemap-filter.ts). Every page rendered with `noindex` must appear there; see [SEO_COMPONENT.md](./SEO_COMPONENT.md) for the pairing table.

**Maintenance**: none. `lastmod` and the URL list come from the build.

### Robots.txt

Location: `public/robots.txt`

**Purpose**: Controls crawler behavior and directs search engines to sitemap.

**Content**:
```
User-agent: *
Allow: /

Sitemap: https://globalstrategic.tech/sitemap-index.xml
```

**Directives**:
- `User-agent: *` - Applies to all crawlers
- `Allow: /` - Permits full site crawling
- `Sitemap:` - Points to XML sitemap URL

### llms.txt

Location: `public/llms.txt`, served at `https://globalstrategic.tech/llms.txt`.

**Purpose**: the agent-facing site index (the [llms.txt convention](https://llmstxt.org/)): an H1, a one-paragraph summary, then grouped links with a one-line gloss each. It exists so an AI assistant fetching the site cold lands on the MCP documentation, the tools and the library without crawling the navigation. The MCP endpoint and status hostnames are listed as plain URLs; the docs subdomain is not (ADR-0023: one published address).

**Maintenance**: hand-written, and guarded. `tests/unit/llms-txt.test.ts` checks every `globalstrategic.tech` link against the routes under `src/pages/`, against the sitemap exclusion list (a page kept out of the sitemap is not advertised to agents either), and for the docs-subdomain rule. Add a line when a page ships; the test fails on a typo'd or removed route.

### Crawler access on the Worker hosts

`globalstrategic.tech` itself is served by Vercel (DNS-only at Cloudflare), so nothing in this section applies to the website. The three `*.mcp.globalstrategic.tech` hosts are Cloudflare-proxied Workers, and the zone's Cloudflare settings sit in front of them:

- **Managed `robots.txt`** is on: Cloudflare serves a generated `robots.txt` on every Worker host (the Worker has none of its own) with Content Signals `search=yes, ai-train=no, use=reference` and a `Disallow: /` for the named training crawlers (GPTBot, ClaudeBot, CCBot, Google-Extended, and others).
- **AI-bot blocking** is on: requests from AI crawler and AI assistant user agents (GPTBot, ClaudeBot, Claude-User, ChatGPT-User, PerplexityBot, and others) get a Cloudflare 403 on the `docs.` and `status.` hosts. Googlebot and generic clients are unaffected. Observed 2026-09-02; `/robots.txt` and `/.well-known/*` on the apex host were exempt.

Both are dashboard toggles (Cloudflare → `globalstrategic.tech` → Security → Settings, and AI Crawl Control), not repo configuration. The `docs.` host is only a 308 to this site, so blocking it costs nothing for search; it does mean an AI assistant that follows the alias gets a 403 rather than the redirect. Flip the toggle, or allow specific crawlers in AI Crawl Control, if that is not the intended posture.

## Semantic HTML

### Heading Hierarchy

**Required Structure**:
```html
<!-- Single H1 per page -->
<h1>Technology Advisory & Execution</h1>

<!-- Secondary sections use H2 -->
<h2>Who We Support</h2>
<h2>What We Do</h2>
<h2>Why Clients Trust Us</h2>

<!-- Subsections use H3 -->
<h3>Independent, vendor-neutral guidance</h3>
<h3>Deep technical expertise translated into business risk and opportunity</h3>
```

**Standards**:
- One `<h1>` per page (the main page title)
- All sections use `<h2>` or `<h3>` (never skip levels)
- Headings reflect content hierarchy logically
- Never use headings for styling (use CSS instead)

### Image Alt Text

All images must have descriptive alt text that:

1. **Describes the image content** (not redundant with surrounding text)
2. **Includes relevant keywords** when appropriate
3. **Is concise** (aim for 125 characters or less)

**Examples**:

```html
<!-- Service bullet icon -->
<img src="/logo.svg" alt="Service checkmark - Buy-side and sell-side technical diligence" />

<!-- Audience segment icon -->
<img src="/logo.svg" alt="Audience segment - Private equity and investment teams" />

<!-- Logo (decorative with aria-hidden) -->
<img src="/logo.svg" alt="Global Strategic Technologies logo" loading="lazy" aria-hidden="true" />
```

### Main Content Tag

All primary page content should be wrapped in a `<main>` tag:

```html
<html>
  <body>
    <header><!-- Navigation --></header>
    <main>
      <!-- All page content here -->
    </main>
    <footer><!-- Copyright, links --></footer>
  </body>
</html>
```

## Updating Metadata

### For Different Pages

Pass custom props to the SEO component:

**In `src/pages/about.astro`:**
```astro
<BaseLayout
    title="About Reid Peryam | GST"
    description="Learn about Reid Peryam's 20+ year background in technology strategy..."
    ogTitle="Meet Reid Peryam | Strategic Technology Advisor"
    ogDescription="Reid Peryam brings 20+ years of technology strategy execution..."
    ogUrl="https://globalstrategic.tech/about"
>
```

### Adding New Credentials

Edit `src/components/SEO.astro` and add to the `hasCredential` array:

```typescript
{
    "@type": "EducationalOccupationalCredential",
    "name": "Your Certification Name",
    "credentialCategory": "Professional Certification",
    "publisher": {
        "@type": "Organization",
        "name": "Issuing Organization"
    },
    "datePublished": "YYYY-MM",
    "expires": "YYYY-MM",  // Optional for non-expiring credentials
    "identifier": "YOUR_ID",
    "competencyRequired": "Skill 1, Skill 2, Skill 3"
}
```

### Updating Expertise Areas

Edit the `knowsAbout` array in `src/components/SEO.astro`:

```typescript
'knowsAbout': [
    'Existing Expertise',
    'New Expertise Area',
    // Add more as needed
]
```

## Testing and Verification

### Automated Tests

Run the full test suite to ensure no SEO changes break functionality:

```bash
npm run test:all        # All tests (unit, integration, E2E)
npm run test:run        # Quick test run
npm run test:coverage   # Coverage report
```

**Current Status**: ✅ 432/432 tests passing

### Manual Verification

#### 1. Validate JSON-LD

**Tool**: [Google's Structured Data Testing Tool](https://search.google.com/structured-data/testing-tool)

Steps:
1. Go to testing tool
2. Paste your site URL or HTML
3. Verify no errors in structured data
4. Check that Person and ProfessionalService types are recognized

#### 2. Check Open Graph Tags

**Tool**: [Facebook's Open Graph Debugger](https://developers.facebook.com/tools/debug/og/object)

Steps:
1. Enter your site URL
2. Verify OG image loads correctly
3. Check title and description display
4. Click "Fetch New Scrape" to refresh cache

**Tool**: [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/)

Steps:
1. Enter your site URL
2. Verify image, title, and description
3. Check how it appears in LinkedIn feed

#### 3. Test Meta Tags

**Browser DevTools**:
```
1. Open DevTools (F12)
2. Go to Elements/Inspector
3. Search for <meta> tags
4. Verify title, description, keywords, robots directives
```

**Tool**: [Screaming Frog SEO Spider](https://www.screamingfrog.co.uk/seo-spider/) (Free version)

#### 4. Verify Sitemap

**Check Sitemap Structure**:
```bash
# The index, then the child file it references
curl https://globalstrategic.tech/sitemap-index.xml
curl -s https://globalstrategic.tech/sitemap-0.xml | grep -o "<loc>[^<]*</loc>"
```

**Submit to Google Search Console**:
1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add property for your domain
3. Submit sitemap in "Sitemaps" section

#### 5. Test Robots.txt

**Check Robots File**:
```bash
curl https://globalstrategic.tech/robots.txt
```

**Verify in Search Console**:
1. Go to Google Search Console
2. Go to "Crawl" → "robots.txt Tester"
3. Test various URLs to ensure proper crawling

#### 6. Semantic HTML Validation

**Tool**: [W3C HTML Validator](https://validator.w3.org/)

Steps:
1. Enter your site URL
2. Check for semantic HTML errors
3. Verify no heading hierarchy issues
4. Ensure main content in `<main>` tag

**Check Headings Locally**:
```bash
# Using headingsMap extension or manual inspection
1. Open page in browser
2. Verify only one H1 present
3. Check H2/H3 hierarchy makes logical sense
```

## Performance Impact

The SEO implementation has **zero negative performance impact**:

- ✅ JSON-LD is render-blocked (no visual rendering)
- ✅ Meta tags are non-blocking
- ✅ No additional JavaScript required
- ✅ `robots.txt` is a static file; the sitemap is generated at build time (no runtime cost either way)
- ✅ All 432 tests pass with no performance regression

## Enhanced Social Media Features (February 2026)

### Dynamic URL Generation

The SEO component now automatically generates correct URLs for all environments using `Astro.url`:

**Development**:
```html
<meta property="og:url" content="http://localhost:4321/">
<link rel="canonical" href="http://localhost:4321/">
```

**Production**:
```html
<meta property="og:url" content="https://globalstrategic.tech/">
<link rel="canonical" href="https://globalstrategic.tech/">
```

No manual URL specification required unless overriding the current page URL.

### Enhanced Image Metadata

All social platforms receive comprehensive image information:
- **Width & Height**: 1200x630px (optimal for all major platforms)
- **Type**: image/png or image/jpeg
- **Alt Text**: Accessibility-compliant descriptions
- **Automatic URL Conversion**: Relative paths → absolute URLs

### Platform Optimizations

**LinkedIn**:
- `og:site_name` for brand attribution
- Optimized 1.91:1 aspect ratio images
- Alt text for accessibility

**Twitter/X**:
- `twitter:site` handle for profile linking
- `twitter:image:alt` for accessibility
- `summary_large_image` card type

**Facebook/Instagram**:
- Complete Open Graph specification
- `og:locale` for content targeting
- Full image metadata

### Verification

Test your social media previews:
- **LinkedIn**: https://www.linkedin.com/post-inspector/
- **Facebook**: https://developers.facebook.com/tools/debug/
- **Twitter**: https://cards-dev.twitter.com/validator
- **General OG**: https://www.opengraph.xyz/

---

**Last Updated**: March 20, 2026
**Component Version**: 2.0 (Enhanced Social Media)
**Implementation Status**: Production Ready ✓
