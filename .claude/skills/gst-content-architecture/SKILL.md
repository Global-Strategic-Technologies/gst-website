# GST Content Architecture Skill

## Purpose

This skill provides content patterns, structural templates, and brand voice guidelines for developing new pages and sections on the Global Strategic Tech (GST) website. Use this skill to ensure consistency with established brand identity, messaging frameworks, and audience expectations.

## When to Use This Skill

- Creating new website pages or sections
- Writing copy for cards, CTAs, or hero sections
- Structuring content for PE/M&A executive audiences
- Implementing portfolio/case study presentations
- Developing tool descriptions or framework overviews
- Adding blog posts, insights, or perspective pieces

## Target Audience Profile

### Primary: Private Equity Investors

**Characteristics:**

- Time-constrained (2-5 minutes per site visit)
- Outcome-focused (EBITDA, revenue growth, risk mitigation)
- Portfolio oversight responsibility
- Multiple active deals simultaneously
- Delegated technical evaluation to advisors

**Content Expectations:**

- Executive summaries over detailed explanations
- Quantified results (Δ notation for impact metrics)
- Business outcomes before technical details
- Clear ROI and risk frameworks
- Scannable, hierarchical information

### Secondary: Portfolio Company C-Suite

**Characteristics:**

- Operational accountability
- Integration/transformation execution responsibility
- Budget approval authority
- Board reporting obligations
- Cross-functional leadership

**Content Expectations:**

- Strategic roadmaps over tactical implementation
- Value creation frameworks
- Risk-adjusted decision models
- Peer benchmarking context
- Clear next-step pathways

### Tertiary: Technical Leaders (CTOs, VPs Engineering)

**Characteristics:**

- Implementation responsibility
- Team leadership
- Architecture decisions
- Vendor evaluation
- Technical debt management

**Content Expectations:**

- Technical credibility signals
- Methodology transparency
- Tool/framework specificity
- Pragmatic over theoretical
- Proven execution examples

## Brand Voice Guidelines

### Core Principles

**Authoritative Without Arrogance**

- State capabilities declaratively, don't oversell
- Let results speak through metrics
- Avoid superlatives ("best," "leading," "premier")
- Use specific language over vague claims

**Business-Focused Language**

- Lead with business outcomes, not technical features
- "Revenue growth" before "platform modernization"
- "Risk mitigation" before "security assessment"
- "EBITDA improvement" before "cost optimization"

**Executive Peer-to-Peer Tone**

- Collaborative framing ("Let's discuss" not "Let us show you")
- Assumes audience sophistication
- No condescension or over-explanation
- Respects time constraints

**Quantified and Specific**

- Use precise metrics: "Δ$8.2M EBITDA" not "significant improvement"
- Cite timeframes: "14-week implementation" not "rapid deployment"
- Reference scale: "127 microservices" not "complex architecture"
- Show transformation: Before/after states with Δ notation

### Voice Characteristics

**DO Use:**

- Active voice: "We deliver" not "Results are delivered"
- Present tense: "We assess" not "We will assess"
- Concrete nouns: "platform," "pipeline," "integration"
- Action verbs: "Execute," "Transform," "Accelerate," "De-risk"
- Delta notation: "Δ Revenue: +$12M"

**DON'T Use:**

- Marketing jargon: "synergy," "paradigm shift," "game-changing"
- Buzzwords: "AI-powered," "next-generation," "cutting-edge"
- Hedging: "might," "could potentially," "we believe"
- Excessive modifiers: "extremely," "very," "highly"
- Tech-for-tech's-sake: Avoid acronyms without business context

### Sentence Structure Patterns

**Headlines (H1):**

```
[Action/State] + [Business Outcome]
"Strategic Advisory & Execution"
"Technology Transformation for Portfolio Value"
"De-Risking High-Stakes Technology Investments"
```

**Subheadlines (H2):**

```
[Specific Capability] + [Target Audience Context]
"Technical diligence and value creation execution for private equity"
"Integration roadmaps that accelerate portfolio company performance"
"Risk frameworks built for billion-dollar technology transactions"
```

