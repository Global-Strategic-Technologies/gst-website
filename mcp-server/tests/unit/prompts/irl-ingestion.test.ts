import { describe, it, expect } from 'vitest';
import { irlIngestionPrompt } from '../../../src/prompts/irl-ingestion';
import {
  UNKNOWN_PROPAGATION_RULE,
  EU_AI_ACT_CONDITIONAL_TRIGGER,
  NIS2_CONDITIONAL_TRIGGER,
  ENG_COST_DEDUP_RULE,
  ICG_SEEDING_RULES,
  MTTR_P1_RULE,
} from '../../../src/prompts/extraction-rules';

// v0.21.0: the IRL taxonomy embed moved off the library article onto the
// decoupled generator source (inline label gst://irl/source).
const IRL_SOURCE_EMBED_URI = 'gst://irl/source';
const VDR_RESOURCE_URI = 'gst://library/vdr-structure';

const SAMPLE_FILLED_IRL = `
# Information Request List — MedSig Health (returned)

## 00 — Basics
- Company name: MedSig Health, Inc.
- Engagement context: buy-side review on behalf of a strategic investor
- Annual recurring revenue: $45.2M Q1-FY26 annualized
- Funding stage: Series-B closed 2024-11; lead Atomico; $310M post-money
- Business model: B2B SaaS
- Geographies of operation: US (East Coast, Texas, California ~88%), EU (~12%)
- HQ jurisdiction: Delaware incorporation; Atlanta, GA
- Company age: Founded 2018
- Total headcount: 187 today
- YoY growth rate: 62% revenue

## 01 — Product
- One-paragraph product description: revenue-cycle-management platform for hospital networks and large physician groups
- Operational scale: moderate
- Customer profile: ~120 customers, 3-year terms, largest 7.2% of ARR

## 02 — Software Architecture
- Technology stack: TypeScript Node 22, Python 3.12 FastAPI, Next.js 14, Aurora Postgres
- Engineering FTE count: 58 total
- Product personnel cost: $2.4M annual fully-loaded
- Annual build and tooling cost: $640k

## 03 — Infrastructure & Operations
- Hosting model: 100% AWS managed; US-East-1 + EU-Central-1
- Past three months monthly hosting spend: Feb $1.84M, Mar $1.92M, Apr $2.07M
- 12-24 months history: monthly avg FY24 $1.05M → FY25 $1.55M → FY26 trending $1.95M
- Headcount dedicated to infrastructure operations: 8 FTE
- Deployment frequency: multiple per day (~12 deploys/day)

## 04 — SDLC
- Active maintenance burden: ~22%
- Production incidents: trending down despite scale growth
- MTTR: P0 2.4h, P1 7.8h
- Annual investment planned for technical-debt remediation: ~$1.8M FY26

## 05 — Data, Analytics & AI
- Data sensitivity classification: PHI on every transaction, Tier-1 Restricted

## 06 — Security
- Most recent penetration test: Bishop Fox 2026-03 — Critical 0, High 2 (remediated)

## 07 — People & Organization
- Engineering headcount: 58 total
- Average fully-loaded engineering salary: $232k US

## 08 — Corporate IT
- Annual IT spend: $2.85M total

## 09 — Governance & Compliance
- Applicable regulatory frameworks: HIPAA, GDPR, Germany BDSG, France CNIL
- Jurisdictions of operation: US + EU-4 (DE, FR, NL, ES)
`;

function bodyText(
  prompt: typeof irlIngestionPrompt,
  args: Parameters<typeof prompt.build>[0]
): string {
  return prompt
    .build(args)
    .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
    .join('\n');
}

