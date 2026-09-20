# ADR-0037: `src/docs/architecture/` draws in mermaid, and that convention stops at its own directory

- **Status**: Accepted (2026-09-19)
- **Source initiative**: BL-154 Slice 2 (five-layer architecture reference). No separate design doc.

## Context

BL-154 adds the repo's first diagram set that is a **map of the whole estate** rather than a figure inside a reference doc: six files under [`src/docs/architecture/`](../architecture/README.md), one per layer of the [business-architectures article](../../data/library/business-architectures/article.md) plus an index. They needed a medium.

The repo is not a blank slate. No mermaid, SVG, `.mmd`, `.drawio` or `.puml` exists in tracked source, but **ASCII box-drawing diagrams already exist in 17 maintained markdown files** (DEVELOPER_TOOLING.md's pipeline map, JSON_LD_SCHEMA.md, TEST_STRATEGY.md, CLAUDE.md's own project tree among them), counted by scanning `**/*.md` for U+2500–U+257F. Note `mcp-server/src/docs/ARCHITECTURE.md` contains none — it is prose throughout, whatever two earlier reviews asserted.

Two tooling facts shape the choice. Prettier is the only markdown formatter here and leaves the contents of an unknown-language fence verbatim, so a mermaid block survives lint-staged. And **nothing in CI renders or lints mermaid**: `test:docs` checks links and anchors, and links inside any fenced block are skipped, so a syntactically broken diagram passes every gate and fails silently on GitHub.

## Decision

**Diagrams under `src/docs/architecture/` are mermaid in fenced code blocks. That is a convention for that directory only.**

- It is **not a repo-wide ruling**. The 17 ASCII-diagram files are not converted, and a future figure inside a reference doc may still be ASCII where that reads better in a terminal or a diff. This ADR adds a second medium in one place; it does not replace the first anywhere.
- Every block is **rendered before commit**, not merely parsed: a scratch Playwright page loads a pinned mermaid build (`11.17.2`, the last 11.x on jsdelivr at the time — GitHub's renderer tracks the 11 line) and calls `mermaid.render()` on each block, failing on any error. The directory README records this as the pre-commit step because no CI job does it.
- Diagrams draw **cross-cutting views only**, and `README.md` carries a per-section table proving each maintained reference is linked rather than re-drawn. That rule is what keeps the map from becoming a second territory that drifts.

**Rejected**

- **ASCII for consistency with the 17.** A five-layer estate map with two platforms, three auth paths and four stores does not fit a monospace box grid legibly, and the existing ASCII figures are all single-file, single-concern.
- **A mermaid lint/render step in CI.** Six files with one consumer do not justify a browser-backed job in `docs-integrity.yml`; the scratch render covers it, and the README says so. Revisit if the directory grows past a handful of files or a second directory adopts the medium.
- **Committed SVG exports.** Un-diffable, and a second artifact to keep in sync with its source.

## Consequences

- **Cites this decision**: [`src/docs/architecture/README.md`](../architecture/README.md) § Conventions.
- **Trade-off accepted**: a diagram that parses but lays out wrongly is caught only by the pre-commit render and the author's eye; GitHub's renderer version can drift from the pinned one.
- **Revisit triggers**: mermaid appears in a second directory; the directory exceeds roughly ten diagrams; GitHub changes its supported mermaid major.