**Body Copy:**

```
[Problem Context] → [Approach] → [Outcome]

"Portfolio companies inherit complex technical debt that constrains
growth and margin expansion. We conduct forensic assessments of
architecture, security, and scalability, then build executable
roadmaps that deliver measurable EBITDA improvement within 12-18 months."
```

**CTAs:**

```
[Direct Action] or [Function-Style Invocation]
"Schedule a Consultation"
"Download Framework"
"BOOK_CALENDAR_SLOT()"
"REQUEST_WHITEPAPER()"
```

## Content Templates

### Hero Section Pattern

**Structure:**

```html
<section class="hero">
  <h1>[Declarative Value Proposition]</h1>
  <h2>[Specific Capabilities + Audience Context]</h2>
  <p>[Brief elaboration: Problem → Solution → Outcome, 2-3 sentences max]</p>
  <a href="[CTA-URL]" class="cta-button">[Action-Oriented CTA]</a>
</section>
```

**Example 1: Service Page**

```
H1: "Buy-Side Technical Diligence"
H2: "De-risk acquisitions with forensic assessments of technology assets,
     architecture integrity, and post-close integration complexity"
Body: "Private equity firms face asymmetric information risk in technology
transactions. Our structured diligence methodology evaluates 127+ risk
factors across security, scalability, technical debt, and team capability.
Delivered as executive-ready reports with quantified risk ratings and
integration cost models."
CTA: "REQUEST_DILIGENCE_SCOPE()"
```

**Example 2: Tools/Resources**

```
H1: "The Strategic Intelligence Hub"
H2: "Professional-grade tools, frameworks, and technical perspectives
     designed to de-risk technology investments"
Body: "These resources codify 20+ years of technical advisory experience
across 100+ M&A transactions, platform modernizations, and value creation
engagements. Built for PE investors, portfolio company executives, and
technical leaders navigating high-stakes decisions."
CTA: "Explore Tools"
```

### Card Component Pattern

**Three-Part Card Structure:**

```
┌─────────────────────────────┐
│  [Icon/Visual Element]      │  ← Optional: 48x48px, accent color
│                             │
│  [Card Title]               │  ← H3, bold, 4-8 words
│  [Optional Subtitle]        │  ← Lighter weight, category label
│                             │
│  [Descriptive Copy]         │  ← 2-3 lines, specific capability
│                             │
│  [CTA Button or Link]       │  ← Clear action
└─────────────────────────────┘
```

**Card Copy Formula:**

```
Title: [Service/Tool Category]
Subtitle: [Type/Classification]
Copy: [Specific value proposition or use case, 15-25 words]
CTA: [Action verb + Object]
```

**Examples:**

```markdown
**The Workbench**
_Tools_
Interactive calculators and generators to quantify risk and value in
technology investments.
→ Explore Tools

**Integration Playbooks**
_Frameworks_
Day-1 through Day-100 execution roadmaps for post-acquisition technology
integration and team alignment.
→ Download Framework

**AI Risk Assessment**
_Perspectives_
Rapid analysis of generative AI adoption patterns, security implications,
and competitive positioning in M&A contexts.
→ Read Analysis
```

### Case Study / Portfolio Item Pattern

**Dashboard-Style Overview:**

```markdown
## [Project Codename]

**Client Context:** [Industry] / [Stage: Growth/Turnaround] / [ARR or Scale]
**Engagement Type:** [Due Diligence / Integration / Value Creation / Product]
**Duration:** [Weeks/Months]
**Team Size:** [FTE allocation]

### Business Challenge

[2-3 sentences: What problem existed? What was at stake?]

### Approach

[3-4 bullet points: Key methodologies, frameworks, or technical interventions]

### Measurable Outcomes

- Δ [Metric 1]: [Quantified change]
- Δ [Metric 2]: [Quantified change]
- Δ [Metric 3]: [Quantified change]

### Technical Scope

[Optional: High-level tech stack or architecture details if relevant and
not confidential]
```

**Example:**

