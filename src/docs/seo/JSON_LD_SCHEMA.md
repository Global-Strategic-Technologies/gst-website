# JSON-LD Schema Reference

Complete reference guide for the JSON-LD structured data implementation on globalstrategic.tech.

## Table of Contents

1. [Schema Overview](#schema-overview)
2. [Root Schema: ProfessionalService](#root-schema-professionalservice)
3. [Nested Schema: Person (Founder)](#nested-schema-person-founder)
4. [Credential Objects](#credential-objects)
5. [BreadcrumbList Schema](#breadcrumblist-schema)
6. [FAQPage Schema](#faqpage-schema)
7. [Skills Association](#skills-association)
8. [Validation](#validation)
9. [Update Guidelines](#update-guidelines)

## Schema Overview

The site implements a hierarchical JSON-LD schema with the following structure:

```
ProfessionalService (Organization)
├── name: GST
├── url: https://globalstrategic.tech
├── logo: https://globalstrategic.tech/icon.svg
├── sameAs: [LinkedIn company profile]
├── founder: Person
│   ├── name: Reid Peryam
│   ├── jobTitle: Strategic Technology Advisor
│   ├── sameAs: [LinkedIn personal profile]
│   ├── alumniOf: [Educational institutions]
│   └── hasCredential: [18 credential objects]
├── description: Company mission statement
├── knowsAbout: [10 expertise areas]
└── address: PostalAddress

BreadcrumbList (per-page, non-homepage only)
├── itemListElement: [ListItem, ...]
└── Generated from URL pathname

FAQPage (conditional, per-page)
├── mainEntity: [Question/Answer pairs]
└── Only rendered when faqItems provided
```

## Root Schema: ProfessionalService

### Purpose

Identifies Global Strategic Technology as a professional services organization specializing in M&A technical advisory.

### Schema Definition

```json
{
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  "name": "GST",
  "url": "https://globalstrategic.tech",
  "logo": "https://globalstrategic.tech/icon.svg",
  "sameAs": [
    "https://www.linkedin.com/company/global-strategic-technologies/"
  ],
  "description": "Strategic Technology Advisory focusing on M&A technical due diligence, platform modernization, and AI/data strategy.",
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
  ],
  "address": {
    "@type": "PostalAddress",
    "addressCountry": "US"
  },
  "founder": { /* Person object */ }
}
```

### Field Descriptions

| Field | Type | Purpose |
|-------|------|---------|
| `@context` | String | Schema.org namespace (always "https://schema.org") |
| `@type` | String | Schema type (ProfessionalService for advisory firms) |
| `name` | String | Official organization name |
| `url` | URL | Primary website URL |
| `logo` | URL | Organization logo (should be SVG or PNG) |
| `sameAs` | Array[URL] | Links to social profiles (LinkedIn, Twitter, etc.) |
| `description` | String | Brief description of services (155-160 chars recommended) |
| `knowsAbout` | Array[String] | Areas of expertise and specialization |
| `address` | PostalAddress | Business location (at minimum, country) |
| `founder` | Person | Founder information with credentials |

### SEO Impact

**Search Engine Recognition**:
- Identifies organization type in search results
- Enables "Knowledge Panel" display on Google
- Improves local search visibility
- Enhances brand recognition in SERPs

**LinkedIn Integration**:
- `sameAs` link drives traffic to company LinkedIn
- Establishes ownership verification
- Improves LinkedIn SEO for company profile

## Nested Schema: Person (Founder)

### Purpose

Establishes the founder as a recognized authority in the industry through education, credentials, and expertise documentation.

### Schema Definition

```json
{
  "@type": "Person",
  "name": "Reid Peryam",
  "jobTitle": "Strategic Technology Advisor",
  "sameAs": [
    "https://www.linkedin.com/in/reidperyam/"
  ],
  "alumniOf": [
    {
      "@type": "CollegeOrUniversity",
      "name": "UC Berkeley Haas School of Business"
    },
    {
      "@type": "CollegeOrUniversity",
      "name": "Boston University"
    }
  ],
  "hasCredential": [ /* Array of 18 credential objects */ ]
}
```

### Field Descriptions

| Field | Type | Purpose |
|-------|------|---------|
| `@type` | String | Schema type (Person) |
| `name` | String | Full name of founder |
| `jobTitle` | String | Current professional title |
| `sameAs` | Array[URL] | Links to social profiles (LinkedIn, etc.) |
| `alumniOf` | Array[Organization] | Educational background |
| `hasCredential` | Array[Credential] | Professional certifications and education |

### Authority Building

The Person schema contributes to authority through:

1. **Education Association**: Links to prestigious institutions (UC Berkeley, Boston University)
2. **Credential Count**: 18 documented certifications
3. **Credential Diversity**: Mix of technical, leadership, and executive education
4. **Recency**: Recent credentials (2023) show continued learning
5. **Expiration Tracking**: Shows maintained active certifications

## Credential Objects

### Credential Schema Structure

All credentials follow the `EducationalOccupationalCredential` schema:

```json
{
  "@type": "EducationalOccupationalCredential",
  "name": "Credential Name",
  "credentialCategory": "Professional Certification" | "Executive Education",
  "publisher": {
    "@type": "Organization" | "CollegeOrUniversity",
    "name": "Issuing Organization Name"
  },
  "datePublished": "YYYY-MM",
  "expires": "YYYY-MM",  // Optional: omit if non-expiring
  "identifier": "UNIQUE_CREDENTIAL_ID",
  "competencyRequired": "Skill 1, Skill 2, Skill 3"
}
```

### Field Descriptions (Schema.org Compliant)

| Field | Type | Purpose | Required |
|-------|------|---------|----------|
| `@type` | String | Always "EducationalOccupationalCredential" | Yes |
| `name` | String | Full credential name | Yes |
| `credentialCategory` | String | Type of credential | Yes |
| `publisher` | Organization | Organization that issued the credential (from CreativeWork) | Yes |
| `datePublished` | Date | Issue date in YYYY-MM format (from CreativeWork) | Yes |
| `expires` | Date | Expiration date in YYYY-MM format (from CreativeWork) | No* |
| `identifier` | String | Credential ID for verification (from CreativeWork) | Yes |
| `competencyRequired` | String | Comma-separated skills string (specific to this type) | Recommended |

*`expires` is optional. Omit for non-expiring credentials (degrees, permanent certifications).

**⚠️ Property Name Changes**: These are the official Schema.org property names verified against the official documentation. Properties like `publisher`, `datePublished`, `expires`, and `identifier` are inherited from CreativeWork (the parent type). Previous versions used non-standard names (`issuedBy`, `offeredBy`, `dateIssued`, `dateExpires`, `validUntil`, `credentialId`, `skills` array) which caused validation errors.

### Current Credentials (18 Total)

#### Microsoft Certifications (5)

**1. DevOps Engineer Expert**
```json
{
  "@type": "EducationalOccupationalCredential",
  "name": "Microsoft Certified: DevOps Engineer Expert",
  "credentialCategory": "Professional Certification",
  "publisher": {"@type": "Organization", "name": "Microsoft"},
  "datePublished": "2021-06",
  "expires": "2027-06",
  "identifier": "6C14577815D1D876",
  "competencyRequired": "Azure DevOps, Software Development Life Cycle (SDLC), Software Development, Azure Solutions"
}
```
**Status**: Active (expires Jun 2027)

**2. Azure Solutions Architect Expert**
```json
{
  "@type": "EducationalOccupationalCredential",
  "name": "Microsoft Certified: Azure Solutions Architect Expert",
  "credentialCategory": "Professional Certification",
  "publisher": {"@type": "Organization", "name": "Microsoft"},
  "datePublished": "2021-04",
  "expires": "2027-04",
  "identifier": "AD20FA63C42592C5",
  "competencyRequired": "Software Solution Development, Cloud-Native Architecture, Azure Solutions, Microsoft Azure"
}
```
**Status**: Active (expires Apr 2027)

**3. Azure Developer Associate**
```json
{
  "@type": "EducationalOccupationalCredential",
  "name": "Microsoft Certified: Azure Developer Associate",
  "credentialCategory": "Professional Certification",
  "publisher": {"@type": "Organization", "name": "Microsoft"},
  "datePublished": "2021-05",
  "expires": "2027-05",
  "identifier": "AD895CD745DD2DD8",
  "competencyRequired": "Software Development, Microsoft Azure, Azure Solutions, Azure DevOps, Cloud-Native Applications"
}
```
**Status**: Active (expires May 2027)

**4. Azure AI Engineer Associate**
```json
{
  "@type": "EducationalOccupationalCredential",
  "name": "Microsoft Certified: Azure AI Engineer Associate",
  "credentialCategory": "Professional Certification",
  "publisher": {"@type": "Organization", "name": "Microsoft"},
  "datePublished": "2021-09",
  "expires": "2026-09",
  "competencyRequired": "Artificial Intelligence (AI), Machine Learning, Cloud-Native Architecture, Microsoft Azure"
}
```
**Status**: Active (expires Sep 2026)

**5. Azure AI Fundamentals**
```json
{
  "@type": "EducationalOccupationalCredential",
  "name": "Microsoft Certified: Azure AI Fundamentals",
  "credentialCategory": "Professional Certification",
  "publisher": {"@type": "Organization", "name": "Microsoft"},
  "datePublished": "2021-08",
  "identifier": "H943-8317",
  "competencyRequired": "Artificial Intelligence (AI), Machine Learning, Software Development, Neural Networks, Microsoft Azure"
}
```
**Status**: Active (no expiration)

#### UC Berkeley Haas Executive Education (11)

All issued by: `University of California, Berkeley, Haas School of Business`

**6. Certificate of Business Excellence (2023-09)**
- ID: 82675585
- Skills: AI, Digital Transformation, Product Management, Blockchain, Data Strategy, Executive Leadership

**7. Berkeley Executive Leadership Program (2023-03)**
- ID: 70041714
- Skills: Organizational Leadership, Systems Thinking, Culture Change, Stakeholder Management

**8. Digital Transformation (2023-01)**
- ID: 66187273
- Skills: Organizational Leadership, Digital Transformation, Product Management, Technology Strategy, Data Strategy, Enterprise Architecture

**9. Artificial Intelligence: Business Strategies and Applications (2023-04)**
- ID: 71228917
- Skills: AI, Machine Learning, Business Strategy, Neural Networks

**10. Blockchain and Cryptocurrencies (2023-08)**
- ID: 79127223
- Skills: Cryptocurrency, Blockchain

**11. Excellence In Technology Strategy (2022-04)**
- ID: 49757257
- Skills: Organizational Leadership, Digital Transformation, Product Management, Technology Strategy, Business Strategy, Enterprise Architecture

**12. Data Strategy (2022-06)**
- ID: 52691267
- Skills: Product Management, Technology Strategy, Data Strategy, Business Strategy, Enterprise Architecture

**13. Product Management Studio (2022-08)**
- ID: 56795945
- Skills: Organizational Leadership, Product Management, Systems Thinking, Technology Strategy, Design Thinking

**14. Business Analytics for Leaders (2022-04)**
- ID: 49371816
- Skills: AI, Product Management, Machine Learning, Technology Strategy, Data Strategy, Business Strategy

**15. Leading Complex Projects (2022-01)**
- ID: 45714456
- Skills: Organizational Leadership, Digital Transformation, Product Management, Project Management, Stakeholder Management

#### Infrastructure Certifications (2)

**16. CKAD: Certified Kubernetes Application Developer**
```json
{
  "@type": "EducationalOccupationalCredential",
  "name": "CKAD: Certified Kubernetes Application Developer",
  "credentialCategory": "Professional Certification",
  "publisher": {"@type": "Organization", "name": "The Linux Foundation"},
  "datePublished": "2021-02",
  "expires": "2024-02",
  "identifier": "LF-nk1u2e8ck!",
  "competencyRequired": "Software Development, Kubernetes, DevOps"
}
```
**Status**: Expired (Feb 2024)

**17. CKA: Certified Kubernetes Administrator**
```json
{
  "@type": "EducationalOccupationalCredential",
  "name": "CKA: Certified Kubernetes Administrator",
  "credentialCategory": "Professional Certification",
  "publisher": {"@type": "Organization", "name": "The Linux Foundation"},
  "datePublished": "2021-01",
  "expires": "2024-01",
  "identifier": "LF-rg3vj38yvx",
  "competencyRequired": "Software Development, Kubernetes, DevOps"
}
```
**Status**: Expired (Jan 2024)

#### Agile Certification (1)

**18. Certified SAFe 5 Agilist**
```json
{
  "@type": "EducationalOccupationalCredential",
  "name": "Certified SAFe 5 Agilist",
  "credentialCategory": "Professional Certification",
  "publisher": {"@type": "Organization", "name": "SAFe by Scaled Agile, Inc."},
  "datePublished": "2021-07",
  "expires": "2022-07",
  "identifier": "77243988-6382",
  "competencyRequired": "Agile Methodologies, Agile Project Management, Scrum"
}
```
**Status**: Expired (Jul 2022)

## BreadcrumbList Schema

### Purpose

Provides structured breadcrumb navigation data to search engines, enabling breadcrumb-style display in SERPs. Automatically generated from the page's URL pathname on all non-homepage pages.

### Schema Definition

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://globalstrategic.tech/"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "The GST Hub",
      "item": "https://globalstrategic.tech/hub/"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "The Workbench"
    }
  ]
}
```

### How It Works

- Automatically generated from `Astro.url.pathname` — no props needed
- Only rendered on non-homepage pages
- The last breadcrumb item omits the `item` URL (Google best practice for current page)
- Slug-to-name mapping is defined in `SEO.astro` for clean display names

### Slug-to-Name Mapping

| Slug | Display Name |
|------|-------------|
| `services` | Services |
| `about` | About |
| `ma-portfolio` | M&A Portfolio |
| `privacy` | Privacy Policy |
| `terms` | Terms of Service |
| `hub` | The GST Hub |
| `tools` | The Workbench |
| `diligence-machine` | Diligence Machine |
| `library` | The Library |
| `business-architectures` | Business Architectures |
| `vdr-structure` | VDR Structure |
| `radar` | The Radar |

Unmapped slugs are auto-formatted: hyphens replaced with spaces, words capitalized.

## FAQPage Schema

### Purpose

Enables FAQ rich results in Google SERPs when a page contains structured question/answer content. Currently active on the Services page.

### Schema Definition

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What's the difference between buy-side and sell-side diligence?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Buy-side diligence evaluates a target company..."
      }
    }
  ]
}
```

### Usage

Pass `faqItems` to the SEO component via `BaseLayout`:

```astro
<BaseLayout
  title="Services | GST"
  faqItems={[
    { question: "Your question?", answer: "Your answer." },
  ]}
>
```

The schema is only rendered when `faqItems` is provided and non-empty.

## Skills Association

### Purpose

Skills linked to credentials enable semantic understanding of expertise areas and support skill-based search queries.

### Skills Taxonomy

Current skills are associated with credentials as follows:

```
Cloud Architecture (5 credentials)
├── Azure Solutions Architect Expert
├── Azure DevOps Engineer Expert
├── Azure AI Engineer Associate
├── Digital Transformation
└── Cloud-Native Architecture (in knowsAbout)

AI/Machine Learning (7 credentials)
├── Azure AI Engineer Associate
├── Azure AI Fundamentals
├── Artificial Intelligence: Business Strategies
├── Machine Learning (multiple)
├── Certificate of Business Excellence
├── Business Analytics for Leaders
└── Blockchain and Cryptocurrencies

Leadership/Strategy (10 credentials)
├── Executive Leadership
├── Digital Transformation (2x)
├── Technology Strategy (5x)
├── Organizational Leadership (3x)
├── Product Management (5x)
├── Business Strategy (2x)
└── Enterprise Architecture (2x)

Development/Infrastructure (6 credentials)
├── Software Development (3x)
├── Kubernetes (2x)
├── DevOps (2x)
├── Azure DevOps (2x)
└── SDLC

Project Management (4 credentials)
├── Leading Complex Projects
├── Agile Methodologies
├── Agile Project Management
└── Scrum
```

### Adding Skills to New Credentials

When adding a new credential:

1. Choose 3-5 highly relevant skills
2. Use consistent skill naming (capitalize properly)
3. Prefer skills from existing taxonomy when possible
4. Map back to the "knowsAbout" array if it's a primary expertise area

Example:
```json
"competencyRequired": "Artificial Intelligence (AI), Machine Learning, Cloud-Native Architecture"
```

## Validation

### Automated Validation Tools

#### 1. Google Structured Data Testing Tool
- **URL**: https://search.google.com/structured-data/testing-tool
- **Purpose**: Validates JSON-LD syntax and schema compliance
- **Process**:
  1. Paste full HTML or schema JSON
  2. Check for errors (red) and warnings (yellow)
  3. Verify all expected properties are recognized

#### 2. Schema.org Validator
- **URL**: https://validator.schema.org/
- **Purpose**: Validate schema.org compliance
- **Process**:
  1. Paste full page HTML
  2. Review detected items
  3. Check for missing recommended properties

#### 3. JSON Lint
- **URL**: https://jsonlint.com/
- **Purpose**: Validate JSON syntax
- **Process**:
  1. Paste JSON-LD code
  2. Verify no syntax errors
  3. Check proper nesting and quoting

### Manual Validation Checklist

- [ ] All required fields present (@context, @type, name)
- [ ] All URLs are absolute (not relative)
- [ ] All dates are YYYY-MM format
- [ ] Credential IDs are unique per credential
- [ ] Skills are properly capitalized
- [ ] No duplicate skills within single credential
- [ ] Organization names match official names
- [ ] publisher organizations have proper @type

### Production Validation

Before deploying:

```bash
# Run tests
npm run test:all

# Manual verification
1. Check rendered HTML for valid JSON-LD script tag
2. Use Google Structured Data Testing Tool
3. Verify no console errors
4. Check page render performance (no slowdown)
```

## Update Guidelines

### When to Update Schema

**Add Credentials When**:
- New certification is earned
- Executive education program is completed
- Professional designation changes
- Industry certifications are renewed

**Update Existing Credentials When**:
- Credential expires (update or remove `expires`)
- Skills associated with credential change
- Organization name changes
- Credential ID changes

**Update KnowsAbout When**:
- New primary expertise area is established
- Business focus shifts
- Service offerings expand

### How to Update Schema

#### Step 1: Edit SEO Component
Location: `src/components/SEO.astro`

```javascript
// For new credential, add to hasCredential array:
{
  "@type": "EducationalOccupationalCredential",
  "name": "New Certification Name",
  // ... complete object
}

// For new expertise, add to knowsAbout:
"knowsAbout": [
  "Existing Expertise",
  "New Expertise Area"
]
```

#### Step 2: Validate
1. Run schema validator
2. Use Google Structured Data Testing Tool
3. Check for console errors

#### Step 3: Test
```bash
npm run test:all
```

#### Step 4: Commit & Deploy
```bash
git add src/components/SEO.astro
git commit -m "Add new credential: [credential name]"
git push
```

### Deprecating Credentials

For expired certifications, you have two options:

**Option 1: Keep with expiration date**
```json
{
  "name": "Certified Kubernetes Administrator",
  "expires": "2024-01",
  // This transparently shows it has expired
}
```

**Option 2: Remove entirely**
- Delete the object from `hasCredential` array
- Update `CREDENTIALS_REFERENCE.md`

Recommendation: Keep important credentials even if expired (shows comprehensive training).

---

**Last Updated**: March 20, 2026
**Schema Version**: 2.0
**Validation Status**: ✓ Compliant
