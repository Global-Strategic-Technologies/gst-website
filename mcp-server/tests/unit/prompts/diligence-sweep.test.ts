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
        if (second.type === 'resource') {
          expect(second.resource.uri).toBe(IRL_RESOURCE_URI);
          expect(typeof second.resource.text).toBe('string');
          expect((second.resource.text as string).length).toBeGreaterThan(500);
        }
      }
    });

    it('embeds the VDR Library Resource as the third message in both modes', () => {
      for (const args of [{}, { filledIrl: SAMPLE_FILLED_IRL }] as const) {
        const result = diligenceSweepPrompt.build(args);
        const third = result.messages[2].content;
        expect(third.type).toBe('resource');
        if (third.type === 'resource') {
          expect(third.resource.uri).toBe(VDR_RESOURCE_URI);
          expect(typeof third.resource.text).toBe('string');
          expect((third.resource.text as string).length).toBeGreaterThan(500);
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
});
