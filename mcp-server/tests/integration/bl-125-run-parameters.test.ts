/**
 * BL-125 — the prompt states its own run parameters, and nothing references a
 * section that did not render.
 *
 * **Why these tests exist.** Post-deploy testing of BL-124 found that no
 * rendered body ever stated its resolved `mode` / `auditLevel` /
 * `transactionContext`. The model inferred them from which sections appeared,
 * and in three production runs out of three it reported `enhanced` — including
 * one the operator invoked at `debug`. It then passed `enhanced` to
 * `compose_dossier_envelope`, which withheld `metaFenceMarkdown` exactly as
 * contracted, so `promptVersion` came back null. `auditLevel: debug` was
 * unreachable through the model even though the server rendered it correctly.
 *
 * `requireVerbatimBody` was worse: fourteen occurrences in `src`, zero
 * render-time readers. The server's refusal reads the flag from the tool input
 * the model supplies, and the model had never been shown the operator's value,
 * so an operator who set it got no gate at all.
 *
 * Every case renders through `argsSchema.parse` first, for the reason the
 * BL-124 suite records: `build()` takes raw args because the SDK has already
 * validated by then, so calling it directly bypasses Zod and proves nothing.
 */

import { describe, it, expect } from 'vitest';
import { irlIngestionPrompt } from '../../src/prompts/irl-ingestion';
import { informationRequestListPrompt } from '../../src/prompts/information-request-list';

const BODY = 'x'.repeat(300);

function render(args: Record<string, unknown>): string {
  const parsed = irlIngestionPrompt.argsSchema.parse(args);
  const result = irlIngestionPrompt.build(parsed as never);
  return result.messages.map((m) => (m.content.type === 'text' ? m.content.text : '')).join('\n');
}
function renderList(args: Record<string, unknown>): string {
  const parsed = informationRequestListPrompt.argsSchema.parse(args);
  const result = informationRequestListPrompt.build(parsed as never);
  return result.messages.map((m) => (m.content.type === 'text' ? m.content.text : '')).join('\n');
}

/**
 * The four RENDERED BODIES, by the args that select each — three builders, but
 * `buildInteractiveBody` has two arms since BL-127 closed, and the deferred arm
 * is a shape no case here reached before.
 */
const ONE_SHOT = (over: Record<string, unknown> = {}): string =>
  render({ filledIrl: BODY, ...over });
const EXTRACT_ONLY = (over: Record<string, unknown> = {}): string =>
  render({ filledIrl: BODY, mode: 'extract-only', ...over });
const INTERACTIVE = (over: Record<string, unknown> = {}): string => render({ ...over });
const INTERACTIVE_EXTRACT_ONLY = (over: Record<string, unknown> = {}): string =>
  render({ mode: 'extract-only', ...over });

/** The Step 1 blockquote alone — the line the conditional ask is composed into. */
function step1Ask(body: string): string {
  const line = body.split('\n').find((l) => l.startsWith('> Paste the populated'));
  if (line === undefined) throw new Error('Step 1 ask not found');
  return line;
}

describe('BL-125 — resolved run parameters are stated, not inferred', () => {
  it('every RENDERED BODY states its own audit level at every level', () => {
    for (const build of [ONE_SHOT, EXTRACT_ONLY, INTERACTIVE, INTERACTIVE_EXTRACT_ONLY]) {
      for (const auditLevel of ['standard', 'enhanced', 'debug'] as const) {
        expect(build({ auditLevel }), `${auditLevel} must be stated as a run fact`).toContain(
          `- Audit level: **${auditLevel}**`
        );
      }
    }
  });

  it('every RENDERED BODY states its effective mode', () => {
    expect(ONE_SHOT()).toContain('- Run mode: **full**');
    expect(EXTRACT_ONLY()).toContain('- Run mode: **extract-only**');
    expect(INTERACTIVE()).toContain('- Run mode: **full**');
    // The deferred arm: the body that used to be stamped `full` against the
    // operator's explicit request, and disclose that it could not honor it.
    expect(INTERACTIVE_EXTRACT_ONLY()).toContain('- Run mode: **extract-only**');
  });

  it('states the transactionContext enum TOKEN, not just the voice cue', () => {
    // The envelope's `transactionContext` is a bare z.enum with no wire
    // adapter, so a `Buy-side` read off the capitalized cue text is rejected.
    const text = ONE_SHOT({ transactionContext: 'buy-side' });
    expect(text).toContain('- Engagement context: **buy-side**');
    expect(text).toContain('bare enum with no case-folding');
  });

  it('falls back to an explicit instruction when transactionContext is absent', () => {
    expect(ONE_SHOT()).toContain('- Engagement context: not supplied');
  });

  it('the meta fence points at the run-parameters block instead of listing enums', () => {
    const text = ONE_SHOT({ auditLevel: 'debug' });
    expect(text).toContain('"auditLevel": "<copy from the Run parameters block above');
    expect(text).not.toContain('"auditLevel": "standard | enhanced | debug"');
  });
});