describe('gst_irl_ingestion', () => {
  it('uses the gst_ slash-menu prefix', () => {
    expect(irlIngestionPrompt.name).toMatch(/^gst_/);
    expect(irlIngestionPrompt.name).toBe('gst_irl_ingestion');
  });

  it('declares the required GstPrompt fields with concrete values', () => {
    // BL-045 reset: prompt version restarts at 0.1.0 to signal the substantive
    // rescope (rename, scenario-neutral framing, mode/verbosity/forceTools args,
    // inclusion gates, JSON fences, provenance footer, gap list).
    // v0.21.0: IRL taxonomy embed decoupled onto the generator source (gst://irl/source).
    // v0.21.1: stale promptVersion literal in META_JSON_FENCE_DIRECTIVE replaced
    // with a server-derived placeholder (BL-049 closeout).
    // v0.22.0: Step 3 stopped instructing `limit: 50` on `search_regulations` — a
    // ~153,200-character response, 1.07x the size that had already exceeded a real
    // client's tool-result ceiling (BL-112).
    // v0.22.1: worked-example client deidentified as SanFran — byte-only rename,
    // no directive changes (server 0.48.1).
    // v0.22.2: doubt-handling directive — proceed on the binding hash when a
    // client delivers the expanded prompt as an attached document, and probe
    // with `validate_irl_provenance` rather than reconstruct (server 0.49.1).
    // v0.22.3: the workbook column contract — seven columns, D/E/F carry
    // authored content, Comments joins Response into one contiguous answer
    // span, Source/Note stay outside the answer slot. Before this the prompt
    // said nothing about the xlsx layout at all, so the reconstruction path
    // and `npm run irl:extract` agreed only by coincidence (BL-120, server
    // 0.49.2).
    // v0.22.4: `countersScope` — the BL-071 precheck identities are now stated
    // as scope-conditional, because on the remote Worker `createServer` runs
    // per request and the per-request counter map could never satisfy them.
    // The transport-classed `errorsEncountered` subset is pinned closed so the
    // reconciliation stays arithmetic rather than a judgement call (BL-121,
    // server 0.49.3).
    expect(irlIngestionPrompt.version).toBe('0.24.0');
    expect(irlIngestionPrompt.lastReviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(irlIngestionPrompt.orchestrates.length).toBeGreaterThanOrEqual(11);
  });

  describe('argsSchema', () => {
    it('accepts an empty payload (interactive mode)', () => {
      expect(irlIngestionPrompt.argsSchema.safeParse({}).success).toBe(true);
    });

    it('accepts filledIrl alone (one-shot mode)', () => {
      expect(
        irlIngestionPrompt.argsSchema.safeParse({ filledIrl: SAMPLE_FILLED_IRL }).success
      ).toBe(true);
    });

    it('accepts the full arg set', () => {
      expect(
        irlIngestionPrompt.argsSchema.safeParse({
          targetName: 'MedSig Health',
          filledIrl: SAMPLE_FILLED_IRL,
          transactionContext: 'buy-side',
          partnerLead: 'Reid Peryam',
          projectCodeName: 'Cygnet',
        }).success
      ).toBe(true);
    });

    it('rejects an invalid transactionContext enum value', () => {
      const result = irlIngestionPrompt.argsSchema.safeParse({
        transactionContext: 'weird-value',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['transactionContext']);
      }
    });

    it('rejects an empty targetName (min length 1)', () => {
      const result = irlIngestionPrompt.argsSchema.safeParse({ targetName: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['targetName']);
      }
    });

    it('rejects a filledIrl below the 200-char minimum (catches "" / "<paste>" placeholder)', () => {
      const result = irlIngestionPrompt.argsSchema.safeParse({ filledIrl: 'tiny' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['filledIrl']);
      }
    });
  });

  describe('build() — message structure', () => {
    it('returns two messages in both interactive and one-shot modes (text + IRL embed)', () => {
      // BL-123 dropped the third message: the 16.3KB VDR article is now an
      // inlined nine-row table in the body, not a whole embedded Resource.
      for (const args of [{}, { filledIrl: SAMPLE_FILLED_IRL }] as const) {
        const result = irlIngestionPrompt.build(args);
        expect(result.messages.length).toBe(2);
      }
    });

    it('embeds the IRL generator source as the second message in both modes', () => {
      for (const args of [{}, { filledIrl: SAMPLE_FILLED_IRL }] as const) {
        const result = irlIngestionPrompt.build(args);
        const second = result.messages[1].content;
        expect(second.type).toBe('resource');
        if (second.type === 'resource' && 'text' in second.resource) {
          expect(second.resource.uri).toBe(IRL_SOURCE_EMBED_URI);
          expect(typeof second.resource.text).toBe('string');
          expect(second.resource.text.length).toBeGreaterThan(500);
        }
      }
    });

    it('inlines the VDR folder taxonomy in the body instead of embedding the article (BL-123)', () => {
      // The nine labels are what section (I) quotes verbatim; the article's
      // surrounding prose was 16.3KB of payload nothing read. Byte-level
      // agreement with the canonical Library article is pinned separately by
      // tests/integration/vdr-taxonomy-drift-guard.test.ts.
      for (const args of [{}, { filledIrl: SAMPLE_FILLED_IRL }] as const) {
        const result = irlIngestionPrompt.build(args);
        expect(
          result.messages.some(
            (m) =>
              m.content.type === 'resource' &&
              'text' in m.content.resource &&
              m.content.resource.uri === VDR_RESOURCE_URI
          )
        ).toBe(false);

        const text = bodyText(irlIngestionPrompt, args);
        expect(text).toContain('Canonical VDR folder taxonomy');
        expect(text).toContain(VDR_RESOURCE_URI); // provenance caption
        for (const label of [
          'Product',
          'Software Architecture',
          'Infrastructure & Operations',
          'SDLC',
          'Data, Analytics & AI',
          'Security',
          'People & Organization',
          'Corporate IT',
          'Governance & Compliance',
        ]) {
          expect(text, `body missing VDR folder label: ${label}`).toContain(label);
        }
      }
    });

    it('mentions every orchestrates entry literally in the body', () => {
      for (const args of [{}, { filledIrl: SAMPLE_FILLED_IRL }] as const) {
        const text = bodyText(irlIngestionPrompt, args);
        for (const ref of irlIngestionPrompt.orchestrates) {
          expect(text, `body missing orchestrates entry: ${ref}`).toContain(ref);
        }
      }
    });
  });

  describe('build() — interactive mode (no filledIrl)', () => {
    it('asks the user to paste the populated IRL before sweeping', () => {
      const text = bodyText(irlIngestionPrompt, {});
      expect(text.toLowerCase()).toMatch(/paste.*populated.*information request list/i);
    });

    it('mentions the dossier 9-section layout (A-I) so the model knows the output shape', () => {
      const text = bodyText(irlIngestionPrompt, {});
      expect(text).toMatch(/A.{0,4}I/);
    });
  });

  describe('build() — one-shot mode (filledIrl supplied)', () => {
    it('embeds the supplied filledIrl verbatim in the body', () => {
      const text = bodyText(irlIngestionPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      expect(text).toContain('MedSig Health, Inc.');
      expect(text).toContain('$45.2M Q1-FY26 annualized');
      expect(text).toContain('HIPAA, GDPR, Germany BDSG, France CNIL');
    });

    it('embeds the supplied targetName verbatim when provided', () => {
      const text = bodyText(irlIngestionPrompt, {
        filledIrl: SAMPLE_FILLED_IRL,
        targetName: 'MedSig-Marker-XYZ',
      });
      expect(text).toContain('MedSig-Marker-XYZ');
    });

    // ─── Worked-example payloads are permanently elided ────────────────────
    // Distinctive markers that appear ONLY inside the Step 1a / 4a / 6a worked
    // example JSON payloads (not in the kept calibration/anti-fab/enum prose).
    const WORKED_EXAMPLE_MARKERS = [
      'AKKR Emerging Buyout Partners', // Step 1a generate_diligence_agenda _audit citation
      'monthlyAnchorCitation', // Step 4a compute_techpar annualization audit field (JSON-only)
      'Fixture-clean shape', // Step 6a estimate_tech_debt_cost example comment
    ];

    it('never emits the Step 1a/4a/6a worked-example payloads (permanently elided)', () => {
      const text = bodyText(irlIngestionPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      for (const marker of WORKED_EXAMPLE_MARKERS) {
        expect(
          text,
          `default body should NOT contain worked-example marker: ${marker}`
        ).not.toContain(marker);
      }
      // The calibration / anti-fabrication / enum coaching prose STAYS — only
      // the JSON megapayloads are cut.
      expect(text).toContain('Step 1b — Calibration-clause guidance');
      expect(text).toContain('**Critical anti-fabrication rules**');
      expect(text).toContain('null discipline applies to `incidentsSource`');
    });

    it('embeds the partner lead in the synthesis attribution when provided', () => {
      const text = bodyText(irlIngestionPrompt, {
        filledIrl: SAMPLE_FILLED_IRL,
        partnerLead: 'Reid-Marker-XYZ',
      });
      expect(text).toContain('Reid-Marker-XYZ');
    });

    it('embeds the engagement code name in the project label when provided', () => {
      const text = bodyText(irlIngestionPrompt, {
        filledIrl: SAMPLE_FILLED_IRL,
        projectCodeName: 'CodeName-Marker-XYZ',
      });
      expect(text).toContain('CodeName-Marker-XYZ');
    });

    it('includes a buy-side voice cue framing the dossier as weighing risks against the deal thesis (not underwriting) + acknowledging both pre-LOI and LOI-stage engagements', () => {
      const text = bodyText(irlIngestionPrompt, {
        filledIrl: SAMPLE_FILLED_IRL,
        transactionContext: 'buy-side',
      });
      const lower = text.toLowerCase();
      expect(lower).toContain('buy-side');
      // v0.0.5 anchors: the dossier weighs risks against the deal thesis
      // (GST does not "underwrite") and the engagement may be pre-LOI OR
      // LOI-stage (the old "before the LOI" framing falsely constrained timing).
      expect(lower).toContain('deal thesis');
      expect(lower).toContain('pre-loi or loi-stage');
      expect(lower).not.toContain('underwriting');
      expect(lower).not.toContain('before the loi');
    });

    it('includes a sell-side voice cue when transactionContext is sell-side', () => {
      const text = bodyText(irlIngestionPrompt, {
        filledIrl: SAMPLE_FILLED_IRL,
        transactionContext: 'sell-side',
      });
      expect(text.toLowerCase()).toContain('sell-side');
      expect(text.toLowerCase()).toContain('story');
    });

    it('switches to one-shot Step pattern when filledIrl is supplied', () => {
      const text = bodyText(irlIngestionPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      expect(text).toContain('Step 1 —');
      expect(text).toContain('Step 8 —');
    });

    it('enforces 3-tier extraction discipline (BL-045 PR B recalibration + SanFran walkthrough)', () => {
      // BL-045 PR B (2026-06-02, senior-consultant review Axis 1) recalibrated
      // the rule. The v0.0.4 anti-inference framing collapsed Tier-2 direct
      // derivation into Tier-3 vibes-based inference and forced 'unknown'-
      // bloated dossiers. The recalibration ALLOWS Tier-2 derivation while
      // keeping the (one) remaining anti-example.
      //
      // Retired anti-examples (reviewer-confirmed wrong):
      //   - squad-model → operatingModel: product-aligned-teams (v0.0.4 → PR B initial)
      //   - b2b-saas → businessModel: productized-platform (PR B initial → PR B 2nd pass,
      //     SanFran walkthrough finding #9 — this mapping IS correct for the canonical
      //     B2B SaaS pattern)
      //
      // Surviving anti-example:
      //   - present-tense capability statement → transformationState: actively-modernizing
      //     (cloud-native ≠ in-flight change; the transformationState clause requires a
      //     specific named in-flight rewrite for literal mapping)
      const text = bodyText(irlIngestionPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      // Tier-3 sentinel directive must be present:
      expect(text).toMatch(/otherwise pass.*'unknown'/i);
      // 3-tier framing must be visible to the model:
      expect(text).toMatch(/Tier 1/);
      expect(text).toMatch(/Tier 2/);
      expect(text).toMatch(/Tier 3/);
      // Surviving anti-example: present-tense capability vs transformationState
      expect(text).toMatch(/cloud-native/);
      expect(text).toMatch(/present-tense capability/);
      // Retired anti-examples must NOT be re-introduced as forbidden mappings.
      // Note: under BL-045 PR B Option A' (tool-schema enforcement), the
      // SanFran-shape worked example in Step 1a does reference
      // `productized-platform` and `centralized-eng` (correct Tier-2 values
      // for SanFran). The assertion below only locks that the term doesn't
      // appear in an *anti-example* context — the `productized-platform` ban
      // language ("do NOT map b2b-saas → productized-platform") must stay
      // retired. We check the surrounding context, not just the substring.
      expect(text, 'product-aligned-teams must not appear as a forbidden mapping').not.toMatch(
        /do NOT map.*product-aligned-teams/i
      );
      expect(text, 'productized-platform must not appear as a forbidden mapping').not.toMatch(
        /do NOT map.*productized-platform/i
      );
      // Calibration clauses (SanFran walkthrough) must be present:
      expect(text).toMatch(/Currency normalization/);
      expect(text).toMatch(/headcount.*scope/);
      expect(text).toMatch(/transformationState.*tie-break/);
    });
  });

  // ─── Regression tests for the 5 bugs surfaced by the BL-032.6
  // ─── post-demo audit (2026-05-22). Each block locks a specific
  // ─── prompt-body contract that, when broken, was shown to produce
  // ─── material errors in the model's tool-input choices.
  // ─── Per src/docs/testing/TEST_BEST_PRACTICES.md § 2, these are
  // ─── string-presence proxies for prompt-behavior contracts — not
  // ─── perfect, but they lock the body shape that the live-exercise
  // ─── verified produces correct outputs.

  describe('regression: v0.0.3 deeplink-Surface-verb contract (bug 1)', () => {
    it('Steps 3-7 each use "Surface" verb for deeplink directive (NOT "Capture")', () => {
      // The v0.0.2 body used 'Capture the deeplink URL' (working-memory
      // verb); the model dropped the link from 5/7 dossier sections.
      // v0.0.3 replaced with 'Surface the deeplink URL in the dossier'
      // (output verb), mirroring the v0.0.1-era directive on Steps 1+2
      // that the model honored cleanly. This test locks that contract.
      const text = bodyText(irlIngestionPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      // Each tool-pulling step (3-7) must contain the Surface output verb.
      // Bold sub-steps (e.g., "**Step 1a — ...**", "**Step 6a — ...**" added
      // under BL-045 PR B for the calibration-self-audit and MTTR-OPEN guard)
      // are NOT next-step boundaries — the block walker skips them by looking
      // for newline-prefixed "Step N+1" (not bold-prefixed sub-steps).
      const stepBlocks = ['Step 3', 'Step 4', 'Step 5', 'Step 6', 'Step 7'];
      for (const step of stepBlocks) {
        const stepIdx = text.indexOf(step + ' —');
        expect(stepIdx, `${step} not found in body`).toBeGreaterThan(-1);
        const stepNumber = parseInt(step.replace('Step ', ''), 10);
        const nextStepIdx = text.indexOf(`\nStep ${stepNumber + 1} —`, stepIdx + 1);
        const stepBlock = text.slice(stepIdx, nextStepIdx > 0 ? nextStepIdx : undefined);
        expect(stepBlock, `${step} missing 'Surface ... deeplink' output-verb directive`).toMatch(
          /Surface.+`?deeplink`?/i
        );
        expect(
          stepBlock,
          `${step} reverted to 'Capture the deeplink' (v0.0.2 regression)`
        ).not.toMatch(/Capture the `?deeplink`?/i);
      }
    });

    it('Step 8 sections C/D/E/F/G/H each carry MUST-close Open-in-Hub directives', () => {
      // v0.0.3 hoisted the close-with-deeplink directive to the FIRST
      // sentence of each section description with 'MUST close ... this
      // is non-optional' framing — the model's prior 'soft-suggestion'
      // interpretation dropped the links silently.
      const text = bodyText(irlIngestionPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      expect(text).toMatch(/\*\*\(C\).+\*\*.+MUST close.+Open TechPar Wizard/s);
      expect(text).toMatch(/\*\*\(D\).+\*\*.+MUST close.+Open ICG Wizard/s);
      expect(text).toMatch(/\*\*\(E\).+\*\*.+MUST close.+Open Tech Debt Calculator/s);
      expect(text).toMatch(/\*\*\(F\).+\*\*.+MUST close.+Open in Regulatory Map/s);
      expect(text).toMatch(/\*\*\(G\).+\*\*.+MUST close.+Open Hub: Comparable engagement view/s);
      expect(text).toMatch(/\*\*\(H\).+\*\*.+MUST close.+Open Radar Feed/s);
    });
  });

  describe('regression: v0.0.4 TechPar engCost dedup worked-math example (bug 2)', () => {
    it('Step 4 includes the explicit (58 - 8) = 50 worked math', () => {
      // v0.0.3 added dedup guidance but the model still partially
      // mis-applied it (subtracted 3 security instead of 8 SRE).
      // v0.0.4 added explicit worked math matching the IRL fixture's
      // sub-count wording.
      const text = bodyText(irlIngestionPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      // The worked math example with the exact subtraction:
      expect(text).toMatch(/58.{0,5}−.{0,5}8.{0,15}=.{0,5}50/);
      // The explicit anti-instruction naming the wrong subtractions:
      expect(text).toMatch(/Do NOT subtract the security/);
      // The dedup MUST instruction:
      expect(text).toMatch(/Critical.+engCost.+dedup/);
    });
  });

  describe('regression: v0.0.4 Tech Debt P1 MTTR guidance (bug 4)', () => {
    it('Step 6 instructs P1 MTTR explicitly, NOT P0 / midpoint / average', () => {
      // The post-demo run used mttr=3 (midway between P0=2.4 and
      // P1=7.8), understating carrying cost by ~62%. v0.0.4 hard-codes
      // the P1 directive.
      const text = bodyText(irlIngestionPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      expect(text).toMatch(/use P1 \(the workhorse number\)/);
      expect(text).toMatch(/Do NOT use the P0 number/);
      expect(text).toMatch(/do NOT use a midpoint, do NOT use an average/);
    });
  });

  describe('regression: v0.0.4 ICG seeding-signal table + tenure caveat (bug 5)', () => {
    it('Step 5 includes the seeding-signal mapping table (q1_1, q1_2, q1_3, q2_1, q3_1, q5_2)', () => {
      // v0.0.3 was directionally clean but produced 2/100 Reactive
      // where ~26-30 Aware was defensible (over-conservatism worse than
      // calibrated seeding because the -1 penalty is harsher than 0).
      const text = bodyText(irlIngestionPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      // The seeding-philosophy framing:
      expect(text).toMatch(/penalizes.+`?-1`?.+more harshly/i);
      // The mapping table must enumerate the foundational q-IDs:
      const tableQuestions = ['q1_1', 'q1_2', 'q1_3', 'q2_1', 'q3_1', 'q5_2', 'q5_3'];
      for (const qid of tableQuestions) {
        expect(text, `Step 5 seeding-signal table missing ${qid}`).toContain(qid);
      }
    });

    it('Step 5 carries the q5_3 tenure caveat (level 2 NOT level 3 for new FinOps hires)', () => {
      // The post-demo run scored q5_3=3 (Strategic) for a 5-month
      // FinOps hire. v0.0.4 added the tenure caveat.
      const text = bodyText(irlIngestionPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      expect(text).toMatch(/q5_3.+level 2.+NOT level 3/s);
      expect(text).toMatch(/(?:Strategic|practice).+(?:wins shipped|architectural influence)/);
      // The <12-month tenure cutoff is the operational anchor:
      expect(text).toMatch(/<\s*12 months/);
    });
  });

  describe('BL-045 PR A: extraction-rules constant interpolation', () => {
    it('interpolates every named extraction-rule constant verbatim in the one-shot body', () => {
      // R3 of BL-045 PR A — locks the structural-only refactor: the rule
      // prose that lived inline in diligence-sweep.ts:123/127/129/131/133
      // pre-refactor now lives in extraction-rules.ts and is interpolated
      // back at the same body positions. Any future edit that bypasses
      // the constant module (re-inlining prose or paraphrasing) breaks
      // this test, alerting the editor to revisit the design doc's
      // single-source-of-truth invariant.
      const text = bodyText(irlIngestionPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      for (const [name, constant] of Object.entries({
        UNKNOWN_PROPAGATION_RULE,
        EU_AI_ACT_CONDITIONAL_TRIGGER,
        NIS2_CONDITIONAL_TRIGGER,
        ENG_COST_DEDUP_RULE,
        ICG_SEEDING_RULES,
        MTTR_P1_RULE,
      })) {
        expect(text, `sweep body missing extraction-rules.${name}`).toContain(constant);
      }
    });
  });

  describe('regression: v0.0.4 NIS2 conditional for EU healthcare (bug 7)', () => {
    it('Step 3 adds NIS2 conditional alongside the existing EU AI Act conditional', () => {
      // Post-demo audit found NIS2 missing despite MedSig serving EU
      // healthcare (Annex II "important entity"). v0.0.4 added the
      // gap-fill conditional.
      const text = bodyText(irlIngestionPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      expect(text).toContain('NIS2');
      expect(text).toMatch(/add an NIS2 search/);
      // The Annex I/II sector framing:
      expect(text).toMatch(/Annex I or II|Annex I\/II/);
      // The healthcare sector should be in the enumeration:
      expect(text).toMatch(/healthcare/);
    });
  });

  // ─── BL-051 schema-prompt consistency regression guard (post-PR-A bug) ─
  //
  // The original BL-051 directive instructed the model to call
  // `validate_irl_provenance` with `{filledIrl, claims}` — but the
  // schema field is `citations`. The model would issue `claims:`, get
  // schema rejection, and burn the precheck budget on a schema-mismatch
  // loop, bypassing the entire BL-051 architecture in production.
  //
  // This guard locks the corrected field name across both prompt-body
  // sites (the standalone ENVELOPE_PRECHECK_DIRECTIVE used by
  // buildOneShotBody, and the inline Step 3a in INTERACTIVE_BODY) and
  // verifies that the field name the prompt body references for
  // `validate_irl_provenance`'s payload matches the actual Zod schema.
  describe('BL-051 schema-prompt consistency: precheck directive references real schema fields', () => {
    it('one-shot body (verbose default) instructs `{filledIrl, citations}` — NOT the historical `{filledIrl, claims}` bug', async () => {
      const text = bodyText(irlIngestionPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      expect(text).toMatch(/validate_irl_provenance/);
      expect(text).toContain('{filledIrl, citations}');
      expect(text).not.toContain('{filledIrl, claims}');
    });

    it('interactive body (no filledIrl) Step 3a instructs `{filledIrl, citations}` — NOT the historical `{filledIrl, claims}` bug', async () => {
      const text = bodyText(irlIngestionPrompt, {});
      expect(text).toMatch(/Step 3a\..*Envelope precheck/);
      expect(text).toContain('{filledIrl, citations}');
      expect(text).not.toContain('{filledIrl, claims}');
    });

    it('field name in `{filledIrl, X}` matches the validate_irl_provenance Zod schema shape', async () => {
      const { ValidateIrlProvenanceInputSchema } =
        await import('../../../src/schemas/validate-irl-provenance');
      const schemaShape = Object.keys(ValidateIrlProvenanceInputSchema.shape);
      // Schema must continue to have `filledIrl` + `citations` for the
      // precheck directive to be correct. If the schema is refactored
      // (e.g., `citations` renamed to `claims` or `entries`), this test
      // FORCES the prompt body to be updated in lockstep.
      expect(schemaShape).toContain('filledIrl');
      expect(schemaShape).toContain('citations');

      // And the body must reference whichever field names the schema
      // actually publishes. Cross-check explicit for the precheck-
      // payload shape both bodies advertise.
      for (const args of [{}, { filledIrl: SAMPLE_FILLED_IRL }] as const) {
        const text = bodyText(irlIngestionPrompt, args);
        const match = text.match(/\{filledIrl,\s*(\w+)\}/);
        expect(match, 'precheck payload shape not present in body').not.toBeNull();
        if (match) {
          const referencedField = match[1];
          expect(schemaShape).toContain(referencedField);
        }
      }
    });
  });

  // ─── BL-056: precheckIterations field in BL-045-VERIFY block ──────────
  //
  // The v13 partner-paste live exercise (2026-06-04) shipped a clean
  // dossier but the VERIFY block could not distinguish "precheck
  // converged after N iterations" from "precheck skipped entirely" — both
  // produce identical artifacts. Surfacing `precheckIterations` makes
  // BL-051 compliance observable from the artifact alone. This guard
  // locks the literal field name across both BL-045-VERIFY schemas
  // (one-shot body + interactive Step 5) so future prompt edits that
  // delete the field fail loudly rather than silently degrading the
  // observability surface.
  describe('BL-056 precheckIterations field present in BL-045-VERIFY block schemas', () => {
    it('one-shot body verify-block schema declares `precheck.iterations` (BL-058 expansion of BL-056)', () => {
      const text = bodyText(irlIngestionPrompt, {
        filledIrl: SAMPLE_FILLED_IRL,
        auditLevel: 'debug',
      });
      // BL-058 nested under `precheck:` block; BL-056 raw `precheckIterations:` superseded.
      expect(text).toMatch(/precheck:\s*\n\s*iterations:/);
    });

    it('interactive body verify-block schema declares `precheck.iterations` (BL-058 expansion of BL-056)', () => {
      const text = bodyText(irlIngestionPrompt, { auditLevel: 'debug' });
      expect(text).toMatch(/precheck:\s*\n\s*iterations:/);
    });
  });

  // ─── BL-058: enriched BL-045-VERIFY block for self-sufficient diagnosis ──
  //
  // The 2026-06-04 retest exposed three diagnosis-cycle pathologies the
  // existing VERIFY block could not surface from the artifact alone:
  //   1. Model passed literal "PLACEHOLDER" as filledIrl (schema caught
  //      it, but the block reported no signal that precheck attempted-
  //      and-failed — only that it didn't iterate).
  //   2. provenanceVerification showed 37/37 verified against a model-
  //      reconstructed body, with no signal that the body was a
  //      reconstruction rather than partner-paste-verbatim.
  //   3. conditionalTriggersFired: [] for a target with EU + UK + Canada
  //      regulatory disclosures — no signal whether triggers were
  //      considered-and-suppressed vs never-considered.
  //
  // BL-058 expands the block schema to make each of these observable
  // from one paste, eliminating the operator→engineering Q&A cycle.
  // This guard locks the new field families across both verify-block
  // sites (buildOneShotBody + INTERACTIVE_BODY Step 5).
  describe('BL-058 enriched VERIFY block fields present in both schemas', () => {
    const expectedFields = [
      // filledIrl block
      'filledIrl:',
      'bytes:',
      'source: partner-paste-verbatim',
      'placeholder',
      'fingerprint:',
      'headChars:',
      'tailChars:',
      // precheck block
      'precheck:',
      'attemptsTotal:',
      'outcome: converged',
      'errorsEncountered:',
      // toolCallCounts block
      'toolCallCounts:',
      'validate_irl_provenance: { attempted: N, succeeded: N, rejected: N, errored: N }',
      // conditionalTriggers block
      'conditionalTriggers:',
      'considered:',
      'fired:',
      'suppressedWithRationale:',
      // response block
      'response:',
      'continuations:',
      'verifyBlockEmissionPoint:',
    ];

    for (const field of expectedFields) {
      it(`one-shot body verify-block schema contains: ${field}`, () => {
        const text = bodyText(irlIngestionPrompt, {
          filledIrl: SAMPLE_FILLED_IRL,
          auditLevel: 'debug',
        });
        expect(text).toContain(field);
      });

      it(`interactive body verify-block schema contains: ${field}`, () => {
        const text = bodyText(irlIngestionPrompt, { auditLevel: 'debug' });
        expect(text).toContain(field);
      });
    }
  });

  // ─── BL-060/061/062: three VERIFY-block field additions (one PR) ──────
  //
  // BL-060 — toolErrors top-level block (per-attempt diagnostic detail
  //   partitioned from precheck.errorsEncountered).
  // BL-061 — compactionEvents field in response: block (int|null
  //   three-state with epistemic-honesty correction).
  // BL-062 — defaultFiredFrameworks additive list in conditionalTriggers:
  //   block (resolves BL-058 vocabulary collision; Option A picked).
  //
  // All three are audit-corrected designs from independent code-reviewer
  // agents (see BACKLOG.md stanzas for the audit findings folded in).
  // Guards lock the literal field names across both verify-block sites.
  describe('BL-060/061/062 VERIFY block field additions present in both schemas', () => {
    const expectedFields = [
      // BL-060 toolErrors
      'toolErrors:',
      'attemptNumber:',
      'arg-shape-rejection',
      'hash-bind-retry',
      '<partial-due-to-compaction>',
      // BL-061 compactionEvents
      'compactionEvents:',
      'int | null',
      // BL-062 defaultFiredFrameworks
      'defaultFiredFrameworks:',
    ];

    for (const field of expectedFields) {
      it(`one-shot body verify-block schema contains: ${field}`, () => {
        const text = bodyText(irlIngestionPrompt, {
          filledIrl: SAMPLE_FILLED_IRL,
          auditLevel: 'debug',
        });
        expect(text).toContain(field);
      });

      it(`interactive body verify-block schema contains: ${field}`, () => {
        const text = bodyText(irlIngestionPrompt, { auditLevel: 'debug' });
        expect(text).toContain(field);
      });
    }
  });

  describe('BL-070 — requireVerbatimBody prompt-arg directive (audit min-6)', () => {
    it('one-shot body mentions requireVerbatimBody in the envelope-composition directive', () => {
      const text = bodyText(irlIngestionPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      expect(text).toContain('requireVerbatimBody');
    });

    it('interactive body mentions requireVerbatimBody in the Step 4 directive', () => {
      const text = bodyText(irlIngestionPrompt, {});
      expect(text).toContain('requireVerbatimBody');
    });

    it('argsSchema accepts requireVerbatimBody: true', () => {
      expect(irlIngestionPrompt.argsSchema.safeParse({ requireVerbatimBody: true }).success).toBe(
        true
      );
    });

    it('argsSchema accepts requireVerbatimBody: false', () => {
      expect(irlIngestionPrompt.argsSchema.safeParse({ requireVerbatimBody: false }).success).toBe(
        true
      );
    });

    // BL-082 — slash-command form ships all values as strings per the MCP
    // wire protocol (`arguments: Record<string, string>`). Operators learned
    // about this the hard way on 2026-06-07 when `requireVerbatimBody: "TRUE"`
    // got rejected with `expected boolean, received string`. These tests pin
    // the booleanFromWire coercion at the argsSchema level — not just on the
    // wire-shape helper in isolation.
    it("BL-082: argsSchema accepts requireVerbatimBody: 'true' (string, from slash-command form)", () => {
      const r = irlIngestionPrompt.argsSchema.safeParse({ requireVerbatimBody: 'true' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.requireVerbatimBody).toBe(true);
    });

    it("BL-082: argsSchema accepts requireVerbatimBody: 'TRUE' (uppercase, the exact failing 2026-06-07 case)", () => {
      const r = irlIngestionPrompt.argsSchema.safeParse({ requireVerbatimBody: 'TRUE' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.requireVerbatimBody).toBe(true);
    });

    it("BL-082: argsSchema accepts requireVerbatimBody: 'false' (string)", () => {
      const r = irlIngestionPrompt.argsSchema.safeParse({ requireVerbatimBody: 'false' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.requireVerbatimBody).toBe(false);
    });

    it("BL-082: argsSchema treats requireVerbatimBody: '' (empty form field) as not supplied", () => {
      const r = irlIngestionPrompt.argsSchema.safeParse({ requireVerbatimBody: '' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.requireVerbatimBody).toBeUndefined();
    });

    it("BL-082: argsSchema rejects garbage strings ('definitely') with structured Zod error", () => {
      const r = irlIngestionPrompt.argsSchema.safeParse({ requireVerbatimBody: 'definitely' });
      expect(r.success).toBe(false);
    });

    // BL-082 follow-up: the schema must mark requireVerbatimBody
    // as OPTIONAL at the ZodObject seam so Claude Desktop's slash-command form
    // doesn't render them as required fields. ZodObject inspects whether each
    // field's schema is ZodOptional at the TOP level — `booleanFromWire(...)`
    // returns ZodEffects, not ZodOptional, so the outer `.optional()` chain
    // is load-bearing for the UI introspection. Without it, the form blocks
    // the operator from submitting before they fill the field.
    it('BL-082 follow-up: argsSchema marks requireVerbatimBody as optional at the ZodObject layer (UI introspection)', () => {
      const shape = irlIngestionPrompt.argsSchema.shape;
      expect(shape.requireVerbatimBody.isOptional()).toBe(true);
    });

    it('BL-082 follow-up: argsSchema accepts an entirely empty object', () => {
      // Regression guard: the original schema (z.boolean().optional()) accepted
      // {} cleanly. After the BL-082 wire-shape wrapping, the {} case MUST
      // remain accepted — otherwise the slash-command form blocks submission
      // before any fields are filled. The subject is the wire-shape-wrapped
      // optional, which outlived `forceTools` in `requireVerbatimBody`.
      expect(irlIngestionPrompt.argsSchema.safeParse({}).success).toBe(true);
    });
  });

  /**
   * BL-123 — argument descriptions lead with their machine facts.
   *
   * Claude Desktop's slash-command form truncates each description in a
   * single-line input. Before this, six of the eight fields buried their
   * default past the cut: an operator reading `requireVerbatimBody` saw
   * "Set true for accuracy-critical work — a regulatory deliverable," and never
   * learned it defaults to false.
   *
   * The assertion is on ORDERING, not on a pixel budget. `FORM_TRUNCATION_HINT`
   * below is an observation of one client's current form styling, which can
   * change without notice — pinning CI to it would make an external UI tweak
   * break the build.
   */
  describe('BL-123 — argument description convention', () => {
    /** Approximate visible width of Desktop's argument input. Advisory only. */
    const FORM_TRUNCATION_HINT = 60;

    const shape = irlIngestionPrompt.argsSchema.shape;
    const argNames = Object.keys(shape) as (keyof typeof shape)[];

    it('exposes exactly the eight expected arguments, filledIrl first', () => {
      // Claude Desktop renders fields in argsSchema property order, so index 0
      // is the field the operator meets first.
      expect(argNames.length).toBe(8);
      expect(argNames[0]).toBe('filledIrl');
    });

    it.each([
      ['filledIrl', 'Optional.'],
      ['targetName', 'Optional.'],
      ['transactionContext', 'Must be one of:'],
      ['partnerLead', 'Optional.'],
      ['projectCodeName', 'Optional.'],
      ['mode', 'Must be one of:'],
      ['auditLevel', 'Must be one of:'],
      ['requireVerbatimBody', 'Must be one of:'],
    ])('%s opens with its machine facts', (name, opener) => {
      const description = shape[name as keyof typeof shape].description ?? '';
      expect(description.startsWith(opener), `${name}: "${description.slice(0, 70)}…"`).toBe(true);
    });

    it('every argument states its default within the first two sentences', () => {
      // Sentence-scoped, not character-scoped, and the difference is load-bearing.
      // `transactionContext`'s enum list is 63 characters on its own — longer
      // than the form's visible width — so a hard character budget would fail a
      // description that is already correct and could only be satisfied by
      // deleting the valid values, which are the other half of what the operator
      // needs. The contract is ORDER: machine facts (values, then default),
      // then the prose explaining what the field does.
      for (const name of argNames) {
        const description = shape[name].description ?? '';
        const opening = description
          .split(/(?<=\.)\s+/)
          .slice(0, 2)
          .join(' ');
        expect(
          opening,
          `${name}: no default in the opening sentences — "${description.slice(0, 90)}…"`
        ).toMatch(/Defaults to |Omit to enter/);
      }
    });

    it('states the default ahead of the form cut wherever the enum list leaves room', () => {
      // The fields where the character budget IS achievable — everything whose
      // opener is not a long enum list. Kept separate from the ordering contract
      // above so a future long-enum field does not silently relax this one.
      for (const name of argNames.filter((n) => n !== 'transactionContext')) {
        const description = shape[name].description ?? '';
        const defaultAt = description.search(/Defaults to |Omit to enter/);
        expect(
          defaultAt,
          `${name}: default appears ${defaultAt} chars in, past the ~${FORM_TRUNCATION_HINT}-char form cut — "${description.slice(0, 90)}…"`
        ).toBeLessThan(FORM_TRUNCATION_HINT);
      }
    });

    it('no description leaks a bare backlog id at any position', () => {
      // The operator-facing surface must explain itself; BL- ids are
      // archaeology and belong in the companion doc's closing ledger.
      for (const name of argNames) {
        const description = shape[name].description ?? '';
        expect(description, `${name} carries a backlog id`).not.toMatch(/\bBL-\d+/);
      }
    });
  });

  describe('BL-071 — serverToolCallCounts + precheck-derivation directive', () => {
    // `serverToolCallCounts` is named by the envelope-composition directive,
    // which is correctness machinery and ships at EVERY audit level.
    it('one-shot body mentions serverToolCallCounts at the default level', () => {
      const text = bodyText(irlIngestionPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      expect(text).toContain('serverToolCallCounts');
    });

    // The interactive path has no envelope-composition directive of its own —
    // its Step 4 names the tool and the tool returns the counts either way. The
    // only place that body names `serverToolCallCounts` is the run-audit
    // region, which is where the counts are actually transcribed, so it is a
    // `debug` surface there rather than a default one.
    it('interactive body names serverToolCallCounts at debug', () => {
      const text = bodyText(irlIngestionPrompt, { auditLevel: 'debug' });
      expect(text).toContain('serverToolCallCounts');
    });

    // The precheck derivation identities and the `errored` counter field are
    // RUN-AUDIT reporting rules. BL-122 removed the duplicate copy that used to
    // sit in the envelope-composition directive — two copies of one reporting
    // contract only drift, and that directive now ships at every level, where
    // most runs emit no block for those rules to govern. The block's own
    // section is the single home, so they appear at `debug` only.
    it.each([
      ['one-shot', { filledIrl: SAMPLE_FILLED_IRL, auditLevel: 'debug' as const }],
      ['interactive', { auditLevel: 'debug' as const }],
    ])('%s body at debug carries the precheck.iterations derivation rule', (_l, args) => {
      expect(bodyText(irlIngestionPrompt, args)).toContain('precheck.iterations');
    });

    it.each([
      ['one-shot', { filledIrl: SAMPLE_FILLED_IRL, auditLevel: 'debug' as const }],
      ['interactive', { auditLevel: 'debug' as const }],
    ])('%s body at debug carries the errored field on toolCallCounts entries', (_l, args) => {
      expect(bodyText(irlIngestionPrompt, args)).toContain('errored: N');
    });

    it.each([
      ['one-shot', { filledIrl: SAMPLE_FILLED_IRL }],
      ['interactive', {}],
    ])('%s body at standard emits no run-audit reporting rules', (_l, args) => {
      const text = bodyText(irlIngestionPrompt, args);
      expect(text).not.toContain('precheck.iterations');
      expect(text).not.toContain('errored: N');
    });
  });

  describe('body-by-hash directive (compose_dossier_envelope no longer takes filledIrl)', () => {
    it('one-shot body describes the prepop skip-prepare path (no prepare_irl_body call)', () => {
      const text = bodyText(irlIngestionPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      // Under L1, one-shot is unconditionally prepop. The model is told to
      // SKIP prepare_irl_body, not call it. The directive prose still
      // references the tool name (as the thing-to-skip).
      expect(text).toContain('prepare_irl_body');
      expect(text).toContain('SKIP `prepare_irl_body`');
      expect(text).toContain('partner-paste-verbatim-prepop');
    });

    it('one-shot body tells the model to proceed when it doubts its own invocation (BL-119 cycle 5)', () => {
      // A real 57KB Desktop run succeeded only after operator intervention:
      // the client delivered the expanded prompt as an attached document, the
      // model concluded it was reading a render rather than holding bound
      // arguments, and offered to call `prepare_irl_body` with the body it
      // could see. That recovery COMPLETES — and silently downgrades irlSource
      // from server-witnessed `-prepop` to model-asserted, past a
      // `requireVerbatimBody` gate that accepts both. The directive is pinned
      // here because the failure it prevents is invisible in the output: the
      // dossier looks identical and the audit grade is weaker.
      const text = bodyText(irlIngestionPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      expect(text).toMatch(/If you doubt you were invoked properly/i);
      expect(text).toMatch(/attached document/i);
      expect(text).toMatch(/do NOT reconstruct/i);
      // The probe is the alternative to reconstructing — it must be named
      // INSIDE the directive, or the model is left with "proceed" and no way to
      // satisfy its doubt. Windowed deliberately: a bare
      // `toContain('validate_irl_provenance')` passes on the pre-fix body,
      // where the tool is named two dozen times elsewhere, and would assert
      // nothing.
      expect(text).toMatch(
        /If you doubt you were invoked properly[\s\S]{0,1600}validate_irl_provenance/i
      );
      // And the honest-reporting fallback, so a genuine cache miss does not
      // become a mislabelled run.
      expect(text).toMatch(/cache miss[\s\S]{0,220}partner-paste-verbatim/i);
    });

    it('interactive body instructs the model to call prepare_irl_body FIRST', () => {
      const text = bodyText(irlIngestionPrompt, {});
      expect(text).toContain('prepare_irl_body');
      // Interactive path: legacy unconditional. No prepop SKIP-prepare directive.
      // (The VERIFY-block enum still LISTS partner-paste-verbatim-prepop as a
      // valid filledIrl.source value — that's a schema surface, not a workflow
      // directive — so we assert on the prose directive instead.)
      expect(text).not.toContain('SKIP `prepare_irl_body`');
    });

    it('interactive body documents Bl076BodyCacheMissError as the cache-miss diagnostic', () => {
      const text = bodyText(irlIngestionPrompt, {});
      expect(text).toContain('Bl076BodyCacheMissError');
    });
  });

  // ─── BL-120 — workbook column contract ─────────────────────────────────
  //
  // The prompt previously said nothing about the xlsx layout, so the
  // reconstruction path and the operator-side `npm run irl:extract` script
  // agreed only by coincidence — and on the first real filled workbook they
  // did not. These assertions pin the contract in every served body: a model
  // reading an attached workbook must compose the same bullet shape the
  // script emits, count the fill ratio over the same span, and keep source
  // pointers out of the answer.
  describe('BL-120 workbook column contract (all modes)', () => {
    /**
     * The four bodies that carry the sweep/extraction plan — pre-flight,
     * inclusion gates and all.
     */
    const SWEEP_MODES: Array<[string, Parameters<typeof irlIngestionPrompt.build>[0]]> = [
      ['one-shot standard', { filledIrl: SAMPLE_FILLED_IRL }],
      ['one-shot enhanced', { filledIrl: SAMPLE_FILLED_IRL, auditLevel: 'enhanced' }],
      ['extract-only', { filledIrl: SAMPLE_FILLED_IRL, mode: 'extract-only' }],
      [
        'extract-only enhanced',
        { filledIrl: SAMPLE_FILLED_IRL, mode: 'extract-only', auditLevel: 'enhanced' },
      ],
    ];

    /**
     * Every served body, interactive included. The interactive body is a
     * separate, much lighter builder — no pre-flight, no inclusion gates — but
     * it still carries the column contract, because its own VERIFY block
     * admits `xlsx-reconstruction` / `model-reconstruction-from-xlsx`. A path
     * that can reconstruct from a workbook needs to know the workbook's shape.
     */
    const ALL_MODES: Array<[string, Parameters<typeof irlIngestionPrompt.build>[0]]> = [
      ['interactive', {}],
      ...SWEEP_MODES,
    ];

    it.each(ALL_MODES)('%s body names all seven columns in order', (_label, args) => {
      const text = bodyText(irlIngestionPrompt, args);
      expect(text).toContain(
        '| Reference | Request | Status | File Location | Comments | Notes | Response |'
      );
    });

    it.each(ALL_MODES)('%s body carries the canonical bullet shape', (_label, args) => {
      const text = bodyText(irlIngestionPrompt, args);
      expect(text).toContain('- <ref> <request> [<STATUS>] — <answer> (Source: <D>) (Note: <F>)');
    });

    it.each(ALL_MODES)('%s body forbids labelling the Response/Comments join', (_label, args) => {
      const text = bodyText(irlIngestionPrompt, args);
      expect(text).toContain('**Do not label the two halves.**');
      // The reason, not just the rule — a bare prohibition invites a model to
      // decide it knows better.
      expect(text).toMatch(/contiguous-run floor|contiguous run floor/i);
    });

    it.each(ALL_MODES)('%s body warns off the stale Instructions sheet', (_label, args) => {
      const text = bodyText(irlIngestionPrompt, args);
      expect(text).toContain('Do NOT trust the Instructions sheet');
      expect(text).toMatch(/five-column layout with Response in column D/i);
    });

    it.each(ALL_MODES)(
      '%s body keeps File Location out of the answer slot (fill-ratio guard)',
      (_label, args) => {
        const text = bodyText(irlIngestionPrompt, args);
        expect(text).toContain('`— <NO RESPONSE> (Source: …)`');
        expect(text).toMatch(/a row whose only content is a filename is NOT answered/i);
      }
    );

    it.each(SWEEP_MODES)(
      '%s body orders the fill-ratio count after answer composition',
      (_label, args) => {
        const text = bodyText(irlIngestionPrompt, args);
        expect(text).toContain('**Compose the answer span FIRST, then count**');
        // The divergence this sentence exists to prevent.
        expect(text).toMatch(/Counting column G alone under-reports the fill ratio/i);
      }
    );

    it.each(ALL_MODES)('%s body states the citation-hygiene audit rule', (_label, args) => {
      const text = bodyText(irlIngestionPrompt, args);
      expect(text).toContain(
        'cite from the answer slot only — never from `(Source:)` or `(Note:)`'
      );
      // The residual, stated plainly: the verifier will NOT catch this.
      expect(text).toContain('will verify and will NOT raise a `provenance-gap:`');
      expect(text).toContain('you are the control');
    });

    it.each(SWEEP_MODES)('%s body ties inclusion gates to a substantive answer', (_label, args) => {
      const text = bodyText(irlIngestionPrompt, args);
      expect(text).toContain('**"Signal" means a substantive answer**');
      expect(text).toContain('Section 00 ARR bullet supplies a substantive answer');
      expect(text).toContain(
        'Section 04 (SDLC / technical-debt assessment) has ≥1 row with a substantive answer'
      );
    });

    it.each(ALL_MODES)('%s body states the shipped join rule', (_label, args) => {
      // Coverage matters here specifically: the interactive body is in scope
      // because it can reconstruct from a workbook, so the rule vanishing from
      // it would reintroduce the gap this contract closes — silently, since the
      // agreement check in `irl-ingestion-fixtures.test.ts` reads one body.
      const text = bodyText(irlIngestionPrompt, args);
      expect(text).toContain(
        'add a period after G unless G already ends in `.` `?` `!` `:` `;` `,` `…` or a dash'
      );
      expect(text).toContain('after peeling off any closing brackets and quotes');
      // The endings the rule's earlier phrasing got wrong, named so a model
      // reading the contract produces what the script produces.
      expect(text).toContain('`14%`');
      expect(text).toContain('`$4.15M +`');
      expect(text).toMatch(/including when a closing quote follows the comma/);
    });

    it('states that Status does not gate inclusion (OPEN rows still contribute)', () => {
      const text = bodyText(irlIngestionPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      expect(text).toMatch(/Status does \*\*not\*\* gate inclusion/i);
    });
  });

  // ─── BL-121 — scope-conditional counter identities ─────────────────────
  //
  // The BL-071 identities were stated flatly, as if the counter always spans
  // the session. On the remote Worker `createServer` runs per HTTP request,
  // so the per-request map could never satisfy them — and the prompt told
  // operators to fail runs on a check that could not pass. Every served body
  // now carries `countersScope` and states the identities conditionally.
  //
  // Coverage is per-body on purpose: the interactive builder keeps its OWN
  // copy of the VERIFY discipline and never renders the envelope directive,
  // so a fix landing in only one place is exactly the failure mode here.
  describe('BL-121 scope-conditional counter identities (all modes)', () => {
    // Every body that EMITS a run-audit block must carry its full schema.
    // Re-scoped per BUILDER, not per level: the two gated builders emit it at
    // `debug` only, while extract-only is exempt from the gate entirely and
    // emits it at every level (its own `mode` description promises provenance,
    // and it produces no partner-facing dossier to keep clean).
    const VERIFY_MODES: Array<[string, Parameters<typeof irlIngestionPrompt.build>[0]]> = [
      ['interactive debug', { auditLevel: 'debug' }],
      ['one-shot debug', { filledIrl: SAMPLE_FILLED_IRL, auditLevel: 'debug' }],
      ['extract-only standard', { filledIrl: SAMPLE_FILLED_IRL, mode: 'extract-only' }],
      [
        'extract-only debug',
        { filledIrl: SAMPLE_FILLED_IRL, mode: 'extract-only', auditLevel: 'debug' },
      ],
    ];

    it.each(VERIFY_MODES)('%s body emits `countersScope` in the VERIFY schema', (_label, args) => {
      const text = bodyText(irlIngestionPrompt, args);
      expect(text).toContain('countersScope: session | run | request');
    });

    it.each(VERIFY_MODES)('%s body defines all three scope values', (_label, args) => {
      const text = bodyText(irlIngestionPrompt, args);
      // The `request` definition is the load-bearing one: without it a model
      // reads an absent tool entry as its own omission and back-fills.
      expect(text).toMatch(/`session`[^\n]*stdio/i);
      expect(text).toMatch(/`run`[^\n]*across requests/i);
      expect(text).toMatch(/`request`[^\n]*own request/i);
    });

    it.each(VERIFY_MODES)('%s body pins the transport-classed subset CLOSED', (_label, args) => {
      // Left as examples, an operator counting "transport-classed entries"
      // has to decide for themselves whether `connection-reset` qualifies —
      // which puts an arithmetic check back into judgement.
      const text = bodyText(irlIngestionPrompt, args);
      expect(text).toMatch(/CLOSED set \(BL-121\): `transport-timeout` and `transport-disconnect`/);
    });

    it.each(VERIFY_MODES)(
      '%s body states the reconciliation identities, not the bare equality',
      (_label, args) => {
        const text = bodyText(irlIngestionPrompt, args);
        // attemptsTotal === attempted is no longer true with exit-placed
        // durable writes: a transport failure never reached the server.
        expect(text).toContain('`precheck.attemptsTotal − attempted` MUST equal');
        expect(text).toContain('`rejected + errored + (attemptsTotal − attempted)`');
      }
    );

    it.each(VERIFY_MODES)(
      '%s body tells the model NOT to reconcile under `request` scope',
      (_label, args) => {
        // The whole point: an honest gap beats a manufactured agreement.
        const text = bodyText(irlIngestionPrompt, args);
        expect(text).toMatch(/[Uu]nder `countersScope: request`/);
        expect(text).toMatch(/false green/);
      }
    );

    it.each(VERIFY_MODES)(
      '%s body enumerates the three causes of a short count',
      (_label, args) => {
        const text = bodyText(irlIngestionPrompt, args);
        expect(text).toMatch(/exactly three causes/);
        expect(text).toMatch(/DIFFERENT body than you composed/);
        expect(text).toMatch(/lost durable write/);
      }
    );

    it.each(VERIFY_MODES)(
      '%s body names the benign cause of a count LONG of memory',
      (_label, args) => {
        // The first draft enumerated three causes of a SHORT count and none
        // for a long one — while telling the model not to adjust the numbers.
        // Since the run key is the body hash and the row lives 4h, a repeat
        // ingestion of identical bytes accumulates, so the model would emit a
        // count it could not explain and the operator would fail a good run.
        // Asymmetric coverage of a symmetric failure is the same over-claiming
        // this whole change exists to correct.
        const text = bodyText(irlIngestionPrompt, args);
        expect(text).toMatch(/come up LONG|the count can also come up LONG/i);
        expect(text).toMatch(/4[- ]hour window/);
        expect(text).toMatch(/do NOT subtract/i);
      }
    );

    it.each(VERIFY_MODES)(
      '%s body scope-qualifies the toolErrors arithmetic check',
      (_label, args) => {
        // `count(toolErrors[T]) === attempted − succeeded` stays false on the
        // Worker for every tool outside the durable set. Shipping it
        // unqualified would be the same defect in a new place.
        const text = bodyText(irlIngestionPrompt, args);
        expect(text).toMatch(/Scope qualifier \(BL-121\)/);
      }
    );
  });
});
