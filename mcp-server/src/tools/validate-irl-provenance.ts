/**
 * MCP tool: validate_irl_provenance (BL-045 PR B Phase 2B).
 *
 * Residual-fabrication guard. Takes the filledIrl body + a list of
 * citations the model emitted in `_audit` blocks / (K) provenance
 * footer entries and verifies each excerpt against the IRL.
 *
 * Pure tool — no engine state, no Hub deeplink. Returns a per-citation
 * verdict array the model uses to populate (J) gap list entries for
 * unverified claims.
 *
 * BL-079 Part A — the handler now accepts either `filledIrl` directly OR
 * an `irlBodyHash` that resolves against the shared `IrlBodyCache` (the
 * same cache `prepare_irl_body` writes to and `compose_dossier_envelope`
 * reads from). When only the hash is supplied, the server re-hydrates the
 * body from cache for citation matching — closing the precheck-loop
 * emission damage observed on the 2026-06-07 night exercise (50KB body
 * emitted to validate twice per iteration, losing ~12% of bytes each
 * time, producing 5/19 unverified citations against the lossy bytes).
 *
 * See: src/schemas/validate-irl-provenance.ts for the matching engine.
 */

import type { McpServer } from '@modelcontextprotocol/server';
import { NOOP_METRICS_CONTEXT, withToolMetrics, type MetricsContext } from '../metrics/_index';
import {
  ValidateIrlProvenanceInputObject,
  runIrlProvenanceCheck,
  type ValidateIrlProvenanceInput,
} from '../schemas/validate-irl-provenance';
import { Bl076BodyCacheMissError } from '../schemas/compose-dossier-envelope';
import { toolOk, toolFail } from './_result';

const TOOL_DESCRIPTION = `Verify that citations the model emitted (in \`_audit\` blocks, the (K) provenance footer, etc.) actually appear in the supplied filled IRL.

**Why call this**: the upstream calibration audit refines structural shape but cannot verify excerpt truthfulness — a model that obeys every audit rule can still fabricate the excerpt itself. This tool closes that gap by substring-matching every cited excerpt against the IRL body.

**Inputs** (\`filledIrl\` is optional; supply EITHER):

- \`filledIrl\` — the populated IRL body, same shape as the \`gst_irl_ingestion\` prompt arg. Legacy path; still works.
- \`irlBodyHash\` — the 16-hex \`sha256(body).slice(0,16)\` value (same shape as \`compose_dossier_envelope.irlBodyHash\`). When supplied alone, the server re-hydrates the body from the shared IRL body cache (populated by \`prepare_irl_body\` or the prompt-render pre-pop path). Use this path to avoid emitting the full body twice in the precheck loop — material wall-clock savings on bodies > ~10KB.
- \`citations\` — array of \`{ path, citation }\` pairs. \`path\` identifies the claim site in your dossier (e.g., \`_audit.revenueRange.citation\`, \`section-C.headline\`); \`citation\` is the string you emitted (e.g., \`"Section 00 row 10 — Recurring revenue $2.64M CAD/mo Apr-2026"\`).

At least one of \`filledIrl\` / \`irlBodyHash\` MUST be supplied. \`filledIrl\` takes precedence when both are present (legacy compatibility).

**Outputs**: per-citation verdict in one of four buckets:

- \`verified\` — the excerpt after the em-dash is a substring of the normalized IRL.
- \`verified-fuzzy\` — not verbatim but a run of ≥8 consecutive matching words appears in the IRL. Allows for minor paraphrasing while flagging real fabrication.
- \`partner-supplied\` — citation uses the \`Section --\` + \`partner-supplied form input\` sentinel (kickoff/handoff prompts that don't ingest an IRL). No verification expected.
- \`unverified\` — neither verbatim nor fuzzy match. Treat as residual fabrication: surface in (J) gap list as \`provenance-gap\` and either remove the dossier claim or replace it with an honest "open" marker.

The tool is pure (no engine call, no Hub URLs). Call it during your (K) provenance footer + provenance-citation self-check pass.`;

/**
 * Handler exported so integration tests can exercise the full pipeline
 * without going through the MCP transport.
 *
 * BL-079 Part A — accepts a `metrics` argument so the handler can resolve
 * `irlBodyHash` against `metrics.irlBodyCache`. Defaults to
 * `NOOP_METRICS_CONTEXT` so the existing call sites + unit tests that pass
 * `filledIrl` directly continue to work unchanged.
 */
export async function handleValidateIrlProvenanceTool(
  payload: ValidateIrlProvenanceInput,
  metrics: MetricsContext = NOOP_METRICS_CONTEXT
) {
  try {
    // BL-079 Part A — resolve the body. `filledIrl` takes precedence when
    // present (legacy callers that emit both fields); otherwise re-hydrate
    // from the shared IrlBodyCache via `irlBodyHash`. The schema's `.refine`
    // rule guarantees at least one of the two is set, so the final else
    // branch is unreachable in practice — but we narrow defensively so the
    // engine never receives `undefined`.
    let filledIrl: string;
    if (payload.filledIrl) {
      filledIrl = payload.filledIrl;
    } else if (payload.irlBodyHash) {
      const cached = await metrics.irlBodyCache?.get(payload.irlBodyHash);
      if (!cached) {
        throw new Bl076BodyCacheMissError(payload.irlBodyHash);
      }
      filledIrl = cached;
    } else {
      // BL-079 — the MCP SDK validates the per-field shape but not the
      // cross-field refine rule (it consumes `inputSchema.shape`, not the
      // refined schema). Enforce "at least one of filledIrl / irlBodyHash"
      // here so the engine never receives `undefined`.
      // Names both remediation paths — a retry directive, so verbatim to `content`.
      return toolFail(
        'invalid-input',
        'validate_irl_provenance: at least one of `filledIrl` / `irlBodyHash` MUST be supplied. ' +
          'Body-by-hash path: pass `irlBodyHash` alone after `prepare_irl_body` has seeded the cache. ' +
          'Legacy path: pass `filledIrl` directly.'
      );
    }

    const result = runIrlProvenanceCheck({ filledIrl, citations: payload.citations });
    return toolOk(
      result,
      `${result.total} claims checked: ${result.verified} verified, ${result.unverified} unverified.`
    );
  } catch (error) {
    if (error instanceof Bl076BodyCacheMissError) {
      // Carries the retry instruction naming `prepare_irl_body`.
      return toolFail('cache-miss', error.message);
    }
    const message = error instanceof Error ? error.message : String(error);
    return toolFail('internal-error', `Failed to validate IRL provenance: ${message}`);
  }
}

export function registerValidateIrlProvenanceTool(
  server: McpServer,
  metrics: MetricsContext = NOOP_METRICS_CONTEXT
): void {
  server.registerTool(
    'validate_irl_provenance',
    {
      title: 'Validate IRL provenance',
      description: TOOL_DESCRIPTION,
      inputSchema: ValidateIrlProvenanceInputObject.shape,
    },
    withToolMetrics('validate_irl_provenance', metrics, (payload: ValidateIrlProvenanceInput) =>
      handleValidateIrlProvenanceTool(payload, metrics)
    )
  );
}