describe('BL-125 — requireVerbatimBody is stated where a consumer exists', () => {
  it('the two full bodies state it; NEITHER extract-only arm does', () => {
    // The selection rule is "does this surface have a consumer for the value".
    // Extract-only invokes no ANALYSIS tool — its one call, `prepare_irl_body`,
    // reads no gate — the flag is not a meta-fence key and not a RUN-AUDIT
    // field, so stating it there would be bytes plus an invitation to enforce a
    // gate the body forbids reaching. The deferred arm is included because it
    // takes `requireVerbatimBody` as an argument like every other body and
    // would otherwise be the one place the rule could silently lapse.
    expect(ONE_SHOT()).toContain('- Verbatim-body gate:');
    expect(INTERACTIVE()).toContain('- Verbatim-body gate:');
    expect(EXTRACT_ONLY()).not.toContain('Verbatim-body gate');
    expect(INTERACTIVE_EXTRACT_ONLY()).not.toContain('Verbatim-body gate');
    // Even when the operator explicitly sets it — the value has no consumer here.
    expect(INTERACTIVE_EXTRACT_ONLY({ requireVerbatimBody: true })).not.toContain(
      'Verbatim-body gate'
    );
  });

  it('extract-only run parameters name no envelope input, in a body that forbids analysis-tool calls', () => {
    // The selection rule governs the WORDING as well as the values. Extract-only
    // states "you DO NOT invoke any ANALYSIS tool" and "NO ANALYSIS tool
    // invocations" — so a run-parameter bullet reading "Pass `unknown` to
    // `compose_dossier_envelope.transactionContext`" is the same defect as
    // stating `requireVerbatimBody` there: an instruction to reach a surface
    // this body forbids reaching. (The absolute was reworded when extract-only
    // began making one `prepare_irl_body` call to mint the record's provenance;
    // `compose_dossier_envelope` stays forbidden outright, so the rule this
    // case tests is unchanged.)
    const params = EXTRACT_ONLY()
      .split('\n')
      .filter((l) => /^- (Run mode|Audit level|Engagement context):/.test(l))
      .join('\n');
    expect(params).not.toContain('compose_dossier_envelope');
    expect(params).toContain('the meta fence');
    // The destination widened when the extract record landed: the values go to
    // TWO model-authored artifacts now, and naming only one would leave every
    // `_meta` field unsourced — the same wrong-destination defect this case
    // exists to catch, one artifact over.
    expect(params).toContain('the extract record `_meta`');

    // The DEFERRED arm renders the same block and was never reached here.
    const deferredParams = INTERACTIVE_EXTRACT_ONLY()
      .split('\n')
      .filter((l) => /^- (Run mode|Audit level|Engagement context|Prompt version):/.test(l))
      .join('\n');
    expect(deferredParams).not.toContain('compose_dossier_envelope.');
    expect(deferredParams).toContain('the extract record `_meta`');

    // The one-shot equivalents DO name the envelope, which is where they go.
    const oneShotParams = ONE_SHOT()
      .split('\n')
      .filter((l) => /^- (Run mode|Audit level|Engagement context):/.test(l))
      .join('\n');
    expect(oneShotParams).toContain('compose_dossier_envelope');
  });

  it('BOTH extract-only arms state the prompt version; neither full body does', () => {
    // The same selection rule, on the field that has no other source. Full mode
    // lets `compose_dossier_envelope` override `promptVersion` from the
    // registry, so stating it there would be an invitation to argue with the
    // server. Extract-only makes no envelope call, and THREE surfaces need the
    // value — the meta fence, the record's `_meta`, and the RUN-AUDIT block —
    // so the bullet is their only source.
    for (const build of [EXTRACT_ONLY, INTERACTIVE_EXTRACT_ONLY]) {
      const text = build();
      expect(text).toMatch(/^- Prompt version: \*\*\d+\.\d+\.\d+\*\*/m);
      expect(text).toContain('the extract record `_meta`');
    }
    expect(ONE_SHOT()).not.toContain('- Prompt version:');
    expect(INTERACTIVE()).not.toContain('- Prompt version:');
  });

  it('the stated prompt version IS the registered one — a hand-copied literal would drift', () => {
    expect(EXTRACT_ONLY()).toContain(`- Prompt version: **${irlIngestionPrompt.version}**`);
    expect(INTERACTIVE_EXTRACT_ONLY()).toContain(
      `- Prompt version: **${irlIngestionPrompt.version}**`
    );
  });

  it('the supplied-true case is rejected on extract-only too, not just the default', () => {
    // `build()` spreads `{...args}`, and TS excess-property checks do not fire
    // on spreads — so the supplied case reaches the builder at runtime even
    // though its parameter type omits the field. Cover it explicitly.
    expect(EXTRACT_ONLY({ requireVerbatimBody: 'true' })).not.toContain('Verbatim-body gate');
    expect(EXTRACT_ONLY({ requireVerbatimBody: 'true' })).not.toContain('requireVerbatimBody');
  });

  it('extract-only mentions the flag nowhere at all', () => {
    // Asserted positively so the selection rule is enforced rather than
    // described: a build that wrongly stated it everywhere would pass a
    // looser "one-shot contains it" check.
    expect(EXTRACT_ONLY()).not.toContain('requireVerbatimBody');
  });

  it('states true and false distinctly, and does not ask for an explicit false', () => {
    expect(ONE_SHOT({ requireVerbatimBody: 'true' })).toContain('- Verbatim-body gate: **true**');
    const off = ONE_SHOT();
    expect(off).toContain('- Verbatim-body gate: **false**');
    expect(off).toContain('Omit `requireVerbatimBody`');
  });

  it('the two prose consumers point at the stated value, not an unknowable condition', () => {
    const text = ONE_SHOT({ auditLevel: 'debug' });
    expect(text).not.toContain('If the operator invoked this prompt with `requireVerbatimBody');
    expect(text).toContain('stated in the Run parameters block');
    expect(INTERACTIVE()).toContain('stated in the Run parameters block');
  });
});

