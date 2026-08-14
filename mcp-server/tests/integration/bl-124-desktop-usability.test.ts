/**
 * BL-124 — the argument surface accepts what Claude Desktop actually sends.
 *
 * Desktop ships an unfilled form field as `""` rather than dropping the key. An
 * optional string with a length constraint therefore failed validation on every
 * render where the operator left it blank, and the whole `prompts/get` call
 * returned `-32602`. Desktop surfaces that as "Failed to attach prompt" with no
 * diagnostic, which made interactive mode unreachable from that client.
 *
 * **Every case below runs the args through `argsSchema` BEFORE `build`.** That
 * ordering is the whole point: the MCP SDK validates against the schema at the
 * `prompts/get` boundary, and the failure lived there. Calling `build()` with
 * raw args — which `registerPrompts` does, because the SDK has already
 * validated by then — bypasses Zod completely and would pass with the bug still
 * present. An earlier draft of this file did exactly that and proved nothing.
 */

import { describe, it, expect } from 'vitest';
import { irlIngestionPrompt } from '../../src/prompts/irl-ingestion';
import { informationRequestListPrompt } from '../../src/prompts/information-request-list';
import { comparableEngagementsMemoPrompt } from '../../src/prompts/comparable-engagements-memo';
import { computeIrlBodyHash } from '../../src/schemas/compose-dossier-envelope';

/** Validate then render — the two steps `prompts/get` performs, in order. */
function render(args: Record<string, unknown>): string {
  const parsed = irlIngestionPrompt.argsSchema.parse(args);
  const result = irlIngestionPrompt.build(parsed as never);
  const first = result.messages[0].content;
  if (first.type !== 'text') throw new Error('expected text content');
  return first.text;
}

/** Exactly the shape Desktop sends when a form is submitted with fields blank. */
const ALL_BLANK = {
  filledIrl: '',
  targetName: '',
  transactionContext: '',
  partnerLead: '',
  projectCodeName: '',
  mode: '',
  auditLevel: '',
  requireVerbatimBody: '',
};

describe('BL-124 — blank form fields validate instead of erroring', () => {
  it('accepts every field blank — THE reproduction', () => {
    // Before this, `filledIrl: ""` failed `.min(200)` and `prompts/get` returned
    // -32602, which Desktop shows as "Failed to attach prompt".
    const parsed = irlIngestionPrompt.argsSchema.safeParse(ALL_BLANK);
    expect(parsed.success).toBe(true);
  });

  it('normalises every blank field to undefined, not to an empty string', () => {
    const parsed = irlIngestionPrompt.argsSchema.parse(ALL_BLANK) as Record<string, unknown>;
    for (const key of Object.keys(ALL_BLANK)) {
      expect(parsed[key], `${key} should be absent, not ""`).toBeUndefined();
    }
  });

  it('a blank filledIrl selects interactive mode, exactly as omitting it does', () => {
    expect(render(ALL_BLANK)).toBe(render({}));
  });

  it('blank enums fall back to their defaults rather than rejecting', () => {
    const text = render({
      filledIrl: 'x'.repeat(300),
      transactionContext: '',
      mode: '',
      auditLevel: '',
    });
    expect(text).toContain('Sweep plan'); // mode → full
    expect(text).not.toContain('```RUN-AUDIT'); // auditLevel → standard
  });

  it('case-folds an enum value, which reusing enumFromWire buys for free', () => {
    // A new bespoke adapter would have forfeited this; every other enum arg in
    // the repo already has it.
    expect(render({ filledIrl: 'x'.repeat(300), transactionContext: 'Sell-Side' })).toContain(
      'credibility document'
    );
  });

  it('still enforces the length rule on a non-blank value', () => {
    // The paired negative: `""` is special-cased as absent, but the constraint
    // itself must still bite, or the adapter swallowed the rule not the blank.
    const parsed = irlIngestionPrompt.argsSchema.safeParse({ filledIrl: 'too short' });
    expect(parsed.success).toBe(false);
  });

  it('does NOT trim filledIrl — the hash must still identify the operator file', () => {
    // A trimming adapter would silently change computeIrlBodyHash, the value an
    // operator compares against the file on their disk. A file-read body
    // normally carries a trailing newline, so this is not hypothetical.
    const body = `${'x'.repeat(300)}\n`;
    const text = render({ filledIrl: body });
    expect(text).toContain(computeIrlBodyHash(body));
    expect(text).not.toContain(computeIrlBodyHash(body.trim()));
  });

  it('the two sibling prompts accept their blank optional fields too', () => {
    expect(informationRequestListPrompt.argsSchema.safeParse({ productSummary: '' }).success).toBe(
      true
    );
    expect(
      comparableEngagementsMemoPrompt.argsSchema.safeParse({
        targetDescription: 'A mid-market vertical SaaS target in retail workforce management.',
        theme: '',
        engagementCategory: '',
      }).success
    ).toBe(true);
  });

  it('both previously undocumented memo args now carry descriptions', () => {
    // They render as blank boxes in Desktop's form otherwise. The enum one uses
    // the house "Must be one of:" form so a cold call can discover its values.
    const shape = comparableEngagementsMemoPrompt.argsSchema.shape;
    expect(shape.theme.description ?? '').not.toBe('');
    expect(shape.engagementCategory.description ?? '').toContain('Must be one of:');
  });
});

describe('BL-124 — prompt instructions the withdrawal depends on', () => {
  const oneShot = (): string => render({ filledIrl: 'x'.repeat(300), auditLevel: 'debug' });
  const interactive = (): string => render({ auditLevel: 'debug' });

  it('the interactive body sanctions splitting a large prepare_irl_body call across turns', () => {
    // A production run stalled precisely here: it would not emit ~21k tokens of
    // body alongside the dossier, and had no sanctioned way to split the work.
    const text = interactive();
    expect(text).toContain('ENTIRE response for that turn');
    expect(text).toContain('20KB');
  });

  it('both RUN-AUDIT copies carry the newlines field', () => {
    for (const text of [oneShot(), interactive()]) {
      expect(text).toContain('newlines: <int');
    }
  });

  it('states that newlines: 0 is expected and not an error', () => {
    expect(oneShot()).toContain('is NOT an error');
  });

  it('excludes an undelivered client call from toolErrors, in both copies', () => {
    for (const text of [oneShot(), interactive()]) {
      expect(text).toContain('A call the CLIENT never delivered');
      expect(text).toContain('NOT a failed attempt here');
    }
  });

  it('includes it in the precheck transport set instead, in both copies', () => {
    // The other half of the rule. `precheck.errorsEncountered` is DEFINED as the
    // attempts that never reached the server, so an undelivered approval belongs
    // there — and the subtraction identity closes with no new label.
    for (const text of [oneShot(), interactive()]) {
      expect(text).toContain(
        'A client-side approval that was denied or never answered counts here'
      );
    }
  });
});
