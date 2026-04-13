# GST Content Architecture Skill

A Claude skill for maintaining consistent content patterns, brand voice, and structural templates across the Global Strategic Tech website.

## What This Skill Provides

- **Content Templates**: Hero sections, card layouts, case studies, tools descriptions
- **Brand Voice Guidelines**: Authoritative, business-focused, quantified messaging
- **Audience Profiles**: PE investors, C-suite executives, technical leaders
- **Structural Patterns**: Grid systems, spacing rules, typography hierarchy
- **Delta Symbol Usage**: Metric presentation, brand signature, visual dividers
- **SEO Patterns**: Title formulas, meta descriptions, heading hierarchy
- **Quality Checklists**: Pre-publish verification for brand consistency

## Installation Instructions

### Option 1: Local Project Skill (Recommended for GST Website Development)

1. **Navigate to your GST website project directory:**

   ```bash
   cd C:\Code\gst-website
   ```

2. **Create a `.claude` directory** (if it doesn't exist):

   ```bash
   mkdir .claude
   cd .claude
   ```

3. **Create a `skills` subdirectory:**

   ```bash
   mkdir skills
   cd skills
   ```

4. **Copy the skill files** into this directory:

   ```bash
   mkdir gst-content-architecture
   # Copy SKILL.md and skill.json into gst-content-architecture/
   ```

   Your structure should look like:

   ```
   C:\Code\gst-website\
   └── .claude\
       └── skills\
           └── gst-content-architecture\
               ├── SKILL.md
               └── skill.json
   ```

5. **Verify installation** - When you use Claude Code in this project, the skill will be automatically available

### Option 2: User-Level Skill (Available Across All Projects)

1. **Locate your Claude user skills directory:**
   - **Windows:** `%USERPROFILE%\.claude\skills\`
   - **macOS/Linux:** `~/.claude/skills/`

2. **Create the skill directory:**

   ```bash
   # Windows (PowerShell)
   mkdir $env:USERPROFILE\.claude\skills\gst-content-architecture

   # macOS/Linux
   mkdir -p ~/.claude/skills/gst-content-architecture
   ```

3. **Copy skill files** into this directory:
   - `SKILL.md`
   - `skill.json`

4. **Restart Claude Code** if it's currently running

### Option 3: Claude.ai Web Interface (Project Skill)

1. **Open your GST project** in Claude.ai
2. **Navigate to Project Settings** → Skills
3. **Click "Add Skill"** → "Create Custom Skill"
4. **Copy the contents** of `SKILL.md` into the skill editor
5. **Set skill name:** "GST Content Architecture"
6. **Save the skill**

## Usage

### With Claude Code

When working on the GST website in your terminal:

```bash
# Claude Code will automatically detect the skill
claude "Create a new Hub page following the brand guidelines"

# Or explicitly reference it
claude "Using the GST content architecture skill, write hero copy for the M&A services page"
```

### With Claude.ai (Web Interface)

When chatting with Claude in your GST project:

```
"Reference the GST Content Architecture skill to create card copy for three new service offerings"

"Using the content patterns from the skill, write a case study for Project Cascade"

"Generate hero section copy for the Tools page following the skill templates"
```

### Automatic Triggers

The skill automatically activates when you:

- Mention creating website pages or sections
- Ask for hero section copy
- Request card layouts or descriptions
- Work on case studies or portfolio items
- Write tool descriptions
- Create perspective articles
- Reference brand voice or PE audience

## Key Features to Leverage

### 1. Content Templates

```
"Use the hero section template to create copy for [page name]"
"Apply the card component pattern for these three services"
"Structure a case study using the portfolio item template"
```

### 2. Brand Voice Enforcement

```
"Review this copy against the brand voice guidelines"
"Rewrite this in the GST authoritative style"
"Make this more quantified and specific per the skill"
```

### 3. Audience Adaptation

```
"Adapt this technical content for PE investor audience"
"Write this for C-suite executives per the audience profiles"
"Reframe this with business outcomes first"
```

### 4. Delta Symbol Integration

```
"Format these metrics using Delta notation"
"Add Delta symbols to this content appropriately"
"Create a before/after comparison with Δ"
```

### 5. Quality Assurance

```
"Check this page against the content checklist"
"Verify SEO metadata patterns"
"Review heading hierarchy"
```

### 6. Technical Resource Integration

```
"Use Context7 to implement this in Astro"
"Check project docs for existing CSS patterns"
"Validate with UX agent for mobile responsiveness"
"Reference Delta SVG asset for hero icon"
```

## Resource Integration

### Delta SVG Asset

The skill now references the project's Delta symbol SVG:

```
Location: public/images/gst-delta-icon-teal-stroke-thick.svg
Usage: Hero sections, card icons, decorative elements
```

**Implementation:**

```html
<img src="/images/gst-delta-icon-teal-stroke-thick.svg" alt="Delta symbol" width="48" height="48" />
```

### Context7 MCP

Always leverage Context7 for Astro-specific technical questions:

```bash
"Context7: How do I implement dynamic routes in Astro?"
"Context7: Best practices for Astro component composition?"
"Context7: Optimize static site generation for this page?"
```

### Project Documentation

Technical documentation is located at:

```
C:\Code\gst-website\src\docs\
```

Reference for:

- CSS patterns and design system (`styles/`)
- Architecture decisions
- Component specifications
- Existing code patterns

### UX Expert Agent

Use for design validation:

```
"UX Agent: Review this card layout for mobile usability"
"UX Agent: Validate accessibility for this navigation"
"UX Agent: Check touch target sizes"
```

### Resource Priority Workflow

**For complete feature implementation:**

1. **Content** → This skill (copy, structure, brand voice)
2. **Technical** → Context7 (Astro implementation) + Project Docs (patterns)
3. **Design** → UX Agent (validation) + This skill (spacing/grids)
4. **Assets** → Delta SVG for icons, check `/public/images/` for others

## When to Reference This Skill

**Always use for:**

- New page creation
- Hero section development
- Card/grid layouts
- Case study writing
- Metric presentation
- Brand voice questions

**Consider using for:**

- Blog post structure
- Email templates
- Presentation content
- Social media copy
- Client-facing documents

**Don't need for:**

- Pure technical implementation (CSS, JavaScript)
- Backend development
- DevOps configuration
- Non-content tasks

## Skill Maintenance

### Updating the Skill

When brand guidelines or content patterns evolve:

1. **Edit `SKILL.md`** with new patterns or templates
2. **Update version** in `skill.json`
3. **Commit changes** to version control
4. **Notify team** of skill updates

### Version History

- **v1.1.0** (January 2026) - Resource Integration Update
  - Added Delta SVG asset reference (`public/images/gst-delta-icon-teal-stroke-thick.svg`)
  - Integrated Context7 MCP for Astro technical guidance
  - Added project documentation location (`C:\Code\gst-website\src\docs\`)
  - Included UX Expert Agent integration
  - Added comprehensive resource priority workflow
  - Updated examples with Astro component code
- **v1.0.0** (January 2026) - Initial release
  - Core content templates
  - Brand voice guidelines
  - PE/M&A audience profiles
  - Delta symbol usage patterns
  - SEO frameworks

## Integration with Other Resources

This skill works alongside:

- **GST Brand Guidelines (v2.0)** - Full visual identity system
- **Style Documentation** (`C:\Code\gst-website\src\docs\styles\`) - CSS patterns
- **Context7** - Astro best practices
- **Existing Components** - Reusable UI elements

The skill focuses specifically on **content architecture** while complementing these other resources.

## Troubleshooting

**Skill not appearing:**

- Verify file placement in `.claude/skills/` directory
- Check that both `SKILL.md` and `skill.json` exist
- Restart Claude Code
- Check file permissions (should be readable)

**Skill not activating:**

- Try explicitly mentioning it: "Using the GST content architecture skill..."
- Verify trigger words are present in your prompt
- Check you're in the correct project context

**Content doesn't match brand:**

- Reference specific sections: "Apply the hero section template"
- Request voice review: "Check against brand voice guidelines"
- Use quality checklist: "Verify against the content checklist"

## Support

For questions or issues:

- Review the full skill documentation in `SKILL.md`
- Reference GST Brand Guidelines v2.0 for visual identity
- Consult style documentation for CSS/technical patterns

---

**Skill Type:** Content Strategy & Copywriting  
**Target Project:** Global Strategic Tech Website  
**Primary Users:** Claude Code, Claude.ai (Project Context)  
**Maintenance:** Update as brand evolves or new patterns emerge