describe('BL-125 — interactive no longer discards supplied arguments', () => {
  const ALL_FOUR = {
    targetName: 'Kestrel',
    transactionContext: 'buy-side',
    partnerLead: 'Reid Peryam',
    projectCodeName: 'Cygnet',
  };

  it('states each supplied argument', () => {
    const text = INTERACTIVE(ALL_FOUR);
    expect(text).toContain('The target is **Kestrel**');
    expect(text).toContain('Partner lead: **Reid Peryam**');
    expect(text).toContain('Engagement code name: **Cygnet**');
    expect(text).toContain('- Engagement context: **buy-side**');
  });

  it('drops the tailoring ask entirely when all four are supplied', () => {
    // Stating a value at the top and then asking the user for it is the
    // contradictory-prose defect, not half of it.
    const text = INTERACTIVE(ALL_FOUR);
    expect(text).toContain('> Paste the populated Information Request List');
    expect(text).not.toContain("I'll tailor the dossier");
  });

  it('still asks for everything when nothing is supplied', () => {
    const text = INTERACTIVE();
    expect(text).toContain('the target name');
    expect(text).toContain('the partner lead');
    expect(text).toContain('an engagement code name');
    expect(text).toContain("I'll tailor the dossier");
  });

  it('asks only for what is missing when some are supplied', () => {
    // Scope the assertion to the Step 1 blockquote. "the target name" also
    // occurs in the extraction rules further down the body, so a whole-body
    // `not.toContain` would fail for the wrong reason.
    const ask = step1Ask(INTERACTIVE({ targetName: 'Kestrel', partnerLead: 'Reid Peryam' }));
    expect(ask).toContain("I'll tailor the dossier");
    expect(ask).not.toContain('the target name');
    expect(ask).not.toContain('the partner lead');
    expect(ask).toContain('an engagement code name');
  });

  it('does not tell the model to infer the target from an IRL it does not have', () => {
    // The one-shot fallback says "infer from the IRL header". There is no IRL
    // at render time here and Step 1 has not run, so that wording is incoherent
    // on this path and must not be copied across.
    const text = INTERACTIVE();
    expect(text).toContain('Target: not yet supplied');
    expect(text).not.toContain('Infer the target name from the IRL header');
  });

  it('HONORS a supplied mode: extract-only rather than disclosing an override (BL-127)', () => {
    // Inverted. `build()` used to dispatch on body-absence BEFORE checking
    // mode, so this combination rendered a full sweep and disclosed that it
    // "cannot honor" the request. Interactive now collects the body and THEN
    // branches, so there is no override left to disclose — and the disclosure
    // string must be gone, not merely unasserted: a body still saying it cannot
    // honor extract-only while running extract-only is worse than the defect.
    const text = render({ mode: 'extract-only' });
    expect(text).toContain('- Run mode: **extract-only**');
    expect(text).not.toContain('- Run mode: **full**');
    expect(text).not.toContain('cannot honor');
    // Still the interactive arm: it asks for the body first.
    expect(text).toContain('> Paste the populated');
  });
});

