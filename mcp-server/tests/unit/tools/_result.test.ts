/**
 * BL-090 — the tool-result constructors and the reason vocabulary.
 *
 * These pin the three invariants the rest of the tool surface depends on. The
 * verbatim guarantee (Invariant 2) is the load-bearing one: several tools return
 * multi-line diagnostics that `gst_irl_ingestion` instructs the model to read and
 * retry on ("emit the error VERBATIM"), so any truncation or reformatting here
 * would silently degrade an LLM-facing retry surface.
 */
import { describe, it, expect } from 'vitest';

import {
  toolOk,
  toolFail,
  RADAR_UPSTREAM_REASONS,
  RADAR_FAILURE_REASONS,
  TOOL_FAILURE_REASONS,
} from '../../../src/tools/_result';

describe('toolOk', () => {
  it('puts the payload in structuredContent, the caption in block 0, the JSON in block 1', () => {
    const payload = { matches: [1, 2, 3], totalMatched: 3 };
    const result = toolOk(payload, '3 portfolio matches.');

    expect(result.structuredContent).toEqual(payload);
    expect(result.content).toEqual([
      { type: 'text', text: '3 portfolio matches.' },
      { type: 'text', text: '{"matches":[1,2,3],"totalMatched":3}' },
    ]);
  });

  // BL-108 replaces BL-090's "does NOT duplicate the payload into content" test.
  // That test encoded the assumption this initiative disproved: it treated the
  // caption-only shape as the goal, when Claude Desktop reads `content` and was
  // therefore served bare counts for three weeks. The spec's backwards-compat
  // clause asks for the serialized JSON, so duplication is now the REQUIREMENT.
  it('DOES duplicate the payload into content — the spec backwards-compat clause', () => {
    const payload = { secret: 'needle-in-the-payload' };
    const result = toolOk(payload, 'one item.');

    expect(result.content[0]?.text).toBe('one item.');
    expect(result.content[0]?.text).not.toContain('needle-in-the-payload');
    expect(result.content[1]?.text).toContain('needle-in-the-payload');
    expect(JSON.parse(result.content[1]?.text ?? '')).toEqual(payload);
  });

  it('serializes block 1 compactly — pretty-printing was BL-090s real bloat', () => {
    const result = toolOk({ a: 1, b: 2 }, 'ok.');

    expect(result.content[1]?.text).toBe('{"a":1,"b":2}');
    expect(result.content[1]?.text).not.toContain('\n');
  });

  it('does not set isError', () => {
    expect(toolOk({ a: 1 }, 'ok.').isError).toBeUndefined();
  });

  it('leaves the payload object untouched (no mutation, no cloning surprises)', () => {
    const payload = { a: 1, nested: { b: 2 } };
    const result = toolOk(payload, 'ok.');

    expect(result.structuredContent).toBe(payload as unknown as Record<string, unknown>);
  });

  // The sharp edge of returning structuredContent by reference while block 1 is a
  // construction-time snapshot: mutate afterwards and the channels disagree. Pinned
  // so the asymmetry is documented behaviour rather than a latent surprise.
  it('snapshots block 1 at construction — post-hoc mutation desynchronises the channels', () => {
    const payload: { a: number } = { a: 1 };
    const result = toolOk(payload, 'ok.');
    payload.a = 999;

    expect(result.structuredContent).toEqual({ a: 999 });
    expect(result.content[1]?.text).toBe('{"a":1}');
  });
});

describe('toolOk textOmit', () => {
  it('keeps the key in the text mirror but replaces the value with a marker', () => {
    const payload = { filename: 'x.xlsx', base64: 'AAAABBBBCCCC', byteLength: 9 };
    const result = toolOk(payload, 'generated.', { textOmit: ['base64'] });

    const mirrored = JSON.parse(result.content[1]?.text ?? '') as Record<string, unknown>;

    // Present, not deleted — the model must be able to see the field exists.
    expect(Object.keys(mirrored)).toContain('base64');
    expect(mirrored.base64).toBe(
      '[omitted from text channel: 12 B; read structuredContent.base64]'
    );
    // Byte length is of the OMITTED VALUE (12 chars of base64), never of the
    // `byteLength` field, which means the decoded workbook.
    expect(mirrored.base64).not.toContain('9 B');
  });

  it('leaves structuredContent canonical — Invariant 1 is not weakened', () => {
    const payload = { filename: 'x.xlsx', base64: 'AAAABBBBCCCC' };
    const result = toolOk(payload, 'generated.', { textOmit: ['base64'] });

    expect(result.structuredContent?.base64).toBe('AAAABBBBCCCC');
  });

  it('mirrors every non-omitted key untouched', () => {
    const payload = { filename: 'x.xlsx', base64: 'AAAA', sectionCount: 10 };
    const result = toolOk(payload, 'generated.', { textOmit: ['base64'] });

    const mirrored = JSON.parse(result.content[1]?.text ?? '') as Record<string, unknown>;

    expect(mirrored.filename).toBe('x.xlsx');
    expect(mirrored.sectionCount).toBe(10);
  });

  it('is inert when not passed — block 1 deep-equals structuredContent', () => {
    const payload = { filename: 'x.xlsx', base64: 'AAAA' };
    const result = toolOk(payload, 'generated.');

    expect(JSON.parse(result.content[1]?.text ?? '')).toEqual(payload);
  });
});