```markdown
## Project Cascade

**Client Context:** SaaS / Growth Stage / $45M ARR
**Engagement Type:** Buy-Side Technical Diligence
**Duration:** 6 weeks
**Team Size:** 2 FTE

### Business Challenge

PE firm evaluating $280M acquisition of vertical SaaS platform. Target
company claimed "enterprise-ready" architecture but had experienced three
major outages in prior 12 months. Diligence needed to quantify technical
risk and post-close remediation costs.

### Approach

- Forensic architecture review of 89 microservices across AWS infrastructure
- Security assessment against SOC 2 Type II and ISO 27001 requirements
- Load testing simulation of 3x transaction volume
- Team capability evaluation via structured technical interviews
- Integration complexity modeling for acquirer's existing portfolio

### Measurable Outcomes

- Δ Deal Valuation: -$18M adjustment based on identified technical debt
- Δ Integration Budget: $2.4M remediation roadmap (12-month timeline)
- Δ Risk Mitigation: 14 critical security vulnerabilities documented
- Post-Close: Zero unplanned outages in first 18 months under new ownership

### Technical Scope

AWS (ECS, RDS, ElastiCache), PostgreSQL, React/Node.js, Kubernetes,
Terraform IaC
```

### Tools & Calculators Description Pattern

**Structure for Interactive Tools:**

```markdown
## [Tool Name]

**Purpose:** [One-line value proposition]

**Use Case:** [Who uses this? When? For what decision?]

**Inputs Required:**

- [Input 1]: [Description, example values]
- [Input 2]: [Description, example values]
- [Input 3]: [Description, example values]

**Outputs Delivered:**

- [Output 1]: [What it calculates, how to interpret]
- [Output 2]: [What it calculates, how to interpret]

**Methodology:**
[Brief explanation of calculation logic or framework used]

**Typical Results:**
[Example scenario with inputs and outputs]
```

**Example:**

```markdown
## The Diligentizer

**Purpose:** Generate customized technical diligence checklists based on
transaction parameters, tech stack, and risk profile.

**Use Case:** PE investors and corporate development teams use this during
LOI stage to scope diligence requirements and budget consulting resources
accurately.

**Inputs Required:**

- Transaction Size: $10M to $500M+ range
- Tech Stack: SaaS, E-commerce, FinTech, etc.
- Architecture: Monolith, Microservices, Hybrid
- Regulatory Environment: HIPAA, SOC 2, PCI-DSS, GDPR
- Integration Complexity: Standalone, Bolt-on, Platform

**Outputs Delivered:**

- Prioritized Diligence Checklist: 40-180 items across 12 risk categories
- Estimated Diligence Timeline: 3-12 weeks with confidence intervals
- Resource Requirements: FTE hours by specialty (security, architecture, etc.)
- Budget Range: Consulting cost estimates based on scope

**Methodology:**
Checklist generation uses decision tree logic based on 100+ prior
engagements. Risk factors are weighted by transaction size, regulatory
requirements, and architecture complexity. Timeline estimates use Monte
Carlo simulation with historical variance data.

**Typical Results:**
$150M SaaS acquisition (microservices, SOC 2 required, bolt-on integration)
→ 127-item checklist, 6-8 week timeline, $180K-$240K estimated cost
```

### Perspective/Article Pattern

**Structure for Insights Content:**

```markdown
## [Attention-Grabbing Title]

**Published:** [Date]
**Reading Time:** [X] minutes
**Category:** [M&A Trends / AI Impact / Platform Architecture / etc.]

### Executive Summary

[2-3 sentences: Core thesis, what changed, why it matters now]

### The Context

[1-2 paragraphs: Market backdrop, recent developments, data points]

### The Implication for M&A

[2-3 paragraphs: How this affects valuations, diligence scope, integration]

### What to Watch

[Bullet list: 3-5 specific signals or indicators]

### Our Take

[Final paragraph: Opinionated but evidence-based perspective]
```

**Example:**