describe('BL-125 — no body references a section it did not render', () => {
  it('RUN-AUDIT is not referenced at standard or enhanced', () => {
    for (const auditLevel of ['standard', 'enhanced'] as const) {
      expect(ONE_SHOT({ auditLevel }), `${auditLevel} must not mention RUN-AUDIT`).not.toContain(
        'RUN-AUDIT'
      );
    }
  });

  it('RUN-AUDIT is still referenced at debug, where the block exists', () => {
    const text = ONE_SHOT({ auditLevel: 'debug' });
    expect(text).toContain('## Final emission — RUN-AUDIT block');
    expect(text).toContain('RUN-AUDIT block below');
  });

  it('the render matrix carries no dangling section reference', () => {
    // The generalized form of the check above. A throwaway version of this
    // matrix is what surfaced the RUN-AUDIT back-references and the interactive
    // `enhanced` no-op during investigation; this is that probe made permanent,
    // not the artifact that found them. It asserts a RELATION computed at
    // render time and pins no constants, so it adds nothing to the body-hash
    // suite's scenario count.
    //
    // A section is "dangling" when the body refers to it while its own header
    // is absent. Probe the interactive run-audit copy by its own header — it
    // is a separate rendering of the same contract, and using the one-shot
    // header here false-positives on every interactive@debug body.
    const SECTIONS: Array<{ label: string; headers: string[]; mention: RegExp }> = [
      {
        label: 'RUN-AUDIT',
        headers: ['## Final emission — RUN-AUDIT block', '## Step 5 — verification harness'],
        mention: /RUN-AUDIT/,
      },
      {
        label: 'per-section JSON fence',
        headers: ['## Per-section JSON fence'],
        mention: /per-section audit fence/i,
      },
      {
        label: 'citation self-check',
        headers: ['## Provenance citation self-check'],
        mention: /citation self-check/i,
      },
      {
        // Added when the deferred arm landed: it swaps out the Steps that
        // rendered the VDR taxonomy, and the interactive opener said the
        // taxonomy "is reproduced inline at Step 3". That is precisely the
        // shape this sweep exists to catch, and it slipped through only
        // because the matrix below did not render the arm.
        label: 'VDR folder taxonomy',
        headers: ['**Canonical VDR folder taxonomy**'],
        mention:
          /VDR folder taxonomy \(`gst:\/\/library\/vdr-structure`\)|reproduced inline at Step/,
      },
    ];

    const dangling: string[] = [];
    for (const [buildLabel, build] of [
      ['one-shot', ONE_SHOT],
      ['extract-only', EXTRACT_ONLY],
      ['interactive', INTERACTIVE],
      ['deferred extract-only', INTERACTIVE_EXTRACT_ONLY],
    ] as const) {
      for (const auditLevel of ['standard', 'enhanced', 'debug'] as const) {
        const text = build({ auditLevel });
        for (const s of SECTIONS) {
          const present = s.headers.some((h) => text.includes(h));
          if (!present && s.mention.test(text)) {
            dangling.push(
              `${buildLabel}@${auditLevel} references ${s.label}, which did not render`
            );
          }
        }
      }
    }
    expect(dangling, 'a body must not point at a section it did not render').toEqual([]);
  });
});

