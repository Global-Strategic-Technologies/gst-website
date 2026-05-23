import { describe, it, expect } from 'vitest';
import { diligenceSweepPrompt } from '../../../src/prompts/diligence-sweep';

const IRL_RESOURCE_URI = 'gst://library/information-request-list';
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
  prompt: typeof diligenceSweepPrompt,
  args: Parameters<typeof prompt.build>[0]
): string {
  return prompt
    .build(args)
    .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
    .join('\n');
}

describe('gst_diligence_sweep', () => {
  it('uses the gst_ slash-menu prefix', () => {
    expect(diligenceSweepPrompt.name).toMatch(/^gst_/);
    expect(diligenceSweepPrompt.name).toBe('gst_diligence_sweep');
  });

  it('declares the required GstPrompt fields with concrete values', () => {
    expect(diligenceSweepPrompt.version).toBe('0.0.4');
    expect(diligenceSweepPrompt.lastReviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(diligenceSweepPrompt.orchestrates.length).toBeGreaterThanOrEqual(11);
  });

  describe('argsSchema', () => {
    it('accepts an empty payload (interactive mode)', () => {
      expect(diligenceSweepPrompt.argsSchema.safeParse({}).success).toBe(true);
    });

    it('accepts filledIrl alone (one-shot mode)', () => {
      expect(
        diligenceSweepPrompt.argsSchema.safeParse({ filledIrl: SAMPLE_FILLED_IRL }).success
      ).toBe(true);
    });

    it('accepts the full arg set', () => {
      expect(
        diligenceSweepPrompt.argsSchema.safeParse({
          targetName: 'MedSig Health',
          filledIrl: SAMPLE_FILLED_IRL,
          transactionContext: 'buy-side',
          partnerLead: 'Reid Peryam',
          projectCodeName: 'Cygnet',
        }).success
      ).toBe(true);
    });

    it('rejects an invalid transactionContext enum value', () => {
      const result = diligenceSweepPrompt.argsSchema.safeParse({
        transactionContext: 'weird-value',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['transactionContext']);
      }
    });

    it('rejects an empty targetName (min length 1)', () => {
      const result = diligenceSweepPrompt.argsSchema.safeParse({ targetName: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['targetName']);
      }
    });

    it('rejects a filledIrl below the 200-char minimum (catches "" / "<paste>" placeholder)', () => {
      const result = diligenceSweepPrompt.argsSchema.safeParse({ filledIrl: 'tiny' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['filledIrl']);
      }
    });
  });

  describe('build() — message structure', () => {
    it('returns three messages in both interactive and one-shot modes (text + IRL embed + VDR embed)', () => {
      for (const args of [{}, { filledIrl: SAMPLE_FILLED_IRL }] as const) {
        const result = diligenceSweepPrompt.build(args);
        expect(result.messages.length).toBe(3);
      }
    });

    it('embeds the IRL Library Resource as the second message in both modes', () => {
      for (const args of [{}, { filledIrl: SAMPLE_FILLED_IRL }] as const) {
        const result = diligenceSweepPrompt.build(args);
        const second = result.messages[1].content;
        expect(second.type).toBe('resource');
        if (second.type === 'resource' && 'text' in second.resource) {
          expect(second.resource.uri).toBe(IRL_RESOURCE_URI);
          expect(typeof second.resource.text).toBe('string');
          expect(second.resource.text.length).toBeGreaterThan(500);
        }
      }
    });

    it('embeds the VDR Library Resource as the third message in both modes', () => {
      for (const args of [{}, { filledIrl: SAMPLE_FILLED_IRL }] as const) {
        const result = diligenceSweepPrompt.build(args);
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
        const text = bodyText(diligenceSweepPrompt, args);
        for (const ref of diligenceSweepPrompt.orchestrates) {
          expect(text, `body missing orchestrates entry: ${ref}`).toContain(ref);
        }
      }
    });
  });

  describe('build() — interactive mode (no filledIrl)', () => {
    it('asks the user to paste the populated IRL before sweeping', () => {
      const text = bodyText(diligenceSweepPrompt, {});
      expect(text.toLowerCase()).toMatch(/paste.*populated.*information request list/i);
    });

    it('mentions the dossier 9-section layout (A-I) so the model knows the output shape', () => {
      const text = bodyText(diligenceSweepPrompt, {});
      expect(text).toMatch(/A.{0,4}I/);
    });
  });

  describe('build() — one-shot mode (filledIrl supplied)', () => {
    it('embeds the supplied filledIrl verbatim in the body', () => {
      const text = bodyText(diligenceSweepPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      expect(text).toContain('MedSig Health, Inc.');
      expect(text).toContain('$45.2M Q1-FY26 annualized');
      expect(text).toContain('HIPAA, GDPR, Germany BDSG, France CNIL');
    });

    it('embeds the supplied targetName verbatim when provided', () => {
      const text = bodyText(diligenceSweepPrompt, {
        filledIrl: SAMPLE_FILLED_IRL,
        targetName: 'MedSig-Marker-XYZ',
      });
      expect(text).toContain('MedSig-Marker-XYZ');
    });

    it('embeds the partner lead in the synthesis attribution when provided', () => {
      const text = bodyText(diligenceSweepPrompt, {
        filledIrl: SAMPLE_FILLED_IRL,
        partnerLead: 'Reid-Marker-XYZ',
      });
      expect(text).toContain('Reid-Marker-XYZ');
    });

    it('embeds the engagement code name in the project label when provided', () => {
      const text = bodyText(diligenceSweepPrompt, {
        filledIrl: SAMPLE_FILLED_IRL,
        projectCodeName: 'CodeName-Marker-XYZ',
      });
      expect(text).toContain('CodeName-Marker-XYZ');
    });

    it('includes a buy-side voice cue when transactionContext is buy-side', () => {
      const text = bodyText(diligenceSweepPrompt, {
        filledIrl: SAMPLE_FILLED_IRL,
        transactionContext: 'buy-side',
      });
      expect(text.toLowerCase()).toContain('buy-side');
      expect(text.toLowerCase()).toContain('underwriting');
    });

    it('includes a sell-side voice cue when transactionContext is sell-side', () => {
      const text = bodyText(diligenceSweepPrompt, {
        filledIrl: SAMPLE_FILLED_IRL,
        transactionContext: 'sell-side',
      });
      expect(text.toLowerCase()).toContain('sell-side');
      expect(text.toLowerCase()).toContain('story');
    });

    it('switches to one-shot Step pattern when filledIrl is supplied', () => {
      const text = bodyText(diligenceSweepPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      expect(text).toContain('Step 1 —');
      expect(text).toContain('Step 8 —');
    });

    it('enforces sentinel-discipline on businessModel / operatingModel (v0.0.4 anti-inference contract)', () => {
      // v0.0.4 replaced the v0.0.3 "do NOT default to unknown" framing with
      // explicit anti-inference anti-examples after a post-demo audit
      // showed v0.0.3 produced OVER-confident outputs on bm and om —
      // canonical forbidden patterns per the diligence tool's USAGE RULE.
      const text = bodyText(diligenceSweepPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      // The sentinel-discipline framing must be present:
      expect(text).toMatch(/otherwise pass.*'unknown'/i);
      // Both canonical forbidden anti-examples must be named explicitly:
      expect(text).toMatch(/productized-platform/);
      expect(text).toMatch(/product-aligned-teams/);
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
      const text = bodyText(diligenceSweepPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      // Each tool-pulling step (3-7) must contain the Surface output verb:
      const stepBlocks = ['Step 3', 'Step 4', 'Step 5', 'Step 6', 'Step 7'];
      for (const step of stepBlocks) {
        // Find the step block (from "Step N —" up to the next "Step" or section heading)
        const stepIdx = text.indexOf(step + ' —');
        expect(stepIdx, `${step} not found in body`).toBeGreaterThan(-1);
        const nextStepIdx = text.indexOf('Step ', stepIdx + 1);
        const stepBlock = text.slice(stepIdx, nextStepIdx > 0 ? nextStepIdx : undefined);
        expect(stepBlock, `${step} missing 'Surface ... deeplink' output-verb directive`).toMatch(
          /Surface.+`?deeplink`?/i
        );
        // The dropped 'Capture' verb must NOT appear as a deeplink directive
        // (it's OK in other contexts; we only forbid it adjacent to deeplink):
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
      const text = bodyText(diligenceSweepPrompt, { filledIrl: SAMPLE_FILLED_IRL });
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
      const text = bodyText(diligenceSweepPrompt, { filledIrl: SAMPLE_FILLED_IRL });
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
      const text = bodyText(diligenceSweepPrompt, { filledIrl: SAMPLE_FILLED_IRL });
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
      const text = bodyText(diligenceSweepPrompt, { filledIrl: SAMPLE_FILLED_IRL });
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
      const text = bodyText(diligenceSweepPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      expect(text).toMatch(/q5_3.+level 2.+NOT level 3/s);
      expect(text).toMatch(/(?:Strategic|practice).+(?:wins shipped|architectural influence)/);
      // The <12-month tenure cutoff is the operational anchor:
      expect(text).toMatch(/<\s*12 months/);
    });
  });

  describe('regression: v0.0.4 NIS2 conditional for EU healthcare (bug 7)', () => {
    it('Step 3 adds NIS2 conditional alongside the existing EU AI Act conditional', () => {
      // Post-demo audit found NIS2 missing despite MedSig serving EU
      // healthcare (Annex II "important entity"). v0.0.4 added the
      // gap-fill conditional.
      const text = bodyText(diligenceSweepPrompt, { filledIrl: SAMPLE_FILLED_IRL });
      expect(text).toContain('NIS2');
      expect(text).toMatch(/add an NIS2 search/);
      // The Annex I/II sector framing:
      expect(text).toMatch(/Annex I or II|Annex I\/II/);
      // The healthcare sector should be in the enumeration:
      expect(text).toMatch(/healthcare/);
    });
  });
});
