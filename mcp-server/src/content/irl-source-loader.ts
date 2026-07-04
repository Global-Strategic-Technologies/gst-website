/**
 * IRL generator-source loader.
 *
 * Exposes the machine-parsed Information Request List source that the
 * `generate_information_request_list_xlsx` tool, the `gst_information_request_list`
 * prompt, and the section catalog all render from. Codegened into
 * `irl-source-data.generated.ts` at prebuild / pretest time from
 * `src/data/irl/information-request-list.md`.
 *
 * DELIBERATELY separate from `library-loader.ts`: the IRL generator source is
 * decoupled from the `gst://library/information-request-list` Resource (the
 * human-facing library article). They share the seed content today but may
 * diverge — edit `src/data/irl/information-request-list.md` to change the
 * generated .xlsx, `src/data/library/information-request-list/article.md` to
 * change the library page.
 */

import { IRL_SOURCE_BODY } from './irl-source-data.generated';

/** The canonical IRL generator source markdown (parsed by `parseIrlArticle`). */
export function loadIrlSourceBody(): string {
  if (!IRL_SOURCE_BODY) {
    throw new Error(
      'IRL source body is empty. Re-run `npm -w @gst/mcp-server run prebuild` to regenerate irl-source-data.generated.ts.'
    );
  }
  return IRL_SOURCE_BODY;
}