describe('BL-125 — extract-only remains exempt from the audit-level gate', () => {
  // Replaces the retired byte-identity alias. Positive presence, not
  // presence-identity: identity alone passes vacuously if a hollowing edit
  // deletes a directive at all three levels.
  // Four of the five directives the one-shot builder gates on audit level.
  // `PER_SECTION_JSON_FENCE_DIRECTIVE` is the fifth and is legitimately absent
  // here: it attaches an audit fence to each dossier section, and extract-only
  // emits no dossier — its output is the payload JSON. Verified against the
  // builder rather than assumed; an earlier draft of this test asserted all
  // five and failed, which is the assumption being caught.
  const GATED_IN_ONE_SHOT_PRESENT_HERE: Array<[string, string]> = [
    ['meta fence', '## Top-of-dossier meta JSON fence'],
    ['provenance footer', '## (K) Provenance footer'],
    ['citation self-check', '## Provenance citation self-check'],
    ['run audit', '## Final emission — RUN-AUDIT block'],
  ];

  // BOTH arms, not just the one-shot body. This is the whole point of
  // parameterizing: the DEFERRED arm lives inside `buildInteractiveBody`, which
  // is the function that computes `showRunAudit` / `showAuditDisplay`, so it is
  // the arm where the exemption is newly at risk — and asserting the exemption
  // over `EXTRACT_ONLY` alone would have left exactly that arm unguarded.
  const EXTRACT_ONLY_ARMS: Array<[string, (o?: Record<string, unknown>) => string]> = [
    ['one-shot', EXTRACT_ONLY],
    ['deferred', INTERACTIVE_EXTRACT_ONLY],
  ];

  it.each(EXTRACT_ONLY_ARMS)(
    '%s arm renders every level-gated directive it carries at every audit level',
    (arm, build) => {
      for (const auditLevel of ['standard', 'enhanced', 'debug'] as const) {
        const text = build({ auditLevel });
        for (const [label, marker] of GATED_IN_ONE_SHOT_PRESENT_HERE) {
          expect(text, `${arm} extract-only@${auditLevel} must carry the ${label}`).toContain(
            marker
          );
        }
      }
    }
  );

  it.each(EXTRACT_ONLY_ARMS)(
    '%s arm never carries the per-section dossier fence, at any level',
    (arm, build) => {
      // Stated positively so the absence is a recorded decision rather than an
      // omission the next reader has to re-derive. It attaches audit fences to
      // dossier sections (C)–(H), which extract-only does not emit — which is
      // why it is deliberately NOT one of the two constants routed through the
      // shared `gated`-flag helper.
      for (const auditLevel of ['standard', 'enhanced', 'debug'] as const) {
        expect(build({ auditLevel }), `${arm}@${auditLevel}`).not.toContain(
          '## Per-section JSON fence'
        );
      }
    }
  );

  it.each(EXTRACT_ONLY_ARMS)(
    '%s arm differs across levels ONLY by the stated audit level',
    (_arm, build) => {
      const a = build({ auditLevel: 'standard' });
      const b = build({ auditLevel: 'enhanced' });
      expect(a.replace('- Audit level: **standard**', 'X')).toBe(
        b.replace('- Audit level: **enhanced**', 'X')
      );
    }
  );

  it.each(EXTRACT_ONLY_ARMS)(
    '%s arm renders the two provenance-display directives EXACTLY ONCE',
    (arm, build) => {
      // The merge hazard. Both renderings of these two constants are now
      // reachable from `buildInteractiveBody` — gated in the full arm, ungated
      // inside the shared extract-only procedure — so they are spread from one
      // `gated`-flag helper rather than written twice. A count, not a presence
      // check: a duplicate would satisfy `toContain` and ship two renderings of
      // one contract under opposite policies, which is the duplication this
      // file's subject argues against in its own comments.
      for (const auditLevel of ['standard', 'enhanced', 'debug'] as const) {
        const text = build({ auditLevel });
        for (const marker of ['## (K) Provenance footer', '## Provenance citation self-check']) {
          const count = text.split(marker).length - 1;
          expect(count, `${arm}@${auditLevel} renders "${marker}" ${count}x`).toBe(1);
        }
      }
    }
  );

  it('the full arm still gates those two directives, and renders them exactly once when it does', () => {
    // The other half of the shared helper: routing both arms through it must
    // not have made the full arm unconditional.
    expect(INTERACTIVE({ auditLevel: 'standard' })).not.toContain('## (K) Provenance footer');
    const enhanced = INTERACTIVE({ auditLevel: 'enhanced' });
    for (const marker of ['## (K) Provenance footer', '## Provenance citation self-check']) {
      expect(enhanced.split(marker).length - 1, marker).toBe(1);
    }
  });
});

