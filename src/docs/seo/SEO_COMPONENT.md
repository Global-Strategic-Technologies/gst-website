# SEO Component Technical Documentation

Detailed technical guide for the reusable Astro SEO component.

## Table of Contents

1. [Component Overview](#component-overview)
2. [Usage](#usage)
3. [Props Interface](#props-interface)
4. [Output](#output)
5. [Examples](#examples)
6. [Troubleshooting](#troubleshooting)

## Component Overview

### Location
`src/components/SEO.astro`

### Purpose
Provides a reusable, composable component that injects comprehensive SEO metadata into any Astro page.

### Features
- JSON-LD structured data (ProfessionalService + Person schemas)
- Enhanced Open Graph (OG) tags for social sharing (11 tags)
- Enhanced Twitter Card tags (6 tags)
- Dynamic URL generation using Astro.url
- Image metadata (width, height, type, alt text)
- Site-level metadata (site name, locale)
- Standard meta tags (title, description, keywords, author, robots)
- Canonical URL support with automatic generation
- BreadcrumbList schema (auto-generated from URL pathname)
- FAQPage schema (conditional, via faqItems prop)
- Props-based customization
- Sensible defaults for homepage

## Usage

### Basic Implementation (in layout or page)

```astro
---
import SEO from '../components/SEO.astro';
---

<html>
  <head>
    <SEO
      title="Page Title | Site Name"
      description="Page description for search results"
    />
  </head>
  <body>
    <!-- Page content -->
  </body>
</html>
```

### With BaseLayout (Recommended)

The component is already integrated into `BaseLayout.astro`. Pass SEO props through the layout:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---

<BaseLayout
  title="About Reid Peryam | GST"
  description="Learn about Reid Peryam's background in technology strategy..."
  ogTitle="Meet Reid Peryam"
  ogDescription="20+ year veteran in M&A technical advisory"
  ogImage="https://globalstrategic.tech/reid-photo.jpg"
  ogUrl="https://globalstrategic.tech/about"
>
  <!-- Page content -->
</BaseLayout>
```

## Props Interface

### TypeScript Definition

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
    // Enhanced social media meta tags
    ogImageAlt?: string;
    ogImageWidth?: number;
    ogImageHeight?: number;
    ogImageType?: string;
    ogSiteName?: string;
    ogLocale?: string;
    twitterSite?: string;
    faqItems?: Array<{ question: string; answer: string }>;
}
```

### Props Reference

| Prop | Type | Default | Purpose |
|------|------|---------|---------|
| `title` | string | "GST \| M&A Strategic Technology Advisory" | Page `<title>` tag content |
| `description` | string | Full expert advisory description | Meta description tag |
| `ogTitle` | string | "GST \| Strategic Tech Advisory" | og:title for social sharing |
| `ogDescription` | string | "Specialized technical diligence..." | og:description for social sharing |
| `ogImage` | string | "/og-image.png" | og:image URL for social sharing |
| `ogType` | string | "website" | og:type (website, article, etc.) |
| `ogUrl` | string | Auto-generated from Astro.url | og:url (page URL) - dynamically generated |
| `canonicalUrl` | string | Auto-generated from Astro.url | Canonical URL - dynamically generated |
| **`ogImageAlt`** | string | "GST - M&A Strategic Technology Advisory and Technical Due Diligence" | Alt text for social preview image (accessibility) |
| **`ogImageWidth`** | number | 1200 | Image width in pixels |
| **`ogImageHeight`** | number | 630 | Image height in pixels |
| **`ogImageType`** | string | "image/png" | MIME type of image |
| **`ogSiteName`** | string | "GST" | Site name for social cards |
| **`ogLocale`** | string | "en_US" | Locale for content |
| **`twitterSite`** | string | "@globalstrategic" | Twitter/X handle for attribution |
| **`faqItems`** | Array | undefined | FAQ question/answer pairs for FAQPage schema markup |

### Props Details

#### `title`
- Displayed in browser tab and search results
- Target: 50-60 characters
- Include primary keyword and brand name
- Example: "Buy-Side M&A Due Diligence Guide | GST"

#### `description`
- Displayed in search results below title
- Target: 150-160 characters
- Should summarize page content
- Include 1-2 primary keywords
- Example: "Expert buy-side technical due diligence strategies for software acquisitions. Led by Reid Peryam with 20+ years M&A experience."

#### `ogTitle`
- Displayed when shared on LinkedIn, Twitter, Facebook
- Can differ from `title` (usually shorter and punchier)
- Target: 40-50 characters
- Example: "M&A Technical Diligence | Strategic Tech Advisory"

#### `ogDescription`
- Displayed when shared on social platforms
- Target: 85-97 characters
- Should entice click-through from social feed
- Example: "Strategic technical diligence for your next acquisition."

#### `ogImage`
- Image displayed when link is shared
- **Default**: `/og-image.png` (1200x630px)
- Automatically converted to absolute URL in development and production
- Recommended: 1200x630px for optimal display on all platforms
- Supported formats: JPG, PNG, GIF, WebP
- Can be relative (`/og-image.png`) or absolute (`https://example.com/image.png`)

#### `ogImageAlt` (NEW)
- Alt text for social preview image
- **Important for accessibility** and WCAG compliance
- Target: 125 characters or less
- Descriptive text for screen readers and when image fails to load
- Example: "GST - M&A Strategic Technology Advisory"

#### `ogImageWidth` / `ogImageHeight` (NEW)
- Dimensions of social preview image in pixels
- **Default**: 1200x630px (optimal for LinkedIn, Twitter, Facebook)
- Helps social platforms render image correctly
- Should match actual image dimensions

#### `ogImageType` (NEW)
- MIME type of the social preview image
- **Default**: `image/png`
- Common values: `image/jpeg`, `image/png`, `image/webp`
- Must match actual image format

#### `ogSiteName` (NEW)
- Site name displayed in social cards
- **Default**: "GST"
- Provides brand attribution on social platforms
- Typically your organization or brand name

#### `ogLocale` (NEW)
- Language and region code for content
- **Default**: `en_US`
- Format: language_TERRITORY (e.g., `en_US`, `es_ES`, `fr_FR`)
- Helps social platforms display content appropriately

#### `ogType`
- Must be valid Open Graph type
- Common values: `website`, `article`, `business.business`
- Default for GST: `website`

#### `ogUrl`
- The canonical URL of the page
- **Auto-generated** from `Astro.url` if not provided
- Development: `http://localhost:4321/page`
- Production: `https://globalstrategic.tech/page`
- Important for tracking shares per page
- Only override if you need a different URL than the current page

#### `canonicalUrl`
- Prevents duplicate content penalties
- **Auto-generated** from `Astro.url` if not provided
- Should match your preferred URL version
- Often the same as `ogUrl`
- Use when page has multiple URLs that should be consolidated

#### `twitterSite` (NEW)
- Twitter/X handle for site attribution
- **Default**: `@globalstrategic` (update with actual handle)
- Format: `@username` (include the @ symbol)
- Displays "by @username" on Twitter cards
- Links to your Twitter profile when card is shared

## Output

### Generated HTML Output

The SEO component generates the following HTML:

```html
<!-- JSON-LD Structured Data -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  "name": "GST",
  ...
}
</script>

<!-- BreadcrumbList Structured Data (non-homepage pages only) -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [...]
}
</script>

<!-- FAQPage Structured Data (when faqItems provided) -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [...]
}
</script>

<!-- Open Graph Meta Tags (11 tags) -->
<meta property="og:title" content="..." />
<meta property="og:description" content="..." />
<meta property="og:type" content="website" />
<meta property="og:url" content="..." />
<meta property="og:image" content="..." />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:alt" content="..." />
<meta property="og:site_name" content="GST" />
<meta property="og:locale" content="en_US" />

<!-- Twitter Card Tags (6 tags) -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@globalstrategic" />
<meta name="twitter:title" content="..." />
<meta name="twitter:description" content="..." />
<meta name="twitter:image" content="..." />
<meta name="twitter:image:alt" content="..." />

<!-- Canonical URL -->
<link rel="canonical" href="..." />

<!-- Additional SEO Tags -->
<meta name="keywords" content="M&A technical due diligence, technology advisory, ..." />
<meta name="author" content="Reid Peryam" />
<meta name="robots" content="index, follow" />
```

### Where Output Appears

The component outputs into the `<head>` of your HTML document:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <!-- Standard meta tags -->
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <!-- SEO Component Output (all meta tags, JSON-LD, etc.) -->
    <title>...</title>
    <script type="application/ld+json">...</script>
    <meta property="og:*" ... />
    <!-- etc. -->
  </head>
  <body>
    <!-- Page content -->
  </body>
</html>
```

## Examples

### Example 1: Homepage (Default Props)

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---

<BaseLayout
  title="GST | M&A Strategic Technology Advisory"
  description="Expert strategic technology advisory for M&A buy-side and sell-side technical due diligence..."
>
  <!-- Content -->
</BaseLayout>
```

**Output**:
- Title: "GST | M&A Strategic Technology Advisory"
- OG Image: Default og-image.png (1200x630px)
- OG URL: Auto-generated from current page
- Canonical: Auto-generated from current page
- 17 total meta tags (11 OG + 6 Twitter)

### Example 2: Services Page

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---

<BaseLayout
  title="Our Services | M&A Technical Advisory | GST"
  description="Comprehensive M&A technical advisory services including buy-side and sell-side due diligence, platform assessments, and integration planning."
  ogTitle="M&A Technical Advisory Services"
  ogDescription="Buy-side & sell-side diligence, platform assessments, integration planning"
  ogImage="/og-image.png"
  ogImageAlt="GST Services - M&A Advisory and Technical Leadership"
>
  <!-- Services content -->
</BaseLayout>
```

**Output**:
- Title: "Our Services | M&A Technical Advisory | GST"
- Description: Full services description
- OG Title: "M&A Technical Advisory Services"
- OG Image: /og-image.png with alt text
- OG URL: Auto-generated (https://globalstrategic.tech/services in production)
- Canonical: Auto-generated (https://globalstrategic.tech/services in production)
- Enhanced meta tags: image dimensions, type, alt text, site name, locale, Twitter handle

### Example 3: Blog Article

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---

<BaseLayout
  title="Platform Modernization in M&A | GST"
  description="How to assess platform modernization opportunities during technical due diligence. Real-world case studies and frameworks."
  ogTitle="Platform Modernization in M&A"
  ogDescription="Assessment frameworks and case studies for M&A platform modernization"
  ogImage="/images/blog/platform-modernization-1200x630.png"
  ogImageAlt="Platform Modernization in M&A Transactions - Strategic Framework"
  ogImageWidth={1200}
  ogImageHeight={630}
  ogType="article"
>
  <!-- Article content -->
</BaseLayout>
```

**Output**:
- Type: article (for rich preview on LinkedIn)
- OG Image: Custom article image (1200x630px) with alt text
- OG URL: Auto-generated from current page
- All enhanced meta tags including image metadata
- Proper LinkedIn article schema

## Troubleshooting

### Issue: JSON-LD Not Rendering

**Symptom**: Google Structured Data Testing Tool shows no data found

**Cause**: JSON-LD script tag not in `<head>` before component

**Solution**:
```astro
<head>
  <!-- Ensure SEO component is early in head -->
  <SEO ... />
  <!-- Other head content -->
</head>
```

### Issue: Open Graph Tags Not Showing in Social Preview

**Symptom**: Social platforms showing old/generic preview

**Cause**: Social platforms cache OG tags (usually 1-24 hours)

**Solution**:
1. Update tags in component
2. Use platform's cache clearing tool:
   - [Facebook Debugger](https://developers.facebook.com/tools/debug/og/object/)
   - [LinkedIn Inspector](https://www.linkedin.com/post-inspector/)
   - [Twitter Card Validator](https://cards-dev.twitter.com/validator)
3. Wait for re-crawl (up to 24 hours)

### Issue: Meta Description Not Showing in Search Results

**Symptom**: Google shows different description or truncates text

**Cause**: Description too long or not relevant to content

**Solutions**:
1. Ensure description is 150-160 characters
2. Move important keywords to front of description
3. Avoid keyword stuffing
4. Make description match page content

**Example**:
```astro
<!-- Too long (182 chars) -->
description="We help organizations navigate complex M&A technical challenges including..."

<!-- Better (156 chars) -->
description="Expert M&A technical advisory: due diligence, platform assessment, integration planning."
```

### Issue: Canonical URL Being Ignored

**Symptom**: Google Search Console shows canonical as different URL

**Cause**: Conflicting canonical tags or improper URL format

**Solutions**:
1. Use absolute URLs only (not relative)
2. Ensure URL matches actual page location
3. Verify no other canonical tags on page
4. Check domain casing (gst-website.com vs GST-Website.com)

### Issue: Component Props Not Working

**Symptom**: Changes to props not appearing in output

**Cause**: Astro build cache issue

**Solution**:
```bash
# Clear Astro cache
rm -rf .astro

# Rebuild
npm run build

# Or full reset
npm run clean
npm run build
```

### Issue: JSON-LD Appears in Rendered HTML but Not in Meta Tags

**Symptom**: Script tag visible in page content (shouldn't be)

**Cause**: `set:html` directive issue or script not rendering

**Solution**:
Verify component has proper Astro directives:
```astro
<!-- Correct -->
<script type="application/ld+json" set:html={JSON.stringify(jsonLdData)} />

<!-- Wrong (will render as text) -->
<script type="application/ld+json">{JSON.stringify(jsonLdData)}</script>
```

### Issue: OG Image Not Displaying

**Symptom**: Social platforms show broken image or generic thumbnail

**Causes**:
1. Image URL is invalid or inaccessible
2. Image size too small (< 200x200px)
3. Image in unsupported format
4. CORS issues

**Solutions**:
1. Verify image URL is accessible and public
2. Use image at least 1200x630px for best display
3. Use standard formats: JPG, PNG, GIF, WebP
4. Test with Facebook Debugger tool

```astro
<!-- Good OG image URLs (all work now!) -->
ogImage="/og-image.png"  <!-- Relative - auto-converted to absolute -->
ogImage="https://globalstrategic.tech/images/og-image.png"  <!-- Absolute -->
ogImage="/images/custom-1200x630.png"  <!-- Relative path - auto-converted -->

<!-- Avoid -->
ogImage="https://example.com/image.webp"  <!-- Wrong domain -->
ogImage="image.png"  <!-- Missing leading slash -->
```

**Note**: As of February 2026, the component **automatically converts relative URLs to absolute URLs** using `Astro.url`, so you can use relative paths like `/og-image.png` and they'll work correctly in both development and production.

## Performance Considerations

### Build Performance
- Component has no runtime cost (all static generation)
- JSON-LD generation happens at build time
- No performance impact on page load

### Runtime Performance
- All SEO tags are static HTML
- No JavaScript execution required
- No blocking resources
- Minimal HTML size increase (~3-4KB per page with enhanced tags)
- Dynamic URL generation happens at build time (zero runtime cost)

### Optimization Tips

1. **Reuse descriptions**: Similar pages can share descriptions
2. **Use concise titles**: Shorter = faster parsing
3. **Optimize OG images**: Use appropriate size (1200x630px)
4. **Lazy load images**: Keep og:image on CDN

## Enhanced Social Media Features (February 2026)

### Dynamic URL Generation

The SEO component now uses `Astro.url` to automatically generate correct URLs for all environments:

**Development**:
```html
<meta property="og:url" content="http://localhost:4321/services/">
<link rel="canonical" href="http://localhost:4321/services/">
```

**Production**:
```html
<meta property="og:url" content="https://globalstrategic.tech/services/">
<link rel="canonical" href="https://globalstrategic.tech/services/">
```

You no longer need to manually specify `ogUrl` or `canonicalUrl` unless you need to override the current page URL.

### Enhanced Image Metadata

All social platforms now receive comprehensive image metadata:

- **Dimensions**: `og:image:width` and `og:image:height` (1200x630px)
- **Type**: `og:image:type` (image/png or image/jpeg)
- **Alt Text**: `og:image:alt` for accessibility
- **Automatic URL conversion**: Relative paths become absolute URLs

### Platform-Specific Optimizations

**LinkedIn**:
- Receives `og:site_name` for proper brand attribution
- Image dimensions optimized for LinkedIn's 1.91:1 aspect ratio
- Alt text improves accessibility and engagement

**Twitter/X**:
- `twitter:site` handle for attribution and linking
- `twitter:image:alt` for accessibility
- `summary_large_image` card type for maximum impact

**Facebook/Instagram**:
- Full Open Graph specification support
- `og:locale` for proper content targeting
- Image metadata for optimal rendering

### Total Meta Tag Count

- **Before**: 9 meta tags (5 OG + 4 Twitter)
- **After**: 17 meta tags (11 OG + 6 Twitter)
- **New tags**: 8 additional tags for enhanced social sharing

---

**Last Updated**: March 20, 2026
**Component Version**: 2.0 (Enhanced Social Media)
**Status**: Production Ready ✓
