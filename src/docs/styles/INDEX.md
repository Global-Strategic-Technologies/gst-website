# Styles Documentation - Index

Quick navigation guide for all CSS styling documentation.

---

## 📚 Documentation Files

### [STYLES_GUIDE.md](./STYLES_GUIDE.md) - Main Styling Guide
**The primary reference for CSS standards and best practices**

- Design system architecture and philosophy
- CSS variable organization strategy
- Component styling patterns
- Dark theme implementation
- Responsive design patterns
- Common anti-patterns to avoid (very important!)
- File organization and import order
- Best practices and accessibility

**When to use**: Starting a new feature, fixing styling bugs, or learning project conventions

---

### [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md) - Design Token Catalog
**Complete listing of all CSS variables and their values**

- All color variables (primary, backgrounds, text, borders)
- Spacing scale variables
- Typography size and weight variables
- Transition/animation variables
- Shadow variables
- Component-specific variable groups
- Usage examples for each category
- Variable lookup by purpose

**When to use**: Styling a component, need specific color/spacing/font value

---

### [TYPOGRAPHY_REFERENCE.md](./TYPOGRAPHY_REFERENCE.md) - Text & Font Guide
**Semantic text utilities and typography patterns**

- All heading utilities (.heading-xl through .heading-sm)
- Body text utilities (.text-base, .text-small, .text-tiny)
- Label utilities (.label, .label-small)
- Navigation link utilities (.nav-link)
- Button text utilities (.button-text, .button-text-lg)
- Typography hierarchy examples
- Dark theme text color switching
- Responsive typography patterns
- Accessibility considerations

**When to use**: Adding text content, creating buttons/labels, setting up typography hierarchy

---

## 🎯 Quick Start by Task

### "I'm adding a new component"