describe('BL-125 — enhanced means the same thing on both paths', () => {
  it('the interactive body at enhanced carries the blocking citation self-check', () => {
    const text = INTERACTIVE({ auditLevel: 'enhanced' });
    expect(text).toContain('## Provenance citation self-check');
    expect(text).toContain('## (K) Provenance footer');
    expect(text).toContain('## Per-section JSON fence');
  });

  it('standard and enhanced are no longer byte-identical in interactive', () => {
    // They were, which meant an interactive run emitted a (K) footer without
    // the self-check that backs it while a paste run at the same declared
    // level got both.
    expect(INTERACTIVE({ auditLevel: 'standard' })).not.toBe(
      INTERACTIVE({ auditLevel: 'enhanced' })
    );
  });

  it('all three levels produce distinct bodies on both the paste and interactive paths', () => {
    for (const build of [ONE_SHOT, INTERACTIVE]) {
      const bodies = (['standard', 'enhanced', 'debug'] as const).map((l) =>
        build({ auditLevel: l })
      );
      expect(new Set(bodies).size, 'three levels must produce three distinct bodies').toBe(3);
    }
  });
});

describe('BL-125 — the delivered-as-a-document and embed-framing clauses', () => {
  it('every rendered body tells the model that arriving as a file is not a red flag', () => {
    // Two forms, deliberately. The one-shot body keeps its pre-existing clause,
    // whose evidence is the `**Body-binding hash:**` directive it alone
    // renders. The other four get the structural variant, because a
    // copy-paste there would assert evidence that does not exist on those
    // paths — which is the whole reason the second form was written.
    expect(ONE_SHOT(), 'one-shot keeps the hash-based clause').toContain('proceed anyway');
    const STRUCTURAL = 'it is not evidence that the workflow was not invoked';
    for (const [label, text] of [
      ['extract-only', EXTRACT_ONLY()],
      ['interactive', INTERACTIVE()],
      ['IRL-list interactive', renderList({})],
      ['IRL-list one-shot', renderList({ companyName: 'Kestrel' })],
    ] as const) {
      expect(text, `${label} must carry the structural clause`).toContain(STRUCTURAL);
    }
  });

  it('the structural variant prescribes no tool probe', () => {
    // Extract-only forbids tool invocation outright, and the two
    // gst_information_request_list bodies orchestrate neither IRL-pipeline tool
    // the existing clause's recovery path uses.
    for (const text of [renderList({}), renderList({ companyName: 'Kestrel' })]) {
      expect(text).not.toContain('validate_irl_provenance');
    }
  });

  it('says what the embedded second message is, on both prompts', () => {
    for (const text of [ONE_SHOT(), EXTRACT_ONLY(), INTERACTIVE(), renderList({})]) {
      expect(text).toContain('blank canonical IRL taxonomy');
    }
  });

  it('tells the ingestion prompt specifically that the embed is not the body to sweep', () => {
    for (const text of [ONE_SHOT(), EXTRACT_ONLY(), INTERACTIVE()]) {
      expect(text).toContain('NOT the filled IRL and must not be swept');
    }
    // The generator prompt has no filled IRL to confuse it with.
    expect(renderList({})).not.toContain('must not be swept');
  });
});

