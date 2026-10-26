/**
 * `{name}` placeholder filling for catalog strings.
 *
 * Its own module, with no catalog imports, so client scripts can share the
 * exact rule `t()` uses without pulling `t.ts` — whose eager glob loads every
 * catalog of every locale — into the browser bundle.
 */
export type Params = Record<string, string | number>;

export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole
  );
}
