---
promptName: gst_architecture_layer_review
version: 0.0.1
recordedAt: 2026-05-01
model: claude-opus-4-7
---

# Worked example output for `gst_architecture_layer_review`

> **Historical transcript, not a current-body snapshot.** This recording predates `v0.1.0` (2026-08-20, [ADR-0019](../../../src/docs/adr/0019-irl-extract-record-subject-indexing.md)). The body now carries `irlEvidencePrecedence()`, so a run with an IRL extract record in context resolves its layer analysis from that evidence and cites it rather than reasoning from the target summary alone. Re-recording needs a human-driven live exercise against a real MCP client, so it cannot happen in-session or in CI; `golden-snapshots.test.ts` asserts file existence, four frontmatter keys and `promptName` — never `version` or body — so the stale version above is expected and is not drift to repair.

V6 sign-off recording. Senior-consultant verdict: signed off on substantive quality. The verification doc's stale layer names (Software → Infrastructure → Data → Organizational → Industry) were reconciled to the canonical Library taxonomy (Software → Operational → Product → Organizational → Industry & Regulatory) before recording.

## Input

```json
{
  "targetSummary": "Mid-market vertical SaaS for healthcare revenue cycle management. ARR $40M, 120 employees, eight years post-founding, scaling growth. AWS-native (us-east-1, us-west-2), Postgres + Redis core, microservices on EKS. Two prior tuck-in acquisitions still operating on legacy stacks (one .NET/SQL Server, one Python/Mongo) — partial integration via shared SSO and a thin REST gateway, no unified data model. PE-sponsor-owned since 2023, considering an add-on bolt-on this quarter."
}
```

The mock is engineered to give the model clear material at each layer — the prior tuck-in detail in particular surfaces coupling at multiple layers simultaneously, fertile ground for the cross-layer-patterns section.

## Expanded prompt body

Two messages: (1) the rendered text body instructing the model to walk all 5 canonical layers in order, surface 2–3 architectural risks per layer + 1–2 investigation handles, and close with a "Cross-layer patterns" section; (2) the embedded `gst://library/business-architectures` Resource carrying the canonical 5-layer Library article.

## Model output

Six-section memo for the healthcare RCM target.

**Layers walked verbatim from the embedded Library article:**

- **Layer 1 — Software Architecture** — 3 risks (three-codebase tax on every new feature, data model fragmentation as a one-way door, hidden dependency surface across heterogeneous stacks) + 2 investigation handles (deployment-frequency segmented by codebase, canonical entity dictionary).
- **Layer 2 — Operational Architecture** — 3 risks (operational maturity asymmetry across stacks, EKS cost/complexity at $40M ARR, DR posture untested across full footprint) + 2 handles (severity-classified incidents segmented by codebase, cloud spend as % of ARR).
- **Layer 3 — Product Architecture** — 3 risks (acquisition strategy outpacing integration capacity, AI-readiness ceiling on fragmented data substrate, build-vs-buy ambiguity at the clearinghouse layer) + 2 handles (build-vs-buy decision log, direct CTO question on bolt-on integration architecture).
- **Layer 4 — Organizational Architecture** — 3 risks (key-person concentration on legacy stacks, incentive misalignment between integration and feature work, decision rights ambiguity on the bolt-on) + 2 handles (org chart with team-to-system ownership, CTO decision-authority question).
- **Layer 5 — Industry & Regulatory Architecture** — 3 risks (concentration risk in the clearinghouse layer following the 2024 Change Healthcare incident, AI governance and the next regulatory wave, customer-side consolidation pressure) + 2 handles (regulatory compliance matrix mapped to architectural components, customer-cohort net retention rate).

**Cross-layer patterns section (3 patterns, each spanning multiple layers):**

- **Pattern 1 — The integration debt cascade (Layers 1, 3, 4 interlocked).** _"The unintegrated acquired stacks are not a Layer-1 problem to be solved by engineering. They are the visible symptom of a Layer-3 product strategy executed through a Layer-4 organizational structure that produces exactly the Layer-1 outcome observed."_ The deal team should treat the contemplated bolt-on as a forcing function: either the sponsor commits to a true integration program before the third deal closes, or the value-creation thesis on platform consolidation should be repriced downward.
- **Pattern 2 — The AI-readiness ceiling (Layers 1, 3, 5 interlocked).** Layer-5 industry shift toward AI-driven RCM requires Layer-3 product architecture on a unified data substrate, which requires Layer-1 data-model consolidation that the target has explicitly deferred.
- **Pattern 3 — The DR-and-compliance asymmetry (Layers 2 and 5).** Layer-5 regulatory obligations apply uniformly across all customer data; Layer-2 operational maturity is asymmetric across the three stacks. Compliance posture is bounded by the weakest stack, not the strongest — invisible in standard SOC 2 attestations.

Closing recommendation: _"Schedule a CTO working session structured around the three cross-layer patterns above before issuing the formal IOI on the bolt-on. The patterns, not the per-layer findings, are where the deal economics will be decided."_

## Verification notes

Three substantive strengths beyond the pass criteria:

1. **Explicit assumption marking** — model uses `*Assumption:*` prefix repeatedly (gateway is a façade, ~35–45 engineers, .NET stack maintained by 1–2 engineers, third-party clearinghouse usage). Right epistemic discipline for a pre-IOI deal-team artifact.
2. **Current-events anchoring** — the 2024 Change Healthcare incident reference at Layer 5 is a deal-pricing signal applied analogically, not training rote.
3. **Action conversion at close** — Pattern 1's framing refuses the engineering-only diagnosis and surfaces the strategy-→-org-→-engineering causal chain.

The verification doc originally listed the layer order as "Software → Infrastructure → Data → Organizational → Industry" — a stale 5-layer set from an earlier draft that didn't survive into the canonical `gst://library/business-architectures` article. Reconciliation was a doc fix, not a re-run requirement (the model sourced from the embedded article directly).
