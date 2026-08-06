/**
 * Shared assertions and measurement for a tool-call result envelope.
 *
 * Extracted from `protocol-roundtrip.test.ts` (BL-112) so the envelope contract has
 * ONE definition. It is asserted in two places — the modern-era round-trip and the
 * 2025-era worker round-trip — and is about to be asserted in a third (the response
 * budget guard). Three copies of a contract is how the contract drifts.
 *
 * ## The contract, and why each half exists
 *
 * `content[0]` is a caption, `content[1]` is the serialized payload, and
 * `structuredContent` is canonical:
 *
 * - **BL-090** removed the payload from `content` entirely, leaving `content[0]` a
 *   caption. `content[0]` must therefore never be a JSON dump.
 * - **BL-108** put the payload back as `content[1]`, because a `content`-only client
 *   (Claude Desktop, at the time) saw bare counts and no rows. So `content[1]` must
 *   exist and must parse.
 * - The two channels **diverging** is the failure mode that replaces "doubling" as
 *   the thing to fear, hence the equality check.
 *
 * ## Measurement
 *
 * `measureEnvelope` exists because nothing in this repo asserted the SIZE of a
 * response until BL-112, while size is what broke `search_radar` in BL-109 — a
 * 143,027-character result that exceeded a real client's tool-result ceiling.
 *
 * Bytes are the primary unit and are computed with the **same expression production
 * uses** for the audit log's `outputBytes` (`src/metrics/with-metrics.ts`), so a
 * failing test and an audit-log field are directly comparable. Characters are
 * recorded alongside because the one empirical datum in this repo (143,027) is
 * expressed in characters — the two are close but not equal on non-ASCII prose, and
 * **must never be compared to each other**.
 */

export interface CallToolContent {
  type: string;
  text?: string;
}

export interface CallToolResultPayload {
  content: CallToolContent[];
  isError?: boolean;
  structuredContent?: unknown;
}

export interface EnvelopeOptions {
  /**
   * Payload keys the tool deliberately omits from the text channel via `toolOk`'s
   * `textOmit`, making the two channels legitimately asymmetric.
   *
   * Exactly one tool does this today — `generate_information_request_list_xlsx`,
   * whose ~17 KB base64 workbook would otherwise be billed to the model channel for
   * no benefit. Without this parameter the equality check below hard-fails on it,
   * which is why the helper previously carried a comment saying that tool "is not
   * routed through this helper". The budget guard routes EVERY tool through it, so
   * the exemption has to be expressible rather than described.
   */
  textOmit?: readonly string[];
}

/**
 * Assert the envelope contract and return the canonical payload.
 *
 * Throws with a diagnostic naming the initiative that established each rule, so a
 * failure reads as "you broke BL-108" rather than "expected 2 to be 1".
 */
export function parseToolResult<T>(
  result: CallToolResultPayload,
  options: EnvelopeOptions = {}
): T {
  const block = result.content[0];
  if (!block || block.type !== 'text' || !block.text) {
    throw new Error('expected first content block to be a non-empty text caption');
  }
  if (block.text.trimStart().startsWith('{')) {
    throw new Error(
      `content[0] must be a caption, not a JSON dump (BL-090): ${block.text.slice(0, 80)}`
    );
  }
  const structured = (result as { structuredContent?: unknown }).structuredContent;
  if (structured === undefined) {
    throw new Error('expected structuredContent — it is the canonical channel (BL-090)');
  }

  const mirror = result.content[1];
  if (!mirror || mirror.type !== 'text' || !mirror.text) {
    throw new Error(
      'expected content[1] to carry the serialized payload (BL-108) — a `content`-only client sees nothing without it'
    );
  }
  let mirrored: unknown;
  try {
    mirrored = JSON.parse(mirror.text);
  } catch {
    throw new Error(`content[1] must be serialized JSON (BL-108): ${mirror.text.slice(0, 80)}`);
  }

  const omit = options.textOmit ?? [];
  if (omit.length === 0) {
    if (JSON.stringify(mirrored) !== JSON.stringify(structured)) {
      throw new Error('content[1] and structuredContent disagree — the channels have diverged');
    }
  } else {
    // Compare everything EXCEPT the omitted keys, so an asymmetric tool still has
    // its symmetric remainder checked rather than being waved through wholesale.
    const strip = (v: unknown) => {
      if (v === null || typeof v !== 'object' || Array.isArray(v)) return v;
      const clone: Record<string, unknown> = { ...(v as Record<string, unknown>) };
      for (const key of omit) delete clone[key];
      return clone;
    };
    if (JSON.stringify(strip(mirrored)) !== JSON.stringify(strip(structured))) {
      throw new Error(
        `content[1] and structuredContent disagree outside the omitted keys (${omit.join(', ')}) — the channels have diverged`
      );
    }
    for (const key of omit) {
      const s = structured as Record<string, unknown>;
      if (!(key in s)) {
        throw new Error(`textOmit names '${key}' but structuredContent has no such key`);
      }
    }
  }
  return structured as T;
}

export interface EnvelopeMeasurement {
  /** UTF-8 bytes of the whole envelope — the unit production records as `outputBytes`. */
  envelopeBytes: number;
  /** UTF-16 code units of the whole envelope — the unit the 143,027 datum is in. */
  envelopeChars: number;
  /** UTF-8 bytes of the payload alone, to separate "payload grew" from "mirror doubled". */
  payloadBytes: number;
  /** envelopeBytes / payloadBytes — ~2.08x under the two-channel shape. */
  ratio: number;
}

/**
 * Measure a result envelope without asserting anything about it.
 *
 * Deliberately separate from `parseToolResult`: the budget guard wants the whole
 * envelope (both channels plus framing), while `parseToolResult` returns only the
 * payload. Folding measurement into the parser would have forced every existing
 * caller to care about size.
 */
export function measureEnvelope(result: CallToolResultPayload): EnvelopeMeasurement {
  const envelopeJson = JSON.stringify(result);
  const payloadJson = JSON.stringify(result.structuredContent);
  const envelopeBytes = new TextEncoder().encode(envelopeJson).length;
  const payloadBytes = new TextEncoder().encode(payloadJson ?? '').length;
  return {
    envelopeBytes,
    envelopeChars: envelopeJson.length,
    payloadBytes,
    ratio: payloadBytes === 0 ? 0 : envelopeBytes / payloadBytes,
  };
}