describe('BL-125 — a run with no envelope call still reports the body it was given', () => {
  it('the shared directive distinguishes "no server measurement" from "no body"', () => {
    const text = ONE_SHOT({ auditLevel: 'debug' });
    expect(text).toContain('`filledIrl` when no envelope call ran');
    expect(text).toContain('measurement: self-reported');
  });

  it('the interactive copy carries the null-run rule it previously lacked', () => {
    // It offered `interactive-paste-request` as a runScenario while never
    // saying what a block for that scenario looks like.
    const text = INTERACTIVE({ auditLevel: 'debug' });
    expect(text).toContain('runScenario: interactive-paste-request');
    expect(text).toContain('measurement: self-reported');
  });
});

describe('BL-126 — every body that calls compute_techpar names its mode', () => {
  // `compute_techpar` computes `rdOpEx` as `engCost + prodCost + toolingCost`
  // in `deepdive` and reads the input directly in `quick`. `mode` is a required
  // enum with no default and the prompt named none, so the model chose per call
  // — two runs over one IRL took different branches and produced an inverted
  // zone verdict (32.6% "healthy" vs 47.5% "above ceiling").
  //
  // This list is hardcoded, so a fourth builder or a new `compute_techpar`
  // call inside an existing body is NOT caught by it — the derived check at the
  // end of this block is the one that generalises. An
  // earlier draft of this fix reached the full and extract-only bodies only;
  // the interactive body calls the tool at its own Step 2d and was left with
  // the mode unset — the same asymmetry the fix exists to close, on a third
  // path. The hash suite moving 8 scenarios instead of 12 is what surfaced it.
  const CALLERS: Array<[string, () => string]> = [
    ['one-shot', ONE_SHOT],
    ['extract-only', EXTRACT_ONLY],
    ['interactive', INTERACTIVE],
  ];

  it.each(CALLERS)('%s names deepdive as the mode', (_label, build) => {
    expect(build()).toContain('`mode: "deepdive"`');
  });

  it.each(CALLERS)('%s warns off the Section 04 remediation figure', (_label, build) => {
    // Both observed divergences were misroutes of bullets the SOP had ALREADY
    // mapped elsewhere. Section 04's remediation line is Tech Debt's
    // `remediationBudget`; it is R&D-shaped enough to attract a model twice.
    expect(build()).toContain('the Section 04 technical-debt remediation figure');
  });

  it.each(CALLERS)(
    '%s states the wire shape for the ignored-but-required rdOpEx',
    (_label, build) => {
      expect(build()).toContain('pass `rdOpEx: 0`');
    }
  );

  it('the (J) categories directive reaches the two bodies that render it', () => {
    // Placed in GAP_LIST_DIRECTIVE, not Step 4 — Step 4 renders in the full
    // body only, and extract-only is the path whose payloads automation parses.
    for (const build of [ONE_SHOT, EXTRACT_ONLY]) {
      const text = build();
      expect(text).toContain('TechPar components the IRL does not carry');
      // The detection signature and the full instruction moved into
      // TECHPAR_MODE_RULE during review — it reaches all three callers, while
      // this directive reaches two. What stays here is the (J) category entry.
      expect(text).toContain('softens the zone verdict');
    }
  });

  it('does not tell the model to invent provenance for a missing component', () => {
    // Fixing the mode to deepdive makes the three component audits mandatory,
    // and every annualizationSource value asserts a derivation happened — there
    // is no value meaning "the IRL does not supply this". The honest path is a
    // (J) entry, and the body has to say so or the model fabricates a source.
    expect(ONE_SHOT()).toContain('do NOT invent an annualization source');
  });

  it('DERIVED — any body instructing a compute_techpar call also states the mode', () => {
    // The PREDICATE is derived — bodies are selected by whether they instruct a
    // `compute_techpar` call, not by a maintained allow-list. The body list
    // itself is still hardcoded, so a fourth builder is not caught here; the
    // dispatch-arity assertion below covers that half.
    //
    // The verb alternation includes `Run` because that is the verb
    // TECHPAR_MODE_RULE itself uses, and extract-only names the tool inside a
    // payload-fence list rather than an imperative — an earlier version of this
    // regex silently skipped the body it most needed to cover.
    const ALL_BODIES: Array<[string, string]> = [
      ['one-shot standard', ONE_SHOT()],
      ['one-shot debug', ONE_SHOT({ auditLevel: 'debug' })],
      ['extract-only', EXTRACT_ONLY()],
      ['extract-only debug', EXTRACT_ONLY({ auditLevel: 'debug' })],
      ['interactive', INTERACTIVE()],
      ['interactive debug', INTERACTIVE({ auditLevel: 'debug' })],
      ['interactive extract-only', INTERACTIVE_EXTRACT_ONLY()],
      ['interactive extract-only debug', INTERACTIVE_EXTRACT_ONLY({ auditLevel: 'debug' })],
    ];
    const offenders = ALL_BODIES.filter(
      ([, text]) =>
        /(Call|Invoke|Run) `compute_techpar`/.test(text) && !text.includes('`mode: "deepdive"`')
    ).map(([label]) => label);
    expect(offenders, 'these bodies invoke compute_techpar without stating a mode').toEqual([]);
  });

  it('DERIVED — build() yields exactly four distinct bodies across the scenario grid', () => {
    // The half the predicate above cannot reach: a new rendered body would be a
    // shape no caller-check enumerates. Arity is the cheap invariant.
    //
    // TWO fixes landed here together, and either alone is worse than useless.
    // (a) The grid pushed `{ auditLevel }` — the interactive case with NO
    //     `mode` — so the deferred body was never rendered and a bumped count
    //     would have been green over an unexercised shape.
    // (b) Only then does the discriminator break: it probed `EXTRACT-ONLY mode`
    //     FIRST, and the deferred body carries BOTH that marker and the paste
    //     ask, so it folded onto the existing extract-only identity. The paste
    //     ask is now the outer axis and mode the inner one, which is the actual
    //     dispatch order.
    const grid: Array<Record<string, unknown>> = [];
    for (const mode of ['full', 'extract-only']) {
      for (const auditLevel of ['standard', 'enhanced', 'debug']) {
        grid.push({ filledIrl: BODY, mode, auditLevel });
        grid.push({ mode, auditLevel });
      }
    }
    const shapes = new Set(
      grid.map((a) => {
        const t = render(a);
        // Collapse to the rendered body's identity rather than its bytes.
        const asksForPaste = t.includes('> Paste the populated');
        const isExtractOnly = t.includes('EXTRACT-ONLY mode');
        return `${asksForPaste ? 'interactive' : 'one-shot'}/${isExtractOnly ? 'extract-only' : 'full'}`;
      })
    );
    expect([...shapes].sort(), 'a new rendered body needs a caller-check entry too').toEqual([
      'interactive/extract-only',
      'interactive/full',
      'one-shot/extract-only',
      'one-shot/full',
    ]);
  });
});
