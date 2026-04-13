/**
 * Integration Tests for TableOfContents Component
 *
 * Tests the server-side rendered data contract of the TableOfContents component
 * by verifying the JSON serialization logic that populates `data-toc-config`
 * and the class/structure mapping rules for the rendered HTML.
 *
 * Since Astro components cannot be rendered directly in Vitest, these tests
 * replicate the component's serialization and mapping logic in isolation.
 * The tested functions (buildTocClientConfig, getTocItemClasses, resolveDefaults,
 * buildSeparatorMap) mirror inline template expressions in
 * src/components/TableOfContents.astro — not importable production code.
 *
 * If the Astro component's data contract changes, these tests MUST be updated
 * in parallel. The E2E tests in table-of-contents.test.ts validate the
 * rendered output end-to-end.
 */

// globals: true in vitest.config.ts provides describe, it, expect, beforeEach

// ─── Types mirroring the component's Props interface ─────────────────────────

interface TocItem {
  label: string;
  href: string;
  isLayer?: boolean;
  sublistSource?: string;
}

interface TocProps {
  items: TocItem[];
  heading?: string;
  ariaLabel?: string;
  collapsible?: boolean;
  separatorBefore?: number[];
  sublistIconSize?: number;
}

interface TocClientConfig {
  items: Array<{ label: string; href: string; sublistSource: string }>;
  collapsible: boolean;
  sublistIconSize: number;
}

// ─── Logic extracted from the component template ─────────────────────────────

/**
 * Builds the client config JSON that the component serializes into
 * the `data-toc-config` attribute on the rendered `<nav>`.
 * Only items with isLayer === true AND a sublistSource value are included.
 */
function buildTocClientConfig(props: TocProps): TocClientConfig {
  const layerItems = props.items
    .filter((item) => item.isLayer === true && !!item.sublistSource)
    .map((item) => ({
      label: item.label,
      href: item.href,
      sublistSource: item.sublistSource!,
    }));

  return {
    items: layerItems,
    collapsible: props.collapsible ?? false,
    sublistIconSize: props.sublistIconSize ?? 14,
  };
}

/**
 * Returns the CSS classes for a given TOC item.
 */
function getTocItemClasses(item: TocItem): string[] {
  const classes = ['toc__item'];
  if (item.isLayer) {
    classes.push('toc__layer');
  }
  return classes;
}

/**
 * Resolves default prop values, mirroring the component's defaults.
 */
function resolveDefaults(props: Partial<TocProps>): TocProps {
  return {
    items: props.items ?? [],
    heading: props.heading ?? 'Contents',
    ariaLabel: props.ariaLabel ?? 'Table of contents',
    collapsible: props.collapsible ?? false,
    separatorBefore: props.separatorBefore ?? [],
    sublistIconSize: props.sublistIconSize ?? 14,
  };
}

/**
 * Determines separator positions in the rendered list.
 * Returns an array of booleans, one per item index, indicating whether
 * a separator element should be inserted before that item.
 */
function buildSeparatorMap(itemCount: number, separatorBefore: number[]): boolean[] {
  return Array.from({ length: itemCount }, (_, i) => separatorBefore.includes(i));
}

// ─── TESTS ───────────────────────────────────────────────────────────────────

