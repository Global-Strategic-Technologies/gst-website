/**
 * Tool Analytics Convention Tests
 *
 * Validates that hub tool analytics events follow the standardized
 * naming convention: <tool_prefix>_<action> with category 'tool'.
 *
 * These tests scan source files for trackEvent calls and verify
 * naming consistency, rather than executing the DOM-dependent handlers.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

/** Extract all trackEvent call blocks from a source file */
function extractTrackEventCalls(filePath: string): Array<{ event: string; category: string }> {
  const src = readFileSync(resolve(filePath), 'utf-8');
  const results: Array<{ event: string; category: string }> = [];

  // Match trackEvent({ event: '...', category: '...' }) patterns
  const regex = /trackEvent\(\{[^}]*event:\s*'([^']+)'[^}]*category:\s*'([^']+)'/g;
  let match;
  while ((match = regex.exec(src)) !== null) {
    results.push({ event: match[1], category: match[2] });
  }

  // Also match the alternate ordering: category before event
  const regex2 = /trackEvent\(\{[^}]*category:\s*'([^']+)'[^}]*event:\s*'([^']+)'/g;
  while ((match = regex2.exec(src)) !== null) {
    results.push({ event: match[2], category: match[1] });
  }

  return results;
}

describe('Tool Analytics Naming Convention', () => {
  describe('TechPar events', () => {
    const uiEvents = extractTrackEventCalls('src/utils/techpar-ui.ts');
    const domEvents = extractTrackEventCalls('src/utils/techpar/dom.ts');
    const chartEvents = extractTrackEventCalls('src/utils/techpar/chart.ts');
    const allEvents = [...uiEvents, ...domEvents, ...chartEvents];

    it('should have at least 10 tracked events', () => {
      expect(allEvents.length).toBeGreaterThanOrEqual(10);
    });

    it('should use tp_ prefix for all events', () => {
      for (const e of allEvents) {
        expect(e.event).toMatch(/^tp_/);
      }
    });

    it('should use tool category for all events', () => {
      for (const e of allEvents) {
        expect(e.category).toBe('tool');
      }
    });

    it('should include funnel events (start, complete, export)', () => {
      const names = allEvents.map((e) => e.event);
      expect(names).toContain('tp_start');
      expect(names).toContain('tp_complete');
      // Export covered by tp_copy_link, tp_copy_summary, tp_export_pdf
      expect(names.some((n) => n.startsWith('tp_copy_') || n.startsWith('tp_export_'))).toBe(true);
    });
  });

  describe('Regulatory Map events', () => {
    const events = extractTrackEventCalls('src/pages/hub/tools/regulatory-map/index.astro');

    it('should have at least 7 tracked events', () => {
      expect(events.length).toBeGreaterThanOrEqual(7);
    });

    it('should use rm_ prefix for all events', () => {
      for (const e of events) {
        expect(e.event).toMatch(/^rm_/);
      }
    });

    it('should use tool category for all events', () => {
      for (const e of events) {
        expect(e.category).toBe('tool');
      }
    });

    it('should include funnel events (start, complete)', () => {
      const names = events.map((e) => e.event);
      expect(names).toContain('rm_start');
      expect(names).toContain('rm_complete');
    });
  });

  describe('Diligence Machine events', () => {
    const events = extractTrackEventCalls('src/pages/hub/tools/diligence-machine/index.astro');

    it('should use dm_ prefix for all events', () => {
      for (const e of events) {
        expect(e.event).toMatch(/^dm_/);
      }
    });

    it('should include dm_start funnel event', () => {
      const names = events.map((e) => e.event);
      expect(names).toContain('dm_start');
    });
  });

  describe('Tech Debt Calculator events', () => {
    const events = extractTrackEventCalls('src/pages/hub/tools/tech-debt-calculator/index.astro');

    it('should use tdc_ prefix for all events', () => {
      for (const e of events) {
        expect(e.event).toMatch(/^tdc_/);
      }
    });

    it('should include funnel events (start, complete)', () => {
      const names = events.map((e) => e.event);
      expect(names).toContain('tdc_start');
      expect(names).toContain('tdc_complete');
    });
  });

  describe('ICG events', () => {
    const events = extractTrackEventCalls(
      'src/pages/hub/tools/infrastructure-cost-governance/index.astro'
    );

    it('should use icg_ prefix for all events', () => {
      for (const e of events) {
        expect(e.event).toMatch(/^icg_/);
      }
    });

    it('should include complete funnel (start, complete, export)', () => {
      const names = events.map((e) => e.event);
      expect(names).toContain('icg_assessment_start');
      expect(names).toContain('icg_assessment_complete');
      expect(names).toContain('icg_export_json');
    });
  });

  describe('Cross-tool consistency', () => {
    const allFiles = [
      'src/utils/techpar-ui.ts',
      'src/utils/techpar/dom.ts',
      'src/utils/techpar/chart.ts',
      'src/pages/hub/tools/regulatory-map/index.astro',
      'src/pages/hub/tools/diligence-machine/index.astro',
      'src/pages/hub/tools/tech-debt-calculator/index.astro',
      'src/pages/hub/tools/infrastructure-cost-governance/index.astro',
    ];

    it('all tools should use snake_case event names', () => {
      for (const file of allFiles) {
        const events = extractTrackEventCalls(file);
        for (const e of events) {
          expect(e.event).toMatch(/^[a-z][a-z0-9_]+$/);
        }
      }
    });

    it('each tool should use exactly one prefix', () => {
      const tools: Array<{ prefix: string; paths: string[] }> = [
        {
          prefix: 'tp_',
          paths: [
            'src/utils/techpar-ui.ts',
            'src/utils/techpar/dom.ts',
            'src/utils/techpar/chart.ts',
          ],
        },
        { prefix: 'rm_', paths: ['src/pages/hub/tools/regulatory-map/index.astro'] },
        { prefix: 'dm_', paths: ['src/pages/hub/tools/diligence-machine/index.astro'] },
        { prefix: 'tdc_', paths: ['src/pages/hub/tools/tech-debt-calculator/index.astro'] },
        {
          prefix: 'icg_',
          paths: ['src/pages/hub/tools/infrastructure-cost-governance/index.astro'],
        },
      ];

      for (const { prefix, paths } of tools) {
        const events = paths.flatMap((p) => extractTrackEventCalls(p));
        for (const e of events) {
          expect(e.event.startsWith(prefix)).toBe(true);
        }
      }
    });
  });
});