describe('toolFail', () => {
  it('sets isError and mirrors the reason + message into structuredContent', () => {
    const result = toolFail('inoreader-rate-limit', 'Inoreader returned 429.', { status: 429 });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: 'inoreader-rate-limit',
      message: 'Inoreader returned 429.',
      status: 429,
    });
  });

  it('passes multi-line directive prose through VERBATIM — byte for byte', () => {
    // Shaped like a real `formatAuditIssues` block: multi-line, indented,
    // punctuation-heavy, with a trailing newline. Every byte must survive.
    const directive = [
      'Calibration audit FAILED — 2 issues.',
      '',
      'RETRY DISCIPLINE: fix ALL issues below, then call the tool again.',
      '  1. `arr` is annualized but `_audit.monetaryBasis` says "monthly".',
      '     Fix: pass monetaryBasis: "annual", or convert arr to a monthly figure.',
      '  2. `incidents` was not supplied and MUST NOT be inferred.',
      '',
    ].join('\n');

    const result = toolFail('audit-failed', directive);

    expect(result.content[0]?.text).toBe(directive);
    expect(result.structuredContent?.message).toBe(directive);
  });

  it('preserves leading/trailing whitespace and unicode exactly', () => {
    const text = '  \tmessage with — em dash, "quotes",  nbsp and trailing space  ';
    expect(toolFail('internal-error', text).content[0]?.text).toBe(text);
  });

  it('works without extra', () => {
    const result = toolFail('snapshot-missing', 'No snapshot on disk.');
    expect(result.structuredContent).toEqual({
      error: 'snapshot-missing',
      message: 'No snapshot on disk.',
    });
  });

  it('lets extra add reason-specific detail without displacing error/message', () => {
    const result = toolFail('service-unavailable', 'Circuit open.', {
      status: 503,
      cause: 'inoreader-429',
      retryAfterSeconds: 3600,
    });
    expect(result.structuredContent).toMatchObject({
      error: 'service-unavailable',
      message: 'Circuit open.',
      cause: 'inoreader-429',
      retryAfterSeconds: 3600,
    });
  });

  it('suppressStructured omits structuredContent but never touches the text', () => {
    // The pre-specified ADR-0011 fallback. Unused today; pinned so that if it is
    // ever reached for, it is known to leave `content` untouched.
    const result = toolFail(
      'audit-failed',
      'line one\nline two',
      { status: 400 },
      {
        suppressStructured: true,
      }
    );

    expect(result.structuredContent).toBeUndefined();
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe('line one\nline two');
  });

  it('the options bag is NOT spread into the payload', () => {
    const result = toolFail('invalid-input', 'bad', undefined, { suppressStructured: false });
    expect(result.structuredContent).not.toHaveProperty('suppressStructured');
  });
});

describe('failure-reason vocabulary', () => {
  it('RADAR_FAILURE_REASONS is the upstream six plus the breaker reason', () => {
    expect(RADAR_FAILURE_REASONS).toEqual([...RADAR_UPSTREAM_REASONS, 'service-unavailable']);
  });

  it('TOOL_FAILURE_REASONS is a superset of the radar vocabulary', () => {
    for (const reason of RADAR_FAILURE_REASONS) {
      expect(TOOL_FAILURE_REASONS).toContain(reason);
    }
  });

  it('every reason is kebab-case — no snake_case outliers', () => {
    // `service_unavailable` was the one holdout before BL-090; this stops it
    // (or a new one) coming back.
    for (const reason of TOOL_FAILURE_REASONS) {
      expect(reason).toMatch(/^[a-z]+(-[a-z0-9]+)*$/);
    }
  });

  it('has no duplicates', () => {
    expect(new Set(TOOL_FAILURE_REASONS).size).toBe(TOOL_FAILURE_REASONS.length);
  });

  it('pins the exact published set', () => {
    // Bidirectional: adding OR removing a reason is a public-contract change and
    // must be a deliberate edit here, in BREAKING_CHANGES, and — for the radar
    // seven — in radar/CONTRACT.md's Failure modes table (enforced separately by
    // contract-parity's enumParity).
    expect([...TOOL_FAILURE_REASONS].sort()).toEqual(
      [
        'audit-failed',
        'cache-miss',
        'config-missing',
        'hash-mismatch',
        'inoreader-rate-limit',
        'internal-error',
        'invalid-input',
        'network-timeout',
        'service-unavailable',
        'snapshot-missing',
        'token-missing',
        'token-stale',
        'upstream-error',
      ].sort()
    );
  });
});
