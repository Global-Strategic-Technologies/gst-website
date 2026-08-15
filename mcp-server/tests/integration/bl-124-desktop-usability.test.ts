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
import { ALL_PROMPTS } from '../../src/prompts/_registry';
import { unwrapToEnumOptions } from '../../src/prompts/wire-shape';
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

  it('the two sibling prompts accept EVERY optional field blank, not just the changed one', () => {
    // Probing only the argument you changed is how the first version of this
    // test passed while `gst_information_request_list` still rejected four
    // other blank optional args. Use the all-blank shape, as above.
    expect(
      informationRequestListPrompt.argsSchema.safeParse({
        targetName: '',
        companyName: '',
        projectName: '',
        transactionContext: '',
        includeSections: '',
        excludeRequests: '',
        customRequests: '',
        showCanonicalReference: '',
        productSummary: '',
      }).success
    ).toBe(true);

    expect(
      comparableEngagementsMemoPrompt.argsSchema.safeParse({
        targetDescription: 'A mid-market vertical SaaS target in retail workforce management.',
        theme: '',
        engagementCategory: '',
      }).success
    ).toBe(true);
  });

  it('NO optional argument on ANY registered prompt rejects or retains an empty string', () => {
    // The repo-wide guard. Desktop ships `""` for every unfilled field, so an
    // optional arg that rejects it makes the whole prompt unattachable — the
    // failure is total, not partial, and it is invisible until an operator hits
    // it. Required args are excluded: rejecting `""` there is correct.
    // **Probe the FIELD schema, not the whole object.** An earlier version did
    // `argsSchema.safeParse({ [key]: '' })`, which fails on any prompt that has
    // a required argument — the parse dies on the MISSING required field, the
    // `path[0] === key` filter finds nothing, and the retention half below never
    // runs. That silently limited the retention check to the three all-optional
    // prompts while the test name claimed all nine.
    interface FieldSchema {
      isOptional(): boolean;
      safeParse(v: unknown): { success: boolean; data?: unknown };
    }
    const offenders: string[] = [];
    for (const prompt of ALL_PROMPTS) {
      const shape = prompt.argsSchema.shape as Record<string, FieldSchema>;
      for (const key of Object.keys(shape)) {
        const field = shape[key];
        if (!field.isOptional()) continue; // required: rejecting "" is correct

        const blank = field.safeParse('');
        if (!blank.success) {
          offenders.push(`${prompt.name}.${key} (rejects "")`);
          continue;
        }

        // Skip fields carrying `.default(...)`: they intentionally resolve to a
        // value rather than `undefined`, which is correct and not retention.
        // Detected by what the field does with `undefined` itself.
        const absent = field.safeParse(undefined);
        if (absent.success && absent.data !== undefined) continue;

        // Parsing is not enough: an arg that survives as `""` reads as SUPPLIED
        // downstream. `gst_information_request_list` branches on
        // `customRequests !== undefined`, so a blank field there sent the
        // all-blank form down the one-shot path instead of the interactive one.
        if (blank.data !== undefined) {
          offenders.push(`${prompt.name}.${key} (survives as ${JSON.stringify(blank.data)})`);
        }
      }
    }
    expect(
      offenders,
      'optional args rejecting "" — wrap them in stringFromWire / enumFromWire'
    ).toEqual([]);
  });

  it('NO enum argument on ANY registered prompt rejects a whitespace-padded value', () => {
    // BL-125 extension of the same invariant, third probe on this loop.
    // `enumFromWire` tested blankness with `.trim()` but looked the value up
    // untrimmed, so `"debug "` — trivially produced by a form paste — missed
    // the canonical map, fell through to the inner `z.enum`, and failed the
    // whole `prompts/get` with -32602. Desktop renders that as "Failed to
    // attach prompt" with no diagnostic: the same total, silent failure BL-124
    // existed to remove, reached by a different input.
    //
    // Probing needs a VALID value per field to pad, which means enumerating the
    // options. `unwrapToEnumOptions` is exported for exactly this and throws on
    // a non-enum inner, so the try/catch is load-bearing — without it the loop
    // dies on the first string field and the guard silently covers nothing.
    // (The alternative, `argsSchema['~standard'].jsonSchema`, was spiked and
    // rejected: it exposes only `{input, output}` and serialises to `{}`.)
    interface FieldSchema {
      isOptional(): boolean;
      safeParse(v: unknown): { success: boolean; data?: unknown };
    }
    const offenders: string[] = [];
    let probed = 0;
    for (const prompt of ALL_PROMPTS) {
      const shape = prompt.argsSchema.shape as Record<string, FieldSchema>;
      for (const key of Object.keys(shape)) {
        const field = shape[key];
        let options: readonly string[];
        try {
          options = unwrapToEnumOptions(field as unknown as never);
        } catch {
          continue; // not an enum field — nothing to pad
        }
        // Count AFTER the empty check, not before: a zero-option enum would
        // otherwise count toward the floor while probing nothing — a smaller
        // instance of the vacuity the floor exists to catch. No such field
        // exists today; the ordering is what keeps that true.
        if (options.length === 0) continue;
        probed += 1;
        const canonical = options[0];
        for (const padded of [`${canonical} `, ` ${canonical}`, ` ${canonical} `]) {
          const parsed = field.safeParse(padded);
          if (!parsed.success) {
            offenders.push(`${prompt.name}.${key} rejects ${JSON.stringify(padded)}`);
          } else if (parsed.data !== canonical) {
            // Accepting but not canonicalising is the quieter failure: the raw
            // padded string would flow downstream as if it were the enum value.
            offenders.push(
              `${prompt.name}.${key} accepts ${JSON.stringify(padded)} as ${JSON.stringify(parsed.data)}`
            );
          }
        }
      }
    }
    expect(offenders, 'enum args must trim before the canonical lookup — see enumFromWire').toEqual(
      []
    );
    // A vacuity floor, because this guard shipped once covering NOTHING.
    // `unwrapToEnumOptions` threw for all 60 registered arguments — a registered
    // field is `ZodOptional(ZodPreprocess)`, and the walk followed `innerType`
    // only while a preprocess pipe stores its target under `out` — so every
    // field hit the catch and `offenders` was trivially empty. A green
    // assertion over an empty probe set is indistinguishable from a green one
    // over a full set; this line is what tells them apart.
    expect(
      probed,
      'the guard probed no enum fields — it is asserting nothing'
    ).toBeGreaterThanOrEqual(31);
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
