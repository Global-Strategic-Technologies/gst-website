import { ProjectsArraySchema, type Project } from '@/schemas/portfolio';
import { projects } from '@/data/ma-portfolio';

/**
 * Portfolio data validation tests.
 *
 * Schema-shape validation is delegated to Zod (`ProjectsArraySchema`),
 * which is also enforced at build time via `src/data/ma-portfolio/index.ts`.
 * This test file covers:
 *   - the schema parses the live JSON cleanly (smoke test)
 *   - business-logic invariants Zod cannot express (uniqueness,
 *     currency-symbol consistency, technology tag hygiene)
 */

describe('Projects Data Validation', () => {
  describe('Schema validation (Zod)', () => {
    it('parses projects.json against ProjectsArraySchema', () => {
      const result = ProjectsArraySchema.safeParse(projects);
      if (!result.success) {
        // Surface the first issue so a failing run is actionable.
        const first = result.error.issues[0];
        throw new Error(`Schema parse failed at ${first?.path.join('.')}: ${first?.message}`);
      }
      expect(result.success).toBe(true);
    });

    it('has at least one project', () => {
      expect(projects.length).toBeGreaterThan(0);
    });
  });

  describe('Business invariants (beyond schema shape)', () => {
    it('has unique project IDs', () => {
      const ids = projects.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('has unique project code names', () => {
      const names = projects.map((p) => p.codeName);
      expect(new Set(names).size).toBe(names.length);
    });

    it('has currency symbols in `arr` consistent with the `currency` field', () => {
      const currencyMap: Record<Project['currency'], string> = {
        USD: '$',
        EUR: '€',
        GBP: '£',
        JPY: '¥',
        AUD: 'A$',
      };

      projects.forEach((project) => {
        // Skip non-numeric placeholder values that legitimately omit symbols.
        if (project.arr === 'Not in source' || project.arr === 'N/A') return;
        expect(project.arr).toContain(currencyMap[project.currency]);
      });
    });

    it('has trimmed, non-empty technology tags', () => {
      projects.forEach((project) => {
        project.technologies.forEach((tech) => {
          expect(tech.trim()).toBe(tech);
          expect(tech.length).toBeGreaterThan(0);
        });
      });
    });

    it('has reasonable technology list lengths (<50 per project)', () => {
      projects.forEach((project) => {
        expect(project.technologies.length).toBeLessThan(50);
      });
    });
  });
});
