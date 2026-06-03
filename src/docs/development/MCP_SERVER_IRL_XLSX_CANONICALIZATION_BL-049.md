# MCP Server — IRL xlsx Canonicalization for Hash-Bind Authority (BL-049)

> **Backlog initiative**: [BL-049: `gst_irl_ingestion` — Server-Side xlsx Canonicalization for Hash-Bind Authority](BACKLOG.md#bl-049-gst_irl_ingestion--server-side-xlsx-canonicalization-for-hash-bind-authority)
>
> **Companion docs**:
>
> - [MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md](MCP_SERVER_FILLED_IRL_INGESTION_BL-045.md) — the design doc this initiative extends. BL-045 PR B shipped the hash-bind forcing function in `compose_dossier_envelope` at v0.12.0; this initiative closes the last empirical false-positive class the v11 StoreForce live exercise exposed.
> - [MCP_SERVER_FILLED_IRL_INGESTION_BL-045_TOOL_SCHEMA_ENFORCEMENT_SPEC.md](MCP_SERVER_FILLED_IRL_INGESTION_BL-045_TOOL_SCHEMA_ENFORCEMENT_SPEC.md) — the tool-input audit architecture (Phase 1/2/2A) BL-049 inherits. The hash-bind in compose_dossier_envelope is the same architectural pattern applied to the rendering layer; xlsx canonicalization gives the rendering-layer hash-bind an authoritative source.
> - [MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md](MCP_SERVER_INFORMATION_REQUEST_LIST_BL-043.md) — canonical IRL article (Library Resource at `gst://library/information-request-list`). The canonical-form output of BL-049's parser MUST round-trip to this article's section / bullet shape.
> - [MCP_SERVER_IRL_GENERATOR_BL-044.md](MCP_SERVER_IRL_GENERATOR_BL-044.md) — fillable-form generator. Produces the `.xlsx` whose populated form is the input to BL-049. The generator's pure-function pipeline (`generateIrlXlsxBuffer`) is the inverse of BL-049's parser; the two share the same workbook shape and **share the `xlsx-js-style` dep already on the wire**.
> - [`mcp-server/BREAKING_CHANGES.md`](../../../mcp-server/BREAKING_CHANGES.md) — semver log. This initiative bumps the server **minor** for Path A (new tool) or **patch** for Path B (additive arg).
>
> **Predecessors**: BL-043 (canonical article + Resource), BL-044 (fillable-form generator + `xlsx-js-style` pipeline), BL-045 PR B (hash-bind forcing function in `compose_dossier_envelope` shipped at v0.12.0 — the architecture BL-049 closes the input-authority gap for).
>
> **Sequels**: BL-046 candidate (in-Claude-Desktop file delivery) may eventually deliver xlsx as `resource_link` content blocks; BL-049's tool surface should compose cleanly with that workflow when it ships.
>
> **Scope**: ship server-side xlsx → canonical-IRL-markdown conversion so the hash-bind forcing function in `compose_dossier_envelope` binds to an authoritative server-canonicalized body rather than a model-regenerated reconstruction. **One canonicalization surface, two viable invocation paths** (Path A: new tool `extract_irl_from_xlsx`; Path B: extended prompt arg `filledIrlXlsx`). Single PR delivery; recommendation is Path A for the cleaner architectural seam.
>
> **Status**: Draft — design doc authored 2026-06-03 following BL-045 PR B closeout. **Filed in BACKLOG.md as medium priority** — the BL-045 PR B v11 live exercise empirically demonstrated the forcing-function architecture works (model self-corrected based on tool verdicts); this initiative eliminates the residual encoding-drift false-positive class but does NOT unblock anything currently load-bearing. Promotion from candidate to committed pending Path A vs Path B scoping decision + senior-consultant review of BL-045 PR B (which validates whether the v11 model-disclosed false positives are acceptable to ship without).

---

## At a glance

```
┌────────────────────────────┐   Path A (recommended)        ┌──────────────────────────────┐
│ Operator attaches xlsx in  │ ─────────────────────────────▶│ extract_irl_from_xlsx        │
│ Claude Desktop conversation│                               │  ── pure tool ──             │
│ AND invokes               │                               │  parse xlsx → IRLArticle AST │
│ /gst_irl_ingestion         │                               │  serialize → canonical .md   │
│ in interactive mode        │                               │  return { filledIrlMarkdown, │
└────────────────────────────┘                               │           irlBodyHash, ...} │
                                                             └──────────────────────────────┘
                                                                          │
                                                                          ▼
                                                  Model re-invokes /gst_irl_ingestion
                                                  with filledIrl: <returned markdown>
                                                          │
                                                          ▼
                              ┌────────────────────────────────────────────────────┐
                              │ Prompt body embeds **Body-binding hash: <16hex>**  │
                              │ Model calls compose_dossier_envelope               │
                              │ Tool verifies sha256(filledIrl) === irlBodyHash    │
                              │ Provenance verifier substring-matches against the  │
                              │ SERVER-CANONICALIZED body — encoding-drift class   │
                              │ false-positives eliminated                         │
                              └────────────────────────────────────────────────────┘
```

**The forcing function is preserved, the input contract becomes authoritative.** Today the partner must paste markdown into the `filledIrl` arg for the hash-bind to bind to anything meaningful. BL-049 keeps the same hash-bind algorithm but lets the model fetch the canonical body from a server-side tool instead of reconstructing it from spreadsheet cells. The architecturally clean payoff: the (K) provenance footer's verification counts measure against a known-good body, not against the model's own working memory.

---

## Context — what the v11 live exercise revealed

### The architecture works; the input contract has an upstream gap

BL-045 PR B v0.12.0 shipped the hash-bind forcing function: the prompt body embeds `**Body-binding hash:** <16-hex>` computed from `sha256(args.filledIrl).slice(0, 16)`. The model copies the hash into `compose_dossier_envelope`'s `irlBodyHash` input. The tool re-computes `sha256(input.filledIrl).slice(0, 16)` and rejects on mismatch via `IrlBodyHashMismatchError`. The model can't pass a paraphrased IRL because sha256 doesn't paraphrase.

The v11 StoreForce live exercise (2026-06-03) empirically validated the architectural pattern: the model called the envelope tool, hit the hash check, recognized that its first-call `filledIrl` was the blank canonical IRL template rather than the populated response, **wrote its own substring-validation script**, re-scoped citations to verbatim substrings, and re-called with corrected inputs. This is the same architectural pattern that solved the dimension-layer fabrication risk (Phase 1/2/2A) playing out at the rendering layer.

**But the second envelope call still produced 30 false-positive `tier-mismatch:` entries** — disclosed in the model's own footnote on the gap list: _"the citation excerpts supplied to the envelope tool were paraphrased reconstructions of the spreadsheet rows rather than byte-exact substrings of the populated IRL workbook"_.

### Why the false positives appear even after self-correction

Two failure modes compound:

1. **No prompt arg → no body-binding hash directive.** The partner invoked `/gst_irl_ingestion` without supplying `filledIrl` (interactive mode), then attached the xlsx separately. The prompt rendered the interactive body — which does not embed a body-binding hash because there is no IRL body to hash. The model improvised: read xlsx into context, ran the eight content tools (none of which require `filledIrl`), reached the envelope step, and had to fabricate a `filledIrl` payload AND its own `irlBodyHash`.

2. **Model regenerates both sides of the comparison.** Even when the model carefully reconstructs the populated IRL as markdown, it generates the body and the citation excerpts as two separate text streams. Subtle encoding drift between them (em-dash vs hyphen, smart quotes vs straight quotes, NBSP vs space, list-marker variants) causes substring matching to fail. The provenance verifier's normalizer (`normalizeForMatching` in `mcp-server/src/schemas/validate-irl-provenance.ts`) handles some of these (lowercase, flatten dashes, collapse whitespace, strip markdown noise), but the 8-word fuzzy fallback (`FUZZY_MIN_RUN`) also fails when the drift breaks contiguous-word runs.

The hash-bind passes in this scenario because the model is self-consistent (it hashes what it submits). But the architecture's intent — bind to the partner's authoritative source — is lost.

### What BL-049 does NOT need to fix

The forcing-function architecture itself is empirically validated. v11 demonstrated the model uses the (K) verdict surface as actionable feedback. The architecture's behavior on properly-sourced filledIrl payloads is correct: when the partner pastes markdown into the `filledIrl` arg today, the hash-bind binds to the partner's bytes, the provenance verifier matches against those bytes, and the verification counts are meaningful.

BL-049 closes ONE specific input-class gap: xlsx-attached IRL workflows. It does NOT redesign the hash-bind, does NOT extend the model's self-correction loop, does NOT loosen the verifier (which would invite real fabrications to fuzzy-pass). It gives the existing architecture an authoritative input source it currently lacks for the xlsx case.

---

## The two implementation paths

### Path A — New MCP tool `extract_irl_from_xlsx` (RECOMMENDED)

Ship a pure MCP tool that takes xlsx bytes and returns the canonicalized markdown body PLUS its hash. The model calls the tool first, receives the canonical body, then re-invokes `gst_irl_ingestion` with that body as the `filledIrl` arg. From that point the existing v0.12.0 architecture fires correctly.

**Input shape**:

```ts
{
  xlsxBase64: z.string()
    .min(1)
    .describe(
      'Base64-encoded xlsx file bytes. The standard IRL workbook produced by gst_information_request_list@0.0.2+ via generate_information_request_list_xlsx.'
    );
}
```

**Output shape**:

```ts
{
  filledIrlMarkdown: string; // canonical-form markdown ready to pass as filledIrl
  irlBodyHash: string; // sha256(filledIrlMarkdown).slice(0,16) — same algorithm as compose_dossier_envelope
  sectionsParsed: number; // 10 for a complete canonical workbook
  substantiveCellsCounted: number;
  totalCellsCounted: number;
  fillRatio: {
    percent: number;
    status: 'halt' | 'partial' | 'ok';
  }
  reInvokeInstructions: string; // partner-facing prose telling the model how to re-invoke
}
```

**Operator workflow**:

1. Partner attaches `.xlsx` to the Claude Desktop conversation.
2. Partner invokes `/gst_irl_ingestion` in interactive mode (no args). The prompt body says: _"You appear to have attached an xlsx file — call `extract_irl_from_xlsx` with the base64-encoded bytes, then re-invoke this prompt with the returned `filledIrlMarkdown` as the `filledIrl` arg."_
3. Model calls `extract_irl_from_xlsx` → receives canonical body + hash + fillRatio.
4. Model re-invokes `/gst_irl_ingestion` with the returned markdown as `filledIrl`. Now the prompt renders the one-shot body with `**Body-binding hash:**` directive matching the canonical body.
5. Sweep proceeds normally. compose_dossier_envelope's hash-bind binds to the canonical body; provenance verifier substring-matches against the canonical body.

**Architectural advantages**:

- **Authoritative server source**: `filledIrlMarkdown` is generated by a pure server-side function from the xlsx bytes. The model can't drift between body-generation and citation-generation because both come from the same canonical source.
- **Pure tool**: no engine state, no Hub deeplink, no side effects. Easy to unit-test with the existing StoreForce + MedSig + Helios-Grid fixtures.
- **Reuses existing dep**: `xlsx-js-style` is already in `mcp-server/package.json` for the BL-044 generator. The BL-049 parser is the inverse operation; no new dependency.
- **Composable with BL-046**: if BL-046 eventually delivers xlsx as `resource_link` content blocks, `extract_irl_from_xlsx` can accept a Resource URI as an alternative input. Same tool surface, additive arg.

**Effort**: ~2-4 hours. Breakdown:

- **xlsx parser** (~60-90 min). Walk the xlsx workbook with `xlsx-js-style`, extract per-row `(Reference, Request, Response, Comments)` tuples for sections 00-09 plus optional engagement-specific sections. Canonical-form serializer per the spec below.
- **MCP tool wiring** (~30 min). New file `mcp-server/src/tools/extract-irl-from-xlsx.ts` modeled on `mcp-server/src/tools/validate-irl-provenance.ts`. Register in `server.ts`. Add to `tests/integration/protocol-roundtrip.test.ts` tools list.
- **Unit tests** (~30-60 min). Against the StoreForce, MedSig, and Helios-Grid xlsx fixtures (the latter two would need a new fixture if not already in BL-044's test surface).
- **Prompt body update** (~15 min). Add interactive-body guidance directing the model to call `extract_irl_from_xlsx` when the conversation carries an xlsx attachment but no `filledIrl` arg.
- **BREAKING_CHANGES entry, version bump 0.12.x → 0.13.0** (~15 min).
- **Manifest hash + body hash rebaseline** (~15 min — interactive body changes; one-shot bodies do not).

### Path B — Extended `gst_irl_ingestion` prompt arg `filledIrlXlsx`

Extend `argsSchema` with an optional `filledIrlXlsx: z.string()` arg accepting base64 xlsx bytes. Prompt build seam server-side decodes and canonicalizes BEFORE computing the body-binding hash. The body-shown hash binds to the canonicalized markdown, which is what gets passed downstream.

**Input shape change** (in `mcp-server/src/prompts/irl-ingestion.ts`):

```ts
const argsSchema = z.object({
  targetName: z.string().min(1).optional()…,
  filledIrl: z.string().min(200).optional()…,
  filledIrlXlsx: z.string().min(1).optional()
    .describe('Alternative to filledIrl — base64 xlsx bytes the server canonicalizes at build time. Exactly one of filledIrl OR filledIrlXlsx may be supplied; supplying both is a build-time error.'),
  // ... existing args
});
```

**Operator workflow**:

1. Partner attaches xlsx OR pastes base64 of the xlsx into the slash-menu arg field.
2. Server-side build seam canonicalizes xlsx → markdown, computes `irlBodyHash`, embeds in body.
3. Single-step model interaction: model receives the one-shot body with the canonical IRL inline as `## Filled IRL` AND the matching body-binding hash directive.

**Architectural advantages over Path A**:

- **Single round-trip**: no two-step "call extractor, then re-invoke" — the canonicalization happens at prompt build time.
- **Same forcing function semantics**: hash-bind still fires identically; the model's input contract is unchanged.

**Architectural disadvantages vs Path A**:

- **Base64 UX in slash menu is awkward**: pasting a base64-encoded xlsx (potentially 50-200KB of base64) into the Claude Desktop slash-menu form is impractical for partners. Requires either a Claude Desktop attachment-to-arg adapter (does not exist) OR partner-side base64 encoding via terminal (operationally hostile).
- **Couples prompt args to file delivery**: the prompt schema gains a binary-input field. Hub UI and future MCP clients now have to handle the dual `filledIrl | filledIrlXlsx` shape. Path A keeps the prompt's input contract pure.
- **Overlaps with BL-046**: a Claude-Desktop-native attachment-to-arg adapter is closer to BL-046's scope. Building Path B now risks duplicating that work.
- **No reusable parser surface**: the canonicalization logic lives inside the prompt build wrapper rather than as a standalone tool. Future callers (e.g., an MCP client that wants to canonicalize an xlsx without invoking the full prompt) have no entry point.

**Effort**: ~4-6 hours. Reasonable, but most of the extra time goes into the dual-arg gymnastics, schema cross-validation, and per-arg body-hash test scenarios.

### Recommendation: Path A

**Ship Path A.** The two-step workflow is acceptable for an operator-facing surface (the model handles the two-step transparently — the partner sees a single invocation), the prompt arg contract stays pure, and the standalone tool composes cleanly with future workflows including BL-046's eventual `resource_link` delivery.

Path B reads as the more "elegant" single-step solution at first glance, but the base64 UX makes it impractical for partner-natural invocations today, and the binary-input arg field is a long-term maintenance burden for marginal UX gain.

---

## Canonical-form specification

The canonical IRL markdown that `extract_irl_from_xlsx` returns MUST be deterministic from the xlsx input — same bytes in, same bytes out. The provenance verifier's substring matching depends on byte-level stability; any nondeterminism in the serializer creates a new false-positive class.

### Section heading shape

Each canonical section uses the literal header from BL-043's article:

```
## 00 — Basics
## 01 — Product
## 02 — Software Architecture
## 03 — Infrastructure & Operations
## 04 — SDLC
## 05 — Data, Analytics & AI
## 06 — Security
## 07 — People & Organization
## 08 — Corporate IT
## 09 — Governance & Compliance
```

Engagement-specific sections (`10 — *`, `11 — *`) that appear in a populated workbook are passed through verbatim using the section title from the xlsx row group header.

### Bullet shape

Each Response cell becomes one markdown bullet with the canonical `Reference ID — Response text` shape:

```
- 0-01 — StoreForce Solutions Inc. legal entity and brand are the same; HQ Toronto ON Canada; founded 2010
- 0-02 — Post-close value creation. AKKR Emerging Buyout Partners II majority investment since Mar 2023
...
```

**Empty Response cells** are emitted with the placeholder marker `[OPEN]`:

```
- 4-05 — [OPEN]
```

**Comments cells** (when populated) are appended as a parenthetical to the Response bullet:

```
- 0-03 — Recurring revenue ~$2.64M CAD/mo (Apr-2026), $7.86M YTD FY27 — implied ARR run-rate ~$31-32M CAD (Comment: derived run-rate; exact contracted ARR not stated)
```

This shape was chosen because (a) it round-trips cleanly to the BL-043 article's bullet structure, (b) it makes the Reference ID a strong anchor for citation-substring matching (model citations of the form `"Section 00 row 0-03 — Recurring revenue ~$2.64M CAD/mo (Apr-2026)..."` substring-match cleanly against the canonical body), and (c) it preserves all evidence the partner committed to the workbook without editorial loss.

### Whitespace + encoding rules

- **Line endings**: `\n` only. No `\r\n` regardless of xlsx-author OS.
- **Trailing whitespace**: stripped per line.
- **Section separators**: exactly one blank line between sections; exactly one blank line between section header and first bullet.
- **Em-dash**: U+2014 `—` only (no `--`, no `-`, no en-dash). The separator between Reference ID and Response text is always `—` (space, em-dash, space).
- **Quotes**: smart quotes from the xlsx (`"` `"` `'` `'`) are normalized to ASCII (`"` `'`). Prevents the v11-class encoding-drift false-positive.
- **NBSP**: U+00A0 normalized to space.
- **Carriage returns inside cells**: collapsed to single spaces (multi-paragraph Response cells flatten to one line per bullet; preserving line breaks would invite per-author drift).

### Determinism + hashing

The serializer is a pure function `(xlsxBytes: Uint8Array) => string`. `sha256(serialize(bytes)).slice(0, 16)` is the canonical hash. Same xlsx bytes always produce the same hash; perturbations in the xlsx (rearranging rows, padding whitespace, changing column widths) that do not affect substantive Response content do not change the hash.

A property-based test in `mcp-server/tests/unit/schemas/extract-irl-from-xlsx.test.ts` should fuzz this: take the StoreForce fixture, randomly perturb column widths / styles / non-Response cell contents, assert the canonical output is unchanged.

---

## Tool shape detail (Path A)

### Schema (`mcp-server/src/schemas/extract-irl-from-xlsx.ts`)

```ts
import { createHash } from 'node:crypto';
import { z } from 'zod';

export const ExtractIrlFromXlsxInputSchema = z.object({
  xlsxBase64: z
    .string()
    .min(1)
    .describe(
      'Base64-encoded xlsx file bytes. The standard IRL workbook produced by ' +
        '`gst_information_request_list@0.0.2+` via `generate_information_request_list_xlsx`. ' +
        'A non-canonical xlsx (different sheet structure, different header row, etc.) will ' +
        'produce a parse error with a structured diagnostic.'
    ),
});

export type ExtractIrlFromXlsxInput = z.infer<typeof ExtractIrlFromXlsxInputSchema>;

export interface ExtractIrlFromXlsxResult {
  filledIrlMarkdown: string;
  irlBodyHash: string;
  sectionsParsed: number;
  substantiveCellsCounted: number;
  totalCellsCounted: number;
  fillRatio: {
    percent: number;
    status: 'halt' | 'partial' | 'ok';
  };
  reInvokeInstructions: string;
}

export class XlsxShapeError extends Error {
  readonly diagnostic: string;
  constructor(diagnostic: string) {
    super(`xlsx does not match the canonical IRL workbook shape: ${diagnostic}`);
    this.name = 'XlsxShapeError';
    this.diagnostic = diagnostic;
  }
}
```

### Engine (pure function, exported for unit tests)

```ts
export function runExtractIrlFromXlsx(input: ExtractIrlFromXlsxInput): ExtractIrlFromXlsxResult {
  const bytes = Buffer.from(input.xlsxBase64, 'base64');
  const workbook = parseWorkbookOrThrow(bytes);
  const sections = extractCanonicalSections(workbook);
  const markdown = serializeCanonical(sections);
  const hash = createHash('sha256').update(markdown).digest('hex').slice(0, 16);

  let substantive = 0;
  let total = 0;
  for (const section of sections) {
    for (const row of section.rows) {
      total++;
      if (isSubstantive(row.response)) substantive++;
    }
  }
  const percent = (substantive / total) * 100;
  const status: 'halt' | 'partial' | 'ok' = percent < 15 ? 'halt' : percent < 40 ? 'partial' : 'ok';

  return {
    filledIrlMarkdown: markdown,
    irlBodyHash: hash,
    sectionsParsed: sections.length,
    substantiveCellsCounted: substantive,
    totalCellsCounted: total,
    fillRatio: { percent, status },
    reInvokeInstructions: REINVOKE_INSTRUCTIONS,
  };
}

const REINVOKE_INSTRUCTIONS = [
  'Re-invoke `gst_irl_ingestion` with these args:',
  '- `filledIrl`: the `filledIrlMarkdown` value above (paste verbatim)',
  "- `targetName`, `transactionContext`, `partnerLead`, `projectCodeName`, `mode`, `verbosity`, `forceTools`: per the partner's instructions",
  '',
  'The prompt body will then render with `**Body-binding hash:** ' +
    /* the hash above */ '` matching the canonical body, and `compose_dossier_envelope` will verify provenance against this canonical body authoritatively.',
].join('\n');
```

### Handler (`mcp-server/src/tools/extract-irl-from-xlsx.ts`)

Modeled on `mcp-server/src/tools/validate-irl-provenance.ts` — handler returns `{ content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result }`. Catches `XlsxShapeError` and returns a structured diagnostic the model can act on (e.g., _"workbook header row not found at expected row 7; ensure the xlsx was generated by `generate_information_request_list_xlsx@0.3.5+`"_).

### Prompt body integration

Add a guidance directive to the **interactive body** of `gst_irl_ingestion` (the body that renders when no `filledIrl` is supplied):

```
If the partner has attached an `.xlsx` file to the conversation rather than pasting markdown,
call `extract_irl_from_xlsx` with the base64-encoded xlsx bytes BEFORE proceeding with the
interactive paste request. The tool returns a canonical markdown body the partner can supply
as `filledIrl` on a re-invocation. The canonical body is the authoritative source for the
hash-bind forcing function in `compose_dossier_envelope` — re-invoking with the returned
body eliminates the v11-class false-positive provenance gaps caused by reconstructing the
IRL from spreadsheet cells in working memory.
```

The one-shot body is unchanged. The one-shot body's body-binding hash directive remains the canonical authority for the hash check; this initiative just ensures the hash binds to a server-canonicalized body rather than a model-reconstructed one.

---

## Acceptance criteria

A v12+ StoreForce live exercise against the same `PRAXIS-IRL-StoreForce_JLIVET.xlsx` MUST produce a dossier with:

1. **`provenanceVerification.verified + verifiedFuzzy >= 25` (out of ~30 IRL-cited claims).** v10/v11 produced 2/30 and 4/30 verified respectively; v12 with Path A should produce ≥ 25/30 because both the body and the citations are server-canonical or substring-match against a server-canonical body.

2. **`provenanceVerification.tierMismatches == 0` for properly-cited tier-1 claims.** Tier-1 (literal IRL bullet) claims should substring-match the canonical body verbatim because the model cites text the server generated.

3. **`(J)` gap list contains ≤ 2 auto-appended entries** (real fabrications would still surface; encoding-drift false positives eliminated). The real-gaps portion of (J) (gate-elided, map-absent, extraction-only, conditional-trigger, currency-assumption, defaulted-dimension) is unaffected by BL-049 — those continue to fire correctly.

4. **The meta fence emits `"fixtureFillRatio"` matching the value the tool computed** (98.4% for StoreForce). v11 showed the model independently computing this; with BL-049 the tool returns it and the model copies it through.

5. **No new `IrlBodyHashMismatchError` regression.** The hash-bind still fires for paraphrased re-calls; only the encoding-drift false positives are eliminated.

### Test surface

- **Unit**: `mcp-server/tests/unit/schemas/extract-irl-from-xlsx.test.ts` — engine round-trip against the StoreForce + MedSig + Helios-Grid fixture xlsx files; property-based determinism test (perturbations that should not affect canonical output); error-path test for non-canonical xlsx shapes.
- **Integration**: `mcp-server/tests/integration/protocol-roundtrip.test.ts` — tools-list assertion extended to 16 tools (15 + `extract_irl_from_xlsx`).
- **Body-hash stability**: `mcp-server/tests/integration/irl-ingestion-body-hash-stability.test.ts` — interactive body changes (Path A's guidance directive), one-shot bodies unchanged; one body hash rebaselines.
- **Manifest stability**: re-baseline (16 tools registered).

---

## Edge cases + risks

### Edge cases the parser must handle

| Case                                                                            | Behavior                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Non-canonical xlsx (different sheet name, missing header row)                   | `XlsxShapeError` with diagnostic naming the expected vs found shape; model surfaces the error to the partner and asks them to regenerate via `generate_information_request_list_xlsx`                     |
| Engagement-specific sections (10-_, 11-_)                                       | Pass through with section title from the row-group header                                                                                                                                                 |
| Workbook authored in a non-English locale (commas as decimal separator, etc.)   | Response text passed through verbatim — the canonical-form spec does not modify numeric formats. The provenance verifier's normalizer (currency-symbol-preserving) handles cross-locale comparisons.      |
| Cell with multi-paragraph Response text                                         | Paragraphs collapsed to single line with `\n` → ` ` flattening (per canonical-form whitespace rule)                                                                                                       |
| Comments cell with `\n`-separated multiple comments                             | Joined with `; ` separator inside the `(Comment: ...)` parenthetical                                                                                                                                      |
| Smart quotes / NBSP / unicode dashes inside Response text                       | Normalized per the canonical-form rules                                                                                                                                                                   |
| Reference ID with section prefix `0-01` vs `00-01` (the v11 trace flagged this) | Canonical output uses single-digit section prefix `0-01` matching the article generator's output. The serializer's section-number-prefix convention is `<sectionIndex>-<rowNumber>` without zero-padding. |

### Risks

**Risk 1: Parser drift from `generate_information_request_list_xlsx`.** If BL-044's generator changes its workbook shape (column order, header row position, etc.), this parser breaks. **Mitigation**: a round-trip test in `mcp-server/tests/integration/irl-xlsx-roundtrip.test.ts` — generate an xlsx via the BL-044 tool, parse via the BL-049 tool, assert the resulting markdown matches the canonical article. Any drift fails both sides loudly.

**Risk 2: Canonical-form spec drift.** If the canonical-form rules change (e.g., a new whitespace convention), every previously-computed `irlBodyHash` becomes stale. **Mitigation**: a snapshot test pinning the canonical output for the StoreForce fixture. Changes require deliberate update + BREAKING_CHANGES entry.

**Risk 3: Large xlsx payloads exceeding MCP message-size limits.** A 200KB xlsx becomes ~270KB base64, then ~70KB canonical markdown. MCP message size limits vary by transport but are typically generous (Claude Desktop stdio handles MBs comfortably). **Mitigation**: not anticipated to be load-bearing; if it surfaces, Path B's "decode at build time, embed canonical body inline" already addresses it.

**Risk 4: Operator confusion about the two-step flow.** Partners may not understand why "attach xlsx + invoke prompt" requires the model to call an extractor first. **Mitigation**: the interactive body's guidance directive explains it inline; the `reInvokeInstructions` field in the tool's output gives the model partner-readable prose to surface in the conversation.

**Risk 5: Path A's two-step workflow could compound with Claude Desktop's prompt-arg UX limitations.** If the partner can't easily pass the returned `filledIrlMarkdown` as `filledIrl` on the re-invocation (e.g., the markdown is too long for the slash-menu form, or attachment-vs-arg confusion), the architecture's win is partial. **Mitigation**: the partner pastes the markdown into a single-arg form field (Claude Desktop supports multi-line textarea args); operationally similar to today's "paste markdown directly" workflow.

---

## Phase plan

### Phase 1 — Parser + canonicalizer (~2 hours)

- Author `mcp-server/src/schemas/extract-irl-from-xlsx.ts` with the canonical-form spec inlined as JSDoc.
- Implement `parseWorkbookOrThrow`, `extractCanonicalSections`, `serializeCanonical`, `isSubstantive`.
- Unit tests: 6-10 cases covering happy path (StoreForce fixture), error path (non-canonical xlsx), property-based determinism (StoreForce fixture with random column-width / cell-style perturbations).

### Phase 2 — Tool wiring + body integration (~60-90 min)

- Author `mcp-server/src/tools/extract-irl-from-xlsx.ts`.
- Register in `mcp-server/src/server.ts`.
- Update interactive body in `mcp-server/src/prompts/irl-ingestion.ts` with the guidance directive.
- Integration test in `tests/integration/protocol-roundtrip.test.ts` (tools-list shape).
- Re-baseline interactive body hash + manifest hash.
- BREAKING_CHANGES entry. Version bump server 0.12.x → 0.13.0; prompt 0.4.0 → 0.5.0.

### Phase 3 — Live validation (~30 min, operator-driven)

- Restart Claude Desktop with v0.13.0 `dist/index.js`.
- Re-run StoreForce IRL via the xlsx-attached workflow. Model calls `extract_irl_from_xlsx`, then re-invokes `gst_irl_ingestion`.
- Capture the new dossier. Verify acceptance criteria (verified count ≥ 25/30, tier-mismatches == 0, etc.).

### Phase 4 — Doc updates + close (~15 min)

- Update this design doc's Status to "Shipped".
- Update [BL-049 BACKLOG entry](BACKLOG.md#bl-049-gst_irl_ingestion--server-side-xlsx-canonicalization-for-hash-bind-authority) → Done.
- Close the post-merge sequel checkbox on BL-045 PR B's PR description (if PR #212 is still open at merge time) — otherwise comment on the merged PR with the v12 dossier as architectural-closure evidence.

---

## Out of scope (explicit)

- **Generic xlsx → markdown conversion**. Path A's parser is calibrated specifically to the canonical IRL workbook shape produced by `generate_information_request_list_xlsx`. Non-canonical xlsx inputs return `XlsxShapeError`. A general-purpose xlsx-to-markdown tool is BL-\* territory if and when an operator surfaces a use case.

- **xlsx editing or write-back**. This tool is read-only — it parses xlsx into canonical markdown. The reverse (markdown → xlsx) is what `generate_information_request_list_xlsx` already does under BL-044.

- **Loosening `FUZZY_MIN_RUN`** in the provenance verifier. Tempting micro-fix that would let more model paraphrases pass fuzzy, but weakens the architecture's fabrication-detection. BL-049's authoritative-source approach is the structural fix; verifier tuning is not.

- **In-Claude-Desktop attachment-to-arg automation.** Partners pasting the xlsx as an attachment then having Claude Desktop auto-encode it as base64 and bind it to a prompt arg is BL-046 territory. BL-049 ships the server-side canonicalization assuming the model can pass base64 to the tool (which is straightforward — the model already reads xlsx files into context).

- **xlsx provenance verification (hash-binding the xlsx itself).** This initiative gives compose_dossier_envelope's hash-bind an authoritative server source for the markdown body. Hash-binding the xlsx bytes back to a partner-signed source (e.g., "the IRL the partner emailed me on 2026-05-22") is BL-\* territory if compliance ever demands it.

- **Path B (filledIrlXlsx prompt arg).** Documented above as the alternative for operator convenience; not the recommended path for the reasons listed. If Claude Desktop ships native attachment-to-arg adaptation as part of BL-046 or otherwise, Path B may become more attractive — revisit then.

---

## Senior-consultant review surface

Reviewer should validate:

1. **The Path A vs Path B choice**. Is the two-step model interaction acceptable for the operator UX, given the architectural-purity payoff? The recommendation rests on this.

2. **The canonical-form spec**. Does the bullet shape (`Reference ID — Response text (Comment: ...)`) round-trip correctly with the BL-043 article? Does it cite-friendly substring-match against typical model citations like `"Section 00 row 0-03 — Recurring revenue ~$2.64M CAD/mo (Apr-2026)"`? Spot-check 3-4 citations from the v10/v11 dossiers against the proposed canonical body.

3. **The risk inventory**. Is the round-trip-with-BL-044-generator test sufficient mitigation against parser drift? Is the canonical-form snapshot test sufficient mitigation against spec drift?

4. **Acceptance criterion #1 (≥ 25/30 verified)**. Is 25 the right threshold, or should the acceptance be tighter? v11 produced 4/30; v12 with BL-049 should produce ≥ 25 if the architecture works as designed.

---

_Created: June 3, 2026 — BL-049 design doc following BL-045 PR B v0.12.0 closeout. Status: Draft pending Path A vs Path B scoping decision._
