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
    expect(irlIngestionPrompt.version).toBe('0.22.2');
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

    it('accepts embedToolWorkedExamples as a boolean and via wire-shape string forms', () => {
      // BL-086 L2 restore arg. Mirrors requireVerbatimBody's booleanFromWire
      // handling: real boolean, string "true"/"false" (Claude Desktop ships
      // form fields as strings), and "" (unfilled field) → undefined.
      for (const v of [true, false, 'true', 'false', '']) {
        const r = irlIngestionPrompt.argsSchema.safeParse({
          filledIrl: SAMPLE_FILLED_IRL,
          embedToolWorkedExamples: v,
        });
        expect(r.success, `embedToolWorkedExamples=${JSON.stringify(v)} should parse`).toBe(true);
      }
      const empty = irlIngestionPrompt.argsSchema.safeParse({ embedToolWorkedExamples: '' });
      expect(empty.success && empty.data.embedToolWorkedExamples).toBeUndefined();
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
    it('returns three messages in both interactive and one-shot modes (text + IRL embed + VDR embed)', () => {
      for (const args of [{}, { filledIrl: SAMPLE_FILLED_IRL }] as const) {
        const result = irlIngestionPrompt.build(args);
        expect(result.messages.length).toBe(3);
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

    it('embeds the VDR Library Resource as the third message in both modes', () => {
      for (const args of [{}, { filledIrl: SAMPLE_FILLED_IRL }] as const) {
        const result = irlIngestionPrompt.build(args);
        const third = result.messages[2].content;
        expect(third.type).toBe('resource');
        if (third.type === 'resource' && 'text' in third.resource) {
          expect(third.resource.uri).toBe(VDR_RESOURCE_URI);
          expect(typeof third.resource.text).toBe('string');
          expect(third.resource.text.length).toBeGreaterThan(500);
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

    // ─── BL-086 L2 — worked-example deletion + embedToolWorkedExamples ──────
    // Distinctive markers that appear ONLY inside the Step 1a / 4a / 6a worked
    // example JSON payloads (not in the kept calibration/anti-fab/enum prose).
    const WORKED_EXAMPLE_MARKERS = [
      'AKKR Emerging Buyout Partners', // Step 1a generate_diligence_agenda _audit citation
      'monthlyAnchorCitation', // Step 4a compute_techpar annualization audit field (JSON-only)
      'Fixture-clean shape', // Step 6a estimate_tech_debt_cost example comment
    ];

    it('elides the Step 1a/4a/6a worked-example payloads from the default one-shot body', () => {
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

    it('restores the worked-example payloads when embedToolWorkedExamples: true', () => {
      const text = bodyText(irlIngestionPrompt, {
        filledIrl: SAMPLE_FILLED_IRL,
        embedToolWorkedExamples: true,
      });
      for (const marker of WORKED_EXAMPLE_MARKERS) {
        expect(text, `restored body should contain worked-example marker: ${marker}`).toContain(
          marker
        );
      }
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
      const text = bodyText(irlIngestionPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      // BL-058 nested under `precheck:` block; BL-056 raw `precheckIterations:` superseded.
      expect(text).toMatch(/precheck:\s*\n\s*iterations:/);
    });

    it('interactive body verify-block schema declares `precheck.iterations` (BL-058 expansion of BL-056)', () => {
      const text = bodyText(irlIngestionPrompt, {});
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
        const text = bodyText(irlIngestionPrompt, { filledIrl: SAMPLE_FILLED_IRL });
        expect(text).toContain(field);
      });

      it(`interactive body verify-block schema contains: ${field}`, () => {
        const text = bodyText(irlIngestionPrompt, {});
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
        const text = bodyText(irlIngestionPrompt, { filledIrl: SAMPLE_FILLED_IRL });
        expect(text).toContain(field);
      });

      it(`interactive body verify-block schema contains: ${field}`, () => {
        const text = bodyText(irlIngestionPrompt, {});
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

    // BL-082 follow-up: the schema must mark requireVerbatimBody + forceTools
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

    it('BL-082 follow-up: argsSchema marks forceTools as optional at the ZodObject layer (UI introspection)', () => {
      const shape = irlIngestionPrompt.argsSchema.shape;
      expect(shape.forceTools.isOptional()).toBe(true);
    });

    it('BL-082 follow-up: argsSchema accepts an entirely empty object (no requireVerbatimBody, no forceTools)', () => {
      // Regression guard: the original schema (z.boolean().optional() and
      // z.array(...).optional()) accepted {} cleanly. After the BL-082 wire-
      // shape wrapping, the {} case MUST remain accepted — otherwise the
      // slash-command form blocks submission before any fields are filled.
      expect(irlIngestionPrompt.argsSchema.safeParse({}).success).toBe(true);
    });
  });

  describe('BL-071 — serverToolCallCounts + precheck-derivation directive', () => {
    it('one-shot body mentions serverToolCallCounts (envelope-composition directive)', () => {
      const text = bodyText(irlIngestionPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      expect(text).toContain('serverToolCallCounts');
    });

    it('interactive body mentions serverToolCallCounts (envelope-composition directive)', () => {
      const text = bodyText(irlIngestionPrompt, {});
      expect(text).toContain('serverToolCallCounts');
    });

    it('one-shot body mentions precheck.iterations derivation rule', () => {
      const text = bodyText(irlIngestionPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      expect(text).toContain('precheck.iterations');
    });

    it('interactive body mentions precheck.iterations derivation rule', () => {
      const text = bodyText(irlIngestionPrompt, {});
      expect(text).toContain('precheck.iterations');
    });

    it('one-shot body verify-block carries the errored field on toolCallCounts entries', () => {
      const text = bodyText(irlIngestionPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      expect(text).toContain('errored: N');
    });

    it('interactive body verify-block carries the errored field on toolCallCounts entries', () => {
      const text = bodyText(irlIngestionPrompt, {});
      expect(text).toContain('errored: N');
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
      // The probe is the alternative to reconstructing — it must be named, or
      // the model is left with "proceed" and no way to satisfy its doubt.
      expect(text).toContain('validate_irl_provenance');
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
});
