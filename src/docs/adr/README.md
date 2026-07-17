# Architecture Decision Records

Lightweight, maintained records of load-bearing design decisions that span the website and the `mcp-server` workspace. Each ADR captures **why** a decision was made, what it rejected, and when to revisit — distilled from the (archived) initiative docs that originally carried the rationale, and cited by code comments as the durable pointer.

**When to write one** (per the [initiative-doc lifecycle](../development/README.md)): at initiative closure, any decision that live code will keep citing — a pattern choice, a contract, an intentional limitation, a deliberate deferral with triggers — gets an ADR here; procedural/architectural _state_ goes to the maintained reference docs (`mcp-server/src/docs/ARCHITECTURE.md`, tool CONTRACTs) instead.

**Format**: see [TEMPLATE.md](TEMPLATE.md) — Status / Source initiative / Context / Decision / Consequences. Number sequentially (`NNNN-slug.md`). ADRs are maintained: append re-validations and status changes (e.g. Superseded) rather than rewriting history.

## Index

| ADR                                                 | Decision                                                                                 | Status                                                                    |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [0001](0001-stage-taxonomy-adapter.md)              | Stage-taxonomy adapter at the MCP-wrapper boundary (not full normalization)              | Accepted 2026-05-02; re-validated 2026-07-14 (benchmark audit, finding A) |
| [0002](0002-irl-body-by-hash-cache.md)              | IRL body-by-hash server-side cache (body off the model-emit path)                        | Accepted 2026-06-07 (0.30.0); extended by BL-077a/b/c + BL-079            |
| [0003](0003-irl-xlsx-canonicalization-hash-bind.md) | IRL canonicalization & hash-bind authority; server-side xlsx path deferred with triggers | Partially accepted (subset 0.13.1; hardening 0.38.0)                      |

_Established 2026-07-17 under BL-088 (development-docs distillation). ADR-0004–0007 land in the next wave._
