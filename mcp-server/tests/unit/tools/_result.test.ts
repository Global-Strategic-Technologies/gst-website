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
  it('puts the payload in structuredContent and the caption in content', () => {
    const payload = { matches: [1, 2, 3], totalMatched: 3 };
    const result = toolOk(payload, '3 portfolio matches.');

    expect(result.structuredContent).toEqual(payload);
    expect(result.content).toEqual([{ type: 'text', text: '3 portfolio matches.' }]);
  });

  it('does NOT duplicate the payload into content — the whole point of BL-090', () => {
    const payload = { secret: 'needle-in-the-payload' };
    const result = toolOk(payload, 'one item.');

    expect(result.content[0]?.text).not.toContain('needle-in-the-payload');
    expect(result.content[0]?.text).not.toMatch(/^\s*\{/);
  });

  it('does not set isError', () => {
    expect(toolOk({ a: 1 }, 'ok.').isError).toBeUndefined();
  });

  it('leaves the payload object untouched (no mutation, no cloning surprises)', () => {
    const payload = { a: 1, nested: { b: 2 } };
    const result = toolOk(payload, 'ok.');

    expect(result.structuredContent).toBe(payload as unknown as Record<string, unknown>);
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