```markdown
## The GenAI Shadow Stack: A New Diligence Risk Category

**Published:** January 15, 2026
**Reading Time:** 4 minutes
**Category:** AI Impact / M&A Trends

### Executive Summary

Portfolio companies are deploying generative AI tools at 4x the rate IT
departments can track them. This "shadow stack" introduces data security,
IP protection, and compliance risks that traditional diligence frameworks
miss entirely. Acquirers need new assessment methodologies.

### The Context

[Market data, adoption rates, regulatory developments]

### The Implication for M&A

[Valuation impacts, diligence gaps, post-close surprises]

### What to Watch

- Developer laptop audits revealing unauthorized AI tool usage
- Data residency violations from cloud AI services
- IP contamination from code generation tools
- Compliance drift in regulated industries

### Our Take

[Specific recommendation for diligence scope expansion]
```

## Structural Patterns

### Page Layout Hierarchy

**Standard Page Structure:**

```
1. Hero Section (H1 + H2 + Body + CTA)
   ↓ [80-120px vertical space]

2. Primary Content Section (H2 + Grid/Cards/Content)
   ↓ [64-96px vertical space]

3. Secondary Content Section (H2 + Grid/Cards/Content)
   ↓ [64-96px vertical space]

4. Tertiary Section or CTA Block (Optional)
   ↓ [64-96px vertical space]

5. Footer (Standard across site)
```

### Grid Patterns

**Three-Column Card Grid:**

```
Desktop (≥1024px):  [Card] [Card] [Card]
Tablet (768-1023):  [Card] [Card]
                    [Card]
Mobile (<768px):    [Card]
                    [Card]
                    [Card]
```

**Specifications:**

- Gap: 32-48px between cards
- Card padding: 32-40px all sides
- Equal height cards in same row
- Stack order preserved on mobile
- Touch targets: 44x44px minimum on mobile

**Two-Column Content + Sidebar:**

```
Desktop:  [Main Content (66%)] [Sidebar (33%)]
Mobile:   [Main Content]
          [Sidebar]
```

**Dashboard/Metrics Grid:**

```
[Metric 1] [Metric 2] [Metric 3] [Metric 4]
(2x2 on tablet, 1x4 stack on mobile)
```

### Component Spacing

**Vertical Rhythm (Desktop):**

- Between major sections: 80-120px
- Between subsections: 64-96px
- Between related elements: 24-32px
- Between tightly coupled items: 8-16px
- Line height for body text: 1.6-1.7

**Horizontal Rhythm:**

- Maximum content width: 1200-1400px
- Side margins (desktop): Auto-center with min 40px
- Side margins (mobile): 16-24px
- Card/grid gaps: 32-48px desktop, 16-24px mobile

### Typography Scale (Reference)

```
H1: 48-72px (desktop) / 32-48px (mobile)
    Bold weight, tight line-height (1.1-1.2)

H2: 32-48px (desktop) / 24-32px (mobile)
    Semi-bold to bold, line-height 1.2-1.3

H3: 24-32px (desktop) / 20-24px (mobile)
    Medium to semi-bold, line-height 1.3-1.4

Body: 16-18px
    Regular weight, line-height 1.6-1.7

Small/Caption: 14-16px
    Regular weight, line-height 1.5
```

## Delta (Δ) Symbol Usage

### When to Use Delta

**Primary Applications:**

1. **Metric Presentation** - Showing change/impact
2. **Brand Signature** - Footer, headers, dividers
3. **Bullet/List Markers** - Alternative to standard bullets
4. **Section Dividers** - Visual break between content areas
5. **Logo Integration** - Part of GST brand mark

**Metric Examples:**

```
Δ Revenue: +$12.4M
Δ EBITDA: +$8.2M
Δ Efficiency: +42%
Δ Time to Market: -6 months
Δ Technical Debt: -$3.1M remediation avoided
```

**Content Structure Examples:**

```markdown
### Value Creation Portfolio

      Δ


Portfolio companies delivered measurable transformation across...

---

## Our Approach

Δ **Assess** - Forensic evaluation of current state
Δ **Architect** - Design target state with risk mitigation  
Δ **Accelerate** - Execute roadmap with embedded leadership
```

### Delta Implementation