describe('TableOfContents Component', () => {
  // Shared test data
  const mixedItems: TocItem[] = [
    { label: 'Overview', href: '#overview' },
    {
      label: 'Infrastructure',
      href: '#infrastructure',
      isLayer: true,
      sublistSource: '/api/infrastructure',
    },
    { label: 'Summary', href: '#summary', isLayer: false },
    {
      label: 'Security',
      href: '#security',
      isLayer: true,
      sublistSource: '/api/security',
    },
    { label: 'Appendix', href: '#appendix', isLayer: true },
  ];

  describe('data-toc-config JSON includes only layer items with sublistSource', () => {
    it('should include items that are both isLayer and have sublistSource', () => {
      const config = buildTocClientConfig({ items: mixedItems });

      expect(config.items).toHaveLength(2);
      expect(config.items[0]).toEqual({
        label: 'Infrastructure',
        href: '#infrastructure',
        sublistSource: '/api/infrastructure',
      });
      expect(config.items[1]).toEqual({
        label: 'Security',
        href: '#security',
        sublistSource: '/api/security',
      });
    });

    it('should exclude items without isLayer flag', () => {
      const config = buildTocClientConfig({ items: mixedItems });
      const labels = config.items.map((item) => item.label);

      expect(labels).not.toContain('Overview');
      expect(labels).not.toContain('Summary');
    });

    it('should exclude items with isLayer but no sublistSource', () => {
      const config = buildTocClientConfig({ items: mixedItems });
      const labels = config.items.map((item) => item.label);

      // 'Appendix' has isLayer: true but no sublistSource
      expect(labels).not.toContain('Appendix');
    });

    it('should return empty items array when no items qualify', () => {
      const plainItems: TocItem[] = [
        { label: 'Intro', href: '#intro' },
        { label: 'Body', href: '#body' },
      ];

      const config = buildTocClientConfig({ items: plainItems });
      expect(config.items).toEqual([]);
    });

    it('should produce valid JSON-serializable output', () => {
      const config = buildTocClientConfig({ items: mixedItems });
      const serialized = JSON.stringify(config);
      const parsed = JSON.parse(serialized);

      expect(parsed).toEqual(config);
    });
  });

  describe('Items with isLayer get toc__layer class', () => {
    it('should assign toc__layer class to items with isLayer: true', () => {
      const layerItem: TocItem = {
        label: 'Infrastructure',
        href: '#infrastructure',
        isLayer: true,
        sublistSource: '/api/infrastructure',
      };

      const classes = getTocItemClasses(layerItem);
      expect(classes).toContain('toc__layer');
    });

    it('should not assign toc__layer class to non-layer items', () => {
      const plainItem: TocItem = {
        label: 'Overview',
        href: '#overview',
      };

      const classes = getTocItemClasses(plainItem);
      expect(classes).not.toContain('toc__layer');
    });

    it('should not assign toc__layer when isLayer is explicitly false', () => {
      const nonLayerItem: TocItem = {
        label: 'Summary',
        href: '#summary',
        isLayer: false,
      };

      const classes = getTocItemClasses(nonLayerItem);
      expect(classes).not.toContain('toc__layer');
    });

    it('should always include base toc__item class', () => {
      const layerItem: TocItem = {
        label: 'Security',
        href: '#security',
        isLayer: true,
      };
      const plainItem: TocItem = {
        label: 'Overview',
        href: '#overview',
      };

      expect(getTocItemClasses(layerItem)).toContain('toc__item');
      expect(getTocItemClasses(plainItem)).toContain('toc__item');
    });

    it('should correctly classify all items in a mixed list', () => {
      const classResults = mixedItems.map((item) => ({
        label: item.label,
        hasLayerClass: getTocItemClasses(item).includes('toc__layer'),
      }));

      expect(classResults).toEqual([
        { label: 'Overview', hasLayerClass: false },
        { label: 'Infrastructure', hasLayerClass: true },
        { label: 'Summary', hasLayerClass: false },
        { label: 'Security', hasLayerClass: true },
        { label: 'Appendix', hasLayerClass: true },
      ]);
    });
  });

  describe('Separators inserted at correct indices', () => {
    it('should mark separators at specified indices', () => {
      const separatorMap = buildSeparatorMap(6, [2, 5]);

      expect(separatorMap).toEqual([false, false, true, false, false, true]);
    });

    it('should return all false when separatorBefore is empty', () => {
      const separatorMap = buildSeparatorMap(4, []);

      expect(separatorMap).toEqual([false, false, false, false]);
    });

    it('should handle separator at index 0', () => {
      const separatorMap = buildSeparatorMap(3, [0]);

      expect(separatorMap[0]).toBe(true);
      expect(separatorMap[1]).toBe(false);
      expect(separatorMap[2]).toBe(false);
    });

    it('should handle separator at last index', () => {
      const separatorMap = buildSeparatorMap(5, [4]);

      expect(separatorMap[4]).toBe(true);
      expect(separatorMap.filter(Boolean)).toHaveLength(1);
    });

    it('should handle multiple adjacent separators', () => {
      const separatorMap = buildSeparatorMap(5, [1, 2, 3]);

      expect(separatorMap).toEqual([false, true, true, true, false]);
    });

    it('should ignore out-of-range indices gracefully', () => {
      const separatorMap = buildSeparatorMap(3, [2, 5, 10]);

      expect(separatorMap).toEqual([false, false, true]);
    });
  });

  describe('Chevron SVG only rendered when collapsible is true', () => {
    it('should set collapsible to true in config when prop is true', () => {
      const config = buildTocClientConfig({
        items: mixedItems,
        collapsible: true,
      });

      expect(config.collapsible).toBe(true);
    });

    it('should set collapsible to false in config when prop is false', () => {
      const config = buildTocClientConfig({
        items: mixedItems,
        collapsible: false,
      });

      expect(config.collapsible).toBe(false);
    });

    it('should default collapsible to false when prop is omitted', () => {
      const config = buildTocClientConfig({
        items: mixedItems,
      });

      expect(config.collapsible).toBe(false);
    });

    it('should serialize collapsible flag correctly in JSON output', () => {
      const configTrue = buildTocClientConfig({
        items: mixedItems,
        collapsible: true,
      });
      const configFalse = buildTocClientConfig({
        items: mixedItems,
        collapsible: false,
      });

      const parsedTrue = JSON.parse(JSON.stringify(configTrue));
      const parsedFalse = JSON.parse(JSON.stringify(configFalse));

      expect(parsedTrue.collapsible).toBe(true);
      expect(parsedFalse.collapsible).toBe(false);
    });
  });

  describe('Props defaults', () => {
    it('should default heading to "Contents"', () => {
      const resolved = resolveDefaults({ items: [] });
      expect(resolved.heading).toBe('Contents');
    });

    it('should default ariaLabel to "Table of contents"', () => {
      const resolved = resolveDefaults({ items: [] });
      expect(resolved.ariaLabel).toBe('Table of contents');
    });

    it('should default sublistIconSize to 14', () => {
      const resolved = resolveDefaults({ items: [] });
      expect(resolved.sublistIconSize).toBe(14);
    });

    it('should default collapsible to false', () => {
      const resolved = resolveDefaults({ items: [] });
      expect(resolved.collapsible).toBe(false);
    });

    it('should default separatorBefore to empty array', () => {
      const resolved = resolveDefaults({ items: [] });
      expect(resolved.separatorBefore).toEqual([]);
    });

    it('should preserve custom values when provided', () => {
      const resolved = resolveDefaults({
        items: mixedItems,
        heading: 'Navigation',
        ariaLabel: 'Page navigation',
        sublistIconSize: 20,
        collapsible: true,
        separatorBefore: [1, 3],
      });

      expect(resolved.heading).toBe('Navigation');
      expect(resolved.ariaLabel).toBe('Page navigation');
      expect(resolved.sublistIconSize).toBe(20);
      expect(resolved.collapsible).toBe(true);
      expect(resolved.separatorBefore).toEqual([1, 3]);
    });

    it('should carry sublistIconSize default into client config', () => {
      const config = buildTocClientConfig({ items: mixedItems });
      expect(config.sublistIconSize).toBe(14);
    });

    it('should pass custom sublistIconSize through to client config', () => {
      const config = buildTocClientConfig({
        items: mixedItems,
        sublistIconSize: 24,
      });
      expect(config.sublistIconSize).toBe(24);
    });
  });
});