1. Read: [STYLES_GUIDE.md - Component Styling](./STYLES_GUIDE.md#component-styling)
2. Reference: [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md) for colors/spacing
3. Check: [TYPOGRAPHY_REFERENCE.md](./TYPOGRAPHY_REFERENCE.md) for text
4. Remember: Use variables, not hardcoded values!

### "I'm styling text/headings"

1. Read: [TYPOGRAPHY_REFERENCE.md](./TYPOGRAPHY_REFERENCE.md)
2. Pick appropriate utility class (.heading-lg, .text-base, etc.)
3. Dark theme automatically works!

### "I need a specific color"

1. Open: [VARIABLES_REFERENCE.md - Color Variables](./VARIABLES_REFERENCE.md#color-variables)
2. Find color that matches your need
3. Use: `background: var(--color-name);`
4. Dark theme automatically works!

### "I need spacing/margins"

1. Open: [VARIABLES_REFERENCE.md - Spacing Variables](./VARIABLES_REFERENCE.md#spacing-variables)
2. Find appropriate spacing size
3. Use: `padding: var(--spacing-lg);` or `gap: var(--gap-normal);`

### "I'm fixing a styling bug"

1. Check: [STYLES_GUIDE.md - Common Anti-Patterns](./STYLES_GUIDE.md#common-anti-patterns-to-avoid)
2. Is it hardcoded color? → Use variables instead
3. Is it hardcoded spacing? → Use spacing variables
4. Is it hardcoded font size? → Use typography utilities
5. Is dark theme broken? → Ensure variables are used

### "Dark theme isn't working"

1. Read: [STYLES_GUIDE.md - Dark Theme Implementation](./STYLES_GUIDE.md#dark-theme-implementation)
2. Check: Did you hardcode colors instead of using variables?
3. Fix: Replace hardcoded values with `var(--variable-name)`
4. Test: Toggle dark theme and verify colors switch

### "I need to understand the design system"

1. Start: [STYLES_GUIDE.md - Design System Architecture](./STYLES_GUIDE.md#design-system-architecture)
2. Reference: [VARIABLES_REFERENCE.md - Color Variables](./VARIABLES_REFERENCE.md#color-variables)
3. Understand: Single variable override pattern in dark theme

---

## 🗂️ File Organization

The styles documentation covers all files in `src/styles/`:

```
src/styles/
├── variables.css           # Design system tokens (covered in VARIABLES_REFERENCE.md)
├── typography.css          # Semantic text utilities (covered in TYPOGRAPHY_REFERENCE.md)
├── interactions.css        # Interactive patterns (mentioned in STYLES_GUIDE.md)
├── portfolio-controls.css  # Shared component styling
└── global.css             # Layout, page styles, dark theme (covered in STYLES_GUIDE.md)
```

---

## ⚠️ Most Important Anti-Patterns to Avoid

### 1. **Hardcoded Colors**
```css
/* ❌ DON'T */
.text { color: #1a1a1a; }
.button { background: #05cd99; }

/* ✅ DO */
.text { color: var(--text-light-primary); }
.button { background: var(--color-primary); }
```

**Why**: Colors are theme-dependent. Variables automatically switch between light/dark.

### 2. **Duplicate Dark Theme Rules**
```css
/* ❌ DON'T - 100+ lines of duplication */
html.dark-theme .button { color: #05cd99; }
html.dark-theme .text { color: #f5f5f5; }
html.dark-theme .card { background: #1a1a1a; }
/* ... 50+ more rules */

/* ✅ DO - Variables override automatically */
:root { --button-color: #05cd99; --text-color: #1a1a1a; }
html.dark-theme { --button-color: #05cd99; --text-color: #f5f5f5; }
.button { color: var(--button-color); }
.text { color: var(--text-color); }
```

### 3. **Hardcoded Spacing**
```css
/* ❌ DON'T - Breaks design consistency */
.card { padding: 14px; margin: 23px; }

/* ✅ DO - Uses spacing scale */
.card { padding: var(--spacing-lg); margin: var(--spacing-md); }
```

### 4. **Hardcoded Font Sizes**
```css
/* ❌ DON'T */
.title { font-size: 32px; }
.label { font-size: 12px; }

/* ✅ DO */
<h1 class="heading-lg">Title</h1>
<span class="label">Label</span>
```

See [STYLES_GUIDE.md - Anti-Patterns](./STYLES_GUIDE.md#common-anti-patterns-to-avoid) for more detailed explanations.

---

## 📊 Design System Statistics

- **Total CSS Variables**: 80+
- **Color Variables**: 50+
- **Spacing Values**: 11 (xs through 3xl)
- **Typography Classes**: 11 semantic utilities
- **Theme Support**: 100% (all variables have light and dark values)
- **Responsive Breakpoints**: 3 (480px, 768px, 1024px+)

---

## 🔄 CSS Consolidation Progress

The project has systematically consolidated CSS to eliminate duplication:

- **Phase 1**: Created variables.css - Consolidated 300-400 lines
- **Phase 2**: Created typography.css & interactions.css - Removed 115+ duplications
- **Phase 3**: Variable-based dark themes - Saved 150+ lines

**Total savings**: 500+ CSS lines consolidated to centralized design system

---

## 🚀 Workflow Example

### Adding a New Styled Component

```
1. Plan component in STYLES_GUIDE.md - Component Styling section
2. Check VARIABLES_REFERENCE.md for colors/spacing
3. Check TYPOGRAPHY_REFERENCE.md for text styles
4. Create component-scoped styles (if unique) or shared stylesheet
5. Use variables, NOT hardcoded values
6. Test in light and dark themes
7. Verify component is responsive
8. Run tests: npm run test:all
9. Commit with clear message about styling choices
```

---

## 📞 Help Resources

### Common Questions

**Q: Should I hardcode this color?**
A: No. Check [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md#color-variables) for a matching variable.

**Q: How do I make text look a certain way?**
A: Use a semantic utility from [TYPOGRAPHY_REFERENCE.md](./TYPOGRAPHY_REFERENCE.md).

**Q: How do I add spacing?**
A: Use spacing variables from [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md#spacing-variables).

**Q: Does dark theme just work?**
A: Yes, IF you use variables! Read [STYLES_GUIDE.md - Dark Theme](./STYLES_GUIDE.md#dark-theme-implementation).

**Q: Can I create a new design system variable?**
A: Only if existing ones don't fit. See [STYLES_GUIDE.md - New Component](./STYLES_GUIDE.md#adding-new-component-styles).

---

## 📝 Keeping Documentation Current

When making styling changes:

1. **Adding new variables?** → Update [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md)
2. **Adding new typography utilities?** → Update [TYPOGRAPHY_REFERENCE.md](./TYPOGRAPHY_REFERENCE.md)
3. **Discovering an anti-pattern?** → Add to [STYLES_GUIDE.md](./STYLES_GUIDE.md#common-anti-patterns-to-avoid)
4. **Changing file structure?** → Update this INDEX

---

## 🎓 Learning Path

**New to the project's styling system?**

1. Start: [STYLES_GUIDE.md - Design System Architecture](./STYLES_GUIDE.md#design-system-architecture)
2. Then: [STYLES_GUIDE.md - Component Styling](./STYLES_GUIDE.md#component-styling)
3. Reference: [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md) while coding
4. For text: [TYPOGRAPHY_REFERENCE.md](./TYPOGRAPHY_REFERENCE.md)
5. When styling: Check [STYLES_GUIDE.md - Anti-Patterns](./STYLES_GUIDE.md#common-anti-patterns-to-avoid) to avoid mistakes

**Experienced and just need to check something?**

- Need a color value? → [VARIABLES_REFERENCE.md](./VARIABLES_REFERENCE.md)
- Need a font size? → [TYPOGRAPHY_REFERENCE.md](./TYPOGRAPHY_REFERENCE.md)
- Need a pattern? → [STYLES_GUIDE.md](./STYLES_GUIDE.md)

---

## 🔗 Related Documentation

- **Main Project Guide**: [CLAUDE.md](../CLAUDE.md)
- **Testing Guide**: [Testing Index](../testing/INDEX.md)
- **Development Opportunities**: [Development Guide](../development/DEVELOPMENT_OPPORTUNITIES.md)

---

**Last Updated**: March 11, 2026
**Status**: Complete and ready for use
**Related Files**:
- `src/styles/variables.css`
- `src/styles/typography.css`
- `src/styles/interactions.css`
- `src/styles/global.css`
- `src/styles/portfolio-controls.css`