**SVG Asset (Preferred for Visual Elements):**

```html
<img src="/images/gst-delta-icon-teal-stroke-thick.svg" alt="Delta symbol" class="delta-icon" />
```

**Asset Location:**

- Path: `public/images/gst-delta-icon-teal-stroke-thick.svg`
- Use for: Hero sections, decorative elements, card icons, large visual moments
- Advantages: Scalable, brand-specific styling (teal stroke), maintains visual consistency

**HTML Entity (For Inline Text):**

```html
&Delta; or &#916;
```

**Unicode (For Plain Text):**

```
\u0394
```

**CSS Content (For Pseudo-elements):**

```css
.delta-symbol::before {
  content: '\0394';
  margin-right: 0.25em;
}
```

**Icon Usage Decision Tree:**

- **Use SVG asset** when: Hero sections, card headers, decorative elements, 48px+ size
- **Use Unicode/HTML entity** when: Inline metrics, text bullets, body copy
- **Use CSS pseudo-element** when: Repeated pattern, list markers, consistent styling needed

**Markdown:**

```
Δ (copy/paste the Unicode character directly for metrics/text)
```

## SEO & Metadata Patterns

### Page Title Formulas

**Service Pages:**

```
[Service Name] | Global Strategic Tech
"Buy-Side Technical Diligence | Global Strategic Tech"
```

**Content Pages:**

```
[Content Title] | [Category] | GST
"The Diligentizer | Tools | GST"
```

**Hub/Landing Pages:**

```
[Hub Name] | Global Strategic Tech
"Strategic Intelligence Hub | Global Strategic Tech"
```

### Meta Description Formulas

**Pattern:**

```
[Specific Capability] for [Target Audience]. [Unique Value or Outcome].
[Quantified Experience or Scale].
```

**Examples:**

```
Technical due diligence for private equity investors. Forensic assessments
that quantify risk and integration complexity. 100+ transactions,
$4.2B+ deal value evaluated.

Interactive tools and frameworks for technology M&A. Professional-grade
calculators built from 20+ years of advisory experience. De-risk
investments, accelerate integration.
```

**Character Limits:**

- Title: 50-60 characters (Google truncates ~60)
- Description: 150-160 characters (Google truncates ~160)

### Heading Hierarchy Rules

**Requirements:**

1. One H1 per page (page title/hero headline)
2. H2 for major sections
3. H3 for subsections or card titles
4. H4 for minor subdivisions (rare)
5. Never skip levels (H1 → H3 is invalid)

**SEO Keywords for GST:**

- Primary: "technical due diligence," "technology M&A," "private equity"
- Secondary: "platform modernization," "value creation," "integration"
- Long-tail: "buy-side technical assessment," "CTO advisory," "portfolio company transformation"

## Content Checklist

Before publishing any new page or section, verify:

**Brand Voice:**

- [ ] Authoritative without arrogance
- [ ] Business outcomes stated before technical details
- [ ] Specific metrics used (no vague claims)
- [ ] Executive peer-to-peer tone maintained
- [ ] No marketing jargon or buzzwords

**Structure:**

- [ ] Clear hierarchy (H1 → H2 → H3, no skipped levels)
- [ ] Generous whitespace (80-120px between sections)
- [ ] Mobile-responsive grid (cards stack properly)
- [ ] Touch targets ≥44px on mobile
- [ ] Consistent with existing page patterns

**Content Quality:**

- [ ] Scannable (short paragraphs, clear headings)
- [ ] Actionable (clear CTAs, obvious next steps)
- [ ] Quantified (metrics, timeframes, scale)
- [ ] Audience-appropriate (PE investor or C-suite level)
- [ ] Proofread (no typos, grammatical errors)

**Technical:**

- [ ] SEO metadata complete (title, description)
- [ ] Proper semantic HTML (headings, sections, articles)
- [ ] Alt text for images/icons
- [ ] Internal links to related content
- [ ] Functional CTAs (buttons route correctly)

**Delta Symbol:**

