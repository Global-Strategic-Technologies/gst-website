---
promptName: gst_irl_sweep
version: 0.1.0
recordedAt: 2026-08-25
model: claude-fable-5
---

# Worked example output for `gst_irl_sweep`

V1 draft recording (trust-the-operator rebuild, plan goofy-prancing-wirth). To be replaced with the operator live-exercise capture from the PR1 verification window — the six live-verification steps in the approved plan are the capture protocol, run against the real Kestrel filled IRL.

## Input — full mode, one-shot

```json
{
  "filledIrl": "<the populated IRL markdown — all 10 sections>"
}
```

No other arguments: target name and engagement context are inferred from the IRL itself (`> Target:` / `> Engagement context:` header lines first, rows 0-01 / 0-02 second).

## Expected behavior (design intent, pending live capture)

1. **No provenance ceremony.** The model does not hash the body, call any verification tool, or question how the IRL arrived — argument, attachment, and paste all proceed identically. The only halt condition is the blank request template (fill ratio < 5%).

2. **Advisory completeness.** The fill ratio is computed over sections 00–09 and stated as the first sentence of (A); thin sections land in (J), and the run proceeds at any ratio above the blank-template floor.

3. **Gate-driven tool calls with bare payloads.** Each gate-passing tool is called once with base-schema inputs — no `_audit` blocks. ICG is called empty-first for the canonical question ids; regulations honor the `limit ≤ 50` ceiling; portfolio uses facet values verbatim.

4. **Dossier (A)–(J)** with each tool-backed section closing on its verbatim deeplink, (I) naming VDR-taxonomy follow-ups, and (J) Gaps & assumptions as the run's single audit surface.

5. **Extract-only mode** emits the v2 extract record (`recordVersion: "2.0"`, six-field `_meta`, no provenance fields) plus per-tool payload fences and (J), with zero tool invocations.
