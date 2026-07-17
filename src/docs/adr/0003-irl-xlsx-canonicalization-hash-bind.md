# ADR-0003: IRL canonicalization & hash-bind authority (xlsx path deferred)

- **Status**: Partially accepted (subset shipped 2026-06-03 at mcp-server 0.13.1; closeout hardening 2026-07-09 at 0.38.0) — server-side xlsx canonicalization deferred indefinitely with written re-engage triggers
- **Source initiative**: BL-049 (design doc archived at [`../development/_archive/MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md`](../development/_archive/MCP_SERVER_IRL_XLSX_CANONICALIZATION_BL-049.md) — the revisit blueprint)

## Context

The filled-IRL ingestion flow (`gst_irl_ingestion` → `compose_dossier_envelope`) hash-binds provenance to the canonical markdown body: the envelope tool re-computes `sha256(filledIrl).slice(0, 16)` against the supplied `irlBodyHash` and rejects on mismatch, and the provenance verifier substring-matches every load-bearing citation against those same bytes. The verification counts in the dossier's (K) footer are only meaningful if `filledIrl` is the partner's authoritative response, byte-for-byte.

Partner responses, however, arrive as a filled `.xlsx` workbook (the BL-044 generator's output). When the model reconstructs the IRL body from spreadsheet cells itself, two empirical failure modes break the bind:

1. **Truncation.** Large IRL bodies (~60-80KB) exceed the model's tool-call-args emission ceiling, producing a partially-cached body and a hash mismatch the model itself catches and refuses.
2. **Byte mutation.** Model reconstruction drifts encoding — curly vs. straight quotes, em-dash and NBSP variants — so citations that are semantically correct fail verbatim substring matching.

The v11 StoreForce live exercise (2026-06-03) traced this end-to-end: with xlsx attached but no `filledIrl` arg, the model improvised — its only fired envelope call supplied the _blank_ canonical template, the verifier correctly rejected all 30 IRL-cited claims, and the prepared self-correction call never executed (**Finding A**: operator-flow ambiguity; the dossier the partner sees comes from the first call). The trace also exposed **Finding B**: the model demoted 17 tier-1 claims to tier-2 between calls to convert damning `tier-mismatch:` gaps into routine `provenance-gap:` ones — tier was model-declared with no server enforcement.

BL-049 designed the fix as a server-side tool: `extract_irl_from_xlsx` (deterministic xlsx → canonical markdown + HMAC receipt) with `compose_dossier_envelope` verifying the receipt under a server secret. It shipped at 0.13.0 — and the v12 live exercise immediately established that the bytes-delivery layer is **structurally unreachable** in the standard Claude Desktop + stdio topology: the model runs in Anthropic's cloud-side Linux sandbox, the MCP server runs on the operator host, and an attached xlsx reaches the server via neither `xlsxBase64` (tool-call truncation above ~10KB) nor `xlsxPath` (cross-filesystem boundary).

## Decision

**Shipped — operator-side canonicalization plus the empirically-validated subset (0.13.1, hardened at 0.38.0):**

- **`npm run irl:extract`** (`mcp-server/scripts/extract-irl-markdown.mjs`) — a deterministic, operator-local xlsx → canonical-markdown converter, the structural inverse of `generate_information_request_list_xlsx`. It runs on the operator host where the xlsx already lives, entirely outside the model's stochastic emit path, and produces the exact paste the `filledIrl` prompt arg expects (`irlSource: 'partner-paste-verbatim'`). The partner-paste runbook (`IRL_PARTNER_PASTE_RUNBOOK.md`) surfaces the workflow.
- **The v11/v12-validated subset retained from BL-049**: the `tier-fabrication` gap category + `deriveTier()` — effective tier is derived from citation properties (verbatim substring → tier-1; `Section --` sentinel → partner-supplied; neither → fabrication), so model-declared tier is a hint, not authority, closing the Finding B gaming pattern; the `BL-045-VERIFY` audit directive on every prompt body; and verifier defensive hardening (`extractExcerpt` anchored on `lastIndexOf('—')`; `normalizeForMatching` strips `/` and `+` to whitespace). The v12 partner-paste run showed the model reading a `tier-fabrication` diagnostic and re-citing rather than demoting — the closure works on real model behavior.
- **0.38.0 closeout hardening**: `normalizeForMatching` (`src/schemas/validate-irl-provenance.ts`) flattens curly quotes (U+2018/U+2019/U+201C/U+201D) into the punctuation-to-space class, symmetric on needle and haystack — verdict-widening only. This closes the last encoding-drift class from BL-049's original problem statement (em-dashes were already flattened; NBSP variants already covered by Unicode `\s`).

**Deferred indefinitely — server-side xlsx canonicalization:**

The full architecture — accepting the workbook as a tool input, canonicalizing server-side, and hard-enforcing an HMAC receipt (`RECEIPT_HMAC_KEY`) so a code-executing model cannot substitute a fabricated body — was partial-reverted at 0.13.1 (tool, receipt-hmac lib, envelope `irlSource`/`receipt` fields, Step 0 prompt directive). It is blocked on external infrastructure with no public roadmap: the MCP spec has no primitive for binary-resource delivery to tool handlers, and Claude Desktop has no attachment-to-host bridge. BL-054 (the revisit ticket) was filed and retired the same day as a deliberate tombstone — a backlog item gated on infrastructure nobody controls would never pull through a sprint. The archived design doc is the canonical revisit blueprint; no other queue will surface this work.

**Re-engage triggers** (from the closeout changelog stanza — re-read the blueprint if any materializes):

1. The MCP spec adds a binary-resource primitive that delivers >100KB payloads to tool handlers as bytes.
2. Claude Desktop ships an attachment-to-host bridge that materializes uploaded files at a host filesystem path local MCP servers can read.
3. The operator topology pivots away from Claude Desktop + stdio (e.g., model and server co-located, or a remote streamable-HTTP server that materializes attachments server-side).

## Consequences

- **The hash-bind authority remains the canonical markdown body, produced deterministically.** Today the deterministic producer is the operator-local extract script rather than a server tool; the forcing function (`sha256` bind + verbatim-substring provenance verification + derived-tier discipline) is unchanged and binds to the partner's authoritative bytes on the partner-paste path.
- The operator pays one local step per filled IRL (`npm run irl:extract`) instead of hand-transcription or a fragile in-conversation self-correction loop; the first envelope call is the successful call.
- Four code surfaces cite this decision and its blueprint pointer: `mcp-server/scripts/extract-irl-markdown.mjs` (header), `mcp-server/src/tools/compose-dossier-envelope.ts` (v0.13.1 partial-revert rationale), `mcp-server/tests/integration/manifest-stability.test.ts` (manifest-hash rebaseline comment), `mcp-server/tests/integration/protocol-roundtrip.test.ts` (tool-list comment).
- Interactive-mode runs without a partner paste report `pass-internal` (BL-055) — an honest self-consistency bind, transparently lower audit grade than `pass-bound` — rather than a fabricated authoritative bind.
- Because no backlog entry exists, this ADR and the archived blueprint are the only durable pointers to the deferred work; the triggers above are the sole re-engagement mechanism.