- [ ] Used appropriately (metrics, brand moments, dividers)
- [ ] Rendered correctly (Unicode Δ displays)
- [ ] Consistent styling across page
- [ ] Not overused (purposeful placement)

## Quick Reference Examples

### Hero Section (Tools Page)

```astro
---
// Component imports
---

<section class="hero">
  <img
    src="/images/gst-delta-icon-teal-stroke-thick.svg"
    alt="Delta symbol"
    class="hero-icon"
    width="64"
    height="64"
  />

  <h1>The Strategic Intelligence Hub</h1>

  <h2>
    Professional-grade tools, frameworks, and technical perspectives designed to de-risk technology
    investments and accelerate digital maturity
  </h2>

  <p>
    These resources codify 20+ years of technical advisory experience across 100+ M&A transactions,
    platform modernizations, and value creation engagements. Built for PE investors, portfolio
    company executives, and technical leaders navigating high-stakes technology decisions.
  </p>

  <a href="#tools" class="cta-button">Explore Tools</a>
</section>
```

### Card Set (Services Overview)

```astro
<div class="card-grid">
  <article class="card">
    <img
      src="/images/gst-delta-icon-teal-stroke-thick.svg"
      alt=""
      aria-hidden="true"
      class="card-icon"
      width="48"
      height="48"
    />
    <h3>M&A Technical Diligence</h3>
    <p>Forensic assessments for buy-side and sell-side transactions</p>
    <a href="/services/diligence" class="card-link">Learn More →</a>
  </article>

  <article class="card">
    <img
      src="/images/gst-delta-icon-teal-stroke-thick.svg"
      alt=""
      aria-hidden="true"
      class="card-icon"
      width="48"
      height="48"
    />
    <h3>Integration & Transformation</h3>
    <p>Post-close execution roadmaps and embedded leadership</p>
    <a href="/services/integration" class="card-link">View Capabilities →</a>
  </article>

  <article class="card">
    <img
      src="/images/gst-delta-icon-teal-stroke-thick.svg"
      alt=""
      aria-hidden="true"
      class="card-icon"
      width="48"
      height="48"
    />
    <h3>Product & Platform Development</h3>
    <p>Fractional CTO services and technical strategy</p>
    <a href="/services/product" class="card-link">Explore Services →</a>
  </article>
</div>
```

### Metric Presentation

```
## Project Impact

Δ Revenue: +$12.4M ARR (23% growth)
Δ EBITDA: +$8.2M (margin expansion from 18% to 31%)
Δ Efficiency: +42% reduction in infrastructure costs
Δ Speed: -6 months time-to-market for new features
```

### Perspective Article Opening

```
## The Post-Integration Honeymoon Period Is Over

Published: January 2026 | 5 min read | M&A Trends

Portfolio companies integrated in 2022-2023 are now experiencing "technical
debt reckoning" as deferred architecture decisions compound. We're seeing
3x increase in post-Day-100 remediation projects compared to 2019-2020
vintages. The culprit? Integration playbooks optimized for speed over
architectural integrity.
```

---

## Technical Resources & Integration

### Project Documentation Location

All technical documentation for the GST website project is located at:

```
C:\Code\gst-website\src\docs\
```

**Key Documentation Files:**

- `styles/` - CSS patterns, design system specifications, component styling
- Architecture documentation
- Component library references
- Technical implementation guides

**When to Reference Project Docs:**

- Implementing new components or pages
- Understanding existing CSS/styling patterns
- Verifying technical specifications
- Maintaining consistency with established architecture

### Context7 MCP Integration

**Always leverage Context7** for Astro-specific technical guidance:

**Use Context7 for:**

- Astro component syntax and best practices
- File-based routing patterns
- Component composition strategies
- Static site generation optimization
- Build and deployment configurations
- Astro-specific performance patterns

**How to Use:**

```bash
# Query Context7 for Astro guidance
"Check Context7 for Astro best practices on [specific topic]"

# Example queries:
"Context7: How should I structure dynamic routes in Astro?"
"Context7: What's the recommended pattern for shared layouts?"
"Context7: Best way to handle responsive images in Astro?"
```

**Context7 Scope:**

