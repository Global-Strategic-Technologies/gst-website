# IRL generator source

`information-request-list.md` in this folder is the **machine-parsed source** for the
Information Request List `.xlsx` generators — the Hub tool
(`src/pages/hub/tools/information-request-list-generator/`) and the MCP tool
(`mcp-server/src/tools/generate-information-request-list-xlsx.ts`). Both parse it
with the shared `parseIrlArticle` (`src/utils/irl/parse-article.ts`) and must
produce identical output, so this file **must obey the strict IRL grammar**:

- exactly one `# ` H1 title, followed by an intro paragraph;
- sections as `## NN — Title` (two ASCII digits, space, em-dash `—`, space, title);
- request rows as `- ` bullets; **no prose after the first bullet in a section**
  (the parser throws on it);
- optional `<!-- skip-if: … -->` directive comments (grammar below) — **any other
  HTML comment anywhere in the file, including the footer, is a parse error**;
- an optional `---` rule + trailing footer.

Editing outside that grammar will throw at build/parse time and break both
generators — that is intentional (loud failure over silent content drift).

## Skip-if directives (BL-044.5)

A directive is a fully-closed, single-line HTML comment that conditionally removes
the **next** bullet or section from generated artifacts:

```markdown
<!-- skip-if: <dimension>=<value>[,<value>…] -->
```

**Attachment rule**: the directive applies to the next **non-blank** line, which
must be a `- ` bullet or a `## ` section heading. Blank lines in between are
transparent. Anything else as the next line — prose, `---`, the H1, end of file —
is a parse error ("directive must precede a bullet or section heading").

**Registered dimensions** (the registry lives in `IRL_DIRECTIVE_DIMENSIONS`,
`src/utils/irl/parse-article.ts` — the parser rejects anything not listed):

| Dimension | Values                                      | Fired by                                                                                                                                |
| --------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `context` | `sell-side` · `buy-side` · `value-creation` | The engagement-context selection: Hub radio, MCP `transactionContext` arg, `?context=` deeplink. `unknown` / unspecified fires nothing. |

### Worked examples

**Bullet-level skip** — remove one question when any engagement context is known
(this tag is live in the source today; the question asks the recipient to state
the context, which is redundant once it was supplied at generation time):

```markdown
<!-- skip-if: context=sell-side,buy-side,value-creation -->

- Engagement context: sell-side preparation, buy-side review, post-close value creation, or other
```

Result: generating with any context drops this question and leaves a **gap** in
the Reference column (`0-01, 0-03, 0-04…` — `0-02` intentionally absent). The
universal artifact (no context) keeps it.

**Section-level skip** — the directive sits above the heading; the blank line is
allowed:

```markdown
<!-- skip-if: context=value-creation -->

## 08 — Corporate IT
```

Result: value-creation generations omit the whole section (its number simply
absent, like the manual section pick-list).

**Multi-directive target** — consecutive directive lines merge onto the same
target (useful once more dimensions exist); repeating the _same_ dimension twice
before one target is a parse error — merge the values instead.

### What should be tagged (authoring guidance)

A question is tag-worthy when either:

1. **A supplied input makes it objectively redundant** — the shipped
   `Engagement context` tag is the canonical case: the generator already knows
   the answer, so asking the recipient wastes a row.
2. **It is categorically irrelevant to an engagement type** — judgment calls that
   belong to senior consultants, not engineers. Illustrative candidates _for
   content review, not yet authored_: the competitive-landscape ask on
   value-creation engagements (post-close, the market scan is usually done); the
   twelve-month hiring plan on sell-side preparation (forward hiring is the
   buyer's question).

Keep tags conservative: an over-tagged source silently thins the artifact and
recipients can't see what they weren't asked. When in doubt, leave the question
in — recipients can answer "n/a".

**Same-PR discipline**: every new tag also adds a row to the "filter directives"
table in `irl-tool-input-mapping` (both copies — the library article AND
`mcp-server/src/docs/library/irl-tool-input-mapping.md`; a drift-guard test
enforces byte-identity).

### Extension checklist — adding a new dimension (e.g. `productType`)

A registry entry is one line, but a dimension is only real when every surface can
supply it. Follow in order:

1. **Registry**: add the dimension + allowed values to `IRL_DIRECTIVE_DIMENSIONS`
   in `src/utils/irl/parse-article.ts`.
2. **Shared filter**: extend `IRLCustomizeOptions` + `applyDirectives` in
   `src/utils/irl/customize-article.ts` to accept and match the new dimension.
3. **MCP tool**: add a structured arg to `GenerateIrlXlsxInputSchema`
   (`mcp-server/src/tools/generate-information-request-list-xlsx.ts`), thread it
   into `customizeIrlArticle`, emit it as a deeplink param, update
   `TOOL_DESCRIPTION` + the arg describes.
4. **MCP prompt**: add the wire arg (see `wire-shape.ts` adapters) to
   `gst_information_request_list`, map it into `toolArgs` + the omission-clause
   computation, bump the prompt version.
5. **Hub page**: add the form control, thread the value into the client
   `customizeIrlArticle` call, add the deeplink param + hydration, extend the
   auto-skip rendering (`data-skip-*` attributes + the context-change listener).
6. **Tests**: parser (new dimension accepted/validated), customize
   (`applyDirectives` match), MCP tool + prompt, Hub E2E (form control → file).
7. **Hashes that move**: the prompt version bump drifts `EXPECTED_MANIFEST_HASH`
   (`mcp-server/tests/integration/manifest-stability.test.ts`); if the source
   `.md` gains tags in the same change, all 7 `EXPECTED_HASH_*` constants in
   `irl-ingestion-body-hash-stability.test.ts` drift too (the source is embedded
   in every `gst_irl_ingestion` body). Update BREAKING_CHANGES.md + the
   mcp-server package version in lockstep.
8. **Docs**: this README's dimension table, the BL-044 design doc, the
   tool-input-mapping "filter directives" table (both copies), the mcp README
   tool/prompt rows.

## Positional keys — governance note

Per-question removal (`excludeRequests`, `?exclude=` deeplinks) addresses
questions by **position**: `NN-II` = two-digit section + two-digit 1-based
ordinal _as authored in this file_. Reordering or inserting bullets **shifts what
existing keys mean** — an old deeplink or pinned MCP call built against the
previous layout will silently target different questions. Prefer appending new
bullets at the end of a section; when inserting or reordering is unavoidable,
treat it like an API change (note it in the PR description). Skip-if directives
do not have this problem — they travel with the question they tag.

## Not the library article

This is deliberately **separate** from the human-facing library article at
`src/data/library/information-request-list/article.md` (rendered at
`/hub/library/information-request-list/`). That article is free-form prose and may
diverge from this list; there is no requirement that the two match. If you want a
change to appear in the generated `.xlsx`, edit **this** file. If you want it to
appear on the library page, edit the library article.

## MCP propagation

The MCP Worker bundles a snapshot of this file
(`mcp-server/src/content/irl-source-data.generated.ts`, regenerated by
`mcp-server/scripts/generate-regulations-index.mjs` on prebuild/pretest). A change
here reaches the website on its next deploy and the MCP Worker only after the
snapshot is regenerated, committed, and the Worker redeployed.
