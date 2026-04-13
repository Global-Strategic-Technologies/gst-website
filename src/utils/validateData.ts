import type { ZodType } from 'zod';

/**
 * Validates a data source against a Zod schema at build time.
 *
 * This is the single validation primitive used by data entry-point modules
 * (e.g., `src/data/ma-portfolio/index.ts`, `src/data/techpar/stages.ts`).
 * On failure, throws an Error prefixed with the source label so build
 * output identifies exactly which file contains the malformed data.
 *
 * @param schema - Zod schema describing the expected shape
 * @param data - Raw data to validate (typically from JSON import or a TS literal)
 * @param label - Human-readable identifier for error messages (e.g., `'ma-portfolio/projects.json'`)
 * @returns The parsed, type-safe data
 * @throws Error with the label prefix on validation failure
 */
export function validateDataSource<T>(schema: ZodType<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
        return `  at ${path}: ${issue.message}`;
      })
      .join('\n');
    console.error(`[Build Error] Invalid data in ${label}:\n${issues}`);
    throw new Error(`Invalid data in ${label}:\n${issues}`);
  }

  return result.data;
}