- Astro framework documentation
- Component architecture patterns
- Build optimization techniques
- SEO implementation in Astro
- Asset handling and optimization

### Existing Claude Agents

The project has access to specialized Claude agents for specific domains:

**UX Expert Agent:**

- Use for: Layout design decisions, responsive patterns, accessibility
- Queries: "Review this card grid layout for mobile UX"
- Expertise: User experience, interaction design, responsive design

**Technical Implementation:**

- Combine content from this skill with technical guidance from Context7
- Leverage UX agent for design validation
- Reference project docs for existing patterns

### Resource Priority for Different Tasks

**Content Creation (Copy, Messaging, Structure):**

1. **This Skill** - Brand voice, content templates, structural patterns
2. **GST Brand Guidelines** - Visual identity, color, typography specs
3. **Project Docs** - Existing component patterns

**Technical Implementation (Code, Components, Styling):**

1. **Context7 MCP** - Astro best practices and framework guidance
2. **Project Docs** (`C:\Code\gst-website\src\docs\`) - Established patterns
3. **This Skill** - Content structure requirements

**Design & UX (Layout, Responsiveness, Accessibility):**

1. **UX Expert Agent** - Layout validation, interaction patterns
2. **This Skill** - Spacing rules, grid patterns, structural requirements
3. **Project Docs** - Existing responsive patterns

**Complete Feature Implementation:**

1. **This Skill** - Content architecture and brand voice
2. **Context7** - Technical implementation in Astro
3. **UX Agent** - Design validation
4. **Project Docs** - Integration with existing codebase

### Integration Workflow Example

**Task: Create New Hub Page**

```
Step 1: Content Architecture (This Skill)
→ Apply hero section template
→ Structure card grid pattern
→ Write brand-compliant copy
→ Use Delta SVG asset for visual elements

Step 2: Technical Implementation (Context7)
→ Query: "Context7: Astro page component structure for /hub route"
→ Implement file-based routing
→ Create component composition
→ Optimize for static generation

Step 3: Styling (Project Docs)
→ Reference: C:\Code\gst-website\src\docs\styles\
→ Apply existing CSS patterns
→ Maintain spacing system
→ Use established color variables

Step 4: UX Validation (UX Agent)
→ Review mobile responsiveness
→ Validate touch target sizes
→ Check accessibility standards
→ Confirm visual hierarchy
```

### Asset References

**Delta Symbol SVG:**

- **Location:** `public/images/gst-delta-icon-teal-stroke-thick.svg`
- **Usage:** Hero sections, card icons, large decorative elements
- **Implementation:**
  ```html
  <img
    src="/images/gst-delta-icon-teal-stroke-thick.svg"
    alt="Delta symbol representing transformation"
    width="48"
    height="48"
  />
  ```

**Other Project Assets:**

- Logo variations: Check `public/images/` for brand assets
- Icons: Reference existing icon library if present
- Images: Follow naming conventions in `/public/images/`

### Documentation Cross-Reference

**For Content Questions:**

- Primary: This skill (content architecture)
- Secondary: GST Brand Guidelines (visual identity)

**For Technical Questions:**

- Primary: Context7 (Astro-specific)
- Secondary: Project docs at `C:\Code\gst-website\src\docs\`

**For Design Questions:**

- Primary: UX Expert Agent (validation)
- Secondary: This skill (spacing, grid patterns)

**For Integration Questions:**

- Combine all resources as needed
- Start with content structure (this skill)
- Implement technically (Context7 + project docs)
- Validate design (UX agent)

---

## Using This Skill

When Claude Code or Claude (web interface) is working on GST website
content, structure, or copy:

1. **Reference this skill** for voice consistency and structural patterns
2. **Apply templates** appropriate to the content type (hero, card, article)
3. **Use Delta symbol** purposefully in metrics and brand moments
4. **Verify against checklist** before considering content complete
5. **Maintain audience focus** - always write for PE investors and C-suite executives

This skill complements the full Brand Guidelines document but focuses
specifically on content architecture, copywriting patterns, and structural
templates for website development.
