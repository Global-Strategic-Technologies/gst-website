/**
 * Pick the sole element of a one-element array, or `undefined` for
 * arrays of any other length (including `undefined` input).
 *
 * Shared by the deeplink builders of `search_regulations` and
 * `search_portfolio`: both website pages use single-select filter chips,
 * so a multi-element MCP filter cannot be represented in the URL — the
 * builder drops the param rather than emit a link filtered to one of the
 * values the caller asked for (BL-132).
 */
export function pickSingle<T>(v: readonly T[] | undefined): T | undefined {
  return v?.length === 1 ? v[0] : undefined;
}
